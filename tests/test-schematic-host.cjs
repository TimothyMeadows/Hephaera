'use strict';

// Synthetic metadata tests for real host admission. No Bubo/native launch,
// installation, geometric verification or human acceptance is claimed here.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const runtime = require('../commands/lib/bubo-runtime.cjs');
const schematic = require('../commands/lib/bubo-schematic-adapter.cjs');
const styles = require('../commands/lib/style-contract.cjs');
const cache = process.env.HEPHAERA_SCHEMATIC_TEST_CACHE || (path.basename(runtime.BASE) === '.hephaera' ? path.join(runtime.BASE, '.cache') : path.join(runtime.BASE, '.hephaera/.cache'));
const evidence = path.join(cache, 'tasks/hephaera-schematic-integration/evidence/host-fixtures'); fs.mkdirSync(evidence, { recursive: true });
// Keep ordinary policy cases short enough for actual Windows native-path
// prerequisites. Deliberately long roots are separate metadata-only cases.
const fixtureDirectory = path.join(runtime.BASE, '.local/sch'); fs.mkdirSync(fixtureDirectory, { recursive: true });
const root = fs.mkdtempSync(path.join(fixtureDirectory, 'p-'));
let checks = 0, skipped = 0;
const check = (condition, message) => { assert(condition, message); checks++; };
function rejects(action, pattern, message) { assert.throws(action, pattern, message); checks++; }
function write(name, value) { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n'); return name; }
const read = name => fs.readFileSync(path.join(root, name));
const json = name => JSON.parse(read(name));
const sha = name => runtime.hash(path.join(root, name));
const task = 'fixture', asset = 'assembly', version = 'v1';
const stateRoot = '.hephaera/.cache/tasks/' + task;
const manifest = stateRoot + '/schematic-to-model/' + asset + '/' + version + '/manifest.json';
const partsFile = path.posix.join(path.posix.dirname(manifest), 'parts.json');
const styleText = '# STYLE.md\n\nGenerated from Hephaera style templates:\n- CEL_SHADED_COMIC\n\nPrimary Hephaera art pipeline:\n- PROOF_TO_MODEL\n\nAllowed Hephaera art pipelines:\n- PROOF_TO_MODEL\n\n---\n\nA prompt override does not rewrite STYLE.md. Never switch or fall back silently.\n';
write('STYLE.md', styleText);
write('MEDIA.md', 'Unrelated media policy deliberately not parsed or loaded by schematic admission.');
write('inputs/design.json', { schemaVersion: 'synthetic-design-only', styleSha256: sha('STYLE.md'), description: 'Owned metadata; native design validation is tested separately.' });
const rights = { schemaVersion: 'hephaera-schematic-rights/v1', designSha256: sha('inputs/design.json'), status: 'owned', rightsHolder: 'Synthetic fixture author', scope: 'schematic-to-model', evidence: [], referenceInputs: [] };
write('inputs/rights.json', rights);
const budgets = { schemaVersion: 'hephaera-schematic-budget/v1', timeoutSeconds: 600, maxLogBytes: 16777216, maxPrivateBytes: 8589934592 };
write('inputs/budget.json', budgets);
write(stateRoot + '/selection.json', styles.resolve(root, path.join(root, 'STYLE.md'), { override: 'SCHEMATIC_TO_MODEL' }));
write('.hephaera/runtime/bubo/artifacts/bubo/build-info.json', { synthetic: true, sourceDirty: false });
const operations = ['init', 'doctor', 'preview', 'validate', 'record', 'build-parts', 'assemble', 'prove-motion', 'export', 'review', 'status'];
const info = { folder: path.join(root, '.hephaera/runtime/bubo/artifacts/bubo'), pinned: { revision: 'a'.repeat(40), resourceCatalogSha256: 'b'.repeat(64) },
  capability: { workflows: ['schematic-to-model'], schematic: { phase: 'portable-assembly-export', operations,
    partConstructionAvailable: true, assemblyAvailable: true, motionProofAvailable: true, modelExportAvailable: true,
    requiresApprovedAssemblyV2: true, humanModelAcceptanceSeparate: true, motionHandoffProfile: 'mechanical-assembly' } } };
const initArgs = ['--root', root, '--task', task, '--asset', asset, '--version', version, '--design', 'inputs/design.json', '--rights', 'inputs/rights.json', '--budget', 'inputs/budget.json', '--selection', stateRoot + '/selection.json'];
const options = args => schematic.parse(args);
const initialize = (args = initArgs, suppliedInfo = info) => schematic.contextFor('init', options(args), suppliedInfo);
let prepared = initialize();
const policyPath = prepared.policyPath, initialPolicy = read(policyPath);
check(prepared.context.policy.pipeline === 'SCHEMATIC_TO_MODEL' && prepared.context.policy.engine.effectiveEngine === 'THREEJS', 'Explicit schematic selection preserves canonical engine ancestry');
check(!prepared.context.references.some(item => item.path === 'MEDIA.md') && !('media' in prepared.context.policy), 'Unrelated MEDIA contract is not loaded');
check(prepared.context.tools.length === 0 && prepared.context.roots.tools.length === 0, 'Design admission discovers no ambient tools');
check(prepared.context.roots.staging === '.art-staging/tasks/fixture' && prepared.context.roots.outputs.length === 0, 'Task-scoped staging grants no game output path');
check(!prepared.context.permissions.promotion && !prepared.context.permissions.provisioning, 'No provisioning or promotion permission');
check(prepared.context.budgets.timeoutSeconds === 600 && prepared.context.budgets.maxLogBytes === 16777216 && prepared.context.budgets.maxPrivateBytes === 8589934592, 'Explicit limits are retained without widening');
check(!prepared.options.has('rights') && !prepared.options.has('budget') && !prepared.options.has('selection'), 'Host-only flags never reach native CLI');
check(prepared.context.references.filter(item => item.kind === 'policy').some(item => item.path === policyPath), 'Immutable envelope is a native policy reference');
initialize(); check(read(policyPath).equals(initialPolicy), 'Matching pre-native init retry preserves exact envelope bytes');
rejects(() => initialize(initArgs.filter((item, index, array) => item !== '--selection' && array[index - 1] !== '--selection')), /Select SCHEMATIC_TO_MODEL/, 'No implicit fallback from primary PROOF_TO_MODEL');
for (const flag of ['host-context', 'api-version', 'baseline-root', 'state-root', 'staging-root', 'runtime-build-sha256', 'runtime-resource-catalog-sha256']) rejects(() => options(['--' + flag, 'injected']), /Protected/, 'Execution metadata is protected');
rejects(() => options(['--root', root, '--root', root]), /unique/, 'Duplicate flags rejected');
rejects(() => options(['--root']), /Missing value/, 'Missing flag values rejected');
rejects(() => schematic.contextFor('promote', options(initArgs), info), /Unsupported/, 'No promotion operation exists');
rejects(() => initialize([...initArgs, '--blender', process.execPath]), /inapplicable/, 'Init cannot smuggle a tool flag');
rejects(() => initialize(initArgs.map(item => item === task ? '../escape' : item)), /identity/, 'Task traversal rejected');
rejects(() => initialize(initArgs.map(item => item === root ? root + '/..' : item)), /Traversal/, 'Root traversal is not normalized away');
rejects(() => initialize(initArgs.map(item => item === 'inputs/design.json' ? '../design.json' : item)), /Traversal|escapes/, 'Input traversal rejected');
for (const change of [f => { f.phase = 'individual-part-construction'; }, f => { f.modelExportAvailable = false; }, f => { f.operations = operations.slice(1); }, f => { f.operations = [...operations, 'promote']; }, f => { f.requiresApprovedAssemblyV2 = false; }]) {
  const incomplete = structuredClone(info); change(incomplete.capability.schematic);
  rejects(() => initialize(initArgs, incomplete), /complete portable-assembly-export/, 'Incomplete advertised capability is not usable support');
}
for (const field of ['partConstructionAvailable', 'assemblyAvailable', 'motionProofAvailable', 'humanModelAcceptanceSeparate']) {
  const incomplete = structuredClone(info); incomplete.capability.schematic[field] = false;
  rejects(() => initialize(initArgs, incomplete), /complete portable-assembly-export/, field + ' is required before policy writes');
}
const noMechanical = structuredClone(info); noMechanical.capability.schematic.motionHandoffProfile = 'rigid';
rejects(() => initialize(initArgs, noMechanical), /complete portable-assembly-export/, 'Mixed mechanical receiving capability is required');
for (const operation of ['build', 'setup', 'promote', 'compose']) rejects(() => schematic.contextFor(operation, options(initArgs), info), /Unsupported/, 'No unrelated operation alias ' + operation);
function mutate(name, value, action, pattern) { const before = read(name); try { write(name, value); rejects(action, pattern, 'Changed ' + name + ' rejected'); } finally { write(name, before); } }
mutate('inputs/rights.json', { ...rights, designSha256: 'f'.repeat(64) }, initialize, /exact design/);
mutate('inputs/rights.json', { ...rights, extraPermission: true }, initialize, /fields/);
mutate('inputs/rights.json', { ...rights, status: 'licensed' }, initialize, /rights evidence/);
mutate('inputs/budget.json', { ...budgets, timeoutSeconds: 0 }, initialize, /finite/);
mutate('inputs/budget.json', { ...budgets, maxPrivateBytes: 67108863 }, initialize, /finite/);
mutate('inputs/budget.json', { ...budgets, maxLogBytes: 1073741825 }, initialize, /finite/);
mutate('inputs/budget.json', '{"schemaVersion":"hephaera-schematic-budget/v1","timeoutSeconds":1,"timeoutSeconds":600,"maxLogBytes":16777216,"maxPrivateBytes":8589934592}', initialize, /Duplicate/);
write('inputs/duplicate.json', '{"name":1,"\\u006eame":2}');
rejects(() => schematic.json(path.join(root, 'inputs/duplicate.json')), /Duplicate/, 'Escaped duplicate keys rejected');
rejects(() => schematic.json(path.join(root, 'inputs/budget.json'), 'f'.repeat(64)), /Retained JSON input changed/, 'Parsed policy snapshot must match its captured exact hash');
write('inputs/invalid-utf8.json', Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]));
rejects(() => schematic.json(path.join(root, 'inputs/invalid-utf8.json')), /UTF-8/, 'Malformed text cannot replace policy bytes during parsing');
write('inputs/deep.json', '['.repeat(66) + '0' + ']'.repeat(66)); rejects(() => schematic.json(path.join(root, 'inputs/deep.json')), /nesting/, 'Policy nesting bounded');
const policyRoom = 128 - (JSON.parse(initialPolicy).policyReferences.length + 1);
const evidenceFiles = Array.from({ length: policyRoom + 1 }, (_, i) => {
  const name = write('inputs/policy-evidence/' + i + '.txt', 'Owned synthetic rights evidence ' + i);
  return { path: name, sha256: sha(name) };
});
function versionInit(selectedVersion, selectedRights) {
  const rightsPath = write('inputs/rights-' + selectedVersion + '.json', selectedRights);
  return schematic.contextFor('init', options(initArgs.map(item => item === version ? selectedVersion : item === 'inputs/rights.json' ? rightsPath : item)), info);
}
const fullPolicy = versionInit('cap128', { ...rights, evidence: evidenceFiles.slice(0, policyRoom) });
check(fullPolicy.context.references.filter(item => item.kind === 'policy').length === 128, 'All 128 unique native policy slots include the immutable envelope');
rejects(() => versionInit('cap129', { ...rights, evidence: evidenceFiles }), /at most 128/, 'A 129th policy reference rejects before native state creation');
check(!fs.existsSync(path.join(root, stateRoot, 'schematic-to-model', asset, 'cap129/host-policy.json')), 'Over-budget policy failure writes no immutable envelope');
const duplicatePolicy = versionInit('capdup', { ...rights, evidence: [...evidenceFiles.slice(0, policyRoom), evidenceFiles[0], evidenceFiles[0]] });
check(duplicatePolicy.context.references.filter(item => item.kind === 'policy').length === 128, 'Duplicate source evidence does not consume additional policy slots');
const mutableInput = write(stateRoot + '/schematic-to-model/' + asset + '/mutable/parts.json', { synthetic: true });
rejects(() => versionInit('mutable', { ...rights, referenceInputs: [{ path: mutableInput, sha256: sha(mutableInput), status: 'owned', rightsHolder: 'Synthetic fixture', evidence: [] }] }), /Mutable native state/, 'Mutable sibling state cannot enter the initial policy envelope');
check(!fs.existsSync(path.join(root, stateRoot, 'schematic-to-model', asset, 'mutable/host-policy.json')), 'Mutable-reference rejection precedes the first envelope write');
if (process.platform === 'win32') {
  rejects(() => versionInit('casealias', { ...rights, evidence: [evidenceFiles[0], { ...evidenceFiles[0], path: evidenceFiles[0].path.toUpperCase() }] }), /Case aliases/, 'Windows aliases cannot create duplicate native references');
  check(!fs.existsSync(path.join(root, stateRoot, 'schematic-to-model', asset, 'casealias/host-policy.json')), 'Case-alias failure precedes the first envelope write');
}
const planOriginal = '.art-staging/tasks/fixture/schematic-to-model/assembly/v1/original/assembly-design.json'; write(planOriginal, read('inputs/design.json'));
const state = { schemaVersion: 'bubo-schematic-design/v1', task, asset, version, sourceDesign: 'inputs/design.json', originalDesign: planOriginal,
  designSha256: sha('inputs/design.json'), runtimeBuildSha256: 'c'.repeat(64), styleSha256: sha('STYLE.md'), staging: '.art-staging/tasks/fixture/schematic-to-model/assembly/v1',
  policyInputs: Object.fromEntries(prepared.context.references.filter(item => item.kind === 'policy').map(item => [item.path, item.sha256])) };
