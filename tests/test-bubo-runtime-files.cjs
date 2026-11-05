'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { test } = require('node:test');
const runtime = require('../commands/lib/bubo-runtime.cjs');
const cache = path.join(__dirname, '../.hephaera/.cache/tasks/snyk-remediation-implementation/evidence/root');
fs.mkdirSync(cache, { recursive: true });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(cache, 'files-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(cache));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
test('guarded regular-file hashing and bounded JSON preserve ordinary and empty bytes', t => {
  const root = fixture(t), file = path.join(root, 'data.json');
  for (const bytes of ['', 'owned bytes', 'x'.repeat(200000)]) {
    fs.writeFileSync(file, bytes);
    assert.equal(runtime.hash(runtime.projectPath(root, 'data.json')), crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  fs.writeFileSync(file, '{"owned":true}');
  assert.deepEqual(runtime.json(file), { owned: true });
  assert.throws(() => runtime.json(file, 4), /oversized JSON/);
  for (const limit of [0, -1, Infinity, '1048576', 8 * 1024 * 1024 + 1]) assert.throws(() => runtime.json(file, limit), /Invalid JSON byte limit/);
  fs.writeFileSync(file, ' '.repeat(8 * 1024 * 1024 + 1));
  assert.throws(() => runtime.json(file), /oversized JSON/);
});
test('direct helper calls reject directories and links before reading', t => {
  const root = fixture(t);
  for (const read of [runtime.hash, runtime.json]) assert.throws(() => read(root), /regular file/);
  const linked = path.join(root, 'linked');
  if (process.platform === 'win32') {
    fs.symlinkSync(root, linked, 'junction');
    for (const read of [runtime.hash, runtime.json]) assert.throws(() => read(linked), /regular file/);
  } else {
    fs.writeFileSync(path.join(root, 'data'), '{}');
    fs.symlinkSync(path.join(root, 'data'), linked);
    for (const read of [runtime.hash, runtime.json]) assert.throws(() => read(linked), /regular file/);
  }
});
test('hashing detects file growth without following an unbounded stream', t => {
  const root = fixture(t), file = path.join(root, 'data');
  fs.writeFileSync(file, 'owned');
  const original = fs.readSync;
  let changed = false;
  fs.readSync = (...args) => {
    const count = original(...args);
    if (!changed) { changed = true; fs.appendFileSync(file, 'more'); }
    return count;
  };
  t.after(() => { fs.readSync = original; });
  assert.throws(() => runtime.hash(file), /grew|changed/);
});
test('POSIX special files reject without opening a blocking FIFO', { skip: process.platform === 'win32' }, t => {
  const root = fixture(t), fifo = path.join(root, 'owned-fifo');
  cp.execFileSync('mkfifo', [fifo]);
  for (const read of [runtime.hash, runtime.json]) assert.throws(() => read(fifo), /regular file/);
});
