'use strict';

// Hephaera supplies immutable policy/evidence; Bubo alone parses VFX packages
// and inspects their resource closure. These are cooperative filesystem guards.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const runtime = require('./bubo-runtime.cjs');
const engines = require('./engine-contract.cjs');
const styles = require('./style-contract.cjs');
const transition = require('./state-transition.cjs');
const maintenance = require('./installation-maintenance.cjs');
const launcher = require('./bubo-host-adapter.cjs');
const fail = message => { throw new Error(message); };
const SHA256 = /^[a-f0-9]{64}$/;
const TASK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const PIPELINES = { CLOUD: 'cloud', LOCAL: 'local', PROOF_TO_MODEL: 'proof-to-model', CODE: 'code', BLENDER: 'blender', FLOOR_PLAN_TO_MODEL: 'floor-plan-to-model', SCHEMATIC_TO_MODEL: 'schematic-to-model' };
const digest = value => crypto.createHash('sha256').update(JSON.stringify(runtime.canonical(value))).digest('hex');

function rootPath(value) {
  if (typeof value !== 'string' || !value) fail('An explicit resolved VFX project root is required.');
  const root = path.resolve(runtime.native(value));
  runtime.syntax(root); runtime.components(root);
  if (!fs.statSync(root).isDirectory()) fail('VFX project root must be a real directory.');
  if (!runtime.samePath(root, runtime.BASE) && !runtime.samePath(path.join(root, '.hephaera'), runtime.BASE))
    fail('VFX requires the resolved host .hephaera installation or its maintainer source root.');
  return root;
}

// Hash evidence within finite byte limits without interpreting its contents.
function fileIdentity(root, value, maximumBytes = MAX_FILE_BYTES) {
  const full = runtime.projectPath(root, value), before = fs.lstatSync(full);
  if (!before.isFile() || before.size < 1 || before.size > maximumBytes)
    fail('VFX evidence must be a nonempty bounded regular file: ' + value);
  const fd = fs.openSync(full, 'r'), hash = crypto.createHash('sha256'), block = Buffer.allocUnsafe(65536);
  let bytes = 0;
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.size !== before.size) fail('VFX evidence changed before admission: ' + value);
    let count;
    while ((count = fs.readSync(fd, block, 0, Math.min(block.length, maximumBytes + 1 - bytes), null)) > 0) {
      bytes += count;
      if (bytes > maximumBytes) fail('VFX evidence exceeded its finite byte bound: ' + value);
      hash.update(block.subarray(0, count));
    }
    const after = fs.fstatSync(fd);
    if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== opened.mtimeMs)
      fail('VFX evidence changed during admission: ' + value);
  } finally { fs.closeSync(fd); }
  runtime.components(full);
  const after = fs.lstatSync(full);
  if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || after.size !== bytes || after.mtimeMs !== before.mtimeMs)
    fail('VFX evidence path changed during admission: ' + value);
  return { path: path.relative(root, full).split(path.sep).join('/'), sha256: hash.digest('hex'), bytes };
}

