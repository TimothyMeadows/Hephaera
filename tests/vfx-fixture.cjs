'use strict';

// Original, local protocol fixtures. The tiny images and empty geometry envelope
// establish no visual quality, human acceptance, or production license evidence.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const BASE = path.resolve(__dirname, '..');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function write(root, name, value) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  return name;
}
const ref = (root, name) => ({ path: name, sha256: sha(path.join(root, name)) });
function png(width = 1, height = 1, pixels = Buffer.from([72, 140, 200, 128])) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || pixels.length !== width * height * 4)
    throw new Error('Invalid owned fixture PNG dimensions/pixels.');
  function chunk(type, data) {
    const tag = Buffer.from(type), size = Buffer.alloc(4), crcBytes = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    let crc = 0xffffffff;
    for (const byte of Buffer.concat([tag, data])) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crcBytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, tag, data, crcBytes]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row++) Buffer.from(pixels).copy(scanlines, row * (width * 4 + 1) + 1, row * width * 4, (row + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}
function preparationAt(root, baseline, {asset = 'prepared-effect', version = 'v1', prefix = 'inputs/preparation', profile = 'sequence'} = {}) {
  const engine = require(path.join(baseline, 'commands/lib/engine-contract.cjs')).resolve(root);
  // Independent original corner/color/alpha patterns. Three 2x3 frames produce
  // a padded 3x1 non-square atlas; no generated/provider assets are involved.
  const frames = Array.from({length: 3}, (_, frame) => Buffer.from(Array.from({length: 24}, (_, index) =>
    index % 4 === 3 ? [0, 63, 173, 255][(Math.floor(index / 4) + frame) % 4] : (17 + index * 23 + frame * 59) % 256)));
  let sources = frames.map((pixels, index) => {
    const file = write(root, prefix + '/frame-' + index + '.png', png(2, 3, pixels));
    return {...ref(root, file), bytes: fs.statSync(path.join(root, file)).size};
  });
  const request = {schemaVersion: 'bubo-vfx-preparation/v1', id: asset, version,
    styleSha256: sha(path.join(root, 'STYLE.md')), engine: {id: engine.effectiveEngine, contractSha256: engine.contractSha256,
      definitionSha256: engine.definitionSha256, registrySha256: engine.registrySha256}, profile, sources,
    timing: {firstFrame: 0, frameCount: 3, frameStep: 1, rateNumerator: 30000, rateDenominator: 1001, loop: 'repeat'},
    atlas: {columns: 3, padding: 1, extrusion: 1, alpha: 'straight', colorSpace: 'srgb'},
    budgets: {maxSourceBytes: 4096, maxTotalSourceBytes: 16384, maxChunkBytes: 4096, maxCompressedBytes: 4096,
      maxFrames: 8, maxDecodedPixels: 4096, maxAtlasPixels: 65536, maxPixelWork: 1048576, maxWorkingBytes: 33554432,
      maxOutputBytes: 1048576, maxOutputFiles: 16, maxSeconds: 15, minimumFreeDiskBytes: 0}};
  if (profile === 'sheet') {
    const pixels = Buffer.alloc(8 * 3 * 4);
    for (let frame = 0; frame < frames.length; frame++) for (let row = 0; row < 3; row++)
      frames[frame].copy(pixels, (row * 8 + frame * 3) * 4, row * 8, (row + 1) * 8);
    const file = write(root, prefix + '/sheet.png', png(8, 3, pixels));
    sources = [{...ref(root, file), bytes: fs.statSync(path.join(root, file)).size}];
    request.sources = sources;
    request.sheet = {columns: 3, rows: 1, cellWidth: 2, cellHeight: 3, originX: 0, originY: 0,
      strideX: 3, strideY: 3, frameIndices: [2, 0, 1]};
    request.timing.loop = 'once';
  }
  if (profile === 'math-mask') {
    sources = []; request.sources = [];
    request.timing.frameCount = 1; request.timing.loop = 'once'; request.atlas.columns = 1;
    request.mask = {kind: 'disc', width: 4000, height: 4000, innerRadius: 0, outerRadius: .8, softness: .2, angleDegrees: 0};
    Object.assign(request.budgets, {maxFrames: 1, maxDecodedPixels: 16777216, maxAtlasPixels: 16777216,
      maxPixelWork: 134217728, maxWorkingBytes: 268435456, maxOutputBytes: 134217728});
  }
  return {asset, version, requestPath: write(root, prefix + '/request.json', request), sources: sources.map(({path, sha256}) => ({path, sha256})), request};
}
function decodeFixturePng(bytes) {
  // An independent bounded RGBA8 fixture decoder, deliberately separate from
  // Bubo's implementation; no image modules, metadata claims or native code.
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Fixture PNG signature');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), chunks = [];
  if (width * height > 65536 || bytes[24] !== 8 || bytes[25] !== 6 || bytes[28] !== 0) throw new Error('Fixture decoder supports bounded non-interlaced RGBA8 only');
  for (let offset = 8; offset < bytes.length;) {
    const count = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (count > 1048576 || offset + 12 + count > bytes.length) throw new Error('Fixture PNG chunk limit');
    if (kind === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + count));
    offset += 12 + count;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks), {maxOutputLength: (width * 4 + 1) * height});
  if (raw.length !== (width * 4 + 1) * height) throw new Error('Fixture PNG decoded size');
  const pixels = Buffer.alloc(width * height * 4), stride = width * 4;
  const paeth = (a,b,c) => { const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; if (filter > 4) throw new Error('Fixture PNG filter');
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, a = x >= 4 ? pixels[at-4] : 0, b = y ? pixels[at-stride] : 0, c = y && x >= 4 ? pixels[at-stride-4] : 0;
      pixels[at] = (raw[y * (stride + 1) + x + 1] + [0, a, b, Math.floor((a+b)/2), paeth(a,b,c)][filter]) & 255;
    }
  }
  return {width, height, pixels};
}
function glb() {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }] }));
  const padded = (json.length + 3) & ~3, output = Buffer.alloc(12 + 8 + padded + 8 + 4);
  output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded, 12); output.writeUInt32LE(0x4e4f534a, 16);
  output.fill(0x20, 20, 20 + padded); json.copy(output, 20);
  output.writeUInt32LE(4, 20 + padded); output.writeUInt32LE(0x004e4942, 24 + padded);
  return output;
}
function packageAt(root, baseline, { asset = 'owned-effect', version = 'v1', prefix = 'inputs/effect' } = {}) {
  const engine = require(path.join(baseline, 'commands/lib/engine-contract.cjs')).resolve(root);
  const texture = prefix + '/textures/spark.png', mesh = prefix + '/meshes/shard.glb';
  write(root, texture, png()); write(root, mesh, glb());
  write(root, prefix + '/unreferenced.txt', 'This undeclared sibling must never be staged.\n');
  const resource = (id, kind, file, relative) => ({ id, kind, path: relative, sha256: sha(path.join(root, file)), bytes: fs.statSync(path.join(root, file)).size });
  const declaration = { schemaVersion: 'bubo-vfx-package/v1', id: asset, version, styleSha256: sha(path.join(root, 'STYLE.md')),
    engine: { id: engine.effectiveEngine, contractSha256: engine.contractSha256, definitionSha256: engine.definitionSha256, registrySha256: engine.registrySha256 },
    budgets: { maxPackageBytes: 65536, maxDependencyBytes: 4096, maxTotalDependencyBytes: 8192, maxDependencies: 2,
      maxEffects: 1, maxLayers: 2, maxParticles: 32, maxVertices: 128, maxDrawCalls: 4, maxTrailPoints: 16, maxDurationSeconds: 4 },
    resources: [resource('spark', 'texture-png', texture, 'textures/spark.png'), resource('shard', 'mesh-glb', mesh, 'meshes/shard.glb')],
    effects: [{ id: 'cast', durationSeconds: 2, layers: [
      { id: 'charge', kind: 'sprite', startSeconds: 0, durationSeconds: 1, resourceIds: ['spark'], maxParticles: 16, maxVertices: 32, maxDrawCalls: 1, maxTrailPoints: 0 },
      { id: 'release', kind: 'mesh', startSeconds: 1, durationSeconds: 1, resourceIds: ['shard'], maxParticles: 0, maxVertices: 64, maxDrawCalls: 1, maxTrailPoints: 0 }
    ] }] };
  const packagePath = write(root, prefix + '/package.json', declaration);
  return { packagePath, declaration, resources: [ref(root, texture), ref(root, mesh)] };
}
function initialize(root, baseline = BASE) {
  fs.mkdirSync(root, { recursive: true });
  write(root, 'STYLE.md', fs.readFileSync(path.join(baseline, 'STYLE.md'), 'utf8').replaceAll('./.styles/', './.hephaera/.styles/'));
  write(root, 'ENGINE.md', '# ENGINE.md\n\nSelected Hephaera engine:\n- THREEJS\n\nRead `./.hephaera/.engine/THREEJS.md` instructions\n');
  write(root, 'ARCHITECTURE.md', '# ARCHITECTURE.md\n\nOwned isolated lifecycle protocol fixture.\n');
  write(root, '.hephaera/.cache/tasks/qa/TASK.md', '# Owned VFX protocol QA\n\nSynthetic fixture only; no human visual acceptance or production promotion.\n');
  write(root, 'MEDIA.md', 'Deliberately invalid unrelated MEDIA fixture. Owned input inspection must not load this.\n');
  write(root, 'AUDIO.md', 'Unrelated private audio policy sentinel.\n');
  write(root, 'inputs/permission.txt', 'Owned original PNG color/alpha patterns and minimal GLB test envelopes authored by this fixture. Synthetic evidence only.\n');
  const effect = packageAt(root, baseline);
  const revised = packageAt(root, baseline, { version: 'v2', prefix: 'inputs/effect-v2' });
  const noVisual = packageAt(root, baseline, { asset: 'missing-visual', prefix: 'inputs/no-visual' });
  const interrupted = packageAt(root, baseline, { asset: 'interrupted-effect', prefix: 'inputs/interrupted' });
  const interruptedRevision = packageAt(root, baseline, { asset: 'interrupted-effect', version: 'v2', prefix: 'inputs/interrupted-v2' });
  const prepared = preparationAt(root, baseline);
  const preparedProvisional = packageAt(root, baseline, {asset: prepared.asset, prefix: 'inputs/prepared-provisional'});
  const sheet = preparationAt(root, baseline, {asset: 'prepared-sheet', prefix: 'inputs/preparation-sheet', profile: 'sheet'});
  const sheetProvisional = packageAt(root, baseline, {asset: sheet.asset, prefix: 'inputs/sheet-provisional'});
  const composed = preparationAt(root, baseline, {asset: 'prepared-composition', prefix: 'inputs/preparation-composition'});
  const composedProvisional = packageAt(root, baseline, {asset: composed.asset, prefix: 'inputs/composition-provisional'});
  const interruptedPreparation = preparationAt(root, baseline, {asset: 'interrupted-native-preparation',
    prefix: 'inputs/preparation-interrupted', profile: 'math-mask'});
  const bindings = ['model', 'rig', 'clip', 'marker', 'transform'].map(kind => {
    const file = 'inputs/bindings/' + kind + (kind === 'model' ? '.glb' : '.json');
    write(root, file, kind === 'model' ? glb() : { fixture: kind, synthetic: true, notRuntimeEvidence: true });
    return { kind, ...ref(root, file) };
  });
  const brief = write(root, 'inputs/brief.json', { schemaVersion: 'hephaera-vfx-brief/v1', intent: 'Owned protocol fixture; no real visual quality or runtime acceptance.', coverage: ['start', 'end'], bindings,
    presentation: { camera: 'synthetic side view', viewDistanceMetres: 5, modelRelativeSize: 1, attachments: [], events: [], occupiedRegions: [], clearRegions: [], blendingRequirements: [] },
    budgets: { maxParticles: 1000, maxSystems: 32, maxTrailPoints: 1000, maxVertices: 10000, maxDrawCalls: 128, maxLights: 0,
      maxTextureBytes: 1048576, maxOutputBytes: 2097152, maxDurationSeconds: 30, maxConcurrency: 1, maxProcessingSeconds: 60, maxCandidates: 3, maxRevisions: 3 },
    accessibility: { qualityVariants: ['low', 'high'], reducedMotion: 'disable trails', reducedFlash: 'soft pulses', contrast: 'visible shape', colorIndependent: 'shape cues' },
    targets: [{ id: 'desktop', description: 'Synthetic declared target only; not executed.', frameBudgetMs: 16.67, memoryBudgetBytes: 16777216 }] });
  const interruptionBrief = JSON.parse(fs.readFileSync(path.join(root, brief), 'utf8'));
  interruptionBrief.budgets.maxOutputBytes = 134217728;
  interruptionBrief.budgets.maxTextureBytes = 134217728;
  interruptedPreparation.brief = write(root, 'inputs/interrupted-preparation-brief.json', interruptionBrief);
  const rights = write(root, 'inputs/rights.json', { schemaVersion: 'hephaera-vfx-rights/v1', origin: 'owned', holder: 'Hephaera synthetic QA author',
    permission: ref(root, 'inputs/permission.txt'), inputs: [...effect.resources, ...revised.resources, ...noVisual.resources, ...interrupted.resources, ...interruptedRevision.resources,
      ...prepared.sources, ...preparedProvisional.resources, ...sheet.sources, ...sheetProvisional.resources,
      ...composed.sources, ...composedProvisional.resources], media: null });
  write(root, 'inputs/scene.json', { fixture: 'synthetic-no-scene-render' });
  write(root, 'inputs/camera.json', { fixture: 'synthetic-no-camera-render' });
  write(root, 'inputs/settings.json', { fixture: 'synthetic-no-renderer-execution' });
  const dependencies = ['backend', 'driver', 'renderer'].map(role => {
    const file = write(root, 'inputs/environment/' + role + '.json', { role, fixture: 'synthetic-identity-only', executed: false });
    return { role, ...ref(root, file) };
  });
  write(root, 'inputs/captures/start.png', png()); write(root, 'inputs/captures/end.png', png());
  const visual = write(root, 'inputs/visual.json', { schemaVersion: 'hephaera-vfx-visual/v1',
    environment: { backend: 'synthetic-protocol-fixture', driver: 'not-executed', renderer: 'not-executed', dependencies,
      scene: ref(root, 'inputs/scene.json'), camera: ref(root, 'inputs/camera.json'), settings: ref(root, 'inputs/settings.json') },
    artifacts: [{ ...ref(root, 'inputs/captures/start.png'), coverage: ['start'] }, { ...ref(root, 'inputs/captures/end.png'), coverage: ['end'] }] });
  return { task: 'qa', asset: 'owned-effect', version: 'v1', creator: 'fixture-author', brief, rights,
    packagePath: effect.packagePath, revisedPackagePath: revised.packagePath, noVisualPackagePath: noVisual.packagePath,
    interruptionPackagePath: interrupted.packagePath, interruptionRevisionPackagePath: interruptedRevision.packagePath, visual,
    preparation: {...prepared, provisionalPackagePath: preparedProvisional.packagePath},
    sheetPreparation: {...sheet, provisionalPackagePath: sheetProvisional.packagePath},
    composedPreparation: {...composed, provisionalPackagePath: composedProvisional.packagePath},
    interruptedPreparation,
    manifest: '.hephaera/.cache/tasks/qa/vfx/owned-effect/v1/manifest.json',
    revisedManifest: '.hephaera/.cache/tasks/qa/vfx/owned-effect/v2/manifest.json' };
}
function review(root, staged, phase, reviewer = 'fixture-independent', verdict = 'accepted', name = phase + '-' + verdict) {
  const source = write(root, 'inputs/reviews/' + name + '-notes.txt', 'Synthetic independent protocol assertion only. No actual visual review or human/runtime acceptance.\n');
  const evidence = write(root, 'inputs/reviews/' + name + '.json', { schemaVersion: 'hephaera-vfx-review/v1', phase,
    reviewPacketSha256: staged.reviewPacket.sha256, reviewer, verdict, independenceConfirmed: true,
    sourceEvidence: ref(root, source), findings: 'Synthetic QA tests exact packet binding only; no production or human quality claim.' });
  return evidence;
}
module.exports = { BASE, sha, write, ref, png, decodeFixturePng, glb, packageAt, preparationAt, initialize, review };
if (require.main === module) {
  try {
    const [operation, root, ...args] = process.argv.slice(2);
    let result;
    if (operation === 'init' && root && args.length === 1) result = initialize(path.resolve(root), path.resolve(args[0]));
    else if (operation === 'review' && root && args.length === 5) result = { evidence: review(root, JSON.parse(fs.readFileSync(args[0], 'utf8')), args[1], args[2], args[3], args[4]) };
    else if (operation === 'pixels' && root && args.length === 0) { const image = decodeFixturePng(fs.readFileSync(root)); result = {...image, pixels: [...image.pixels]}; }
    else throw new Error('Fixture usage: init ROOT BASELINE | review ROOT STAGE_JSON PHASE REVIEWER VERDICT NAME');
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
