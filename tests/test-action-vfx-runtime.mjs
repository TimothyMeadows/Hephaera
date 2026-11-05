import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createThreeVfxRuntime} from '../.engine/threejs/particles/three-vfx-runtime.mjs';
import {createThreeActionScene} from '../.engine/threejs/actions/action-scene.mjs';
import {validateActionV2Package} from '../.engine/threejs/actions/action-package.mjs';
import {sha256} from '../.engine/threejs/particles/vfx-package.mjs';
import {originalFixture, originalActor, engineSelection, vfxBudgets, deltaPolicy, jsonBytes} from './fixtures/action-vfx/original-fixture.mjs';
import {advancePresentationTo} from './fixtures/action-vfx/advance.mjs';

// Actual installed Three/Quarks CPU execution, with original engineered data
// and explicitly synthetic admission. This suite makes no renderer claim.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const modules = path.resolve(process.env.HEPHAERA_VFX_NODE_MODULES || path.join(ROOT, 'tests/fixtures/threejs-postprocessing/node_modules'));
if (!fs.existsSync(path.join(modules, 'three.quarks/package.json'))) throw Error('The explicit repository fixture dependencies are unavailable; select existing modules with HEPHAERA_VFX_NODE_MODULES. No installation is attempted.');
const THREE = await import(pathToFileURL(path.join(modules, 'three/build/three.module.js')));
const Quarks = await import(pathToFileURL(path.join(modules, 'three.quarks/dist/three.quarks.esm.js')));
let checks = 0;
const ok = (condition, why) => { assert.ok(condition, why); checks++; };
const equal = (actual, expected, why) => { assert.deepEqual(actual, expected, why); checks++; };
const near = (actual, expected, why, epsilon = 1e-7) => { assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon, `${why}: ${actual} differs from ${expected}`); checks++; };
const rejects = (operation, pattern, why) => { assert.throws(operation, pattern, why); checks++; };
const copy = value => JSON.parse(JSON.stringify(value));
function harness({fixtureOptions = {}, policy = {}, budgets, serviceBudgets = {}, event} = {}) {
  const scene = new THREE.Scene(), fixture = originalFixture(THREE, fixtureOptions), traces = [];
  const service = createThreeVfxRuntime({THREE, Quarks, scene, renderer: {isWebGLRenderer: true}, engineSelection, budgets: {...vfxBudgets, ...serviceBudgets}});
  const runtime = createThreeActionScene({THREE, scene, vfxRuntime: service, engineSelection, ...(budgets ? {budgets} : {}), deltaPolicy: {...deltaPolicy, ...policy}, onTrace: value => traces.push(value)});
  const admitted = runtime.admit(fixture.input), actors = [], events = [];
  function actor(id = 'actor-a', x = 10, handler = event, actorOptions = {}) {
    const model = originalActor(THREE, scene, x);
    const {prepare, ...runtimeOptions} = actorOptions; prepare?.(model);
    const presentation = runtime.createActor({id, visualRoot: model.visual, movementRoot: model.movement, animations: model.animations,
      package: admitted, onEvent: value => { events.push(value); handler?.(value, presentation); }, ...runtimeOptions});
    const value = {...model, presentation}; actors.push(value); return value;
  }
  const start = (actor, target = [15, 0, 0], options = {}) => actor.presentation.start('cast', {targets: {fixed: target}, outcomeMode: 'rehearsal', ...options});
  function dispose() { runtime.dispose(); service.dispose(); fixture.release(); }
  return {scene, fixture, service, runtime, admitted, actors, traces, events, actor, start, dispose};
}

// The same actual scene owner also advances unrelated ambient leases once.
{
  const h = harness(), source = h.fixture.sources[0], profile = JSON.parse(new TextDecoder().decode(source.profileBytes));
  profile.layers[0].emission.durationSeconds = 1; profile.layers[0].emission.lifetimeSeconds = 1;
  const pkg = h.service.admit({package: JSON.parse(new TextDecoder().decode(source.packageBytes)), profile,
    packageSha256: source.reference.package.sha256, bindings: source.bindings});
  const ambient = h.service.acquire({package: pkg, effectId: 'cast', layerId: 'sprite', id: 'ambient', ownerId: 'ambient'});
  const a = h.actor('actor-a'), b = h.actor('actor-b', 20); h.start(a); h.start(b); h.runtime.update(.425);
  near(ambient.stats().time, .425, 'ambient shares one elapsed scene clock with both actors');
  a.presentation.cancel(); near(ambient.stats().time, .425, 'actor cancellation cannot age ambient');
  ok(!ambient.stats().retired, 'actor cancellation cannot clear ambient');
  h.runtime.dispose(); ok(!ambient.stats().retired, 'scheduler disposal preserves unrelated ambient lease');
  h.service.update(.05); near(ambient.stats().time, .475, 'borrowed VFX clock returns to caller after scheduler disposal');
  ambient.retire(); h.service.releasePackage(pkg); h.service.dispose(); h.fixture.release();
}

