import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createThreeQuarksRuntime} from '../.engine/threejs/particles/three-quarks-runtime.mjs';
import {createThreeVfxRuntime, inspectVfxTexture} from '../.engine/threejs/particles/three-vfx-runtime.mjs';
import {inspectVfxGeometry, atlasFrameUv, atlasFrameIndex} from '../.engine/threejs/particles/vfx-package.mjs';

// Explicit already-installed dependencies only. This executable never acquires
// packages. Renderer-shaped admission below is CPU evidence, never WebGL proof.
const BASE = fileURLToPath(new URL('../', import.meta.url));
const modules = path.resolve(process.env.HEPHAERA_VFX_NODE_MODULES || path.join(BASE, 'tests/fixtures/threejs-postprocessing/node_modules'));
const moduleUrl = name => pathToFileURL(path.join(modules, name));
if (!fs.existsSync(path.join(modules, 'three.quarks/package.json'))) throw new Error('Select existing verified modules with HEPHAERA_VFX_NODE_MODULES; this test installs nothing.');
const THREE = await import(moduleUrl('three/build/three.module.js'));
const Quarks = await import(moduleUrl('three.quarks/dist/three.quarks.esm.js'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const HASH = 'a'.repeat(64), PREPARATION = 'b'.repeat(64), GEOMETRY = 'c'.repeat(64);
let checks = 0;
const eq = (a, b, why) => { assert.deepEqual(a, b, why); checks++; };
const ok = (value, why) => { assert.ok(value, why); checks++; };
const near = (a, b, why, epsilon = 1e-8) => { assert.ok(Math.abs(a - b) <= epsilon, `${why || 'value'}: ${a} differs from ${b}`); checks++; };
const rejects = (fn, pattern, why) => { assert.throws(fn, pattern, why); checks++; };
const selection = {effectiveEngine: 'THREEJS', particles: {package: 'three.quarks'}};
const renderer = {isWebGLRenderer: true};
const families = ['sprite', 'burst', 'ring', 'mesh', 'projectile', 'trail', 'impact', 'ground-indicator', 'beam'];
const budgets = {maxSystems: 32, maxParticles: 1024, maxTrailPoints: 1024, maxVertices: 200000,
  maxIndices: 400000, maxDrawCalls: 32, maxTextureBytes: 1048576, maxBufferBytes: 16000000,
  maxDurationSeconds: 10, maxUpdateSeconds: .1};
const nativeBudgets = {maxPackageBytes: 1048576, maxDependencyBytes: 65536, maxTotalDependencyBytes: 131072,
  maxDependencies: 2, maxEffects: 1, maxLayers: 16, maxParticles: 1024, maxVertices: 200000,
  maxDrawCalls: 32, maxTrailPoints: 1024, maxDurationSeconds: 10};
function fixture(wanted = families) {
  const nativePackage = {schemaVersion: 'bubo-vfx-package/v1', id: 'owned-cpu-fixture', version: 'v1', styleSha256: HASH,
    engine: {id: 'THREEJS', contractSha256: HASH, definitionSha256: HASH, registrySha256: HASH}, budgets: nativeBudgets,
    resources: [{id: 'atlas', kind: 'texture-png', path: 'textures/atlas.png', sha256: HASH, bytes: 200},
      {id: 'mesh', kind: 'mesh-glb', path: 'meshes/original.glb', sha256: GEOMETRY, bytes: 200}],
    effects: [{id: 'cast', durationSeconds: 4, layers: wanted.map(family => ({id: family, kind: family,
      startSeconds: 0, durationSeconds: 4, resourceIds: family === 'mesh' ? ['mesh'] : ['atlas'],
      maxParticles: 32, maxVertices: 10000, maxDrawCalls: 1, maxTrailPoints: family === 'trail' ? 128 : 0}))}]};
  nativePackage.effects[0].layers.forEach(layer => { if (layer.kind === 'beam') layer.resourceIds = []; });
  if (wanted.length === 1 && wanted[0] === 'beam') nativePackage.effects[0].layers.push({id: 'unused-sprite', kind: 'sprite', startSeconds: 0,
    durationSeconds: 4, resourceIds: ['atlas'], maxParticles: 1, maxVertices: 4, maxDrawCalls: 1, maxTrailPoints: 0});
  const referenced = new Set(nativePackage.effects[0].layers.flatMap(layer => layer.resourceIds));
  nativePackage.resources = nativePackage.resources.filter(resource => referenced.has(resource.id));
  const packageSha256 = sha(JSON.stringify(nativePackage));
  const profile = {schemaVersion: 'hephaera-three-vfx-profile/v1', nativePackageSha256: packageSha256, preparationSha256: PREPARATION, budgets: {...budgets},
    layers: wanted.map(family => ({effectId: 'cast', layerId: family, family,
      emission: {kind: 'burst', capacity: family === 'beam' ? 1 : family === 'trail' ? 2 : 4, count: family === 'beam' || family === 'trail' ? 1 : 2,
        rate: 0, lifetimeSeconds: .3, durationSeconds: 1}, size: .3, speed: 0, color: [1, .5, .25, .8],
      space: 'world', maxTailSeconds: .5, ...(family === 'mesh' ? {geometry: {kind: 'binding', resourceId: 'mesh'}} :
        family === 'ring' || family === 'ground-indicator' ? {geometry: {kind: 'ring', innerRadius: .2, outerRadius: .5, segments: 16}} : {}),
      ...(family === 'mesh' || family === 'beam' ? {} : {resourceId: 'atlas'}), ...(family === 'trail' ? {trail: {historyPoints: 8}} : {})}))};
  const texture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(255), 4, 4);
  texture.needsUpdate = true;
  const geometry = new THREE.BoxGeometry(.2, .2, .2); geometry.clearGroups();
  return {nativePackage, packageSha256, profile, texture, geometry};
}
function options(scene, extra = {}) { return {THREE, Quarks, scene, renderer, engineSelection: selection, budgets: {...budgets}, ...extra}; }
function systems(scene) { const output = []; scene.traverse(node => { if (node.system instanceof Quarks.ParticleSystem) output.push(node.system); }); return output; }
function batch(scene) { return scene.children.find(node => node.type === 'BatchedRenderer'); }
function geometryInventory(scene) {
  const arrays = new Set(); let vertices = 0, indices = 0;
  scene.traverse(node => {
    const geometry = node.geometry; if (!geometry?.isBufferGeometry) return;
    vertices += geometry.attributes.position?.count || 0; indices += geometry.index?.count || 0;
    for (const attribute of [...Object.values(geometry.attributes), geometry.index].filter(Boolean)) arrays.add(attribute.array || attribute.data.array);
  });
  return {bufferBytes: [...arrays].reduce((sum, array) => sum + array.byteLength, 0), vertices, indices};
}
function bindings(f) {
  const geometrySha256 = inspectVfxGeometry(f.geometry).sha256;
  return [{id: 'atlas', sha256: HASH, texture: f.texture, width: f.texture.image.width, height: f.texture.image.height, colorSpace: 'srgb', alpha: 'straight',
    review: {resourceSha256: HASH, pixelsSha256: inspectVfxTexture(f.texture).pixelsSha256, independent: true,
      sourceEvidence: {path: 'inputs/reviews/original-texture.json', sha256: HASH}}},
    {id: 'mesh', sha256: GEOMETRY, geometry: f.geometry, review: {resourceSha256: GEOMETRY,
      geometrySha256, maxVertices: 10000, maxIndices: 10000, maxBytes: 1048576, independent: true,
      sourceEvidence: {sha256: GEOMETRY, path: 'inputs/reviews/original-mesh.json'}}}]
    .filter(binding => f.nativePackage.resources.some(resource => resource.id === binding.id));
}
function admit(service, f, patch = {}) { return service.admit({package: f.nativePackage, packageSha256: f.packageSha256,
  preparationSha256: PREPARATION, profile: f.profile, bindings: bindings(f), ...patch}); }
function acquire(service, pkg, family, extra = {}) { return service.acquire({package: pkg, effectId: 'cast', layerId: family,
  id: family, ownerId: 'actor-a', ...(family === 'beam' ? {endpoints: {start: [0, 0, 0], end: [0, 2, 0]}} : {}), ...extra}); }
function releaseFixture(f) { f.texture.dispose(); f.geometry.dispose(); }
function recalculate(f) { f.packageSha256 = sha(JSON.stringify(f.nativePackage)); f.profile.nativePackageSha256 = f.packageSha256; return f; }

eq(Object.fromEntries(['three', 'three.quarks', 'quarks.core'].map(name => [name,
  JSON.parse(fs.readFileSync(path.join(modules, name, 'package.json'))).version])),
  {three: '0.182.0', 'three.quarks': '0.17.1', 'quarks.core': '0.17.1'}, 'actual installed versions');
rejects(() => createThreeVfxRuntime(), /THREEJS|Resolve|Scene/);
rejects(() => createThreeVfxRuntime(options(new THREE.Scene(), {engineSelection: {effectiveEngine: 'UNITY'}})), /THREEJS|Resolve/);
rejects(() => createThreeVfxRuntime(options(new THREE.Scene(), {renderer: {isWebGPURenderer: true}})), /WebGL/);
for (const [rateNumerator, rateDenominator] of [[24, 1], [60, 1], [30000, 1001], [24000, 1001], [25, 1]]) {
  const atlas = {frames: [{}, {}, {}], rateNumerator, rateDenominator, loop: 'repeat'};
  for (let frame = 1; frame <= 1000; frame++) {
    const boundary = frame * rateDenominator / rateNumerator;
    assert.equal(atlasFrameIndex(atlas, boundary - 1e-12), (frame - 1) % 3, 'rational predecessor frame');
    assert.equal(atlasFrameIndex(atlas, boundary), frame % 3, 'represented exact rational frame boundary');
    assert.equal(atlasFrameIndex(atlas, boundary + 1e-12), frame % 3, 'rational successor frame');
  }
  ok(true, '1000 exact rational boundaries and immediate neighbours for rate ' + rateNumerator + '/' + rateDenominator);
}

// Every promised family must construct real library presentation, advance on
// one owner clock, and leave an empty scene after owned disposal.
for (const family of families) {
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene)), f = fixture([family]);
  const pkg = admit(service, f), lease = acquire(service, pkg, family);
  ok(Object.isFrozen(lease), family + ' public lease is immutable');
  ok(!('emitter' in lease) && !('system' in lease) && !('renderer' in lease), family + ' does not expose mutable backend inventory');
  eq(scene.children.filter(node => node.type === 'BatchedRenderer').length, 1, 'single scene renderer for ' + family);
  service.update(.02);
  ok(lease.stats().particles > 0 || family === 'beam', family + ' is actual visible presentation');
  const actual = service.stats();
  ok(actual.bufferBytes > 0 && actual.drawCalls > 0, family + ' reports actual allocated buffers/draws');
  if (family === 'beam') eq(scene.children.find(node => node.isMesh && node.geometry.type === 'CylinderGeometry').material.forceSinglePass,
    true, 'owned transparent beam material explicitly selects one render pass; actual GPU draw count is verified separately');
  const observed = geometryInventory(scene);
  eq(actual.bufferBytes, observed.bufferBytes, family + ' reports actual unique geometry/instance buffer bytes');
  eq(actual.vertices, observed.vertices, family + ' reports actual scene presentation geometry vertices');
  eq(actual.indices, observed.indices, family + ' reports actual scene presentation geometry indices');
  lease.retire();
  eq(service.stats().systems, 0, family + ' releases owner system reservation');
  eq(batch(scene).batches.length, 0, family + ' retires empty actual Quarks batches');
  const empty = service.stats();
  eq([empty.bufferBytes, empty.reservedBufferBytes, empty.vertices, empty.indices, empty.reservedVertices, empty.reservedIndices,
    empty.textureBytes, empty.trailPoints, empty.drawCalls], Array(9).fill(0), family + ' returns every actual/reserved resource bound');
  service.dispose(); service.dispose();
  eq(scene.children.length, 0, family + ' scene cleanup');
  releaseFixture(f);
}

