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
function png() {
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
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, 72, 140, 200, 128]))), chunk('IEND', Buffer.alloc(0))]);
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
  write(root, 'inputs/permission.txt', 'Owned original 1px PNG and minimal GLB test envelopes authored by this fixture. Synthetic evidence only.\n');
  const effect = packageAt(root, baseline);
  const revised = packageAt(root, baseline, { version: 'v2', prefix: 'inputs/effect-v2' });
  const noVisual = packageAt(root, baseline, { asset: 'missing-visual', prefix: 'inputs/no-visual' });
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
  const rights = write(root, 'inputs/rights.json', { schemaVersion: 'hephaera-vfx-rights/v1', origin: 'owned', holder: 'Hephaera synthetic QA author',
    permission: ref(root, 'inputs/permission.txt'), inputs: [...effect.resources, ...revised.resources, ...noVisual.resources], media: null });
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
    packagePath: effect.packagePath, revisedPackagePath: revised.packagePath, noVisualPackagePath: noVisual.packagePath, visual,
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
module.exports = { BASE, sha, write, ref, png, glb, packageAt, initialize, review };
if (require.main === module) {
  try {
    const [operation, root, ...args] = process.argv.slice(2);
    let result;
    if (operation === 'init' && root && args.length === 1) result = initialize(path.resolve(root), path.resolve(args[0]));
    else if (operation === 'review' && root && args.length === 5) result = { evidence: review(root, JSON.parse(fs.readFileSync(args[0], 'utf8')), args[1], args[2], args[3], args[4]) };
    else throw new Error('Fixture usage: init ROOT BASELINE | review ROOT STAGE_JSON PHASE REVIEWER VERDICT NAME');
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
