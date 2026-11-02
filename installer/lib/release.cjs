'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const repository = 'https://github.com/TimothyMeadows/Hephaera.git';
function git(root, ...args) {
  return cp.execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, stdio:['ignore','pipe','pipe'] }).trim();
}
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function inventory(core) {
  const result = {};
  function visit(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.isSymbolicLink()) throw new Error('Core payload cannot contain links.');
      const relative = prefix + entry.name;
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative + '/');
      else if (entry.isFile() && relative !== 'release-manifest.json') {
        if (!/^[A-Za-z0-9_/-]+\.cjs$/.test(relative) || relative.includes('..')) throw new Error('Unexpected core payload: ' + relative);
        result[relative] = sha256(fs.readFileSync(path.join(directory, entry.name)));
      } else if (!entry.isFile()) throw new Error('Nonregular core payload.');
    }
  }
  visit(core);
  if (!result['cli.cjs'] || !result['manifest.cjs']) throw new Error('Incomplete installer core.');
  return result;
}
function createManifest(root, { allowDirty = false } = {}) {
  root = fs.realpathSync(root);
  if (path.resolve(git(root, 'rev-parse', '--show-toplevel')) !== root) throw new Error('Release source must be its Git root.');
  const sourceDirty = Boolean(git(root, 'status', '--porcelain', '--untracked-files=normal'));
  if (sourceDirty && !allowDirty) throw new Error('Release packing requires clean committed source. Use --allow-dirty only for local preview artifacts.');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'installer/version.json'), 'utf8')).version;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?$/.test(version)) throw new Error('Invalid common npm/NuGet release version.');
  const prerelease = version.split('-')[1];
  if (prerelease && prerelease.split('.').some(label => /^0\d+$/.test(label))) throw new Error('Numeric prerelease identifiers must not have leading zeroes.');
  const bubo = JSON.parse(fs.readFileSync(path.join(root, 'runtime/bubo.lock.json'), 'utf8'));
  const entry = git(root, 'ls-files', '--stage', '--', 'runtime/bubo').split(/\s+/);
  if (entry[0] !== '160000' || entry[1] !== bubo.revision || bubo.apiVersion !== 2) throw new Error('Release Bubo lock/gitlink/API mismatch.');
  const coreFiles = inventory(path.join(root, 'installer/core'));
  if (!sourceDirty) for (const name of Object.keys(coreFiles)) {
    const committed = cp.execFileSync('git', ['-C', root, 'show', `HEAD:installer/core/${name}`], { windowsHide: true });
    if (sha256(committed) !== coreFiles[name]) throw new Error('Core bytes differ from canonical source: ' + name);
  }
  return { schemaVersion: 1, version, repository, revision: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'), tag: version, sourceDirty, bubo, coreFiles };
}
function verifyManifest(manifest, coreDirectory) {
  return require('../core/manifest.cjs').verifyManifest(manifest, coreDirectory);
}
function verifyReleaseSource(root, version) {
  const manifest = createManifest(root);
  if (manifest.version !== version || git(root, 'rev-parse', `refs/tags/${version}^{commit}`) !== manifest.revision) throw new Error('Selected tag/version does not identify exact clean source.');
  if (!/^https:\/\/github\.com\/TimothyMeadows\/Hephaera(?:\.git)?\/?$/i.test(git(root, 'remote', 'get-url', 'origin'))) throw new Error('Release origin must be canonical HTTPS source.');
  cp.execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', manifest.revision, 'origin/main'], { windowsHide: true });
  verifyManifest(manifest, path.join(root, 'installer/core'));
  return manifest;
}
module.exports = { repository, sha256, inventory, createManifest, verifyManifest, verifyReleaseSource };

if (require.main === module) {
  try {
    if (process.argv[2] !== '--verify' || process.argv.length !== 4) throw new Error('Usage: node installer/lib/release.cjs --verify VERSION');
    console.log(JSON.stringify(verifyReleaseSource(process.cwd(), process.argv[3])));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