// Two independently paused/cancelled actors plus a starter ambient emitter all
// share one BatchedRenderer and the same aggregate budgets/clock.
{
  const scene = new THREE.Scene(), owner = createThreeQuarksRuntime({...options(scene), ...budgets});
  const ambient = owner.createEmitter({id: 'ambient', capacity: 32, rate: 20, lifetime: .5, speed: 0});
  const service = createThreeVfxRuntime(options(scene, {owner})), f = fixture(['sprite']);
  const pkg = admit(service, f), a = acquire(service, pkg, 'sprite', {id: 'actor-a', ownerId: 'actor-a'}),
    b = acquire(service, pkg, 'sprite', {id: 'actor-b', ownerId: 'actor-b'});
  service.update(.05); const before = a.stats(), bBefore = b.stats(), ambientBefore = ambient.stats();
  a.pause(); service.update(.05);
  near(a.stats().time, before.time, 'actor A pause owns only A');
  ok(b.stats().time > bBefore.time && ambient.stats().time > ambientBefore.time, 'actor B and ambient advance while A is paused');
  a.resume(); service.update(.02); ok(a.stats().time > before.time, 'scoped actor resume');
  service.pause(); const allPaused = [a.stats(), b.stats(), ambient.stats()]; service.update(.05);
  eq([a.stats(), b.stats(), ambient.stats()], allPaused, 'scene suspension is explicit and freezes all owners'); service.resume();
  a.retire(); eq(owner.stats().systems, 2, 'actor cancellation preserves other actor and ambient');
  const fresh = acquire(service, pkg, 'sprite', {id: 'actor-a', ownerId: 'actor-a'});
  eq(a.retire(), false, 'stale lease cannot retire recreated ID');
  eq(a.pause(), false, 'stale lease cannot pause recreated ID');
  ok(fresh.generation !== a.generation, 'recreated lease has a new generation');
  eq(scene.children.filter(node => node.type === 'BatchedRenderer').length, 1, 'starter and production share renderer');
  rejects(() => createThreeVfxRuntime(options(scene)), /already|owner|share/);
  service.dispose(); eq(owner.stats().systems, 1, 'borrowed owner survives production disposal');
  ambient.dispose(); owner.dispose(); releaseFixture(f);
}
{
  const scene = new THREE.Scene(), owner = createThreeQuarksRuntime({...options(scene), ...budgets});
  const ambient = owner.createEmitter({id: 'ambient', capacity: 32, rate: 20, lifetime: .5});
  const service = createThreeVfxRuntime(options(scene, {owner})), f = fixture(['sprite']), pkg = admit(service, f);
  let prior;
  for (let iteration = 0; iteration < 20; iteration++) {
    const current = acquire(service, pkg, 'sprite'); service.update(.01);
    if (prior) { eq(prior.retire(), false, 'retired pooled lease cannot remove current generation'); ok(current.generation !== prior.generation, 'pooled restart renews generation'); }
    current.retire(); prior = current;
    eq(service.stats().productionSystems, 0, 'pooled restart leaves no owned production system');
  }
  acquire(service, pkg, 'sprite'); const clock = owner.stats().time; service.reset();
  eq(owner.stats().systems, 1, 'production reset preserves unrelated ambient emitter');
  near(owner.stats().time, clock, 'production reset does not rewrite scene presentation clock');
  ok(ambient.stats().active, 'production reset leaves ambient active');
  service.dispose(); owner.dispose(); releaseFixture(f);
}

