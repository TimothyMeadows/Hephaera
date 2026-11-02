'use strict';
const zlib = require('node:zlib');
function readZip(bytes) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('ZIP end record missing.');
  const count = bytes.readUInt16LE(end + 10); let cursor = bytes.readUInt32LE(end + 16); const result = new Map();
  for (let index = 0; index < count; index++) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
    const method = bytes.readUInt16LE(cursor + 10), compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
    const names = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32), local = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + names).toString('utf8');
    if (result.has(name) || name.includes('..') || name.startsWith('/') || name.includes('\\')) throw new Error('Unsafe or duplicate ZIP entry.');
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid ZIP local header.');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const body = bytes.subarray(start, start + compressed);
    const output = method === 0 ? body : method === 8 ? zlib.inflateRawSync(body) : null;
    if (!output || output.length !== size || zlib.crc32(output) !== bytes.readUInt32LE(cursor + 16)) throw new Error('ZIP entry integrity mismatch.');
    result.set(name, output); cursor += 46 + names + extra + comment;
  }
  return result;
}
function readTarGzip(bytes) {
  const tar = zlib.gunzipSync(bytes), result = new Map(); let cursor = 0;
  while (cursor + 512 <= tar.length && tar[cursor] !== 0) {
    const header = tar.subarray(cursor, cursor + 512);
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString().replace(/\0.*$/, '');
    const full = prefix ? prefix + '/' + name : name;
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim() || '0', 8);
    const type = String.fromCharCode(header[156]);
    if (full.includes('..') || full.startsWith('/') || full.includes('\\') || result.has(full)) throw new Error('Unsafe/duplicate tar entry.');
    if (type !== '0' && type !== '\0') throw new Error('Only regular npm payload entries are accepted.');
    result.set(full, tar.subarray(cursor + 512, cursor + 512 + size)); cursor += 512 + Math.ceil(size / 512) * 512;
  }
  return result;
}
function writeZip(entries) {
  const records = [], directories = []; let offset = 0;
  for (const [name, value] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    if (typeof name !== 'string' || name.split('/').some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..')) throw new Error('Archive entries must be safe relative owned filenames.');
    const filename = Buffer.from(name), body = Buffer.from(value), crc = zlib.crc32(body);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    records.push(local, filename, body); directories.push(central, filename); offset += local.length + filename.length + body.length;
  }
  const directory = Buffer.concat(directories), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.size, 8); end.writeUInt16LE(entries.size, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, directory, end]);
}
function normalizeUnsignedZipTimestamps(bytes) {
  const entries = readZip(bytes);
  if ([...entries.keys()].some(name => name.toLowerCase() === '.signature.p7s')) throw new Error('Signed packages must not be normalized after signing.');
  const result = Buffer.from(bytes);
  let end = result.length - 22;
  while (end >= Math.max(0, result.length - 65557) && result.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || result.readUInt16LE(end + 10) === 65535) throw new Error('Unsupported ZIP directory for normalization.');
  const count = result.readUInt16LE(end + 10); let cursor = result.readUInt32LE(end + 16);
  function extras(start, length) {
    const limit = start + length;
    for (let offset = start; offset < limit;) {
      if (offset + 4 > limit) throw new Error('Malformed ZIP extra field.');
      const type = result.readUInt16LE(offset), size = result.readUInt16LE(offset + 2), body = offset + 4;
      if (body + size > limit) throw new Error('Truncated ZIP extra field.');
      if (type === 0x5455) { // Extended Unix timestamps, following the flags byte.
        if (size < 1 || (size - 1) % 4) throw new Error('Malformed extended ZIP timestamps.');
        for (let pos = body + 1; pos + 4 <= body + size; pos += 4) result.writeUInt32LE(315532800, pos);
      } else if (type === 0x5855 || type === 0x000d) { // Unix atime/mtime, followed by ownership data.
        if (size < 8) throw new Error('Malformed Unix ZIP timestamps.');
        result.writeUInt32LE(315532800, body); result.writeUInt32LE(315532800, body + 4);
      } else if (type === 0x000a) { // NTFS: reserved DWORD, then typed attributes.
        if (size < 4) throw new Error('Malformed NTFS ZIP metadata.');
        for (let pos = body + 4; pos < body + size;) {
          if (pos + 4 > body + size) throw new Error('Truncated NTFS ZIP attribute.');
          const tag = result.readUInt16LE(pos), length = result.readUInt16LE(pos + 2); pos += 4;
          if (pos + length > body + size) throw new Error('Truncated NTFS ZIP attribute value.');
          if (tag === 1) { if (length !== 24) throw new Error('Malformed NTFS ZIP timestamps.'); for (let item = 0; item < 3; item++) result.writeBigUInt64LE(119600064000000000n, pos + item * 8); }
          pos += length;
        }
      }
      offset = body + size;
    }
  }
  for (let index = 0; index < count; index++) {
    const local = result.readUInt32LE(cursor + 42), nameLength = result.readUInt16LE(cursor + 28), extraLength = result.readUInt16LE(cursor + 30), commentLength = result.readUInt16LE(cursor + 32);
    result.writeUInt16LE(0, cursor + 12); result.writeUInt16LE(0x21, cursor + 14);
    result.writeUInt16LE(0, local + 10); result.writeUInt16LE(0x21, local + 12);
    extras(cursor + 46 + nameLength, extraLength);
    extras(local + 30 + result.readUInt16LE(local + 26), result.readUInt16LE(local + 28));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  // Entry bodies, CRCs, compression, ordering, permissions and non-time metadata are unchanged.
  const verified = readZip(result);
  for (const [name, body] of entries) if (!verified.get(name)?.equals(body)) throw new Error('Normalization altered package entry bytes.');
  return result;
}
module.exports = { readZip, readTarGzip, writeZip, normalizeUnsignedZipTimestamps };