function snapshot(rootArgument) {
  const root = rootPath(rootArgument), files = new Map();
  function policy(value) {
    const identity = fileIdentity(root, value);
    const reference = { path: identity.path, sha256: identity.sha256, kind: 'policy' };
    files.set(reference.path, reference);
    return reference;
  }
  const styleFile = runtime.projectPath(root, 'STYLE.md');
  policy(styleFile);
  const validated = styles.validate(styleFile), resolvedStyle = styles.resolve(root, styleFile, {}, validated);
  // A resolution timestamp is diagnostic, not part of the selected policy.
  const { resolvedAt, ...style } = resolvedStyle;
  policy('ENGINE.md'); // A resolver's unconfigured default cannot admit packages.
  const engine = engines.resolve(root);
  if (engine.selectionSource !== 'contract' || engine.outputScope || engine.projectEngine !== engine.effectiveEngine
      || !SHA256.test(engine.contractSha256 || '') || !SHA256.test(engine.definitionSha256 || '') || !SHA256.test(engine.registrySha256 || ''))
    fail('VFX requires an explicit current ENGINE.md and complete native engine identities.');

  const registry = policy(path.join(runtime.BASE, '.engine/registry.json'));
  const definitionName = runtime.json(path.join(runtime.BASE, '.engine/registry.json')).engines?.[engine.effectiveEngine]?.definition;
  if (typeof definitionName !== 'string' || path.basename(definitionName) !== definitionName) fail('Invalid selected engine definition identity.');
  const definition = policy(path.join(runtime.BASE, '.engine', definitionName));
  if (registry.sha256 !== engine.registrySha256 || definition.sha256 !== engine.definitionSha256
      || files.get('ENGINE.md').sha256 !== engine.contractSha256 || files.get('STYLE.md').sha256 !== style.styleSha256)
    fail('VFX policy changed while resolving its shared definitions.');

  policy(path.join(runtime.BASE, '.styles/INDEX.md'));
  policy(path.join(runtime.BASE, '.styles/.pipelines/INDEX.md'));
  for (const name of validated.styles) policy(path.join(runtime.BASE, '.styles', name + '.md'));
  for (const name of validated.allowed) policy(path.join(runtime.BASE, '.styles/.pipelines', PIPELINES[name], 'PIPELINE.md'));
  for (const name of ['commands/vfx-assets.sh', 'commands/lib/vfx-assets.cjs', 'commands/lib/bubo-vfx-adapter.cjs',
    'commands/lib/bubo-host-adapter.cjs', 'commands/lib/bubo-runtime.cjs']) policy(path.join(runtime.BASE, name));

  // Bind actual concise read directives, including architecture templates.
  // A misplaced mount must never substitute an unrelated local definition.
  function directives(contractFile) {
    const text = fs.readFileSync(contractFile, 'utf8').replace(/\r\n/g, '\n');
    for (const match of text.matchAll(/^Read `([^`]+)` instructions\s*$/gm)) {
      const normalized = match[1].replace(/\\/g, '/');
      const shared = normalized.match(/(?:^|\/)\.(styles|engine|architecture)\/(.+)$/);
      if (!shared) continue;
      runtime.syntax(normalized.replace(/^\.\//, ''));
      const target = path.resolve(root, runtime.native(match[1]));
      const expected = path.resolve(runtime.BASE, '.' + shared[1], shared[2]);
      if (!runtime.samePath(target, expected)) fail('VFX policy read directive must use its actual shared definition.');
      policy(target);
    }
  }
  directives(styleFile); directives(runtime.projectPath(root, 'ENGINE.md'));
  let architecture = null;
  if (fs.existsSync(runtime.projectPath(root, 'ARCHITECTURE.md'))) {
    const reference = policy('ARCHITECTURE.md');
    architecture = { path: reference.path, sha256: reference.sha256 };
    directives(runtime.projectPath(root, 'ARCHITECTURE.md'));
  }
  const value = { schemaVersion: 'hephaera-vfx-policy/v1', root, style, engine, architecture,
    contractFiles: [...files.values()].sort((left, right) => left.path.localeCompare(right.path, 'en')) };
  return { ...value, fingerprint: digest(value) };
}

function requireExpected(actual, expected) {
  if (expected === null || expected === undefined) return;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) fail('VFX expected policy must be a complete policy snapshot.');
  const { fingerprint, ...value } = expected;
  if (!SHA256.test(fingerprint || '') || digest(value) !== fingerprint || digest(actual) !== digest(expected))
    fail('VFX host policy drifted; create a new immutable asset version with refreshed evidence.');
}

function requireCapability(info) {
  const capability = info.capability;
  if (!capability.workflows?.includes('vfx-assets') || capability.vfx?.packageSchema !== 'bubo-vfx-package/v1'
      || !['validate', 'inspect'].every(operation => capability.vfx.operations?.includes(operation)))
    fail('The verified pinned Bubo build does not expose the required VFX v1 inspect/validate contract.');
}

async function inspect(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('VFX inspection requires explicit host inputs.');
  const allowed = new Set(['root', 'task', 'packagePath', 'references', 'expectedPolicy', 'budgets', 'operation']);
  for (const name of Object.keys(request)) if (!allowed.has(name)) fail('Unsupported or protected VFX execution option: ' + name);
  const root = rootPath(request.root);
  // Fence before even a managed-installation read lease can create metadata.
  transition.assertProductionAllowed(root, 'VFX package inspection');
  return maintenance.run(root, async () => {
    transition.assertProductionAllowed(root, 'VFX package inspection');
    const policy = snapshot(root); requireExpected(policy, request.expectedPolicy);
    const task = request.task;
    if (!TASK.test(task || '') || task.length > 80) fail('A safe existing canonical VFX task is required.');
    const stateRoot = '.hephaera/.cache/tasks/' + task;
    const taskFile = fileIdentity(root, stateRoot + '/TASK.md');
    const operation = request.operation === undefined ? 'inspect' : request.operation;
    if (!['inspect', 'validate'].includes(operation)) fail('Only read-only VFX inspect and validate are available.');
    if (request.budgets !== undefined && (!request.budgets || typeof request.budgets !== 'object' || Array.isArray(request.budgets)))
      fail('VFX inspection requires finite supported timeout and log budgets.');
    const budgets = { timeoutSeconds: 60, maxLogBytes: 1048576, ...request.budgets };
    if (Object.keys(budgets).some(name => !['timeoutSeconds', 'maxLogBytes'].includes(name))
        || !Number.isSafeInteger(budgets.timeoutSeconds) || budgets.timeoutSeconds < 1 || budgets.timeoutSeconds > 86400
        || !Number.isSafeInteger(budgets.maxLogBytes) || budgets.maxLogBytes < 1 || budgets.maxLogBytes > 16777216)
      fail('VFX inspection requires finite supported timeout and log budgets.');
    const packageFile = fileIdentity(root, request.packagePath, 1024 * 1024);
    const packageDirectory = path.posix.dirname(packageFile.path);
    if (packageDirectory === '.') fail('VFX package dependencies require a dedicated project-local input directory.');
    const references = new Map();
    const key = value => process.platform === 'win32' ? value.toLowerCase() : value;
    function register(reference) {
      const previous = references.get(key(reference.path));
      if (previous && (previous.path !== reference.path || previous.sha256 !== reference.sha256 || previous.kind !== reference.kind))
        fail('VFX reference conflicts with an exact host-owned identity.');
      references.set(key(reference.path), reference);
    }
    for (const reference of policy.contractFiles) register(reference);
    register({ path: taskFile.path, sha256: taskFile.sha256, kind: 'policy' });
    register({ path: packageFile.path, sha256: packageFile.sha256, kind: 'input' });
    const supplied = request.references === undefined ? [] : request.references;
    if (!Array.isArray(supplied) || supplied.length > 256) fail('VFX references must be a bounded exact file inventory.');
    let referenceBytes = 0;
    for (const reference of supplied) {
      if (!reference || typeof reference !== 'object' || Array.isArray(reference)
          || Object.keys(reference).some(name => !['path', 'sha256', 'kind'].includes(name))
          || !['rights', 'review', 'policy', 'input'].includes(reference.kind) || !SHA256.test(reference.sha256 || ''))
        fail('VFX references require a safe path, exact SHA-256 and supported evidence kind.');
      const observed = fileIdentity(root, reference.path);
      referenceBytes += observed.bytes;
      if (referenceBytes > 64 * 1024 * 1024) fail('VFX reference inventory exceeds its finite byte budget.');
      if (observed.sha256 !== reference.sha256) fail('VFX evidence hash changed: ' + observed.path);
      register({ path: observed.path, sha256: observed.sha256, kind: reference.kind });
    }
    const info = runtime.verified(); requireCapability(info);
    requireExpected(snapshot(root), policy);
    const validatedStyle = styles.validate(runtime.projectPath(root, 'STYLE.md'));
    const context = { schemaVersion: 'bubo-host-context/v1', projectRoot: root, task,
      roots: { state: stateRoot, staging: '.art-staging', tools: [], inputs: [packageDirectory], outputs: [] },
      policy: { pipeline: policy.style.pipeline, styleSha256: policy.style.styleSha256, engine: policy.engine,
        libraries: validatedStyle.libraries.map(item => ({ id: item.id, root: item.path })) },
      references: [...references.values()], tools: [], budgets, permissions: { provisioning: false, promotion: false } };
    const options = new Map([['root', root], ['package', packageFile.path]]);
    const result = await launcher.execute('vfx-assets', operation, options, { root, task, stateRoot, context, options }, info, false);
    requireExpected(snapshot(root), policy);
    return { data: result.data, policy, runtime: { revision: info.pinned.revision,
      buildSha256: digest(info.capability.build), resourceCatalogSha256: info.pinned.resourceCatalogSha256 },
      hostContextSha256: result.hostContextSha256 };
  });
}

function doctor(rootArgument) {
  const root = rootPath(rootArgument);
  const errors = [];
  let policy = null, dependency = { available: false, buildVerification: 'not-run' };
  try { policy = snapshot(root); } catch (error) { errors.push(error.message); }
  try {
    const info = runtime.dependency();
    dependency = { available: true, revision: info.pinned.revision, resourceCatalogSha256: info.pinned.resourceCatalogSha256,
      buildReceiptPresent: fs.existsSync(path.join(info.root, info.pinned.buildReceipt)), buildVerification: 'not-run' };
  } catch (error) { dependency.error = error.message; errors.push(error.message); }
  try { transition.assertProductionAllowed(root, 'VFX lifecycle'); } catch (error) { errors.push(error.message); }
  const unavailable = { processingAvailable: false, renderingAvailable: false, promotionAvailable: false,
    mediaGenerationAvailable: false, videoDecodingAvailable: false, runtimeAcceptanceAvailable: false };
  return { schemaVersion: 'hephaera-vfx-doctor/v1', root, policy, dependency, errors,
    readiness: { contractInspection: policy && dependency.available && !errors.length ? 'unverified' : 'unavailable', ...unavailable },
    engines: Object.fromEntries(['THREEJS', 'BABYLONJS', 'PHASERJS', 'UNITY', 'UNREAL', 'GODOT'].map(id =>
      [id, { ...unavailable, status: 'unavailable-until-production-bridge' }])),
    limits: 'Metadata only; build execution, resource inspection, processing, rendering and target acceptance were not run.' };
}

module.exports = { snapshot, inspect, doctor };