// endEmit in the real dependency still flushes pending emission. A stopped
// production lease must close that path and enforce seconds-based tail expiry.
{
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene)), f = fixture(['sprite', 'trail']);
  const layer = f.profile.layers[0]; layer.emission = {kind: 'rate', capacity: 16, rate: 20, count: 0, lifetimeSeconds: .3, durationSeconds: 2};
  const pkg = admit(service, f), sprite = acquire(service, pkg, 'sprite');
  service.update(.09); const before = sprite.stats().particles;
  sprite.stopEmission({maxTailSeconds: .2}); service.update(.01);
  ok(sprite.stats().particles <= before, 'stopEmission never flushes pending rate particles');
  for (let i = 0; i < 4; i++) service.update(.05);
  eq(sprite.stats().disposed, true, 'bounded seconds retire draining sprite');
  const trail = acquire(service, pkg, 'trail'); service.update(.05); service.update(.05);
  ok(trail.stats().particles > 0, 'trail has actual particles/history before drain');
  trail.stopEmission({maxTailSeconds: .1}); service.update(.1);
  eq(trail.stats().disposed, true, 'trail frame-count history cannot exceed declared seconds tail');
  eq(service.stats().systems, 0, 'tails return aggregate reservations');
  const pendingBurst = acquire(service, pkg, 'trail', {id: 'pending-burst'});
  pendingBurst.stopEmission({maxTailSeconds: .1}); service.update(.01);
  eq(pendingBurst.stats().particles, 0, 'emission stop before first update suppresses pending scheduled burst');
  service.dispose(); releaseFixture(f);
}

