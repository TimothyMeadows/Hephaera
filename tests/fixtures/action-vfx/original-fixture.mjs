import {sha256, inspectVfxGeometry} from '../../../.engine/threejs/particles/vfx-package.mjs';
import {inspectVfxTexture} from '../../../.engine/threejs/particles/three-vfx-runtime.mjs';

// Original engineering data, with synthetic protocol admission. This is not
// human approval, native construction evidence, or a production model fixture.
const encoder = new TextEncoder();
export const jsonBytes = value => encoder.encode(JSON.stringify(value));
export const HASH = 'a'.repeat(64);
export const engineSelection = Object.freeze({effectiveEngine: 'THREEJS', contractSha256: '1'.repeat(64),
  definitionSha256: '2'.repeat(64), registrySha256: '3'.repeat(64), particles: {package: 'three.quarks', backend: 'THREE_QUARKS'}});
export const vfxBudgets = Object.freeze({maxSystems: 64, maxParticles: 1024, maxTrailPoints: 1024, maxVertices: 100000,
  maxIndices: 300000, maxDrawCalls: 64, maxTextureBytes: 1048576, maxBufferBytes: 33554432,
  maxDurationSeconds: 4, maxUpdateSeconds: .1});
export const deltaPolicy = Object.freeze({exceptionalDelta: 'reject', maxDeltaSeconds: 1, maxSubstepSeconds: .1,
  hidden: 'pause', resume: 'discard-backlog'});