// A callback exception is reported after the accepted scene interval; only its
// actor generation is retired, and the independent actor completes that interval.
{
  const h = harness(), a = h.actor('actor-a', 10, event => { if (event.type === 'marker') throw Error('Original controlled host callback failure'); }), b = h.actor('actor-b', 20);
  h.start(a); h.start(b); rejects(() => h.runtime.update(.425), /presentation failures/i, 'host callback failure is surfaced');
  equal(a.presentation.stats().effects.length, 0, 'throwing actor callback retires its own leases');
  near(b.presentation.stats().time, .425, 'throwing actor callback preserves unrelated timeline');
  near(b.presentation.stats().effects.find(value => value.cue === 'projectile').age, .05, 'throwing callback cannot pre-age other actor release');
  near(h.service.stats().time, .425, 'throwing callback still advances accepted interval exactly once');
  h.dispose();
}

// Static aggregate work failure precedes any partial scene/actor advancement.
{
  const h = harness({budgets: {maxSubsteps: 1}}), a = h.actor(); h.start(a);
  rejects(() => h.runtime.update(.425), /aggregate|substep|budget/i, 'whole-scene substep budget is enforced');
  near(h.runtime.stats().time, 0, 'work preflight failure preserves scene time');
  near(h.service.stats().time, 0, 'work preflight failure preserves shared VFX time');
  near(a.presentation.stats().time, 0, 'work preflight failure preserves actor time');
  h.dispose();
}

// Resource failure at the second equal-time release cannot steal the first
// actor's lease or leak the failed actor's partially acquired carrier.
{
  const h = harness({fixtureOptions: {families: ['projectile']}, serviceBudgets: {maxSystems: 1}}), a = h.actor('actor-a'), b = h.actor('actor-b', 20);
  h.start(a); h.start(b); rejects(() => h.runtime.update(.425), /presentation failures/i, 'aggregate resource failure is reported');
  equal(a.presentation.stats().effects.length, 1, 'first actor retains its independently owned system');
  equal(b.presentation.stats().effects.length, 0, 'failed second actor retains no partial leases');
  equal(h.service.stats().systems, 1, 'failed second release leaks no scene reservation');
  near(a.presentation.stats().effects[0].age, .05, 'surviving effect has correct release age');
  h.dispose(); equal(h.service.stats().systems, 0, 'disposal after failed acquisition returns owned capacity');
}

// Live endpoint input uses scene presentation seconds, a current generation and
// finite points. Each invalid policy case retires the beam without a substitute.
for (const kind of ['missing', 'stale', 'generation', 'future', 'nonfinite', 'nonmonotonic', 'rate']) {
  const h = harness({fixtureOptions: {families: ['beam'], mutate(pkg) { pkg.targets[0] = {id: 'fixed', mode: 'continuous-world-point', maxDistance: 20,
    maxAgeSeconds: .1, maxUpdatesPerSecond: kind === 'rate' ? 1 : 100, clock: 'presentation-seconds', generation: 'match-action', sampleAt: 'interval-end-before-fx', onInvalid: 'retire-effect'}; }}}), a = h.actor();
  h.start(a, undefined, {targets: {}});
  const update = (timestamp, extra = {}) => a.presentation.setEndpoint({target: 'fixed', generation: a.presentation.generation, timestamp, point: [15, 0, 0], ...extra});
  if (kind === 'missing' || kind === 'stale') { if (kind === 'stale') update(0); h.runtime.update(.4); }
  else {
    h.runtime.update(.3); ok(update(.3), 'fresh initial live endpoint is accepted: ' + kind); h.runtime.update(.075);
    ok(a.presentation.stats().effects.some(value => value.family === 'beam'), 'fresh live endpoint produces beam: ' + kind);
    const accepted = kind === 'generation' ? update(.375, {generation: a.presentation.generation - 1}) : kind === 'future' ? update(.5) :
      kind === 'nonfinite' ? update(.375, {point: [Infinity, 0, 0]}) : kind === 'nonmonotonic' ? update(.3) : update(.375);
    equal(accepted, false, 'invalid live endpoint is refused: ' + kind);
  }
  equal(a.presentation.stats().effects.filter(value => value.family === 'beam').length, 0, 'invalid endpoint retires affected beam: ' + kind);
  ok(h.events.some(value => value.type === 'endpoint-invalid'), 'endpoint failure is observable: ' + kind);
  h.dispose();
}