write(manifest, state);
const continued = (operation = 'status', extra = []) => schematic.contextFor(operation, options(['--root', root, '--manifest', manifest, ...extra]), info);
prepared = continued();
check(prepared.context.tools.length === 0 && prepared.options.get('manifest') === manifest, 'Continuation stays task-owned and needs no Blender before construction');
for (const operation of ['doctor', 'preview', 'validate', 'status']) check(continued(operation).context.policy.pipeline === 'SCHEMATIC_TO_MODEL', operation + ' admits exact current design without tool discovery');
rejects(() => initialize(), /already exists/, 'Existing design version cannot be overwritten');
mutate('inputs/rights.json', { ...rights, rightsHolder: 'Changed owner' }, continued, /Retained input changed/);
mutate('inputs/budget.json', { ...budgets, timeoutSeconds: 900 }, continued, /Retained input changed/);
mutate('STYLE.md', styleText + '\n', continued, /Retained input changed|selection|identity/);
mutate(stateRoot + '/selection.json', { ...json(stateRoot + '/selection.json'), fallbackPolicy: 'switch' }, continued, /Retained input changed/);
mutate('inputs/design.json', { changed: true }, continued, /Retained input changed/);
mutate(planOriginal, { changed: true }, continued, /Retained input changed/);
mutate(policyPath, { ...json(policyPath), budgets: { ...json(policyPath).budgets, timeoutSeconds: 900 } }, continued, /Retained JSON input changed/);
mutate(manifest, { ...state, task: 'different' }, continued, /ownership mismatch/);
mutate(manifest, { ...state, policyInputs: {} }, continued, /Missing retained immutable host policy identity/);
mutate(manifest, { ...state, staging: 'assets/models' }, continued, /ownership differs/);
rejects(() => continued('status', ['--task', 'other']), /inapplicable/, 'Continuation cannot change task ownership');
rejects(() => schematic.contextFor('status', options(['--root', root, '--manifest', 'inputs/design.json']), info), /canonical/, 'Arbitrary JSON is not a native design manifest');
rejects(() => continued('build-parts'), /Missing --blender/, 'Native build requires explicit tool selection');
write(stateRoot + '/review.json', { synthetic: true });
check(continued('record', ['--kind', 'whole-assembly-design', '--reviewer', 'synthetic-reviewer', '--evidence', stateRoot + '/review.json']).context.references.some(item => item.kind === 'review'), 'Explicit review input reaches native admission without fabricating a decision');
rejects(() => continued('record', ['--kind', 'whole-assembly-design', '--reviewer', 'synthetic-reviewer', '--evidence', 'inputs/design.json']), /active task/, 'Review evidence cannot come from another state scope');
rejects(() => continued('record', ['--kind', 'runtime', '--reviewer', 'synthetic-reviewer', '--evidence', stateRoot + '/review.json']), /review kind/, 'No runtime acceptance review kind');
write('tools/blender-fixture.bin', 'Synthetic executable identity only; never executed.');
const blender = path.join(root, 'tools/blender-fixture.bin');
const parts = { schemaVersion: 'bubo-schematic-parts-state/v1', task, asset, version, designManifest: manifest, runtimeSha256: state.runtimeBuildSha256,
  attempts: [{ status: 'complete', directory: state.staging + '/attempts/parts-' + '0'.repeat(32), toolPath: blender, toolSha256: sha('tools/blender-fixture.bin') }] };
