'use strict';

// Original fixed-profile evidence inspection, not a media decoder/encoder.
// EBML structure: https://www.rfc-editor.org/rfc/rfc8794.html
// Matroska blocks/lacing: https://www.matroska.org/technical/notes.html
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_BYTES = 16777216, MAX_NODES = 200000, MAX_DEPTH = 12, MAX_FRAMES = 100000;
const fail = message => { throw new Error(message); };
const bound = (value, min, max, name) => { if (!Number.isFinite(value) || value < min || value > max) fail('Invalid bounded ' + name); return value; };
const integer = (value, min, max, name) => { bound(value, min, max, name); if (!Number.isSafeInteger(value)) fail('Invalid integer ' + name); return value; };
const ID = {EBML:0x1a45dfa3, SEGMENT:0x18538067, INFO:0x1549a966, TRACKS:0x1654ae6b, TRACK:0xae, VIDEO:0xe0, CLUSTER:0x1f43b675,
  SIMPLE:0xa3, GROUP:0xa0, BLOCK:0xa1, BLOCK_DURATION:0x9b, TIMESTAMP:0xe7, SCALE:0x2ad7b1, DURATION:0x4489,
  TRACK_NUMBER:0xd7, TRACK_TYPE:0x83, CODEC:0x86, WIDTH:0xb0, HEIGHT:0xba, DEFAULT_DURATION:0x23e383, TRACK_SCALE:0x23314f, CODEC_DELAY:0x56aa};
const LEVEL_ONE = new Set([ID.INFO,ID.TRACKS,ID.CLUSTER,0x114d9b74,0x1c53bb6b,0x1941a469,0x1043a770,0x1254c367]);