{
  const h = harness({fixtureOptions: {families: ['trail']}}), a = h.actor(); h.start(a); h.runtime.update(.4); h.runtime.update(.05);
  a.movement.position.x = 100; h.runtime.update(.05);
  ok(h.traces.some(value => value.type === 'trail-reset'), 'declared teleport resets actual trail history');
  ok(a.presentation.stats().effects[0].handle.historyPoints <= 8, 'retained actual trail samples remain bounded');
  h.dispose();
}

// The caller's animation owner must receive its cooperative lease back when
// motion ends, independently of effect tail lifetime.
{
  const leases = [], released = [], h = harness(), a = h.actor('actor-a', 10, undefined, {rigOwnership: {
    acquire(value) { const token = {generation: value.generation}; leases.push(token); return token; }, release(value) { released.push(value); }
  }});
  h.start(a); h.runtime.update(1);
  equal(leases.length, 1, 'one external animation lease is acquired');
  equal(released, leases, 'motion-end returns external animation lease before tail retirement');
  h.dispose(); equal(released.length, 1, 'later disposal cannot release external animation lease twice');
}

{
  const h = harness(), a = h.actor();
  rejects(() => h.service.update(.01), /scheduler|clock/i, 'borrowed service rejects a second independent clock writer');
  rejects(() => createThreeActionScene({THREE, scene: h.scene, vfxRuntime: h.service, engineSelection, deltaPolicy}), /already/i, 'one scheduler owns this actual scene');
  h.dispose();
}

// The transform oracle is geometric: local hand .75 plus local cue offset .25,
// then scale 2 and a quarter turn around Z yields world [10,2,0].
{
  const h = harness({fixtureOptions: {mutate(pkg) { for (const cue of pkg.actions[0].cues) cue.transform.position = [.25, 0, 0]; }}}), a = h.actor();
  a.movement.rotation.z = Math.PI / 2; a.movement.scale.setScalar(2); h.start(a); h.runtime.update(.425);
  const origin = a.presentation.stats().effects.find(value => value.cue === 'projectile').origin;
  near(origin[0], 10, 'rotated uniform parent release origin X'); near(origin[1], 2, 'local offset and uniform scale convert exactly once'); near(origin[2], 0, 'basis preserves release origin Z');
  near(a.movement.scale.x, 2, 'presentation does not rewrite controller scale'); near(a.movement.rotation.z, Math.PI / 2, 'presentation does not rewrite controller orientation');
  h.dispose();
}

for (const sceneScale of [1, 2]) {
  const h = harness({fixtureOptions: {families: ['beam'], mutate(pkg) { pkg.actions[0].cues[0].transform.scale = 3; pkg.actions[0].cues[0].transform.position = [.25, 0, 0]; }}});
  h.scene.scale.setScalar(sceneScale); const a = h.actor(); a.movement.scale.setScalar(2); a.movement.rotation.z = Math.PI / 2;
  h.start(a); h.runtime.update(.375); const beams = []; h.scene.traverse(node => { if (node.geometry?.type === 'CylinderGeometry') beams.push(node); });
  equal(beams.length, 1, 'one actual world-endpoint beam exists under scaled scene');
  const worldScale = beams[0].getWorldScale(new THREE.Vector3()), worldPosition = beams[0].getWorldPosition(new THREE.Vector3());
  near(worldScale.x, .2 * 2 * 3 * sceneScale, 'beam width applies scene, anchor and cue uniform scale exactly once');
  near(worldScale.z, .2 * 2 * 3 * sceneScale, 'beam cross-section remains isotropic under rotation');
  near(worldScale.y, Math.hypot(15 - 10 * sceneScale, 2 * sceneScale), 'beam world length comes from actual world endpoints');
  near(worldPosition.x, (15 + 10 * sceneScale) / 2, 'beam midpoint respects actual scene-space conversion once');
  near(worldPosition.y, sceneScale, 'quarter-turn beam origin and midpoint preserve world coordinates');
  h.dispose();
}

{
  const h = harness({fixtureOptions: {families: ['beam']}}), source = h.fixture.sources[0];
  const pkg = h.service.admit({package: JSON.parse(new TextDecoder().decode(source.packageBytes)), packageSha256: sha256(source.packageBytes), profile: JSON.parse(new TextDecoder().decode(source.profileBytes)), bindings: source.bindings});
  const lease = h.service.acquire({package: pkg, effectId: 'cast', layerId: 'beam', id: 'width-validation', ownerId: 'ambient', endpoints: {start: [0, 0, 0], end: [0, 2, 0]}});
  for (const widthScale of [0, NaN, Infinity, 1001]) rejects(() => lease.setEndpoints({start: [0, 0, 0], end: [0, 2, 0], widthScale}), /width|finite/i, 'beam width scaling must stay finite, positive and bounded');
  lease.retire(); h.service.releasePackage(pkg); h.dispose();
}