// Exact native padded atlas coordinates and rational frame timing, including
// instants immediately around a boundary and the actual emitted particles.
for (const loop of ['once', 'repeat']) {
  const f = fixture(['sprite']), count = 3, period = 1001 / 30000;
  const atlas = {resourceId: 'atlas', width: 18, height: 7, origin: 'top-left', alpha: 'straight', colorSpace: 'srgb',
    padding: 1, extrusion: 1, frames: Array.from({length: count}, (_, index) => ({sourceFrame: index, cellX: index * 6,
      cellY: 0, cellWidth: 6, cellHeight: 7, x: index * 6 + 2, y: 2, width: 2, height: 3})),
    rateNumerator: 30000, rateDenominator: 1001, loop, durationNumerator: 1001, durationDenominator: 10000,
    bindings: [{effectId: 'cast', layerId: 'sprite'}]};
  f.nativePackage.schemaVersion = 'bubo-vfx-package/v2'; f.nativePackage.atlases = [atlas]; recalculate(f);
  f.texture.dispose(); f.texture = new THREE.DataTexture(new Uint8Array(18 * 7 * 4).fill(127), 18, 7);
  for (let index = 1; index <= 6; index++) {
    const expected = frame => loop === 'repeat' ? frame % count : Math.min(frame, count - 1);
    eq(atlasFrameIndex(atlas, index * period - 1e-12), expected(index - 1), loop + ' frame stays before exact rational boundary');
    eq(atlasFrameIndex(atlas, index * period), expected(index), loop + ' frame changes at exact rational boundary');
    eq(atlasFrameIndex(atlas, index * period + 1e-12), expected(index), loop + ' frame stays after exact rational boundary');
  }
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene)), pkg = admit(service, f), lease = acquire(service, pkg, 'sprite');
  const system = systems(scene)[0], uv = system.getRendererSettings().instancingGeometry.getAttribute('uv');
  const positions = system.getRendererSettings().instancingGeometry.getAttribute('position');
  const xs = Array.from({length: positions.count}, (_, index) => positions.getX(index)), ys = Array.from({length: positions.count}, (_, index) => positions.getY(index));
  near((Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys)), 2 / 3,
    loop + ' atlas sprite geometry uses interior bitmap aspect, excluding gutters', 1e-7);
  for (let frame = 0; frame < count; frame++) {
    const rectangle = atlasFrameUv(atlas, frame), actualU = [], actualV = [];
    for (let vertex = 0; vertex < uv.count; vertex++) { actualU.push((uv.getX(vertex) + frame) / 3); actualV.push(uv.getY(vertex)); }
    near(Math.min(...actualU), rectangle.u0, 'actual base geometry preserves padded interior left', 1e-7);
    near(Math.max(...actualU), rectangle.u1, 'actual base geometry preserves padded interior right', 1e-7);
    near(Math.min(...actualV), 2 / 7, 'actual UV converts top-left origin once', 1e-7);
    near(Math.max(...actualV), 5 / 7, 'actual UV excludes both gutters', 1e-7);
  }
  for (let tick = 0; tick < 13; tick++) {
    service.update(.01);
    for (const particle of system.particles.slice(0, system.particleNum)) {
      const elapsedFrames = Math.floor(particle.age / period);
      const expected = loop === 'repeat' ? elapsedFrames % count : Math.min(elapsedFrames, count - 1);
      eq(particle.uvTile, expected, loop + ' real Quarks particle follows rational frame clock');
    }
  }
  eq(system.uTileCount, 3, 'actual non-square horizontal tile count'); eq(system.vTileCount, 1, 'actual non-square vertical tile count');
  ok(lease.stats().frameIndices.length > 0, 'atlas actual frame inventory exposed read-only');
  service.dispose(); releaseFixture(f);
}
{
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene)), f = fixture(['sprite']);
  f.texture.dispose(); f.texture = new THREE.DataTexture(new Uint8Array(2 * 3 * 4).fill(255), 2, 3);
  const pkg = admit(service, f); acquire(service, pkg, 'sprite');
  const positions = systems(scene)[0].getRendererSettings().instancingGeometry.getAttribute('position');
  const xs = Array.from({length: positions.count}, (_, index) => positions.getX(index)), ys = Array.from({length: positions.count}, (_, index) => positions.getY(index));
  near((Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys)), 2 / 3, 'v1 sprite preserves reviewed non-square bitmap aspect', 1e-7);
  near(Math.max(...ys) - Math.min(...ys), 1, 'sprite size remains declared world height');
  service.dispose(); releaseFixture(f);
}

