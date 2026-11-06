'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');
const cp = require('node:child_process');
const { validateManifest, PASS_IDS } = require('../commands/lib/code-model-cli.cjs');

const cache = path.join(__dirname, '../.hephaera/.cache/tasks/snyk-remediation-implementation/evidence/root');
fs.mkdirSync(cache, { recursive: true });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(cache, 'identifiers-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(cache));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'node_modules/three'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules/three/package.json'), JSON.stringify({ version: '0.182.0' }));
  fs.writeFileSync(path.join(root, 'STYLE.md'), '# Owned CODE test style\n');
  fs.writeFileSync(path.join(root, 'proof.txt'), 'Owned inert evidence bytes; no visual approval.');
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  const manifest = {
    schemaVersion: 1, modelId: 'owned-fixture', title: 'Owned CODE fixture',
    intent: { brief: 'Bounded identifier validation fixture', intendedUse: 'Offline testing', styleContract: 'STYLE.md' },
    pipelineSelection: { pipeline: 'CODE', selectionSource: 'prompt', styleContract: 'STYLE.md', styleSha256: hash('STYLE.md') },
    inputs: [{ kind: 'brief', source: 'Owned fixture', rights: 'Owned inert text', consent: 'not-applicable', sha256: { unavailable: true, reason: 'No external input' } }],
    target: { sourcePath: 'model.js', factoryExport: 'createModel' },
    renderer: { library: 'three', installedVersion: '0.182.0', language: 'javascript' },
    runtime: { interface: 'dispose()', deterministicSeed: 1, coordinateSystem: 'Y-up', parts: ['body'], anchors: ['origin'], cleanup: 'Owned disposal' },
    budgets: { triangles: 10, drawCalls: 1, materials: 1, textures: 0 },
    reviewPolicy: { nonPlanar: false, requiredViews: ['front'], maxAttemptsPerPass: 1, maxAttemptsTotal: 6 },
    passes: PASS_IDS.map(id => ({ id, status: 'passed', attempts: 1, reviews: [{ decision: 'pass', summary: 'Synthetic control-flow evidence only', remainingGaps: '', createdAt: '2026-11-05T00:00:00Z', evidence: [{ path: 'proof.txt', sha256: hash('proof.txt'), view: 'front' }] }] }))
  };
  function check(name, code, mode = 'complete') {
    manifest.target.factoryExport = name;
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(root, 'model.js'), code);
    return validateManifest(root, 'manifest.json', mode);
  }
  return { root, manifest, check };
}
const source = name => `import * as THREE from 'three'; export function ${name}() { return { dispose() {} }; }`;

test('complete validation matches ordinary and dollar factory names literally', t => {
  const f = fixture(t);
  for (const name of ['createModel', '$createModel', 'create$Model', 'createModel$', '$', '_createModel'])
    assert.equal(f.check(name, source(name)).manifest.target.factoryExport, name);
});

test('complete validation rejects longer and Unicode-adjacent identifiers', t => {
  const f = fixture(t);
  for (const name of ['createModelExtra', 'extra_createModel', '$createModel', 'createModel$', '\u00e9createModel', 'createModel\u00e9'])
    assert.throws(() => f.check('createModel', source(name)), /recorded factory export/);
  assert.throws(() => f.check('$createModel', source('createModel')), /recorded factory export/);
});

test('invalid and oversized factory identifiers fail before complete-source checks', t => {
  const f = fixture(t);
  for (const name of ['', 'bad.name', 'a|b', 'with space', 'A'.repeat(129), {}, 123])
    assert.throws(() => f.check(name, '', 'base'), /factoryExport/);
  assert.doesNotThrow(() => f.check('A'.repeat(128), source('A'.repeat(128))));
});

test('manifest and source byte bounds reject oversized files', t => {
  const f = fixture(t);
  assert.throws(() => f.check('createModel', source('createModel') + ' '.repeat(8 * 1024 * 1024)), /Target source.*at most/);
  fs.writeFileSync(path.join(f.root, 'manifest.json'), ' '.repeat(8 * 1024 * 1024 + 1));
  assert.throws(() => validateManifest(f.root, 'manifest.json'), /at most/);
});

test('manifest admission rejects non-regular input before opening it', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, 'directory.json'));
  assert.throws(() => validateManifest(f.root, 'directory.json'), /regular file/);
});

test('POSIX manifest and source FIFOs reject before any blocking read', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t);
  f.check('createModel', source('createModel'));
  for (const name of ['model.js', 'manifest.json']) {
    const file = path.join(f.root, name);
    fs.unlinkSync(file);
    cp.execFileSync('mkfifo', [file]);
    assert.throws(() => validateManifest(f.root, 'manifest.json', 'complete'), /regular file/);
    fs.unlinkSync(file);
    if (name === 'model.js') fs.writeFileSync(file, source('createModel'));
  }
});
