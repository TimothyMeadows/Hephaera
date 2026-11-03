'use strict';

// Synthetic metadata tests for real host admission. No Bubo/native launch,
// installation, geometric verification or human acceptance is claimed here.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const runtime = require('../commands/lib/bubo-runtime.cjs');
const floor = require('../commands/lib/bubo-floor-plan-adapter.cjs');
const styles = require('../commands/lib/style-contract.cjs');
const cache = process.env.HEPHAERA_FLOOR_PLAN_TEST_CACHE || (path.basename(runtime.BASE) === '.hephaera' ? path.join(runtime.BASE, '.cache') : path.join(runtime.BASE, '.hephaera/.cache'));
const evidence = path.join(cache, 'tasks/floor-plan-hephaera-integration/evidence/host-fixtures'); fs.mkdirSync(evidence, { recursive: true });
const root = fs.mkdtempSync(path.join(evidence, 'p-'));
let checks = 0, skipped = 0;
const check = (condition, message) => { assert(condition, message); checks++; };
function rejects(action, pattern, message) { assert.throws(action, pattern, message); checks++; }
function write(name, value) { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n'); return name; }
const read = name => fs.readFileSync(path.join(root, name));
const json = name => JSON.parse(read(name));
const sha = name => runtime.hash(path.join(root, name));
const task = 'fixture', asset = 'building', version = 'v1';
const stateRoot = '.hephaera/.cache/tasks/' + task;
const manifest = stateRoot + '/floor-plan-to-model/' + asset + '/' + version + '/manifest.json';
const constructionFile = path.posix.join(path.posix.dirname(manifest), 'construction.json');
const styleText = '# STYLE.md\n\nGenerated from Hephaera style templates:\n- CEL_SHADED_COMIC\n\nPrimary Hephaera art pipeline:\n- PROOF_TO_MODEL\n\nAllowed Hephaera art pipelines:\n- PROOF_TO_MODEL\n\n---\n\nA prompt override does not rewrite STYLE.md. Never switch or fall back silently.\n';
write('STYLE.md', styleText);
write('MEDIA.md', 'Unrelated media policy deliberately not parsed or loaded by floor-plan admission.');
write('inputs/plan.json', { schemaVersion: 'synthetic-plan-only', styleSha256: sha('STYLE.md'), description: 'Owned metadata; native plan validation is tested separately.' });
const rights = { schemaVersion: 'hephaera-floor-plan-rights/v1', planSha256: sha('inputs/plan.json'), status: 'owned', rightsHolder: 'Synthetic fixture author', scope: 'floor-plan-to-model', evidence: [], referenceInputs: [] };
write('inputs/rights.json', rights);
const budgets = { schemaVersion: 'hephaera-floor-plan-budget/v1', timeoutSeconds: 600, maxLogBytes: 16777216, maxPrivateBytes: 8589934592 };
write('inputs/budget.json', budgets);
write(stateRoot + '/selection.json', styles.resolve(root, path.join(root, 'STYLE.md'), { override: 'FLOOR_PLAN_TO_MODEL' }));
write('.hephaera/runtime/bubo/artifacts/bubo/build-info.json', { synthetic: true, sourceDirty: false });
const operations = ['init', 'doctor', 'preview', 'validate', 'build', 'export', 'review', 'record', 'status'];
const info = { folder: path.join(root, '.hephaera/runtime/bubo/artifacts/bubo'), pinned: { revision: 'a'.repeat(40), resourceCatalogSha256: 'b'.repeat(64) },
  capability: { workflows: ['floor-plan-to-model'], floorPlan: { phase: 'architectural-export', operations, modelingAvailable: true, modelExportAvailable: true, requiresApprovedConstructionPlanV2: true } } };
const initArgs = ['--root', root, '--task', task, '--asset', asset, '--version', version, '--plan', 'inputs/plan.json', '--rights', 'inputs/rights.json', '--budget', 'inputs/budget.json', '--selection', stateRoot + '/selection.json'];
const options = args => floor.parse(args);
const initialize = (args = initArgs, suppliedInfo = info) => floor.contextFor('init', options(args), suppliedInfo);
let prepared = initialize();
const policyPath = prepared.policyPath, initialPolicy = read(policyPath);
check(prepared.context.policy.pipeline === 'FLOOR_PLAN_TO_MODEL' && prepared.context.policy.engine.effectiveEngine === 'THREEJS', 'Explicit floor selection preserves canonical engine ancestry');
check(!prepared.context.references.some(item => item.path === 'MEDIA.md') && !('media' in prepared.context.policy), 'Unrelated MEDIA contract is not loaded');
check(prepared.context.tools.length === 0 && prepared.context.roots.tools.length === 0, 'Design admission discovers no ambient tools');
check(prepared.context.roots.staging === '.art-staging/tasks/fixture' && prepared.context.roots.outputs.length === 0, 'Task-scoped staging grants no game output path');
check(!prepared.context.permissions.promotion && !prepared.context.permissions.provisioning, 'No provisioning or promotion permission');
check(prepared.context.budgets.timeoutSeconds === 600 && prepared.context.budgets.maxLogBytes === 16777216 && prepared.context.budgets.maxPrivateBytes === 8589934592, 'Explicit limits are retained without widening');
check(!prepared.options.has('rights') && !prepared.options.has('budget') && !prepared.options.has('selection'), 'Host-only flags never reach native CLI');
check(prepared.context.references.filter(item => item.kind === 'policy').some(item => item.path === policyPath), 'Immutable envelope is a native policy reference');
initialize(); check(read(policyPath).equals(initialPolicy), 'Matching pre-native init retry preserves exact envelope bytes');
rejects(() => initialize(initArgs.filter((item, index, array) => item !== '--selection' && array[index - 1] !== '--selection')), /Select FLOOR_PLAN_TO_MODEL/, 'No implicit fallback from primary PROOF_TO_MODEL');
for (const flag of ['host-context', 'api-version', 'runtime-build-sha256', 'runtime-resource-catalog-sha256']) rejects(() => options(['--' + flag, 'injected']), /Protected/, 'Execution metadata is protected');
rejects(() => options(['--root', root, '--root', root]), /unique/, 'Duplicate flags rejected');
rejects(() => options(['--root']), /Missing value/, 'Missing flag values rejected');
rejects(() => floor.contextFor('promote', options(initArgs), info), /Unsupported/, 'No promotion operation exists');
rejects(() => initialize([...initArgs, '--blender', process.execPath]), /inapplicable/, 'Init cannot smuggle a tool flag');
rejects(() => initialize(initArgs.map(item => item === task ? '../escape' : item)), /identity/, 'Task traversal rejected');
rejects(() => initialize(initArgs.map(item => item === root ? root + '/..' : item)), /Traversal/, 'Root traversal is not normalized away');
rejects(() => initialize(initArgs.map(item => item === 'inputs/plan.json' ? '../plan.json' : item)), /Traversal|escapes/, 'Input traversal rejected');
for (const change of [f => { f.phase = 'architectural-construction'; }, f => { f.modelExportAvailable = false; }, f => { f.operations = operations.slice(1); }, f => { f.operations = [...operations, 'promote']; }, f => { f.requiresApprovedConstructionPlanV2 = false; }]) {
  const incomplete = structuredClone(info); change(incomplete.capability.floorPlan);
  rejects(() => initialize(initArgs, incomplete), /complete architectural-export/, 'Incomplete advertised capability is not usable support');
}
function mutate(name, value, action, pattern) { const before = read(name); try { write(name, value); rejects(action, pattern, 'Changed ' + name + ' rejected'); } finally { write(name, before); } }
mutate('inputs/rights.json', { ...rights, planSha256: 'f'.repeat(64) }, initialize, /exact plan/);
mutate('inputs/rights.json', { ...rights, extraPermission: true }, initialize, /fields/);
mutate('inputs/rights.json', { ...rights, status: 'licensed' }, initialize, /rights evidence/);
mutate('inputs/budget.json', { ...budgets, timeoutSeconds: 0 }, initialize, /finite/);
mutate('inputs/budget.json', { ...budgets, maxPrivateBytes: 67108863 }, initialize, /finite/);
mutate('inputs/budget.json', { ...budgets, maxLogBytes: 1073741825 }, initialize, /finite/);
mutate('inputs/budget.json', '{"schemaVersion":"hephaera-floor-plan-budget/v1","timeoutSeconds":1,"timeoutSeconds":600,"maxLogBytes":16777216,"maxPrivateBytes":8589934592}', initialize, /Duplicate/);
write('inputs/duplicate.json', '{"name":1,"\\u006eame":2}');
rejects(() => floor.json(path.join(root, 'inputs/duplicate.json')), /Duplicate/, 'Escaped duplicate keys rejected');
rejects(() => floor.json(path.join(root, 'inputs/budget.json'), 'f'.repeat(64)), /Retained JSON input changed/, 'Parsed policy snapshot must match its captured exact hash');
write('inputs/invalid-utf8.json', Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]));
rejects(() => floor.json(path.join(root, 'inputs/invalid-utf8.json')), /UTF-8/, 'Malformed text cannot replace policy bytes during parsing');
write('inputs/deep.json', '['.repeat(66) + '0' + ']'.repeat(66)); rejects(() => floor.json(path.join(root, 'inputs/deep.json')), /nesting/, 'Policy nesting bounded');
const planOriginal = '.art-staging/tasks/fixture/floor-plan-to-model/building/v1/original/building-plan.json'; write(planOriginal, read('inputs/plan.json'));
const state = { schemaVersion: 'bubo-floor-plan-design/v1', task, asset, version, sourcePlan: 'inputs/plan.json', originalPlan: planOriginal, planSha256: sha('inputs/plan.json'), styleSha256: sha('STYLE.md'), staging: '.art-staging/tasks/fixture/floor-plan-to-model/building/v1', policyInputs: Object.fromEntries(prepared.context.references.filter(item => item.kind === 'policy').map(item => [item.path, item.sha256])) };
write(manifest, state);
const continued = (operation = 'status', extra = []) => floor.contextFor(operation, options(['--root', root, '--manifest', manifest, ...extra]), info);
prepared = continued();
check(prepared.context.tools.length === 0 && prepared.options.get('manifest') === manifest, 'Continuation stays task-owned and needs no Blender before construction');
for (const operation of ['doctor', 'preview', 'validate', 'status']) check(continued(operation).context.policy.pipeline === 'FLOOR_PLAN_TO_MODEL', operation + ' admits exact current design without tool discovery');
rejects(() => initialize(), /already exists/, 'Existing design version cannot be overwritten');
mutate('inputs/rights.json', { ...rights, rightsHolder: 'Changed owner' }, continued, /Retained input changed/);
mutate('inputs/budget.json', { ...budgets, timeoutSeconds: 900 }, continued, /Retained input changed/);
mutate('STYLE.md', styleText + '\n', continued, /Retained input changed|selection|identity/);
mutate(stateRoot + '/selection.json', { ...json(stateRoot + '/selection.json'), fallbackPolicy: 'switch' }, continued, /Retained input changed/);
mutate('inputs/plan.json', { changed: true }, continued, /Retained input changed/);
mutate(planOriginal, { changed: true }, continued, /Retained input changed/);
mutate(policyPath, { ...json(policyPath), budgets: { ...json(policyPath).budgets, timeoutSeconds: 900 } }, continued, /Retained JSON input changed/);
mutate(manifest, { ...state, task: 'different' }, continued, /ownership mismatch/);
mutate(manifest, { ...state, policyInputs: {} }, continued, /Missing retained immutable host policy identity/);
mutate(manifest, { ...state, staging: 'assets/models' }, continued, /ownership differs/);
rejects(() => continued('status', ['--task', 'other']), /inapplicable/, 'Continuation cannot change task ownership');
rejects(() => floor.contextFor('status', options(['--root', root, '--manifest', 'inputs/plan.json']), info), /canonical/, 'Arbitrary JSON is not a native design manifest');
rejects(() => continued('build'), /Missing --blender/, 'Native build requires explicit tool selection');
write(stateRoot + '/review.json', { synthetic: true });
check(continued('record', ['--kind', 'whole-building-design', '--reviewer', 'synthetic-reviewer', '--evidence', stateRoot + '/review.json']).context.references.some(item => item.kind === 'review'), 'Explicit review input reaches native admission without fabricating a decision');
rejects(() => continued('record', ['--kind', 'whole-building-design', '--reviewer', 'synthetic-reviewer', '--evidence', 'inputs/plan.json']), /active task/, 'Review evidence cannot come from another state scope');
rejects(() => continued('record', ['--kind', 'runtime', '--reviewer', 'synthetic-reviewer', '--evidence', stateRoot + '/review.json']), /review kind/, 'No runtime acceptance review kind');
write('tools/blender-fixture.bin', 'Synthetic executable identity only; never executed.');
const blender = path.join(root, 'tools/blender-fixture.bin');
const construction = { schemaVersion: 'bubo-floor-plan-construction/v1', task, asset, version, designManifest: manifest, attempts: [{ status: 'complete', toolPath: blender, toolSha256: sha('tools/blender-fixture.bin') }] };
write(constructionFile, construction);
prepared = continued();
check(prepared.context.tools.length === 1 && prepared.context.tools[0].path === blender, 'Continuation retains the construction tool without ambient discovery');
check(continued('export', ['--blender', blender, '--author', 'synthetic-author']).options.get('blender') === blender, 'Explicit current tool and author reach native export');
const modelReview = kind => continued('record', ['--kind', kind, '--reviewer', 'synthetic-reviewer', '--evidence', stateRoot + '/review.json']);
const toolBytes = read('tools/blender-fixture.bin');
fs.unlinkSync(blender);
try {
  for (const operation of ['preview', 'validate', 'doctor']) {
    const designOnly = continued(operation);
    check(designOnly.context.tools.length === 0 && !designOnly.options.has('blender'), operation + ' remains usable without the former construction tool');
  }
  check(modelReview('whole-building-design').context.tools.length === 0, 'Whole-building design recording does not require a former modeling tool');
  rejects(() => continued(), /ENOENT/, 'Current model status still requires the retained actual tool');
  for (const kind of ['independent-model', 'human-model']) rejects(() => modelReview(kind), /ENOENT/, kind + ' still requires the retained actual tool');
  rejects(() => continued('export', ['--blender', blender, '--author', 'synthetic-author']), /ENOENT/, 'Export cannot replace a missing retained tool implicitly');
} finally { write('tools/blender-fixture.bin', toolBytes); }
mutate('tools/blender-fixture.bin', 'Changed exact tool identity', continued, /Retained Blender/);
for (const kind of ['independent-model', 'human-model']) mutate('tools/blender-fixture.bin', 'Changed exact tool identity', () => modelReview(kind), /Retained Blender/);
write('tools/other-fixture.bin', read('tools/blender-fixture.bin'));
rejects(() => continued('build', ['--blender', path.join(root, 'tools/other-fixture.bin')]), /differs/, 'Same bytes at another tool path are not silently adopted');
rejects(() => continued('build', ['--blender', 'blender']), /absolute/, 'No PATH-based tool fallback');
write(stateRoot + '/bad-tool.bin', read('tools/blender-fixture.bin'));
rejects(() => continued('build', ['--blender', path.join(root, stateRoot, 'bad-tool.bin')]), /overlap/, 'Tool cannot share writable task-state roots');
write('linked-target/plan.json', read('inputs/plan.json'));
try {
  fs.symlinkSync(path.join(root, 'linked-target'), path.join(root, 'linked-input'), process.platform === 'win32' ? 'junction' : 'dir');
  rejects(() => runtime.projectPath(root, 'linked-input/plan.json'), /symbolic links|junctions/, 'Project input links rejected');
} catch (error) { if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; skipped++; }
check(read(policyPath).equals(initialPolicy), 'Failures never rewrite the retained immutable policy');
check(!fs.existsSync(path.join(root, 'assets')), 'No fixture path creates game assets');
const result = { status: 'passed', assertions: checks, skipped, root, nativeExecution: false, humanAcceptance: false, scope: 'Real host policy/selection/capability/ownership/freshness admission with explicitly synthetic native metadata.' };
fs.writeFileSync(path.join(evidence, 'latest.json'), JSON.stringify(result, null, 2) + '\n');
console.log('PASS:', checks, 'floor-plan host assertions;', skipped, 'unavailable link fixture(s).');
