#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { createManifest, verifyManifest } = require('../lib/release.cjs');
const { writeZip, normalizeUnsignedZipTimestamps } = require('./archives.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function run(file, args, cwd) {
  const result = cp.spawnSync(file, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('Package build failed: ' + file + '\n' + (result.error?.message || result.stderr || result.stdout));
  return result.stdout;
}
function npm(args, cwd) {
  const adjacent = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(adjacent)) return run(process.execPath, [adjacent, ...args], cwd);
  if (process.platform === 'win32') throw new Error('Cannot locate npm-cli.js beside the existing Node executable. Use an ordinary Node/npm installation; no shell fallback is used.');
  return run('npm', args, cwd);
}
function packPackages({ repoRoot = path.resolve(__dirname, '../..'), output, allowDirty = false } = {}) {
  repoRoot = fs.realpathSync(repoRoot);
  function readSource(relative) {
    const absolute = path.resolve(repoRoot, relative);
    if (path.relative(repoRoot, absolute).startsWith('..')) throw new Error('Package input is outside the repository.');
    let cursor = repoRoot;
    for (const part of path.relative(repoRoot, absolute).split(path.sep)) { cursor = path.join(cursor, part); if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Linked package inputs are unsupported.'); }
    if (!fs.statSync(absolute).isFile()) throw new Error('Package input is not a regular file.');
    return fs.readFileSync(absolute);
  }
  output = path.resolve(repoRoot, output || '.local/installer-packages');
  const relative = path.relative(repoRoot, output);
  if (!relative.startsWith('.local' + path.sep) || relative.includes('..' + path.sep)) throw new Error('Package output must be a fresh directory under this repository .local/.');
  let current = repoRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Linked package output paths are unsupported.');
  }
  if (fs.existsSync(output)) throw new Error('Package output already exists; select a fresh output directory to preserve earlier evidence.');
  const manifest = createManifest(repoRoot, { allowDirty });
  const identity = verifyManifest(manifest, path.join(repoRoot, 'installer/core'));
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.mkdirSync(output);
  const artifactDirectory = path.join(output, 'artifacts'); fs.mkdirSync(artifactDirectory);
  const npmStage = path.join(output, 'npm-stage'); const nugetStage = path.join(output, 'nuget-stage');
  fs.mkdirSync(npmStage); fs.mkdirSync(nugetStage);
  function copyCore(destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of Object.keys(manifest.coreFiles)) {
      const target = path.join(destination, name); fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, readSource('installer/core/' + name));
    }
    fs.writeFileSync(path.join(destination, 'release-manifest.json'), manifestBytes);
    verifyManifest(manifest, destination);
  }
  copyCore(path.join(npmStage, 'core')); copyCore(path.join(nugetStage, 'embedded/core'));
  const metadata = JSON.parse(readSource('installer/npm/package.json').toString('utf8'));
  metadata.version = manifest.version;
  fs.writeFileSync(path.join(npmStage, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
  fs.writeFileSync(path.join(npmStage, 'README.md'), readSource('installer/npm/README.md'));
  fs.writeFileSync(path.join(npmStage, 'LICENSE'), readSource('LICENSE'));
  for (const name of ['Hephaera.csproj', 'Program.cs', 'README.md']) fs.writeFileSync(path.join(nugetStage, name), readSource('installer/nuget/' + name));
  fs.writeFileSync(path.join(nugetStage, 'LICENSE'), readSource('LICENSE'));
  const npmReport = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', artifactDirectory], npmStage))[0];
  const allowedNpm = new Set(['package.json', 'README.md', 'LICENSE', 'core/release-manifest.json', ...Object.keys(manifest.coreFiles).map(name => 'core/' + name)]);
  if (npmReport.files.some(item => !allowedNpm.has(item.path)) || npmReport.files.length !== allowedNpm.size) throw new Error('Unexpected npm payload inventory.');
  run('dotnet', ['pack', 'Hephaera.csproj', '--configuration', 'Release', '--output', artifactDirectory, '--nologo', '-p:Version=' + manifest.version, '-p:HephaeraManifestSha256=' + hash(manifestBytes), '-p:RestoreIgnoreFailedSources=true', '-p:UseSharedCompilation=false', '-nodeReuse:false'], nugetStage);
  const npmFile = npmReport.filename; const nugetFile = 'Hephaera.' + manifest.version + '.nupkg';
  if (!fs.existsSync(path.join(artifactDirectory, nugetFile))) throw new Error('Expected NuGet artifact was not produced.');
  const nugetPath = path.join(artifactDirectory, nugetFile);
  fs.writeFileSync(nugetPath, normalizeUnsignedZipTimestamps(fs.readFileSync(nugetPath)));
  const setupEntries = new Map(); const setupFiles = {};
  for (const name of ['README.md', 'setup-nuget.sh', 'setup-nuget.ps1', 'setup-local-tool.cjs', 'NuGet.Hephaera.config', 'npmrc.example']) {
    const bytes = readSource('installer/setup/' + name); setupEntries.set(name, bytes); setupFiles[name] = hash(bytes);
  }
  setupEntries.set('setup-release.json', Buffer.from(JSON.stringify({ schemaVersion: 1, version: manifest.version, manifestSha256: identity.manifestSha256, manifestFileSha256: hash(manifestBytes), files: setupFiles }, null, 2) + '\n'));
  setupEntries.set('CHECKSUMS.txt', Buffer.from([...setupEntries].map(([name, bytes]) => hash(bytes) + '  ' + name).join('\n') + '\n'));
  const setupFile = 'hephaera-setup-' + manifest.version + '.zip'; fs.writeFileSync(path.join(artifactDirectory, setupFile), writeZip(setupEntries));
  const receipt = { schemaVersion: 1, version: manifest.version, sourceDirty: manifest.sourceDirty, manifestSha256: identity.manifestSha256, manifestFileSha256: hash(manifestBytes), manifest, artifacts: { npm: { file: 'artifacts/' + npmFile, sha256: hash(fs.readFileSync(path.join(artifactDirectory, npmFile))) }, nuget: { file: 'artifacts/' + nugetFile, sha256: hash(fs.readFileSync(path.join(artifactDirectory, nugetFile))) }, setup: { file: 'artifacts/' + setupFile, sha256: hash(fs.readFileSync(path.join(artifactDirectory, setupFile))) } } };
  fs.writeFileSync(path.join(output, 'package-build.json'), JSON.stringify(receipt, null, 2) + '\n');
  return { output, ...receipt };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2); let output; let allowDirty = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--allow-dirty') allowDirty = true;
      else if (args[i] === '--output' && args[i + 1]) output = args[++i];
      else throw new Error('Usage: node installer/scripts/pack.cjs --output .local/DIRECTORY [--allow-dirty]');
    }
    console.log(JSON.stringify(packPackages({ output, allowDirty }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { packPackages };