{
  const h = harness({fixtureOptions: {families: ['beam'], mutate(pkg, sources) {
    const source = sources[0], native = JSON.parse(new TextDecoder().decode(source.packageBytes)), profile = JSON.parse(new TextDecoder().decode(source.profileBytes));
    native.effects[0].layers[0].startSeconds = .125; native.effects[0].layers[0].durationSeconds = 1.75;
    source.packageBytes = jsonBytes(native); source.reference.package.sha256 = sha256(source.packageBytes); profile.nativePackageSha256 = source.reference.package.sha256;
    source.profileBytes = jsonBytes(profile); source.reference.profile.sha256 = sha256(source.profileBytes);
    const cue = pkg.actions[0].cues[0]; cue.end = 1; cue.retireAt = 1.25; cue.layers[0].start = .5; cue.layers[0].stopAt = 1; cue.layers[0].retireAt = 1.25;
    pkg.targets[0] = {id: 'fixed', mode: 'continuous-world-point', maxDistance: 4.1, maxAgeSeconds: .1, maxUpdatesPerSecond: 100,
      clock: 'presentation-seconds', generation: 'match-action', sampleAt: 'interval-end-before-fx', onInvalid: 'retire-effect'};
  }}}), a = h.actor();
  h.start(a, undefined, {targets: {}}); h.runtime.update(.49);
  ok(a.presentation.setEndpoint({target: 'fixed', generation: a.presentation.generation, timestamp: .49, point: [15, 0, 0]}), 'delayed beam receives current gameplay endpoint');
  h.runtime.update(.01); const beam = a.presentation.stats().effects.find(value => value.family === 'beam');
  ok(beam, 'delayed layer range uses actual layer-start anchor, which is inside 4.1m');
  near(beam.origin[0], 10.75, 'delayed beam retains original cue release snapshot identity');
  const geometry = h.scene.children.find(node => node.geometry?.type === 'CylinderGeometry');
  near(geometry.getWorldScale(new THREE.Vector3()).y, 4, 'delayed beam geometry initializes from current 11m origin to 15m endpoint');
  near(geometry.getWorldPosition(new THREE.Vector3()).x, 13, 'delayed beam first midpoint uses delivered layer-start pose');
  h.dispose();
}

{
  const h = harness({fixtureOptions: {families: ['beam'], mutate(pkg) {
    const cue = pkg.actions[0].cues[0]; cue.lifetime.tailSeconds = .5; cue.retireAt = 1.375; cue.layers[0].tailSeconds = .5; cue.layers[0].retireAt = 1.375; pkg.actions[0].retireAt = 1.375;
  }}}), a = h.actor();
  h.start(a); h.runtime.update(1); const predecessor = 1.375 - 1e-11; h.runtime.update(predecessor - 1);
  equal(a.presentation.stats().effects.length, 1, 'tail equal to profile maximum survives strict retirement predecessor');
  near(a.presentation.stats().effects[0].age, predecessor - .375, 'tail age has no pre-release time', 1e-13);
  h.runtime.update(1.375 - predecessor); equal(a.presentation.stats().effects.length, 0, 'equal maximum tail retires at exact authored deadline');
  equal(h.service.stats().systems, 0, 'exact tail retirement releases system reservation');
  h.dispose();
}

{
  const h = harness({fixtureOptions: {mutate(pkg) { pkg.targets[0].maxDistance = 5; }}}), a = h.actor();
  h.start(a, [15.75, 0, 0]); h.runtime.update(.375);
  near(a.presentation.stats().effects.find(value => value.cue === 'projectile').origin[0], 10.75, 'range uses exact release origin at inclusive bound');
  a.presentation.cancel(); h.start(a, [15.751, 0, 0]); rejects(() => h.runtime.update(.375), /presentation failures/i, 'target beyond actual release bound is rejected');
  equal(a.presentation.stats().effects.length, 0, 'failed actual release range cleans charging resources');
  h.dispose();
}

// Incoming caller track drift is rejected without mutating a second actor's
// borrowed clip or allowing an old normalized snapshot to hide the drift.
{
  const h = harness(), a = h.actor(), b = h.actor('actor-b', 20); h.start(a); h.start(b);
  a.animations[0].tracks[0].values[3] = 3;
  rejects(() => h.runtime.update(.425), /presentation failures/i, 'changed borrowed source clip is not relabeled as current');
  equal(a.presentation.stats().effects.length, 0, 'source clip drift retires affected generation');
  near(b.presentation.stats().time, .425, 'source clip drift preserves unrelated actor');
  h.dispose();
}

