'use strict';

// Synthetic host scope/freshness tests. These files are not native GLBs or
// engineering certificates and this suite never launches Bubo or Blender.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const runtime = require('../commands/lib/bubo-runtime.cjs');
const host = require('../commands/lib/bubo-host-adapter.cjs');
const mechanical = require('../commands/lib/bubo-mechanical-handoff.cjs');
const base = path.join(runtime.BASE, '.local/mhc'); fs.mkdirSync(base, { recursive: true });
const root = fs.mkdtempSync(path.join(base, 'p-')); let checks = 0;
const check = (value, label) => { assert(value, label); checks++; };
const rejects = (action, pattern) => { assert.throws(action, pattern); checks++; };
const write = (name, value) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value) + '\n'); return name; };
const hash = name => runtime.hash(path.join(root, name));
const load = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const ref = name => ({ path: name, sha256: hash(name) });
const mutate = (name, value, action, pattern) => { const before = fs.readFileSync(path.join(root, name)); try { write(name, value); rejects(action, pattern); } finally { write(name, before); } };
write('STYLE.md', '# STYLE.md\n\nGenerated from Hephaera style templates:\n- CEL_SHADED_COMIC\n\nPrimary Hephaera art pipeline:\n- SCHEMATIC_TO_MODEL\n\nAllowed Hephaera art pipelines:\n- SCHEMATIC_TO_MODEL\n\n---\n\nA prompt override does not rewrite STYLE.md. Never switch or fall back silently.\n');
write('MEDIA.md', 'Unrelated media policy; procedural mechanical receiving does not load it.');
write('data', 'Unrelated project-root file; sealed data entries resolve beneath their package.');
write('inputs/recipe.json', { schemaVersion: 1, profile: 'mechanical-assembly' });
write('inputs/rights.json', { authorized: true, scope: 'synthetic host test only' });
const pkgRoot = 'sealed/a/package', sourceRoot = '.hephaera/.cache/tasks/source/schematic-to-model/a/v';
write(pkgRoot + '/assembly.glb', 'Synthetic metadata fixture, not a GLB.');
write(pkgRoot + '/assembly-design.json', { schemaVersion: 'synthetic-host-fixture-design' });
write(pkgRoot + '/assembly-metadata.json', { schemaVersion: 'synthetic-host-fixture-metadata' });
write(pkgRoot + '/provenance.json', { schemaVersion: 'synthetic-host-fixture-provenance' });
write('sealed/a/technical.json', { decision: 'approved', scope: 'synthetic-host-fixture' });
write('sealed/a/independent.json', { decision: 'approved', independent: true, scope: 'synthetic-host-fixture' });
for (const name of ['manifest', 'parts', 'assembly', 'exports']) write(sourceRoot + '/' + name + '.json', { schemaVersion: 'synthetic-state', name });
const files = ['assembly.glb', 'assembly-design.json', 'assembly-metadata.json', 'provenance.json'];
// Exceed the exact-reference limit with immutable payload data, including JSON
// whose data-level path must never be reinterpreted as a host permission.
for (let index = 0; index < 4100; index++) files.push('data/' + String(index).padStart(5, '0') + '.json');
for (const name of files.slice(4)) write(pkgRoot + '/' + name, { path: '../data-only-reference', value: 1 });
const packageValue = { schemaVersion: 'bubo-schematic-export-package/v1', files: files.map(name => ({ path: name, sha256: hash(pkgRoot + '/' + name), bytes: fs.statSync(path.join(root, pkgRoot, name)).size })) };
write(pkgRoot + '/package.json', packageValue);
const handoff = { schemaVersion: 'bubo-mechanical-assembly-handoff/v1', package: ref(pkgRoot + '/package.json'), model: ref(pkgRoot + '/assembly.glb'),
  design: ref(pkgRoot + '/assembly-design.json'), metadata: ref(pkgRoot + '/assembly-metadata.json'), provenance: ref(pkgRoot + '/provenance.json'),
  technicalReview: ref('sealed/a/technical.json'), independentReview: ref('sealed/a/independent.json'), components: [], bindings: { nodes: [], skins: [] },
  sourceState: { design: ref(sourceRoot + '/manifest.json'), parts: ref(sourceRoot + '/parts.json'), assembly: ref(sourceRoot + '/assembly.json'), export: ref(sourceRoot + '/exports.json') }, humanAcceptance: null };