write(partsFile, parts);
for (const operation of ['build-parts', 'assemble', 'prove-motion', 'export', 'review']) {
  const current = continued(operation, ['--blender', blender, ...(operation === 'export' ? ['--author', 'synthetic-author'] : [])]);
  check(current.options.get('blender') === blender && current.context.policy.pipeline === 'SCHEMATIC_TO_MODEL', 'Explicit native flag inventory admits ' + operation);
  check(!current.context.references.some(r => [manifest, partsFile, path.posix.join(path.posix.dirname(manifest), 'assembly.json'), path.posix.join(path.posix.dirname(manifest), 'exports.json')].includes(r.path)), 'Mutable state stays writable for ' + operation);
}
const assemblyFile = path.posix.join(path.posix.dirname(manifest), 'assembly.json');
const assemblyState = { schemaVersion: 'bubo-schematic-assembly-state/v1', task, asset, version, designManifest: manifest, runtimeBuildSha256: state.runtimeBuildSha256,
  attempts: [{ operation: 'assemble', status: 'complete', directory: state.staging + '/attempts/assembly-' + '1'.repeat(32), toolPath: blender, identity: { toolSha256: sha('tools/blender-fixture.bin') } }] };
write(assemblyFile, assemblyState);
check(continued().context.tools.length === 1, 'Matching parts and assembly tool identities are deduplicated');
mutate(assemblyFile, { ...assemblyState, runtimeBuildSha256: 'd'.repeat(64) }, continued, /identity differs/);
mutate(assemblyFile, { ...assemblyState, attempts: [{ ...assemblyState.attempts[0], directory: '.art-staging/tasks/other/assembly' }] }, continued, /canonical task-owned scope/);
mutate(assemblyFile, { ...assemblyState, attempts: [{ ...assemblyState.attempts[0], identity: { toolSha256: 'f'.repeat(64) } }] }, continued, /Retained Blender/);
fs.unlinkSync(path.join(root, assemblyFile));
mutate(partsFile, { ...parts, attempts: [...parts.attempts, { ...parts.attempts[0], status: 'failed', toolPath: path.join(root, 'tools/missing-failed-tool.exe') }] }, continued, /ENOENT/);
mutate(partsFile, { ...parts, runtimeSha256: 'd'.repeat(64) }, continued, /identity differs/);
mutate(partsFile, { ...parts, attempts: [{ ...parts.attempts[0], toolSha256: undefined }] }, continued, /exact lowercase SHA-256/);
const exportsFile = path.posix.join(path.posix.dirname(manifest), 'exports.json');
const exportDirectory = state.staging + '/attempts/export-' + '3'.repeat(32);
const packagePath = exportDirectory + '/package/package.json';
const packageData = { schemaVersion: 'bubo-schematic-export-package/v1', task, asset, version, files: [{ path: 'assembly.glb', sha256: 'a'.repeat(64), bytes: 1 }] };
write(packagePath, packageData);
const exportState = { schemaVersion: 'bubo-schematic-export-state/v1', task, asset, version, manifest, runtimeSha256: state.runtimeBuildSha256, decisions: [],
  attempts: [{ operation: 'export', status: 'complete', directory: exportDirectory, packageSha256: sha(packagePath), toolchain: { blenderPath: blender, blenderSha256: sha('tools/blender-fixture.bin') } }] };
