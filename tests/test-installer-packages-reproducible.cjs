'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { packPackages } = require('../installer/scripts/pack.cjs');
const { readZip, writeZip, normalizeUnsignedZipTimestamps } = require('../installer/scripts/archives.cjs');
const root = path.resolve(__dirname, '..'), area = path.join(root, '.local', 'installer-reproducible-' + crypto.randomUUID());
fs.mkdirSync(area, { recursive: true });
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
  const report = { sourceDirty: first.sourceDirty, manifestSha256: first.manifestSha256, first: first.output, second: second.output, artifacts: first.artifacts, verdict: 'pass', signedPackageNormalization: 'rejected', entryPayloadValidation: 'pass' };
  fs.writeFileSync(path.join(area, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ verdict: 'pass', identicalArtifacts: 3, artifacts: first.output, evidence: path.join(area, 'results.json') }, null, 2));
}
main().catch(error => { fs.writeFileSync(path.join(area, 'failure.txt'), error.stack + '\n'); console.error(error.stack); process.exitCode = 1; });