{
  let callerDisposals = 0;
  const material = new THREE.MeshBasicMaterial({color: 0xccaaff}), geometry = new THREE.BoxGeometry(.2, .2, .2);
  material.addEventListener('dispose', () => callerDisposals++); geometry.addEventListener('dispose', () => callerDisposals++);
  const h = harness(), a = h.actor('actor-a', 10, undefined, {prepare(model) { model.hand.add(new THREE.Mesh(geometry, material)); }}), b = h.actor('actor-b', 20);
  h.start(a); h.start(b); material.color.setRGB(1, 0, 0);
  rejects(() => h.runtime.update(.425), /presentation failures/i, 'borrowed model material drift is rejected');
  equal(a.presentation.stats().effects.length, 0, 'material drift retires only affected generation');
  near(b.presentation.stats().time, .425, 'material drift preserves unrelated actor');
  h.dispose(); equal(callerDisposals, 0, 'action and VFX teardown preserve caller model geometry/material');
  material.dispose(); geometry.dispose(); equal(callerDisposals, 2, 'caller retains disposal rights');
}

{
  let paused = false;
  const h = harness(), a = h.actor('actor-a', 10, (event, actor) => { if (event.type === 'marker' && !paused) { paused = true; actor.pause(); } });
  h.start(a); h.runtime.update(.425);
  near(a.presentation.stats().time, .375, 'marker callback pause discards remaining current actor interval');
  ok(!a.presentation.stats().effects.some(value => value.cue === 'projectile'), 'same-time release remains pending during callback pause');
  a.presentation.resume(); h.runtime.update(.05);
  near(a.presentation.stats().time, .425, 'resume consumes only new actor delta');
  near(a.presentation.stats().effects.find(value => value.cue === 'projectile').age, .05, 'resumed pending release starts once without old-frame age');
  h.dispose();
}

{
  const h = harness({fixtureOptions: {families: ['projectile'], mutate(pkg) { pkg.actions[0].cues[0].lifetime.pause = 'continue-on-scene'; }}}), a = h.actor();
  h.start(a); h.runtime.update(.4); a.presentation.pause(); h.runtime.update(.1);
  near(a.presentation.stats().time, .4, 'explicit continued FX does not advance paused actor pose');
  near(a.presentation.stats().effects[0].age, .125, 'continue-on-scene effect uses scene elapsed time during actor pause');
  near(a.presentation.stats().effects[0].worldPosition[0], 11.8125, 'continued projectile samples declared scene progress');
  h.dispose();
}

{
  let actor, replaced = false;
  const h = harness(), a = h.actor('actor-a', 10, undefined, {rigOwnership: {acquire() { return {}; }, release() {
    if (!replaced) { replaced = true; actor.start('cast', {targets: {fixed: [15, 0, 0]}, outcomeMode: 'rehearsal'}); }
  }}}); actor = a.presentation;
  h.start(a); const firstGeneration = actor.generation; h.runtime.update(1);
  ok(replaced && actor.generation > firstGeneration, 'external rig release may synchronously replace the actor generation');
  near(actor.stats().time, 0, 'replacement discards old frame remainder');
  h.runtime.update(.05); near(a.hand.position.x, .1, 'old rig cleanup cannot overwrite replacement mixer pose');
  h.dispose();
}

for (const mode of ['pause', 'cancel']) {
  const h = harness({policy: {exceptionalDelta: mode}}), a = h.actor(); h.start(a); h.runtime.update(.1); h.runtime.update(2);
  near(h.runtime.stats().time, .1, 'exceptional ' + mode + ' policy consumes no oversized interval');
  if (mode === 'pause') { ok(h.runtime.stats().suspended, 'exceptional pause suspends scene'); h.runtime.resume(); h.runtime.update(.05); near(a.presentation.stats().time, .15, 'exceptional pause has no resume backlog'); }
  else equal(a.presentation.stats().effects.length, 0, 'exceptional cancellation retires actor generation');
  h.dispose();
}

{
  const h = harness({policy: {hidden: 'cancel'}}), a = h.actor(); h.start(a); h.runtime.update(.1); h.runtime.suspend();
  equal(a.presentation.stats().effects.length, 0, 'hidden cancellation policy retires actor generation');
  h.runtime.resume(); h.runtime.update(.05); equal(a.presentation.state, 'idle', 'hidden cancellation does not replay action on resume');
  h.dispose();
}

{
  let endedAge;
  const h = harness(), a = h.actor('actor-a', 10, (event, actor) => { if (event.type === 'layer-stop' && event.cue === 'charge') endedAge = actor.stats().effects.find(value => value.cue === 'charge')?.age; });
  h.start(a); const predecessor = .375 - 1e-11; h.runtime.update(predecessor);
  ok(!a.presentation.stats().effects.some(value => value.cue === 'projectile'), 'strict predecessor of release cannot dispatch an early effect');
  near(a.presentation.stats().effects.find(value => value.cue === 'charge').age, predecessor, 'ending effect receives exact predecessor elapsed interval', 1e-14);
  h.runtime.update(.375 - predecessor);
  near(endedAge, .375, 'old effect receives final interval before emission stop', 1e-14);
  near(a.presentation.stats().effects.find(value => value.cue === 'projectile').age, 0, 'exact release has zero pre-release age', 1e-14);
  h.dispose();
}

