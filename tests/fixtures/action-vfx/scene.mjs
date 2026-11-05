import * as THREE from 'three';
import * as Quarks from 'three.quarks';
import * as Postprocessing from 'postprocessing';
import {GLTFLoader} from '/deps/three/examples/jsm/loaders/GLTFLoader.js';
import {clone as skeletonClone} from '/deps/three/examples/jsm/utils/SkeletonUtils.js';
import {createThreeVfxRuntime, inspectVfxTexture} from '/source/.engine/threejs/particles/three-vfx-runtime.mjs';
import {inspectVfxGeometry, sha256} from '/source/.engine/threejs/particles/vfx-package.mjs';
import {createThreeActionScene} from '/source/.engine/threejs/actions/action-v2.mjs';
import {createPostprocessingRuntime} from '/source/.engine/threejs/postprocessing/postprocessing-runtime.mjs';
import {advancePresentationTo} from './advance.mjs';
import {createCaptureArtifacts} from './capture.mjs';
import {createGlbPoseOracle} from './pose-oracle.mjs';
import {fitCameraToBox, boxCorners, projectionEvidence} from './camera-fit.mjs';

const decoder = new TextDecoder('utf-8', {fatal: true});
const read = async name => {
  if (typeof name !== 'string' || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..') || /^[a-z]+:/i.test(name)) throw Error('Explicit local asset path required');
  const response = await fetch('/assets/' + name); if (!response.ok) throw Error('Required original fixture unavailable: ' + name);
  const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > 64 * 1024 * 1024) throw Error('Fixture input exceeds finite byte limit'); return bytes;
};
const json = async name => JSON.parse(decoder.decode(await read(name)));
// Independent fixed RGBA8 PNG decoder for the original controlled fixture.
// This explicit profile neither loads an image service nor silently substitutes
// an image when source/decoded correspondence fails.
async function rgbaPng(bytes) {
  if (bytes.length < 33 || ![137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)) throw Error('Fixture PNG signature');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 4096 || height > 4096 || bytes[24] !== 8 || bytes[25] !== 6 || bytes[26] || bytes[27] || bytes[28]) throw Error('Only bounded noninterlaced RGBA8 fixture PNG is selected');
  const chunks = []; let compressedBytes = 0;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset), type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (offset + 12 + length > bytes.length) throw Error('Truncated PNG chunk');
    if (type === 'IDAT') { chunks.push(bytes.slice(offset + 8, offset + 8 + length)); compressedBytes += length; }
    offset += 12 + length;
  }
  if (!compressedBytes || compressedBytes > 64 * 1024 * 1024) throw Error('Bounded PNG compressed data required');
  const compressed = new Uint8Array(compressedBytes); let offset = 0; for (const chunk of chunks) { compressed.set(chunk, offset); offset += chunk.length; }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')), reader = stream.getReader(), expected = height * (width * 4 + 1), scan = new Uint8Array(expected); offset = 0;
  try { for (;;) { const {value, done} = await reader.read(); if (done) break; if (offset + value.length > expected) throw Error('PNG decoded-byte limit exceeded'); scan.set(value, offset); offset += value.length; } }
  finally { await reader.cancel(); }
  if (offset !== expected) throw Error('Incomplete PNG scanlines');
  const pixels = new Uint8Array(width * height * 4), stride = width * 4;
  const paeth = (a, b, c) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = scan[y * (stride + 1)]; if (filter > 4) throw Error('Unknown PNG scanline filter');
    for (let x = 0; x < stride; x++) { const i = y * stride + x, a = x >= 4 ? pixels[i - 4] : 0, b = y ? pixels[i - stride] : 0, c = y && x >= 4 ? pixels[i - stride - 4] : 0;
      pixels[i] = scan[y * (stride + 1) + 1 + x] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]; }
  }
  return {pixels, width, height};
}
const loader = new GLTFLoader();
const gltf = bytes => loader.parseAsync(bytes.slice().buffer, '');
window.__actionVfxReady = false;
try {
  const fixture = await json('fixture.json'), renderer = new THREE.WebGLRenderer({canvas: document.querySelector('#view'), alpha: false, antialias: false, preserveDrawingBuffer: true});
  const captureArtifacts = createCaptureArtifacts({canvas: renderer.domElement, settings: fixture.captureSettings?.video});
  renderer.setPixelRatio(1); renderer.setSize(960, 540, false); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  const gl = renderer.getContext(); if (!renderer.capabilities.isWebGL2 && !(gl instanceof WebGL2RenderingContext)) throw Error('Actual selected WebGL2 is required');
  const extension = gl.getExtension('WEBGL_debug_renderer_info'), driver = {webgl: gl.getParameter(gl.VERSION), glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : 'unavailable', renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable', maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)};
  const shaderErrors = []; renderer.debug.onShaderError = (context, program, vertex, fragment) => shaderErrors.push({program: context.getProgramInfoLog(program), vertex: context.getShaderInfoLog(vertex), fragment: context.getShaderInfoLog(fragment)});
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101720);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x67788a, 3)); const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(2, 5, 4); scene.add(light);
  const camera = new THREE.PerspectiveCamera(38, 960 / 540, .01, 1000), events = [], traces = [], loaded = new Map(), borrowed = [], releaseMovements = new Map(), releaseProofs = new Map(), sourceSkeletons = new Set();
  const engineSelection = fixture.engineSelection, runtimeStarted = performance.now(), service = createThreeVfxRuntime({THREE, Quarks, scene, renderer, engineSelection, budgets: fixture.budgets});
  const runtime = createThreeActionScene({THREE, scene, vfxRuntime: service, engineSelection, budgets: fixture.sceneBudgets,
    deltaPolicy: fixture.deltaPolicy || {exceptionalDelta: 'reject', maxDeltaSeconds: 1, maxSubstepSeconds: .1, hidden: 'pause', resume: 'discard-backlog'},
    onTrace: value => { if (traces.length < 32768) traces.push(value); }});
  const runtimeConstructionMs = performance.now() - runtimeStarted;
  const composer = createPostprocessingRuntime({THREE, Postprocessing, scene, camera, renderer, engineSelection, maxPixels: 960 * 540, maxDimension: 4096, maxPixelRatio: 1, maxDelta: .1});
  const renderRoute = fixture.renderRoute || 'composer'; if (!['composer', 'direct'].includes(renderRoute)) throw Error('Explicit supported review render route required');
  for (const item of fixture.cases) {
    const loadStarted = performance.now(), [packageBytes, modelBytes] = await Promise.all([read(item.package), read(item.model)]), pkg = JSON.parse(decoder.decode(packageBytes)), rawLoadMs = performance.now() - loadStarted;
    const modelStarted = performance.now(), source = await gltf(modelBytes), modelParseMs = performance.now() - modelStarted;
    const oracleStarted = performance.now(), oracleSource = await gltf(modelBytes), independentOracleParseMs = performance.now() - oracleStarted;
    for (const parsed of [source, oracleSource]) parsed.scene.traverse(node => { if (node.isSkinnedMesh) sourceSkeletons.add(node.skeleton); });
    const poseOracle = createGlbPoseOracle({THREE, clone: skeletonClone, source: oracleSource, declaration: pkg}), effectSources = [], effectsStarted = performance.now();
    for (const effect of item.effects) {
      const [nativeBytes, profileBytes] = await Promise.all([read(effect.package), read(effect.profile)]), native = JSON.parse(decoder.decode(nativeBytes)), profile = JSON.parse(decoder.decode(profileBytes)), resourceBytes = [], correspondenceBytes = [], bindings = [];
      for (const correspondence of effect.correspondences) correspondenceBytes.push({resourceId: correspondence.resourceId, bytes: await read(correspondence.path)});
      for (const resource of effect.resources) {
        const bytes = await read(resource.path), declared = native.resources.find(value => value.id === resource.id), ref = pkg.effectSources.find(value => value.id === effect.id).correspondences.find(value => value.resourceId === resource.id);
        if (!declared || sha256(bytes) !== declared.sha256) throw Error('Actual effect resource differs from native source');
        resourceBytes.push({id: resource.id, bytes}); let disposed = false;
        if (declared.kind === 'texture-png') {
          const image = await rgbaPng(bytes), texture = new THREE.DataTexture(image.pixels, image.width, image.height, THREE.RGBAFormat, THREE.UnsignedByteType); texture.needsUpdate = true;
          const measurement = inspectVfxTexture(texture); if (measurement.pixelsSha256 !== ref.decodedSha256) throw Error('PNG decode differs from independently reviewed actual pixels');
          texture.addEventListener('dispose', () => { disposed = true; }); borrowed.push({resource: texture, disposed: () => disposed});
          const atlas = native.atlases?.find(value => value.resourceId === resource.id);
          bindings.push({id: resource.id, sha256: declared.sha256, texture, width: image.width, height: image.height, colorSpace: atlas?.colorSpace || 'srgb', alpha: 'straight',
            review: {resourceSha256: declared.sha256, pixelsSha256: measurement.pixelsSha256, independent: true, sourceEvidence: {path: ref.report.path, sha256: ref.report.sha256}}});
        } else {
          const model = await gltf(bytes), meshes = []; model.scene.traverse(node => { if (node.isMesh) meshes.push(node); }); if (meshes.length !== 1) throw Error('Explicit one-primitive original mesh fixture required');
          const geometry = meshes[0].geometry, measurement = inspectVfxGeometry(geometry); if (measurement.sha256 !== ref.decodedSha256) throw Error('Loaded source geometry differs from independently reviewed actual arrays');
          geometry.addEventListener('dispose', () => { disposed = true; }); borrowed.push({resource: geometry, disposed: () => disposed});
          bindings.push({id: resource.id, sha256: declared.sha256, geometry, review: {resourceSha256: declared.sha256, geometrySha256: measurement.sha256,
            maxVertices: measurement.vertices, maxIndices: measurement.indices, maxBytes: measurement.bytes, independent: true, sourceEvidence: {path: ref.report.path, sha256: ref.report.sha256}}});
        }
      }
      effectSources.push({id: effect.id, packageBytes: nativeBytes, profileBytes, resourceBytes, correspondenceBytes, bindings});
    }
    const nativeAdmission = typeof item.nativeAdmission === 'string' ? await json(item.nativeAdmission) : item.nativeAdmission;
    const input = {packageBytes, packageSha256: sha256(packageBytes), modelBytes, nativeAdmission, effectSources}, effectDecodeAndBindingMs = performance.now() - effectsStarted, admissionStarted = performance.now();
    const admitted = runtime.admit(input), admissionMs = performance.now() - admissionStarted;
    loaded.set(item.id, {item, pkg, source, oracleSource, poseOracle, admitted, input, effectSources,
      load: {rawLoadMs, modelParseMs, independentOracleParseMs, effectDecodeAndBindingMs, admissionMs, totalMs: performance.now() - loadStarted}});
  }
  let actors = [], current = null, currentAction = null, playing = false, pixels = new Uint8Array(960 * 540 * 4), lastNormal = null, selectionSceneStart = 0, eventHook = null, liveInputEnabled = true, artifactSerial = 0, captureEpoch = 0;
  let framing = null, lastProjection = null, projectionGuardEnabled = true, callerSkeletonDisposals = 0;
  const extraLeases = [], extraPackages = [], skeletonCleanup = [], geometryRadii = new WeakMap();
  const sphereBox = (point, radius) => new THREE.Box3().setFromCenterAndSize(point, new THREE.Vector3().setScalar(radius * 2));
  function refit(box, detail) { framing = {box: box.clone(), detail, ...fitCameraToBox(THREE, camera, box)}; }
  function actualProjection() {
    if (!framing) return null; scene.updateMatrixWorld(true); const groups = [];
    for (const actor of actors) groups.push({role: 'model/' + actor.id, points: boxCorners(THREE, new THREE.Box3().setFromObject(actor.visual, true))});
    if (framing.detail.targets?.length) groups.push({role: 'fixed-live-targets', points: framing.detail.targets.map(point => new THREE.Vector3(...point))});
    let historyPoints = 0, particlePoints = 0;
    scene.traverse(node => {
      if (node.geometry?.type === 'CylinderGeometry') groups.push({role: 'actual-beam-bounds', points: boxCorners(THREE, new THREE.Box3().setFromObject(node, true))});
      if (!(node.system instanceof Quarks.ParticleSystem)) return; const system = node.system, settings = system.getRendererSettings(), geometry = settings.instancingGeometry;
      if (!geometryRadii.has(geometry)) { const positions = geometry.getAttribute('position'); let radius = 0; for (let index = 0; index < positions.count; index++) radius = Math.max(radius, Math.hypot(positions.getX(index), positions.getY(index), positions.getZ(index))); geometryRadii.set(geometry, radius); }
      system.emitter.updateWorldMatrix(true, false);
      for (const particle of system.particles.slice(0, system.particleNum)) {
        const matrix = system.worldSpace ? null : particle.parentMatrix || system.emitter.matrixWorld, scale = matrix ? new THREE.Matrix4().copy(matrix).getMaxScaleOnAxis() : 1;
        const position = new THREE.Vector3(particle.position.x, particle.position.y, particle.position.z); if (matrix) position.applyMatrix4(matrix);
        const size = Math.max(Math.abs(particle.size.x), Math.abs(particle.size.y), Math.abs(particle.size.z)), radius = size * scale * geometryRadii.get(geometry);
        groups.push({role: 'actual-particle-bounds', points: boxCorners(THREE, sphereBox(position, Math.max(radius, .000001)))}); particlePoints++;
        if (particle.previous) for (const record of particle.previous.values()) { if (++historyPoints > 65536) throw Error('Actual history framing budget exceeded'); const point = new THREE.Vector3(record.position.x, record.position.y, record.position.z); if (matrix) point.applyMatrix4(matrix);
          groups.push({role: 'actual-trail-history-bounds', points: boxCorners(THREE, sphereBox(point, Math.max(Math.abs(record.size) * scale, .000001)))}); }
      }
    });
    return {...projectionEvidence(camera, groups), particles: particlePoints, historyPoints};
  }
  // The selected LDR/FXAA graph has no animated passes. As in Task4 review,
  // render(0) observes the already-delivered presentation pose without advancing
  // a second animation/particle clock or importing heavy effects.
  function render() { if (projectionGuardEnabled) lastProjection = actualProjection(); renderer.info.reset(); if (renderRoute === 'composer') { if (!composer.render(0)) throw Error('Selected compositor suppressed an expected review frame'); } else renderer.render(scene, camera); }
  function metrics() {
    gl.finish(); gl.readPixels(0, 0, 960, 540, gl.RGBA, gl.UNSIGNED_BYTE, pixels); const withEffects = pixels.slice(), background = pixels.slice(0, 3); let occupiedPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i] - background[0]) + Math.abs(pixels[i + 1] - background[1]) + Math.abs(pixels[i + 2] - background[2]) > 15) occupiedPixels++;
    // Test-only same-pose render culling: existing Quarks particles are drawn
    // by their scene batch, independently of an emitter's visible flag. Do not
    // reinterpret quality/emission policy as a GPU visibility operation.
    const effectNodes = scene.children.filter(node => node.type === 'BatchedRenderer' || node.geometry?.type === 'CylinderGeometry').map(node => ({node, visible: node.visible}));
    for (const value of effectNodes) value.node.visible = false;
    render(); gl.finish(); gl.readPixels(0, 0, 960, 540, gl.RGBA, gl.UNSIGNED_BYTE, pixels); let effectPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i] - withEffects[i]) + Math.abs(pixels[i + 1] - withEffects[i + 1]) + Math.abs(pixels[i + 2] - withEffects[i + 2]) > 8) effectPixels++;
    for (const value of effectNodes) value.node.visible = value.visible; render();
    const poseOracles = actors.map(value => {
      const state = value.actor.stats(); if (!['playing', 'paused', 'draining', 'complete'].includes(state.state)) return {actor: value.id, status: 'not-run', reason: 'Actor has no current delivered action'};
      value.movement.updateWorldMatrix(true, false);
      const result = current.poseOracle.compare({visualRoot: value.visual, movementMatrix: value.movement.matrixWorld, actionId: value.action, time: state.time});
      const releases = [];
      for (const event of events.filter(event => event.actor === value.id && event.type === 'cue-start')) {
        const key = value.id + ':' + event.generation + ':' + event.cue;
        if (!releaseProofs.has(key)) { const cue = current.pkg.actions.find(action => action.id === event.action)?.cues.find(cue => cue.id === event.cue), matrix = releaseMovements.get(key);
          if (!cue || !matrix) throw Error('Independent release oracle lacks exact controller transform');
          releaseProofs.set(key, current.poseOracle.release({actionId: event.action, cue, movementMatrix: matrix, actualOrigin: event.origin})); }
        releases.push(releaseProofs.get(key));
      }
      return {actor: value.id, ...result, offGrid: Math.abs(state.time * current.pkg.fps - Math.round(state.time * current.pkg.fps)) > 1e-7, releases};
    });
    return {occupiedPixels, effectPixels, glError: gl.getError(), shaderErrors: [...shaderErrors], state: runtime.stats(), composer: composer.inspect(), renderRoute, captureEpoch, poseOracles,
      framing: framing ? {minimum: framing.minimum, maximum: framing.maximum, padding: framing.padding, distance: framing.distance, detail: framing.detail, projection: lastProjection} : null,
      actors: actors.map(value => ({id: value.id, state: value.actor.stats(), rigLeases: value.rigLeases.size, rigAcquires: value.rigAcquires, rigReleases: value.rigReleases})), events: [...events],
      render: {...renderer.info.render}, memory: {...renderer.info.memory}, camera: {position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), projection: camera.projectionMatrix.toArray()}};
  }
  function reset() { playing = false; for (const lease of extraLeases.splice(0)) lease.retire(); for (const pkg of extraPackages.splice(0)) service.releasePackage(pkg);
    for (const value of actors) { value.actor.dispose(); if (value.rigLeases.size) throw Error('Caller animation rig lease survived actor disposal'); value.movement.removeFromParent();
      for (const skeleton of value.skeletons) { if (sourceSkeletons.has(skeleton)) throw Error('Caller clone unexpectedly shares a source skeleton'); const textureBefore = skeleton.boneTexture, before = renderer.info.memory.textures; skeleton.dispose(); callerSkeletonDisposals++;
        if (textureBefore && skeleton.boneTexture !== null) throw Error('Clone-owned bone texture survived caller disposal'); if (skeletonCleanup.length < 256) skeletonCleanup.push({hadBoneTexture: !!textureBefore, beforeTextures: before, afterTextures: renderer.info.memory.textures}); } }
    actors = []; framing = null; lastProjection = null; events.length = 0; traces.length = 0; releaseMovements.clear(); releaseProofs.clear(); eventHook = null; liveInputEnabled = true; scene.background.set(0x101720); runtime.reset(); }
  function select(id, {actionId, count = 1, outcomeMode = 'rehearsal', measure = true, renderFrame = true} = {}) {
    reset(); current = loaded.get(id); if (!current) throw Error('Explicit original model case missing');
    currentAction = current.pkg.actions.find(action => action.id === (actionId || current.item.action || current.pkg.actions[0].id)); if (!currentAction) throw Error('Explicit exported action is missing');
    selectionSceneStart = runtime.stats().time;
    const bounds = new THREE.Box3().setFromObject(current.source.scene), size = bounds.getSize(new THREE.Vector3()).length(), center = bounds.getCenter(new THREE.Vector3()); if (!(size > 0)) throw Error('Real model fixture has no visible geometry');
    for (let index = 0; index < count; index++) {
      const movement = new THREE.Group(), visual = skeletonClone(current.source.scene); movement.add(visual); movement.position.x = index * size * .65; scene.add(movement);
      const skeletons = new Set(); visual.traverse(node => { if (node.isSkinnedMesh) skeletons.add(node.skeleton); }); for (const skeleton of skeletons) if (sourceSkeletons.has(skeleton)) throw Error('A model clone shares its source skeleton');
      const id = current.item.id + '-' + index, record = {id, movement, visual, skeletons, actor: null, action: currentAction.id, endpointTimes: new Map(), rigLeases: new Set(), rigAcquires: 0, rigReleases: 0};
      const actor = runtime.createActor({id, visualRoot: visual, movementRoot: movement, animations: current.source.animations, package: current.admitted,
        rigOwnership: {acquire(value) { const token = {generation: value.generation}; record.rigLeases.add(token); record.rigAcquires++; return token; }, release(token) { if (!record.rigLeases.delete(token)) throw Error('Caller animation rig lease released twice'); record.rigReleases++; }},
        onEvent: event => { if (events.length >= 32768) throw Error('Event evidence budget exceeded'); events.push(event);
          if (event.type === 'cue-start') { movement.updateWorldMatrix(true, false); releaseMovements.set(id + ':' + event.generation + ':' + event.cue, movement.matrixWorld.clone()); } eventHook?.(event, record.actor); }});
      record.actor = actor; actors.push(record); const targets = {};
      for (const target of current.pkg.targets.filter(value => value.mode === 'fixed-world-point')) targets[target.id] = center.clone().add(new THREE.Vector3(size * .5 + index * size * .65, 0, 0)).toArray();
      record.targetInputs = Object.fromEntries(Object.entries({...targets, ...(current.item.targets || {})}).map(([id, point]) => [id, [...point]]));
      record.targetSnapshots = Object.values(record.targetInputs).map(point => [...point]);
      actor.start(currentAction.id, {targets: record.targetInputs, outcomeMode});
    }
    const envelope = current.poseOracle.envelope(currentAction.id), fit = new THREE.Box3(), targetPoints = []; let effectRadius = 0;
    for (const cue of currentAction.cues) { const source = current.effectSources.find(value => value.id === cue.source), profile = JSON.parse(decoder.decode(source.profileBytes)), reference = current.pkg.effectSources.find(value => value.id === cue.source);
      for (const layer of profile.layers.filter(layer => layer.effectId === reference.effectId)) effectRadius = Math.max(effectRadius, Math.hypot(...cue.transform.position) + cue.transform.scale * (layer.size + Math.abs(layer.speed) * layer.emission.lifetimeSeconds)); }
    for (const actor of actors) { actor.movement.updateWorldMatrix(true, false); fit.union(envelope.box.clone().applyMatrix4(actor.movement.matrixWorld).expandByScalar(effectRadius));
      for (const point of actor.targetSnapshots) { fit.union(sphereBox(new THREE.Vector3(...point), effectRadius)); targetPoints.push(point); } }
    for (const target of current.pkg.targets.filter(value => value.mode === 'continuous-world-point')) { const point = [...(current.item.liveEndpoint || [1, 1, 1])]; fit.union(sphereBox(new THREE.Vector3(...point), effectRadius)); targetPoints.push(point); }
    if (count > 1) { const ambient = center.clone().add(new THREE.Vector3(size * .325, size * .65, 0)); fit.union(sphereBox(ambient, effectRadius)); }
    refit(fit, {mode: 'Independent animated model envelopes, every instance, fixed/live targets and declared size/speed/lifetime effect extent', targets: targetPoints, effectRadius,
      animatedEnvelopeSamples: envelope.samples, animatedEnvelopePaddingMeters: envelope.paddingMeters, actualPerRenderProjectionGuard: true});
    if (renderFrame) render(); return measure ? metrics() : null;
  }
  function step(delta) {
    for (const value of actors.filter(value => !['idle', 'disposed', 'complete'].includes(value.actor.state))) for (const target of liveInputEnabled ? current.pkg.targets.filter(target => target.mode === 'continuous-world-point') : []) {
      const point = current.item.liveEndpoint || [1, 1, 1], generation = value.actor.stats().generation, timestamp = runtime.stats().time, key = target.id + ':' + generation;
      const last = value.endpointTimes.get(key), interval = 1 / Math.min(60, target.maxUpdatesPerSecond);
      if (last === undefined || timestamp - last >= interval - 1e-12) { value.actor.setEndpoint({target: target.id, generation, timestamp, point}); value.endpointTimes.set(key, timestamp); } }
    try { runtime.update(delta); } catch (error) {
      const messages = [], visit = value => { messages.push(value?.message || String(value)); for (const nested of value?.errors || []) visit(nested); }; visit(error);
      window.__actionVfxLastError = {messages, delta, sceneTime: runtime.stats().time, actors: actors.map(value => ({id: value.id, state: value.actor.stats()}))};
      throw Error('Actual action update failed: ' + messages.join(' | ') + '; delta=' + delta + '; sceneTime=' + runtime.stats().time, {cause: error});
    }
  }
  function advance(seconds, measure = true) { if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60) throw Error('Bounded finite review interval required'); let remaining = seconds;
    while (remaining > 0) { const delta = Math.min(1 / 60, remaining); step(delta); remaining -= delta; } render(); return measure ? metrics() : null; }
  function advanceTo(target) {
    const absoluteClock = advancePresentationTo({target, getActors: () => actors.map(value => value.actor.stats()), getSceneTime: () => runtime.stats().time, sceneStart: selectionSceneStart, step});
    render(); return {...metrics(), absoluteClock};
  }
  function effectDescriptor(value, sourceId, layerId) {
    const reference = value.pkg.effectSources.find(source => source.id === sourceId), source = value.effectSources.find(source => source.id === sourceId);
    if (!reference || !source) throw Error('Exact native effect source required');
    const native = JSON.parse(decoder.decode(source.packageBytes)), profile = JSON.parse(decoder.decode(source.profileBytes));
    const layer = profile.layers.find(layer => layer.effectId === reference.effectId && layer.layerId === layerId); if (!layer) throw Error('Selected native effect layer required');
    return {source, reference, native, profile, layer};
  }
  function admitStandalone(descriptor) {
    const {source, native, profile} = descriptor;
    const pkg = service.admit({package: native, packageBytes: source.packageBytes, packageSha256: sha256(source.packageBytes), ...(profile.preparationSha256 ? {preparationSha256: profile.preparationSha256} : {}), profile, bindings: source.bindings});
    extraPackages.push(pkg); return pkg;
  }
  const backgrounds = {neutral: 0x344150, dark: 0x070b10, light: 0xf4f5f7};
  function isolationBackground(name) { if (!(name in backgrounds)) throw Error('Explicit isolated/dark/light background required'); scene.background.set(backgrounds[name]); render(); return {...metrics(), background: name}; }
  function combinedBackground(name) {
    if (!actors.length || !currentAction) throw Error('A real selected action pose is required for combined readability views');
    return {...isolationBackground(name), scope: 'Same actual actor/action pose on a declared contrasting background; no presentation time advanced or human readability verdict supplied.'};
  }
  function isolate(id, sourceId, layerId) {
    reset(); current = loaded.get(id); if (!current) throw Error('Original isolated case required'); currentAction = null;
    const descriptor = effectDescriptor(current, sourceId, layerId), {layer} = descriptor, pkg = admitStandalone(descriptor), extent = Math.max(.35, layer.size * 3 + layer.speed * layer.emission.lifetimeSeconds);
    refit(new THREE.Box3(new THREE.Vector3(-extent, -extent, -extent), new THREE.Vector3(extent, extent, extent)), {mode: 'Exact standalone layer and bounded engineering transform envelope', targets: []});
    const lease = service.acquire({package: pkg, effectId: descriptor.reference.effectId, layerId, id: 'isolated-' + (++artifactSerial), ownerId: 'engineering-isolation', parent: scene,
      ...(layer.family === 'beam' ? {endpoints: {start: [-extent * .6, 0, 0], end: [extent * .6, extent * .25, 0]}} : {transform: {position: [0, 0, 0]}})}); extraLeases.push(lease);
    const sampleSeconds = Math.min(.08, layer.emission.lifetimeSeconds / 2, layer.emission.durationSeconds / 2);
    for (let index = 1; index <= 8; index++) { if (layer.family === 'trail') lease.setTransform({position: [extent * (index / 8 - .5), Math.sin(index) * extent * .1, 0]}); step(sampleSeconds / 8); }
    return {...isolationBackground('neutral'), isolated: {sourceId, effectId: descriptor.reference.effectId, layerId, family: layer.family, sampleSeconds, resourcePackageSha256: sha256(descriptor.source.packageBytes),
      profileSha256: sha256(descriptor.source.profileBytes), lease: lease.stats(), trailPath: layer.family === 'trail' ? 'Explicit bounded engineering emitter transforms with actual native history' : null,
      scope: 'One exact admitted native layer, same selected scene owner and compositor; separate standalone visibility view, no human quality decision'}};
  }
  function cleanupCounts() { return {ownedEffects: runtime.stats().activeEffects, resourceLeases: service.stats().productionSystems, rigWrites: actors.reduce((sum, value) => sum + value.rigLeases.size, 0)}; }
  function cloneResetStability(id, {cycles = 4} = {}) {
    if (cycles !== 4) throw Error('Explicit four-cycle clone cleanup observation required'); reset(); render(); const baselineTextures = renderer.info.memory.textures, observations = [], beforeDisposals = callerSkeletonDisposals;
    for (let cycle = 0; cycle < cycles; cycle++) { select(id, {measure: false, renderFrame: false}); const first = currentAction.cues.flatMap(cue => cue.layers).sort((a, b) => a.start - b.start)[0]; advanceTo(first.start + Math.min(.02, first.particleLifetimeSeconds / 4)); const renderedTextures = renderer.info.memory.textures; reset(); render();
      const afterResetTextures = renderer.info.memory.textures; if (afterResetTextures !== baselineTextures) throw Error('Clone/reset retained GPU textures: ' + JSON.stringify({cycle, baselineTextures, renderedTextures, afterResetTextures})); observations.push({cycle, renderedTextures, afterResetTextures}); }
    return {status: 'passed', baselineTextures, cycles: observations, cloneSkeletonsDisposed: callerSkeletonDisposals - beforeDisposals,
      scope: 'Caller disposes unique SkeletonUtils-clone skeletons after action release; source skeletons, geometry, materials and textures are preserved.'};
  }
  function concurrent(id, {actionId} = {}) {
    select(id, {actionId, count: 2, measure: false, renderFrame: false});
    const peakTime = current.item.performancePeakTime ?? Math.min(currentAction.duration / 2, .5); advanceTo(peakTime);
    let descriptor;
    for (const source of current.pkg.effectSources) { const profile = JSON.parse(decoder.decode(current.effectSources.find(value => value.id === source.id).profileBytes)), sprite = profile.layers.find(layer => layer.effectId === source.effectId && layer.family === 'sprite'); if (sprite) { descriptor = effectDescriptor(current, source.id, sprite.layerId); break; } }
    if (!descriptor) throw Error('Selected native sprite layer required for actual ambient concurrency evidence');
    const pkg = admitStandalone(descriptor), bounds = new THREE.Box3().setFromObject(current.source.scene), size = bounds.getSize(new THREE.Vector3()).length(), center = bounds.getCenter(new THREE.Vector3());
    const ambient = service.acquire({package: pkg, effectId: descriptor.reference.effectId, layerId: descriptor.layer.layerId, id: 'ambient-' + (++artifactSerial), ownerId: 'ambient', parent: scene,
      transform: {position: center.clone().add(new THREE.Vector3(size * .325, size * .65, 0)).toArray()}}); extraLeases.push(ambient);
    const before = service.stats().time; step(.02); render(); const frame = metrics(), ownerCount = scene.children.filter(node => node.type === 'BatchedRenderer').length;
    if (ownerCount !== 1 || actors.length !== 2 || ambient.stats().retired || Math.abs(ambient.stats().time - .02) > 1e-7 || Math.abs(service.stats().time - before - .02) > 1e-7) throw Error('Actual two-actor/ambient owner or shared clock check failed');
    return {...frame, concurrency: {actors: 2, ownerCount, ambient: ambient.stats(), ownerElapsed: service.stats().time - before, peakTime, ambientSource: descriptor.reference.id, ambientLayer: descriptor.layer.layerId}};
  }
  async function lifecycle(id, {actionId} = {}) {
    const tests = [], require = (value, message) => { if (!value) throw Error(message); };
    const probe = async (name, operation) => { try { const observation = await operation(); tests.push({id: name, status: observation?.unavailable ? 'unavailable' : 'passed', observation}); }
      catch (error) { tests.push({id: name, status: 'failed', error: error.message}); } };
    const begin = (count = 1) => select(id, {actionId, count, measure: false});
    const activeTime = () => { const layer = currentAction.cues.flatMap(cue => cue.layers).sort((a, b) => a.start - b.start)[0]; return layer.start + Math.min(.02, layer.particleLifetimeSeconds / 4, layer.emissionDurationSeconds / 4); };
    await probe('hard-cancel', () => { begin(); advanceTo(activeTime()); const a = actors[0], generation = a.actor.generation; require(a.actor.stats().activeEffects > 0, 'No live native effects before cancellation');
      a.actor.cancel(); step(.03); const result = cleanupCounts(); require(a.actor.state === 'idle' && Object.values(result).every(value => value === 0), 'Hard cancellation retained presentation ownership');
      require(!events.some(event => event.generation === generation && event.time > activeTime() && event.type === 'cue-start'), 'Cancelled generation released later cues'); return {cleanup: result, retiredGeneration: generation}; });
    await probe('pause-resume', () => { begin(); advanceTo(activeTime()); const a = actors[0], before = a.actor.stats(); a.actor.pause(); step(.05); const paused = a.actor.stats(); require(paused.time === before.time, 'Paused native actor consumed presentation time');
      for (const effect of paused.effects) { const old = before.effects.find(value => value.id === effect.id), cue = currentAction.cues.find(cue => cue.id === effect.cue); if (old && cue.lifetime.pause === 'follow-action') require(effect.age === old.age, 'Follow-action effect aged during pause'); }
      a.actor.resume(); step(.025); require(Math.abs(a.actor.stats().time - before.time - .025) < 1e-7, 'Resume replayed old frame time'); return {before: before.time, paused: paused.time, resumed: a.actor.stats().time}; });
    await probe('replace-restart', () => { begin(); advanceTo(activeTime()); const a = actors[0], before = a.actor.stats(), oldIds = new Set(before.effects.map(value => value.id));
      a.actor.start(currentAction.id, {targets: a.targetInputs, outcomeMode: 'rehearsal'}); step(.02); const after = a.actor.stats(); require(after.generation > before.generation && after.effects.every(effect => !oldIds.has(effect.id)), 'Replacement retained old generation leases');
      require(Math.abs(after.time - .02) < 1e-7, 'Replacement consumed prior generation time'); return {oldGeneration: before.generation, newGeneration: after.generation, oldLeases: oldIds.size, newTime: after.time}; });
    await probe('reentrant-callback', () => { begin(2); const first = actors[0], second = actors[1];
      const candidates = [...currentAction.markers.filter(marker => marker.at > 0).map(marker => ({time: marker.at, type: 'marker', id: marker.id})), ...currentAction.cues.filter(cue => cue.start > 0).map(cue => ({time: cue.start, type: 'cue-start', id: cue.id}))].sort((a, b) => a.time - b.time);
      const trigger = candidates[0]; require(trigger, 'No positive native callback boundary available'); let invoked = false;
      eventHook = (event, actor) => { if (!invoked && event.actor === first.id && event.type === trigger.type && event.time === trigger.time && (event.markerId || event.cue) === trigger.id) { invoked = true; actor.cancel(); } };
      advanceTo(trigger.time + .02); eventHook = null; require(invoked && first.actor.state === 'idle' && first.actor.stats().activeEffects === 0, 'Reentrant cancellation retained old actor');
      require(second.actor.stats().time >= trigger.time + .02 && second.actor.state !== 'idle', 'Reentrant callback stopped unrelated actor'); return {boundary: trigger, affected: first.actor.state, unrelatedTime: second.actor.stats().time}; });
    await probe('actor-removal', () => { begin(); advanceTo(activeTime()); const a = actors[0]; a.movement.removeFromParent(); let reported = false; try { step(.02); } catch { reported = true; }
      const result = cleanupCounts(); require(reported && Object.values(result).every(value => value === 0), 'Removed actual model retained attached presentation ownership'); return {controlledFailureReported: reported, cleanup: result}; });
    begin(); const fixed = current.pkg.targets.find(target => target.mode === 'fixed-world-point');
    if (fixed) await probe('fixed-target-snapshot', () => { begin(); const a = actors[0], expected = [...a.targetInputs[fixed.id]], cue = currentAction.cues.find(cue => cue.target === fixed.id); require(cue, 'Selected action has no fixed-target cue');
      a.targetInputs[fixed.id][0] += 1000; advanceTo(cue.start + Math.min(.02, (cue.end - cue.start) / 4));
      const effect = a.actor.stats().effects.find(effect => effect.cue === cue.id); require(effect && effect.target.every((value, index) => value === expected[index]), 'Caller mutation changed fixed target snapshot'); return {target: fixed.id, snapshot: expected, observed: effect.target}; });
    const continuous = current.pkg.targets.find(target => target.mode === 'continuous-world-point');
    if (continuous) {
      await probe('continuous-target-freshness', () => { begin(); const layer = currentAction.cues.filter(cue => cue.target === continuous.id).flatMap(cue => cue.layers).find(layer => layer.family === 'beam'); require(layer, 'Selected action has no declared live beam');
        advanceTo(layer.start + .02); require(actors[0].actor.stats().effects.some(effect => effect.family === 'beam'), 'Fresh current-generation endpoint produced no actual beam'); liveInputEnabled = false; step(continuous.maxAgeSeconds + .02);
        require(!actors[0].actor.stats().effects.some(effect => effect.family === 'beam') && events.some(event => event.type === 'endpoint-invalid'), 'Stale endpoint was reused'); return {maxAgeSeconds: continuous.maxAgeSeconds, freshBeamObserved: true, staleBeamRetired: true}; });
      await probe('invalid-target-retirement', () => { begin(); const layer = currentAction.cues.filter(cue => cue.target === continuous.id).flatMap(cue => cue.layers).find(layer => layer.family === 'beam'); advanceTo(layer.start + .02); const a = actors[0];
        const accepted = a.actor.setEndpoint({target: continuous.id, generation: a.actor.generation - 1, timestamp: runtime.stats().time, point: current.item.liveEndpoint || [1, 1, 1]});
        require(!accepted && !a.actor.stats().effects.some(effect => effect.family === 'beam'), 'Invalid-generation endpoint retained actual beam'); return {generationRejected: true, remainingBeamEffects: 0}; });
    }
    if (current.pkg.actions.some(action => action.cues.some(cue => cue.trail))) await probe('trail-discontinuity-reset', () => {
      const value = loaded.get(id); let chosen;
      for (const source of value.pkg.effectSources) { const profile = JSON.parse(decoder.decode(value.effectSources.find(item => item.id === source.id).profileBytes)), layer = profile.layers.find(layer => layer.effectId === source.effectId && layer.family === 'trail'); if (layer) { chosen = {source, layer}; break; } }
      require(chosen, 'No selected native trail layer'); const initial = isolate(id, chosen.source.id, chosen.layer.layerId), lease = extraLeases[0], historyBefore = lease.stats().historyPoints;
      require(historyBefore > 1, 'No actual retained trail history before reset'); lease.resetHistory(); const cleared = lease.stats().historyPoints; lease.setTransform({position: [2, 1, 0]});
      refit(framing.box.clone().union(sphereBox(new THREE.Vector3(2, 1, 0), Math.max(chosen.layer.size, .1))), {...framing.detail, mode: 'Standalone trail before/after explicit teleport envelope'}); step(.01); render(); const after = lease.stats();
      require(cleared === 0 && after.historyPoints <= after.particles, 'Actual trail history bridged declared teleport');
      return {historyBefore, historyImmediatelyAfterReset: cleared, historyAfterFreshStep: after.historyPoints, initial: initial.isolated,
        scope: 'Exact native standalone trail lease, explicit discontinuity reset and new transform. Fixed-target projectile trajectories do not follow a caster teleport; automatic action detection is separately covered by source-bound CPU tests.'};
    });
    await probe('context-restoration', async () => { begin(); advanceTo(activeTime()); const lose = gl.getExtension('WEBGL_lose_context'); if (!lose) return {unavailable: true, reason: 'Selected actual WebGL2 context exposes no loss/restore extension'};
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms)), beforeFrames = composer.inspect().frames; reset(); const sceneBefore = runtime.stats().time; runtime.suspend('host'); lose.loseContext(); let deadline = performance.now() + 3000;
      while (!gl.isContextLost() && performance.now() < deadline) await wait(10); require(gl.isContextLost(), 'Actual context loss did not occur'); require(composer.render(0) === false && composer.inspect().frames === beforeFrames, 'Lost context rendered');
      await wait(50); lose.restoreContext(); deadline = performance.now() + 5000; while (gl.isContextLost() && performance.now() < deadline) await wait(10); require(!gl.isContextLost(), 'Actual context did not restore'); await wait(50);
      require(composer.render(0) === false, 'Restored context rendered before explicit validation'); composer.revalidate(); runtime.resume(); captureEpoch++; begin(); advanceTo(activeTime()); const restored = metrics();
      require(restored.glError === 0 && restored.shaderErrors.length === 0 && restored.occupiedPixels > 10, 'Actual restored compositor/model frame failed');
      require(Math.abs(runtime.stats().time - sceneBefore - activeTime()) < 1e-7, 'Context restoration replayed hidden wall time');
      return {beforeFrames, afterFrames: composer.inspect().frames, glError: restored.glError, occupiedPixels: restored.occupiedPixels, explicitRevalidation: true, captureEpoch, freshActorAfterRestore: true,
        hiddenBacklogSeconds: runtime.stats().time - sceneBefore - activeTime(), artifact: await captureArtifacts.png('context-restored-' + (++artifactSerial))}; });
    reset(); return {case: id, action: actionId || currentAction?.id, tests, status: tests.every(test => test.status === 'passed') ? 'passed' : 'incomplete',
      deferred: ['exact-release', 'normal-drain', 'aggregate-scene-ownership', 'concurrent-actors-and-ambient', 'resource-disposal', 'isolated-layer-families', 'contrasting-backgrounds'],
      scope: 'Observed real-model selected-engine operations only. Deferred statuses require the runner actual captures and final cleanup; unavailable/failed tests must not be relabeled passed.'};
  }
  function timed(operation) { gl.finish(); const started = performance.now(), value = operation(), cpuEnd = performance.now(); gl.finish(); return {value, cpuMs: cpuEnd - started, finishWallMs: performance.now() - started}; }
  function phase() {
    const resourceKeys = ['systems', 'capacity', 'particles', 'pooledParticles', 'batches', 'bufferBytes', 'reservedBufferBytes', 'vertices', 'indices', 'reservedVertices', 'reservedIndices', 'trailPoints', 'textureBytes', 'unboundedTextures', 'drawCalls', 'productionSystems', 'packages'];
    const counters = value => Object.fromEntries(resourceKeys.map(key => { if (!Number.isFinite(value[key]) || value[key] < 0) throw Error('Invalid actual owned resource counter: ' + key); return [key, value[key]]; }));
    const initialService = service.stats(), resourceMaxima = counters(initialService), resourceMaximaAt = Object.fromEntries(resourceKeys.map(key => [key, 'initial'])), resourceSamples = [];
    const samples = []; let maxSystems = initialService.systems, maxParticles = initialService.particles; gl.finish(); const started = performance.now();
    for (let index = 0; index < 32; index++) { const a = performance.now(); step(1 / 120); const b = performance.now(); render(); const c = performance.now(); gl.finish(); const d = performance.now();
      samples.push({updateCpuMs: b - a, renderSubmitCpuMs: c - b, finishWaitMs: d - c, frameFinishWallMs: d - a}); const observed = service.stats(); maxSystems = Math.max(maxSystems, observed.systems); maxParticles = Math.max(maxParticles, observed.particles);
      const measured = counters(observed); resourceSamples.push({sampleIndex: index, serviceTime: observed.time, counters: measured});
      for (const key of resourceKeys) if (measured[key] > resourceMaxima[key]) { resourceMaxima[key] = measured[key]; resourceMaximaAt[key] = index; }
    }
    return {samples, perFrameWallMs: (performance.now() - started) / 32, maxSystems, maxParticles, initialService, resourceMaxima, resourceMaximaAt, resourceSamples,
      finalService: service.stats(), draws: {...renderer.info.render}, memory: {...renderer.info.memory},
      instrumentation: 'Initial counter snapshot precedes the timed loop. Resource observations reuse the existing service.stats call after each update/render/finish timing span. Whole-loop perFrameWallMs includes stats and counter accumulation; per-update/render samples exclude that instrumentation.'};
  }
  async function benchmark(id) {
    if (playing) throw Error('Normal playback owns the presentation clock'); reset(); const value = loaded.get(id); if (!value) throw Error('Explicit benchmark model missing'); const previousGuard = projectionGuardEnabled; projectionGuardEnabled = false;
    try {
    const admission = timed(() => { runtime.releasePackage(value.admitted); value.admitted = runtime.admit(value.input); });
    const actorsStage = timed(() => select(id, {measure: false, renderFrame: false})); const firstUpdate = timed(() => step(1 / 120));
    const compile = timed(() => { renderer.compile(scene, camera); render(); }); const steady = phase();
    reset(); const peakActors = timed(() => select(id, {count: 2, measure: false, renderFrame: false}));
    const peakTime = value.item.performancePeakTime ?? Math.min(value.pkg.actions.find(action => action.id === (value.item.action || value.pkg.actions[0].id)).duration / 2, .5);
    let remaining = peakTime; while (remaining > 0) { const delta = Math.min(1 / 60, remaining); step(delta); remaining -= delta; }
    let ambient, ambientPackage; const ambientSource = value.effectSources.find(source => JSON.parse(decoder.decode(source.profileBytes)).layers.some(layer => layer.family === 'sprite'));
    const peakAmbient = timed(() => { if (ambientSource) { const native = JSON.parse(decoder.decode(ambientSource.packageBytes)), profile = JSON.parse(decoder.decode(ambientSource.profileBytes)), layer = profile.layers.find(layer => layer.family === 'sprite');
      ambientPackage = service.admit({package: native, packageBytes: ambientSource.packageBytes, packageSha256: sha256(ambientSource.packageBytes), ...(profile.preparationSha256 ? {preparationSha256: profile.preparationSha256} : {}), profile, bindings: ambientSource.bindings});
      ambient = service.acquire({package: ambientPackage, effectId: layer.effectId, layerId: layer.layerId, id: 'benchmark-ambient', ownerId: 'ambient'}); } });
    const peakCompile = timed(() => { renderer.compile(scene, camera); render(); }); const peak = phase();
    projectionGuardEnabled = true; render(); const peakCapture = await captureArtifacts.png('benchmark-peak-' + (++artifactSerial)); projectionGuardEnabled = false;
    ambient?.retire(); if (ambientPackage) service.releasePackage(ambientPackage); reset();
    return {id, load: value.load, runtimeConstructionMs, renderRoute, composer: composer.inspect(), peakCapture, stages: {resourceAdmission: {cpuMs: admission.cpuMs, finishWallMs: admission.finishWallMs}, actorConstruction: {cpuMs: actorsStage.cpuMs, finishWallMs: actorsStage.finishWallMs}, initialUpdate: {cpuMs: firstUpdate.cpuMs, finishWallMs: firstUpdate.finishWallMs}, firstCompileRender: {cpuMs: compile.cpuMs, finishWallMs: compile.finishWallMs}, peakActors: {cpuMs: peakActors.cpuMs, finishWallMs: peakActors.finishWallMs}, peakAmbient: {cpuMs: peakAmbient.cpuMs, finishWallMs: peakAmbient.finishWallMs}, peakCompileRender: {cpuMs: peakCompile.cpuMs, finishWallMs: peakCompile.finishWallMs}}, steady, peak, peakTime, ambientAvailable: !!ambientSource, cleanup: {activeEffects: runtime.stats().activeEffects, systems: service.stats().systems},
      scope: 'Candidate absolute real-model scheduler cost. Inputs/model decode and cached camera envelopes are loaded once; exact byte/resource re-admission, actor/camera construction and first compile/render are measured separately each run. Projection/pose/pixel QA is outside timed frames. Peak is the declared representative two-actor plus available sprite ambient interval, not a certification of every possible game workload.'};
    } finally { projectionGuardEnabled = previousGuard; }
  }
  async function normal(id, {actionId} = {}) {
    select(id, {actionId}); playing = true; const duration = currentAction.retireAt + .2, started = performance.now(), samples = [], counts = []; let prior = null, playedSeconds = 0, peak = null, particlePeak = null;
    const recording = await captureArtifacts.beginVideo({id: 'normal-video-' + (++artifactSerial), seconds: duration});
    try { await new Promise((resolve, reject) => {
      function frame(now) { try { if (!playing) throw Error('Normal playback interrupted'); if (prior === null) { prior = now; requestAnimationFrame(frame); return; } const delta = (now - prior) / 1000; prior = now; if (delta > 1) throw Error('Exceptional normal-speed frame exceeds selected reject policy');
        if (samples.length >= 12000) throw Error('Normal-speed frame budget exceeded'); const before = performance.now(); advance(delta, false); playedSeconds += delta; samples.push(performance.now() - before); const active = runtime.stats().activeEffects; counts.push(active);
        if (!peak || active > peak.activeEffects) peak = {activeEffects: active, time: actors[0].actor.stats().time, sceneElapsed: runtime.stats().time - selectionSceneStart};
        const particles = service.stats().particles; if (!particlePeak || particles > particlePeak.particles) particlePeak = {particles, time: actors[0].actor.stats().time, sceneElapsed: runtime.stats().time - selectionSceneStart};
        if (playedSeconds >= duration) resolve(); else requestAnimationFrame(frame); } catch (error) { reject(error); } }
      requestAnimationFrame(frame);
    }); playing = false;
      const video = await captureArtifacts.finishVideo(), cleanup = cleanupCounts(); if (Object.values(cleanup).some(value => value !== 0)) throw Error('Normal-speed actual playback retained effects, leases or rig writes');
      lastNormal = {id, action: currentAction.id, start: 0, end: currentAction.retireAt, elapsedSeconds: (performance.now() - started) / 1000, presentationSeconds: playedSeconds,
        frames: samples.length, frameCpuMs: samples, activeEffects: counts, peak, particlePeak, recording, video, cleanup, final: metrics()}; return lastNormal;
    } finally { playing = false; if (captureArtifacts.stats().recording) await captureArtifacts.abortVideo(); }
  }
  window.__actionVfxReview = {driver, cases: [...loaded.keys()], fixture, select, advance, advanceTo, metrics, normal, benchmark, isolate, isolationBackground, combinedBackground, concurrent, lifecycle, cleanupCounts, cloneResetStability,
    capturePng: () => captureArtifacts.png('canvas-png-' + (++artifactSerial)), artifactInfo: id => captureArtifacts.info(id), artifactChunk: (id, offset, length) => captureArtifacts.chunk(id, offset, length), artifactRelease: id => captureArtifacts.release(id), captureCapabilities: () => captureArtifacts.capabilities(),
    reset, traces: () => [...traces], dispose() { reset(); runtime.dispose(); const preserved = borrowed.every(value => !value.disposed()), composerPreserved = !composer.inspect().disposed, framesBefore = composer.inspect().frames; service.dispose(); composer.render(0); const composerSurvivesActionDisposal = composer.inspect().frames === framesBefore + 1; const composerFirstDispose = composer.dispose(), composerSecondDispose = composer.dispose(); for (const value of borrowed) value.resource.dispose();
      const geometries = new Set(), materials = new Set(); for (const value of loaded.values()) for (const source of [value.source, value.oracleSource]) source.scene.traverse(node => { if (node.geometry) geometries.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material) materials.add(material); });
      for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); renderer.dispose(); return {borrowedResourcesPreserved: preserved, composerPreserved, composerSurvivesActionDisposal, composerFirstDispose, composerSecondDispose, composer: composer.inspect(), normal: lastNormal, finalSystems: service.stats().systems,
        callerSkeletonDisposals, skeletonCleanup}; }};
  document.querySelector('#status').textContent = 'Original engineering models ready'; window.__actionVfxReady = true;
} catch (error) { window.__reviewError = String(error.stack || error); document.querySelector('#status').textContent = 'Unavailable: ' + error.message; console.error(error); }
