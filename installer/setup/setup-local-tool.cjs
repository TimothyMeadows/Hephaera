#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const packageId = 'hephaera';
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?$/;
function regularPath(value, kind) {
  const absolute = path.resolve(value);
  let cursor = path.parse(absolute).root;
  for (const segment of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Linked setup paths are unsupported.');
  }
  const stat = fs.statSync(absolute);
  if (kind === 'file' ? !stat.isFile() : !stat.isDirectory()) throw new Error('Expected a regular ' + kind + '.');
  return fs.realpathSync(absolute);
}
function parse(argv) {
  const result = { extra: [] };
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--') { result.extra = argv.slice(i + 1); break; }
    if (!['--version', '--project', '--configfile'].includes(argv[i]) || !argv[i + 1]) throw new Error('Use --version VERSION --project PATH --configfile FILE [-- INSTALLER_OPTIONS].');
    const key = argv[i].slice(2);
    if (result[key]) throw new Error('Duplicate setup option: ' + argv[i]);
    result[key] = argv[++i];
  }
  if (!semver.test(result.version || '') || !result.project || !result.configfile) throw new Error('An exact version, explicit project, and feed config are required.');
  if (result.extra.some(value => value !== '--with-bubo-source')) throw new Error('Only --with-bubo-source may follow the separator.');
  return result;
}
async function setup(argv, run = execute) {
  const options = parse(argv);
  if (options.help) return { help: true };
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24+ is required; nothing was installed.');
  let setupRelease;
  const setupReleasePath = path.join(__dirname, 'setup-release.json');
  if (fs.existsSync(setupReleasePath)) {
    setupRelease = JSON.parse(fs.readFileSync(regularPath(setupReleasePath, 'file'), 'utf8'));
    if (setupRelease.schemaVersion !== 1 || setupRelease.version !== options.version || !/^[a-f0-9]{64}$/.test(setupRelease.manifestSha256 || '') || !setupRelease.files) throw new Error('Setup bundle/version identity mismatch.');
    for (const [name, expected] of Object.entries(setupRelease.files)) {
      if (!/^[A-Za-z0-9_.-]+$/.test(name) || !/^[a-f0-9]{64}$/.test(expected) || crypto.createHash('sha256').update(fs.readFileSync(regularPath(path.join(__dirname, name), 'file'))).digest('hex') !== expected) throw new Error('Setup bundle file changed.');
    }
  }
  const project = regularPath(options.project, 'directory');
  const config = regularPath(options.configfile, 'file');
  const gitRoot = cp.execFileSync('git', ['-C', project, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true }).trim();
  if (fs.realpathSync(gitRoot) !== project) throw new Error('--project must be the existing host Git root, not a workspace child.');
  if (path.basename(project).toLowerCase() === '.hephaera') throw new Error('A baseline installation is not a host project.');
  const configDirectory = path.join(project, '.config');
  if (fs.existsSync(configDirectory)) regularPath(configDirectory, 'directory');
  const manifestPath = path.join(configDirectory, 'dotnet-tools.json');
  let document = { version: 1, isRoot: true, tools: {} };
  if (fs.existsSync(manifestPath)) {
    regularPath(manifestPath, 'file');
    document = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (document.version !== 1 || document.isRoot !== true || !document.tools || typeof document.tools !== 'object' || Array.isArray(document.tools)) throw new Error('Existing local tool manifest must have version 1, isRoot:true, and a tools object.');
  }
  const matching = Object.entries(document.tools).filter(([name]) => name.toLowerCase() === packageId);
  if (matching.length > 1) throw new Error('Duplicate Hephaera tool identities in the local manifest.');
  const existing = matching[0]?.[1];
  if (existing && (existing.version !== options.version || !Array.isArray(existing.commands) || existing.commands.length !== 1 || existing.commands[0] !== 'hephaera')) throw new Error('The local manifest declares another version/command. Review an explicit tool update first.');
  for (const [name, tool] of Object.entries(document.tools)) if (name.toLowerCase() !== packageId && tool.commands?.includes('hephaera')) throw new Error('Another local tool owns the hephaera command.');
  const sdk = await run('dotnet', ['--version'], { cwd: project, capture: true });
  if (!/^\d+\./.test(sdk) || Number(sdk.split('.')[0]) < 10) throw new Error('An existing .NET SDK 10+ is required; nothing was installed.');
  fs.mkdirSync(configDirectory, { recursive: true });
  const lockPath = path.join(configDirectory, '.hephaera-tool-setup.lock');
  const lockBytes = JSON.stringify({ pid: process.pid, nonce: crypto.randomUUID(), version: options.version });
  fs.writeFileSync(lockPath, lockBytes, { flag: 'wx' });
  try {
  if (!fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, JSON.stringify(document, null, 2) + '\n', { flag: 'wx' });
  }
  const before = fs.readFileSync(manifestPath);
  const identity = crypto.createHash('sha256').update(before).digest('hex');
  const acquire = existing
    ? ['tool', 'restore', '--tool-manifest', manifestPath, '--configfile', config]
    : ['tool', 'install', '--local', 'Hephaera', '--version', options.version, '--tool-manifest', manifestPath, '--configfile', config];
  await run('dotnet', acquire, { cwd: project });
  const installed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const selected = Object.entries(installed.tools || {}).filter(([name]) => name.toLowerCase() === packageId);
  if (installed.version !== 1 || installed.isRoot !== true || selected.length !== 1 || selected[0][1].version !== options.version || selected[0][1].commands?.join(',') !== 'hephaera') throw new Error('Acquired local tool identity does not match the selected exact version.');
  for (const [name, value] of Object.entries(document.tools)) if (name.toLowerCase() !== packageId && JSON.stringify(value) !== JSON.stringify(installed.tools[name])) throw new Error('Acquisition changed an unrelated local tool entry.');
  if (existing && crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex') !== identity) throw new Error('Restore unexpectedly changed the local tool manifest.');
  const verify = await run('dotnet', ['tool', 'run', 'hephaera', '--', 'verify', '--json'], { cwd: project, capture: true });
  const info = JSON.parse(verify);
  if (info.version !== options.version || info.coreVerified !== true || !/^[a-f0-9]{64}$/.test(info.manifestSha256) || (setupRelease && info.manifestSha256 !== setupRelease.manifestSha256)) throw new Error('Installed package/core release verification failed.');
  await run('dotnet', ['tool', 'run', 'hephaera', '--', 'install', '--project', project, ...options.extra], { cwd: project });
  return { version: options.version, project, manifestPath, manifestSha256: info.manifestSha256 };
  } finally {
    if (fs.existsSync(lockPath) && !fs.lstatSync(lockPath).isSymbolicLink() && fs.readFileSync(lockPath, 'utf8') === lockBytes) fs.unlinkSync(lockPath);
  }
}
function execute(file, args, { cwd, capture = false, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(file, args, { cwd, env, windowsHide: true, stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit', detached: process.platform !== 'win32' });
    let stdout = ''; let stderr = ''; let cancelled = 0;
    if (capture) { child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; }); }
    const cancel = signal => {
      cancelled = signal === 'SIGINT' ? 130 : 143;
      if (process.platform === 'win32') cp.spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      else { try { process.kill(-child.pid, signal); } catch { } }
    };
    const interrupt = () => cancel('SIGINT'); const terminate = () => cancel('SIGTERM');
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (code, signal) => {
      cleanup();
      if (cancelled || code !== 0) { const error = new Error(cancelled ? 'Setup cancelled; inspect retained installer state before retrying.' : 'The owned acquisition/verification/setup step failed' + (capture && stderr ? ': ' + stderr.trim() : '.')); error.exitCode = cancelled || code || (signal ? 143 : 1); reject(error); }
      else resolve(stdout.trim());
    });
  });
}
if (require.main === module) setup(process.argv.slice(2)).then(result => {
  if (result.help) console.log('Usage: setup-nuget --version VERSION --project PATH --configfile FILE [-- --with-bubo-source]');
}).catch(error => { console.error('Hephaera setup: ' + error.message); process.exitCode = error.exitCode || 1; });
module.exports = { parse, setup, execute };
