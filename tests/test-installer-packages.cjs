'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { readZip, readTarGzip } = require('../installer/scripts/archives.cjs');
const { packPackages } = require('../installer/scripts/pack.cjs');
const { setup, parse, execute } = require('../installer/setup/setup-local-tool.cjs');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const area = path.join(root, '.local', 'installer-packages-test-' + crypto.randomUUID()); fs.mkdirSync(area, { recursive: true });
const results = [];
const env = { ...process.env, NUGET_PACKAGES: path.join(area, 'nuget-cache'), DOTNET_CLI_HOME: path.join(area, 'dotnet-home'), DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', DOTNET_NOLOGO: '1', npm_config_cache: path.join(area, 'npm-cache'), npm_config_userconfig: path.join(area, 'empty.npmrc') };
fs.writeFileSync(env.npm_config_userconfig, '');
function run(file, args, cwd = area, extra = {}) {
  const value = cp.spawnSync(file, args, { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 120000, ...extra });
  if (value.error) throw value.error;
  return value;
}
function ok(file, args, cwd, extra) { const value = run(file, args, cwd, extra); assert.equal(value.status, 0, value.stderr || value.stdout); return value.stdout.trim(); }
function npm(args, cwd) {
  const cli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  return fs.existsSync(cli) ? ok(process.execPath, [cli, ...args], cwd) : ok('npm', args, cwd);
}
function git(cwd, ...args) { return ok('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Package Fixture', '-c', 'user.email=fixture@example.invalid', ...args], cwd); }
function directory(name) { const value = path.join(area, name); fs.mkdirSync(value, { recursive: true }); return value; }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function find(directory, basename) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) { const result = find(target, basename); if (result) return result; }
    else if (entry.name === basename) return target;
  }
  return null;
}
async function check(name, action) {
  const start = Date.now();
  try { await action(); results.push({ name, verdict: 'pass', elapsedMs: Date.now() - start }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, verdict: 'fail', error: error.message, elapsedMs: Date.now() - start }); throw error; }
}
function fixture(core, release) {
  const source = directory('source-fixture'), host = directory('host with spaces é'); git(source, 'init', '-q'); git(host, 'init', '-q');
  for (const name of ['commands/create-host-ai-scaffold.sh', 'commands/resolve-hephaera-paths.sh', 'commands/lib/memory-common.sh', 'commands/lib/state-transition-common.sh', 'commands/lib/platform-common.sh', '.gitignore']) write(path.join(source, name), fs.readFileSync(path.join(root, name)));
  write(path.join(source, 'AGENTS.md'), '# Source fixture\n');
  write(path.join(source, 'runtime/bubo.lock.json'), JSON.stringify(release.bubo, null, 2) + '\n');
  write(path.join(source, '.gitmodules'), '[submodule "runtime/bubo"]\n\tpath = runtime/bubo\n\turl = ' + release.bubo.repository + '\n');
  for (const name of Object.keys(release.coreFiles)) write(path.join(source, 'installer/core', name), fs.readFileSync(path.join(core, name)));
  git(source, 'add', '.'); git(source, 'update-index', '--add', '--cacheinfo', '160000,' + release.bubo.revision + ',runtime/bubo'); git(source, 'commit', '-qm', 'Clean source fixture for actual packaged core'); git(source, 'tag', release.version);
  const manifest = { ...release, revision: git(source, 'rev-parse', 'HEAD'), tree: git(source, 'rev-parse', 'HEAD^{tree}'), sourceDirty: false };
  return { source, host, manifest };
}
async function main() {
  let artifactRoot = process.env.HEPHAERA_TEST_PACKAGE_DIR;
  const args = process.argv.slice(2);
  if (args.length) { assert.equal(args.length, 2, 'Use --artifacts DIRECTORY'); assert.equal(args[0], '--artifacts'); artifactRoot = args[1]; }
  if (!artifactRoot) artifactRoot = packPackages({ output: path.join(area, 'built'), allowDirty: true }).output;
  artifactRoot = fs.realpathSync(path.resolve(artifactRoot));
  const receipt = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'package-build.json')));
  const artifacts = {};
  for (const [channel, item] of Object.entries(receipt.artifacts)) {
    const absolute = path.resolve(artifactRoot, item.file);
    assert.equal(path.relative(artifactRoot, absolute).startsWith('..'), false); artifacts[channel] = absolute;
    assert.equal(hash(fs.readFileSync(absolute)), item.sha256, channel + ' artifact digest');
  }
  let npmCore, nugetCore, toolDirectory, dll, npmInfo;
  const npmConsumer = directory('npm-consumer'), toolConsumer = directory('nuget-consumer');
  const feedConfig = path.join(area, 'local-feed.config');
  const sourceXml = path.dirname(artifacts.nuget).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  write(feedConfig, '<?xml version="1.0"?><configuration><packageSources><clear/><add key="isolated" value="' + sourceXml + '"/></packageSources><packageSourceMapping><packageSource key="isolated"><package pattern="Hephaera"/></packageSource></packageSourceMapping></configuration>');
  await check('packed payloads contain byte-identical core/manifest and no private material', () => {
    const tar = readTarGzip(fs.readFileSync(artifacts.npm)), zip = readZip(fs.readFileSync(artifacts.nuget));
    const metadata = JSON.parse(tar.get('package/package.json'));
    assert.equal(metadata.name, '@timothymeadows/hephaera'); assert.equal(metadata.version, receipt.version); assert.equal(metadata.bin.hephaera, 'core/cli.cjs'); assert.equal(metadata.scripts, undefined);
    const expected = ['release-manifest.json', ...Object.keys(receipt.manifest.coreFiles)];
    for (const name of expected) {
      const a = tar.get('package/core/' + name), b = zip.get('tools/net10.0/any/embedded/core/' + name); assert.ok(a && b, name); assert.deepEqual(a, b, name);
      if (name === 'release-manifest.json') assert.equal(hash(a), receipt.manifestFileSha256);
      else assert.equal(hash(a), receipt.manifest.coreFiles[name]);
    }
    for (const name of tar.keys()) assert.match(name, /^package\/(?:package\.json|README\.md|LICENSE|core\/[A-Za-z0-9_/-]+\.(?:cjs|json))$/);
    for (const name of zip.keys()) {
      assert.equal(/(?:\.cache|node_modules|\.local|\.art-staging|\.ps1|\.sh|Program\.cs|\.pdb)/i.test(name), false, name);
      assert.ok(name === 'Hephaera.nuspec' || name === 'README.md' || name === 'LICENSE' || name === '_rels/.rels' || name === '[Content_Types].xml' || name.startsWith('package/services/metadata/core-properties/') || name.startsWith('tools/net10.0/any/'), name);
    }
    assert.ok(zip.get('Hephaera.nuspec').toString().includes('<version>' + receipt.version + '</version>'));
  });
  await check('actual npm tarball installs and npm exec verifies with lifecycle hooks disabled', () => {
    write(path.join(npmConsumer, 'package.json'), '{"name":"isolated-installer-consumer","private":true}');
    npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', artifacts.npm], npmConsumer);
    npmCore = path.join(npmConsumer, 'node_modules/@timothymeadows/hephaera/core');
    npmInfo = JSON.parse(npm(['exec', '--offline', '--ignore-scripts', '--package=@timothymeadows/hephaera@' + receipt.version, '--', 'hephaera', 'verify', '--json'], npmConsumer));
    assert.equal(npmInfo.version, receipt.version); assert.equal(npmInfo.coreVerified, true); assert.equal(npmInfo.manifestSha256, receipt.manifestSha256);
    assert.equal(fs.existsSync(path.join(npmConsumer, '.hephaera')), false); assert.equal(fs.existsSync(path.join(npmConsumer, 'AGENTS.md')), false);
  });
  await check('actual NuGet nupkg installs from an isolated cold local feed and matches npm identity', () => {
    toolDirectory = path.join(toolConsumer, 'tools');
    ok('dotnet', ['tool', 'install', 'Hephaera', '--tool-path', toolDirectory, '--version', receipt.version, '--configfile', feedConfig], toolConsumer);
    dll = find(toolDirectory, 'Hephaera.dll'); assert.ok(dll);
    nugetCore = path.join(path.dirname(dll), 'embedded/core');
    assert.deepEqual(JSON.parse(ok('dotnet', [dll, 'verify', '--json'], toolConsumer)), npmInfo);
    assert.equal(hash(fs.readFileSync(path.join(nugetCore, 'release-manifest.json'))), receipt.manifestFileSha256);
    const acquiredPackage = find(toolDirectory, 'hephaera.' + receipt.version + '.nupkg'); assert.ok(acquiredPackage); assert.equal(hash(fs.readFileSync(acquiredPackage)), receipt.artifacts.nuget.sha256);
  });
  await check('a second isolated NuGet tool path retains the exact package/core identity', () => {
    const warm = directory('warm-tool'); ok('dotnet', ['tool', 'install', 'Hephaera', '--tool-path', warm, '--version', receipt.version, '--configfile', feedConfig]);
    const other = find(warm, 'Hephaera.dll'); assert.ok(other); assert.deepEqual(JSON.parse(ok('dotnet', [other, 'verify', '--json'])), npmInfo);
  });
  await check('launchers forward argument boundaries, stderr, exit status, and help', () => {
    assert.match(ok('dotnet', [dll, '--help']), /Hephaera installer/);
    const quotedHost = directory('argument host é & $(not-a-command)'); git(quotedHost, 'init', '-q');
    const direct = JSON.parse(ok(process.execPath, [path.join(npmCore, 'cli.cjs'), 'doctor', '--project', quotedHost]));
    const forwarded = JSON.parse(ok('dotnet', [dll, 'doctor', '--project', quotedHost]));
    assert.deepEqual(forwarded, direct); assert.equal(forwarded.managed, false); assert.equal(forwarded.installed, false);
    const argument = '--bad argument "quoted"; $(not-a-command)';
    const a = run(process.execPath, [path.join(npmCore, 'cli.cjs'), 'verify', argument]); const b = run('dotnet', [dll, 'verify', argument]);
    assert.equal(a.status, 1); assert.equal(b.status, a.status); assert.match(b.stderr, /argument/); assert.equal(b.stderr, a.stderr);
  });
  await check('NuGet assembly rejects changed manifest and core verification rejects modified source', () => {
    const manifestPath = path.join(nugetCore, 'release-manifest.json'), original = fs.readFileSync(manifestPath);
    fs.appendFileSync(manifestPath, '\n'); const rejected = run('dotnet', [dll, 'verify', '--json']); assert.equal(rejected.status, 69); assert.match(rejected.stderr, /manifest does not match/); fs.writeFileSync(manifestPath, original);
    const corePath = path.join(nugetCore, 'index.cjs'), before = fs.readFileSync(corePath); fs.appendFileSync(corePath, '\n// tamper probe\n');
    const changed = run('dotnet', [dll, 'verify', '--json']); assert.equal(changed.status, 1); assert.match(changed.stderr, /core changed/); fs.writeFileSync(corePath, before);
    assert.deepEqual(JSON.parse(ok('dotnet', [dll, 'verify', '--json'])), npmInfo);
  });
  await check('actual packed core installs canonical scaffold through explicit clean fixture transport', () => {
    const x = fixture(npmCore, receipt.manifest); write(path.join(x.host, 'AGENTS.md'), '# Host instructions\r\n');
    const npmApi = require(path.join(npmCore, 'index.cjs')).createInstaller({ manifest: x.manifest, coreDirectory: npmCore, transport: { local: true, repository: x.source }, channel: 'npm' });
    const first = npmApi.install(x.host); assert.equal(first.scaffold, 'complete'); assert.equal(first.channel, 'npm');
    const ledger = path.join(x.host, '.hephaera/.cache/retained-ledger.json'); write(ledger, '{"used":1}');
    const nugetApi = require(path.join(nugetCore, 'index.cjs')).createInstaller({ manifest: x.manifest, coreDirectory: nugetCore, transport: { local: true, repository: x.source }, channel: 'nuget' });
    const restored = nugetApi.restore(x.host); assert.equal(restored.scaffold, 'complete'); assert.equal(restored.channel, 'nuget'); assert.equal(fs.readFileSync(ledger, 'utf8'), '{"used":1}');
    assert.equal(nugetApi.doctor(x.host).scaffold, 'complete');
  });
  await check('setup wrappers refuse missing, parent, conflicting, or failed acquisition before installer invocation', async () => {
    assert.throws(() => parse(['--version', 'latest', '--project', '.', '--configfile', feedConfig]), /exact version/);
    assert.throws(() => parse(['--version', receipt.version, '--project', '.', '--configfile', feedConfig, '--', '--project', '..']), /Only/);
    const host = directory('wrapper host'); git(host, 'init', '-q'); const parentManifest = path.join(area, '.config/dotnet-tools.json'); write(parentManifest, '{"sentinel":"parent untouched"}');
    let calls = [];
    await assert.rejects(setup(['--version', receipt.version, '--project', host, '--configfile', feedConfig], async (file, args) => { calls.push(args); if (args[0] === '--version') return '10.0.400'; throw new Error('injected acquisition failure'); }), /injected acquisition failure/);
    assert.equal(calls.some(args => args.includes('run')), false); assert.equal(fs.readFileSync(parentManifest, 'utf8'), '{"sentinel":"parent untouched"}');
    const local = JSON.parse(fs.readFileSync(path.join(host, '.config/dotnet-tools.json'))); assert.equal(local.isRoot, true); assert.deepEqual(local.tools, {});
    assert.equal(fs.existsSync(path.join(host, '.config/.hephaera-tool-setup.lock')), false);
    local.tools['hephaera'] = { version: '0.0.1', commands: ['hephaera'] }; write(path.join(host, '.config/dotnet-tools.json'), JSON.stringify(local));
    calls = []; await assert.rejects(setup(['--version', receipt.version, '--project', host, '--configfile', feedConfig], async () => { calls.push(1); }), /another version/); assert.equal(calls.length, 0);
  });
  await check('setup release bundle checksums and explicit local-tool acquisition/verification are real', async () => {
    assert.ok(artifacts.setup); const entries = readZip(fs.readFileSync(artifacts.setup)); const bundle = directory('setup-bundle');
    for (const [name, bytes] of entries) { assert.match(name, /^[A-Za-z0-9_.-]+$/); write(path.join(bundle, name), bytes); }
    const setupRelease = JSON.parse(entries.get('setup-release.json')); assert.equal(setupRelease.version, receipt.version); assert.equal(setupRelease.manifestSha256, receipt.manifestSha256);
    for (const [name, expected] of Object.entries(setupRelease.files)) assert.equal(hash(entries.get(name)), expected);
    const host = directory('bundle wrapper host'); git(host, 'init', '-q'); fs.mkdirSync(path.join(host, '.hephaera'));
    const result = run(process.execPath, [path.join(bundle, 'setup-local-tool.cjs'), '--version', receipt.version, '--project', host, '--configfile', feedConfig], host);
    assert.notEqual(result.status, 0); assert.match(result.stderr, receipt.sourceDirty ? /Dirty preview/ : /manual|unmanaged/i);
    const local = JSON.parse(fs.readFileSync(path.join(host, '.config/dotnet-tools.json'))); assert.equal(local.tools['hephaera'].version, receipt.version); assert.equal(local.isRoot, true);
    assert.equal(fs.existsSync(path.join(host, 'AGENTS.md')), false); assert.equal(fs.existsSync(path.join(host, '.config/.hephaera-tool-setup.lock')), false);
    const second = run(process.execPath, [path.join(bundle, 'setup-local-tool.cjs'), '--version', receipt.version, '--project', host, '--configfile', feedConfig], host); assert.notEqual(second.status, 0);
    assert.match(second.stderr, receipt.sourceDirty ? /Dirty preview/ : /manual|unmanaged/i);
    const cached = path.join(env.NUGET_PACKAGES, 'hephaera', receipt.version, 'hephaera.' + receipt.version + '.nupkg'); assert.ok(fs.existsSync(cached)); assert.equal(hash(fs.readFileSync(cached)), receipt.artifacts.nuget.sha256);
    const shellHost = directory('shell wrapper host é'); git(shellHost, 'init', '-q'); fs.mkdirSync(path.join(shellHost, '.hephaera'));
    let shellResult;
    if (process.platform === 'win32') {
      assert.match(ok('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(bundle, 'setup-nuget.ps1'), '--help']), /Usage: setup-nuget/);
      shellResult = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(bundle, 'setup-nuget.ps1'), '--version', receipt.version, '--project', shellHost, '--configfile', feedConfig], shellHost);
    } else {
      assert.match(ok('bash', [path.join(bundle, 'setup-nuget.sh'), '--help']), /Usage: setup-nuget/);
      shellResult = run('bash', [path.join(bundle, 'setup-nuget.sh'), '--version', receipt.version, '--project', shellHost, '--configfile', feedConfig], shellHost);
    }
    assert.notEqual(shellResult.status, 0); assert.match(shellResult.stderr, receipt.sourceDirty ? /Dirty preview/ : /manual|unmanaged/i);
    assert.equal(JSON.parse(fs.readFileSync(path.join(shellHost, '.config/dotnet-tools.json'))).tools['hephaera'].version, receipt.version);
    if (process.platform === 'win32') {
      const bash = path.resolve(ok('git', ['--exec-path']), '../../..', 'bin/bash.exe'); assert.ok(fs.existsSync(bash));
      const bashHost = directory('Git Bash wrapper host é'); git(bashHost, 'init', '-q'); fs.mkdirSync(path.join(bashHost, '.hephaera'));
      const bashResult = run(bash, [path.join(bundle, 'setup-nuget.sh').replaceAll('\\', '/'), '--version', receipt.version, '--project', bashHost.replaceAll('\\', '/'), '--configfile', feedConfig.replaceAll('\\', '/')], bashHost);
      assert.notEqual(bashResult.status, 0); assert.match(bashResult.stderr, receipt.sourceDirty ? /Dirty preview/ : /manual|unmanaged/i);
      assert.equal(JSON.parse(fs.readFileSync(path.join(bashHost, '.config/dotnet-tools.json'))).tools['hephaera'].version, receipt.version);
    }
    const failedHost = directory('unavailable package host'); git(failedHost, 'init', '-q');
    const emptyFeed = directory('empty-feed'), failedConfig = path.join(area, 'empty-feed.config');
    write(failedConfig, '<configuration><packageSources><clear/><add key="empty" value="' + emptyFeed.replaceAll('&', '&amp;') + '"/></packageSources></configuration>');
    const failed = run(process.execPath, [path.join(bundle, 'setup-local-tool.cjs'), '--version', receipt.version, '--project', failedHost, '--configfile', failedConfig], failedHost, { env: { ...env, NUGET_PACKAGES: path.join(area, 'empty-acquisition-cache') } });
    assert.notEqual(failed.status, 0); assert.equal(fs.existsSync(path.join(failedHost, '.hephaera')), false); assert.equal(fs.existsSync(path.join(failedHost, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(failedHost, '.config/.hephaera-tool-setup.lock')), false);
  });
  await check('cancellation terminates the owned .NET launcher and Node child without losing exit semantics', async () => {
    const marker = path.join(area, 'cancel-child.json'), preload = path.join(area, 'linger.cjs');
    write(preload, "require('node:fs').writeFileSync(process.env.HEPHAERA_TEST_CHILD,JSON.stringify({pid:process.pid}));setInterval(()=>{},1000);\n");
    const promise = execute('dotnet', [dll, 'verify', '--json'], { cwd: area, capture: true, env: { ...env, NODE_OPTIONS: '--require=' + JSON.stringify(preload), HEPHAERA_TEST_CHILD: marker } });
    let observed; promise.catch(error => { observed = error; });
    const start = Date.now(); while (!fs.existsSync(marker) && Date.now() - start < 20000) { if (observed) throw observed; await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.ok(fs.existsSync(marker), 'Owned Node child started'); const pid = JSON.parse(fs.readFileSync(marker)).pid;
    process.emit('SIGINT'); await assert.rejects(promise, error => error.exitCode === 130);
    let alive = true; for (let i = 0; i < 40; i++) { try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') { alive = false; break; } } await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.equal(alive, false, 'Cancellation left no owned Node child');
  });
  return { artifactRoot, sourceDirty: receipt.sourceDirty, version: receipt.version, manifestSha256: receipt.manifestSha256, tests: results, limits: ['Local feed only; no real GitHub Packages authentication/publication.', 'Host setup uses a genuine clean Git fixture through the programmatic-only transport.', 'Source and platform evidence applies to this actual package pair and runtime.'] };
}
main().then(report => { write(path.join(area, 'results.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ passed: results.length, evidence: path.join(area, 'results.json') })); }).catch(error => { write(path.join(area, 'results.json'), JSON.stringify({ tests: results, failed: error.stack }, null, 2) + '\n'); console.error(error.stack); process.exitCode = 1; });
