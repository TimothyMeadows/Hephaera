'use strict';

// Host-owned, append-only lifecycle. Bubo alone interprets package/resource
// semantics. These filesystem guards are cooperative, not an OS sandbox.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const runtime = require('./bubo-runtime.cjs');
const native = require('./bubo-vfx-adapter.cjs');
const transport = require('./bubo-host-adapter.cjs');
const maintenance = require('./installation-maintenance.cjs');
const transition = require('./state-transition.cjs');
const CACHE = '.hephaera/.cache/tasks', SHA = /^[a-f0-9]{64}$/;
const MAX_JSON = 8 * 1024 * 1024, MAX_FILE = 512 * 1024 * 1024, MAX_EVENTS = 4096;
const MAX_LOCK = 4096;
const BUDGETS = Object.freeze({ timeoutSeconds: 60, maxLogBytes: 1048576 });
const FLAGS = {
  init: ['root', 'task', 'asset', 'version', 'creator', 'brief', 'rights', 'parent-manifest', 'provenance'],
  stage: ['root', 'manifest', 'phase', 'package', 'visual'],
  record: ['root', 'manifest', 'phase', 'reviewer', 'evidence'],
  validate: ['root', 'manifest'], inspect: ['root', 'manifest'], status: ['root', 'manifest'], recover: ['root', 'manifest'], doctor: ['root']
};
const fail = message => { throw new Error(message); };
const encode = value => JSON.stringify(value, null, 2) + '\n';
const canonical = value => JSON.stringify(runtime.canonical(value));
const equal = (a, b) => canonical(a) === canonical(b);
const digest = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
function text(value, label, maximum = 256) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > maximum || /[\x00-\x1f]/.test(value)) fail('Invalid ' + label + '.');
  return value;
}
function relative(value, label = 'Path') {
  text(value, label, 4096);
  if (path.isAbsolute(value) || value.includes('\\') || /[:<>"|?*]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..'
    || part.toLowerCase() === '.git' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)))
    fail(label + ' must be a portable canonical project-relative path.');
  return value;
}
function id(value, label) {
  text(value, label, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)) fail('Invalid ' + label + ' identity.');
  relative(value, label); return value;
}
function shape(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !equal(Object.keys(value).sort(), [...fields].sort())) fail('Invalid ' + label + ' fields.');
  return value;
}
function list(value, label, maximum = 128, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail('Invalid bounded ' + label + '.');
  return value;
}
function rootPath(value) {
  if (typeof value !== 'string' || !value) fail('Explicit resolved --root is required.');
  const converted = runtime.native(value); runtime.syntax(converted);
  if (!path.isAbsolute(converted)) fail('Project root must be absolute.');
  const root = path.resolve(converted); runtime.components(root);
  if (!fs.statSync(root).isDirectory()) fail('Project root must be a real directory.');
  // An installed baseline has exactly one host parent. Source checkouts can
  // use their own root or an explicit development fixture root.
  const base = runtime.BASE;
  if (path.basename(base).toLowerCase() === '.hephaera') {
    if (!runtime.samePath(root, path.dirname(base))) fail('Explicit root conflicts with the installed .hephaera host.');
  } else if (!runtime.samePath(root, base)) {
    if (!process.env.HEPHAERA_PROJECT_ROOT || !runtime.samePath(root, path.resolve(runtime.native(process.env.HEPHAERA_PROJECT_ROOT))))
      fail('A maintainer fixture requires an explicit matching HEPHAERA_PROJECT_ROOT.');
  }
  return root;
}
function full(root, name) {
  const normalized = relative(name), result = runtime.projectPath(root, normalized); let current = root;
  for (const part of normalized.split('/')) {
    if (!fs.existsSync(current)) break;
    const matches = fs.readdirSync(current).filter(entry => entry.toLowerCase() === part.toLowerCase());
    if (!matches.length) break;
    if (matches.length !== 1 || matches[0] !== part) fail('VFX path contains a case alias/collision: ' + name);
    current = path.join(current, part);
  }
  return result;
}
function statFile(root, name, maximum = MAX_FILE) {
  const file = full(root, name), stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maximum) fail('A bounded nonempty regular file is required: ' + name);
  return { file, stat };
}
function ref(root, value, maximum = MAX_FILE) {
  const name = typeof value === 'string' ? value : shape(value, ['path', 'sha256'], 'file reference').path;
  const { file, stat } = statFile(root, name, maximum), fd = fs.openSync(file, 'r');
  const hash = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(65536); let bytes = 0;
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.size !== stat.size) fail('Referenced file changed before hashing.');
    let count;
    while ((count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, maximum + 1 - bytes), null))) {
      bytes += count; if (bytes > maximum) fail('Referenced file exceeded its finite byte budget.'); hash.update(buffer.subarray(0, count));
    }
    const after = fs.fstatSync(fd);
    if (bytes !== stat.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) fail('Referenced file changed while hashing.');
  } finally { fs.closeSync(fd); }
  const result = { path: name, sha256: hash.digest('hex') };
  if (typeof value !== 'string' && (!SHA.test(value.sha256 || '') || !equal(value, result))) fail('Referenced bytes changed: ' + name);
  // Recheck path ownership after reading, including cooperative link swaps.
  const after = statFile(root, name, maximum).stat;
  if (after.size !== bytes || after.dev !== stat.dev || after.ino !== stat.ino || after.mtimeMs !== stat.mtimeMs) fail('Referenced path changed while hashing.');
  return result;
}