const ref = (path, bytes) => ({path, sha256: sha256(bytes)});
function glb(document, binary = new Uint8Array()) {
  const json = jsonBytes(document), jsonLength = Math.ceil(json.length / 4) * 4, binLength = Math.ceil(binary.length / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength + (binLength ? 8 + binLength : 0)), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true); bytes.fill(32, 20, 20 + jsonLength); bytes.set(json, 20);
  if (binLength) { view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true); bytes.set(binary, 28 + jsonLength); }
  return bytes;
}
function modelBytes() {
  const binary = new Uint8Array(new Float32Array([0, 1, 0, 0, 0, 2, 0, 0]).buffer);
  return glb({asset: {version: '2.0', generator: 'Original Hephaera CPU engineering fixture'}, scene: 0, scenes: [{nodes: [0]}],
    nodes: [{name: 'Asset', children: [1]}, {name: 'Root', children: [2]}, {name: 'Hand', children: [3]}, {name: 'anchor.hand'}],
    buffers: [{byteLength: binary.length}], bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 8}, {buffer: 0, byteOffset: 8, byteLength: 24}],
    accessors: [{bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1]}, {bufferView: 1, componentType: 5126, count: 2, type: 'VEC3'}],
    animations: [{name: 'cast', samplers: [{input: 0, output: 1, interpolation: 'LINEAR'}], channels: [{sampler: 0, target: {node: 2, path: 'translation'}}]}]}, binary);
}
function geometryBytes() {
  const binary = new Uint8Array(new Float32Array([-.1, 0, 0, .1, 0, 0, 0, .2, 0]).buffer);
  return glb({asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}], nodes: [{mesh: 0}],
    buffers: [{byteLength: binary.length}], bufferViews: [{buffer: 0, byteLength: binary.length}],
    accessors: [{bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-.1, 0, 0], max: [.1, .2, 0]}],
    meshes: [{primitives: [{attributes: {POSITION: 0}}]}]}, binary);
}
function source(THREE, family) {
  // Original one-pixel white RGBA PNG. The decoded resource is independently
  // declared and compared to a concrete borrowed DataTexture below.
  const textureBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII='), character => character.charCodeAt(0));
  const meshBytes = geometryBytes(), texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true;
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.1, 0, 0, .1, 0, 0, 0, .2, 0], 3));
  const resources = [{id: 'texture', kind: 'texture-png', path: 'white.png', bytes: textureBytes.length, sha256: sha256(textureBytes)}];
  if (family === 'mesh') resources.push({id: 'mesh', kind: 'mesh-glb', path: 'triangle.glb', bytes: meshBytes.length, sha256: sha256(meshBytes)});
  const layer = {id: family, kind: family, startSeconds: 0, durationSeconds: 2, resourceIds: family === 'beam' ? [] : family === 'mesh' ? ['mesh'] : ['texture'],
    maxParticles: 16, maxVertices: 10000, maxDrawCalls: 1, maxTrailPoints: family === 'trail' ? 32 : 0};
  const layers = [layer];
  if (family === 'beam' || family === 'mesh') layers.push({...layer, id: 'unused', kind: 'sprite', resourceIds: ['texture'], maxTrailPoints: 0});
  const native = {schemaVersion: 'bubo-vfx-package/v1', id: family, version: 'v1', styleSha256: HASH,
    engine: {id: 'THREEJS', contractSha256: engineSelection.contractSha256, definitionSha256: engineSelection.definitionSha256, registrySha256: engineSelection.registrySha256},
    budgets: {maxPackageBytes: 1048576, maxDependencyBytes: 65536, maxTotalDependencyBytes: 131072, maxDependencies: 2, maxEffects: 1,
      maxLayers: 16, maxParticles: 1024, maxVertices: 200000, maxDrawCalls: 32, maxTrailPoints: 1024, maxDurationSeconds: 4},
    resources, effects: [{id: 'cast', durationSeconds: 2, layers}]};
  const packageBytes = jsonBytes(native), packageSha256 = sha256(packageBytes);
  const profile = {schemaVersion: 'hephaera-three-vfx-profile/v1', nativePackageSha256: packageSha256, budgets: {...vfxBudgets},
    layers: [{effectId: 'cast', layerId: family, family, emission: {kind: 'burst', capacity: family === 'trail' ? 2 : 4,
      count: 1, rate: 0, lifetimeSeconds: .5, durationSeconds: family === 'sprite' ? .375 : family === 'impact' ? .125 : .5}, size: .2, speed: 0, color: [1, .5, .25, 1], space: 'world', maxTailSeconds: .5,
      ...(family === 'mesh' ? {geometry: {kind: 'binding', resourceId: 'mesh'}} : family === 'beam' ? {} : {resourceId: 'texture'}),
      ...(['ring', 'ground-indicator'].includes(family) ? {geometry: {kind: 'ring', innerRadius: .1, outerRadius: .2, segments: 16}} : {}),
      ...(family === 'trail' ? {trail: {historyPoints: 8}} : {})}]};
  const profileBytes = jsonBytes(profile), pixels = inspectVfxTexture(texture), measured = inspectVfxGeometry(geometry);
  const correspondences = resources.map(resource => {
    const isTexture = resource.kind === 'texture-png';
    const report = {schemaVersion: 'bubo-vfx-resource-correspondence/v1', resourceId: resource.id, resourceSha256: resource.sha256,
      kind: isTexture ? 'texture' : 'geometry', decodedSha256: isTexture ? pixels.pixelsSha256 : measured.sha256, independent: true,
      measurements: isTexture ? {bytes: 4, width: 1, height: 1} : {bytes: measured.bytes, vertices: measured.vertices, indices: measured.indices}, sourceEvidenceSha256: HASH};
    const bytes = jsonBytes(report), path = `effects/${family}/${resource.id}-correspondence.json`;
    return {resourceId: resource.id, bytes, reference: {resourceId: resource.id, resourceSha256: resource.sha256,
      kind: report.kind, decodedSha256: report.decodedSha256, report: {...ref(path, bytes), bytes: bytes.length}}};
  });
  const bindings = resources.map(resource => resource.kind === 'texture-png' ? {id: resource.id, sha256: resource.sha256, texture, width: 1, height: 1,
    colorSpace: 'srgb', alpha: 'straight', review: {resourceSha256: resource.sha256, pixelsSha256: pixels.pixelsSha256, independent: true,
      sourceEvidence: {path: `effects/${family}/texture-correspondence.json`, sha256: sha256(correspondences.find(value => value.resourceId === resource.id).bytes)}}} :
    {id: resource.id, sha256: resource.sha256, geometry, review: {resourceSha256: resource.sha256, geometrySha256: measured.sha256,
      maxVertices: 10000, maxIndices: 10000, maxBytes: 1048576, independent: true, sourceEvidence: {path: `effects/${family}/mesh-correspondence.json`, sha256: sha256(correspondences.find(value => value.resourceId === resource.id).bytes)}}});
  return {id: family, packageBytes, profileBytes, resourceBytes: resources.map(resource => ({id: resource.id, bytes: resource.kind === 'texture-png' ? textureBytes : meshBytes})),
    correspondenceBytes: correspondences.map(({resourceId, bytes}) => ({resourceId, bytes})), bindings, texture, geometry,
    reference: {id: family, effectId: 'cast', package: ref(`effects/${family}/package.json`, packageBytes),
      profile: {schemaVersion: profile.schemaVersion, ...ref(`effects/${family}/profile.json`, profileBytes)},
      resources: resources.map(resource => ({...resource, path: `effects/${family}/${resource.path}`})), correspondences: correspondences.map(value => value.reference),
      ancestry: {sourceClosureSha256: HASH, productionReviewSha256: HASH, rightsSha256: HASH}}};
}
export function originalFixture(THREE, {families = ['sprite', 'projectile', 'trail', 'impact'], mutate} = {}) {
  const sources = families.map(family => source(THREE, family)), model = modelBytes();
  const transform = {units: 'meters', up: '+Y', forward: '+Z', handedness: 'right', position: [0, 0, 0], orientation: [0, 0, 0, 1], scale: 1, parentScale: 'positive-uniform'};
  const cue = (id, source, start, stopAt, retireAt, placement) => ({id, type: 'effect', source, anchor: 'hand', start, end: stopAt,
    placement, ...(['fixed-target-projectile', 'beam', 'fixed-target'].includes(placement) ? {target: 'fixed'} : {}), transform: {...transform},
    lifetime: {tailSeconds: retireAt - stopAt, pause: 'follow-action', tailAttachment: 'capture-world-on-stop', cancel: 'retire-generation'},
    ...(source === 'trail' ? {trail: {reset: 'teleport-or-discontinuity', maxSamples: 8, distanceMeters: 1}} : {}),
    retireAt, layers: [{id: source, family: source, space: 'world', start, stopAt, retireAt, emissionDurationSeconds: stopAt - start,
      particleLifetimeSeconds: .5, tailSeconds: retireAt - stopAt}]});
  const cues = families.map(family => family === 'sprite' ? cue('charge', family, 0, .375, .375, 'anchor-follow') : family === 'impact' ? cue('impact', family, .875, 1, 1.25, 'fixed-target') :
    family === 'beam' ? cue('beam', family, .375, .875, 1.125, 'beam') : cue(family, family, .375, .875, 1.125, family === 'projectile' ? 'fixed-target-projectile' : 'anchor-follow'));
  const pkg = {schemaVersion: 'hephaera-action-package/v2', asset: 'original-cpu-fixture', version: 'v1', profile: 'rigid', fps: 8,
    rig: {id: HASH, rootNode: 'Root'}, coordinateSystem: {runtimeUp: '+Y', runtimeForward: '+Z', units: 'meters', handedness: 'right', parentScale: 'positive-uniform'},
    sourceMotion: {rigId: HASH, packageSha256: HASH, modelSha256: sha256(model), clips: [{id: 'source-cast', motionSha256: HASH}]},
    anchors: [{id: 'hand', node: 'anchor.hand', parent: 'Hand', position: [0, 0, 0]}], targets: [{id: 'fixed', mode: 'fixed-world-point', maxDistance: 20}],
    budgets: {maxActions: 16, maxStepsPerAction: 64, maxExpandedSteps: 256, maxActionSeconds: 120, maxEffects: 64, maxParticles: 2048,
      maxFrames: 20000, maxReviewFrames: 1200, maxRuntimeBytes: 33554432, timeoutSeconds: 180, maxLogBytes: 16777216, maxAttempts: 16,
      maxEffectSources: 16, maxEffectFiles: 128, maxEffectDependencyBytes: 1048576, maxEffectJsonBytes: 1048576, maxTailSeconds: 1, maxTrailSamples: 64, maxVerificationBytes: 8589934592},
    actions: [{id: 'cast', role: 'presentation', clip: 'cast', duration: 1, motionSha256: HASH, retireAt: 1.25,
      steps: [{id: 'cast', clip: 'source-cast', occurrence: 0, start: 0, end: 1, sourceStart: 0, sourceEnd: 1, rate: 1, blendIn: 0, motionSha256: HASH}],
      markers: [{id: 'release', at: .375, name: 'release', step: 'cast', occurrence: 0}], cues}],
    effectSources: sources.map(value => value.reference), effectClosureSha256: HASH,
    engine: structuredClone(engineSelection),
    model: ref('model.glb', model), source: {path: 'original-source.blend', sha256: HASH}, motion: {path: 'original-motion.json', sha256: HASH}};
  mutate?.(pkg, sources);
  const packageBytes = jsonBytes(pkg), packageSha256 = sha256(packageBytes);
  const nativeAdmission = {schemaVersion: 'hephaera-action-v2-admission/v1', operation: 'validate', status: 'verified', mode: 'review', sourceKind: 'native-source-export', engine: pkg.engine,
    packageSha256, modelSha256: sha256(model), effectClosureSha256: pkg.effectClosureSha256, runtimeBuildSha256: HASH,
    nativeVerification: {path: 'evidence/synthetic-native.json', sha256: HASH}, hostContext: {path: 'evidence/synthetic-context.json', sha256: HASH}, manifest: {path: 'evidence/synthetic-manifest.json', sha256: HASH}};
  return {package: pkg, input: {packageBytes, packageSha256, modelBytes: model, nativeAdmission,
    effectSources: sources.map(({id, packageBytes, profileBytes, resourceBytes, correspondenceBytes, bindings}) => ({id, packageBytes, profileBytes, resourceBytes, correspondenceBytes, bindings}))},
    sources, release() { for (const value of sources) { value.texture.dispose(); value.geometry.dispose(); } }};
}
export function originalActor(THREE, scene, x = 10) {
  const movement = new THREE.Group(), visual = new THREE.Group(), root = new THREE.Group(), hand = new THREE.Group(), anchor = new THREE.Group();
  movement.position.x = x; scene.add(movement); movement.add(visual); visual.name = 'Asset'; visual.add(root); root.name = 'Root'; root.add(hand); hand.name = 'Hand'; hand.add(anchor); anchor.name = 'anchorhand'; anchor.userData.name = 'anchor.hand';
  const animations = [new THREE.AnimationClip('cast', 1, [new THREE.VectorKeyframeTrack('Hand.position', [0, 1], [0, 0, 0, 2, 0, 0])])];
  return {movement, visual, root, hand, anchor, animations};
}
