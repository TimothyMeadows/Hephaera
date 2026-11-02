'use strict';
// Real owned Git histories and metadata archives; no SDK, registry or release writes.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), zlib = require('node:zlib');
const release = require('../installer/lib/release.cjs');
const { writeZip } = require('../installer/scripts/archives.cjs');
const { digest } = require('../installer/core/files.cjs');
const root = path.resolve(__dirname, '..'), area = path.join(root, '.local', 'release-runner-' + crypto.randomUUID());
fs.mkdirSync(area, { recursive: true });
const environment = { ...process.env, GIT_CONFIG_GLOBAL: path.join(area, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' };
for (const key of Object.keys(environment)) if (/^GIT_CONFIG_(COUNT|KEY_|VALUE_)/.test(key)) delete environment[key];
fs.writeFileSync(environment.GIT_CONFIG_GLOBAL, '[core]\n autocrlf = false\n[commit]\n gpgsign = false\n');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function git(dir, ...args) { return cp.execFileSync('git', ['-C', dir, '-c', 'core.hooksPath=' + path.join(root, 'installer/core/no-hooks'), '-c', 'core.longpaths=true', '-c', 'user.name=Owned Release Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { encoding: 'utf8', env: environment, windowsHide: true, stdio: ['ignore','pipe','pipe'] }).trim(); }
function write(dir, name, data) { const file = path.join(dir, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }
function copy(dir, name) { write(dir, name, fs.readFileSync(path.join(root, name))); }
function tar(entries) {
  const chunks = [];
  for (const [name, bytes] of entries) {
    const header = Buffer.alloc(512); header.write(name); header.write('0000644\0', 100); header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.fill(32, 148, 156); header[156] = 48;
    header.write(header.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return zlib.gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
const source = path.join(area, 'source'), tools = path.join(area, 'tools'), version = '7.0.0-rc.1';
fs.mkdirSync(source); git(source, 'init', '-q'); git(source, 'remote', 'add', 'origin', release.repository);
write(source, '.gitignore', '.local/\n'); copy(source, '.gitattributes'); copy(source, 'runtime/bubo.lock.json');
write(source, 'installer/version.json', JSON.stringify({ schemaVersion: 1, version }));
for (const name of Object.keys(release.inventory(path.join(root, 'installer/core')))) copy(source, 'installer/core/' + name);
const setupNames = ['README.md', 'setup-nuget.sh', 'setup-nuget.ps1', 'setup-local-tool.cjs', 'NuGet.Hephaera.config', 'npmrc.example'];
for (const name of setupNames) copy(source, 'installer/setup/' + name);
git(source, 'add', '.');
const bubo = JSON.parse(fs.readFileSync(path.join(source, 'runtime/bubo.lock.json')));
git(source, 'update-index', '--add', '--cacheinfo', '160000,' + bubo.revision + ',runtime/bubo');
git(source, 'commit', '-qm', 'Owned frozen package source'); fs.mkdirSync(path.join(source, 'runtime/bubo'), { recursive: true });
git(source, 'tag', version); git(source, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
const manifest = release.verifyReleaseSource(source, version), sourceSha = manifest.revision;
git(area, 'clone', '-q', '--no-hardlinks', source, tools); git(tools, 'remote', 'set-url', 'origin', release.repository);
for (const name of ['installer/lib/release.cjs', 'installer/lib/publish.cjs', 'installer/lib/release-assets.cjs', 'installer/scripts/archives.cjs', 'installer/scripts/release-runner.cjs']) copy(tools, name);
write(tools, 'installer/version.json', JSON.stringify({ schemaVersion: 1, version: '9.0.0-tools' }));
git(tools, 'add', '.'); git(tools, 'commit', '-qm', 'Owned newer reviewed workflow tools');
const toolsSha = git(tools, 'rev-parse', 'HEAD'); assert.notEqual(sourceSha, toolsSha);
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
const npm = new Map([['package/package.json', Buffer.from(JSON.stringify({ name: '@timothymeadows/hephaera', version }))], ['package/core/release-manifest.json', manifestBytes]]);
const nuget = new Map([['Hephaera.nuspec', Buffer.from('<package><metadata><id>Hephaera</id><version>' + version + '</version></metadata></package>')], ['tools/net10.0/any/embedded/core/release-manifest.json', manifestBytes]]);
for (const name of Object.keys(manifest.coreFiles)) { const bytes = fs.readFileSync(path.join(source, 'installer/core', name)); npm.set('package/core/' + name, bytes); nuget.set('tools/net10.0/any/embedded/core/' + name, bytes); }
const setup = new Map(), setupFiles = {};
for (const name of setupNames) { const bytes = cp.execFileSync('git', ['-C', source, 'show', sourceSha + ':installer/setup/' + name], { env: environment }); setup.set(name, bytes); setupFiles[name] = hash(bytes); }
setup.set('setup-release.json', Buffer.from(JSON.stringify({ schemaVersion: 1, version, manifestSha256: digest(manifest), manifestFileSha256: hash(manifestBytes), files: setupFiles })));
function artifacts(label) {
  const directory = path.join(area, label); fs.mkdirSync(path.join(directory, 'artifacts'), { recursive: true });
  const receipt = { schemaVersion: 1, version, sourceDirty: false, manifest, manifestSha256: digest(manifest), manifestFileSha256: hash(manifestBytes), artifacts: {} };
  for (const [name, bytes] of [['npm', tar(npm)], ['nuget', writeZip(nuget)], ['setup', writeZip(setup)]]) {
    const file = 'artifacts/' + name; fs.writeFileSync(path.join(directory, file), bytes); receipt.artifacts[name] = { file, sha256: hash(bytes) };
  }
  fs.writeFileSync(path.join(directory, 'package-build.json'), JSON.stringify(receipt)); return directory;
}
const child = String.raw`
  const cp=require('node:child_process'),original=cp.execFileSync;
  const [runner,directory,source,version,sourceSha]=process.argv.slice(1),calls=[];
  cp.execFileSync=(file,args,options)=>{
    if(file!=='gh')return original(file,args,options);
    calls.push(args);
    if(args[0]==='release'&&args[1]==='view')return JSON.stringify({databaseId:1234,tagName:version});
    if(args[0]==='api'&&args[1]==='repos/TimothyMeadows/Hephaera/releases/1234')return JSON.stringify({id:1234,tag_name:version,target_commitish:sourceSha,draft:true,prerelease:true,assets:[]});
    throw new Error('Unexpected external boundary');
  };
  require(runner).runOperation('assets-check',directory,source).then(result=>console.log(JSON.stringify({result,calls}))).catch(error=>{console.error(error.message);process.exitCode=1;});
`;
function run(label, override = {}) {
  const directory = artifacts(label), env = { ...environment, GH_TOKEN: '', GITHUB_TOKEN: '', NODE_AUTH_TOKEN: '', GITHUB_REPOSITORY: 'TimothyMeadows/Hephaera', HEPHAERA_RELEASE_SOURCE_SHA: sourceSha, HEPHAERA_RELEASE_TOOLS_SHA: toolsSha, HEPHAERA_RELEASE_ID: '1234', ...override };
  const result = cp.spawnSync(process.execPath, ['-e', child, path.join(tools, 'installer/scripts/release-runner.cjs'), directory, source, version, sourceSha], { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.ifError(result.error); return { ...result, directory };
}
test('newer clean workflow tools admit only the older frozen package source and approved draft ID', () => {
  const result = run('valid'); assert.equal(result.status, 0, result.stderr); const observed = JSON.parse(result.stdout);
  assert.equal(observed.result.status, 'preflight-confirmed'); assert.equal(observed.result.version, version); assert.equal(observed.result.sourceRevision, sourceSha); assert.equal(observed.result.workflowToolsRevision, toolsSha);
  assert.ok(observed.calls.some(args => args[1] === 'repos/TimothyMeadows/Hephaera/releases/1234'));
  assert.ok(!observed.calls.some(args => args.some(value => value.includes('/releases/tags/'))));
  const provenance = JSON.parse(fs.readFileSync(path.join(result.directory, 'release-orchestration.json')));
  assert.equal(provenance.sourceRevision, sourceSha); assert.equal(provenance.workflowToolsRevision, toolsSha); assert.equal(provenance.releaseId, 1234);
  assert.equal(fs.existsSync(path.join(result.directory, 'publication.json')), false);
});
test('wrong approved package revision fails before release or publication state', () => {
  const result = run('wrong-source', { HEPHAERA_RELEASE_SOURCE_SHA: 'a'.repeat(40) }); assert.notEqual(result.status, 0); assert.match(result.stderr, /package source differs/); assert.equal(fs.existsSync(path.join(result.directory, 'release-orchestration.json')), false);
});
test('wrong workflow-tools revision and missing draft ID fail before state', () => {
  for (const override of [{ HEPHAERA_RELEASE_TOOLS_SHA: 'b'.repeat(40) }, { HEPHAERA_RELEASE_ID: '' }]) {
    const result = run('wrong-tools-' + crypto.randomUUID(), override); assert.notEqual(result.status, 0); assert.match(result.stderr, /workflow revision|draft release ID/); assert.equal(fs.existsSync(path.join(result.directory, 'release-orchestration.json')), false);
  }
});
test('unreviewed package source edits and unreviewed tool edits are refused', () => {
  write(source, 'unreviewed.txt', 'Owned changed source fixture.\n'); const dirtySource = run('dirty-source'); assert.notEqual(dirtySource.status, 0); assert.match(dirtySource.stderr, /clean committed source/);
  write(tools, 'unreviewed.txt', 'Owned changed tools fixture.\n'); const dirtyTools = run('dirty-tools'); assert.notEqual(dirtyTools.status, 0); assert.match(dirtyTools.stderr, /clean reviewed workflow revision/);
});