write(exportsFile, exportState);
check(continued('review', ['--blender', blender]).context.tools.length === 1, 'Export uses its actual manifest/attempts/toolchain state shape');
mutate(exportsFile, { ...exportState, manifest: stateRoot + '/other/manifest.json' }, () => continued('review', ['--blender', blender]), /export path inventory/);
mutate(exportsFile, { ...exportState, attempts: [{ ...exportState.attempts[0], directory: '.art-staging/tasks/other/export-' + '3'.repeat(32) }] }, () => continued('review', ['--blender', blender]), /canonical task-owned scope/);
write(packagePath, { ...packageData, files: [{ path: '../escape.glb' }] }); write(exportsFile, { ...exportState, attempts: [{ ...exportState.attempts[0], packageSha256: sha(packagePath) }] });
rejects(() => continued('review', ['--blender', blender]), /Traversal|escapes/, 'Refreshed package hash cannot admit an escaping payload path');
write(packagePath, { ...packageData, task: 'other' }); write(exportsFile, { ...exportState, attempts: [{ ...exportState.attempts[0], packageSha256: sha(packagePath) }] });
rejects(() => continued('review', ['--blender', blender]), /sealed native path inventory/, 'A sealed package cannot substitute another task');
fs.unlinkSync(path.join(root, exportsFile));
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
  check(modelReview('whole-assembly-design').context.tools.length === 0, 'Whole-building design recording does not require a former modeling tool');
  rejects(() => continued(), /ENOENT/, 'Current model status still requires the retained actual tool');
  for (const kind of ['independent-model', 'human-model']) rejects(() => modelReview(kind), /ENOENT/, kind + ' still requires the retained actual tool');
  rejects(() => continued('export', ['--blender', blender, '--author', 'synthetic-author']), /ENOENT/, 'Export cannot replace a missing retained tool implicitly');
} finally { write('tools/blender-fixture.bin', toolBytes); }
mutate('tools/blender-fixture.bin', 'Changed exact tool identity', continued, /Retained Blender/);
for (const kind of ['independent-model', 'human-model']) mutate('tools/blender-fixture.bin', 'Changed exact tool identity', () => modelReview(kind), /Retained Blender/);
write('tools/other-fixture.bin', read('tools/blender-fixture.bin'));
rejects(() => continued('build-parts', ['--blender', path.join(root, 'tools/other-fixture.bin')]), /differs/, 'Same bytes at another tool path are not silently adopted');
rejects(() => continued('build-parts', ['--blender', 'blender']), /absolute/, 'No PATH-based tool fallback');
write(stateRoot + '/bad-tool.bin', read('tools/blender-fixture.bin'));
rejects(() => continued('build-parts', ['--blender', path.join(root, stateRoot, 'bad-tool.bin')]), /overlap/, 'Tool cannot share writable task-state roots');
write('linked-target/design.json', read('inputs/design.json'));
try {
  fs.symlinkSync(path.join(root, 'linked-target'), path.join(root, 'linked-input'), process.platform === 'win32' ? 'junction' : 'dir');
  rejects(() => runtime.projectPath(root, 'linked-input/design.json'), /symbolic links|junctions/, 'Project input links rejected');
} catch (error) { if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; skipped++; }
check(read(policyPath).equals(initialPolicy), 'Failures never rewrite the retained immutable policy');
check(!fs.existsSync(path.join(root, 'assets')), 'No fixture path creates game assets');
const win = path.win32;
const script = 'resources/schematic-to-model/blender/export_admission.py';
const settings = { root: 'C:\\p', staging: '.art-staging/tasks/t', asset: 'a', version: 'v', publication: 'C:\\p\\.hephaera\\runtime\\bubo\\artifacts\\bubo', resourceNames: [script], drawingNames: ['schematic-ground.svg'], operation: 'export' };
check(schematic.nativePathDiagnostics(settings, 'win32').issues.length === 0, 'Short Windows fixed native paths fit');
check(schematic.nativePathDiagnostics({ ...settings, root: 'C:\\' + 'x'.repeat(1000), operation: 'preview' }, 'win32').checked === false, 'Pure design operations do not require Windows native-path readiness');
check(schematic.nativePathDiagnostics({ ...settings, root: 'C:\\' + 'x'.repeat(1000) }, 'linux').checked === false, 'Windows legacy limits are not imposed on other hosts');
const source259 = 'C:\\' + 'p'.repeat(259 - 4 - win.normalize(script).length);
const fileBoundary = schematic.nativePathDiagnostics({ ...settings, publication: source259 }, 'win32');
check(fileBoundary.issues.length === 0 && win.resolve(source259, script).length === 259, 'Known native filename at259 UTF16 characters fits');
const file260 = schematic.nativePathDiagnostics({ ...settings, publication: source259 + 'p' }, 'win32');
check(file260.issues.some(item => item.kind === 'file' && item.characters === 260), 'Known native filename at260 is rejected before launch');
const surrogate260 = schematic.nativePathDiagnostics({ ...settings, publication: source259.slice(0, -1) + '\u{1f989}' }, 'win32');
check(surrogate260.issues.some(item => item.kind === 'file' && item.characters === 260), 'Windows measurement counts UTF16 code units rather than visible glyphs');
let firstDirectoryFailure;
const directorySettings = { ...settings, operation: 'build-parts', resourceNames: [], partIds: ['p'] };
for (let count = 1; count < 240; count++) {
  const result = schematic.nativePathDiagnostics({ ...directorySettings, root: 'C:\\' + 'p'.repeat(count) }, 'win32');
  if (result.issues.length) { firstDirectoryFailure = { count, result }; break; }
}
check(firstDirectoryFailure?.result.issues.some(item => item.kind === 'directory' && item.characters === 248), 'Known Blender directory at248 is rejected');
check(schematic.nativePathDiagnostics({ ...directorySettings, root: 'C:\\' + 'p'.repeat(firstDirectoryFailure.count - 1) }, 'win32').issues.length === 0, 'Known directory paths immediately below the248 boundary fit');
check(schematic.nativePathDiagnostics({ ...settings, drawingNames: ['x'.repeat(180) + '.svg'] }, 'win32').issues.some(item => item.label === 'Approved drawing payload'), 'Approved payload drawing names are included rather than an arbitrary root cap');
check(schematic.nativePathDiagnostics({ ...settings, operation: 'review', inputFiles: ['staged-package/drawings/' + 'x'.repeat(235) + '.svg'] }, 'win32').issues.some(item => item.label === 'Declared current native input'), 'Review includes every declared sealed input path');
const fullPaths = schematic.nativePathDiagnostics({ ...settings, root: 'C:\\' + 'x'.repeat(220), operation: 'doctor', partIds: ['P'.repeat(80)] }, 'win32').issues;
for (const suffix of ['P'.repeat(80) + '.geometry.bin', 'clip.000000.sample.000000.000000.geometry.bin', 'imported.clip.000000.sample.000000.000000.geometry.bin',
  'diagnostic-motion\\diagnostic.glb', 'diagnostic.000000.000000.png', 'bundle\\assembly_admission.py', 'bundle\\export_verify.py'])
  check(fullPaths.some(item => item.path.endsWith(suffix)), 'Actual schematic fixed path inventory includes ' + suffix);
