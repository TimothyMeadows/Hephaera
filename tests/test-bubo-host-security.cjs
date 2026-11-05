'use strict';
// Synthetic owned child and bytes: no Bubo execution, media or acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { test } = require('node:test');
const timers = require('node:timers/promises');
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
function mockDeadline(t) {
  const original=timers.setTimeout, observed={};
  timers.setTimeout=(delay,value,options)=>{
    Object.assign(observed,{delay,value,options});
    return new Promise((resolve,reject)=>{
      observed.expire=()=>resolve(value);
      options.signal.addEventListener('abort',()=>{observed.aborted=true;reject(new DOMException('Owned timer retired','AbortError'));},{once:true});
    });
  };
  t.after(()=>{timers.setTimeout=original;});
  return observed;
}
function mockChild(t) {
  const original=cp.spawn, child=new EventEmitter(), observed={signals:[]};
  child.pid=12345;child.stdout=new PassThrough();
  child.kill=signal=>{observed.signals.push(signal);return true;};
  cp.spawn=(file,args,options)=>{Object.assign(observed,{file,args,options});return child;};
  t.after(()=>{cp.spawn=original;});
  return {child,observed};
}
function finish(child,args) {
  const contextFile=args[args.indexOf('--host-context')+1];
  child.emit('spawn');
  child.stdout.end(JSON.stringify({schemaVersion:'bubo-execution-result/v1',apiVersion:2,hostContextSha256:runtime.hash(contextFile),status:'succeeded',data:{}}));
  child.emit('close',0,null);
}
function cleanChild(child,before) {
  assert.deepEqual(['SIGINT','SIGTERM'].map(name=>process.listenerCount(name)),before);
  for(const name of ['spawn','error','close'])assert.equal(child.listenerCount(name),0);
  assert.equal(child.stdout.listenerCount('data'),0);
}
test('successful child aborts and drains its data-only Promise deadline and removes listeners', async t => {
  const prepared = fixture(t);
  const deadline=mockDeadline(t), {child,observed}=mockChild(t);
  const before = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name));
  const resultPromise = host.execute('media', 'inspect', new Map([['task', 'owned']]), prepared, { executable: process.execPath }, false);
  assert.equal(deadline.delay,183000);
  assert.equal(deadline.value,'deadline');
  assert(deadline.options.signal instanceof AbortSignal);
  assert.equal(deadline.options.ref,false);
  assert.deepEqual(observed.args.slice(0,4),['media','inspect','--api-version','2']);
  assert.equal(observed.options.shell,undefined);
  finish(child,observed.args);
  assert.equal((await resultPromise).status, 'succeeded');
  assert.equal(deadline.aborted,true);
  assert.equal(observed.signals.length,0);
  cleanChild(child,before);
});
test('deadline expiry requests fixed cancellation and waits for actual child retirement',async t=>{
  const prepared=fixture(t),deadline=mockDeadline(t),{child,observed}=mockChild(t);
  const before=['SIGINT','SIGTERM'].map(name=>process.listenerCount(name));
  let completed=false;
  const promise=host.execute('media','inspect',new Map(),prepared,{executable:process.execPath},false);
  promise.then(()=>{completed=true;},()=>{completed=true;});
  deadline.expire();await timers.setImmediate();
  assert.deepEqual(observed.signals,[process.platform==='win32'?'SIGTERM':'SIGINT']);
  assert.equal(completed,false);
  finish(child,observed.args);await promise;
  assert.equal(deadline.options.signal.aborted,true);
  cleanChild(child,before);
});
test('host signals use the owned cancellation path and abort the remaining deadline',async t=>{
  const prepared=fixture(t),deadline=mockDeadline(t),{child,observed}=mockChild(t);
  const before=['SIGINT','SIGTERM'].map(name=>process.listenerCount(name));
  const promise=host.execute('media','inspect',new Map(),prepared,{executable:process.execPath},false);
  process.emit('SIGINT');
  assert.deepEqual(observed.signals,[process.platform==='win32'?'SIGTERM':'SIGINT']);
  finish(child,observed.args);await promise;
  assert.equal(deadline.aborted,true);cleanChild(child,before);
});
test('unobserved child PID preserves unknown ownership and cleans the deadline',async t=>{
  const prepared=fixture(t),deadline=mockDeadline(t),{child,observed}=mockChild(t),events=[];
  const before=['SIGINT','SIGTERM'].map(name=>process.listenerCount(name));
  delete child.pid;
  const promise=host.execute('media','inspect',new Map(),prepared,{executable:process.execPath},false,{closed:value=>events.push(value)});
  child.emit('close',null,null);
  await assert.rejects(promise,/PID was not observed/);
  assert.equal(events[0].pid,null);assert.equal(events[0].launchState,'unknown');assert.equal(events[0].spawned,false);
  assert.equal(deadline.aborted,true);assert.equal(observed.signals.length,0);cleanChild(child,before);
});
test('deadline setup failure retires the owned child before rejecting',async t=>{
  const prepared=fixture(t),{child,observed}=mockChild(t),original=timers.setTimeout,events=[];
  const before=['SIGINT','SIGTERM'].map(name=>process.listenerCount(name));
  timers.setTimeout=()=>{throw new Error('Owned deadline setup failure');};
  t.after(()=>{timers.setTimeout=original;});
  const promise=host.execute('media','inspect',new Map(),prepared,{executable:process.execPath},false,{closed:value=>events.push(value)});
  assert.deepEqual(observed.signals,[process.platform==='win32'?'SIGTERM':'SIGINT']);
  child.emit('close',null,'SIGTERM');
  await assert.rejects(promise,/deadline setup failure/);
  assert.equal(events[0].pid,child.pid);assert.equal(events[0].error,'Owned deadline setup failure');
  cleanChild(child,before);
});