// Reject duplicate keys and malformed UTF-8 before JSON.parse can erase them.
function read(root, name, expected) {
  const { file } = statFile(root, name, MAX_JSON), bytes = fs.readFileSync(file);
  return documentBytes(bytes, name, expected);
}
function documentBytes(bytes, name, expected) {
  if (bytes.length > MAX_JSON || (expected && crypto.createHash('sha256').update(bytes).digest('hex') !== expected)) fail('Retained JSON changed: ' + name);
  const source = bytes.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(bytes)) fail('JSON must use valid UTF-8.');
  const tokens = /\s*("(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:])/y;
  let offset = 0;
  function next() { tokens.lastIndex = offset; const found = tokens.exec(source); if (!found) fail('Invalid lifecycle JSON.'); offset = tokens.lastIndex; return found[1]; }
  function visit(depth, token = next()) {
    if (depth > 64) fail('Lifecycle JSON nesting bound exceeded.');
    if (token === '{') {
      const keys = new Set(); let key = next(); if (key === '}') return;
      while (true) {
        if (!key.startsWith('"')) fail('Invalid JSON key.');
        const decoded = JSON.parse(key); if (keys.has(decoded)) fail('Duplicate lifecycle JSON key: ' + decoded); keys.add(decoded);
        if (next() !== ':') fail('Invalid JSON object.'); visit(depth + 1);
        const end = next(); if (end === '}') return; if (end !== ',') fail('Invalid JSON object.'); key = next();
      }
    }
    if (token === '[') {
      let entry = next(); if (entry === ']') return;
      while (true) { visit(depth + 1, entry); const end = next(); if (end === ']') return; if (end !== ',') fail('Invalid JSON array.'); entry = next(); }
    }
    if ('{}[],:'.includes(token)) fail('Invalid JSON value.');
  }
  visit(0); if (source.slice(offset).trim()) fail('Trailing lifecycle JSON content.');
  const result = JSON.parse(source);
  if (!result || typeof result !== 'object' || Array.isArray(result)) fail('Lifecycle document must be an object.');
  return result;
}
function put(root, name, value) {
  const file = full(root, name), bytes = Buffer.from(encode(value));
  if (bytes.length > MAX_JSON) fail('Lifecycle record exceeds its bound.');
  fs.mkdirSync(path.dirname(file), { recursive: true }); runtime.components(file);
  const fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return ref(root, name, MAX_JSON);
}
function copy(root, source, destination, expected, maximum = MAX_FILE, deadline = Infinity) {
  const initial = statFile(root, source, maximum), target = full(root, destination);
  if (expected.bytes !== undefined && initial.stat.size !== expected.bytes) fail('Source byte count changed before staging.');
  if (!SHA.test(expected.sha256 || '')) fail('Copy requires an observed SHA-256.');
  fs.mkdirSync(path.dirname(target), { recursive: true }); runtime.components(target);
  const input = fs.openSync(initial.file, 'r'); let output;
  try {
    if (!fs.fstatSync(input).isFile()) fail('Copy source must remain a regular file.');
    output = fs.openSync(target, 'wx');
    const hash = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(65536); let bytes = 0, count;
    while ((count = fs.readSync(input, buffer, 0, Math.min(buffer.length, maximum + 1 - bytes), null))) {
      if (Date.now() > deadline) fail('VFX staging processing budget exhausted; partial attempt retained.');
      bytes += count; if (bytes > maximum || (expected.bytes !== undefined && bytes > expected.bytes)) fail('Staging copy exceeded observed byte bound.');
      hash.update(buffer.subarray(0, count)); let offset = 0;
      while (offset < count) offset += fs.writeSync(output, buffer, offset, count - offset);
    }
    if ((expected.bytes !== undefined && bytes !== expected.bytes) || hash.digest('hex') !== expected.sha256) fail('Source bytes changed during staging copy.');
    fs.fsyncSync(output);
  } finally { if (output !== undefined) fs.closeSync(output); fs.closeSync(input); }
  const result = ref(root, destination, maximum);
  if (result.sha256 !== expected.sha256) fail('Copied bytes do not match native observations.');
  ref(root, { path: source, sha256: expected.sha256 }, maximum);
  return result;
}
function paths(task, asset, version) {
  id(task, 'task'); id(asset, 'asset'); id(version, 'version');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task)) fail('Task must use its canonical lowercase kebab-case identity.');
  const assetDirectory = `${CACHE}/${task}/vfx/${asset}`;
  return { assetDirectory, directory: `${assetDirectory}/${version}`, manifest: `${assetDirectory}/${version}/manifest.json`,
    staging: `.art-staging/tasks/${task}/vfx/${asset}/${version}` };
}
async function lock(root, directory, action) {
  const folder = full(root, directory); fs.mkdirSync(folder, { recursive: true }); runtime.components(folder);
  const marker = directory + '/.recovery-lock';
  requireNoRecoveryClaim(root, directory);
  if (fs.existsSync(full(root, marker))) fail('VFX asset recovery is already owned; writers must preserve its marker.');
  const name = directory + '/.write-lock'; let owned;
  try { owned = createOwnership(root, name, { pid: process.pid, startedAt: new Date().toISOString() }); }
  catch (error) { if (error.code === 'EEXIST') fail('VFX asset write is already owned; inspect the retained lock before recovery.'); throw error; }
  try {
    requireNoRecoveryClaim(root, directory);
    if (fs.existsSync(full(root, marker))) fail('VFX recovery began while acquiring ownership; writer stopped before mutation.');
    return await action();
  } finally { removeOwned(root, name, owned); }
}
function lockMetadata(stat) {
  return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, birthtimeMs: stat.birthtimeMs };
}
function ownershipBytes(root, name) {
  const { file, stat } = statFile(root, name, MAX_LOCK), fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(MAX_LOCK + 1); let length = 0;
  try {
    const opened = fs.fstatSync(fd);
    if (!equal(lockMetadata(opened), lockMetadata(stat))) fail('Ownership metadata changed before inspection.');
    let count;
    while (length < buffer.length && (count = fs.readSync(fd, buffer, length, buffer.length - length, null))) length += count;
    if (length < 1 || length > MAX_LOCK || !equal(lockMetadata(fs.fstatSync(fd)), lockMetadata(stat))) fail('Ownership bytes/metadata changed during inspection.');
  } finally { fs.closeSync(fd); }
  const after = statFile(root, name, MAX_LOCK).stat;
  if (length !== stat.size || !equal(lockMetadata(after), lockMetadata(stat))) fail('Ownership path identity changed during inspection.');
  const bytes = buffer.subarray(0, length);
  return { path: name, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes, metadata: lockMetadata(stat) };
}
function createOwnership(root, name, value) {
  const file = full(root, name), fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, encode(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return ownershipBytes(root, name);
}
function exactOwnership(root, name, expected) {
  const actual = ownershipBytes(root, name);
  if (actual.sha256 !== expected.sha256 || !actual.bytes.equals(expected.bytes) || !equal(actual.metadata, expected.metadata))
    fail('Ownership changed; a different owner or altered lock will never be removed.');
  return actual;
}
function removeOwned(root, name, expected) {
  exactOwnership(root, name, expected); fs.unlinkSync(full(root, name));
}
function ownerProbe(pid) {
  try { process.kill(pid, 0); return { state: 'active', proof: 'signal-zero-live' }; }
  catch (error) {
    if (error.code === 'ESRCH') return { state: 'abandoned', proof: 'ESRCH' };
    return { state: 'unverified', proof: error.code || 'unknown-process-probe-error' };
  }
}
function ownershipEntry(root, name, recovery = false) {
  try {
    const file = full(root, name);
    try { fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return { path: name, state: 'absent' }; throw error; }
    const observed = ownershipBytes(root, name), value = documentBytes(observed.bytes, name);
    shape(value, recovery ? ['schemaVersion', 'pid', 'startedAt', 'token'] : ['pid', 'startedAt'], recovery ? 'recovery ownership' : 'write ownership');
    if (!Number.isSafeInteger(value.pid) || value.pid < 1 || value.pid > 2147483647 || typeof value.startedAt !== 'string'
      || Number.isNaN(Date.parse(value.startedAt)) || new Date(value.startedAt).toISOString() !== value.startedAt
      || (recovery && (value.schemaVersion !== 'hephaera-vfx-recovery-lock/v1' || !/^[a-f0-9-]{36}$/.test(value.token || ''))))
      fail('Malformed ownership PID/time/identity; owner death is unverified.');
    return { ...observed, ownerPid: value.pid, startedAt: value.startedAt, ...ownerProbe(value.pid) };
  } catch (error) { return { path: name, state: 'unverified', reason: String(error.message).slice(0, 1024) }; }
}
function publicOwnership(value) {
  const { bytes, ...safe } = value; return safe;
}
function recoveryClaims(root, directory) {
  const scope = directory + '/.recovery-claims', folder = full(root, scope), claims = []; let temporary = 0;
  if (!fs.existsSync(folder)) return { scope, claims, latest: null, temporary };
  if (!fs.statSync(folder).isDirectory()) fail('Recovery claims must be a guarded directory.');
  const names = fs.readdirSync(folder).sort();
  if (names.length > 16384) fail('Recovery claim inventory exceeds its finite bound.');
  for (const name of names) {
    if (/^pending-[a-f0-9-]{36}$/.test(name)) { temporary++; continue; }
    const ordinal = /^claim-(\d{6})$/.exec(name);
    if (!ordinal || Number(ordinal[1]) !== claims.length + 1) fail('Recovery claim history has a gap or unexpected entry.');
    const claimDirectory = scope + '/' + name, file = claimDirectory + '/intent.json';
    const identity = ref(root, file, MAX_LOCK), value = read(root, file, identity.sha256);
    shape(value, ['schemaVersion', 'sequence', 'pid', 'nonce', 'previousSha256', 'manifest', 'createdAt'], 'recovery claim intent');
    if (value.schemaVersion !== 'hephaera-vfx-recovery-claim/v1' || value.sequence !== claims.length + 1
      || !Number.isSafeInteger(value.pid) || value.pid < 1 || value.pid > 2147483647 || !/^[a-f0-9-]{36}$/.test(value.nonce || '')
      || value.previousSha256 !== (claims.at(-1)?.identity.sha256 || null) || typeof value.createdAt !== 'string'
      || Number.isNaN(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt) fail('Recovery claim owner/ancestry is malformed.');
    shape(value.manifest, ['path', 'sha256'], 'recovery claim manifest'); relative(value.manifest.path);
    const version = path.posix.basename(path.posix.dirname(value.manifest.path)); id(version, 'claim version');
    if (value.manifest.path !== directory + '/' + version + '/manifest.json' || !SHA.test(value.manifest.sha256 || '')) fail('Recovery claim manifest ownership differs.');
    ref(root, value.manifest, MAX_JSON);
    const claim = { directory: claimDirectory, identity, value, prepared: null, release: null, completion: null };
    if (fs.existsSync(full(root, claimDirectory + '/prepared.json'))) {
      claim.prepared = ref(root, claimDirectory + '/prepared.json', MAX_JSON);
      const prepared = read(root, claim.prepared.path, claim.prepared.sha256);
      shape(prepared, ['schemaVersion', 'intent', 'recovery', 'createdAt'], 'prepared recovery claim');
      if (prepared.schemaVersion !== 'hephaera-vfx-recovery-prepared/v1' || !equal(prepared.intent, identity)) fail('Prepared recovery claim changed its intent.');
      const report = ref(root, prepared.recovery, MAX_JSON), reportValue = read(root, report.path, report.sha256);
      if (!equal(reportValue.claim, identity)) fail('Prepared recovery report differs from its exclusive claim.');
      claim.preparedValue = prepared;
    }
    if (fs.existsSync(full(root, claimDirectory + '/writer-released.json'))) {
      claim.release = ref(root, claimDirectory + '/writer-released.json', MAX_JSON);
      const release = read(root, claim.release.path, claim.release.sha256);
      shape(release, ['schemaVersion', 'intent', 'recovery', 'removedHere', 'confirmedAbsent', 'recordedAt'], 'recovery writer release');
      if (release.schemaVersion !== 'hephaera-vfx-recovery-release/v1' || !equal(release.intent, identity) || !claim.preparedValue
        || !equal(release.recovery, claim.preparedValue.recovery) || release.confirmedAbsent !== true || typeof release.removedHere !== 'boolean') fail('Recovery writer release differs from its prepared intent.');
    }
    if (fs.existsSync(full(root, claimDirectory + '/completed.json'))) {
      claim.completion = ref(root, claimDirectory + '/completed.json', MAX_JSON);
      const completion = read(root, claim.completion.path, claim.completion.sha256);
      shape(completion, ['schemaVersion', 'intent', 'status', 'recovery', 'completion', 'reason', 'createdAt'], 'recovery claim completion');
      if (completion.schemaVersion !== 'hephaera-vfx-recovery-claim-completed/v1' || !equal(completion.intent, identity)
        || !['succeeded', 'refused'].includes(completion.status)) fail('Recovery claim completion changed its intent/status.');
      if (completion.status === 'succeeded') {
        if (!claim.preparedValue || !claim.release || !equal(completion.recovery, claim.preparedValue.recovery)) fail('A successful claim must bind its prepared recovery and writer release.');
        const report = ref(root, completion.recovery, MAX_JSON), reportValue = read(root, report.path, report.sha256);
        const finished = ref(root, completion.completion, MAX_JSON), finishedValue = read(root, finished.path, finished.sha256);
        if (finished.path !== path.posix.dirname(report.path) + '/completed.json' || finishedValue.schemaVersion !== 'hephaera-vfx-recovery-completed/v1'
          || !equal(finishedValue.recovery, report) || !equal(finishedValue.archivedLock, reportValue.archivedLock)) fail('Recovery claim completion differs from its actual release/archive receipt.');
      } else if (completion.recovery !== null || completion.completion !== null || claim.prepared) fail('A refused claim cannot certify recovery.');
      claim.completionValue = completion;
    }
    claims.push(claim);
  }
  return { scope, claims, latest: claims.at(-1) || null, temporary };
}
function claimOwnership(root, directory) {
  try {
    const inventory = recoveryClaims(root, directory), claim = inventory.latest;
    if (!claim) return { state: 'absent', temporaryClaims: inventory.temporary };
    const observed = claim.completion ? { state: 'completed', proof: 'immutable-completion' } : ownerProbe(claim.value.pid);
    return { ...observed, sequence: claim.value.sequence, ownerPid: claim.value.pid, intent: claim.identity, prepared: claim.prepared,
      completion: claim.completion, writerRelease: claim.release, result: claim.completionValue?.status || null, temporaryClaims: inventory.temporary,
      receiptState: claim.completion ? 'completed' : claim.release ? 'writer-released' : claim.prepared ? 'prepared' : 'intent-only' };
  } catch (error) { return { state: 'unverified', reason: String(error.message).slice(0, 1024) }; }
}
function requireNoRecoveryClaim(root, directory) {
  const claim = claimOwnership(root, directory);
  if (!['absent', 'completed'].includes(claim.state)) fail('VFX recovery claim is ' + claim.state + '; recover its retained ownership before writing.');
}
function acquireRecoveryClaim(state) {
  const inventory = recoveryClaims(state.root, state.assetDirectory), prior = inventory.latest;
  if (prior && !prior.completion && ownerProbe(prior.value.pid).state !== 'abandoned') fail('VFX asset recovery is already owned or unverified; only ESRCH-dead claims may be followed.');
  const sequence = inventory.claims.length + 1;
  if (sequence > 8192) fail('Recovery claim budget exhausted; preserve its history.');
  const nonce = crypto.randomUUID(), pending = inventory.scope + '/pending-' + nonce;
  const folder = full(state.root, pending); fs.mkdirSync(path.dirname(folder), { recursive: true }); runtime.components(folder); fs.mkdirSync(folder);
  put(state.root, pending + '/intent.json', { schemaVersion: 'hephaera-vfx-recovery-claim/v1', sequence, pid: process.pid, nonce,
    previousSha256: prior?.identity.sha256 || null, manifest: state.identity, createdAt: new Date().toISOString() });
  const target = inventory.scope + '/claim-' + String(sequence).padStart(6, '0'), destination = full(state.root, target);
  // A committed claim is always nonempty. Atomic directory rename therefore
  // cannot replace a winner on Windows or POSIX. Losing pending intents stay.
  if (fs.existsSync(destination)) fail('A competing recovery committed this ordinal; retained pending intent was not adopted.');
  try { fs.renameSync(folder, destination); }
  catch (error) { if (['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code)) fail('A competing recovery claimed this ordinal; retained pending intent was not adopted.'); throw error; }
  const acquired = recoveryClaims(state.root, state.assetDirectory).latest;
  if (acquired.value.nonce !== nonce) fail('Recovery claim ownership changed.');
  return { ...acquired, predecessors: inventory.claims };
}
function requireClaim(state, claim) {
  const actual = recoveryClaims(state.root, state.assetDirectory).latest;
  if (!actual || !equal(actual.identity, claim.identity) || actual.value.nonce !== claim.value.nonce || actual.completion) fail('Recovery claim is no longer the exclusive current intent.');
}
function finishClaim(state, claim, status, recovery, completion, reason) {
  requireClaim(state, claim);
  return put(state.root, claim.directory + '/completed.json', { schemaVersion: 'hephaera-vfx-recovery-claim-completed/v1', intent: claim.identity,
    status, recovery, completion, reason, createdAt: new Date().toISOString() });
}
function ownership(state) {
  const writer = ownershipEntry(state.root, state.assetDirectory + '/.write-lock');
  const recovery = ownershipEntry(state.root, state.assetDirectory + '/.recovery-lock', true);
  const claim = claimOwnership(state.root, state.assetDirectory);
  const selected = !['absent', 'completed'].includes(claim.state) ? claim : recovery.state !== 'absent' ? recovery : writer;
  if (claim.receiptState === 'prepared' && writer.state === 'absent') claim.receiptState = 'prepared-writer-absent';
  return { state: selected.state === 'absent' ? 'available' : selected.state, writeLock: publicOwnership(writer), recovery: publicOwnership(recovery), claim,
    writable: writer.state === 'absent' && recovery.state === 'absent' && ['absent', 'completed'].includes(claim.state),
    childCleanup: 'unverified-no-tracked-child-identities', processTermination: false };
}
function references(root, values, label) {
  const result = list(values, label).map(value => ref(root, value));
  if (new Set(result.map(value => value.path.toLowerCase())).size !== result.length) fail('Duplicate or case-alias ' + label + '.');
  return result;
}
function brief(root, value) {
  shape(value, ['schemaVersion', 'intent', 'coverage', 'bindings', 'presentation', 'budgets', 'accessibility', 'targets'], 'VFX brief');
  if (value.schemaVersion !== 'hephaera-vfx-brief/v1') fail('Unsupported VFX brief schema.');
  text(value.intent, 'brief intent', 8192);
  list(value.coverage, 'coverage', 128, 1).forEach(item => id(item, 'coverage'));
  if (new Set(value.coverage).size !== value.coverage.length) fail('Coverage IDs must be unique.');
  list(value.bindings, 'bindings').forEach(item => {
    shape(item, ['kind', 'path', 'sha256'], 'VFX binding');
    if (!['model', 'rig', 'clip', 'marker', 'transform'].includes(item.kind)) fail('Unsupported VFX binding kind.');
    ref(root, { path: item.path, sha256: item.sha256 });
  });
  if (new Set(value.bindings.map(item => item.kind + ':' + item.path)).size !== value.bindings.length) fail('Duplicate VFX binding.');
  shape(value.presentation, ['camera', 'viewDistanceMetres', 'modelRelativeSize', 'attachments', 'events', 'occupiedRegions', 'clearRegions', 'blendingRequirements'], 'VFX presentation');
  text(value.presentation.camera, 'presentation camera');
  const positive = (number, label, maximum = 1e12) => {
    if (!Number.isFinite(number) || number <= 0 || number > maximum) fail('Invalid finite positive ' + label + '.');
  };
  positive(value.presentation.viewDistanceMetres, 'view distance'); positive(value.presentation.modelRelativeSize, 'relative size');
  for (const key of ['attachments', 'events', 'occupiedRegions', 'clearRegions', 'blendingRequirements'])
    list(value.presentation[key], key).forEach(item => text(item, key));
  shape(value.budgets, ['maxParticles', 'maxSystems', 'maxTrailPoints', 'maxVertices', 'maxDrawCalls', 'maxLights', 'maxTextureBytes', 'maxOutputBytes',
    'maxDurationSeconds', 'maxConcurrency', 'maxProcessingSeconds', 'maxCandidates', 'maxRevisions'], 'VFX budgets');
  for (const [key, number] of Object.entries(value.budgets)) {
    if (['maxDurationSeconds', 'maxProcessingSeconds'].includes(key)) { positive(number, key, 3600); continue; }
    if (!Number.isSafeInteger(number) || number < (['maxLights', 'maxTrailPoints', 'maxRevisions'].includes(key) ? 0 : 1)
      || number > (key.endsWith('Bytes') ? 1024 * 1024 * 1024 : 10000000)) fail('Invalid finite integer budget ' + key + '.');
  }
  if (value.budgets.maxCandidates > 4096 || value.budgets.maxRevisions > 128 || value.budgets.maxConcurrency > 128) fail('Lifecycle budget exceeds supported bounds.');
  shape(value.accessibility, ['qualityVariants', 'reducedMotion', 'reducedFlash', 'contrast', 'colorIndependent'], 'VFX accessibility');
  list(value.accessibility.qualityVariants, 'quality variants', 32, 1).forEach(item => text(item, 'quality variant'));
  for (const key of ['reducedMotion', 'reducedFlash', 'contrast', 'colorIndependent']) text(value.accessibility[key], key, 4096);
  list(value.targets, 'targets', 32, 1).forEach(item => {
    shape(item, ['id', 'description', 'frameBudgetMs', 'memoryBudgetBytes'], 'VFX target');
    id(item.id, 'target'); text(item.description, 'target description', 4096); positive(item.frameBudgetMs, 'target frame budget');
    if (!Number.isSafeInteger(item.memoryBudgetBytes) || item.memoryBudgetBytes < 1 || item.memoryBudgetBytes > 1024 * 1024 * 1024 * 1024) fail('Invalid finite target memory budget.');
  });
  if (new Set(value.targets.map(item => item.id)).size !== value.targets.length) fail('Duplicate VFX target.');
  return value;
}
function rights(root, value) {
  shape(value, ['schemaVersion', 'origin', 'holder', 'permission', 'inputs', 'media'], 'VFX rights');
  if (value.schemaVersion !== 'hephaera-vfx-rights/v1' || !['owned', 'licensed', 'generated'].includes(value.origin)) fail('Unsupported VFX rights origin/schema.');
  text(value.holder, 'rights holder'); ref(root, value.permission, MAX_JSON); references(root, value.inputs, 'rights inputs');
  if (value.origin !== 'generated') { if (value.media !== null) fail('Only declared generated inputs may reference MEDIA.'); return value; }
  shape(value.media, ['contract', 'sourceManifest', 'permissionManifest'], 'generated VFX media');
  const contract = ref(root, value.media.contract, MAX_JSON), source = ref(root, value.media.sourceManifest, MAX_JSON), permission = ref(root, value.media.permissionManifest, MAX_JSON);
  if (contract.path !== 'MEDIA.md') fail('Generated inputs require the actual project MEDIA.md.');
  read(root, source.path, source.sha256); read(root, permission.path, permission.sha256);
  transport.policyCommand('validate-media-contract.sh', [full(root, contract.path)], root, false);
  transport.policyCommand('validate-media-generation-manifest.sh', ['--project-root', root, full(root, source.path)], root, false);
  // The shared validators do not establish an image receipt's complete origin
  // and permission ancestry for this VFX schema. Do not manufacture admission.
  fail('Generated VFX receipt admission is unavailable in this lifecycle version; shared MEDIA validation does not prove the required origin/permission chain. No approvals or attempts were created or reset.');
}
function provenance(root, value) {
  shape(value, ['schemaVersion', 'sources', 'notes'], 'VFX provenance');
  if (value.schemaVersion !== 'hephaera-vfx-provenance/v1') fail('Unsupported VFX provenance schema.');
  references(root, value.sources, 'provenance sources'); text(value.notes, 'provenance notes', 8192); return value;
}
function visual(root, value, coverage) {
  shape(value, ['schemaVersion', 'environment', 'artifacts'], 'VFX visual packet');
  if (value.schemaVersion !== 'hephaera-vfx-visual/v1') fail('Unsupported VFX visual schema.');
  shape(value.environment, ['backend', 'driver', 'renderer', 'dependencies', 'scene', 'camera', 'settings'], 'VFX capture environment');
  for (const key of ['backend', 'driver', 'renderer']) text(value.environment[key], 'capture ' + key);
  const dependencyRoles = new Set(), dependencyIdentities = new Set();
  list(value.environment.dependencies, 'capture dependencies', 128, 3).forEach(item => {
    shape(item, ['role', 'path', 'sha256'], 'capture dependency');
    if (!['backend', 'driver', 'renderer'].includes(item.role)) fail('Unsupported capture dependency role.');
    ref(root, { path: item.path, sha256: item.sha256 }); dependencyRoles.add(item.role);
    const key = item.role + ':' + item.path.toLowerCase(); if (dependencyIdentities.has(key)) fail('Duplicate capture dependency identity.'); dependencyIdentities.add(key);
  });
  if (dependencyRoles.size !== 3) fail('Capture evidence must bind actual backend, driver and renderer dependency files.');
  for (const key of ['scene', 'camera', 'settings']) ref(root, value.environment[key], MAX_JSON);
  const observed = new Set(), names = new Set();
  list(value.artifacts, 'visual artifacts', 128, 1).forEach(item => {
    shape(item, ['path', 'sha256', 'coverage'], 'visual artifact');
    ref(root, { path: item.path, sha256: item.sha256 });
    if (!/\.(png|jpg|jpeg|webp|gif|mp4|webm)$/i.test(item.path)) fail('Visual artifacts require an explicit supported image/video file extension.');
    if (names.has(item.path.toLowerCase())) fail('Duplicate visual artifact.'); names.add(item.path.toLowerCase());
    list(item.coverage, 'artifact coverage', 128, 1).forEach(item => { if (!coverage.includes(item)) fail('Visual artifact has undeclared coverage.'); observed.add(item); });
  });
  if (!equal([...observed].sort(), [...coverage].sort())) fail('Visual packet must cover the complete declared brief.');
  return value;
}
function sourceReferences(asset, values) {
  const result = [asset.taskFile, asset.inputs.brief.source, asset.inputs.rights.source,
    ...(asset.inputs.provenance ? [asset.inputs.provenance.source] : []),
    ...values.brief.bindings.map(item => ({ path: item.path, sha256: item.sha256 })),
    values.rights.permission, ...values.rights.inputs, ...(values.provenance?.sources || []),
    ...(asset.parent ? [asset.parent] : [])];
  return [...new Map(result.map(item => [item.path, item])).values()];
}
function metadataReferences(state) {
  return [{ ...state.identity, kind: 'input' },
    ...Object.entries(state.asset.inputs).filter(([, item]) => item).flatMap(([key, item]) =>
      [item.source, item.snapshot].map(reference => ({ ...reference, kind: key === 'rights' ? 'rights' : 'input' })))];
}
function assetVersions(root, assetDirectory) {
  const folder = full(root, assetDirectory); if (!fs.existsSync(folder)) return [];
  const entries = fs.readdirSync(folder, { withFileTypes: true }).filter(item => !['.write-lock', '.recovery-lock', '.recovery-claims', '.recoveries', '.budget.json', '.history'].includes(item.name));
  if (entries.length > 129) fail('VFX revision inventory exceeds its finite bound.');
  return entries.map(entry => {
    id(entry.name, 'version'); if (!entry.isDirectory()) fail('Unexpected VFX asset state entry.');
    const directory = assetDirectory + '/' + entry.name, file = full(root, directory + '/manifest.json');
    runtime.components(file);
    return { directory, state: fs.existsSync(file) ? load({ root, manifest: directory + '/manifest.json' }) : null };
  });
}
function budgetLedger(root, owned, expected) {
  const identity = ref(root, expected || owned.assetDirectory + '/.budget.json', MAX_JSON), value = read(root, identity.path, identity.sha256);
  shape(value, ['schemaVersion', 'task', 'asset', 'originalVersion', 'originalBrief', 'maxCandidates', 'maxRevisions', 'createdAt'], 'VFX asset budget');
  if (value.schemaVersion !== 'hephaera-vfx-budget/v1' || identity.path !== owned.assetDirectory + '/.budget.json'
    || paths(value.task, value.asset, value.originalVersion).assetDirectory !== owned.assetDirectory
    || !Number.isSafeInteger(value.maxCandidates) || value.maxCandidates < 1 || value.maxCandidates > 4096
    || !Number.isSafeInteger(value.maxRevisions) || value.maxRevisions < 0 || value.maxRevisions > 128) fail('Asset budget ownership/limits differ.');
  shape(value.originalBrief, ['path', 'sha256'], 'original brief identity'); relative(value.originalBrief.path);
  if (!SHA.test(value.originalBrief.sha256 || '')) fail('Original brief identity lacks an exact hash.');
  const directory = owned.assetDirectory + '/.history', folder = full(root, directory), events = [], identities = [];
  if (fs.existsSync(folder)) {
    if (!fs.statSync(folder).isDirectory()) fail('Asset budget history must be a directory.');
    const names = fs.readdirSync(folder).sort(); if (names.length > 8192) fail('Asset budget history exceeds its bound.');
    for (const [index, name] of names.entries()) {
      if (name !== String(index + 1).padStart(6, '0') + '.json') fail('Asset budget history is incomplete; preserve retained state.');
      const item = ref(root, directory + '/' + name, MAX_JSON), event = read(root, item.path, item.sha256);
      shape(event, ['schemaVersion', 'sequence', 'budgetSha256', 'previousSha256', 'kind', 'data', 'recordedAt'], 'VFX budget reservation');
      if (event.schemaVersion !== 'hephaera-vfx-reservation/v1' || event.sequence !== index + 1 || event.budgetSha256 !== identity.sha256
        || event.previousSha256 !== (identities.at(-1)?.sha256 || null) || !['version-reserved', 'attempt-reserved'].includes(event.kind)) fail('Asset budget reservation ancestry changed.');
      id(event.data.version, 'reserved version'); events.push(event); identities.push(item);
    }
  }
  return { root, owned, identity, value, directory, events, identities };
}
function reserve(ledger, kind, data) {
  const sequence = ledger.events.length + 1;
  const event = { schemaVersion: 'hephaera-vfx-reservation/v1', sequence, budgetSha256: ledger.identity.sha256,
    previousSha256: ledger.identities.at(-1)?.sha256 || null, kind, data, recordedAt: new Date().toISOString() };
  const identity = put(ledger.root, ledger.directory + '/' + String(sequence).padStart(6, '0') + '.json', event);
  ledger.events.push(event); ledger.identities.push(identity); return event;
}
function lineageBudgets(state, inputs) {
  const versions = assetVersions(state.root, state.assetDirectory), roots = versions.filter(item => item.state && item.state.asset.parent === null);
  if (roots.length !== 1) fail('VFX asset must retain exactly one original version.');
  const ledger = budgetLedger(state.root, state, state.asset.budget), original = ledger.value;
  const originalSnapshot = ref(state.root, roots[0].state.asset.inputs.brief.snapshot, MAX_JSON);
  const originalBrief = read(state.root, originalSnapshot.path, originalSnapshot.sha256);
  if (!equal(roots[0].state.asset.inputs.brief.source, original.originalBrief) || originalSnapshot.sha256 !== original.originalBrief.sha256
    || originalBrief.budgets?.maxCandidates !== original.maxCandidates || originalBrief.budgets?.maxRevisions !== original.maxRevisions)
    fail('Original immutable brief and asset budget ledger differ.');
  const reservations = ledger.events.filter(event => event.kind === 'version-reserved');
  if (!reservations.some(event => event.data.version === state.asset.version) || reservations[0]?.data.version !== original.originalVersion
    || new Set(reservations.map(event => event.data.version)).size !== reservations.length) fail('VFX version lacks its unique immutable budget reservation.');
  for (const item of versions.filter(item => item.state)) if (!equal(item.state.asset.budget, ledger.identity)
    || !reservations.some(event => event.data.version === item.state.asset.version)) fail('VFX version was transplanted outside its original budget history.');
  for (const item of versions.filter(item => item.state)) {
    const reservation = reservations.find(event => event.data.version === item.state.asset.version);
    if (!equal(reservation.data.parent, item.state.asset.parent) || !equal(reservation.data.brief, item.state.asset.inputs.brief.source))
      fail('VFX version changed its reserved ancestry/brief identity.');
  }
  if (inputs.brief.budgets.maxCandidates > original.maxCandidates || inputs.brief.budgets.maxRevisions > original.maxRevisions)
    fail('A revision cannot reset or increase its original candidate/revision budget.');
  if (reservations.length - 1 > Math.min(original.maxRevisions, inputs.brief.budgets.maxRevisions)) fail('Retained revisions exceed the declared revision policy.');
  return { versions, original, ledger, revisions: reservations.length - 1, attempts: ledger.events.filter(event => event.kind === 'attempt-reserved').length };
}
function append(state, kind, data) {
  if (state.events.length >= MAX_EVENTS) fail('VFX event budget exhausted; preserve current history.');
  const sequence = state.events.length + 1;
  const event = { schemaVersion: 'hephaera-vfx-event/v1', sequence, manifestSha256: state.identity.sha256,
    previousSha256: state.eventRefs.at(-1)?.sha256 || null, kind, data, recordedAt: new Date().toISOString() };
  const identity = put(state.root, state.directory + '/events/' + String(sequence).padStart(6, '0') + '.json', event);
  state.events.push(event); state.eventRefs.push(identity); return event;
}
function load(options) {
  const root = rootPath(options.root), identity = ref(root, options.manifest, MAX_JSON), asset = read(root, identity.path, identity.sha256);
  shape(asset, ['schemaVersion', 'task', 'asset', 'version', 'creator', 'taskFile', 'inputs', 'parent', 'budget', 'policy', 'staging', 'createdAt'], 'VFX manifest');
  if (asset.schemaVersion !== 'hephaera-vfx-asset/v1') fail('Unsupported VFX manifest schema.');
  const owned = paths(asset.task, asset.asset, asset.version);
  if (owned.manifest !== identity.path || owned.staging !== asset.staging) fail('VFX manifest path/identity ownership differs.');
  text(asset.creator, 'creator');
  shape(asset.inputs, ['brief', 'rights', 'provenance'], 'VFX manifest inputs');
  for (const [key, entry] of Object.entries(asset.inputs)) {
    if (key === 'provenance' && entry === null) continue;
    shape(entry, ['source', 'snapshot'], 'retained ' + key);
    if (entry.snapshot.path !== owned.directory + '/inputs/' + key + '.json') fail('VFX immutable input ownership differs.');
  }
  if (asset.taskFile.path !== `${CACHE}/${asset.task}/TASK.md`) fail('VFX task ownership differs.');
  if (asset.parent !== null) {
    const prior = shape(asset.parent, ['path', 'sha256'], 'VFX parent');
    if (!SHA.test(prior.sha256) || !prior.path.startsWith(owned.assetDirectory + '/') || prior.path === identity.path
      || prior.path.split('/').length !== owned.manifest.split('/').length || !prior.path.endsWith('/manifest.json')) fail('VFX revision parent ownership differs.');
  }
  const events = [], eventRefs = [], eventsPath = full(root, owned.directory + '/events');
  if (fs.existsSync(eventsPath)) {
    if (!fs.statSync(eventsPath).isDirectory()) fail('VFX events must be a directory.');
    const names = fs.readdirSync(eventsPath).sort(); if (names.length > MAX_EVENTS) fail('VFX event bound exceeded.');
    for (const [index, name] of names.entries()) {
      if (name !== String(index + 1).padStart(6, '0') + '.json') fail('Unexpected/incomplete VFX event chain; preserve partial state.');
      const identity = ref(root, owned.directory + '/events/' + name, MAX_JSON), event = read(root, identity.path, identity.sha256);
      shape(event, ['schemaVersion', 'sequence', 'manifestSha256', 'previousSha256', 'kind', 'data', 'recordedAt'], 'VFX event');
      if (event.schemaVersion !== 'hephaera-vfx-event/v1' || event.sequence !== index + 1 || event.manifestSha256 !== ref(root, options.manifest, MAX_JSON).sha256
        || event.previousSha256 !== (eventRefs.at(-1)?.sha256 || null)
        || !['stage-started', 'stage-failed', 'stage-interrupted', 'lock-recovery-prepared', 'lock-recovered', 'stage-sealed', 'review'].includes(event.kind)) fail('VFX event ancestry differs.');
      events.push(event); eventRefs.push(identity);
    }
  }
  return { root, identity, asset, ...owned, events, eventRefs };
}
function latest(state, kind, phase) { return [...state.events].reverse().find(event => event.kind === kind && (!phase || event.data.phase === phase)); }
function values(state) {
  const result = {};
  for (const [key, entry] of Object.entries(state.asset.inputs)) {
    if (entry === null) { result[key] = null; continue; }
    const snapshot = ref(state.root, entry.snapshot, MAX_JSON); ref(state.root, entry.source, MAX_JSON);
    if (snapshot.sha256 !== entry.source.sha256) fail('VFX immutable input differs from its source.');
    result[key] = read(state.root, snapshot.path, snapshot.sha256);
  }
  brief(state.root, result.brief); rights(state.root, result.rights); if (result.provenance) provenance(state.root, result.provenance);
  return result;
}
function retained(state) {
  // A correction preserves immutable ancestry without inheriting acceptance.
  // External sources, policy and native builds may be exactly what needs repair.
  const result = {};
  for (const [key, entry] of Object.entries(state.asset.inputs)) {
    if (entry === null) { result[key] = null; continue; }
    shape(entry.source, ['path', 'sha256'], 'retained original identity'); relative(entry.source.path);
    const snapshot = ref(state.root, entry.snapshot, MAX_JSON);
    if (snapshot.sha256 !== entry.source.sha256) fail('Retained immutable snapshot differs from its original identity.');
    result[key] = read(state.root, snapshot.path, snapshot.sha256);
  }
  // load() already verified all event file hashes and their chain. These
  // immutable packet copies remain evidence even when external captures drift.
  for (const event of state.events.filter(item => item.kind === 'stage-sealed')) {
    const identity = ref(state.root, event.data.reviewPacket, MAX_JSON), packet = read(state.root, identity.path, identity.sha256);
    if (event.data.phaseDigest !== digest(packet) || packet.manifestSha256 !== state.identity.sha256) fail('Retained phase packet changed.');
    for (const copy of packet.copies) ref(state.root, copy);
  }
  recoveryEvidence(state);
  if (state.asset.parent) ref(state.root, state.asset.parent, MAX_JSON);
  lineageBudgets(state, result); return result;
}
function recoveryEvidence(state) {
  for (const event of state.events.filter(item => ['stage-interrupted', 'lock-recovery-prepared', 'lock-recovered'].includes(item.kind))) {
    const checked = verifiedRecoveryReport(state, event.data.recovery), report = checked.identity, archived = checked.archivedLock;
    if (!equal(event.data.archivedLock, archived)) fail('Recovery audit/archive ownership differs.');
    if (event.kind === 'lock-recovered') {
      const identity = ref(state.root, event.data.completion, MAX_JSON), completion = read(state.root, identity.path, identity.sha256);
      if (identity.path !== path.posix.dirname(report.path) + '/completed.json' || completion.schemaVersion !== 'hephaera-vfx-recovery-completed/v1'
        || !equal(completion.recovery, report) || !equal(completion.archivedLock, archived)) fail('Recovery completion lost its exact prepared audit/archive binding.');
    }
  }
}
function verifiedRecoveryReport(state, reference) {
  const identity = ref(state.root, reference, MAX_JSON), value = read(state.root, identity.path, identity.sha256);
  if (!identity.path.startsWith(state.assetDirectory + '/.recoveries/recovery-') || !identity.path.endsWith('/recovery.json')
    || !['hephaera-vfx-recovery/v1', 'hephaera-vfx-recovery/v2'].includes(value.schemaVersion) || !equal(value.budget, state.asset.budget))
    fail('Recovery report lost its exact asset/budget binding.');
  const archivedLock = value.archivedLock === null ? null : ref(state.root, value.archivedLock, MAX_LOCK);
  const archivedMarker = value.archivedMarker === null ? null : ref(state.root, value.archivedMarker, MAX_LOCK);
  if ((archivedLock === null || archivedMarker === null) && value.schemaVersion === 'hephaera-vfx-recovery/v1') fail('Legacy recovery archives must be complete.');
  if (value.schemaVersion === 'hephaera-vfx-recovery/v2') {
    const intent = ref(state.root, value.claim, MAX_LOCK);
    const relativeClaim = intent.path.slice((state.assetDirectory + '/.recovery-claims/').length), ordinal = /^claim-(\d{6})\/intent\.json$/.exec(relativeClaim);
    const intentValue = read(state.root, intent.path, intent.sha256);
    if (!intent.path.startsWith(state.assetDirectory + '/.recovery-claims/') || !ordinal || intentValue.schemaVersion !== 'hephaera-vfx-recovery-claim/v1'
      || intentValue.sequence !== Number(ordinal[1]) || !equal(intentValue.manifest, value.manifest)) fail('Recovery report claim ownership differs.');
    if (value.previousRecovery !== null) ref(state.root, value.previousRecovery, MAX_JSON);
  }
  for (const [reference, name] of [[archivedLock, 'write-lock.json'], [archivedMarker, 'recovery-marker.json']])
    if (reference && (path.posix.dirname(reference.path) !== path.posix.dirname(identity.path) || path.posix.basename(reference.path) !== name)) fail('Recovery archive path ownership differs.');
  if (archivedLock) {
    const original = documentBytes(ownershipBytes(state.root, archivedLock.path).bytes, archivedLock.path);
    shape(original, ['pid', 'startedAt'], 'archived write owner');
    if (!Number.isSafeInteger(original.pid) || original.pid < 1 || original.pid > 2147483647 || value.owner?.ownerPid !== original.pid
      || value.owner.startedAt !== original.startedAt || value.owner.sha256 !== archivedLock.sha256 || value.owner.proof !== 'ESRCH'
      || value.owner.path !== state.assetDirectory + '/.write-lock') fail('Archived owner proof differs from its exact bytes.');
  } else if (value.owner !== null) fail('A marker/claim-only recovery cannot invent a write owner.');
  return { identity, value, archivedLock, archivedMarker };
}
function previousRecovery(state, claim, legacy) {
  for (const prior of [...claim.predecessors].reverse()) {
    if (prior.completionValue?.status === 'succeeded') break;
    if (prior.preparedValue) return verifiedRecoveryReport(state, prior.preparedValue.recovery);
  }
  // Legacy static-marker recovery wrote the prepared audit before unlink.
  // Its exact archived marker binds a post-unlink takeover to that operation.
  if (legacy.state === 'abandoned') {
    for (const version of assetVersions(state.root, state.assetDirectory).filter(item => item.state).map(item => item.state)) {
      for (const event of [...version.events].reverse().filter(item => item.kind === 'lock-recovery-prepared')) {
        const checked = verifiedRecoveryReport(state, event.data.recovery);
        if (checked.archivedMarker?.sha256 === legacy.sha256) return checked;
      }
    }
  }
  return null;
}
function stageFiles(state, event) {
  const packetRef = ref(state.root, event.data.reviewPacket, MAX_JSON), packet = read(state.root, packetRef.path, packetRef.sha256);
  if (packetRef.path !== event.data.attempt + '/review-packet.json' || !event.data.attempt.startsWith(state.staging + '/attempts/' + event.data.phase + '-')
    || event.data.phaseDigest !== digest(packet) || packet.manifestSha256 !== state.identity.sha256 || packet.phase !== event.data.phase)
    fail('VFX phase packet ownership/digest differs.');
  for (const item of [...packet.sources, ...packet.copies]) ref(state.root, item);
  if (packet.visual !== null) visual(state.root, packet.visual, packet.coverage);
  return packet;
}
function current(state) {
  transition.assertProductionAllowed(state.root, 'VFX lifecycle freshness');
  const inputs = values(state), policy = native.snapshot(state.root);
  if (!equal(policy, state.asset.policy)) fail('VFX policy changed; initialize a new version with retained ancestry.');
  for (const item of sourceReferences(state.asset, inputs)) ref(state.root, item);
  lineageBudgets(state, inputs);
  recoveryEvidence(state);
  if (state.asset.parent) {
    const parent = read(state.root, state.asset.parent.path, state.asset.parent.sha256);
    if (parent.task !== state.asset.task || parent.asset !== state.asset.asset || parent.version === state.asset.version) fail('Revision parent task/asset differs.');
  }
  const stages = state.events.filter(event => event.kind === 'stage-sealed');
  let build = null;
  if (stages.length) {
    const info = runtime.verified();
    build = { revision: info.pinned.revision, buildSha256: crypto.createHash('sha256').update(JSON.stringify(info.capability.build)).digest('hex'),
      resourceCatalogSha256: info.pinned.resourceCatalogSha256 };
  }
  for (const event of stages) {
    const packet = stageFiles(state, event);
    if (!equal(packet.runtime, build)) fail('Native VFX build/catalog changed; sealed visual evidence is stale.');
  }
  for (const event of state.events.filter(event => event.kind === 'review')) {
    ref(state.root, event.data.evidence, MAX_JSON); ref(state.root, event.data.sourceEvidence, MAX_JSON);
    const stage = stages.find(stage => stage.data.phase === event.data.phase && stage.data.reviewPacket.sha256 === event.data.reviewPacketSha256);
    if (!stage) fail('Review has no exact sealed phase.');
  }
  return { inputs, policy };
}
function accepted(state, phase) {
  const stage = latest(state, 'stage-sealed', phase), review = latest(state, 'review', phase);
  return !!(stage && review && review.data.verdict === 'accepted' && review.data.reviewPacketSha256 === stage.data.reviewPacket.sha256);
}
function readiness() {
  return { processingAvailable: false, renderingAvailable: false, promotionAvailable: false, mediaGenerationAvailable: false,
    runtimeAcceptanceAvailable: false, humanRuntimeAcceptance: false };
}
function phaseAttempts(state, ledger) {
  const attempts = new Map(), finished = new Set(state.events.filter(event => ['stage-sealed', 'stage-failed', 'stage-interrupted'].includes(event.kind)).map(event => event.data.attempt));
  for (const [index, event] of ledger.events.entries()) {
    if (event.kind !== 'attempt-reserved' || event.data.version !== state.asset.version) continue;
    const data = event.data;
    if (!['provisional', 'detailed'].includes(data.phase) || typeof data.attempt !== 'string'
      || !data.attempt.startsWith(state.staging + '/attempts/' + data.phase + '-') || !equal(data.manifest, state.identity)) fail('Attempt reservation ownership differs.');
    relative(data.attempt, 'Reserved attempt');
    if (attempts.has(data.attempt)) fail('Attempt reservation was repeated.');
    attempts.set(data.attempt, { phase: data.phase, attempt: data.attempt, reservation: ledger.identities[index], started: null, finished: finished.has(data.attempt) });
  }
  for (const [index, event] of state.events.entries()) {
    if (event.kind !== 'stage-started') continue;
    const reserved = attempts.get(event.data.attempt);
    if (!reserved || reserved.phase !== event.data.phase || reserved.started !== null) fail('Stage start lacks its unique immutable budget reservation.');
    reserved.started = state.eventRefs[index];
  }
  return [...attempts.values()];
}
function status(options) {
  const state = load(options), stale = [];
  try { current(state); } catch (error) { stale.push(error.message); }
  let attempts = [];
  try { attempts = phaseAttempts(state, budgetLedger(state.root, state, state.asset.budget)); }
  catch (error) { stale.push(error.message); }
  const owner = ownership(state);
  const phases = Object.fromEntries(['provisional', 'detailed'].map(phase => {
    const stage = latest(state, 'stage-sealed', phase), review = latest(state, 'review', phase);
    const reserved = attempts.filter(item => item.phase === phase), incomplete = reserved.filter(item => !item.finished);
    return [phase, { staged: !!stage, review: review?.data.verdict || 'pending', accepted: stale.length === 0 && incomplete.length === 0 && accepted(state, phase),
      visualEvidence: stage ? (stage.data.visualAvailable ? 'supplied-external' : 'unavailable') : 'unavailable', reviewPacket: stage?.data.reviewPacket || null,
      attempts: reserved.length, incompleteAttempts: incomplete.map(item => item.attempt),
      reservationOnlyAttempts: incomplete.filter(item => item.started === null).map(item => item.attempt),
      interruptedAttempts: state.events.filter(event => event.kind === 'stage-interrupted' && event.data.phase === phase).map(event => event.data.attempt) }];
  }));
  return { schemaVersion: 'hephaera-vfx-status/v1', manifest: state.identity.path, manifestSha256: state.identity.sha256,
    task: state.asset.task, asset: state.asset.asset, version: state.asset.version, creator: state.asset.creator,
    fresh: stale.length === 0, stale, phases, ownership: owner, readiness: readiness(), humanRuntimeAcceptance: false, promotionAvailable: false };
}
async function recover(options) {
  const initial = load(options); transition.assertProductionAllowed(initial.root, 'VFX abandoned ownership recovery');
  return maintenance.run(initial.root, async () => {
    const claim = acquireRecoveryClaim(initial); let workStarted = false;
    try {
      const state = load(options), retainedInputs = retained(state), lineage = lineageBudgets(state, retainedInputs);
      const writerName = state.assetDirectory + '/.write-lock', writer = ownershipEntry(state.root, writerName);
      const markerName = state.assetDirectory + '/.recovery-lock', marker = ownershipEntry(state.root, markerName, true);
      if (!['absent', 'abandoned'].includes(writer.state)) fail('Recovery requires a proven dead write owner (ESRCH); ownership is ' + writer.state + (writer.reason ? ': ' + writer.reason : '.'));
      if (!['absent', 'abandoned'].includes(marker.state)) fail('Legacy recovery marker is live or unverified; only ESRCH proves its owner dead.');
      const versions = lineage.versions.filter(item => item.state).map(item => item.state), pending = [];
      for (const version of versions) {
        retained(version);
        for (const attempt of phaseAttempts(version, lineage.ledger).filter(item => !item.finished)) pending.push({ state: version, ...attempt });
      }
      const previous = previousRecovery(state, claim, marker);
      let owner = writer.state === 'abandoned' ? publicOwnership(writer) : previous?.value.owner || null;
      if (owner && ownerProbe(owner.ownerPid).state !== 'abandoned') fail('The archived write owner is not proven dead (ESRCH); takeover refused.');
      if (writer.state === 'absent' && !previous && marker.state === 'absent' && claim.predecessors.at(-1)?.completion)
        fail('No abandoned writer, marker or unfinished recovery is available.');
      if (writer.state === 'absent' && !previous && marker.state === 'absent' && claim.predecessors.length === 0)
        fail('No abandoned writer or unfinished recovery is available.');
      if (!owner && pending.length) fail('Incomplete stage ownership has no retained dead writer proof; no attempt will be relabeled.');
      // No native child PID is persisted by the current read-only inspection
      // transport. Host-owner death never certifies unrecorded child cleanup.
      const known = [];
      if (owner) known.push({ role: 'host-lock-owner', pid: owner.ownerPid, state: 'dead', proof: 'ESRCH' });
      if (marker.state === 'abandoned') known.push({ role: 'legacy-recovery-owner', pid: marker.ownerPid, state: 'dead', proof: 'ESRCH' });
      const priorClaim = claim.predecessors.at(-1);
      if (priorClaim && !priorClaim.completion) known.push({ role: 'recovery-claim-owner', pid: priorClaim.value.pid, state: 'dead', proof: 'ESRCH' });
      const processes = { known,
        childCleanup: 'unverified-no-tracked-child-identities', processTermination: false };
      workStarted = true; requireClaim(state, claim);
      const archive = state.assetDirectory + '/.recoveries/recovery-' + crypto.randomUUID(), archiveFull = full(state.root, archive);
      fs.mkdirSync(path.dirname(archiveFull), { recursive: true }); runtime.components(archiveFull); fs.mkdirSync(archiveFull);
      let archivedLock = null, archivedMarker = null;
      if (writer.state === 'abandoned') archivedLock = copy(state.root, writerName, archive + '/write-lock.json', { sha256: writer.sha256, bytes: writer.bytes.length }, MAX_LOCK);
      else if (previous?.archivedLock) archivedLock = copy(state.root, previous.archivedLock.path, archive + '/write-lock.json', previous.archivedLock, MAX_LOCK);
      if (marker.state === 'abandoned') archivedMarker = copy(state.root, markerName, archive + '/recovery-marker.json', { sha256: marker.sha256, bytes: marker.bytes.length }, MAX_LOCK);
      else if (previous?.archivedMarker) archivedMarker = copy(state.root, previous.archivedMarker.path, archive + '/recovery-marker.json', previous.archivedMarker, MAX_LOCK);
      const report = put(state.root, archive + '/recovery.json', { schemaVersion: 'hephaera-vfx-recovery/v2', manifest: state.identity, budget: lineage.ledger.identity,
        claim: claim.identity, previousRecovery: previous?.identity || null, writerPresentAtPreparation: writer.state !== 'absent',
        archivedLock, archivedMarker, owner, processes,
        interruptedAttempts: pending.map(item => ({ manifest: item.state.identity, phase: item.phase, attempt: item.attempt, reservation: item.reservation, started: item.started })),
        countersReset: false, copiesRemoved: false, acceptanceInherited: false, preparedAt: new Date().toISOString() });
      put(state.root, claim.directory + '/prepared.json', { schemaVersion: 'hephaera-vfx-recovery-prepared/v1', intent: claim.identity, recovery: report, createdAt: new Date().toISOString() });
      requireClaim(state, claim);
      for (const item of pending) append(item.state, 'stage-interrupted', { phase: item.phase, attempt: item.attempt,
        reservation: item.reservation, started: item.started, recovery: report, archivedLock, reason: 'Write owner is proven dead (ESRCH); incomplete attempt remains retained.',
        processes, humanRuntimeAcceptance: false });
      // The requested version always receives the audit, including a lock
      // abandoned outside a stage or immediately before stage-started.
      const audited = load(options); append(audited, 'lock-recovery-prepared', { recovery: report, archivedLock, ownerPid: owner?.ownerPid || null, ownerDeath: owner ? 'ESRCH' : 'no-write-owner', processes });
      requireClaim(state, claim);
      if (writer.state === 'abandoned') {
        exactOwnership(state.root, writerName, writer);
        if (ownerProbe(writer.ownerPid).state !== 'abandoned') fail('Owner death changed before release; retained lock will not be removed.');
        removeOwned(state.root, writerName, writer);
      } else if (ownershipEntry(state.root, writerName).state !== 'absent') fail('A new write owner appeared; it will never be removed.');
      put(state.root, claim.directory + '/writer-released.json', { schemaVersion: 'hephaera-vfx-recovery-release/v1', intent: claim.identity, recovery: report,
        removedHere: writer.state === 'abandoned', confirmedAbsent: true, recordedAt: new Date().toISOString() });
      if (marker.state === 'abandoned') {
        requireClaim(state, claim); exactOwnership(state.root, markerName, marker);
        if (ownerProbe(marker.ownerPid).state !== 'abandoned') fail('Legacy recovery marker owner is no longer proven dead.');
        removeOwned(state.root, markerName, marker);
      } else if (ownershipEntry(state.root, markerName, true).state !== 'absent') fail('A new static recovery owner appeared; it will never be removed.');
      const completion = put(state.root, archive + '/completed.json', { schemaVersion: 'hephaera-vfx-recovery-completed/v1', recovery: report,
        archivedLock, removedOwnerPid: owner?.ownerPid || null, interruptedAttempts: pending.map(item => item.attempt), countersReset: false,
        copiesRemoved: false, processes, completedAt: new Date().toISOString() });
      append(audited, 'lock-recovered', { recovery: report, completion, archivedLock, ownerPid: owner?.ownerPid || null, ownerDeath: owner ? 'ESRCH' : 'no-write-owner', processes });
      const claimCompletion = finishClaim(state, claim, 'succeeded', report, completion, 'Recovery completed; all prior claims and artifacts remain retained.');
      return { schemaVersion: 'hephaera-vfx-recover/v1', manifest: state.identity.path, recovered: true, archive, recovery: report, completion,
        claim: claim.identity, claimCompletion, resumed: previous !== null || !!priorClaim && !priorClaim.completion,
        interruptedAttempts: pending.map(item => item.attempt), processes, readiness: readiness(), humanRuntimeAcceptance: false, promotionAvailable: false };
    } catch (error) {
      // Precondition refusals release only this immutable claim. Once work has
      // begun an interruption remains unfinished and an ESRCH-proven successor
      // resumes it; no recursive takeover lock or force option is needed.
      if (!workStarted) finishClaim(initial, claim, 'refused', null, null, String(error.message).slice(0, 2048));
      throw error;
    }
  });
}
async function init(options) {
  const root = rootPath(options.root), owned = paths(options.task, options.asset, options.version);
  transition.assertProductionAllowed(root, 'VFX lifecycle initialization'); text(options.creator, 'creator');
  return maintenance.run(root, () => lock(root, owned.assetDirectory, async () => {
    const taskFile = ref(root, `${CACHE}/${options.task}/TASK.md`, MAX_JSON), policy = native.snapshot(root);
    const briefRef = ref(root, options.brief, MAX_JSON), briefValue = brief(root, read(root, briefRef.path, briefRef.sha256));
    const rightsRef = ref(root, options.rights, MAX_JSON), rightsValue = rights(root, read(root, rightsRef.path, rightsRef.sha256));
    const provenanceRef = options.provenance ? ref(root, options.provenance, MAX_JSON) : null;
    if (provenanceRef) provenance(root, read(root, provenanceRef.path, provenanceRef.sha256));
    const existing = assetVersions(root, owned.assetDirectory); let parent = null, ledger;
    if (existing.length && !options['parent-manifest']) fail('An existing asset requires explicit retained parent ancestry; a new version cannot reset its budgets.');
    if (options['parent-manifest']) {
      parent = ref(root, options['parent-manifest'], MAX_JSON); const prior = load({ root, manifest: parent.path }), priorInputs = retained(prior);
      if (prior.asset.task !== options.task || prior.asset.asset !== options.asset || prior.asset.version === options.version) fail('Revision parent must be another canonical version of this task/asset.');
      const lineage = lineageBudgets(prior, priorInputs);
      ledger = lineage.ledger;
      if (lineage.revisions >= lineage.original.maxRevisions || briefValue.budgets.maxRevisions > lineage.original.maxRevisions
        || lineage.revisions + 1 > briefValue.budgets.maxRevisions || briefValue.budgets.maxCandidates > lineage.original.maxCandidates)
        fail('Original VFX revision/candidate budget exhausted or increased; history cannot be reset.');
    }
    // Never adopt a partial or existing version; recovery retains its identity.
    const stateDirectory = full(root, owned.directory), stagingDirectory = full(root, owned.staging);
    if (fs.existsSync(stateDirectory) || fs.existsSync(stagingDirectory)) fail('VFX version already exists or is partial; retain it and choose a new version.');
    if (!ledger) {
      const identity = put(root, owned.assetDirectory + '/.budget.json', { schemaVersion: 'hephaera-vfx-budget/v1', task: options.task, asset: options.asset,
        originalVersion: options.version, originalBrief: briefRef, maxCandidates: briefValue.budgets.maxCandidates, maxRevisions: briefValue.budgets.maxRevisions,
        createdAt: new Date().toISOString() });
      ledger = budgetLedger(root, owned, identity);
    }
    if (ledger.events.some(event => event.kind === 'version-reserved' && event.data.version === options.version)) fail('VFX version reservation already exists; it cannot be reused or reset.');
    reserve(ledger, 'version-reserved', { version: options.version, parent, brief: briefRef });
    fs.mkdirSync(stateDirectory); fs.mkdirSync(stagingDirectory, { recursive: true }); runtime.components(stagingDirectory);
    const inputs = {};
    for (const [key, source] of [['brief', briefRef], ['rights', rightsRef], ['provenance', provenanceRef]])
      inputs[key] = source ? { source, snapshot: copy(root, source.path, owned.directory + '/inputs/' + key + '.json', source, MAX_JSON) } : null;
    // Re-observe immediately before committing the immutable manifest.
    brief(root, briefValue); rights(root, rightsValue);
    if (!equal(native.snapshot(root), policy)) fail('Policy changed during VFX initialization; partial version retained.');
    const asset = { schemaVersion: 'hephaera-vfx-asset/v1', task: options.task, asset: options.asset, version: options.version, creator: options.creator,
      taskFile, inputs, parent, budget: ledger.identity, policy, staging: owned.staging, createdAt: new Date().toISOString() };
    const identity = put(root, owned.manifest, asset);
    return { schemaVersion: 'hephaera-vfx-init/v1', manifest: identity.path, manifestSha256: identity.sha256, staging: owned.staging, readiness: readiness() };
  }));
}
function inspectionValid(result, state) {
  const data = result.data;
  if (data?.isValid !== true || data.validation?.isValid !== true) fail('Native VFX validation failed: ' + canonical(data?.validation?.issues || []));
  if (data.package?.id !== state.asset.asset || data.package?.version !== state.asset.version) fail('Package asset/version differs from the immutable host identity.');
  if (!SHA.test(data.packageSha256 || '') || !Number.isSafeInteger(data.packageBytes) || data.packageBytes < 1 || data.packageBytes > MAX_JSON
    || !Array.isArray(data.observedResources) || data.observedResources.length > 128) fail('Native VFX observation is incomplete or exceeds host copy bounds.');
  return data;
}
async function inspectStage(state, event, operation) {
  const packet = stageFiles(state, event);
  const result = await native.inspect({ root: state.root, task: state.asset.task, packagePath: event.data.package.path,
    references: [...metadataReferences(state), { ...event.data.reviewPacket, kind: 'review' }],
    expectedPolicy: state.asset.policy, budgets: BUDGETS, operation });
  inspectionValid(result, state);
  if (!equal(result.runtime, packet.runtime) || result.data.packageSha256 !== packet.packageSha256
    || !equal(result.data.observedResources.map(item => ({ path: item.path, sha256: item.sha256, bytes: item.bytes })), packet.resources))
    fail('Current native package/build observations differ from the sealed phase.');
  return result;
}
async function stage(options) {
  const initial = load(options); transition.assertProductionAllowed(initial.root, 'VFX staging');
  if (!['provisional', 'detailed'].includes(options.phase)) fail('Select phase provisional or detailed.');
  return maintenance.run(initial.root, () => lock(initial.root, initial.assetDirectory, async () => {
    const state = load(options), observed = current(state), phase = options.phase;
    const budget = observed.inputs.brief.budgets, lineage = lineageBudgets(state, observed.inputs);
    if (lineage.attempts >= Math.min(budget.maxCandidates, lineage.original.maxCandidates)) fail('VFX candidate attempt budget exhausted; retained failures/interruption and revisions do not reset it.');
    if (latest(state, 'stage-sealed', phase)) fail('Phase already sealed; initialize an immutable revision to change it.');
    if (phase === 'detailed') {
      if (!accepted(state, 'provisional')) fail('Detailed staging requires current independently accepted provisional visual evidence.');
      await inspectStage(state, latest(state, 'stage-sealed', 'provisional'), 'validate');
    }
    const packageName = relative(options.package, 'Package path'), packageRef = ref(state.root, packageName, MAX_JSON);
    const visualRef = options.visual ? ref(state.root, options.visual, MAX_JSON) : null;
    const visualValue = visualRef ? visual(state.root, read(state.root, visualRef.path, visualRef.sha256), observed.inputs.brief.coverage) : null;
    const attempt = state.staging + '/attempts/' + phase + '-' + crypto.randomUUID();
    const attemptFull = full(state.root, attempt); fs.mkdirSync(path.dirname(attemptFull), { recursive: true }); runtime.components(attemptFull); fs.mkdirSync(attemptFull);
    reserve(lineage.ledger, 'attempt-reserved', { version: state.asset.version, phase, attempt, manifest: state.identity });
    append(state, 'stage-started', { phase, attempt, sourcePackage: packageRef });
    try {
      const deadline = Date.now() + budget.maxProcessingSeconds * 1000;
      const remaining = () => {
        const seconds = Math.floor((deadline - Date.now()) / 1000);
        if (seconds < 1) fail('VFX staging processing budget exhausted; partial attempt retained.');
        return { ...BUDGETS, timeoutSeconds: Math.min(BUDGETS.timeoutSeconds, seconds) };
      };
      const sourceRefs = [...sourceReferences(state.asset, observed.inputs), ...(visualRef ? [visualRef] : [])];
      const result = await native.inspect({ root: state.root, task: state.asset.task, packagePath: packageName,
        references: [...metadataReferences(state), ...(visualRef ? [{ ...visualRef, kind: 'review' }] : [])], expectedPolicy: observed.policy, budgets: remaining() });
      const data = inspectionValid(result, state);
      const policyCaps = { maxParticles: budget.maxParticles, maxLayers: budget.maxSystems, maxTrailPoints: budget.maxTrailPoints,
        maxVertices: budget.maxVertices, maxDrawCalls: budget.maxDrawCalls, maxDurationSeconds: budget.maxDurationSeconds,
        maxTotalDependencyBytes: budget.maxOutputBytes };
      for (const [key, cap] of Object.entries(policyCaps)) {
        // Native v1 requires a positive envelope even for a zero-trail asset.
        // Enforce the host's explicit zero against the actual declared layer
        // capacities; this does not reinterpret any resource semantics.
        if (key === 'maxTrailPoints' && cap === 0) {
          if (data.package.effects.some(effect => effect.layers.some(layer => layer.maxTrailPoints !== 0))) fail('The immutable host brief forbids trail point capacity.');
        } else if (data.package.budgets[key] > cap) fail('Native declared ' + key + ' exceeds the immutable host brief budget.');
      }
      if (data.package.effects.reduce((sum, item) => sum + item.layers.length, 0) > budget.maxSystems) fail('Package systems exceed the immutable host policy cap.');
      if (data.packageSha256 !== packageRef.sha256 || data.packagePath !== packageName) fail('Native source package identity changed.');
      const rightsInputs = new Map(observed.inputs.rights.inputs.map(item => [item.path, item.sha256]));
      const directory = path.posix.dirname(packageName), used = new Set([path.posix.basename(packageName).toLowerCase()]);
      let total = data.packageBytes;
      for (const item of data.observedResources) {
        relative(item.path, 'Observed resource path'); relative(item.projectPath, 'Observed resource source');
        if (item.projectPath !== (directory === '.' ? item.path : directory + '/' + item.path) || rightsInputs.get(item.projectPath) !== item.sha256)
          fail('An observed resource lacks exact immutable rights input coverage.');
        if (!Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > MAX_FILE || !SHA.test(item.sha256 || '') || used.has(item.path.toLowerCase())) fail('Unsafe or oversized observed resource closure.');
        used.add(item.path.toLowerCase()); total += item.bytes;
      }
      if (total > budget.maxOutputBytes || data.observedResources.filter(item => item.kind === 'texture-png').reduce((sum, item) => sum + item.bytes, 0) > budget.maxTextureBytes)
        fail('Observed dependency closure exceeds the immutable output/texture byte budget.');
      const packageCopy = copy(state.root, packageName, attempt + '/package/' + path.posix.basename(packageName), { sha256: data.packageSha256, bytes: data.packageBytes }, MAX_JSON, deadline);
      const copies = [packageCopy], sources = [packageRef, ...sourceRefs];
      for (const item of data.observedResources) {
        copies.push(copy(state.root, item.projectPath, attempt + '/package/' + item.path, item, MAX_FILE, deadline));
        sources.push({ path: item.projectPath, sha256: item.sha256 });
      }
      if (visualValue) {
        for (const key of ['scene', 'camera', 'settings']) sources.push(visualValue.environment[key]);
        for (const item of visualValue.environment.dependencies) sources.push({ path: item.path, sha256: item.sha256 });
        for (const item of visualValue.artifacts) sources.push({ path: item.path, sha256: item.sha256 });
      }
      const copied = await native.inspect({ root: state.root, task: state.asset.task, packagePath: packageCopy.path,
        references: metadataReferences(state), expectedPolicy: observed.policy, budgets: remaining() });
      const checked = inspectionValid(copied, state);
      const resources = data.observedResources.map(item => ({ path: item.path, sha256: item.sha256, bytes: item.bytes }));
      if (checked.packageSha256 !== data.packageSha256 || !equal(result.runtime, copied.runtime)
        || !equal(resources, checked.observedResources.map(item => ({ path: item.path, sha256: item.sha256, bytes: item.bytes })))) fail('Native reinspection differs from the observed source closure.');
      current(state); for (const item of [...sources, ...copies]) { if (Date.now() > deadline) fail('VFX staging processing budget exhausted.'); ref(state.root, item); }
      if (Date.now() > deadline) fail('VFX staging processing budget exhausted; partial attempt retained.');
      const packet = { schemaVersion: 'hephaera-vfx-review-packet/v1', manifestSha256: state.identity.sha256, phase,
        creator: state.asset.creator, inputs: state.asset.inputs, policy: observed.policy, runtime: copied.runtime,
        sourceHostContextSha256: result.hostContextSha256, stagedHostContextSha256: copied.hostContextSha256,
        packageSha256: data.packageSha256, resources, coverage: observed.inputs.brief.coverage, bindings: observed.inputs.brief.bindings,
        sources: [...new Map(sources.map(item => [item.path, item])).values()], copies, visual: visualValue,
        visualEvidence: visualValue ? 'supplied-external-not-rendered-by-workflow' : 'unavailable', readiness: readiness() };
      const reviewPacket = put(state.root, attempt + '/review-packet.json', packet), phaseDigest = digest(packet);
      if (Date.now() > deadline) fail('VFX staging processing budget exhausted; unsealed packet retained.');
      append(state, 'stage-sealed', { phase, attempt, package: packageCopy, reviewPacket, phaseDigest, visualAvailable: visualValue !== null });
      return { schemaVersion: 'hephaera-vfx-stage/v1', manifest: state.identity.path, phase, attempt, package: packageCopy,
        reviewPacket, phaseDigest, visualEvidence: packet.visualEvidence, readiness: readiness() };
    } catch (error) {
      append(state, 'stage-failed', { phase, attempt, reason: String(error.message).slice(0, 2048) }); throw error;
    }
  }));
}
async function record(options) {
  const initial = load(options); transition.assertProductionAllowed(initial.root, 'VFX review recording');
  if (!['provisional', 'detailed'].includes(options.phase)) fail('Select phase provisional or detailed.');
  text(options.reviewer, 'reviewer');
  return maintenance.run(initial.root, () => lock(initial.root, initial.assetDirectory, async () => {
    const state = load(options); current(state);
    const event = latest(state, 'stage-sealed', options.phase); if (!event) fail('Review requires an exact sealed phase.');
    if (latest(state, 'review', options.phase)) fail('Phase already reviewed; rejected and accepted reviews are immutable. Initialize a revision for further changes.');
    const evidence = ref(state.root, options.evidence, MAX_JSON), value = read(state.root, evidence.path, evidence.sha256);
    shape(value, ['schemaVersion', 'phase', 'reviewPacketSha256', 'reviewer', 'verdict', 'independenceConfirmed', 'sourceEvidence', 'findings'], 'VFX review evidence');
    if (value.schemaVersion !== 'hephaera-vfx-review/v1' || value.phase !== options.phase || value.reviewPacketSha256 !== event.data.reviewPacket.sha256
      || value.reviewer !== options.reviewer || !['accepted', 'rejected'].includes(value.verdict) || value.independenceConfirmed !== true) fail('Review does not bind this exact independent phase packet.');
    if (value.reviewer.normalize('NFKC').toLowerCase() === state.asset.creator.normalize('NFKC').toLowerCase()) fail('Creator and independent reviewer must be distinct.');
    text(value.findings, 'review findings', 16384); const sourceEvidence = ref(state.root, value.sourceEvidence, MAX_JSON), packet = stageFiles(state, event);
    const unrelated = [evidence, event.data.reviewPacket, ...packet.sources, ...packet.copies];
    if (unrelated.some(item => item.path === sourceEvidence.path || item.sha256 === sourceEvidence.sha256))
      fail('Review requires separately authored source evidence, distinct from inputs, artifacts and the review envelope.');
    if (value.verdict === 'accepted' && packet.visual === null) fail('Actual complete visual evidence is unavailable; metadata/name/verdict cannot pass visual review.');
    await inspectStage(state, event, 'validate'); current(state); ref(state.root, evidence); ref(state.root, sourceEvidence);
    append(state, 'review', { phase: options.phase, reviewer: value.reviewer, verdict: value.verdict, evidence, sourceEvidence,
      reviewPacketSha256: value.reviewPacketSha256, phaseDigest: event.data.phaseDigest, humanRuntimeAcceptance: false });
    return status(options);
  }));
}
async function inspect(options, operation) {
  const state = load(options); current(state);
  const stages = state.events.filter(event => event.kind === 'stage-sealed'), inspections = [];
  for (const event of stages) inspections.push({ phase: event.data.phase, ...(await inspectStage(state, event, operation)) });
  current(state);
  return { ...status(options), schemaVersion: 'hephaera-vfx-' + operation + '/v1', inspections,
    contractValidation: stages.length ? 'passed' : 'not-run-no-staged-package', contentDecoding: 'unavailable', readiness: readiness() };
}
function parse(values) {
  const options = {};
  for (let index = 0; index < values.length; index++) {
    const flag = values[index];
    if (!/^--[a-z][a-z-]*$/.test(flag) || Object.hasOwn(options, flag.slice(2))) fail('Use unique --option value arguments.');
    const value = values[++index]; if (!value || value.startsWith('--')) fail('Missing value for ' + flag);
    options[flag.slice(2)] = value;
  }
  return options;
}
function help() {
  return 'vfx-assets.sh init --task TASK --asset ASSET --version VERSION --creator NAME --brief JSON --rights JSON [--parent-manifest JSON] [--provenance JSON]\n'
    + 'vfx-assets.sh stage --manifest JSON --phase provisional|detailed --package JSON [--visual JSON]\n'
    + 'vfx-assets.sh validate|inspect|status|recover --manifest JSON\n'
    + 'vfx-assets.sh record --manifest JSON --phase provisional|detailed --reviewer NAME --evidence JSON\n'
    + 'vfx-assets.sh doctor\nAll operations require --root ROOT (supplied by the public wrapper). Processing, rendering, generation, installation and promotion are unavailable.';
}
async function run(operation, options) {
  if (!Object.hasOwn(FLAGS, operation)) fail('Unsupported VFX lifecycle operation. ' + help());
  if (options instanceof Map) options = Object.fromEntries(options);
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('Explicit VFX options are required.');
  for (const key of Object.keys(options)) if (!FLAGS[operation].includes(key)) fail('Unknown or protected VFX option: --' + key);
  for (const key of FLAGS[operation].filter(key => !['parent-manifest', 'provenance', 'visual'].includes(key)))
    if (options[key] === undefined) fail('Missing --' + key + '.');
  if (operation === 'doctor') return native.doctor(rootPath(options.root));
  if (operation === 'init') return init(options);
  if (operation === 'stage') return stage(options);
  if (operation === 'record') return record(options);
  if (operation === 'recover') return recover(options);
  const root = rootPath(options.root);
  if (operation === 'status') {
    // A fenced historical installation may be diagnosed without creating a
    // managed lease or invoking native capability/build verification.
    if (transition.inspect(root).productionBlocked) return status(options);
    return maintenance.run(root, () => status(options));
  }
  transition.assertProductionAllowed(root, 'VFX lifecycle ' + operation);
  return maintenance.run(root, () => inspect(options, operation));
}
module.exports = { parse, run, help, load, status, recover };
if (require.main === module) {
  const [operation, ...args] = process.argv.slice(2);
  if (operation === '--help' || operation === '-h' || operation === 'help') console.log(help());
  else run(operation, parse(args)).then(result => console.log(encode(result).trimEnd())).catch(error => { console.error(error.message); process.exitCode = 1; });
}
