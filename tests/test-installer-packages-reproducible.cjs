'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const cp = require('node:child_process');
const { packPackages } = require('../installer/scripts/pack.cjs');
const { readZip, writeZip, normalizeUnsignedZipTimestamps } = require('../installer/scripts/archives.cjs');
const root = path.resolve(__dirname, '..'), area = path.join(root, '.local', 'installer-reproducible-' + crypto.randomUUID());
fs.mkdirSync(area, { recursive: true });
const gitEnvironment = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(area, 'gitconfig') };
for (const key of Object.keys(gitEnvironment)) if (/^GIT_CONFIG_(COUNT|KEY_|VALUE_)/.test(key)) delete gitEnvironment[key];
fs.writeFileSync(gitEnvironment.GIT_CONFIG_GLOBAL, '[core]\n autocrlf = false\n[commit]\n gpgsign = false\n');
function git(directory, ...args) {
  return cp.execFileSync('git', ['-C', directory, '-c', 'core.longpaths=true', '-c', 'core.hooksPath=' + path.join(root, 'installer/core/no-hooks'), '-c', 'user.name=Package Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { env: gitEnvironment, encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','pipe'] }).trim();
}
function canonicalFixture() {
  const source = path.join(area, 'source'); fs.mkdirSync(source); git(source, 'init', '-q');
  const inputs = cp.execFileSync('git', ['-C', root, 'ls-files', '-z', '--', 'installer', '.gitattributes', '.gitignore', '.gitmodules', 'LICENSE', 'runtime/bubo.lock.json'], { env: gitEnvironment }).toString().split('\0').filter(Boolean);
  for (const name of inputs) { const output = path.join(source, name); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.copyFileSync(path.join(root, name), output); }
  git(source, '-c', 'core.autocrlf=input', 'add', '.');
  const lock = JSON.parse(fs.readFileSync(path.join(source, 'runtime/bubo.lock.json')));
  git(source, 'update-index', '--add', '--cacheinfo', '160000,' + lock.revision + ',runtime/bubo');
  git(source, 'commit', '-qm', 'Clean canonical package fixture');
  return source;
}
async function main() {
  assert.throws(() => normalizeUnsignedZipTimestamps(writeZip(new Map([['.signature.p7s', Buffer.from('signed-package-fixture')]]))), /Signed packages/);
  const first = packPackages({ output: path.join(area, 'first'), allowDirty: true });
  // Cross a DOS timestamp boundary; two packs in the same two-second window can hide the regression.
  await new Promise(resolve => setTimeout(resolve, 2200));
  const second = packPackages({ output: path.join(area, 'second'), allowDirty: true });
  assert.equal(first.manifestSha256, second.manifestSha256, 'Source/core changed during the reproducibility check; rerun after the candidate freezes.');
  assert.equal(first.manifestFileSha256, second.manifestFileSha256);
  for (const channel of ['npm', 'nuget', 'setup']) {
    const a = fs.readFileSync(path.join(first.output, first.artifacts[channel].file)), b = fs.readFileSync(path.join(second.output, second.artifacts[channel].file));
    assert.deepEqual(a, b, channel + ' package bytes differ between identical-source packs');
    assert.equal(first.artifacts[channel].sha256, second.artifacts[channel].sha256);
  }
  const entries = readZip(fs.readFileSync(path.join(first.output, first.artifacts.nuget.file)));
  assert.ok(entries.has('tools/net10.0/any/embedded/core/cli.cjs'));
  const source = canonicalFixture();
  git(source, 'config', 'core.autocrlf', 'false'); git(source, 'checkout-index', '--force', '--all');
  const lf = packPackages({ repoRoot: source, output: '.local/lf' });
  git(source, 'config', 'core.autocrlf', 'true'); git(source, 'checkout-index', '--force', '--all');
  const checkoutReadme = fs.readFileSync(path.join(source, 'installer/setup/README.md'));
  const committedReadme = cp.execFileSync('git', ['-C', source, 'show', 'HEAD:installer/setup/README.md'], { env: gitEnvironment });
  assert.ok(checkoutReadme.includes(Buffer.from('\r\n')), 'Fixture must exercise actual CRLF checkout bytes.');
  assert.ok(!committedReadme.includes(Buffer.from('\r\n')));
  assert.equal(git(source, 'status', '--porcelain'), '', 'CRLF checkout must remain a clean Git source.');
  const crlf = packPackages({ repoRoot: source, output: '.local/crlf' });
  assert.equal(lf.sourceDirty, false); assert.equal(crlf.sourceDirty, false);
  for (const channel of ['npm', 'nuget', 'setup']) assert.equal(lf.artifacts[channel].sha256, crlf.artifacts[channel].sha256, channel + ' differs for LF/CRLF checkouts of one clean commit');
  const setup = readZip(fs.readFileSync(path.join(crlf.output, crlf.artifacts.setup.file)));
  assert.deepEqual(setup.get('README.md'), committedReadme, 'Setup must carry canonical source bytes.');
  const admitted = JSON.parse(cp.execFileSync(process.execPath, [path.join(source, 'installer/lib/publish.cjs'), crlf.output], { cwd: source, env: gitEnvironment, encoding: 'utf8', windowsHide: true }));
  assert.equal(admitted.status, 'dry-run'); assert.equal(admitted.revision, crlf.manifest.revision);
  const report = { sourceDirty: first.sourceDirty, manifestSha256: first.manifestSha256, first: first.output, second: second.output, artifacts: first.artifacts, verdict: 'pass', signedPackageNormalization: 'rejected', entryPayloadValidation: 'pass', canonicalCheckouts: { source, revision: crlf.manifest.revision, lf: lf.output, crlf: crlf.output, identicalArtifacts: 3, publicationDryRun: 'pass' } };
  fs.writeFileSync(path.join(area, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ verdict: 'pass', identicalArtifacts: 3, artifacts: first.output, evidence: path.join(area, 'results.json') }, null, 2));
}
main().catch(error => { fs.writeFileSync(path.join(area, 'failure.txt'), error.stack + '\n'); console.error(error.stack); process.exitCode = 1; });