{
  const h = harness(); h.runtime.update(.123456789); const sceneStart = h.runtime.stats().time, a = h.actor(); h.start(a);
  const advance = target => advancePresentationTo({target, getActors: () => [a.presentation.stats()], getSceneTime: () => h.runtime.stats().time, sceneStart, step: delta => h.runtime.update(delta)});
  const release = advance(.375);
  ok(release.observedTime >= .375 && release.roundoffSeconds <= 4 * release.maxClockTick, 'absolute capture advances from observed actor clock after a nonbinary scene offset');
  ok(h.events.some(event => event.type === 'cue-start' && event.cue === 'projectile' && event.time === .375), 'absolute capture processes exact release rather than a floating predecessor');
  advance(1); ok(a.presentation.stats().motionEnded, 'absolute capture processes exact motion end');
  advance(1.25); equal(a.presentation.stats().effects.length, 0, 'absolute capture uses scene drain time after actor completion');
  h.dispose();
}

{
  const h = harness({fixtureOptions: {families: ['projectile'], mutate(pkg) { pkg.actions[0].cues[0].overrides = [{layer: 'projectile', sizeMultiplier: .5, colorMultiplier: [.5, .5, .5, .5], emissionMultiplier: .5}]; }}}), a = h.actor();
  h.start(a); h.runtime.update(.4); const systems = []; h.scene.traverse(node => { if (node.system instanceof Quarks.ParticleSystem) systems.push(node.system); });
  equal(systems.length, 1, 'bounded reduction constructs the actual admitted system');
  near(systems[0].startSize.value, .1, 'size reduction scales original .2 without enlargement');
  equal(systems[0].particleNum, 0, 'half of original one-particle burst rounds down within bound');
  h.dispose();
}

{
  const h = harness({fixtureOptions: {families: ['sprite']}}), a = h.actor(); h.start(a); h.runtime.update(.1);
  h.service.setQuality(0); h.service.setQuality(2); h.runtime.update(.05);
  near(a.presentation.stats().effects[0].age, .15, 'live native one-particle burst survives quality hide/restore without configuration drift');
  h.service.setReducedMotion(true); h.runtime.update(.025); h.service.setReducedMotion(false); h.runtime.update(.025);
  near(a.presentation.stats().effects[0].age, .2, 'live native burst survives reduced-motion changes without expected-count corruption');
  equal(h.service.stats().quality, 2, 'restored quality stays selected'); equal(h.service.stats().reducedMotion, false, 'restored motion policy stays selected');
  h.dispose();
}

{
  const h = harness({fixtureOptions: {families: ['trail'], mutate(pkg) { pkg.actions[0].cues[0].trail.maxSamples = 4; }}}), a = h.actor();
  h.start(a); h.runtime.update(.6); const systems = []; h.scene.traverse(node => { if (node.system instanceof Quarks.ParticleSystem) systems.push(node.system); });
  equal(systems[0].rendererEmitterSettings.startLength.value, 4, 'trail budget reduction reaches actual Quarks history length');
  ok(systems[0].particles.every(particle => !particle.previous || particle.previous.length <= 4), 'every actual retained history fits reduced per-particle bound');
  h.dispose();
}

// An ambient package may require a smaller finite delta than the original
// owner. The scheduler and the returned caller clock must both honor it.
{
  const h = harness(), source = h.fixture.sources[0], profile = JSON.parse(new TextDecoder().decode(source.profileBytes));
  profile.budgets.maxUpdateSeconds = .025; profile.layers[0].emission.durationSeconds = 1; profile.layers[0].emission.lifetimeSeconds = 1;
  const pkg = h.service.admit({package: JSON.parse(new TextDecoder().decode(source.packageBytes)), packageSha256: sha256(source.packageBytes), profile, bindings: source.bindings});
  const ambient = h.service.acquire({package: pkg, effectId: 'cast', layerId: 'sprite', id: 'small-delta-ambient', ownerId: 'ambient'});
  h.runtime.update(.08); near(ambient.stats().time, .08, 'scheduler substeps the stricter live ambient delta');
  h.runtime.dispose(); rejects(() => h.service.update(.05), /delta|maximum|limit/i, 'caller cannot bypass live profile delta after scheduler release');
  h.service.update(.025); near(ambient.stats().time, .105, 'valid caller delta resumes exact ambient clock');
  ambient.retire(); h.service.releasePackage(pkg); h.service.dispose(); h.fixture.release();
}

