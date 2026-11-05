import * as THREE from 'three';
import * as Quarks from 'three.quarks';
import * as Postprocessing from 'postprocessing';
import {GLTFLoader} from '/deps/three/examples/jsm/loaders/GLTFLoader.js';
import {clone as skeletonClone} from '/deps/three/examples/jsm/utils/SkeletonUtils.js';
import {createThreeVfxRuntime, inspectVfxTexture} from '/source/.engine/threejs/particles/three-vfx-runtime.mjs';
import {inspectVfxGeometry, sha256} from '/source/.engine/threejs/particles/vfx-package.mjs';
import {createThreeActionScene} from '/source/.engine/threejs/actions/action-scene.mjs';
import {createPostprocessingRuntime} from '/source/.engine/threejs/postprocessing/postprocessing-runtime.mjs';
import {advancePresentationTo} from './advance.mjs';

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
  renderer.setPixelRatio(1); renderer.setSize(960, 540, false); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  const gl = renderer.getContext(); if (!renderer.capabilities.isWebGL2 && !(gl instanceof WebGL2RenderingContext)) throw Error('Actual selected WebGL2 is required');
  const extension = gl.getExtension('WEBGL_debug_renderer_info'), driver = {webgl: gl.getParameter(gl.VERSION), glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : 'unavailable', renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable', maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)};
  const shaderErrors = []; renderer.debug.onShaderError = (context, program, vertex, fragment) => shaderErrors.push({program: context.getProgramInfoLog(program), vertex: context.getShaderInfoLog(vertex), fragment: context.getShaderInfoLog(fragment)});
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101720);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x67788a, 3)); const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(2, 5, 4); scene.add(light);
  const camera = new THREE.PerspectiveCamera(38, 960 / 540, .01, 1000), events = [], traces = [], loaded = new Map(), borrowed = [];
  const engineSelection = fixture.engineSelection, runtimeStarted = performance.now(), service = createThreeVfxRuntime({THREE, Quarks, scene, renderer, engineSelection, budgets: fixture.budgets});
  const runtime = createThreeActionScene({THREE, scene, vfxRuntime: service, engineSelection, budgets: fixture.sceneBudgets,
    deltaPolicy: fixture.deltaPolicy || {exceptionalDelta: 'reject', maxDeltaSeconds: 1, maxSubstepSeconds: .1, hidden: 'pause', resume: 'discard-backlog'},
    onTrace: value => { if (traces.length < 32768) traces.push(value); }});
  const runtimeConstructionMs = performance.now() - runtimeStarted;
  const composer = createPostprocessingRuntime({THREE, Postprocessing, scene, camera, renderer, engineSelection, maxPixels: 960 * 540, maxDimension: 4096, maxPixelRatio: 1, maxDelta: .1});
  const renderRoute = fixture.renderRoute || 'composer'; if (!['composer', 'direct'].includes(renderRoute)) throw Error('Explicit supported review render route required');
  for (const item of fixture.cases) {
    const loadStarted = performance.now(), [packageBytes, modelBytes] = await Promise.all([read(item.package), read(item.model)]), pkg = JSON.parse(decoder.decode(packageBytes)), rawLoadMs = performance.now() - loadStarted;
    const modelStarted = performance.now(), source = await gltf(modelBytes), modelParseMs = performance.now() - modelStarted, effectSources = [], effectsStarted = performance.now();
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
    loaded.set(item.id, {item, pkg, source, admitted, input, effectSources,
      load: {rawLoadMs, modelParseMs, effectDecodeAndBindingMs, admissionMs, totalMs: performance.now() - loadStarted}});
  }
  let actors = [], current = null, playing = false, pixels = new Uint8Array(960 * 540 * 4), lastNormal = null, selectionSceneStart = 0;
  // The selected LDR/FXAA graph has no animated passes. As in Task4 review,
  // render(0) observes the already-delivered presentation pose without advancing
  // a second animation/particle clock or importing heavy effects.
  function render() { renderer.info.reset(); if (renderRoute === 'composer') { if (!composer.render(0)) throw Error('Selected compositor suppressed an expected review frame'); } else renderer.render(scene, camera); }
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
    return {occupiedPixels, effectPixels, glError: gl.getError(), shaderErrors: [...shaderErrors], state: runtime.stats(), composer: composer.inspect(), renderRoute, actors: actors.map(value => ({id: value.id, state: value.actor.stats()})), events: [...events],
      render: {...renderer.info.render}, memory: {...renderer.info.memory}, camera: {position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), projection: camera.projectionMatrix.toArray()}};
  }
  function reset() { playing = false; for (const value of actors) { value.actor.dispose(); value.movement.removeFromParent(); } actors = []; events.length = 0; traces.length = 0; runtime.reset(); }
  function select(id, {count = 1, outcomeMode = 'rehearsal', measure = true, renderFrame = true} = {}) {
    reset(); current = loaded.get(id); if (!current) throw Error('Explicit original model case missing');
    selectionSceneStart = runtime.stats().time;
    const bounds = new THREE.Box3().setFromObject(current.source.scene), size = bounds.getSize(new THREE.Vector3()).length(), center = bounds.getCenter(new THREE.Vector3()); if (!(size > 0)) throw Error('Real model fixture has no visible geometry');
    camera.near = Math.max(.001, size / 1000); camera.far = size * 100; camera.position.copy(center).add(new THREE.Vector3(size * .7, size * .4, size * 1.8)); camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    for (let index = 0; index < count; index++) {
      const movement = new THREE.Group(), visual = skeletonClone(current.source.scene); movement.add(visual); movement.position.x = index * size * .65; scene.add(movement);
      const id = current.item.id + '-' + index, actor = runtime.createActor({id, visualRoot: visual, movementRoot: movement, animations: current.source.animations, package: current.admitted,
        onEvent: event => { if (events.length >= 32768) throw Error('Event evidence budget exceeded'); events.push(event); }});
      actors.push({id, movement, visual, actor, endpointTimes: new Map()}); const targets = {};
      for (const target of current.pkg.targets.filter(value => value.mode === 'fixed-world-point')) targets[target.id] = center.clone().add(new THREE.Vector3(size * .5 + index * size * .65, 0, 0)).toArray();
      actor.start(current.item.action || current.pkg.actions[0].id, {targets: {...targets, ...(current.item.targets || {})}, outcomeMode});
    }
    if (renderFrame) render(); return measure ? metrics() : null;
  }
  function step(delta) {
    for (const value of actors) for (const target of current.pkg.targets.filter(target => target.mode === 'continuous-world-point')) {
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
  function timed(operation) { gl.finish(); const started = performance.now(), value = operation(), cpuEnd = performance.now(); gl.finish(); return {value, cpuMs: cpuEnd - started, finishWallMs: performance.now() - started}; }
  function phase() {
    const samples = []; let maxSystems = 0, maxParticles = 0; gl.finish(); const started = performance.now();
    for (let index = 0; index < 32; index++) { const a = performance.now(); step(1 / 120); const b = performance.now(); render(); const c = performance.now(); gl.finish(); const d = performance.now();
      samples.push({updateCpuMs: b - a, renderSubmitCpuMs: c - b, finishWaitMs: d - c, frameFinishWallMs: d - a}); const observed = service.stats(); maxSystems = Math.max(maxSystems, observed.systems); maxParticles = Math.max(maxParticles, observed.particles); }
    return {samples, perFrameWallMs: (performance.now() - started) / 32, maxSystems, maxParticles, finalService: service.stats(), draws: {...renderer.info.render}, memory: {...renderer.info.memory}};
  }
  async function benchmark(id) {
    if (playing) throw Error('Normal playback owns the presentation clock'); reset(); const value = loaded.get(id); if (!value) throw Error('Explicit benchmark model missing');
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
    ambient?.retire(); if (ambientPackage) service.releasePackage(ambientPackage); reset();
    return {id, load: value.load, runtimeConstructionMs, renderRoute, composer: composer.inspect(), stages: {resourceAdmission: {cpuMs: admission.cpuMs, finishWallMs: admission.finishWallMs}, actorConstruction: {cpuMs: actorsStage.cpuMs, finishWallMs: actorsStage.finishWallMs}, initialUpdate: {cpuMs: firstUpdate.cpuMs, finishWallMs: firstUpdate.finishWallMs}, firstCompileRender: {cpuMs: compile.cpuMs, finishWallMs: compile.finishWallMs}, peakActors: {cpuMs: peakActors.cpuMs, finishWallMs: peakActors.finishWallMs}, peakAmbient: {cpuMs: peakAmbient.cpuMs, finishWallMs: peakAmbient.finishWallMs}, peakCompileRender: {cpuMs: peakCompile.cpuMs, finishWallMs: peakCompile.finishWallMs}}, steady, peak, peakTime, ambientAvailable: !!ambientSource, cleanup: {activeEffects: runtime.stats().activeEffects, systems: service.stats().systems},
      scope: 'Candidate absolute real-model scheduler cost. Inputs/model decode are loaded once; exact byte/resource re-admission, actor construction and first compile/render are measured separately each run. Peak is the declared representative two-actor plus available sprite ambient interval, not a certification of every possible game workload.'};
  }
  async function normal(id) {
    select(id); playing = true; const duration = Math.max(...current.pkg.actions.map(action => action.retireAt)) + .2, started = performance.now(), samples = [], counts = []; let prior = null;
    await new Promise((resolve, reject) => {
      function frame(now) { try { if (!playing) throw Error('Normal playback interrupted'); if (prior === null) { prior = now; requestAnimationFrame(frame); return; } const delta = (now - prior) / 1000; prior = now; if (delta > 1) throw Error('Exceptional normal-speed frame exceeds selected reject policy');
        const before = performance.now(); advance(delta, false); samples.push(performance.now() - before); counts.push(runtime.stats().activeEffects);
        if ((now - started) / 1000 >= duration) resolve(); else requestAnimationFrame(frame); } catch (error) { reject(error); } }
      requestAnimationFrame(frame);
    });
    playing = false; lastNormal = {id, elapsedSeconds: (performance.now() - started) / 1000, frames: samples.length, frameCpuMs: samples, activeEffects: counts, final: metrics()}; return lastNormal;
  }
  window.__actionVfxReview = {driver, cases: [...loaded.keys()], fixture, select, advance, advanceTo, metrics, normal, benchmark,
    reset, traces: () => [...traces], dispose() { reset(); runtime.dispose(); const preserved = borrowed.every(value => !value.disposed()), composerPreserved = !composer.inspect().disposed, framesBefore = composer.inspect().frames; service.dispose(); composer.render(0); const composerSurvivesActionDisposal = composer.inspect().frames === framesBefore + 1; const composerFirstDispose = composer.dispose(), composerSecondDispose = composer.dispose(); for (const value of borrowed) value.resource.dispose();
      const geometries = new Set(), materials = new Set(); for (const value of loaded.values()) value.source.scene.traverse(node => { if (node.geometry) geometries.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material) materials.add(material); });
      for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); renderer.dispose(); return {borrowedResourcesPreserved: preserved, composerPreserved, composerSurvivesActionDisposal, composerFirstDispose, composerSecondDispose, composer: composer.inspect(), normal: lastNormal, finalSystems: service.stats().systems}; }};
  document.querySelector('#status').textContent = 'Original engineering models ready'; window.__actionVfxReady = true;
} catch (error) { window.__reviewError = String(error.stack || error); document.querySelector('#status').textContent = 'Unavailable: ' + error.message; console.error(error); }
