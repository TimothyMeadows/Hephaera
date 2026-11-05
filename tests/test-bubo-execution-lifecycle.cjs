'use strict';
// Actual owned Node children exercise transport ownership, without native authoring or installation.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { execute } = require('../commands/lib/bubo-host-adapter.cjs');
const base = path.resolve(__dirname, '..');
const evidence = path.join(base, '.hephaera/.cache/tasks/hephaera-vfx-threejs/evidence');
fs.mkdirSync(evidence, {recursive: true});
const root = fs.mkdtempSync(path.join(evidence, 'transport-'));
const script = path.join(root, 'owned-child.cjs');
fs.writeFileSync(script, `const fs=require('node:fs'),crypto=require('node:crypto');
const args=process.argv.slice(2),context=args[args.indexOf('--host-context')+1];
if(args[0]==='wait')setInterval(()=>{},1000);
else console.log(JSON.stringify({schemaVersion:'bubo-execution-result/v1',apiVersion:2,status:'succeeded',hostContextSha256:crypto.createHash('sha256').update(fs.readFileSync(context)).digest('hex'),data:{ownedFixture:true}}));\n`);
const prepared = { root, stateRoot: '.hephaera/.cache/tasks/transport', context: { budgets: { timeoutSeconds: 1 } } };
const dead = pid => { try { process.kill(pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } };
let checks = 0;
const check = (value, reason) => { assert(value, reason); checks++; };
async function run() {
  const events = [];
  const hooks = Object.fromEntries(['beforeLaunch', 'spawned', 'closed'].map(name => [name, value => { events.push({ name, ...value }); }]));
  const result = await execute(script, 'ok', new Map(), prepared, { executable: process.execPath }, false, hooks);
  check(result.data.ownedFixture, 'actual child completed exact context-bound result');
  check(events.map(x => x.name).join(',') === 'beforeLaunch,spawned,closed', 'ownership ordering is intent, PID, actual retirement');
  check(events[0].pid === undefined && Number.isSafeInteger(events[1].pid), 'intent precedes known PID');
  check(events[2].pid === events[1].pid && events[2].status === 0 && events[2].launchState === 'started' && dead(events[2].pid), 'closed callback records the retired actual owned process');
  check(events.every(x => x.hostContextSha256 === result.hostContextSha256), 'all ownership events bind the exact serialized context');
  let frozen = false;
  await execute(script, 'ok', new Map(), prepared, { executable: process.execPath }, false,
    { beforeLaunch(value) { frozen = Object.isFrozen(value); } });
  check(frozen, 'compiled hook receives frozen ownership descriptor');
  let called = false;
  await assert.rejects(execute(script, 'wait', new Map(), prepared, { executable: process.execPath }, false,
    { beforeLaunch() { throw new Error('refused-intent'); }, spawned() { called = true; } }), /refused-intent/);
  check(!called, 'failed intent persistence starts no child');
  let pid, closed;
  await assert.rejects(execute(script, 'wait', new Map(), prepared, { executable: process.execPath }, false,
    { spawned(value) { pid = value.pid; throw new Error('failed-pid-write'); }, closed(value) { closed = value; } }), /failed-pid-write/);
  check(Number.isSafeInteger(pid) && dead(pid), 'PID persistence failure retires exact owned child before rejection');
  check(closed.pid === pid && closed.error === 'failed-pid-write', 'PID persistence failure retains actual completion identity');
  let failed;
  await assert.rejects(execute(script, 'ok', new Map(), prepared, { executable: path.join(root, 'absent-native-executable') }, false,
    { closed(value) { failed = value; } }), /ENOENT/);
  check(failed.pid === null && !failed.spawned && failed.launchState === 'spawn-failed' && failed.error.includes('ENOENT'), 'actual spawn refusal does not invent a child PID');
  await assert.rejects(execute(script, 'ok', new Map(), prepared, { executable: process.execPath }, false, { arbitrary: () => {} }), /fixed compiled caller/);
  checks++;
  const plain = await execute(script, 'ok', new Map(), prepared, { executable: process.execPath }, false);
  check(plain.data.ownedFixture, 'existing no-hook callers retain the original transport behavior');
  console.log(`Bubo execution ownership hooks passed: ${checks}. Actual fixtures retained at ${root}`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
