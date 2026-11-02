'use strict';
// Cooperative baseline lifetime admission; GPU/process ownership remains in Bubo.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const BASE = path.resolve(__dirname, '../..');
let loadedRevision = null;
try { loadedRevision = cp.execFileSync('git', ['-C', BASE, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','ignore'] }).trim(); } catch {}
function lease(root) {
  // Manual installs retain their existing behavior and need no managed state.
  if (!fs.existsSync(path.join(root, 'hephaera.lock.json'))) return { release() {} };
  const maintenance = require('../../installer/core/maintenance.cjs');
  const identity = maintenance.captureIdentity(root);
  if (identity.managed === false) return { release() {} };
  const installed = fs.realpathSync(path.join(root, '.hephaera'));
  const equal = process.platform === 'win32' ? installed.toLowerCase() === BASE.toLowerCase() : installed === BASE;
  if (!equal || !loadedRevision || identity.revision !== loadedRevision) throw new Error('Managed baseline dispatch identity changed. Restart using the installed reviewed revision.');
  return maintenance.acquireRead(root, identity);
}
async function run(root, action) {
  const held = lease(root);
  try { return await action(); } finally { held.release(); }
}
function sync(root, action) {
  const held = lease(root);
  try { return action(); } finally { held.release(); }
}
module.exports = { lease, run, sync };
