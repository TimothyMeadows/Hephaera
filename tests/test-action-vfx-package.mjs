import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {validateActionV2Package} from '../.engine/threejs/actions/action-package.mjs';
import {originalFixture, engineSelection, jsonBytes} from './fixtures/action-vfx/original-fixture.mjs';
import {sha256} from '../.engine/threejs/particles/vfx-package.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const modules = path.resolve(process.env.HEPHAERA_VFX_NODE_MODULES || path.join(ROOT, 'tests/fixtures/threejs-postprocessing/node_modules'));
if (!fs.existsSync(path.join(modules, 'three/package.json'))) throw Error('The explicit repository fixture dependencies are unavailable; select existing modules with HEPHAERA_VFX_NODE_MODULES. No installation is attempted.');
const THREE = await import(pathToFileURL(path.join(modules, 'three/build/three.module.js')));
let checks = 0;
const fixture = originalFixture(THREE), input = fixture.input;
const declaration = validateActionV2Package(input, engineSelection);
assert.throws(() => validateActionV2Package(input, {...engineSelection, task: 'different-current-scope'}), /complete current selected engine identity/i); checks++;
assert.equal(declaration.package.asset, 'original-cpu-fixture'); checks++;
assert.ok(Object.isFrozen(declaration.package) && Object.isFrozen(declaration.package.actions[0].cues)); checks++;
assert.ok(!Object.isFrozen(fixture.sources[0].texture), 'admission must not freeze a caller texture'); checks++;
const originalByte = input.packageBytes[0]; input.packageBytes[0] = 32;
assert.equal(declaration.package.asset, 'original-cpu-fixture', 'normalized declaration owns its byte-independent snapshot'); checks++; input.packageBytes[0] = originalByte;
function rejectPackage(change, pattern, why) {
  const value = originalFixture(THREE, {mutate: change});
  try { assert.throws(() => validateActionV2Package(value.input, engineSelection), pattern, why); checks++; }
  finally { value.release(); }
}
const mutations = [
  [p => p.schemaVersion = 'hephaera-action-package/v1', /v2|v1/i, 'v1 stays on its original player'],
  [p => p.profile = 'mechanical-assembly', /profile|supported/i, 'unsupported model profile'],
  [p => p.engine.registrySha256 = '9'.repeat(64), /engine|stale/i, 'engine registry drift'],
  [p => p.coordinateSystem.units = 'centimeters', /coordinate|unsupported/i, 'wrong units'],
  [p => p.coordinateSystem.parentScale = 'any', /coordinate|unsupported/i, 'unsupported parent transform policy'],
  [p => p.actions[0].cues[0].placement = 'guessed-hand', /cue|unsupported/i, 'no guessed placement'],
  [p => p.actions[0].cues[0].anchor = 'missing', /cue|reference/i, 'missing anchor'],
  [p => p.actions[0].cues[1].target = 'missing', /target/i, 'missing target'],
  [p => p.actions[0].cues[0].transform.orientation = [0, 0, 0, 0], /normalized|orientation/i, 'invalid orientation'],
  [p => p.actions[0].cues[0].transform.scale = -1, /scale/i, 'mirrored local transform'],
  [p => p.actions[0].cues[0].transform.position[0] = Infinity, /finite|number|position/i, 'nonfinite local transform'],
  [p => p.actions[0].cues[1].end = .2, /cue end|finite/i, 'backward effect lifetime'],
  [p => p.actions[0].cues[1].layers[0].stopAt = .8, /timing/i, 'profile emission duration cannot be stretched'],
  [p => p.actions[0].cues[1].layers[0].retireAt = 1.1, /timing/i, 'tail retirement must match declared elapsed tail'],
  [p => p.actions[0].cues[1].layers[0].id = 'missing', /layer|identity/i, 'missing native layer'],
  [p => p.actions[0].cues[1].layers[0].family = 'beam', /layer|identity/i, 'family relabeling'],
  [p => p.actions[0].cues[2].trail.maxSamples = 64, /trail samples/i, 'trail history cannot exceed native profile'],
  [p => p.actions[0].cues[2].trail.reset = 'none', /discontinuity/i, 'explicit teleport reset required'],
  [p => p.actions[0].cues[0].lifetime.cancel = 'keep', /lifecycle/i, 'cancellation must retire generation'],
  [p => p.actions[0].cues[0].lifetime.pause = 'catch-up', /lifecycle/i, 'unsupported pause policy'],
  [p => p.actions[0].cues[1].overrides = [{layer: 'projectile', emissionMultiplier: 2}], /emission reduction/i, 'overrides can reduce, not enlarge budget'],
  [p => p.actions[0].cues[1].overrides = [{layer: 'projectile', callback: 'eval'}], /unknown|unsupported|callback|fields/i, 'recipe data is not executable'],
  [p => p.actions[0].cues[1].id = p.actions[0].cues[0].id, /duplicate/i, 'cue identity collision'],
  [p => p.actions[0].cues[0].arbitraryShader = 'void main(){}', /unknown|unsupported|arbitraryShader|fields/i, 'arbitrary shader fields are rejected'],
  [p => p.effectSources[0].resources[0].path = '../outside.png', /reference|canonical/i, 'resource path cannot escape project'],
  [p => p.model.path = 'C:/private/model.glb', /reference|canonical/i, 'absolute model reference rejected'],
  [p => p.effectSources[0].resources[0].bytes++, /closure|identity/i, 'resource size must match exact native declaration'],
  [p => p.effectSources[0].correspondences[0].decodedSha256 = 'f'.repeat(64), /binding|correspondence/i, 'decoded resource drift'],
  [(p, sources) => { const profile = JSON.parse(new TextDecoder().decode(sources[0].profileBytes)); profile.layers[0].shader = 'remote'; sources[0].profileBytes = jsonBytes(profile); p.effectSources[0].profile.sha256 = sha256(sources[0].profileBytes); }, /unknown|unsupported|shader|fields/i, 'profile arbitrary code is not admitted']
];
for (const [change, pattern, why] of mutations) rejectPackage(change, pattern, why);
for (const [change, pattern, why] of [
  [value => value.packageSha256 = 'f'.repeat(64), /hash/i, 'wrong package hash'],
  [value => value.modelBytes = new Uint8Array([1, 2, 3]), /model|hash/i, 'wrong delivered model bytes'],
  [value => value.nativeAdmission = {...value.nativeAdmission, sourceKind: 'promoted-destination'}, /source export|promoted/i, 'no promoted re-admission'],
  [value => value.nativeAdmission = {...value.nativeAdmission, mode: 'runtime'}, /reference/i, 'runtime mode cannot inherit engineering review admission'],
  [value => value.effectSources = value.effectSources.slice(1), /exact effect source/i, 'missing effect package'],
  [value => value.effectSources = [{...value.effectSources[0], resourceBytes: [{id: 'texture', bytes: new Uint8Array([1])}]}, ...value.effectSources.slice(1)], /resource bytes|hash/i, 'changed resource bytes'],
  [value => value.effectSources = [{...value.effectSources[0], correspondenceBytes: []}, ...value.effectSources.slice(1)], /correspondence/i, 'missing source correspondence reports']
]) {
  const value = originalFixture(THREE);
  try { change(value.input); assert.throws(() => validateActionV2Package(value.input, engineSelection), pattern, why); checks++; }
  finally { value.release(); }
}
let getterInvoked = false;
const accessor = {...input.nativeAdmission}; Object.defineProperty(accessor, 'status', {get() { getterInvoked = true; return 'verified'; }});
assert.throws(() => validateActionV2Package({...input, nativeAdmission: accessor}, engineSelection), /accessor/i); checks++;
assert.equal(getterInvoked, false, 'native admission is inspected without executing caller accessors'); checks++;
fixture.release();
console.log(JSON.stringify({status: 'passed', checks, scope: 'Original engineering protocol fixtures and actual Three resource bindings; synthetic admission is not native verification, visual quality, human acceptance or promotion.'}));
