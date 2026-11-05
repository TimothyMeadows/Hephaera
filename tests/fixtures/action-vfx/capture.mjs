import {sha256} from '/source/.engine/threejs/particles/vfx-package.mjs';

// Original engineering browser capture only. No service upload, codec install,
// generated image, synthetic movie or human acceptance is supplied here.
export function createCaptureArtifacts({canvas, settings = {}}) {
  const video = {mimeType: 'video/webm;codecs=vp9', frameRate: 30, bitsPerSecond: 2000000, maxBytes: 16777216, maxSeconds: 30, ...settings};
  if (!['video/webm;codecs=vp9', 'video/webm;codecs=vp8'].includes(video.mimeType)
      || video.frameRate !== 30 || video.bitsPerSecond !== 2000000 || video.maxBytes !== 16777216 || video.maxSeconds !== 30)
    throw Error('Explicit bounded VP9/VP8 WebM engineering capture profile required');
  const records = new Map(); let retainedBytes = 0, active = null;
  const identifier = id => { if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/.test(id)) throw Error('Bounded capture artifact identity required'); };
  async function store(id, blob, metadata) {
    identifier(id); if (records.has(id) || records.size >= 512 || !blob.size || blob.size > video.maxBytes || retainedBytes + blob.size > 67108864) throw Error('Capture inventory or byte budget exceeded');
    const bytes = new Uint8Array(await blob.arrayBuffer()), info = Object.freeze({id, mimeType: blob.type, bytes: bytes.length, sha256: sha256(bytes), ...metadata});
    records.set(id, {bytes, info}); retainedBytes += bytes.length; return info;
  }
  const capabilities = () => ({captureStream: typeof canvas.captureStream === 'function', mediaRecorder: typeof MediaRecorder === 'function',
    selectedMimeType: video.mimeType, selectedCodecSupported: typeof MediaRecorder === 'function' && MediaRecorder.isTypeSupported(video.mimeType),
    frameRate: video.frameRate, bitsPerSecond: video.bitsPerSecond, maximumVideoBytes: video.maxBytes, maximumVideoSeconds: video.maxSeconds});
  async function beginVideo({id, seconds}) {
    identifier(id); if (active || records.has(id) || !Number.isFinite(seconds) || seconds <= 0 || seconds > video.maxSeconds) throw Error('Exclusive bounded normal-speed recording required');
    const ready = capabilities(); if (!ready.captureStream || !ready.mediaRecorder || !ready.selectedCodecSupported) throw Error('Selected existing browser WebM codec is unavailable: ' + JSON.stringify(ready));
    const stream = canvas.captureStream(video.frameRate), tracks = stream.getVideoTracks();
    if (tracks.length !== 1) { for (const track of stream.getTracks()) track.stop(); throw Error('One actual canvas video track required'); }
    let recorder;
    try { recorder = new MediaRecorder(stream, {mimeType: video.mimeType, videoBitsPerSecond: video.bitsPerSecond}); }
    catch (error) { for (const track of stream.getTracks()) track.stop(); throw error; }
    const state = {id, stream, recorder, chunks: [], bytes: 0, failure: null, started: performance.now(), seconds, timer: null};
    state.finished = new Promise(resolve => { recorder.addEventListener('stop', resolve, {once: true}); });
    recorder.addEventListener('dataavailable', event => {
      if (!event.data.size) return; state.bytes += event.data.size;
      if (state.bytes > video.maxBytes) { state.failure = Error('Actual WebM exceeded the fixed byte budget'); if (recorder.state !== 'inactive') recorder.stop(); }
      else state.chunks.push(event.data);
    });
    recorder.addEventListener('error', event => { state.failure = Error('Actual browser WebM recorder failed: ' + (event.error?.message || 'unknown')); if (recorder.state !== 'inactive') recorder.stop(); });
    state.timer = setTimeout(() => { state.failure = Error('Actual WebM exceeded the fixed wall-time budget'); if (recorder.state !== 'inactive') recorder.stop(); }, Math.ceil((seconds + 1) * 1000));
    active = state;
    try { recorder.start(250); tracks[0].requestFrame?.(); }
    catch (error) { clearTimeout(state.timer); for (const track of stream.getTracks()) track.stop(); active = null; throw error; }
    return {id, ...ready, actualMimeType: recorder.mimeType, actualTrackSettings: tracks[0].getSettings(), width: canvas.width, height: canvas.height};
  }
  async function finishVideo() {
    const state = active; if (!state) throw Error('No active actual recording');
    try {
      if (state.recorder.state !== 'inactive') state.recorder.stop(); await state.finished; clearTimeout(state.timer);
      if (state.failure) throw state.failure;
      const blob = new Blob(state.chunks, {type: state.recorder.mimeType});
      if (!blob.type.startsWith('video/webm')) throw Error('The selected encoder did not produce WebM');
      return await store(state.id, blob, {selectedMimeType: video.mimeType, actualMimeType: state.recorder.mimeType, frameRate: video.frameRate,
        requestedBitsPerSecond: video.bitsPerSecond, width: canvas.width, height: canvas.height, recordingWallSeconds: (performance.now() - state.started) / 1000,
        scope: 'Actual canvas MediaRecorder bytes during normal-speed original engineering playback; codec/container and span are independently checked by the Node writer.'});
    } finally { for (const track of state.stream.getTracks()) track.stop(); active = null; }
  }
  async function abortVideo() {
    if (!active) return; const state = active; state.failure ||= Error('Recording interrupted');
    try { if (state.recorder.state !== 'inactive') state.recorder.stop(); await state.finished; }
    finally { clearTimeout(state.timer); for (const track of state.stream.getTracks()) track.stop(); active = null; }
  }
  return Object.freeze({capabilities, beginVideo, finishVideo, abortVideo,
    async png(id) { const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('Actual canvas PNG capture failed')), 'image/png')); return store(id, blob, {width: canvas.width, height: canvas.height}); },
    info(id) { const record = records.get(id); if (!record) throw Error('Unknown actual capture artifact'); return record.info; },
    chunk(id, offset, length) { const record = records.get(id); if (!record?.bytes || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1 || length > 65536 || offset > record.bytes.length) throw Error('Bounded existing binary artifact chunk required'); return Array.from(record.bytes.subarray(offset, Math.min(offset + length, record.bytes.length))); },
    release(id) { const record = records.get(id); if (!record?.bytes) return false; retainedBytes -= record.bytes.length; record.bytes = null; return true; },
    stats() { return {artifacts: records.size, retainedBytes, recording: active !== null}; }
  });
}
