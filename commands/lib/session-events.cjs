'use strict';

// Passive, project-local metadata. Never read transcripts, tool output or argv.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const transition = require('./state-transition.cjs');
const BASE = path.resolve(__dirname, '../..');
const CACHE = '.hephaera/.cache/visualizer';
const MAX_EVENTS = 100000, MAX_BYTES = 64 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PHASES = ['context', 'planning', 'work', 'verification', 'review'];
const STATUSES = ['running', 'waiting', 'blocked', 'succeeded', 'failed', 'cancelled', 'unknown'];
const CATEGORIES = ['session', 'phase', 'task', 'agent', 'role', 'skill', 'command', 'artifact', 'review', 'branch', 'idea', 'goal', 'gauntlet', 'work-unit', 'round'];
const SOURCES = ['command-observed', 'agent-reported', 'untracked'];
const producerId = crypto.randomUUID();
let producerSequence = 0, warned = false;
const context = new AsyncLocalStorage();
const fail = message => { throw new Error(message); };
const native = value => process.platform === 'win32' ? value.replace(/^\/(?:mnt\/)?([a-zA-Z])\//, (_, d) => d.toUpperCase() + ':/') : value;
function rootPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(native(value))) fail('An explicit resolved project root is required.');
  const root = path.resolve(native(value));
  const owner = path.dirname(BASE);
  if (path.basename(BASE) === '.hephaera' && (process.platform === 'win32' ? owner.toLowerCase() !== root.toLowerCase() : owner !== root)) fail('Explicit root conflicts with the installed .hephaera host.');
  let current = path.parse(root).root;
  for (const part of root.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('Project root must contain only real directories.');
  }
  return root;
}
function safe(root, relative, kind) {
  if (typeof relative !== 'string' || relative.length > 1024 || /[\\\x00-\x1f:]/.test(relative) || relative.startsWith('/') || relative.split('/').some(p => !p || p === '.' || p === '..' || process.platform === 'win32' && (/[. ]$/.test(p) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p)))) fail('Invalid project-relative path.');
  let current = root;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = fs.lstatSync(current); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    if (stat.isSymbolicLink() || (i < parts.length - 1 && !stat.isDirectory())) fail('Linked or invalid visualizer path.');
    if (i === parts.length - 1 && kind && !(kind === 'dir' ? stat.isDirectory() : stat.isFile())) fail('Visualizer path has the wrong type.');
  }
  return current;
}
function directory(root, relative) {
  const full = safe(root, relative, 'dir'); fs.mkdirSync(full, { recursive: true, mode: 0o700 }); safe(root, relative, 'dir'); return full;
}
const privateRoots = new Set();
function privateCache(root) {
  directory(root, CACHE);
  const target = safe(root, CACHE + '/private', 'dir');
  if (privateRoots.has(root)) return target;
  try {
    if (process.platform === 'win32') {
      const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
      require('node:child_process').execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'private-visualizer-cache.ps1'), '-Directory', target], { windowsHide: true, timeout: 30000, stdio: 'ignore' });
    } else { directory(root, CACHE + '/private'); fs.chmodSync(target, 0o700); }
  } catch { const error = new Error('Visualizer cache privacy is unavailable.'); error.code = 'HEPHAERA_PRIVACY_UNAVAILABLE'; throw error; }
  privateRoots.add(root); return target;
}
function read(root, relative, max = 16384) {
  const full = safe(root, relative, 'file');
  const fd = fs.openSync(full, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.size > max) fail('Visualizer metadata must be one bounded, unlinked file.');
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) fail('Visualizer metadata changed.'); offset += count; }
    const after = fs.fstatSync(fd), named = fs.lstatSync(full);
    if (named.isSymbolicLink() || [after, named].some(s => s.nlink !== 1 || s.dev !== before.dev || s.ino !== before.ino || s.size !== before.size || s.mtimeMs !== before.mtimeMs)) fail('Visualizer metadata changed.');
    const text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes)) fail('Visualizer metadata must be UTF-8.');
    return JSON.parse(text);
  } finally { fs.closeSync(fd); }
}
function write(root, relative, value, replace = false) {
  const full = safe(root, relative, 'file'), tempRelative = relative + '.' + crypto.randomUUID() + '.tmp';
  if (fs.existsSync(full) && fs.lstatSync(full).nlink !== 1) fail('Linked visualizer metadata cannot be replaced.');
  const temp = safe(root, tempRelative, 'file');
  fs.writeFileSync(temp, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
  try {
    safe(root, relative, 'file');
    if (replace) fs.renameSync(temp, full);
    else fs.linkSync(temp, full); // Publish complete bytes without replacing a retained event.
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function recoverPublication(root, relative) {
  const full = safe(root, relative, 'file'), retained = fs.lstatSync(full);
  if (retained.nlink === 1) return;
  const folder = relative.slice(0,relative.lastIndexOf('/')), prefix = path.basename(relative) + '.';
  const temporary = fs.readdirSync(safe(root,folder,'dir')).filter(name => name.startsWith(prefix) && name.endsWith('.tmp') && UUID.test(name.slice(prefix.length,-4))).map(name => safe(root,folder+'/'+name,'file')).filter(file => {
    const stat = fs.lstatSync(file); return stat.dev === retained.dev && stat.ino === retained.ino && stat.size === retained.size;
  });
  // A crash between link publication and unlinking its one known temporary
  // name is recoverable. Any extra/foreign link remains an explicit blocker.
  if (retained.nlink !== 2 || temporary.length !== 1) fail('Unknown linked event storage; inspect before recovery.');
  fs.unlinkSync(temporary[0]);
}
function label(value, maximum = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)
    || /-----BEGIN|\bgh[pousr]_[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{16}|\bxox[baprs]-|\b(?:password|secret|api[_-]?key|access[_-]?token)\s*[:=]/i.test(value)) fail('Invalid or sensitive activity label.');
  return value;
}
function id(value) { if (!UUID.test(value || '')) fail('A valid session/activity UUID is required.'); return value; }
function settings(root) {
  const full = safe(root, CACHE + '/config.json', 'file');
  if (!fs.existsSync(full)) return { enabled: true, openBrowser: true };
  const value = read(root, CACHE + '/config.json');
  if (!value || Object.keys(value).some(k => !['enabled', 'openBrowser'].includes(k)) || Object.values(value).some(v => typeof v !== 'boolean')) fail('Invalid visualizer settings.');
  return { enabled: true, openBrowser: true, ...value };
}
function session(root, sessionId) {
  const value = read(root, CACHE + '/sessions/' + id(sessionId) + '/session.json');
  if (Object.keys(value).some(k => !['schemaVersion','id','host','label','createdAt'].includes(k)) || value.schemaVersion !== 1 || value.id !== sessionId || !['codex', 'claude', 'cursor', 'other'].includes(value.host) || !Number.isFinite(Date.parse(value.createdAt))) fail('Invalid session record.');
  label(value.label);
  return value;
}
function withLock(root, relative, action) {
  const full = safe(root, relative, 'dir'), deadline = performance.now() + 3000;
  while (true) {
    try { fs.mkdirSync(full, { mode: 0o700 }); break; }
    catch (e) {
      // NTFS can report access/busy while another producer's removed lock
      // directory is still delete-pending. Acquire only after mkdir succeeds.
      if (e.code !== 'EEXIST' && !(process.platform === 'win32' && ['EPERM','EACCES','EBUSY'].includes(e.code))) throw e;
      if (performance.now() >= deadline) fail('Visualizer writer busy or unavailable; retain storage for inspection.');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try { return action(); } finally { fs.rmdirSync(full); }
}
function createSession(root, { sessionId = crypto.randomUUID(), host = 'other', title = 'Hephaera session' } = {}) {
  root = rootPath(root); transition.assertBootstrapAllowed(root); privateCache(root);
  id(sessionId); label(title);
  if (!['codex', 'claude', 'cursor', 'other'].includes(host)) fail('Unknown coding host.');
  directory(root, CACHE + '/sessions');
  return withLock(root, CACHE + '/session-lock', () => {
    const base = CACHE + '/sessions/' + sessionId;
    if (fs.existsSync(safe(root, base + '/session.json', 'file'))) { const existing = session(root, sessionId); if (fs.existsSync(safe(root, base + '/ended.json', 'file'))) fail('Session has ended; start a new session.'); return existing; }
    directory(root, base + '/events');
    const value = { schemaVersion: 1, id: sessionId, host, label: title, createdAt: new Date().toISOString() };
    write(root, base + '/budget.json', { count: 0, bytes: 0, capped: false });
    write(root, base + '/session.json', value);
    return value;
  });
}
function validateEvent(root, event) {
  const keys = ['schemaVersion','id','sessionId','sequence','producerId','producerSequence','at','activityId','parentId','phase','category','action','status','source','label','owner','role','skill','task','mode','operation','blocker','durationMs','exitCode','evidence'];
  if (!event || Object.keys(event).some(k => !keys.includes(k)) || event.schemaVersion !== 1) fail('Invalid activity event.');
  for (const k of ['id','sessionId','producerId','activityId']) id(event[k]);
  label(event.label);
  if (event.parentId !== null) id(event.parentId);
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1 || event.sequence > MAX_EVENTS || !Number.isSafeInteger(event.producerSequence) || event.producerSequence < 1 || !Number.isFinite(Date.parse(event.at))) fail('Invalid activity ordering.');
  if (!PHASES.includes(event.phase) || !CATEGORIES.includes(event.category) || !['started','updated','finished'].includes(event.action) || !STATUSES.includes(event.status) || !SOURCES.includes(event.source)) fail('Invalid activity classification.');
  for (const key of ['label','owner','role','skill','task','operation','blocker']) if (event[key] !== undefined) label(event[key]);
  if (event.mode !== undefined && !['brainstorm','task','goal','gauntlet'].includes(event.mode)) fail('Invalid work mode.');
  if (event.durationMs !== undefined && (!Number.isFinite(event.durationMs) || event.durationMs < 0 || event.durationMs > 31536000000)) fail('Invalid duration.');
  if (event.exitCode !== undefined && event.exitCode !== null && (!Number.isInteger(event.exitCode) || event.exitCode < -2147483648 || event.exitCode > 4294967295)) fail('Invalid exit code.');
  if (!Array.isArray(event.evidence) || event.evidence.length > 8) fail('Invalid evidence references.');
  for (const ref of event.evidence) { const full = safe(root, ref); if (fs.existsSync(full) && fs.lstatSync(full).isFile() && fs.lstatSync(full).nlink !== 1) fail('Linked evidence reference.'); }
  return event;
}
function budget(root, base) {
  const value = read(root, base + '/budget.json');
  if (Object.keys(value).some(k => !['count','bytes','capped'].includes(k)) || !Number.isSafeInteger(value.count) || value.count < 0 || value.count > MAX_EVENTS || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > MAX_BYTES || typeof value.capped !== 'boolean') fail('Invalid recording budget.');
  return value;
}
function emit(root, sessionId, fields) {
  root = rootPath(root); session(root, sessionId);
  if (!fields || Object.keys(fields).some(key => ['schemaVersion','id','sessionId','sequence','producerId','producerSequence','at'].includes(key))) fail('Event envelope identities are assigned by the recorder.');
  if (!settings(root).enabled) return { recorded: false, reason: 'disabled' };
  const base = CACHE + '/sessions/' + sessionId;
  return withLock(root, base + '/writer-lock', () => {
    if (fs.existsSync(safe(root, base + '/ended.json', 'file'))) fail('Cannot append to an ended session.');
    let state = budget(root, base);
    // If publication succeeded but the budget rename was interrupted, retain
    // and account for that exact event instead of overwriting or skipping it.
    while (state.count < MAX_EVENTS) {
      const orphan = base + '/events/' + String(state.count + 1).padStart(6, '0') + '.json';
      if (!fs.existsSync(safe(root, orphan, 'file'))) break;
      recoverPublication(root, orphan);
      const retained = validateEvent(root, read(root, orphan));
      if (retained.sequence !== state.count + 1 || retained.sessionId !== sessionId) fail('Unreconciled event ownership.');
      const bytes = fs.statSync(safe(root, orphan, 'file')).size;
      if (state.bytes + bytes > MAX_BYTES) fail('Retained event exceeds recording capacity.');
      state = { count: retained.sequence, bytes: state.bytes + bytes, capped: false };
      write(root, base + '/budget.json', state, true);
    }
    if (state.capped || state.count >= MAX_EVENTS) {
      write(root, base + '/budget.json', { ...state, capped: true }, true);
      return { recorded: false, reason: 'capacity' };
    }
    const event = validateEvent(root, { schemaVersion: 1, id: crypto.randomUUID(), sessionId, sequence: state.count + 1,
      producerId, producerSequence: ++producerSequence, at: new Date().toISOString(), activityId: crypto.randomUUID(), parentId: null,
      phase: 'work', category: 'command', action: 'updated', status: 'running', source: 'agent-reported', evidence: [], ...fields });
    const bytes = Buffer.byteLength(JSON.stringify(event) + '\n');
    if (bytes > 16384) fail('Activity metadata exceeds its serialized byte bound.');
    if (state.capped || state.count >= MAX_EVENTS || state.bytes + bytes > MAX_BYTES) {
      write(root, base + '/budget.json', { ...state, capped: true }, true);
      return { recorded: false, reason: 'capacity' };
    }
    write(root, base + '/events/' + String(event.sequence).padStart(6, '0') + '.json', event);
    write(root, base + '/budget.json', { count: event.sequence, bytes: state.bytes + bytes, capped: false }, true);
    return { recorded: true, event };
  });
}
function page(root, sessionId, after = 0, limit = 200) {
  session(root, sessionId);
  if (!Number.isSafeInteger(after) || after < 0 || after > MAX_EVENTS || !Number.isInteger(limit) || limit < 1 || limit > 500) fail('Invalid event page.');
  const base = CACHE + '/sessions/' + sessionId, state = budget(root, base), events = [];
  if (after > state.count) fail('Cursor exceeds recorded events.');
  for (let sequence = after + 1; sequence <= Math.min(state.count, after + limit); sequence++) {
    const event = validateEvent(root, read(root, base + '/events/' + String(sequence).padStart(6, '0') + '.json'));
    if (event.sequence !== sequence || event.sessionId !== sessionId) fail('Activity event belongs to a different session or sequence.');
    events.push(event);
  }
  const endedPath = base + '/ended.json';
  const ended = fs.existsSync(safe(root, endedPath, 'file')) ? read(root, endedPath, 1024) : null;
  if (ended && (Object.keys(ended).some(k => !['at','reason'].includes(k)) || ended.reason !== 'explicit-end' || !Number.isFinite(Date.parse(ended.at)))) fail('Invalid explicit session ending.');
  return { session: session(root, sessionId), events, cursor: events.at(-1)?.sequence ?? after, total: state.count, capped: state.capped, ended,
    coverage: { commands: 'instrumented boundaries only', conversation: 'agent-reported', hostTools: 'untracked unless reported', modelInternals: 'untracked' } };
}
function history(root, offset = 0, limit = 50) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('Invalid history page.');
  const folder = safe(root, CACHE + '/sessions', 'dir');
  if (!fs.existsSync(folder)) return { sessions: [], total: 0 };
  const names = fs.readdirSync(folder).filter(n => UUID.test(n));
  const ordered = names.map(n => session(root, n)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { sessions: ordered.slice(offset, offset + limit).map(s => { const p = page(root, s.id, 0, 1); return { ...p.session, ended: p.ended, total: p.total, capped: p.capped }; }), total: names.length };
}
function end(root, sessionId) {
  session(root, sessionId); const base = CACHE + '/sessions/' + sessionId;
  return withLock(root, base + '/writer-lock', () => {
    const file = base + '/ended.json';
    if (!fs.existsSync(safe(root, file, 'file'))) write(root, file, { at: new Date().toISOString(), reason: 'explicit-end' });
    return read(root, file);
  });
}
function remove(root, sessionId) {
  session(root, sessionId);
  const base = CACHE + '/sessions/' + sessionId;
  if (!fs.existsSync(safe(root, base + '/ended.json', 'file'))) fail('Only explicitly ended sessions can be deleted.');
  if (fs.existsSync(safe(root, base + '/writer-lock', 'dir'))) fail('A writer lock is present; do not delete it.');
  // Validate the entire narrowly owned tree before removing anything.
  const folder = safe(root, base, 'dir'), files = [];
  for (const name of fs.readdirSync(folder)) {
    if (['session.json','budget.json','ended.json'].includes(name)) files.push(safe(root, base + '/' + name, 'file'));
    else if (name === 'events') for (const child of fs.readdirSync(safe(root, base + '/events', 'dir'))) {
      if (!/^\d{6}\.json$/.test(child)) fail('Unexpected retained event file; inspect before deleting.');
      files.push(safe(root, base + '/events/' + child, 'file'));
    } else fail('Unexpected retained session content; inspect before deleting.');
  }
  if (files.some(file => fs.lstatSync(file).nlink !== 1)) fail('Linked retained metadata; inspect before deleting.');
  for (const file of files) fs.unlinkSync(file);
  fs.rmdirSync(safe(root, base + '/events', 'dir')); fs.rmdirSync(folder);
}
function warn() { if (!warned) { warned = true; process.stderr.write('Hephaera visualizer: activity recording unavailable; command behavior is unchanged.\n'); } }
function begin(root, fields, explicitSession) {
  const active = context.getStore(), sessionId = explicitSession || active?.sessionId || process.env.HEPHAERA_SESSION_ID;
  if (!sessionId) return { finish() {}, activityId: null };
  const activityId = crypto.randomUUID(), started = performance.now();
  const parentId = active?.sessionId === sessionId ? active.activityId : process.env.HEPHAERA_SESSION_ID === sessionId ? process.env.HEPHAERA_ACTIVITY_ID || null : null;
  const common = { ...fields, activityId, parentId, source: 'command-observed' };
  const record = data => { try { const result = emit(root, sessionId, { ...common, ...data }); if (!result.recorded && result.reason !== 'disabled') warn(); } catch { warn(); } };
  record({ action: 'started', status: 'running' });
  let finished = false;
  return { activityId, sessionId, finish(status = 'succeeded', exitCode) { if (finished) return; finished = true; record({ action: 'finished', status, durationMs: performance.now() - started, ...(exitCode !== undefined ? { exitCode } : {}) }); } };
}
async function observe(root, fields, action, outcome) {
  const span = begin(root, fields);
  const finish = fallback => {
    let result;
    try { result = outcome?.(fallback); } catch { warn(); }
    span.finish(result?.status || fallback, result?.exitCode);
  };
  return context.run(span, async () => { try { const value = await action(); finish('succeeded'); return value; } catch (error) { finish(error.name === 'AbortError' ? 'cancelled' : 'failed'); throw error; } });
}
module.exports = { CACHE, MAX_EVENTS, MAX_BYTES, UUID, PHASES, STATUSES, CATEGORIES, SOURCES, native, rootPath, safe, directory, privateCache, read, write, label, id, settings, createSession, session, emit, page, history, end, remove, begin, observe };