// Aggregate admission covers actual default library allocations, starter
// particles, all active tails, geometry, history, texture copies and draws.
for (const [limit, value, family] of [
  ['maxBufferBytes', 30000, 'sprite'], ['maxTextureBytes', 63, 'sprite'], ['maxVertices', 15, 'sprite'],
  ['maxIndices', 23, 'sprite'], ['maxTrailPoints', 15, 'trail']
]) {
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene, {budgets: {...budgets, [limit]: value}})), f = fixture([family]);
  const pkg = admit(service, f), before = service.stats();
  rejects(() => acquire(service, pkg, family), /capacity|budget|limit|bound/i, limit + ' rejects before retained allocation');
  eq(service.stats(), before, limit + ' rejection preserves exact owner inventory');
  eq(batch(scene).batches.length, 0, limit + ' rejects before allocating actual Quarks batch buffers');
  service.dispose(); releaseFixture(f);
}
for (const limit of ['maxVertices', 'maxIndices']) {
  let allocations = 0;
  const observedQuarks = {...Quarks, ParticleSystem: class extends Quarks.ParticleSystem { constructor(...args) { allocations++; super(...args); } }};
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene, {Quarks: observedQuarks, budgets: {...budgets, [limit]: 1000}}));
  const f = fixture(['trail']), pkg = admit(service, f);
  rejects(() => acquire(service, pkg, 'trail'), /capacity|budget|limit|bound/i, 'actual default trail geometry is rejected before allocation');
  eq(allocations, 0, limit + ' includes actual 10000-slot upstream trail buffers before constructing a system');
  service.dispose(); releaseFixture(f);
}
{
  const scene = new THREE.Scene(), owner = createThreeQuarksRuntime({...options(scene), maxParticles: 35, maxSystems: 2, maxDrawCalls: 1});
  const ambient = owner.createEmitter({id: 'ambient', capacity: 32, rate: 20, lifetime: .5});
  const service = createThreeVfxRuntime(options(scene, {owner})), f = fixture(['sprite']), pkg = admit(service, f), before = owner.stats();
  rejects(() => acquire(service, pkg, 'sprite'), /capacity|budget|limit|bound/i, 'ambient reservation participates in production aggregate limits');
  eq(owner.stats(), before, 'aggregate rejection retains ambient and actual existing buffers');
  service.dispose(); ambient.dispose(); owner.dispose(); releaseFixture(f);
}
{
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene, {budgets: {...budgets, maxSystems: 1}})), f = fixture(['sprite']), pkg = admit(service, f);
  const first = acquire(service, pkg, 'sprite'); service.update(.01); first.stopEmission({maxTailSeconds: .5});
  rejects(() => acquire(service, pkg, 'sprite', {id: 'second', ownerId: 'actor-b'}), /capacity|budget|limit|bound/i, 'draining lease remains in scene system budget');
  first.retire(); const second = acquire(service, pkg, 'sprite', {id: 'second', ownerId: 'actor-b'});
  ok(!second.stats().disposed, 'hard retirement releases bounded slot for next owner');
  service.dispose(); releaseFixture(f);
}

// Borrowed resources remain byte/configuration-identical and undisposed. Every
// generated batch/material/texture wrapper receives its own retirement.
{
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene)), f = fixture(['mesh', 'sprite']);
  f.texture.flipY = false; f.texture.minFilter = THREE.NearestFilter; f.texture.magFilter = THREE.NearestFilter;
  const beforeTexture = {flipY: f.texture.flipY, minFilter: f.texture.minFilter, magFilter: f.texture.magFilter,
    colorSpace: f.texture.colorSpace, generateMipmaps: f.texture.generateMipmaps, pixels: Buffer.from(f.texture.image.data)};
  const beforeGeometry = Buffer.from(f.geometry.attributes.position.array.buffer).toString('hex');
  let textureDisposals = 0, geometryDisposals = 0, ownedGeometry = 0, ownedMaterial = 0, ownedTexture = 0;
  f.texture.addEventListener('dispose', () => textureDisposals++); f.geometry.addEventListener('dispose', () => geometryDisposals++);
  const pkg = admit(service, f), sprite = acquire(service, pkg, 'sprite'), mesh = acquire(service, pkg, 'mesh');
  for (const system of systems(scene)) {
    system.getRendererSettings().instancingGeometry.addEventListener('dispose', () => ownedGeometry++);
    const material = system.getRendererSettings().material; material.addEventListener('dispose', () => ownedMaterial++);
    material.map?.addEventListener('dispose', () => ownedTexture++);
  }
  const batches = batch(scene).batches; let generatedMaterialDisposals = 0;
  for (const entry of batches) for (const material of new Set([entry.material, entry.settings.material])) material.addEventListener('dispose', () => generatedMaterialDisposals++);
  service.update(.01); sprite.retire(); mesh.retire();
  eq(batch(scene).batches.length, 0, 'empty batches are released and indices rebuilt');
  eq(ownedGeometry, 2, 'owned geometry snapshots disposed once'); eq(ownedMaterial, 2, 'owned material snapshots disposed once');
  eq(ownedTexture, 1, 'owned uploaded texture snapshot disposed once'); eq(generatedMaterialDisposals, 4, 'both actual Quarks material clones per batch disposed');
  eq(textureDisposals, 0, 'borrowed original texture remains owned by caller'); eq(geometryDisposals, 0, 'borrowed original geometry remains owned by caller');
  eq({flipY: f.texture.flipY, minFilter: f.texture.minFilter, magFilter: f.texture.magFilter,
    colorSpace: f.texture.colorSpace, generateMipmaps: f.texture.generateMipmaps, pixels: Buffer.from(f.texture.image.data)}, beforeTexture, 'borrowed texture configuration/pixels unchanged');
  eq(Buffer.from(f.geometry.attributes.position.array.buffer).toString('hex'), beforeGeometry, 'borrowed original geometry bytes unchanged');
  f.texture.image.data[0] ^= 1;
  rejects(() => acquire(service, pkg, 'sprite'), /changed|hash/i, 'borrowed resource drift rejected before owned allocation');
  eq(service.stats().systems, 0, 'source drift creates no system');
  service.dispose(); releaseFixture(f);
}

