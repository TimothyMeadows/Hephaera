'use strict';

// Owned host-policy metadata fixtures. These do not render, process PNGs,
// establish native acceptance, or impersonate a human reviewer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('../commands/lib/bubo-runtime.cjs');
const host = require('../commands/lib/bubo-host-adapter.cjs');
const admission = require('../commands/lib/action-vfx-admission.cjs');
const evidence = require('../commands/lib/action-vfx-runtime-evidence.cjs');
const cache = path.basename(runtime.BASE) === '.hephaera' ? path.join(runtime.BASE, '.cache') : path.join(runtime.BASE, '.hephaera/.cache');
const parent = path.join(cache, 'tasks/hephaera-action-v2-runtime/evidence/host-admission');
fs.mkdirSync(parent, { recursive: true });
const root = fs.mkdtempSync(path.join(parent, 'fixture-'));
const stateRoot = '.hephaera/.cache/tasks/receiver';
let checks = 0;
function check(value, name) { assert(value, name); checks++; }
function reject(action, pattern, name) { assert.throws(action, pattern, name); checks++; }
function write(name, value) {
  const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  return ref(name);
}
function ref(name) { const file = path.join(root, name); return { path: name, sha256: runtime.hash(file), bytes: fs.statSync(file).size }; }
const resource = write('.art-staging/effect/v1/texture.png', 'SYNTHETIC metadata bytes; not a PNG');
const original = write('assets/owned-vfx/original.png', 'SYNTHETIC owned original metadata');
const capture = write(stateRoot + '/source-production.txt', 'Synthetic protocol test, not production review');
const report = write('.art-staging/effect/v1/correspondence.json', { sourceEvidenceSha256: capture.sha256 });
const native = write('.art-staging/effect/v1/package.json', { schemaVersion: 'bubo-vfx-package/v2', resources: [{ id: 'texture', kind: 'texture-png', path: 'texture.png', sha256: resource.sha256, bytes: resource.bytes }] });
const profile = write('.art-staging/effect/v1/profile.json', { schemaVersion: 'hephaera-three-vfx-profile/v1' });
const rights = write(stateRoot + '/rights.json', { inputs: [original, resource] });
const production = write(stateRoot + '/production.json', { evidence: [capture] });
const source = { id: 'effect', effectId: 'owned', package: native, profile,
  rights, productionReview: production, correspondences: [{ resourceId: 'texture', report }] };
const recipe = { schemaVersion: 2, effectSources: [source], budgets: { timeoutSeconds: 2, maxLogBytes: 1048576 } };
function collect(value = recipe) {
  const references = new Map();
  const result = admission.collect({ root, recipe: value, stateRoot, reference(name, kind, expected) {
    assert.equal(runtime.hash(path.join(root, name)), expected, 'Retained source changed: ' + name);
    references.set(name, { path: name, kind, sha256: expected });
  } });
  return { ...result, references };
}

