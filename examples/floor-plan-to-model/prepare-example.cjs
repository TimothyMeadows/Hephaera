'use strict';

// Prepare explicit, licensed engineering inputs. Native validation and all
// design/model decisions remain in the production workflow.
const fs = require('node:fs'), path = require('node:path');
const BASE = path.resolve(__dirname, '../..');
const runtime = require(path.join(BASE, 'commands/lib/bubo-runtime.cjs'));
const styles = require(path.join(BASE, 'commands/lib/style-contract.cjs'));
const floor = require(path.join(BASE, 'commands/lib/bubo-floor-plan-adapter.cjs'));
const maintenance = require(path.join(BASE, 'commands/lib/installation-maintenance.cjs'));
const transition = require(path.join(BASE, 'commands/lib/state-transition.cjs'));
const fail = message => { throw new Error(message); };
const cases = ['single-storey', 'multi-storey', 'angled-courtyard'];
const usage = 'Prepare licensed floor-plan example inputs without native execution or approval.\n'
  + 'node .hephaera/examples/floor-plan-to-model/prepare-example.cjs --root PROJECT --case '
  + cases.join('|') + ' --task ID --asset ID --version ID --geometry-checks INTEGER '
  + '--timeout-seconds INTEGER --max-log-bytes INTEGER --max-private-bytes INTEGER';

