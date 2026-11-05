'use strict';
// Synthetic owned child and bytes: no Bubo execution, media or acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { test } = require('node:test');
const host = require('../commands/lib/bubo-host-adapter.cjs');
const runtime = require('../commands/lib/bubo-runtime.cjs');
const cache = path.join(__dirname, '../.hephaera/.cache/tasks/snyk-remediation-implementation/evidence/root');
fs.mkdirSync(cache, { recursive: true });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(cache, 'host-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(cache));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, stateRoot: '.hephaera/.cache/tasks/owned', context: { budgets: { timeoutSeconds: 123, maxLogBytes: 4096 } } };
}
test('all malformed final launch budgets reject before creating state or spawning', async t => {
  const prepared = fixture(t), original = cp.spawn;
  let launches = 0;
  cp.spawn = () => { launches++; throw new Error('Must not launch'); };
  t.after(() => { cp.spawn = original; });
  for (const value of [NaN, Infinity, 0, -1, 1.5, '123', 86401]) {
    prepared.context.budgets.timeoutSeconds = value;
    await assert.rejects(host.execute('media', 'inspect', new Map(), prepared, {}), /finite admitted/);
  }
  prepared.context.budgets.timeoutSeconds = 123;
  for (const value of [NaN, Infinity, 0, '4096', 1073741825]) {
    prepared.context.budgets.maxLogBytes = value;
    await assert.rejects(host.execute('vfx-assets', 'inspect', new Map(), prepared, {}), /finite admitted/);
  }
  assert.equal(launches, 0);
  assert.equal(fs.existsSync(path.join(prepared.root, '.hephaera')), false);
});
test('fixed cancellation callback owns signals, bounded timer and cleanup', async t => {
  const prepared = fixture(t), originalSpawn = cp.spawn;
  const originalSet = global.setTimeout, originalClear = global.clearTimeout;
  const before = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name));
  let callback, delay, timer, cleared, args, options, signal;
  const child = new EventEmitter();
  child.pid = 12345;
  child.stdout = new PassThrough();
  child.kill = value => { signal = value; return true; };
  cp.spawn = (_file, argv, config) => { args = argv; options = config; return child; };
  global.setTimeout = (fn, ms) => { callback = fn; delay = ms; timer = {}; return timer; };
  global.clearTimeout = value => { cleared = value; };
  t.after(() => { cp.spawn = originalSpawn; global.setTimeout = originalSet; global.clearTimeout = originalClear; });
  const resultPromise = host.execute('media', 'inspect', new Map([['task', 'owned']]), prepared, { executable: process.execPath }, false);
  // execute() reaches its synchronous launch section before yielding.
  assert.equal(typeof callback, 'function');
  assert.equal(delay, 183000);
  assert.deepEqual(args.slice(0, 4), ['media', 'inspect', '--api-version', '2']);
  assert.equal(options.shell, undefined); // spawn default is shell:false.
  callback();
  assert.equal(signal, process.platform === 'win32' ? 'SIGTERM' : 'SIGINT');
  const contextFile = args[args.indexOf('--host-context') + 1];
  child.emit('spawn');
  child.stdout.end(JSON.stringify({ schemaVersion: 'bubo-execution-result/v1', apiVersion: 2, hostContextSha256: runtime.hash(contextFile), status: 'succeeded', data: {} }));
  child.emit('close', 0, null);
  assert.equal((await resultPromise).status, 'succeeded');
  assert.equal(cleared, timer);
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)), before);
});
