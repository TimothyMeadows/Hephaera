'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const fail = message => { throw new Error(message); };
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function safe(root, relative = '') {
  if (typeof relative !== 'string' || /[\x00-\x1f]/.test(relative) || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(x => x === '..' || x === '.' || x.includes(':'))) fail('Unsafe project-relative path.');
  const full = path.resolve(root, relative), volume = path.parse(full).root;
  if (!same(full, root) && !full.startsWith(root + path.sep)) fail('Path escapes project.');
  let current = volume;
  for (const part of path.relative(volume, full).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    if (stat.isSymbolicLink()) fail('Paths cannot traverse symbolic links or junctions.');
  }
  return full;
}
function root(value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f]/.test(value)) fail('An explicit project root is required.');
  const full = path.resolve(value); safe(full);
  if (!fs.statSync(full).isDirectory()) fail('Project root must be an existing directory.');
  return full;
}
function hash(file) {
  const h = crypto.createHash('sha256'), fd = fs.openSync(file, 'r'), buf = Buffer.alloc(65536);
  try { let count; while ((count = fs.readSync(fd, buf, 0, buf.length, null))) h.update(buf.subarray(0, count)); } finally { fs.closeSync(fd); }
  return h.digest('hex');
}
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function read(file) {
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 8 * 1024 * 1024) fail('Missing or oversized installer metadata.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.pending-' + crypto.randomUUID();
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(temporary, file); } catch (e) { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); throw e; }
}
function inventory(directory, exclude = () => false) {
  const result = {}; let count = 0;
  function visit(relative) {
    const dir = safe(directory, relative);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (exclude(name)) continue;
      if (++count > 100000) fail('Installer inventory exceeds bound.');
      const full = safe(directory, name), stat = fs.lstatSync(full);
      if (stat.isDirectory()) visit(name);
      else if (stat.isFile()) result[name] = hash(full);
      else fail('Inventory contains an unsupported file type.');
    }
  }
  if (fs.existsSync(directory)) visit('');
  return result;
}
module.exports = { fs, path, crypto, fail, same, safe, root, hash, canonical, digest, read, write, inventory };
