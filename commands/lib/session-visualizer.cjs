'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const store = require('./session-events.cjs');
let loadedService;
const viewer = () => loadedService ||= require('./session-visualizer-server.cjs');
const HELP = `Usage: session-visualizer.sh <start|status|emit|run|end|stop|history|delete> [options]
  start [--session UUID] [--host codex|claude|cursor|other] [--label TEXT] [--no-open] [--port N]
  emit --session UUID --label TEXT [--phase context|planning|work|verification|review]
       [--category session|phase|task|agent|role|skill|command|artifact|review|branch|idea|goal|gauntlet|work-unit|round]
       [--activity UUID] [--parent UUID] [--action started|updated|finished]
       [--status running|waiting|blocked|succeeded|failed|cancelled|unknown]
       [--owner TEXT] [--role TEXT] [--skill TEXT] [--task TEXT] [--mode brainstorm|task|goal|gauntlet]
       [--operation TEXT] [--blocker TEXT] [--evidence PROJECT_RELATIVE_PATH ...]
  run --session UUID [--phase PHASE] [--label TEXT] -- EXECUTABLE [ARG ...]
  end|delete --session UUID   Explicit ending; deletion accepts ended sessions only.
  status [--session UUID]    No credentials are printed.
  history [--offset N] [--limit N]
  stop                       Stops this project's owned service; preserves history.
  Settings: .hephaera/.cache/visualizer/config.json: {"enabled":true,"openBrowser":true}
  Node24 is required. HTTP binding is fixed to 127.0.0.1; there is no public-listen option.
  Browser launch uses an existing Chromium without certificate exception flags.
  Metadata only. Installation, native execution and publication are never authorized here.
`;
function parse(values) {
  const [operation, ...args] = values, options = {}, command = [];
  const allowed = ['root','session','host','label','port','phase','category','activity','parent','action','status','owner','role','skill','task','mode','operation','blocker','evidence','offset','limit'];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') { command.push(...args.slice(i + 1)); break; }
    if (args[i] === '--no-open') { options.noOpen = true; continue; }
    const key = args[i].slice(2);
    if (!args[i].startsWith('--') || !allowed.includes(key) || i + 1 >= args.length || args[i + 1].startsWith('--') || Object.hasOwn(options, key) && key !== 'evidence') throw new Error('Unknown, repeated or missing visualizer option.');
    const value = args[++i]; if (key === 'evidence') (options.evidence ||= []).push(value); else options[key] = value;
  }
  if (!['start','status','emit','run','end','stop','history','delete'].includes(operation)) throw new Error('Unknown visualizer operation.');
  const perOperation = { start: ['session','host','label','port','noOpen'], status: ['session'], emit: ['session','label','phase','category','activity','parent','action','status','owner','role','skill','task','mode','operation','blocker','evidence'], run: ['session','label','phase'], end: ['session'], stop: [], history: ['offset','limit'], delete: ['session'] };
  if (Object.keys(options).some(k => k !== 'root' && !perOperation[operation].includes(k)) || operation !== 'run' && command.length) throw new Error('Option is not supported by this operation.');
  return { operation, options, command };
}
async function info(root) { try { const service = viewer(), value = service.runtime(root); return await service.probe(value) ? value : null; } catch { return null; } }
async function start(root, options) {
  if (!store.settings(root).enabled) return { status: 'disabled' };
  const existing = options.session && fs.existsSync(store.safe(root, store.CACHE + '/sessions/' + store.id(options.session) + '/session.json', 'file'));
  const session = store.createSession(root, { sessionId: options.session, host: options.host, title: options.label });
  if (!existing) { try { store.emit(root, session.id, { phase: 'context', category: 'session', label: 'Hephaera session registered', action: 'finished', status: 'succeeded', source: 'command-observed' }); } catch {} }
  const service = viewer();
  const lock = store.safe(root, store.CACHE + '/launcher-lock', 'dir'), deadline = Date.now() + 20000;
  while (true) { try { fs.mkdirSync(lock); break; } catch (e) { if (e.code !== 'EEXIST' || Date.now() > deadline) throw new Error('Visualizer launcher busy; preserve its lock.'); await delay(100); } }
  try {
    let running = await info(root);
    if (!running) {
      // A dead recorded owner can be retired; a live or unknown PID is never killed.
      const runtimeFile = store.safe(root, service.RUNTIME, 'file');
      if (fs.existsSync(runtimeFile)) {
        const old = service.runtime(root);
        try { process.kill(old.pid, 0); throw new Error('Visualizer owner is alive but unreachable; inspect before restarting.'); }
        catch (e) { if (e.code !== 'ESRCH') throw e; }
        const owner = store.read(root, store.CACHE + '/server-lock/owner.json');
        if (owner.instanceId !== old.instanceId || owner.pid !== old.pid) throw new Error('Unknown server lock owner.');
        fs.unlinkSync(store.safe(root, store.CACHE + '/server-lock/owner.json', 'file')); fs.rmdirSync(store.safe(root, store.CACHE + '/server-lock', 'dir')); fs.unlinkSync(runtimeFile);
      }
      const instanceId = crypto.randomUUID();
      const child = cp.spawn(process.execPath, [require.resolve('./session-visualizer-server.cjs'), '--background-worker', root, instanceId, options.port || '0'], { detached: true, windowsHide: true, stdio: 'ignore' });
      let spawnError; child.once('error', error => { spawnError = error; }); child.unref();
      const readyDeadline = performance.now() + 10000;
      while (!running && performance.now() < readyDeadline) {
        if (spawnError || fs.existsSync(store.safe(root, store.CACHE + '/failure-' + instanceId + '.json', 'file'))) break;
        await delay(100); running = await info(root);
      }
      if (!running) {
        let reason = 'service-startup-unavailable';
        try { reason = store.read(root, store.CACHE + '/failure-' + instanceId + '.json').reason; } catch {}
        return { status: 'viewer-unavailable', sessionId: session.id, reason, note: 'Nothing was installed; retained state and command behavior are unchanged.' };
      }
    }
    if (running.version !== service.VERSION || running.schemaVersion !== 2) return { status: 'viewer-restart-required', sessionId: session.id,
      reason: 'viewer-source-updated', nextStep: 'Stop the existing viewer, then start again with this session UUID. History is retained; continue task work meanwhile.' };
    let browser = options.noOpen ? 'not-requested' : 'pending';
    if (!options.noOpen) {
      const marker = store.CACHE + '/opened/' + running.instanceId + '-' + session.id + '.json';
      const request = store.CACHE + '/requests/' + crypto.randomUUID() + '.json';
      store.write(root, request, { instanceId: running.instanceId, sessionId: session.id });
      for (let attempt = 0; attempt < 30; attempt++) { if (fs.existsSync(store.safe(root, marker, 'file'))) { browser = store.read(root, marker).status; break; } await delay(100); }
    }
    return { status: 'running', execution: running.execution || 'unknown', pid: running.pid, sessionId: session.id, url: running.url, browser,
      nextStep: 'Continue the task now. Pass this sessionId to run/emit for later activity; do not wait on the server.' };
  } finally { fs.rmdirSync(lock); }
}
async function run(root, options, command) {
  if (!command.length) throw new Error('run requires an executable after --.');
  store.id(options.session);
  const span = store.begin(root, { phase: options.phase || 'work', category: 'command', label: options.label || 'Shell operation' }, options.session);
  // begin uses explicit process context; no argv or output is copied to events.
  const childEnv = { ...process.env, HEPHAERA_SESSION_ID: options.session, HEPHAERA_ACTIVITY_ID: span.activityId || '', HEPHAERA_VISUALIZER_WRAPPED: '1' };
  const msys = process.platform === 'win32' && process.env.HEPHAERA_VISUALIZER_MSYS === '1';
  let executable = command[0], arguments_ = command.slice(1);
  if (msys) {
    for (const [name, prefix] of [['MSYS2_ARG_CONV_EXCL','ARG'], ['MSYS2_ENV_CONV_EXCL','ENV']]) {
      if (process.env['HEPHAERA_VISUALIZER_MSYS_' + prefix + '_SET'] === 'x') childEnv[name] = process.env['HEPHAERA_VISUALIZER_MSYS_' + prefix + '_VALUE'];
      else delete childEnv[name];
    }
    // This Bash exec preserves the original native/MSYS conversion behavior
    // for either kind of target. Command data is argv, never evaluated code.
    executable = process.env.HEPHAERA_VISUALIZER_MSYS_BASH;
    arguments_ = ['-c', 'exec "$@"', 'hephaera-observed', ...command];
    for (const key of Object.keys(childEnv)) if (key === 'HEPHAERA_VISUALIZER_MSYS' || key.startsWith('HEPHAERA_VISUALIZER_MSYS_')) delete childEnv[key];
  }
  // MSYS translates PWD when entering native Node. Let Bash recompute it from
  // cwd rather than propagate C:/ spellings into POSIX path-identity checks.
  if (!msys && process.platform === 'win32' && /(?:^|[\\/])bash(?:\.exe)?$/i.test(command[0])) { delete childEnv.PWD; delete childEnv.OLDPWD; }
  const child = cp.spawn(executable, arguments_, { cwd: process.cwd(), shell: false, windowsHide: true, stdio: 'inherit', env: childEnv });
  let receivedSignal;
  const handlers = new Map(['SIGINT','SIGTERM'].map(signal => [signal, () => { receivedSignal = signal; child.kill(signal); }]));
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const outcome = await new Promise(resolve => { child.once('error', () => resolve({ code: 127, signal: null })); child.once('close', (code, signal) => resolve({ code, signal })); });
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  const signal = receivedSignal || outcome.signal;
  span.finish(signal ? 'cancelled' : outcome.code === 0 ? 'succeeded' : 'failed', outcome.code);
  return { exitCode: outcome.code ?? (signal === 'SIGINT' ? 130 : 143), signal };
}
async function main(values) {
  if (!values.length || values.slice(0, values.indexOf('--') < 0 ? values.length : values.indexOf('--')).includes('--help')) { console.log(HELP); return; }
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js24+ is required; nothing was installed.');
  const { operation, options, command } = parse(values);
  const root = store.rootPath(options.root);
  if (options.session) store.id(options.session);
  if (operation === 'run') {
    // Pass explicit session context without rebinding an inherited parent's identity.
    const result = await run(root, options, command); process.exitCode = result.exitCode;
    if (result.signal && process.platform !== 'win32') { try { process.kill(process.pid, result.signal); } catch {} }
    return;
  }
  let result;
  if (operation === 'start') result = await start(root, options);
  else if (operation === 'emit') {
    const mapping = { label:'label',phase:'phase',category:'category',activity:'activityId',parent:'parentId',action:'action',status:'status',owner:'owner',role:'role',skill:'skill',task:'task',mode:'mode',operation:'operation',blocker:'blocker',evidence:'evidence' };
    const fields = {}; for (const [key, target] of Object.entries(mapping)) if (options[key] !== undefined) fields[target] = options[key];
    result = store.emit(root, options.session, fields);
    result = { recorded: result.recorded, reason: result.reason, activityId: result.event?.activityId, sequence: result.event?.sequence };
  } else if (operation === 'history') result = store.history(root, Number(options.offset || 0), Number(options.limit || 50));
  else if (operation === 'end') result = store.end(root, options.session);
  else if (operation === 'delete') { store.remove(root, options.session); result = { deleted: options.session }; }
  else if (operation === 'stop') {
    const running = await info(root);
    if (!running) result = { status: 'not-running' };
    else {
      store.write(root, store.CACHE + '/stop.json', { instanceId: running.instanceId }, fs.existsSync(store.safe(root, store.CACHE + '/stop.json', 'file')));
      for (let attempt = 0; attempt < 50 && await info(root); attempt++) await delay(100);
      result = { status: await info(root) ? 'stopping' : 'stopped' };
    }
  } else {
    const running = await info(root);
    const recording = options.session ? store.page(root, options.session, 0, 1) : null;
    const latest = recording?.total ? store.page(root, options.session, recording.total - 1, 1).events[0] : null;
    result = { status: running ? 'running' : 'not-running', execution: running ? running.execution || 'unknown' : null, pid: running?.pid, url: running?.url,
      ...(recording ? { recording, activity: { total: recording.total, lastRecordedAt: latest?.at || null, lastRecordedSequence: latest?.sequence || null,
        coverage: 'New activity requires explicit session context on commands or agent reports; server liveness alone does not record work.' } } : {}) };
  }
  console.log(JSON.stringify(result));
}
module.exports = { parse, start, run, main, HELP };
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.code === 'HEPHAERA_PRIVACY_UNAVAILABLE' ? 'Hephaera visualizer unavailable: private cache permissions require the existing Windows PowerShell and writable directory ACLs; nothing was installed.' : 'Hephaera visualizer unavailable: invalid options, prerequisites or retained metadata. Use --help and inspect owned state; nothing was installed or discarded.'); process.exitCode = 1; });