function inspectWebm(input) {
  if (!(input instanceof Uint8Array) || input.byteLength < 16 || input.byteLength > MAX_BYTES) fail('Bounded actual WebM bytes required');
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength), tracks = [], blocks = [];
  let nodes = 0, clusters = 0, scale = 1000000, declaredDuration = null, docType = null;
  function vint(offset, limit, id = false) {
    if (offset >= limit) fail('Truncated EBML integer');
    const first = bytes[offset]; let marker = 128, width = 1;
    while (width <= 8 && !(first & marker)) { marker >>= 1; width++; }
    if (width > (id ? 4 : 8) || offset + width > limit) fail('Invalid/truncated EBML integer width');
    let value = BigInt(id ? first : first & (marker - 1));
    for (let i = 1; i < width; i++) value = value * 256n + BigInt(bytes[offset + i]);
    return {width, value, unknown:!id && value === (1n << BigInt(width * 7)) - 1n};
  }
  function element(offset, limit, depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('WebM element/depth budget exceeded');
    const id = vint(offset,limit,true), size = vint(offset + id.width,limit), start = offset + id.width + size.width;
    if (!size.unknown && size.value > BigInt(limit - start)) fail('WebM element exceeds its parent');
    return {id:Number(id.value), start, end:size.unknown ? limit : start + Number(size.value), unknown:size.unknown};
  }
  function finite(element) { if (element.unknown) fail('Unknown size is supported only for Segment/Cluster'); return element; }
  function uint(element) {
    finite(element); const length = element.end - element.start; if (length < 1 || length > 8) fail('Invalid WebM unsigned integer');
    let value = 0n; for (let i = element.start; i < element.end; i++) value = value * 256n + BigInt(bytes[i]);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail('WebM integer exceeds exact numeric range'); return Number(value);
  }
  function float(element) {
    finite(element); const length = element.end - element.start;
    const value = length === 4 ? bytes.readFloatBE(element.start) : length === 8 ? bytes.readDoubleBE(element.start) : NaN;
    if (!Number.isFinite(value)) fail('Invalid WebM floating-point value'); return value;
  }
  function text(element) {
    finite(element); const length = element.end - element.start; if (length < 1 || length > 128) fail('Oversized WebM text field');
    const value = bytes.toString('latin1',element.start,element.end).replace(/\0+$/, '');
    if (!/^[\x20-\x7e]+$/.test(value)) fail('Invalid WebM ASCII field'); return value;
  }
  function children(master, depth, visit) {
    finite(master); let offset = master.start;
    while (offset < master.end) { const child = finite(element(offset,master.end,depth)); visit(child); offset = child.end; }
    if (offset !== master.end) fail('WebM child layout is incomplete');
  }
  function block(element) {
    finite(element); const track = vint(element.start,element.end), cursor = element.start + track.width;
    if (!track.value || track.value > 128n || cursor + 3 >= element.end) fail('Invalid/truncated WebM video block');
    const relative = bytes.readInt16BE(cursor), flags = bytes[cursor + 2], lacing = flags & 6;
    let offset = cursor + 3, frames = 1, sizes = [];
    if (lacing) {
      if (offset >= element.end) fail('Missing WebM lace count'); frames = bytes[offset++] + 1;
      if (frames < 2) fail('Malformed WebM lacing');
      if (lacing === 2) {
        for (let i = 0; i < frames - 1; i++) { let size = 0, part; do { if (offset >= element.end) fail('Truncated Xiph lacing'); part = bytes[offset++]; size += part; } while (part === 255); sizes.push(size); }
      } else if (lacing === 4) {
        const remaining = element.end - offset; if (remaining % frames) fail('Unequal fixed WebM lacing'); sizes = Array(frames).fill(remaining / frames);
      } else {
        const first = vint(offset,element.end); offset += first.width; sizes.push(Number(first.value));
        for (let i = 1; i < frames - 1; i++) { const delta = vint(offset,element.end); offset += delta.width;
          const bias = (1n << BigInt(delta.width * 7 - 1)) - 1n, value = BigInt(sizes[i - 1]) + delta.value - bias;
          if (value < 0n || value > BigInt(MAX_BYTES)) fail('Invalid EBML lace size'); sizes.push(Number(value)); }
      }
      if (lacing !== 4) sizes.push(element.end - offset - sizes.reduce((sum,n) => sum + n,0));
    } else sizes = [element.end - offset];
    if (sizes.length !== frames || sizes.some(n => !Number.isSafeInteger(n) || n <= 0) || sizes.reduce((sum,n) => sum + n,0) !== element.end - offset) fail('Invalid WebM frame payload sizes');
    return {track:Number(track.value), relative, frames, lacing:lacing !== 0, duration:null};
  }
  function group(master, depth) {
    let value = null, duration = null;
    children(master,depth,child => { if (child.id === ID.BLOCK) { if (value) fail('Duplicate WebM Block'); value = block(child); } else if (child.id === ID.BLOCK_DURATION) { if (duration !== null) fail('Duplicate WebM BlockDuration'); duration = uint(child); } });
    if (!value) fail('WebM BlockGroup has no Block'); value.duration = duration; return value;
  }
  function cluster(master, depth) {
    if (++clusters > MAX_NODES) fail('WebM cluster budget exceeded'); let offset = master.start, timestamp = null; const records = [];
    while (offset < master.end) {
      const child = element(offset,master.end,depth);
      if (master.unknown && LEVEL_ONE.has(child.id)) break;
      finite(child);
      if (child.id === ID.TIMESTAMP) { if (timestamp !== null) fail('Duplicate Cluster timestamp'); timestamp = uint(child); }
      else if (child.id === ID.SIMPLE) records.push(block(child));
      else if (child.id === ID.GROUP) records.push(group(child,depth + 1));
      if (records.length + blocks.length > MAX_FRAMES) fail('WebM block budget exceeded'); offset = child.end;
    }
    if (timestamp === null) fail('Cluster timestamp is missing'); for (const record of records) blocks.push({...record,cluster:timestamp}); return offset;
  }
  function track(master, depth) {
    if (tracks.length >= 16) fail('WebM track inventory exceeded'); const result = {number:null,type:null,codec:null,width:null,height:null,defaultDuration:null,scale:1,codecDelay:0};
    const seen = new Set();
    children(master,depth,child => {
      const fields = {[ID.TRACK_NUMBER]:'number',[ID.TRACK_TYPE]:'type',[ID.CODEC]:'codec',[ID.DEFAULT_DURATION]:'defaultDuration',[ID.TRACK_SCALE]:'scale',[ID.CODEC_DELAY]:'codecDelay'};
      const key = fields[child.id]; if (key) { if (seen.has(key)) fail('Duplicate WebM track field'); seen.add(key); result[key] = key === 'codec' ? text(child) : key === 'scale' ? float(child) : uint(child); }
      else if (child.id === ID.VIDEO) children(child,depth + 1,v => { const key = v.id === ID.WIDTH ? 'width' : v.id === ID.HEIGHT ? 'height' : null; if (key) { if (seen.has(key)) fail('Duplicate WebM video dimension'); seen.add(key); result[key] = uint(v); } });
    });
    integer(result.number,1,128,'WebM track number'); integer(result.type,1,254,'WebM track type'); tracks.push(result);
  }
  let offset = 0; const header = finite(element(offset,bytes.length,0));
  if (header.id !== ID.EBML) fail('Actual EBML header required');
  children(header,1,child => {
    if (child.id === 0x4282) { if (docType !== null) fail('Duplicate EBML DocType'); docType = text(child); }
    else if (child.id === 0x42f2) integer(uint(child),1,4,'EBML maximum ID length');
    else if (child.id === 0x42f3) integer(uint(child),1,8,'EBML maximum size length');
    else if (child.id === 0x42f7 || child.id === 0x4286) integer(uint(child),1,1,'EBML read/version');
    else if (child.id === 0x4285) integer(uint(child),1,4,'WebM read version');
  });
  if (docType !== 'webm') fail('EBML DocType must be webm'); offset = header.end;
  while (offset < bytes.length && bytes[offset] === 0xec) offset = finite(element(offset,bytes.length,0)).end;
  const segment = element(offset,bytes.length,0); if (segment.id !== ID.SEGMENT) fail('One WebM Segment required'); offset = segment.start;
  let infoSeen = false, tracksSeen = false;
  while (offset < segment.end) {
    const child = element(offset,segment.end,1);
    if (child.id === ID.CLUSTER) { offset = cluster(child,2); continue; }
    finite(child);
    if (child.id === ID.INFO) {
      if (infoSeen) fail('Duplicate WebM Info'); infoSeen = true; let scaleSeen = false;
      children(child,2,value => { if (value.id === ID.SCALE) { if (scaleSeen) fail('Duplicate TimestampScale'); scaleSeen = true; scale = integer(uint(value),1,1000000000,'TimestampScale'); } else if (value.id === ID.DURATION) declaredDuration = float(value); });
    } else if (child.id === ID.TRACKS) {
      if (tracksSeen) fail('Duplicate WebM Tracks'); tracksSeen = true; children(child,2,value => { if (value.id === ID.TRACK) track(value,3); });
    } else if (child.id === ID.EBML || child.id === ID.SEGMENT) fail('Multiple/nested WebM documents are unsupported');
    offset = child.end;
  }
  if (segment.end !== bytes.length || offset !== segment.end) fail('Trailing or incomplete WebM document');
  if (!tracksSeen || tracks.length !== 1 || tracks[0].type !== 1 || !['V_VP8','V_VP9'].includes(tracks[0].codec)) fail('Fixed capture requires exactly one VP8/VP9 video track');
  const video = tracks[0]; integer(video.width,1,4096,'video width'); integer(video.height,1,4096,'video height');
  if (video.width * video.height > 16777216 || video.scale !== 1 || video.codecDelay !== 0) fail('Unsupported video timestamp/dimension profile');
  if (video.defaultDuration !== null) integer(video.defaultDuration,1,1000000000,'default frame duration');
  let frames = 0, videoBlocks = 0, first = Infinity, last = -Infinity, lastEnd = -Infinity, previous = -Infinity, monotonic = true, lacedBlocks = 0, frameEndsComplete = true;
  for (const record of blocks) {
    if (record.track !== video.number) fail('Block refers to undeclared video track');
    const time = bound((record.cluster + record.relative) * scale / 1e9,0,60,'video timestamp');
    const step = record.frames > 1 ? record.duration !== null ? record.duration * scale / 1e9 / record.frames : video.defaultDuration !== null ? video.defaultDuration / 1e9 : null : 0;
    if (record.frames > 1 && step === null) fail('Laced video has no declared frame duration; timestamps unavailable');
    if (step !== null) bound(step,0,60,'frame interval');
    if ((frames += record.frames) > MAX_FRAMES) fail('WebM frame inventory exceeded'); videoBlocks++; if (record.lacing) lacedBlocks++;
    const endFrame = bound(time + (record.frames - 1) * step,0,60,'last video frame timestamp');
    first = Math.min(first,time); last = Math.max(last,endFrame); if (time < previous) monotonic = false; previous = endFrame;
    const duration = record.duration !== null ? record.duration * scale / 1e9 : video.defaultDuration !== null ? record.frames * video.defaultDuration / 1e9 : null;
    if (duration !== null) lastEnd = Math.max(lastEnd,bound(time + duration,0,60,'video frame end')); else frameEndsComplete = false;
  }
  if (!clusters || !frames) fail('WebM has no actual video frame blocks');
  return {format:'webm',docType,codec:video.codec === 'V_VP9' ? 'vp9' : 'vp8',codecId:video.codec,width:video.width,height:video.height,
    videoTracks:1,videoFrames:frames,videoBlocks,clusters,firstVideoSeconds:first,lastVideoSeconds:last,
    lastVideoEndSeconds:frameEndsComplete && Number.isFinite(lastEnd) ? lastEnd : null,frameEndTimestampsComplete:frameEndsComplete,frameSpanSeconds:last - first,
    declaredDurationSeconds:declaredDuration === null ? null : bound(declaredDuration * scale / 1e9,0,60,'declared duration'),
    timestampScaleNanoseconds:scale,defaultFrameDurationNanoseconds:video.defaultDuration,monotonicBlockTimestamps:monotonic,lacedBlocks,inspectedNodes:nodes,
    scope:'Container video-block/frame inventory and timestamps only; no codec decode, visual quality or human acceptance.'};
}