write('inputs/handoff.json', handoff);
const args = ['--root', root, '--task', 'receive', '--asset', 'a', '--version', 'v', '--actor', 'a', '--recipe', 'inputs/recipe.json', '--rights', 'inputs/rights.json', '--model', handoff.model.path, '--handoff', 'inputs/handoff.json'];
const options = host.parse(args), info = { folder: path.join(root, '.hephaera/runtime/bubo/artifacts/bubo') };
const init = () => host.contextFor('model-to-animation', 'init', options, info);
let admitted = init();
check(admitted.context.roots.inputs.includes(pkgRoot), 'Only sealed package directory is a read-only input root');
check(admitted.context.references.length < 32, '4104 leaves do not expand into more than4096 exact references');
check(admitted.context.references.some(item => item.path === 'inputs/handoff.json' && item.sha256 === hash(item.path)), 'Top-level handoff is an exact reference');
check(admitted.context.references.some(item => item.path === handoff.model.path), 'Explicit selected model remains exact even inside package root');
check(!admitted.context.references.some(item => item.path === 'MEDIA.md') && !admitted.context.policy.media, 'Ambient media is not loaded');
check(!admitted.context.references.some(item => item.path.includes('data-only-reference')), 'Payload JSON does not grant embedded path access');
check(!admitted.context.permissions.provisioning && !admitted.context.permissions.promotion, 'Receiving grants no setup or promotion');
for (const name of ['host-context', 'api-version', 'runtime-build-sha256', 'runtime-resource-catalog-sha256']) rejects(() => host.parse(['--' + name, 'injected']), /protected|unique/);
const direct = () => mechanical.prepare(root, 'model-to-animation', 'init', options, null);
mutate('inputs/handoff.json', { ...handoff, model: ref('inputs/rights.json') }, direct, /substituted/);
mutate('inputs/handoff.json', { ...handoff, sourceState: { ...handoff.sourceState, parts: ref(sourceRoot + '/assembly.json') } }, direct, /siblings/);
mutate(sourceRoot + '/parts.json', { changed: true }, direct, /Changed bound/);
mutate(pkgRoot + '/data/00000.json', { changed: true }, direct, /Changed bound/);
mutate(pkgRoot + '/package.json', { ...packageValue, files: [{ ...packageValue.files[0], path: '../escape.glb' }, ...packageValue.files.slice(1)] },
  () => { write('inputs/handoff.json', { ...handoff, package: ref(pkgRoot + '/package.json') }); try { direct(); } finally { write('inputs/handoff.json', handoff); } }, /canonical|Traversal/);
mutate(pkgRoot + '/package.json', { ...packageValue, files: [...packageValue.files, { ...packageValue.files[0], path: 'ASSEMBLY.GLB' }] },
  () => { write('inputs/handoff.json', { ...handoff, package: ref(pkgRoot + '/package.json') }); try { direct(); } finally { write('inputs/handoff.json', handoff); } }, /ambiguous/);
mutate('inputs/recipe.json', { profile: 'rigid' }, direct, /profile/);
const original = '.art-staging/model-to-animation/a/v/original';
const copy = (source, name) => write(original + '/' + name, fs.readFileSync(path.join(root, source)));
const state = { task: 'receive', asset: 'a', version: 'v', profile: 'mechanical-assembly', staging: '.art-staging/model-to-animation/a/v', hostPolicySha256: 'a'.repeat(64), runtimeBuildSha256: 'b'.repeat(64), originals: {}, sourceInputs: {}, stages: {} };
state.recipe = copy('inputs/recipe.json', 'recipe.json'); state.rights = copy('inputs/rights.json', 'rights.json'); state.model = copy(handoff.model.path, 'model.glb');
state.mechanicalHandoff = copy('inputs/handoff.json', 'mechanical-handoff.json'); state.mechanicalPackage = copy(handoff.package.path, 'mechanical-package.json');
state.mechanicalDesign = copy(handoff.design.path, 'mechanical-design.json'); state.mechanicalMetadata = copy(handoff.metadata.path, 'mechanical-metadata.json');
for (const name of [state.recipe, state.rights, state.model, state.mechanicalHandoff, state.mechanicalPackage, state.mechanicalDesign, state.mechanicalMetadata]) state.originals[name] = hash(name);
const prepared = direct();
for (const item of prepared.references) state.sourceInputs[item.path] = item.sha256;
for (const [name, item] of prepared.inventory) state.sourceInputs[name] = item.sha256;
state.stages.inspect = { inputs: { ...state.sourceInputs } };
const manifest = '.hephaera/.cache/tasks/receive/model-to-animation/a/v/manifest.json'; write(manifest, state);
const continued = () => host.contextFor('model-to-animation', 'status', host.parse(['--root', root, '--manifest', manifest]), info);
admitted = continued();
check(admitted.context.references.length < 48 && admitted.context.roots.inputs.includes(pkgRoot), 'Continuation preserves full SourceInputs and stage.inputs without exact-reference overflow');
check(Object.keys(load(manifest).sourceInputs).length > 4096, 'Native expected ledger is retained without pruning');
mutate(pkgRoot + '/data/00001.json', { changed: true }, continued, /Changed bound|Retained source/);
mutate('inputs/handoff.json', { ...handoff, components: ['changed'] }, continued, /Retained source/);
mutate(sourceRoot + '/exports.json', { changed: true }, continued, /Changed bound/);
mutate(manifest, { ...state, sourceInputs: { ...state.sourceInputs, [pkgRoot + '/data/00002.json']: 'f'.repeat(64) } }, continued, /ledger|expectation/);
const omitted = structuredClone(state); delete omitted.sourceInputs[pkgRoot + '/data/00003.json'];
mutate(manifest, omitted, continued, /ledger.*omitted/);
mutate(state.mechanicalPackage, { changed: true }, continued, /Changed bound/);
const withMedia = structuredClone(state); withMedia.sourceInputs['MEDIA.md'] = hash('MEDIA.md'); write(manifest, withMedia);
admitted = continued(); check(admitted.context.policy.media?.sha256 === hash('MEDIA.md'), 'Historical explicit media policy remains bound');
mutate('MEDIA.md', 'Changed policy', continued, /Retained source/);
write(manifest, state);
const broad = { ...handoff, package: ref(pkgRoot + '/package.json') };
write('package.json', packageValue); broad.package = ref('package.json');
mutate('inputs/handoff.json', broad, direct, /root|project|Traversal/);
check(!fs.existsSync(path.join(root, 'assets')), 'Host fixtures create no runtime assets');
console.log('PASS ' + checks + ' mechanical host scope/freshness checks; synthetic metadata only; fixture ' + root);
