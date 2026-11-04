'use strict';

// Actual installed-input preparation with the pinned source checkout. This test
// never builds/launches Bubo or Blender and creates no review or acceptance.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const cp = require('node:child_process'), crypto = require('node:crypto');
const BASE = path.resolve(__dirname, '..');
const parent = path.join(BASE, '.local/schematic-examples');
fs.mkdirSync(parent, { recursive: true });
const run = fs.mkdtempSync(path.join(parent, 'r-')), root = path.join(run, 'host'), installed = path.join(root, '.hephaera');
fs.mkdirSync(root);
const sourceEnvironment = { ...process.env };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'HEPHAERA_PROJECT_ROOT']) delete sourceEnvironment[key];
const env = { ...sourceEnvironment, GIT_ALLOW_PROTOCOL: 'file', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(run, 'gitconfig') };
fs.writeFileSync(env.GIT_CONFIG_GLOBAL, '[core]\n autocrlf = false\n longpaths = true\n[commit]\n gpgsign = false\n');
const calls = [], checks = [], skipped = [];
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function check(value, message) { assert(value, message); checks.push(message); }
function command(executable, args, cwd = root, expected = null) {
  const result = cp.spawnSync(executable, args, { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  const call = { executable, args, cwd, exitCode: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message };
  calls.push(call);
  fs.writeFileSync(path.join(run, 'call-' + String(calls.length).padStart(3, '0') + '.json'), JSON.stringify(call, null, 2) + '\n');
  assert(!result.error, result.error?.message);
  if (expected) check(result.status !== 0 && expected.test(result.stdout + '\n' + result.stderr), 'Preparation rejects ' + expected);
  else assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
  return result;
}
const git = (where, ...args) => command('git', ['-C', where, ...args], BASE).stdout.trim();
const helper = path.join(installed, 'examples/schematic-to-model/prepare-example.cjs');
const styleFile = path.join(root, 'STYLE.md');
const style = '# STYLE.md\n\nGenerated from Hephaera style templates:\n- CEL_SHADED_COMIC\n\nPrimary Hephaera art pipeline:\n- PROOF_TO_MODEL\n\nAllowed Hephaera art pipelines:\n- PROOF_TO_MODEL\n\n---\n\nA prompt override does not rewrite STYLE.md. Never switch or fall back silently.\n';
const defaults = { root: '.', case: 'device', task: 'qa', asset: 'box', version: 'v1', 'geometry-checks': '50000000', 'timeout-seconds': '900', 'max-log-bytes': '16777216', 'max-private-bytes': '8589934592' };
const argumentsFor = values => Object.entries(values).flatMap(([key, value]) => ['--' + key, value]);
const output = values => path.join(installed, '.cache/tasks', values.task, 'example-inputs', values.asset, values.version);
function prepare(changes = {}, expected = null) {
  const values = { ...defaults, ...changes };
  const result = command(process.execPath, [helper, ...argumentsFor(values)], root, expected);
  if (expected) check(!fs.existsSync(output(values)), 'Rejected preparation creates no version directory');
  return result;
}
function mutate(file, value, action) {
  const before = fs.readFileSync(file);
  try { fs.writeFileSync(file, value); action(); } finally { fs.writeFileSync(file, before); }
}
let summary;
try {
  const revision = git(BASE, 'rev-parse', 'HEAD'), pin = json(path.join(BASE, 'runtime/bubo.lock.json'));
  git(root, 'init', '-q');
  command('git', ['clone', '-q', '--no-hardlinks', '--no-checkout', BASE, installed]);
  git(installed, 'checkout', '-q', '--detach', revision);
  git(installed, '-c', 'submodule.runtime/bubo.url=' + path.join(BASE, 'runtime/bubo'), 'submodule', 'update', '--init', '--recursive', '--checkout', '--', 'runtime/bubo');
  const native = path.join(installed, 'runtime/bubo');
  check(git(native, 'rev-parse', 'HEAD') === pin.revision, 'Real installed native submodule matches the exact dependency pin');
  // The candidate helper can be uncommitted during local review. All its real
  // dependencies and resource admission are from the actual installed source.
  fs.mkdirSync(path.dirname(helper), { recursive: true });
  fs.copyFileSync(path.join(BASE, 'examples/schematic-to-model/prepare-example.cjs'), helper);
  const helperSha256 = sha(helper);
  fs.writeFileSync(styleFile, style);
  fs.mkdirSync(path.join(installed, '.cache/tasks/qa'), { recursive: true });
  const sourceLicense = path.join(native, 'LICENSE'), licenseSha256 = sha(sourceLicense), styleSha256 = sha(styleFile);
  const sources = Object.fromEntries(['vehicle', 'device', 'vessel'].map(name => {
    const file = path.join(native, 'resources/schematic-to-model/examples-v2', name + '.json');
    return [name, { file, sha256: sha(file) }];
  }));
  const preparedCases = {};
  for (const name of Object.keys(sources)) {
    const values = { ...defaults, case: name, asset: name };
    const response = JSON.parse(prepare({ case: name, asset: name }).stdout), folder = output(values);
    const receipt = json(path.join(folder, 'preparation.json')), design = json(path.join(folder, 'design.json'));
    const original = json(sources[name].file), expected = structuredClone(original);
    expected.styleSha256 = styleSha256;
    expected.assemblyProfile.maxGeometryChecks = 50000000;
    check(JSON.stringify(design) === JSON.stringify(expected), name + ': only explicit STYLE/geometry bindings change the pinned design');
    assert.deepEqual(receipt.preservedDesignBudgets, original.budgets); checks.push(name + ': original drawing/export/triangle/validation budgets preserved');
    assert.deepEqual(receipt.bindings, { styleSha256: { original: original.styleSha256, prepared: styleSha256 }, 'assemblyProfile.maxGeometryChecks': { original: original.assemblyProfile.maxGeometryChecks, prepared: 50000000 } }); checks.push(name + ': receipt records exact explicit bindings');
    const changedFields = Object.keys(receipt.bindings).filter(key => receipt.bindings[key].original !== receipt.bindings[key].prepared);
    assert.deepEqual(receipt.changedFields, changedFields); checks.push(name + ': changed fields distinguish actual mutations from unchanged bindings');
    check(receipt.source.sha256 === sources[name].sha256 && receipt.source.revision === pin.revision && receipt.source.resourceCatalogSha256 === pin.resourceCatalogSha256, name + ': exact original source/catalog/revision retained');
    check(receipt.source.path === '.hephaera/runtime/bubo/resources/schematic-to-model/examples-v2/' + name + '.json', name + ': original source remains repository-local and immutable');
    check(fs.readFileSync(path.join(folder, 'BUBO-LICENSE.txt')).equals(fs.readFileSync(sourceLicense)) && receipt.license.sha256 === licenseSha256, name + ': complete MIT notice retained verbatim');
    const rights = json(path.join(folder, 'rights.json')), designSha256 = sha(path.join(folder, 'design.json'));
    check(rights.status === 'licensed' && rights.scope === 'schematic-to-model' && rights.designSha256 === designSha256 && rights.rightsHolder.length > 0, name + ': rights bind the prepared design as licensed');
    assert.deepEqual(rights.referenceInputs, [{ path: receipt.source.path, sha256: sources[name].sha256, status: 'licensed', rightsHolder: rights.rightsHolder, evidence: rights.evidence }]); checks.push(name + ': original reference rights retain exact licensed source');
    assert.deepEqual(json(path.join(folder, 'budget.json')), { schemaVersion: 'hephaera-schematic-budget/v1', timeoutSeconds: 900, maxLogBytes: 16777216, maxPrivateBytes: 8589934592 }); checks.push(name + ': exact finite process budgets retained');
    const selection = json(path.join(folder, 'selection.json'));
    check(selection.pipeline === 'SCHEMATIC_TO_MODEL' && selection.selectionSource === 'prompt' && selection.styleSha256 === styleSha256 && selection.fallbackPolicy === 'stop', name + ': fresh task-local selection binds STYLE without changing its default');
    for (const [file, item] of Object.entries(receipt.files)) check(item.path === path.relative(root, path.join(folder, file)).split(path.sep).join('/') && item.sha256 === sha(path.join(folder, file)), name + ': exact output receipt ' + file);
    check(['nativeExecuted', 'approvalCreated', 'generationPerformed', 'runtimePromotion'].every(key => receipt[key] === false && response[key] === false), name + ': preparation grants no native execution, approval, generation or promotion');
    check(fs.readdirSync(folder).sort().join('|') === ['BUBO-LICENSE.txt', 'budget.json', 'design.json', 'preparation.json', 'rights.json', 'selection.json'].sort().join('|'), name + ': preparation writes only the six declared input files');
    preparedCases[name] = { folder, preparationSha256: sha(path.join(folder, 'preparation.json')), designSha256 };
  }
  check(sha(styleFile) === styleSha256 && Object.values(sources).every(item => sha(item.file) === item.sha256) && sha(sourceLicense) === licenseSha256, 'Preparing all three cases leaves STYLE and original source/license bytes unchanged');
  const existing = output({ ...defaults, asset: 'device' }), before = fs.readdirSync(existing).map(file => [file, sha(path.join(existing, file))]);
  command(process.execPath, [helper, ...argumentsFor({ ...defaults, asset: 'device' })], root, /already exist/);
  assert.deepEqual(fs.readdirSync(existing).map(file => [file, sha(path.join(existing, file))]), before); checks.push('Existing version refusal preserves every prepared byte');
  prepare({ case: 'unknown', version: 'unknown' }, /Select vehicle, device or vessel/);
  for (const [key, value] of [['geometry-checks', '0'], ['geometry-checks', '50000001'], ['geometry-checks', '1.5'], ['timeout-seconds', '86401'], ['timeout-seconds', '-1'], ['max-log-bytes', '1023'], ['max-private-bytes', '67108863'], ['max-private-bytes', '9007199254740992']]) prepare({ [key]: value, version: 'bad-' + checks.length }, /Budgets|allowance|finite/);
  const missing = { ...defaults }; delete missing['timeout-seconds'];
  command(process.execPath, [helper, ...argumentsFor(missing)], root, /all|Prepare licensed schematic inputs/);
  command(process.execPath, [helper, ...argumentsFor(defaults), '--case', 'vessel'], root, /Prepare licensed schematic inputs/);
  prepare({ task: '../escape', version: 'traversal' }, /safe short task/);
  prepare({ asset: 'bad/name', version: 'slash' }, /safe short asset/);
  const outside = path.join(run, 'outside'); fs.mkdirSync(outside);
  prepare({ root: outside, version: 'wrong-root' }, /selected host installation/);
  mutate(sources.device.file, fs.readFileSync(sources.device.file, 'utf8') + '\n', () => prepare({ version: 'changed-source' }, /Bubo source is modified|altered Bubo resource/));
  mutate(sourceLicense, 'Changed license\n', () => prepare({ version: 'changed-license' }, /Bubo source is modified|changed native source license/));
  mutate(styleFile, 'invalid STYLE\n', () => prepare({ version: 'invalid-style' }, /STYLE.md|pipeline|template/));
  const fence = path.join(installed, '.cache/STATE_TRANSITION.json'); fs.writeFileSync(fence, '{}\n');
  try { prepare({ version: 'fenced' }, /State transition blocks/); } finally { fs.unlinkSync(fence); }
  const libraryRoot = path.join(installed, '.cache/tasks/qa/example-inputs');
  const libraryStyle = value => style + '\n## External Asset Libraries\n\n- fixtures: `' + value.split(path.sep).join('/') + '`\n\nInspect external libraries before creating or downloading models. External libraries are read-only. Copy into assets/models/fixtures before loading assets.\n';
  mutate(styleFile, libraryStyle(libraryRoot), () => prepare({ version: 'library-parent' }, /read-only external asset library/));
  mutate(styleFile, libraryStyle(path.join(libraryRoot, 'box/library-child/inside')), () => prepare({ version: 'library-child' }, /read-only external asset library/));
  const target = path.join(run, 'link-target'), linked = path.join(installed, '.cache/tasks/linked'); fs.mkdirSync(target);
  try {
    fs.symlinkSync(target, linked, process.platform === 'win32' ? 'junction' : 'dir');
    prepare({ task: 'linked', version: 'linked' }, /symbolic links|junctions/);
    check(fs.readdirSync(target).length === 0, 'A task-path link cannot write outside the host');
  } catch (error) { if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; skipped.push({ check: 'task symlink/junction rejection', reason: error.code }); }
  const lock = path.join(root, 'hephaera.lock.json');
  fs.writeFileSync(lock, JSON.stringify({ schemaVersion: 1, active: true, revision, manifestSha256: 'a'.repeat(64) }));
  const maintenance = require(path.join(installed, 'installer/core/maintenance.cjs')), writer = maintenance.acquireWrite(root);
  try { prepare({ version: 'writer' }, /maintenance writer is active/); } finally { writer.release(); }
  mutate(lock, JSON.stringify({ schemaVersion: 1, active: false, revision, manifestSha256: 'a'.repeat(64) }), () => prepare({ version: 'inactive' }, /baseline is inactive/));
  prepare({ version: 'managed' });
  check(fs.readdirSync(path.join(installed, '.cache/installer/maintenance/readers')).length === 0, 'Managed preparation releases its reader after success and rejection');
  check(!fs.existsSync(path.join(root, '.art-staging')) && !fs.existsSync(path.join(root, 'assets')), 'No construction staging or runtime asset directory is created');
  check(git(native, 'status', '--porcelain', '--untracked-files=no') === '' && Object.values(sources).every(item => sha(item.file) === item.sha256) && sha(sourceLicense) === licenseSha256 && sha(styleFile) === styleSha256, 'All negative cases preserve exact clean native source and STYLE');
  summary = { status: 'passed', baselineRevision: revision, helperSha256, nativeRevision: pin.revision, resourceCatalogSha256: pin.resourceCatalogSha256, fixture: run, checks, skipped, preparedCases, scope: 'Actual licensed input preparation in a real clone installation with the pinned native submodule; no native execution, installation, model generation, review approval, human/runtime acceptance or promotion.' };
} catch (error) {
  summary = { status: 'failed', fixture: run, checks, skipped, error: error.stack };
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(run, 'SUMMARY.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ ...summary, checks: checks.length }, null, 2));
}
