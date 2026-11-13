'use strict';
const fs = require('node:fs');

// Notifications are hints. Consumers validate paths and descriptors again on
// actual reads; the slow recovery check also covers missed/unsupported watches.
function create(root, store) {
  const directories = new Map();
  let recovery, stampCache;
  function wave(action) { const previous = stampCache; stampCache = new Map(); try { action(); } finally { stampCache = previous; } }
  function stamp(relative) {
    if (stampCache?.has(relative)) return stampCache.get(relative);
    let value;
    try {
      const file = store.safe(root, relative), stat = fs.lstatSync(file, { bigint: true });
      value = stat.isSymbolicLink() ? 'unavailable' : [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink,stat.mode].join(':');
    } catch (error) { value = error.code === 'ENOENT' ? 'missing' : 'unavailable'; }
    stampCache?.set(relative, value); return value;
  }
  function bind(record) {
    if (record.watcher) return;
    try {
      const directory = store.safe(root, record.relative, 'dir');
      record.watcher = fs.watch(directory, { persistent: false }, () => record.notify());
      record.watcher.on('error', () => { record.watcher?.close(); record.watcher = null; record.notify(); });
    } catch { /* Recovery remains available without a native watcher. */ }
  }
  function subscribe(relative, listener) {
    let record = directories.get(relative);
    if (!record) {
      record = { relative, listeners: new Set(), watcher: null, timer: null };
      record.notify = () => {
        if (record.timer) return;
        record.timer = setTimeout(() => { record.timer = null; wave(() => { for (const callback of record.listeners) callback(); }); }, 40);
        record.timer.unref();
      };
      directories.set(relative, record); bind(record);
    }
    record.listeners.add(listener);
    if (!recovery) {
      recovery = setInterval(() => wave(() => { for (const entry of directories.values()) { bind(entry); for (const callback of entry.listeners) callback(); } }), 5000);
      recovery.unref();
    }
    return () => {
      record.listeners.delete(listener);
      if (!record.listeners.size) { clearTimeout(record.timer); record.watcher?.close(); directories.delete(relative); }
      if (!directories.size) { clearInterval(recovery); recovery = null; }
    };
  }
  function close() { clearInterval(recovery); for (const record of directories.values()) { clearTimeout(record.timer); record.watcher?.close(); } directories.clear(); }
  return { stamp, subscribe, close, notify(relative) { directories.get(relative)?.notify(); } };
}
module.exports = { create };
