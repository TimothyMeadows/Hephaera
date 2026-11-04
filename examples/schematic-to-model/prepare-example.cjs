'use strict';

// Prepare licensed procedural source inputs. Bubo owns all geometry and reviews.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const BASE = path.resolve(__dirname, '../..');
const runtime = require(path.join(BASE, 'commands/lib/bubo-runtime.cjs'));
const styles = require(path.join(BASE, 'commands/lib/style-contract.cjs'));
const schematic = require(path.join(BASE, 'commands/lib/bubo-schematic-adapter.cjs'));
const maintenance = require(path.join(BASE, 'commands/lib/installation-maintenance.cjs'));
const transition = require(path.join(BASE, 'commands/lib/state-transition.cjs'));
const fail = message => { throw new Error(message); };
const cases = ['vehicle', 'device', 'vessel'];
const usage = 'Prepare licensed schematic inputs; no native execution or approval.\n'
  + 'node .hephaera/examples/schematic-to-model/prepare-example.cjs --root PROJECT --case '
  + cases.join('|') + ' --task ID --asset ID --version ID --geometry-checks INTEGER '
  + '--timeout-seconds INTEGER --max-log-bytes INTEGER --max-private-bytes INTEGER';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function options(values) {
  const allowed = new Set(['root', 'case', 'task', 'asset', 'version', 'geometry-checks', 'timeout-seconds', 'max-log-bytes', 'max-private-bytes']);
  const result = new Map();
  for (let i = 0; i < values.length; i += 2) {
    const flag = values[i], value = values[i + 1];
    if (!flag?.startsWith('--') || !allowed.has(flag.slice(2)) || result.has(flag.slice(2)) || !value || value.startsWith('--')) fail(usage);
    result.set(flag.slice(2), value);
  }
  if (result.size !== allowed.size) fail(usage);
  for (const name of ['task', 'asset', 'version']) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(result.get(name))) fail('Use a safe short ' + name + ' ID.');
    runtime.syntax(result.get(name));
  }
  if (!cases.includes(result.get('case'))) fail('Select vehicle, device or vessel.');
  return result;
}
function integer(value) {
  if (!/^[1-9][0-9]{0,15}$/.test(value) || !Number.isSafeInteger(Number(value))) fail('Budgets must be positive safe integers.');
  return Number(value);
}
function read(file, maximum) {
  runtime.components(file);
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > maximum) fail('Missing or oversized example source: ' + file);
  const bytes = fs.readFileSync(file);
  if (bytes.length !== stat.size || !Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)) fail('Example source changed or is not UTF-8.');
  return bytes;
}
function prepare(root, selected) {
  transition.assertProductionAllowed(root, 'schematic example preparation');
  const source = runtime.dependency();
  const resource = 'schematic-to-model/examples-v2/' + selected.get('case') + '.json';
  const sourceFile = runtime.resource(resource), originalBytes = read(sourceFile, 8 * 1024 * 1024);
  if (!runtime.within(root, sourceFile)) fail('The pinned example must belong to this host installation.');
  const originalPath = path.relative(root, sourceFile).split(path.sep).join('/'), originalHash = digest(originalBytes);
  const licenseFile = runtime.projectPath(source.root, 'LICENSE'), license = read(licenseFile, 65536);
  const holder = license.toString('utf8').match(/^Copyright \(c\) [0-9]+ (.+)$/m)?.[1]?.trim();
  if (!license.toString('utf8').startsWith('MIT License') || !holder) fail('Review the changed native source license before preparing examples.');
  const styleFile = runtime.projectPath(root, 'STYLE.md'), style = styles.validate(styleFile);
  const selection = styles.resolve(root, styleFile, { override: 'SCHEMATIC_TO_MODEL' }, style);
  const geometryChecks = integer(selected.get('geometry-checks'));
  const schema = runtime.json(runtime.resource('schematic-to-model/assembly-design.schema.json'));
  const limits = schema.$defs.assemblyProfile.properties.maxGeometryChecks;
  if (geometryChecks < limits.minimum || geometryChecks > limits.maximum) fail('Geometry allowance is outside the pinned assembly schema.');
  const budgets = { timeoutSeconds: integer(selected.get('timeout-seconds')),
    maxLogBytes: integer(selected.get('max-log-bytes')), maxPrivateBytes: integer(selected.get('max-private-bytes')) };
  schematic.validateBudgets(budgets);
  const design = JSON.parse(originalBytes.toString('utf8'));
  if (design.schemaVersion !== 'bubo-assembly-design/v2' || !design.assemblyProfile || !design.budgets) fail('Select an assembly-capable v2 example.');
  const bindings = { styleSha256: { original: design.styleSha256, prepared: style.sha256 },
    'assemblyProfile.maxGeometryChecks': { original: design.assemblyProfile.maxGeometryChecks, prepared: geometryChecks } };
  design.styleSha256 = style.sha256;
  design.assemblyProfile.maxGeometryChecks = geometryChecks;
  const relative = '.hephaera/.cache/tasks/' + selected.get('task') + '/example-inputs/' + selected.get('asset') + '/' + selected.get('version');
  const output = runtime.projectPath(root, relative);
  for (const library of style.libraries) if (runtime.within(library.path, output) || runtime.within(output, library.path)) fail('Example output cannot overlap a read-only external asset library.');
  if (runtime.within(source.root, output) || runtime.within(output, source.root)) fail('Example output cannot overlap native sources.');
  if (fs.existsSync(output)) fail('Example inputs already exist; preserve them and choose a new version.');
  if (runtime.hash(sourceFile) !== originalHash || runtime.hash(licenseFile) !== digest(license) || runtime.hash(styleFile) !== style.sha256) fail('Example source, license or style changed during preparation.');
  fs.mkdirSync(path.dirname(output), { recursive: true }); runtime.components(output);
  fs.mkdirSync(output); runtime.components(output);
  const files = new Map(), jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
  function write(name, bytes) {
    const file = runtime.projectPath(root, relative + '/' + name);
    fs.writeFileSync(file, bytes, { flag: 'wx' });
    const sha256 = runtime.hash(file);
    if (sha256 !== digest(bytes)) fail('Prepared input changed during write.');
    const item = { path: relative + '/' + name, sha256 }; files.set(name, item); return item;
  }
  const prepared = write('design.json', jsonBytes(design)), notice = write('BUBO-LICENSE.txt', license);
  write('rights.json', jsonBytes({ schemaVersion: 'hephaera-schematic-rights/v1', designSha256: prepared.sha256,
    status: 'licensed', rightsHolder: holder, scope: 'schematic-to-model', evidence: [notice],
    referenceInputs: [{ path: originalPath, sha256: originalHash, status: 'licensed', rightsHolder: holder, evidence: [notice] }] }));
  write('budget.json', jsonBytes({ schemaVersion: 'hephaera-schematic-budget/v1', ...budgets }));
  write('selection.json', jsonBytes(selection));
  if (runtime.hash(sourceFile) !== originalHash || runtime.hash(licenseFile) !== notice.sha256 || runtime.hash(styleFile) !== style.sha256) fail('Original source, license or style changed; prepared inputs remain unapproved.');
  const fresh = runtime.dependency();
  if (fresh.pinned.revision !== source.pinned.revision || fresh.pinned.resourceCatalogSha256 !== source.pinned.resourceCatalogSha256) fail('Pinned source identity changed; preserve these unapproved inputs.');
  write('preparation.json', jsonBytes({ schemaVersion: 'hephaera-schematic-example-preparation/v1',
    case: selected.get('case'), task: selected.get('task'), asset: selected.get('asset'), version: selected.get('version'),
    source: { path: originalPath, sha256: originalHash, revision: source.pinned.revision, resourceCatalogSha256: source.pinned.resourceCatalogSha256 },
    license: { path: path.relative(root, licenseFile).split(path.sep).join('/'), sha256: notice.sha256 },
    bindings, changedFields: Object.keys(bindings).filter(name => bindings[name].original !== bindings[name].prepared),
    preservedDesignBudgets: design.budgets, geometryChecks, files: Object.fromEntries(files),
    nativeExecuted: false, approvalCreated: false, generationPerformed: false, runtimePromotion: false }));
  return { ...Object.fromEntries(files), nativeExecuted: false, approvalCreated: false, generationPerformed: false, runtimePromotion: false };
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