// Mesh envelope checks reject unsupported loader/rig/attribute paths. Native
// GLB bytes never authorize arbitrary runtime decoding or unbounded geometry.
for (const [change, pattern] of [
  [g => g.addGroup(0, 3, 0), /ungrouped|static|geometry/i],
  [g => g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 4), 4)), /attribute|geometry/i],
  [g => g.attributes.position.setX(0, NaN), /coordinate|geometry/i],
  [g => g.index.setX(0, 1000000), /index|bounds/i],
  [g => g.setDrawRange(3, 3), /draw|range|partial/i]
]) {
  const f = fixture(['mesh']); change(f.geometry); rejects(() => inspectVfxGeometry(f.geometry), pattern); releaseFixture(f);
}

for (const [limit, value] of [['maxDrawCalls', 1], ['maxTextureBytes', 64], ['maxParticles', 7], ['maxVertices', 20], ['maxIndices', 30]]) {
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene, {budgets: {...budgets, [limit]: value}})), f = fixture(['sprite']);
  const pkg = admit(service, f), first = acquire(service, pkg, 'sprite'); service.update(.01); const before = service.stats();
  rejects(() => acquire(service, pkg, 'sprite', {id: 'another-actor', ownerId: 'actor-b'}), /capacity|budget|limit|bound/i, 'simultaneous ' + limit + ' aggregate');
  eq(service.stats(), before, 'aggregate ' + limit + ' refusal preserves already-running actor');
  eq(first.stats().disposed, false, 'aggregate refusal does not clear unrelated actor');
  service.dispose(); releaseFixture(f);
}
{
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene)), f = fixture(['sprite', 'beam', 'trail']), pkg = admit(service, f);
  const sprite = acquire(service, pkg, 'sprite'), beam = acquire(service, pkg, 'beam'), trail = acquire(service, pkg, 'trail');
  for (const value of [NaN, Infinity, -1, .100001]) rejects(() => service.update(value), /delta|finite|bound/i, 'invalid/exceptional delta is rejected');
  eq(sprite.stats().time, 0, 'rejected deltas do not advance presentation');
  for (const value of [{scale: [-1, 1, 1]}, {scale: [2, 1, 1]}, {position: [0, Infinity, 0]}, {quaternion: [0, 0, 0, .5]}])
    rejects(() => sprite.setTransform(value), /uniform|positive|finite|quaternion|orientation|scale/i);
  rejects(() => sprite.setEndpoints({start: [0, 0, 0], end: [0, 1, 0]}), /beam/i);
  rejects(() => beam.setTransform({position: [1, 2, 3]}), /endpoint|beam/i);
  for (const endpoints of [{start: [0, 0, 0], end: [0, 0, 0]}, {start: [NaN, 0, 0], end: [0, 1, 0]}, {start: [0, 0, 0], end: [0, Infinity, 0]}])
    rejects(() => beam.setEndpoints(endpoints), /finite|length|endpoint|beam/i);
  beam.setEndpoints({start: [1, 2, 3], end: [1, 6, 3]});
  const beamMesh = scene.children.find(node => node.isMesh && node.geometry.type === 'CylinderGeometry');
  near(beamMesh.position.x, 1, 'beam world midpoint x'); near(beamMesh.position.y, 4, 'beam world midpoint y');
  near(beamMesh.scale.y, 4, 'beam uses supplied finite endpoint distance');
  for (let tick = 0; tick < 6; tick++) service.update(.02);
  ok(trail.stats().historyPoints > 0, 'actual trail history populated');
  trail.resetHistory(); eq(trail.stats().historyPoints, 0, 'explicit discontinuity clears retained trail history');
  trail.setTransform({position: [100, 0, 0]}); service.update(.02);
  ok(trail.stats().historyPoints <= 2, 'teleport starts a fresh bounded history');
  sprite.stopEmission({maxTailSeconds: .1}); sprite.pause(); const pausedTail = sprite.stats().tailRemaining;
  service.update(.1); near(sprite.stats().tailRemaining, pausedTail, 'scoped pause preserves attached tail clock');
  ok(!sprite.stats().disposed, 'paused tail stays reserved');
  sprite.stopEmission({maxTailSeconds: .5}); near(sprite.stats().tailRemaining, pausedTail, 'repeated stop cannot extend an existing tail');
  sprite.resume(); service.update(.1); eq(sprite.stats().disposed, true, 'resumed tail retires at its remaining bound');
  service.dispose(); releaseFixture(f);
}