(async () => {
  let admitted = collect();
  check(admitted.references.size === 8, 'Exact package/profile/resource/report/rights/review/evidence/original closure');
  check(admitted.references.get(rights.path).kind === 'rights', 'Nested source rights preserve their native evidence kind');
  check(admitted.references.get(production.path).kind === 'review' && admitted.references.get(capture.path).kind === 'review', 'Nested production review and evidence retain review kind');
  check(admitted.inputs.length === 0, 'Unprepared source grants no directory read roots');
  const old = fs.readFileSync(path.join(root, resource.path));
  write(resource.path, Buffer.concat([old, Buffer.from('changed')]));
  reject(() => collect(), /length|changed/, 'Resource drift cannot rebind an expected hash');
  write(resource.path, old);
  const badHash = structuredClone(recipe); badHash.effectSources[0].package.sha256 = 'a'.repeat(64);
  reject(() => collect(badHash), /Retained source changed/, 'Package hash drift reaches exact admission');
  const nativeValue = JSON.parse(fs.readFileSync(path.join(root, native.path)));
  for (const name of ['../escape.png', 'folder/../texture.png', '/absolute.png', 'folder\\texture.png']) {
    const changed = structuredClone(nativeValue); changed.resources[0].path = name;
    const changedRef = write(native.path, changed), changedRecipe = structuredClone(recipe); changedRecipe.effectSources[0].package = changedRef;
    reject(() => collect(changedRecipe), /canonical|Traversal/, 'Native relative resource path is checked before join: ' + name);
  }
  write(native.path, nativeValue);
  const alias = structuredClone(recipe); alias.effectSources.push({ ...alias.effectSources[0], rights: { ...production } });
  reject(() => collect(alias), /kinds/, 'One exact path cannot acquire conflicting rights/review evidence roles');

  const output = '.art-staging/prepared/owned/v1/native';
  const request = write('inputs/owned-vfx/request.json', { sources: [original] });
  const start = write(output + '/started.json', { taskId: 'origin', fixture: 'synthetic metadata only' });
  const inventory = [write(output + '/request.json', fs.readFileSync(path.join(root, request.path))), start,
    write(output + '/package.json', { fixture: 'prepared metadata only' }), write(output + '/texture.png', 'synthetic prepared bytes')]
    .map(item => ({ ...item, path: path.posix.basename(item.path) }));
  write('.hephaera/.cache/tasks/origin/vfx-preparation/owned/v1.json', fs.readFileSync(path.join(root, start.path)));
  const seal = write(output + '/preparation.json', { schemaVersion: 'bubo-vfx-preparation-result/v1', taskId: 'origin', id: 'owned', version: 'v1', requestPath: request.path, requestSha256: request.sha256, files: inventory });
  const contextPath = '.hephaera/.cache/tasks/origin/original-context.json';
  const context = { schemaVersion: 'bubo-host-context/v1', projectRoot: root, task: 'origin', roots: {
    state: '.hephaera/.cache/tasks/origin', staging: '.art-staging', tools: [], inputs: ['assets/owned-vfx'], outputs: [output] },
    policy: { fixture: 'native validates real policy' }, references: [{ ...request, kind: 'input' }], tools: [], permissions: { provisioning: false, promotion: false } };
  const preparedRecipe = structuredClone(recipe);
  preparedRecipe.effectSources[0].preparation = seal;
  preparedRecipe.effectSources[0].preparationContext = write(contextPath, context);
  admitted = collect(preparedRecipe);
  check(admitted.inputs.includes('.hephaera/.cache/tasks/origin') && admitted.inputs.includes('assets/owned-vfx'), 'Original task and exact source parents have explicit current read scope');
  check(admitted.references.has(request.path) && admitted.references.has('.hephaera/.cache/tasks/origin/vfx-preparation/owned/v1.json'), 'Original request and permanent claim retain their original paths');
  const before = fs.readFileSync(path.join(root, contextPath)); collect(preparedRecipe);
  check(before.equals(fs.readFileSync(path.join(root, contextPath))), 'Original context bytes are preserved without relabeling');
  const missingContext = structuredClone(preparedRecipe); delete missingContext.effectSources[0].preparationContext;
  reject(() => collect(missingContext), /explicit original context/, 'A copied claim cannot replace an explicit cross-task context');
  function changedContext(mutate) {
    const changed = structuredClone(context); mutate(changed);
    const candidate = structuredClone(preparedRecipe); candidate.effectSources[0].preparationContext = write(contextPath, changed);
    return candidate;
  }
  for (const scope of ['.hephaera/.cache', '.hephaera/.cache/tasks', 'assets', 'assets/unrelated', '../outside'])
    reject(() => collect(changedContext(value => value.roots.inputs = [scope])), /broad|canonical/, 'Broad/unrelated original read root rejected: ' + scope);
  reject(() => collect(changedContext(value => value.roots.state = '.hephaera/.cache/tasks/transplant')), /canonical original task/, 'Original task state cannot be transplanted');
  reject(() => collect(changedContext(value => value.permissions.promotion = true)), /authority/, 'Original context cannot grant current promotion');
  reject(() => collect(changedContext(value => value.references.push({ ...production, kind: 'review' }))), /dependent production review/, 'Original context cannot hash-reference its dependent review');
  write(contextPath, context);

  const receivingPath = stateRoot + '/receiving.json';
  const driver = write('engine/action-driver.mjs', '// synthetic metadata reference only');
  const evidenceRows = ['runtime-test', 'runtime-capture', 'performance-profile'].map(kind => ({ kind,
    ...write(stateRoot + '/' + kind + '.json', { fixture: 'synthetic protocol metadata', kind }) }));
  const receiving = write(receivingPath, { engineInputs: [{ role: 'action-driver', ...driver }] });
  const receivingEnvelope = { runtime: { schemaVersion: 'bubo-action-runtime-evidence/v2', evidence: evidenceRows, receiving } };
  const receivingRefs = new Map();
  const receivingReference = (name, kind, expected) => { assert.equal(ref(name).sha256, expected); receivingRefs.set(name, kind); };
  admission.collectReceiving({ root, evidence: receivingEnvelope, stateRoot, reference: receivingReference });
  check(receivingRefs.get(receivingPath) === 'review' && receivingRefs.get(driver.path) === 'input', 'Private receiving packet and actual engine modules retain separate native evidence kinds');
  check(evidenceRows.every(row => receivingRefs.get(row.path) === 'review'), 'All three runtime evidence artifacts retain review kind');
  const receivingBadLength = structuredClone(receivingEnvelope); receivingBadLength.runtime.evidence[0].bytes++;
  reject(() => admission.collectReceiving({ root, evidence: receivingBadLength, stateRoot, reference: receivingReference }), /artifact bytes/, 'Changed runtime evidence length is rejected');
  const receivingOutside = structuredClone(receivingEnvelope); receivingOutside.runtime.evidence[0] = driver;
  reject(() => admission.collectReceiving({ root, evidence: receivingOutside, stateRoot, reference: receivingReference }), /current-task/, 'Private runtime evidence cannot be substituted from outside its task');

  write('STYLE.md', fs.readFileSync(path.join(runtime.BASE, 'STYLE.md')));
  write('ENGINE.md', 'Selected Hephaera engine:\n- THREEJS\n\n### Inline Engine Definition\n\n'
    + fs.readFileSync(path.join(runtime.BASE, '.engine/THREEJS.md'), 'utf8').replace(/\r\n/g, '\n').trim()
    + '\n\n<!-- hephaera-engine:end -->\n');
  const recipePath = write(stateRoot + '/recipe.json', recipe).path;
  const options = host.parse(['--root', root, '--task', 'receiver', '--recipe', recipePath]);
  const hostContext = host.contextFor('model-to-action', 'inspect-effects', options, { folder: path.join(root, '.hephaera/runtime/bubo/artifacts/bubo') }).context;
  check(hostContext.references.some(item => item.path === rights.path && item.kind === 'rights'), 'Actual host context uses typed nested rights admission');
  check(!hostContext.permissions.promotion && !hostContext.permissions.provisioning && hostContext.tools.length === 0, 'Manifest-free inspect-effects supplies no tool/provisioning/promotion authority');
  const inspectManifest = write(stateRoot + '/inspect-manifest.json', { task: 'receiver', recipe: recipePath,
    hostPolicySha256: 'a'.repeat(64), runtimeBuildSha256: 'b'.repeat(64), blender: process.execPath }).path;
  const inspectionWithState = host.contextFor('model-to-action', 'inspect-effects', host.parse(['--root', root, '--manifest', inspectManifest]),
    { folder: path.join(root, '.hephaera/runtime/bubo/artifacts/bubo') }).context;
  check(inspectionWithState.tools.length === 0, 'Read-only source inspection does not inherit the manifest native executable authority');
  // An actual owned Node child observes the transport argv. This fixture is
  // explicitly synthetic and supplies no native source/render acceptance.
  write('model-to-action', "const fs=require('node:fs'),crypto=require('node:crypto');\n"
    + "const args=process.argv.slice(2),context=args[args.indexOf('--host-context')+1];\n"
    + "console.log(JSON.stringify({schemaVersion:'bubo-execution-result/v1',apiVersion:2,status:'succeeded',hostContextSha256:crypto.createHash('sha256').update(fs.readFileSync(context)).digest('hex'),data:{fixture:'synthetic-owned-transport',taskFlag:args.includes('--task'),recipeFlag:args.includes('--recipe')}}));\n");
  const transported = await host.execute('model-to-action', 'inspect-effects', options,
    { root, task: 'receiver', stateRoot, context: hostContext }, { executable: process.execPath }, false);
  check(!transported.data.taskFlag && transported.data.recipeFlag, 'Actual child receives recipe while task ownership travels only in host context');
  reject(() => host.parse(['--host-style-sha256', 'a'.repeat(64)]), /protected/, 'Caller cannot inject native host STYLE identity');
  reject(() => host.contextFor('model-to-action', 'inspect-effects', host.parse(['--root', root, '--task', 'receiver', '--recipe', write(stateRoot + '/v1.json', { schemaVersion: 1 }).path]), { folder: root }), /recipe v2/, 'inspect-effects does not silently add v2 semantics to v1');
  await assert.rejects(() => evidence.admit({ root, manifest: recipePath }), /Explicit.*mode/); checks++;
  let accessed = false;
  const accessorRequest = { root, manifest: recipePath, mode: 'review' };
  Object.defineProperty(accessorRequest, 'mode', { get() { accessed = true; return 'review'; } });
  await assert.rejects(() => evidence.admit(accessorRequest), /Unsupported/); checks++;
  check(!accessed, 'Host admission rejects accessors without executing caller code');
  const accessorEvidence = [];
  accessorEvidence.length = 3;
  Object.defineProperty(accessorEvidence, '0', { get() { accessed = true; return evidenceRows[0]; }, enumerable: true });
  accessorEvidence[1] = evidenceRows[1]; accessorEvidence[2] = evidenceRows[2];
  await assert.rejects(() => evidence.bindReceiving({ root, manifest: recipePath, receivingPath,
    evidence: accessorEvidence, destination: stateRoot + '/bound' }), /accessors/); checks++;
  check(!accessed, 'Receiving metadata cannot invoke a caller evidence accessor');
  await assert.rejects(() => evidence.admit({ root, manifest: write(stateRoot + '/legacy.json', { schemaVersion: 'hephaera-model-action/v1' }).path, mode: 'review' }), /explicit native action v2/); checks++;
  const pending = write(stateRoot + '/pending.json', { schemaVersion: 'hephaera-model-action/v2', engine: { effectiveEngine: 'THREEJS' },
    stages: { export: { status: 'complete', artifacts: { package: native.path, glb: resource.path } } }, approvals: [] }).path;
  await assert.rejects(() => evidence.admit({ root, manifest: pending, mode: 'runtime' }), /current native.*human approvals/); checks++;
  check(!fs.existsSync(path.join(root, 'assets/models')), 'Metadata admission never promotes or copies runtime assets');
  fs.writeFileSync(path.join(parent, 'latest.json'), JSON.stringify({ status: 'pass', assertions: checks, root, nativeExecution: false,
    scope: 'Owned synthetic host metadata guard tests only; native closure/renderer/human acceptance remain separate.' }, null, 2) + '\n');
  console.log('PASS:', checks, 'action v2 host admission assertions');
})().catch(error => { console.error(error); process.exitCode = 1; });