// Real gameplay outcome inputs, not a visual arrival, choose impact position.
{
  const h = harness(), a = h.actor(); h.start(a, undefined, {outcomeMode: 'host-outcomes'}); h.runtime.update(.875);
  ok(!a.presentation.stats().effects.some(value => value.family === 'impact'), 'host outcome mode suppresses rehearsed impact');
  const outcome = {generation: a.presentation.generation, cue: 'impact', position: [14, 1, 0], normal: [0, 1, 0], timestamp: h.runtime.stats().time};
  equal(a.presentation.presentOutcome({...outcome, generation: outcome.generation - 1}), false, 'stale outcome generation is ignored');
  equal(a.presentation.presentOutcome(outcome), true, 'current declared gameplay outcome produces impact presentation');
  equal(a.presentation.stats().effects.find(value => value.family === 'impact').worldPosition, outcome.position, 'impact uses supplied gameplay outcome position');
  equal(a.presentation.presentOutcome(outcome), false, 'one outcome cannot replay a cue');
  h.dispose();
}

{
  const h = harness(), a = h.actor(); h.start(a, undefined, {outcomeMode: 'host-outcomes'}); h.runtime.update(.9);
  equal(a.presentation.presentOutcome({generation: a.presentation.generation, cue: 'impact', position: [14, 1, 0], normal: [0, 1, 0], timestamp: h.runtime.stats().time}), false,
    'late host outcome cannot stretch the full reviewed effect beyond final authored retirement');
  equal(a.presentation.stats().effects.filter(value => value.family === 'impact').length, 0, 'late outcome creates no partial impact lease');
  h.dispose();
}

{
  const h = harness({fixtureOptions: {mutate(pkg) { pkg.actions[0].retireAt = 1.5; }}}), a = h.actor();
  h.start(a, undefined, {outcomeMode: 'host-outcomes'}); h.runtime.update(.9);
  equal(a.presentation.presentOutcome({generation: a.presentation.generation, cue: 'impact', position: [14, 1, 0], normal: [0, 1, 0], timestamp: h.runtime.stats().time}), true,
    'explicitly authored recovery slack admits a complete reviewed late impact');
  h.runtime.update(.7); equal(a.presentation.stats().effects.length, 0, 'accepted late impact retires within explicit action envelope');
  equal(a.presentation.presentOutcome({generation: a.presentation.generation, cue: 'impact', position: [14, 1, 0], normal: [0, 1, 0], timestamp: h.runtime.stats().time}), false,
    'completed action cannot gain an implicit post-completion visual window');
  h.dispose();
}

// Parse/admission failures precede any animation, allocation or callback.
{
  const fixture = originalFixture(THREE), input = {...fixture.input, engineSelection};
  ok(validateActionV2Package(input), 'raw original fixture passes data admission');
  rejects(() => validateActionV2Package({...input, packageSha256: 'f'.repeat(64)}), /hash|SHA|identity/i, 'wrong exact package bytes fail closed');
  rejects(() => validateActionV2Package({...input, modelBytes: new Uint8Array([1, 2, 3])}), /model|hash|SHA/i, 'wrong exact model bytes fail closed');
  const staleAdmission = copy(input.nativeAdmission); staleAdmission.runtimeBuildSha256 = 'invalid';
  rejects(() => validateActionV2Package({...input, nativeAdmission: staleAdmission}), /hash|SHA|identity/i, 'invalid native build identity is rejected');
  const source = input.effectSources[0];
  rejects(() => validateActionV2Package({...input, effectSources: [{...source, profileBytes: new Uint8Array([123, 125])}, ...input.effectSources.slice(1)]}), /profile|hash|SHA/i, 'changed effect profile fails full closure');
  fixture.release();
}

// A 2-unit/second linear hand track releases at 0.375, between ordinary 60Hz
// display samples. At 0.425 the origin is 10.75 and new FX age is exactly .050.
{
  const h = harness(), actor = h.actor(), targets = [15, 0, 0]; h.start(actor, targets); targets[0] = 999;
  h.runtime.update(.425);
  near(actor.hand.position.x, .85, 'delivered actual mixer pose at end of interval');
  near(h.runtime.stats().time, .425, 'scene time advances once');
  near(h.service.stats().time, .425, 'one borrowed owner clock advances once');
  const projectile = actor.presentation.stats().effects.find(value => value.cue === 'projectile');
  ok(projectile, 'released projectile is observed');
  near(projectile.age, .05, 'new effect receives no time before release');
  near(projectile.origin[0], 10.75, 'release origin samples actual intermediate delivered pose');
  equal(projectile.target, [15, 0, 0], 'fixed-point target snapshot ignores caller mutation');
  near(actor.movement.position.x, 10, 'presentation preserves authoritative movement root');
  const sameTime = h.events.filter(value => Math.abs(value.time - .375) < 1e-8).map(value => value.type);
  ok(sameTime.indexOf('cue-end') >= 0 && sameTime.indexOf('cue-end') < sameTime.indexOf('marker') && sameTime.indexOf('marker') < sameTime.indexOf('cue-start'), 'same-time end, marker, start transition order');
  h.dispose();
}