// An upstream synchronous end callback can retire its generation. The fixed
// service must recheck the lease before touching now-released owned resources.
{
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene)), f = fixture(['sprite']), pkg = admit(service, f);
  const old = acquire(service, pkg, 'sprite'), system = systems(scene)[0]; let fresh;
  system.addEventListener('emitEnd', () => { old.retire(); fresh = acquire(service, pkg, 'sprite'); });
  eq(old.stopEmission({maxTailSeconds: .2}), false, 'end callback retirement invalidates current drain generation');
  ok(fresh && !fresh.stats().disposed && fresh.generation !== old.generation, 'callback replacement has independent current generation');
  eq(old.setTransform({position: [10, 10, 10]}), false, 'retired callback generation cannot move replacement');
  eq(old.resetHistory(), false, 'retired callback generation cannot clear replacement history');
  service.update(.01); ok(fresh.stats().particles > 0, 'reentrant replacement remains live');
  service.dispose(); releaseFixture(f);
}

// Parent ownership is checked during progression; retirement leaves unrelated
// presentation intact and a detached parent cannot become an implicit scene.
{
  const scene = new THREE.Scene(), parent = new THREE.Group(); scene.add(parent);
  const service = createThreeVfxRuntime(options(scene)), f = fixture(['sprite']), pkg = admit(service, f);
  const attached = acquire(service, pkg, 'sprite', {parent}), unrelated = acquire(service, pkg, 'sprite', {id: 'unrelated', ownerId: 'ambient'});
  service.update(.02); scene.remove(parent);
  rejects(() => service.update(.02), /Scene|parent|detach/);
  eq(attached.stats().disposed, true, 'detached owned parent retires lease');
  eq(unrelated.stats().disposed, false, 'parent loss preserves unrelated lease');
  service.dispose(); releaseFixture(f);
}

// Recipes are data, and unsupported inputs must fail before creating buffers.
{
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene)), f = fixture(['sprite']);
  const empty = service.stats();
  for (const [mutation, pattern] of [
    [x => x.profile.layers[0].shader = 'arbitrary shader', /field|shader|unknown/i],
    [x => x.profile.layers[0].onHit = () => {}, /field|unknown|function|plain data/i],
    [x => x.profile.layers[0].family = 'homing-projectile', /family|unsupported/i],
    [x => x.profile.layers[0].emission.capacity = 1000000000, /capacity|budget|bound/i],
    [x => x.profile.layers[0].maxTailSeconds = Infinity, /finite|tail|bound/i],
    [x => x.profile.nativePackageSha256 = 'd'.repeat(64), /hash|identity|package/i]
  ]) {
    const candidate = {...f, nativePackage: copy(f.nativePackage), profile: copy(f.profile)}; mutation(candidate);
    rejects(() => admit(service, candidate), pattern);
    eq(service.stats(), empty, 'invalid admission has no scene/resource side effect');
  }
  rejects(() => admit(service, f, {bindings: []}), /binding|resource|missing/i);
  rejects(() => admit(service, f, {bindings: [{id: 'atlas', sha256: HASH, url: 'https://example.invalid/input.png'}]}), /binding|texture|resource|field/i);
  const recipe = copy(f.profile); let accessorCalls = 0;
  Object.defineProperty(recipe.layers[0], 'script', {enumerable: true, get() { accessorCalls++; return 'execute'; }});
  rejects(() => admit(service, f, {profile: recipe}), /accessor|field|data/i);
  eq(accessorCalls, 0, 'plain-data admission never executes recipe accessors');
  const bytes = Buffer.from(JSON.stringify(f.nativePackage));
  rejects(() => admit(service, f, {packageBytes: Buffer.concat([bytes, Buffer.from(' ')] )}), /bytes|hash|mismatch/i);
  rejects(() => admit(service, f, {package: {...f.nativePackage, version: 'transplanted'}, packageBytes: bytes}), /snapshot|bytes|mismatch/i);
  ok(Object.isFrozen(admit(service, f, {packageBytes: bytes})), 'exact package bytes and parsed snapshot admit together');
  f.nativePackage.effects[0].layers[0].maxParticles = 1; recalculate(f);
  rejects(() => admit(service, f), /capacity|native|limit/i, 'one-particle native preparation cannot expand production particle capacity implicitly');
  service.dispose(); releaseFixture(f);
}

// Duration budgets apply at admission across scene, borrowed owner and native
// interval. Rejection must precede actual ParticleSystem allocation.
for (const scope of ['scene', 'owner', 'native']) {
  let allocations = 0;
  const observedQuarks = {...Quarks, ParticleSystem: class extends Quarks.ParticleSystem { constructor(...args) { allocations++; super(...args); } }};
  const scene = new THREE.Scene(), f = fixture(['sprite']);
  const owner = scope === 'owner' ? createThreeQuarksRuntime({...options(scene), Quarks: observedQuarks, maxDurationSeconds: .05}) : undefined;
  const service = createThreeVfxRuntime(options(scene, {Quarks: observedQuarks, ...(owner ? {owner} : {}),
    budgets: {...budgets, maxDurationSeconds: scope === 'scene' ? .05 : 10}}));
  if (scope === 'native') { f.nativePackage.effects[0].layers[0].durationSeconds = 1; recalculate(f); }
  const before = service.stats();
  rejects(() => admit(service, f), /duration|tail|lifetime/i, scope + ' lifetime envelope includes maximum tail');
  eq(allocations, 0, scope + ' duration failure occurs before native system allocation');
  eq(service.stats(), before, scope + ' duration failure preserves package/resource inventory');
  service.dispose(); owner?.dispose(); releaseFixture(f);
}
{
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene, {budgets: {...budgets, maxDurationSeconds: .07}})), f = fixture(['sprite']);
  f.profile.layers[0].emission.durationSeconds = .04; f.profile.layers[0].maxTailSeconds = .03;
  const pkg = admit(service, f), lease = acquire(service, pkg, 'sprite'); service.update(.1);
  eq(lease.stats().retired, true, 'one bounded overshooting update retires at maximum total lifetime');
  near(lease.stats().time, .07, 'retired lease time clamps to total lifetime bound');
  eq(service.stats().systems, 0, 'overshoot leaves no active tail reservations');
  service.dispose(); releaseFixture(f);
}