function options(values) {
  const allowed = new Set(['root', 'case', 'task', 'asset', 'version', 'geometry-checks', 'timeout-seconds', 'max-log-bytes', 'max-private-bytes']);
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index], value = values[index + 1];
    if (!flag?.startsWith('--') || !allowed.has(flag.slice(2)) || result.has(flag.slice(2)) || !value || value.startsWith('--')) fail(usage);
    result.set(flag.slice(2), value);
  }
  if (result.size !== allowed.size) fail(usage);
  for (const name of ['task', 'asset', 'version']) if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(result.get(name))) fail('Use a safe short ' + name + ' ID.');
  if (!cases.includes(result.get('case'))) fail('Select one of the three documented cases.');
  return result;
}
function integer(value) {
  if (!/^[1-9][0-9]{0,15}$/.test(value) || !Number.isSafeInteger(Number(value))) fail('Budgets must be positive safe integers.');
  return Number(value);
}
function read(file, maximum) {
  runtime.components(file);
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > maximum) fail('Missing or oversized example input: ' + file);
  return fs.readFileSync(file);
}
function prepare(root, selected) {
  transition.assertProductionAllowed(root, 'floor-plan example preparation');
  const source = runtime.dependency();
  const resourceName = 'floor-plan-to-model/examples-v2/' + selected.get('case') + '.json';
  const resourceFile = runtime.resource(resourceName), sourceBytes = read(resourceFile, 8 * 1024 * 1024);
  const licenseFile = runtime.projectPath(source.root, 'LICENSE'), license = read(licenseFile, 65536);
  const licenseText = license.toString('utf8'), copyright = licenseText.match(/^Copyright \(c\) [0-9]+ (.+)$/m)?.[1]?.trim();
  if (!licenseText.startsWith('MIT License') || !copyright) fail('Inspect the changed source license before preparing these examples.');
  const styleFile = runtime.projectPath(root, 'STYLE.md'), style = styles.validate(styleFile);
  const selection = styles.resolve(root, styleFile, { override: 'FLOOR_PLAN_TO_MODEL' }, style);
  const geometryChecks = integer(selected.get('geometry-checks'));
  const schema = runtime.json(runtime.resource('floor-plan-to-model/building-plan-v2.schema.json'));
  const bound = schema.$defs.budgets.properties.maxGeometryChecks;
  if (geometryChecks < bound.minimum || geometryChecks > bound.maximum) fail('Geometry allowance is outside the pinned plan schema.');
  const budgets = { timeoutSeconds: integer(selected.get('timeout-seconds')), maxLogBytes: integer(selected.get('max-log-bytes')), maxPrivateBytes: integer(selected.get('max-private-bytes')) };
  floor.validateBudgets(budgets);
  const plan = JSON.parse(sourceBytes.toString('utf8'));
  if (plan.schemaVersion !== 'bubo-building-plan/v2') fail('The selected native example is not construction-capable v2.');
  plan.styleSha256 = style.sha256;
  plan.budgets.maxGeometryChecks = geometryChecks;
  const relative = '.hephaera/.cache/tasks/' + selected.get('task') + '/example-inputs/' + selected.get('asset') + '/' + selected.get('version');
  const output = runtime.projectPath(root, relative);
  for (const library of style.libraries) if (runtime.within(library.path, output) || runtime.within(output, library.path)) fail('Example output cannot overlap a read-only external asset library.');
  if (fs.existsSync(output)) fail('Example inputs already exist; preserve them and choose a new version.');
  fs.mkdirSync(path.dirname(output), { recursive: true }); runtime.components(output);
  fs.mkdirSync(output); runtime.components(output);
  const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const files = new Map();
  function write(name, bytes) {
    const file = runtime.projectPath(root, relative + '/' + name);
    fs.writeFileSync(file, bytes, { flag: 'wx' });
    const actual = runtime.hash(file);
    if (actual !== require('node:crypto').createHash('sha256').update(bytes).digest('hex')) fail('Prepared input changed during write.');
    files.set(name, { path: relative + '/' + name, sha256: actual });
    return files.get(name);
  }
  const preparedPlan = write('plan.json', jsonBytes(plan));
  const permission = write('BUBO-LICENSE.txt', license);
  const original = path.relative(root, resourceFile).split(path.sep).join('/');
  const originalHash = runtime.hash(resourceFile);
  if (!runtime.within(root, resourceFile) || originalHash !== require('node:crypto').createHash('sha256').update(sourceBytes).digest('hex')) fail('Native example changed during preparation.');
  write('rights.json', jsonBytes({ schemaVersion: 'hephaera-floor-plan-rights/v1', planSha256: preparedPlan.sha256,
    status: 'licensed', rightsHolder: copyright, scope: 'floor-plan-to-model', evidence: [permission],
    referenceInputs: [{ path: original, sha256: originalHash, status: 'licensed', rightsHolder: copyright, evidence: [permission] }] }));
  write('budget.json', jsonBytes({ schemaVersion: 'hephaera-floor-plan-budget/v1', ...budgets }));
  write('selection.json', jsonBytes(selection));
  if (runtime.hash(styleFile) !== style.sha256 || runtime.hash(licenseFile) !== permission.sha256) fail('Style or license changed during preparation.');
  runtime.dependency();
  const receipt = { schemaVersion: 'hephaera-floor-plan-example-preparation/v1', case: selected.get('case'),
    task: selected.get('task'), asset: selected.get('asset'), version: selected.get('version'),
    source: { path: original, sha256: originalHash, revision: source.pinned.revision },
    changes: ['styleSha256', 'budgets.maxGeometryChecks'], geometryChecks, files: Object.fromEntries(files),
    nativeExecuted: false, approvalCreated: false, runtimePromotion: false };
  write('preparation.json', jsonBytes(receipt));
  return { ...Object.fromEntries(files), nativeExecuted: false, approvalCreated: false, runtimePromotion: false };
}
async function main(values) {
  if (values.length === 1 && ['--help', '-h'].includes(values[0])) { console.log(usage); return; }
  const selected = options(values), root = path.resolve(runtime.native(selected.get('root')));
  runtime.syntax(root); runtime.components(root);
  if (!fs.statSync(root).isDirectory() || !runtime.samePath(path.join(root, '.hephaera'), BASE)) fail('Run the preparer from the selected host installation at PROJECT/.hephaera.');
  const result = await maintenance.run(root, () => prepare(root, selected));
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