// Registration order is deliberately reversed; equal-time dispatch orders by
// stable actor ID. Pause/cancel affects only the actor's generation.
{
  const h = harness(), b = h.actor('actor-b', 20), a = h.actor('actor-a', 10); h.start(b); h.start(a);
  h.runtime.update(.375);
  const starts = h.events.filter(value => value.type === 'cue-start' && value.cue === 'projectile');
  equal(starts.map(value => value.actor), ['actor-a', 'actor-b'], 'cross-actor ordering is independent of registration');
  a.presentation.pause(); h.runtime.update(.05);
  near(a.presentation.stats().time, .375, 'actor pause freezes only its timeline');
  near(b.presentation.stats().time, .425, 'other actor continues during pause');
  near(a.presentation.stats().effects.find(value => value.cue === 'projectile').age, 0, 'paused effect does not age');
  near(b.presentation.stats().effects.find(value => value.cue === 'projectile').age, .05, 'other actor effect continues');
  a.presentation.cancel();
  equal(a.presentation.stats().effects.length, 0, 'cancel retires only affected generation');
  ok(b.presentation.stats().effects.length > 0, 'other actor leases survive cancel');
  near(h.service.stats().time, .425, 'two actors do not double advance VFX service');
  h.dispose();
}

{
  let triggered = false;
  const h = harness(), b = h.actor('actor-b', 20), a = h.actor('actor-a', 10, (event, actor) => {
    if (event.type === 'marker' && !triggered) { triggered = true; actor.cancel(); }
  });
  h.start(a); h.start(b); h.runtime.update(.425);
  ok(triggered, 'exact release callback executes');
  equal(a.presentation.stats().effects.length, 0, 'reentrant cancellation retires acquired actor resources');
  near(b.presentation.stats().time, .425, 'reentrant cancellation cannot stop other actor');
  ok(!h.events.some(value => value.actor === 'actor-a' && value.type === 'cue-start' && value.cue === 'projectile'), 'callback cancellation suppresses stale generation release');
  near(h.service.stats().time, .425, 'reentrant cancellation preserves one scene clock');
  h.dispose();
}

// Tails may outlive animation, but the old mixer cannot retain pose writes.
{
  const h = harness(), a = h.actor(); h.start(a); h.runtime.update(1);
  ok(a.presentation.stats().motionEnded, 'motion ended while finite tail remains');
  ok(a.presentation.stats().effects.length > 0, 'bounded tail remains after motion');
  a.hand.position.x = 77; h.runtime.update(.1);
  near(a.hand.position.x, 77, 'tail does not retain rig-write ownership');
  h.runtime.update(.2); equal(a.presentation.stats().effects.length, 0, 'tails retire before declared final deadline');
  equal(h.service.stats().systems, 0, 'normal completion returns all owned system capacity');
  h.dispose();
}

// Invalid/exceptional/hidden time never silently replays backlog.
{
  const h = harness(), a = h.actor(); h.start(a); h.runtime.update(.1);
  for (const delta of [-1, NaN, Infinity, 1.01]) rejects(() => h.runtime.update(delta), /delta|finite|maximum|limit/i, 'invalid delta is rejected');
  near(h.runtime.stats().time, .1, 'rejected deltas do not partially advance scene');
  near(a.presentation.stats().time, .1, 'rejected deltas preserve actor clock');
  h.runtime.suspend(); h.runtime.update(.5); h.runtime.resume(); h.runtime.update(.05);
  near(a.presentation.stats().time, .15, 'resume consumes only fresh visible delta');
  near(h.service.stats().time, .15, 'hidden interval creates no VFX backlog');
  h.dispose();
}

const result = {status: 'passed', checks, modules, versions: Object.fromEntries(['three', 'three.quarks', 'quarks.core'].map(name =>
  [name, JSON.parse(fs.readFileSync(path.join(modules, name, 'package.json'), 'utf8')).version])),
  scope: 'Original engineering fixtures, synthetic byte admission and actual installed-library CPU execution; no GPU, visual quality, native construction, MAUI/device, human acceptance or promotion claim.'};
if (process.env.HEPHAERA_ACTION_VFX_RESULT) fs.writeFileSync(process.env.HEPHAERA_ACTION_VFX_RESULT, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(result));