// Recipe arrays must remain inert data even under JavaScript callers. Sparse,
// extended, inherited and accessor arrays cannot invoke map/species/getters.
for (const kind of ['sparse', 'index-getter', 'own-map', 'map-getter', 'prototype', 'species', 'symbol']) {
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene)), f = fixture(['sprite']);
  let callbacks = 0; const layer = f.profile.layers[0], layers = [layer];
  if (kind === 'sparse') { layers.length = 2; delete layers[0]; }
  if (kind === 'index-getter') Object.defineProperty(layers, '0', {enumerable: true, get() { callbacks++; return layer; }});
  if (kind === 'own-map') layers.map = function () { callbacks++; return [layer]; };
  if (kind === 'map-getter') Object.defineProperty(layers, 'map', {enumerable: true, get() { callbacks++; return Array.prototype.map; }});
  if (kind === 'prototype') Object.setPrototypeOf(layers, {map() { callbacks++; return [layer]; }});
  if (kind === 'species') Object.defineProperty(layers, 'constructor', {value: {[Symbol.species]: function () { callbacks++; return []; }}});
  if (kind === 'symbol') layers[Symbol.iterator] = function () { callbacks++; return [layer][Symbol.iterator](); };
  f.profile.layers = layers; const before = service.stats();
  rejects(() => admit(service, f), /array|sparse|dense|plain|accessor|extended/i, kind + ' recipe array is rejected');
  eq(callbacks, 0, kind + ' array callback/accessor is never invoked');
  eq(service.stats(), before, kind + ' array rejection allocates no package or scene resources');
  service.dispose(); releaseFixture(f);
}
{
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene)), f = fixture(['sprite']);
  let callbacks = 0;
  const input = {packageSha256: f.packageSha256, preparationSha256: PREPARATION, profile: f.profile, bindings: bindings(f)};
  Object.defineProperty(input, 'package', {enumerable: true, get() { callbacks++; return f.nativePackage; }});
  rejects(() => service.admit(input), /accessor|field|data/i, 'top admission getter is rejected');
  eq(callbacks, 0, 'top admission getter never executes');
  const native = {...f.nativePackage};
  Object.defineProperty(native, 'id', {enumerable: true, get() { callbacks++; return f.nativePackage.id; }});
  rejects(() => admit(service, f, {package: native, packageBytes: Buffer.from(JSON.stringify(f.nativePackage))}), /accessor|field|data/i,
    'exact-byte comparison cannot execute nested native getters');
  eq(callbacks, 0, 'exact native package bytes do not bypass inert-data checks');
  service.dispose(); releaseFixture(f);
}

// The service delegates quality controls even when it owns the starter. The
// authored ring/ground essential cue stays present at nonzero reduced quality.
for (const family of ['ring', 'ground-indicator']) {
  const scene = new THREE.Scene(), service = createThreeVfxRuntime(options(scene)), f = fixture([family]), pkg = admit(service, f);
  service.setQuality(1); service.setReducedMotion(true);
  eq(service.stats().quality, 1, 'service quality setter reaches its scene owner');
  eq(service.stats().reducedMotion, true, 'service reduced-motion setter reaches its scene owner');
  const low = acquire(service, pkg, family); service.update(.01);
  eq(low.stats().particles, 1, family + ' keeps one authored essential cue in reduced motion/half quality'); low.retire();
  service.setQuality(0); const off = acquire(service, pkg, family); service.update(.01);
  eq(off.stats().particles, 0, family + ' zero quality disables emission');
  eq(systems(scene)[0].emitter.visible, false, family + ' zero quality hides presentation'); off.retire();
  service.setQuality(2); service.setReducedMotion(false); const high = acquire(service, pkg, family); service.update(.01);
  eq(high.stats().particles, 2, family + ' restored quality retains reviewed count');
  rejects(() => service.setQuality(3), /quality|integer|finite/i); rejects(() => service.setReducedMotion('yes'), /boolean/i);
  service.dispose(); releaseFixture(f);
}

const sourceHashes = Object.fromEntries(['tests/test-vfx-threejs-runtime.mjs', '.engine/threejs/particles/three-quarks-runtime.mjs',
  '.engine/threejs/particles/three-vfx-runtime.mjs', '.engine/threejs/particles/vfx-package.mjs'].map(name => [name, sha(fs.readFileSync(path.join(BASE, name)))]));
const summary = {status: 'passed', checks, sourceHashes, modules, families,
  scope: 'Actual installed-library CPU execution; no GPU/browser, image quality, performance, MAUI/device, human acceptance or promotion evidence.'};
if (process.env.HEPHAERA_VFX_TEST_EVIDENCE) {
  const directory = path.resolve(process.env.HEPHAERA_VFX_TEST_EVIDENCE); fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(path.join(directory, 'runtime-cpu.json'), JSON.stringify(summary, null, 2) + '\n');
}
console.log(JSON.stringify(summary));