check(!fullPaths.some(item => /building\.blend|visual\.glb|collision\.glb|construction-report|view-1157/.test(item.path)), 'Schematic diagnostics do not certify architectural filenames');
const nativeDoctor = { schemaVersion: 'synthetic-doctor-only', nativeReadiness: 'unverified', unavailable: ['explicit tool unavailable'],
  assembly: { nativeReadiness: 'unverified', unavailable: ['current parts unavailable'] }, export: { nativeReadiness: 'unverified', unavailable: ['explicit tool unavailable'] } };
const doctorOriginal = JSON.stringify(nativeDoctor);
const hostDoctor = schematic.doctorData(nativeDoctor, file260, 'C:\\tools\\blender.exe');
check(JSON.stringify(nativeDoctor) === doctorOriginal, 'Host doctor augmentation preserves the raw native response');
check(hostDoctor.nativeReadiness === 'unverified' && hostDoctor.export.nativeReadiness === 'unverified'
  && hostDoctor.unavailable.some(item => item.includes('no Blender version/SDK probe was run'))
  && hostDoctor.export.unavailable.some(item => item.includes('shorter project path')), 'Host doctor reports the precise limit and withheld probe honestly');
check(hostDoctor.assembly.unavailable.some(item => item.includes('shorter project path')) && hostDoctor.assembly.nativeReadiness === 'unverified', 'Host doctor augments assembly prerequisites separately');
if (process.platform === 'win32') {
  // Make the rejection fixture independent of the checkout's own path length.
  // Node supports these metadata paths; the selected Win32 Blender profile does not.
  let longParent = evidence;
  while (longParent.length < 200) longParent = path.join(longParent, 'long-project-name');
  fs.mkdirSync(longParent, { recursive: true });
  const longRoot = fs.mkdtempSync(path.join(longParent, 'long-'));
  check(longRoot.length >= 200, 'Deliberate long-path fixture is long on both short CI and maintainer checkouts');
  for (const name of ['STYLE.md', 'MEDIA.md', 'inputs/design.json', 'inputs/rights.json', 'inputs/budget.json', stateRoot + '/selection.json', '.hephaera/runtime/bubo/artifacts/bubo/build-info.json', planOriginal]) {
    const destination = path.join(longRoot, name); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, read(name));
  }
  const longInfo = { ...info, folder: path.join(longRoot, '.hephaera/runtime/bubo/artifacts/bubo') };
  const longInitial = schematic.contextFor('init', options(initArgs.map(item => item === root ? longRoot : item)), longInfo);
  const longState = { ...state, policyInputs: Object.fromEntries(longInitial.context.references.filter(item => item.kind === 'policy').map(item => [item.path, item.sha256])) };
  fs.writeFileSync(path.join(longRoot, manifest), JSON.stringify(longState));
  const longContinued = (operation, extra = []) => schematic.contextFor(operation, options(['--root', longRoot, '--manifest', manifest, ...extra]), longInfo);
  check(longInitial.context.tools.length === 0, 'Init remains usable at a root exceeding native output limits');
  for (const operation of ['preview', 'validate']) check(longContinued(operation).context.tools.length === 0, operation + ' remains usable at a long project root');
  const unavailableDoctor = longContinued('doctor', ['--blender', process.execPath]);
  check(unavailableDoctor.pathDiagnostics.issues.length > 0 && unavailableDoctor.withheldBlender === process.execPath
    && !unavailableDoctor.options.has('blender') && unavailableDoctor.context.tools.length === 0, 'Long-root doctor withholds the selected native probe without adopting or executing it');
  for (const operation of ['build-parts', 'export', 'review']) rejects(() => longContinued(operation, ['--blender', process.execPath, ...(operation === 'export' ? ['--author', 'synthetic-author'] : [])]), /shorter project path or task\/asset\/version names/, operation + ' fails its known long native paths before a child launch');
}
const result = { status: 'passed', assertions: checks, skipped, root, nativeExecution: false, humanAcceptance: false, scope: 'Real host policy/selection/capability/ownership/freshness admission with explicitly synthetic native metadata.' };
fs.writeFileSync(path.join(evidence, 'latest.json'), JSON.stringify(result, null, 2) + '\n');
console.log('PASS:', checks, 'schematic host assertions;', skipped, 'unavailable link fixture(s).');