async function writeBrowserArtifact({browser,artifactId,path:output,maxBytes}) {
  if (!browser || typeof browser.evaluate !== 'function' || typeof artifactId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/.test(artifactId)
      || typeof output !== 'string' || !path.isAbsolute(output)) fail('Explicit browser artifact and new absolute local path required');
  integer(maxBytes,1,MAX_BYTES,'artifact byte allowance');
  const id = JSON.stringify(artifactId), info = await browser.evaluate(`window.__actionVfxReview.artifactInfo(${id})`);
  if (!info || info.id !== artifactId || typeof info.mimeType !== 'string' || !/^[a-f0-9]{64}$/.test(info.sha256 || '')
      || !Number.isSafeInteger(info.bytes) || info.bytes < 1 || info.bytes > maxBytes || JSON.stringify(info).length > 16384) fail('Invalid bounded browser artifact metadata');
  const video = /^video\/webm(?:;|$)/i.test(info.mimeType), png = info.mimeType === 'image/png';
  if (!video && !png) fail('Only actual WebM/PNG capture artifacts are admitted');
  const bytes = Buffer.allocUnsafe(info.bytes), fd = fs.openSync(output,'wx',0o600); let offset = 0;
  try {
    while (offset < info.bytes) {
      const length = Math.min(65536,info.bytes - offset), values = await browser.evaluate(`window.__actionVfxReview.artifactChunk(${id},${offset},${length})`);
      if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype || values.length !== length || Reflect.ownKeys(values).length !== length + 1) fail('Truncated or invalid browser artifact chunk');
      for (let i = 0; i < length; i++) { const descriptor = Object.getOwnPropertyDescriptor(values,String(i)), v = descriptor?.value; if (!descriptor || !('value' in descriptor) || !Number.isInteger(v) || v < 0 || v > 255) fail('Sparse/accessor/invalid browser artifact bytes'); }
      const chunk = Buffer.from(values); chunk.copy(bytes,offset); let written = 0;
      while (written < chunk.length) { const count = fs.writeSync(fd,chunk,written,chunk.length - written); if (!count) fail('Artifact write made no progress'); written += count; }
      offset += length;
    }
    fs.fsyncSync(fd); if (fs.fstatSync(fd).size !== info.bytes) fail('Written artifact length differs from browser bytes');
  } finally { fs.closeSync(fd); }
  const digest = crypto.createHash('sha256').update(bytes).digest('hex'); if (digest !== info.sha256) fail('Actual browser artifact SHA-256 mismatch; retained file is not verified');
  let webm;
  if (video) {
    webm = inspectWebm(bytes);
    for (const key of ['selectedMimeType','actualMimeType']) if (info[key] !== undefined) { const match = /^video\/webm\s*;\s*codecs\s*=\s*"?(vp8|vp9)"?$/i.exec(info[key]); if (!match || match[1].toLowerCase() !== webm.codec) fail('Actual WebM codec differs from explicitly selected capture codec'); }
    if (info.width !== undefined && info.width !== webm.width || info.height !== undefined && info.height !== webm.height) fail('Actual WebM dimensions differ from capture metadata');
  } else if (bytes.length < 8 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail('Actual PNG signature is missing');
  const released = await browser.evaluate(`window.__actionVfxReview.artifactRelease(${id})`); if (released !== true) fail('Verified browser artifact could not release its retained bytes');
  return {...info,path:output,bytes:info.bytes,sha256:digest,...(webm ? {webm} : {}),released:true};
}

module.exports = {inspectWebm,writeBrowserArtifact};
