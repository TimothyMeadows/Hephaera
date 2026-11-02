'use strict';
const f = require('./files.cjs'), os = require('node:os');
const BASE = '.hephaera/.cache/installer/maintenance';
function captureIdentity(projectRoot) {
  const root = f.root(projectRoot), file = f.safe(root, 'hephaera.lock.json');
  if (!f.fs.existsSync(file)) return { managed: false };
  const lock = f.read(file);
  if (lock.schemaVersion !== 1 || typeof lock.active !== 'boolean' || !/^[a-f0-9]{40}$/.test(lock.revision || '') || !/^[a-f0-9]{64}$/.test(lock.manifestSha256 || '')) f.fail('Malformed managed installation identity.');
  return { managed: true, lockSha256: f.hash(file), revision: lock.revision, manifestSha256: lock.manifestSha256, active: lock.active };
}
function owner() { return { schemaVersion: 1, id: f.crypto.randomUUID(), pid: process.pid, host: os.hostname(), createdAt: new Date().toISOString() }; }
function checkOwner(value) {
  if (!value || value.schemaVersion !== 1 || !/^[0-9a-f-]{36}$/.test(value.id || '') || !Number.isInteger(value.pid) || value.pid < 1 || value.host !== os.hostname() || !Number.isFinite(Date.parse(value.createdAt))) f.fail('Invalid or unverifiable maintenance owner; explicit recovery required.');
  try { process.kill(value.pid, 0); } catch (e) { f.fail('Stale or unverifiable maintenance owner; explicit recovery required.'); }
}
function gate(root, action) {
  const base = f.safe(root, BASE); f.fs.mkdirSync(f.safe(root, BASE + '/readers'), { recursive: true });
  const dir = f.safe(root, BASE + '/gate'), identity = owner();
  let admitted = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    try { f.fs.mkdirSync(dir); admitted = true; break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const current = f.safe(root, BASE + '/gate/owner.json');
      if (f.fs.existsSync(current)) checkOwner(f.read(current));
      // Admission alone is short and synchronous. Bound cross-process races;
      // an invalid/dead owner remains fenced and is never removed here.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  if (!admitted) f.fail('Maintenance admission gate is busy or interrupted; explicit recovery required.');
  const file = f.safe(root, BASE + '/gate/owner.json');
  f.fs.writeFileSync(file, JSON.stringify(identity), { flag: 'wx', mode: 0o600 });
  try { return action(base); } finally {
    if (f.digest(f.read(file)) !== f.digest(identity)) f.fail('Maintenance gate ownership changed.');
    f.fs.unlinkSync(file); f.fs.rmdirSync(dir);
  }
}
function acquire(projectRoot, mode, expected) {
  const root = f.root(projectRoot), identity = owner(); let relative;
  gate(root, () => {
    const writer = f.safe(root, BASE + '/writer.json');
    if (f.fs.existsSync(writer)) { checkOwner(f.read(writer)); f.fail('Baseline maintenance writer is active.'); }
    const readers = f.fs.readdirSync(f.safe(root, BASE + '/readers'));
    for (const name of readers) {
      if (!/^[0-9a-f-]{36}\.json$/.test(name)) f.fail('Invalid maintenance reader record.');
      checkOwner(f.read(f.safe(root, BASE + '/readers/' + name)));
    }
    if (mode === 'write' && readers.length) f.fail('Baseline production readers are active.');
    if (mode === 'read') {
      const current = captureIdentity(root);
      if (expected && f.digest(current) !== f.digest(expected)) f.fail('Baseline identity changed before production admission.');
      if (current.managed) {
        if (!current.active) f.fail('Managed baseline is inactive.');
        const pending = f.safe(root, '.hephaera/.cache/installer/pending.json');
        if (f.fs.existsSync(pending)) f.fail('Managed baseline has an incomplete operation; recover before production.');
      }
    }
    relative = BASE + (mode === 'read' ? '/readers/' + identity.id + '.json' : '/writer.json');
    f.fs.writeFileSync(f.safe(root, relative), JSON.stringify(identity), { flag: 'wx', mode: 0o600 });
  });
  let released = false;
  return { release() {
    if (released) return;
    gate(root, () => {
      const file = f.safe(root, relative);
      if (f.digest(f.read(file)) !== f.digest(identity)) f.fail('Maintenance lease ownership changed.');
      f.fs.unlinkSync(file); released = true;
    });
  } };
}
const acquireRead = (root, expected) => acquire(root, 'read', expected);
const acquireWrite = root => acquire(root, 'write');
async function runRead(root, expected, action) {
  if (typeof expected === 'function') { action = expected; expected = undefined; }
  const lease = acquireRead(root, expected); try { return await action(); } finally { lease.release(); }
}
function reconcile(projectRoot, { confirmQuiescent = false } = {}) {
  const root = f.root(projectRoot), base = f.safe(root, BASE);
  if (!f.fs.existsSync(base)) return { reconciled: [] };
  if (f.fs.readdirSync(base).some(name => !['gate', 'readers', 'writer.json'].includes(name))) f.fail('Cannot reconcile unknown maintenance state.');
  const relatives = [];
  if (f.fs.existsSync(f.safe(root, BASE + '/gate'))) {
    if (f.fs.readdirSync(f.safe(root, BASE + '/gate')).join('\n') !== 'owner.json') f.fail('Cannot reconcile unknown maintenance gate contents.');
    relatives.push(BASE + '/gate/owner.json');
  }
  if (f.fs.existsSync(f.safe(root, BASE + '/writer.json'))) relatives.push(BASE + '/writer.json');
  if (f.fs.existsSync(f.safe(root, BASE + '/readers'))) for (const n of f.fs.readdirSync(f.safe(root, BASE + '/readers'))) relatives.push(BASE + '/readers/' + n);
  const stale = [];
  for (const relative of relatives) {
    const file = f.safe(root, relative), value = f.read(file);
    if (value.schemaVersion !== 1 || value.host !== os.hostname() || !/^[0-9a-f-]{36}$/.test(value.id || '') || !Number.isInteger(value.pid) || value.pid < 1 || !Number.isFinite(Date.parse(value.createdAt)) || (relative.includes('/readers/') && f.path.basename(relative) !== value.id + '.json')) f.fail('Cannot reconcile an unknown maintenance owner.');
    try { process.kill(value.pid, 0); f.fail('Maintenance owner is still active; recovery refused.'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    stale.push({ file, relative, value });
  }
  if (stale.length && confirmQuiescent !== true) f.fail('Stale owners do not prove worker quiescence. Stop or review remaining owned workers, then recover --confirm-quiescent.');
  let recoveryId;
  if (stale.length) {
    recoveryId = f.crypto.randomUUID();
    const directory = f.safe(root, '.hephaera/.cache/installer/maintenance-recovery'); f.fs.mkdirSync(directory, { recursive: true });
    f.fs.writeFileSync(f.path.join(directory, recoveryId + '-intent.json'), JSON.stringify({ schemaVersion: 1, recoveryId, operatorConfirmedQuiescence: true, at: new Date().toISOString(), owners: stale.map(({ relative, value }) => ({ record: relative, owner: value })) }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  for (const { file, value } of stale) { if (f.digest(f.read(file)) !== f.digest(value)) f.fail('Recovery owner changed.'); f.fs.unlinkSync(file); }
  if (relatives.includes(BASE + '/gate/owner.json')) f.fs.rmdirSync(f.safe(root, BASE + '/gate'));
  if (recoveryId) f.fs.writeFileSync(f.safe(root, '.hephaera/.cache/installer/maintenance-recovery/' + recoveryId + '-complete.json'), JSON.stringify({ schemaVersion: 1, recoveryId, completedAt: new Date().toISOString(), reconciled: relatives }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { reconciled: relatives, ...(recoveryId ? { recoveryId } : {}) };
}
module.exports = { acquireRead, acquireWrite, captureIdentity, runRead, reconcile };
