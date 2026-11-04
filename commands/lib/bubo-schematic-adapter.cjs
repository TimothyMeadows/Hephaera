'use strict';

// Hephaera admits explicit host policy. Bubo owns schematics, parts, mechanisms and exports.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const runtime = require('./bubo-runtime.cjs');
const transport = require('./bubo-host-adapter.cjs');
const styles = require('./style-contract.cjs');
const engines = require('./engine-contract.cjs');
const maintenance = require('./installation-maintenance.cjs');
const transition = require('./state-transition.cjs');
const fail = message => { throw new Error(message); };
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const HASH = /^[a-f0-9]{64}$/;
const OPERATIONS = ['init', 'doctor', 'preview', 'validate', 'record', 'build-parts', 'assemble', 'prove-motion', 'export', 'review', 'status'];
const FLAGS = {
  init: ['root', 'task', 'asset', 'version', 'design', 'rights', 'budget', 'selection', 'parent-manifest'],
  doctor: ['root', 'manifest', 'blender'], preview: ['root', 'manifest'], validate: ['root', 'manifest'],
  'build-parts': ['root', 'manifest', 'blender'], assemble: ['root', 'manifest', 'blender'], 'prove-motion': ['root', 'manifest', 'blender'],
  export: ['root', 'manifest', 'blender', 'author'],
  review: ['root', 'manifest', 'blender'], record: ['root', 'manifest', 'kind', 'reviewer', 'evidence'], status: ['root', 'manifest']
};
const HOST_FLAGS = new Set(['rights', 'budget', 'selection']);
const sorted = value => JSON.stringify(runtime.canonical(value));
const equal = (left, right) => sorted(left) === sorted(right);
function shape(value, keys, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || !equal(Object.keys(value).sort(), [...keys].sort())) fail('Invalid ' + label + ' fields.');
  return value;
}
function text(value, label, maximum = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f]/.test(value)) fail('Invalid ' + label + '.');
  return value;
}
function identity(value, label) { if (!ID.test(value || '') || value === '..') fail('Invalid ' + label + ' identity.'); return value; }
function hash(value) { if (!HASH.test(value || '')) fail('An exact lowercase SHA-256 is required.'); return value; }

// JSON.parse alone loses duplicate policy keys. Walk the bounded token stream
// before parsing; native DTO validation remains entirely in Bubo.
function json(file, expectedSha256) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) fail('Policy/state JSON must be a bounded regular file.');
  const bytes = fs.readFileSync(file);
  if (bytes.length > 8 * 1024 * 1024) fail('Policy/state JSON exceeds its byte bound.');
  if (expectedSha256 !== undefined && crypto.createHash('sha256').update(bytes).digest('hex') !== hash(expectedSha256)) fail('Retained JSON input changed: ' + file);
  const source = bytes.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(bytes)) fail('Policy/state JSON must use valid UTF-8.');
  const tokens = /\s*("(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:])/y;
  let offset = 0;
  function next() { tokens.lastIndex = offset; const match = tokens.exec(source); if (!match) fail('Invalid JSON policy.'); offset = tokens.lastIndex; return match[1]; }
  function value(depth, token = next()) {
    if (depth > 64) fail('JSON policy nesting exceeds its bound.');
    if (token === '{') {
      const keys = new Set(); let key = next(); if (key === '}') return;
      while (true) {
        if (!key.startsWith('"')) fail('Invalid JSON object key.');
        const decoded = JSON.parse(key); if (keys.has(decoded)) fail('Duplicate JSON policy key: ' + decoded); keys.add(decoded);
        if (next() !== ':') fail('Invalid JSON object separator.'); value(depth + 1);
        const end = next(); if (end === '}') return; if (end !== ',') fail('Invalid JSON object separator.'); key = next();
      }
    }
    if (token === '[') {
      let entry = next(); if (entry === ']') return;
      while (true) { value(depth + 1, entry); const end = next(); if (end === ']') return; if (end !== ',') fail('Invalid JSON array separator.'); entry = next(); }
    }
    if ('{}[],:'.includes(token)) fail('Invalid JSON value.');
  }
  value(0); if (source.slice(offset).trim()) fail('Trailing JSON policy content.');
  return JSON.parse(source);
}
function parse(values) {
  const options = new Map();
  for (let index = 0; index < values.length; index++) {
    const flag = values[index];
    if (!/^--[a-z][a-z0-9-]*$/.test(flag) || options.has(flag.slice(2))) fail('Expected unique --option value arguments.');
    if (['host-context', 'api-version', 'baseline-root', 'state-root', 'staging-root', 'runtime-build-sha256', 'runtime-resource-catalog-sha256'].includes(flag.slice(2))) fail('Protected execution argument: ' + flag);
    const value = values[++index]; if (typeof value !== 'string' || !value || value.startsWith('--')) fail('Missing value for ' + flag);
    options.set(flag.slice(2), value);
  }
  return options;
}
function requireCapability(info) {
  const capability = info?.capability?.schematic;
  if (!info?.capability?.workflows?.includes('schematic-to-model') || capability?.phase !== 'portable-assembly-export'
    || ['partConstructionAvailable', 'assemblyAvailable', 'motionProofAvailable', 'requiresApprovedAssemblyV2', 'modelExportAvailable', 'humanModelAcceptanceSeparate'].some(name => capability[name] !== true)
    || capability.motionHandoffProfile !== 'mechanical-assembly'
    || !Array.isArray(capability.operations) || !equal([...capability.operations].sort(), [...OPERATIONS].sort()))
    fail('Pinned Bubo lacks the complete portable-assembly-export schematic capability; initialize/build the reviewed dependency explicitly.');
}

// Necessary Windows prerequisites for the pinned bundle's known filenames.
// This is not a certificate for every Blender/SDK internal cache path. Actual
// native QA remains required even when these fixed paths fit classic Win32.
function nativePathDiagnostics(settings, platform = process.platform) {
  const scope = 'Necessary fixed-path check only; actual native QA remains required. Blender/SDK internal paths are not completely certified.';
  const nativeOperations = ['build-parts', 'assemble', 'prove-motion', 'export', 'review'];
  if (platform !== 'win32' || ![...nativeOperations, 'doctor'].includes(settings.operation)) return { checked: false, scope, issues: [] };
  const paths = new Map(), win = path.win32, guid = '0'.repeat(32);
  const add = (kind, full, label) => {
    full = win.normalize(full);
    const key = kind + ':' + full.toLowerCase();
    if (!paths.has(key)) paths.set(key, { kind, path: full, label, characters: full.length, maximum: kind === 'file' ? 259 : 247 });
  };
  const file = (full, label) => { add('file', full, label); add('directory', win.dirname(full), label + ' parent'); };
  const full = value => win.resolve(settings.root, value);
  const stage = full(win.join(settings.staging, 'schematic-to-model', settings.asset, settings.version));
  const attempt = kind => win.join(stage, 'attempts', kind + '-' + guid);
  const temporary = directory => {
    for (const suffix of ['', 'cache', 'config', 'scripts', 'data', 'extensions', 'extensions/.cache', 'blender_000000'])
      add('directory', win.join(directory, 'temp', suffix), 'Fixed Blender temporary/user directory');
  };
  const selected = settings.operation === 'doctor' ? nativeOperations : [settings.operation];
  const parts = ['parts_author.py', 'parts_verify.py', 'parts_geometry.py', 'parts_admission.py'];
  const assembly = ['assembly_admission.py', 'assembly_author.py', 'assembly_geometry.py', 'assembly_motion.py', 'assembly_verify.py', 'parts_admission.py', 'parts_geometry.py'];
  const exports = ['export_admission.py', 'export_geometry.py', 'export_author.py', 'export_verify.py', 'export_review.py', ...assembly];
  const resourceFiles = selected.some(name => ['export', 'review'].includes(name)) ? exports
    : selected.some(name => ['assemble', 'prove-motion'].includes(name)) ? assembly : parts;
  for (const name of settings.resourceNames || []) {
    const basename = win.basename(name);
    if (resourceFiles.includes(basename) || selected.includes('build-parts') && parts.includes(basename))
      file(win.resolve(settings.publication, name), 'Audited native resource');
  }
  for (const name of settings.inputFiles || []) file(full(name), 'Declared current native input');
  if (settings.blender && win.isAbsolute(settings.blender)) file(settings.blender, 'Explicit selected native executable');
  file(win.join(stage, 'original/assembly-design.json'), 'Immutable schematic design input');
  file(win.join(stage, 'original/parent-manifest.json'), 'Immutable parent manifest input');
  const bundle = (directory, names) => { for (const name of names) file(win.join(directory, 'bundle', name), 'Immutable audited working bundle'); };
  const partSource = attempt('parts');
  if (selected.some(name => ['build-parts', 'assemble', 'prove-motion', 'export', 'review'].includes(name))) {
    for (const name of ['job.json', 'output/parts-report.json', 'output/parts-verification.json']) file(win.join(partSource, name), 'Independent parts input/output');
    for (const id of settings.partIds || ['P'.repeat(80)])
      for (const suffix of ['.blend', '.geometry.bin']) file(win.join(partSource, 'output', id + suffix), 'Independent part definition artifact');
    if (selected.includes('build-parts')) {
      for (const name of ['version.log', 'author.log', 'verification.log']) file(win.join(partSource, name), 'Bounded parts execution log');
      bundle(partSource, parts); temporary(partSource);
    }
  }
  for (const operation of ['assemble', 'prove-motion']) {
    if (!selected.some(name => [operation, 'export', 'review'].includes(name)) && !(operation === 'assemble' && selected.includes('prove-motion'))) continue;
    const stem = operation === 'assemble' ? 'assembly' : 'motion', directory = attempt(stem);
    for (const name of ['job.json', 'native-verification.json', 'native-failure.json', 'version.log', 'author.log', 'verification.log']) file(win.join(directory, name), 'Assembly/readiness attempt');
    for (const name of [operation === 'assemble' ? 'assembly.blend' : 'diagnostic.blend', stem + '-report.json', stem + '-verification.json', 'rest.000000.geometry.bin'])
      file(win.join(directory, 'output', name), 'Assembly/readiness output');
    if (operation === 'prove-motion') file(win.join(directory, 'output/clip.000000.sample.000000.000000.geometry.bin'), 'Every sampled physical instance geometry');
    bundle(directory, assembly); temporary(directory);
  }
  if (selected.includes('export') || selected.includes('review')) {
    const directory = attempt('export');
    file(win.join(directory, 'version.log'), 'Bounded export version log'); file(win.join(directory, 'technical-review.json'), 'Separate technical export decision');
    for (const name of ['package.json', 'assembly.blend', 'assembly.glb', 'assembly-design.json', 'assembly-metadata.json', 'bom.json',
      'diagnostic-motion/diagnostic.blend', 'diagnostic-motion/diagnostic.glb', 'diagnostic-motion/diagnostic-motion.json',
      'provenance/design-approval.json', 'provenance/parts-job.json', 'provenance/parts-report.json', 'provenance/parts-verification.json',
      'provenance/assembly-job.json', 'provenance/assembly-report.json', 'provenance/assembly-native-verification.json',
      'provenance/motion-job.json', 'provenance/motion-report.json', 'provenance/motion-native-verification.json'])
      file(win.join(directory, 'package', name), 'Sealed export payload');
    for (const name of settings.drawingNames || []) file(win.join(directory, 'package/drawings', name), 'Approved drawing payload');
    for (const child of ['produce', 'verify-rest', 'verify-diagnostic']) {
      const owned = win.join(directory, child);
      for (const name of ['job.json', 'native.log', 'native-verification.json', 'output/report.json']) file(win.join(owned, name), 'Independent export attempt');
      if (child === 'produce') for (const name of ['assembly.glb', 'diagnostic.glb']) file(win.join(owned, 'output', name), 'Separate canonical/diagnostic GLB');
      else for (const prefix of ['raw', 'imported']) {
        for (const suffix of ['geometry.bin', 'weights.bin']) file(win.join(owned, 'output', prefix + '.rest.000000.' + suffix), 'Measured portable geometry/skin');
        if (child === 'verify-diagnostic') file(win.join(owned, 'output', prefix + '.clip.000000.sample.000000.000000.geometry.bin'), 'Every independently imported diagnostic sample');
      }
      bundle(owned, exports); temporary(owned);
    }
  }
  if (selected.includes('review')) {
    const directory = win.join(attempt('export-review'), 'review');
    for (const name of ['job.json', 'native.log', 'native-verification.json', 'output/report.json', 'output/review.json']) file(win.join(directory, name), 'Complete model review attempt');
    for (const name of ['exterior.000000.png', 'section.000000.png', 'exploded.000000.png', 'diagnostic.000000.000000.png']) file(win.join(directory, 'output', name), 'Complete delivered-geometry review');
    bundle(directory, exports); temporary(directory);
  }
  if (settings.operation === 'doctor') { const doctor = attempt('parts-doctor'); file(win.join(doctor, 'version.log'), 'Explicit parts doctor probe'); temporary(doctor); }
  const candidates = [...paths.values()];
  return { checked: true, scope, limits: { fileCharacters: 259, directoryCharacters: 247 }, candidateCount: candidates.length,
    issues: candidates.filter(item => item.characters > item.maximum) };
}
function pathUnavailable(diagnostics, withheldBlender = null) {
  const first = diagnostics.issues[0];
  return `Windows native path prerequisite unavailable: ${first.label} is ${first.characters} UTF-16 characters (maximum ${first.maximum}): ${first.path}. Choose a shorter project path or task/asset/version names. ${withheldBlender ? 'The explicit Blender selection was withheld; no Blender version/SDK probe was run: ' + withheldBlender + '. ' : 'No Blender version/SDK probe was run. '}${diagnostics.scope}`;
}
function doctorData(data, diagnostics, withheldBlender) {
  const result = structuredClone(data), reason = pathUnavailable(diagnostics, withheldBlender);
  if (!Array.isArray(result?.unavailable) || !Array.isArray(result?.assembly?.unavailable) || !Array.isArray(result?.export?.unavailable)) fail('Native doctor response does not support host prerequisite diagnostics.');
  result.unavailable.push(reason); result.nativeReadiness = 'unverified';
  result.assembly.unavailable.push(reason); result.assembly.nativeReadiness = 'unverified';
  result.export.unavailable.push(reason); result.export.nativeReadiness = 'unverified';
  return result;
}
function contextFor(operation, options, info) {
  if (!Object.hasOwn(FLAGS, operation)) fail('Unsupported schematic operation.');
  for (const flag of options.keys()) if (!FLAGS[operation].includes(flag)) fail('Unknown or inapplicable schematic flag: --' + flag);
  requireCapability(info);
  const need = name => options.get(name) || fail('Missing --' + name);
  const rootArgument = runtime.native(need('root'));
  if (!path.isAbsolute(rootArgument)) fail('An explicit absolute project --root is required.');
  runtime.syntax(rootArgument); const root = path.resolve(rootArgument); runtime.components(root);
  if (!fs.statSync(root).isDirectory()) fail('Project root must be an existing real directory.');
  const relative = value => path.relative(root, runtime.projectPath(root, value)).split(path.sep).join('/');
  const references = new Map(), referenceNames = new Map();
  function reference(value, kind, expected) {
    const file = runtime.projectPath(root, value), name = relative(file);
    if (mutableFiles.some(current => runtime.samePath(runtime.projectPath(root, current), file))) fail('Mutable native state cannot be reclassified as a read-only input.');
    if (!fs.statSync(file).isFile()) fail('Referenced input must be a regular file: ' + name);
    const key = process.platform === 'win32' ? file.toLowerCase() : file;
    const alias = referenceNames.get(key);
    if (alias !== undefined && alias !== name) fail('Case aliases cannot duplicate a referenced file: ' + name);
    const actual = runtime.hash(file); if (expected !== undefined && actual !== hash(expected)) fail('Retained input changed: ' + name);
    const previous = references.get(name);
    if (previous && previous.sha256 !== actual) fail('Input changed during admission: ' + name);
    references.set(name, { path: name, sha256: actual, kind: previous?.kind === 'policy' ? 'policy' : kind });
    referenceNames.set(key, name);
    if (references.size > 4096) fail('Schematic host reference bound exceeded.');
    return { path: name, sha256: actual };
  }
  function inputRecord(value, kind = 'policy') {
    shape(value, ['path', 'sha256'], 'file reference');
    return reference(text(value.path, 'file reference path', 512), kind, value.sha256);
  }
  let task, asset, version, manifest, state = null;
  if (operation === 'init') {
    task = identity(need('task'), 'task'); asset = identity(need('asset'), 'asset'); version = identity(need('version'), 'version');
    manifest = `.hephaera/.cache/tasks/${task}/schematic-to-model/${asset}/${version}/manifest.json`;
    if (fs.existsSync(runtime.projectPath(root, manifest))) fail('Design version already exists; preserve it and use an explicit new version.');
  } else {
    manifest = relative(need('manifest'));
    const match = manifest.match(/^\.hephaera\/\.cache\/tasks\/([^/]+)\/schematic-to-model\/([^/]+)\/([^/]+)\/manifest\.json$/);
    if (!match) fail('Manifest must use the canonical task-owned schematic layout.');
    [, task, asset, version] = match; identity(task, 'task'); identity(asset, 'asset'); identity(version, 'version');
    state = json(runtime.projectPath(root, manifest));
    if (state.schemaVersion !== 'bubo-schematic-design/v1' || state.task !== task || state.asset !== asset || state.version !== version)
      fail('Manifest/task/asset/version ownership mismatch.');
  }
  const stateRoot = '.hephaera/.cache/tasks/' + task, staging = '.art-staging/tasks/' + task;
  const policyPath = path.posix.join(path.posix.dirname(manifest), 'host-policy.json');
  const mutableFiles = [manifest, ...['parts.json', 'assembly.json', 'exports.json'].map(name => path.posix.join(path.posix.dirname(manifest), name))];
  runtime.projectPath(root, stateRoot); runtime.projectPath(root, staging);
  const inTask = value => { const name = relative(value); if (!name.startsWith(stateRoot + '/')) fail('Review/selection evidence must stay in the active task.'); return name; };
  const policyFile = runtime.projectPath(root, policyPath);
  const sourceStyle = reference('STYLE.md', 'policy');
  const style = styles.validate(runtime.projectPath(root, 'STYLE.md'));
  if (style.sha256 !== sourceStyle.sha256) fail('STYLE.md changed during admission.');
  const engine = engines.resolve(root);
  if (engine.outputScope || engine.selectionSource === 'prompt') fail('Schematic production does not accept a prototype engine override.');
  const libraries = style.libraries.map(item => ({ id: item.id, root: item.path }));
  const runtimeIdentity = { revision: info.pinned.revision, resourceCatalogSha256: info.pinned.resourceCatalogSha256,
    buildReceiptSha256: runtime.hash(path.join(info.folder, 'build-info.json')) };
  let envelope;
  if (operation === 'init') {
    const design = reference(need('design'), 'input'), rights = reference(need('rights'), 'policy'), budget = reference(need('budget'), 'policy');
    for (const item of [design, rights, budget]) if (item.path.startsWith(path.posix.dirname(manifest) + '/') || item.path.startsWith(staging + '/')) fail('Original policy/design inputs cannot be this workflow\'s output.');
    const policyRights = json(runtime.projectPath(root, rights.path), rights.sha256);
    shape(policyRights, ['schemaVersion', 'designSha256', 'status', 'rightsHolder', 'scope', 'evidence', 'referenceInputs'], 'schematic rights');
    if (policyRights.schemaVersion !== 'hephaera-schematic-rights/v1' || policyRights.scope !== 'schematic-to-model' || policyRights.designSha256 !== design.sha256)
      fail('Rights must identify this exact design and schematic-to-model purpose.');
    function rightsInputs(item) {
      if (!['owned', 'licensed'].includes(item.status)) fail('Rights status must be owned or licensed.');
      text(item.rightsHolder, 'rights holder');
      if (!Array.isArray(item.evidence) || item.evidence.length > 256 || (item.status === 'licensed' && !item.evidence.length)) fail('Licensed inputs require exact local rights evidence.');
      for (const entry of item.evidence) inputRecord(entry);
    }
    rightsInputs(policyRights);
    if (!Array.isArray(policyRights.referenceInputs) || policyRights.referenceInputs.length > 256) fail('Invalid bounded referenceInputs array.');
    for (const item of policyRights.referenceInputs) {
      shape(item, ['path', 'sha256', 'status', 'rightsHolder', 'evidence'], 'reference input rights'); rightsInputs(item);
      reference(text(item.path, 'reference input path', 512), 'policy', item.sha256);
    }
    const budgetValue = json(runtime.projectPath(root, budget.path), budget.sha256);
    shape(budgetValue, ['schemaVersion', 'timeoutSeconds', 'maxLogBytes', 'maxPrivateBytes'], 'schematic budget');
    if (budgetValue.schemaVersion !== 'hephaera-schematic-budget/v1') fail('Unsupported schematic budget schema.');
    const budgets = { timeoutSeconds: budgetValue.timeoutSeconds, maxLogBytes: budgetValue.maxLogBytes, maxPrivateBytes: budgetValue.maxPrivateBytes };
    validateBudgets(budgets);
    let selectionFile = null, selected;
    if (options.has('selection')) {
      selectionFile = reference(inTask(options.get('selection')), 'policy');
      selected = selection(json(runtime.projectPath(root, selectionFile.path), selectionFile.sha256), sourceStyle.sha256, style);
    } else selected = styles.resolve(root, sourceStyle.path, {}, style);
    if (selected.pipeline !== 'SCHEMATIC_TO_MODEL') fail('Select SCHEMATIC_TO_MODEL explicitly; no visual pipeline fallback occurred.');
    for (const name of ['ENGINE.md', 'ARCHITECTURE.md']) if (fs.existsSync(path.join(root, name))) reference(name, 'policy');
    for (const name of ['.engine/registry.json', '.engine/' + engine.projectEngine + '.md']) {
      const file = path.join(runtime.BASE, name); if (runtime.within(root, file)) reference(file, 'policy');
    }
    envelope = { schemaVersion: 'hephaera-schematic-host-policy/v1', task, asset, version, manifest, design, rights, budget,
      selection: { pipeline: selected.pipeline, selectionSource: selected.selectionSource, styleContract: 'STYLE.md', styleSha256: sourceStyle.sha256, fallbackPolicy: 'stop' },
      selectionFile, engine, libraries, budgets, runtime: runtimeIdentity,
      policyReferences: [...references.values()].filter(item => item.kind === 'policy').map(({ path: name, sha256 }) => ({ path: name, sha256 })) };
    if (references.has(policyPath)) fail('The immutable host envelope cannot reference itself.');
    if (new Set([...envelope.policyReferences.map(item => item.path), policyPath]).size > 128) fail('Native schematic policyInputs permits at most 128 unique policy references including the immutable host envelope.');
    const bytes = JSON.stringify(envelope, null, 2) + '\n';
    if (Buffer.byteLength(bytes, 'utf8') > 8 * 1024 * 1024) fail('Immutable schematic host policy exceeds its bounded 8 MiB JSON contract.');
    if (fs.existsSync(policyFile)) {
      if (fs.readFileSync(policyFile, 'utf8') !== bytes) fail('Existing immutable host policy differs; preserve it and use a new version.');
    } else {
      fs.mkdirSync(path.dirname(policyFile), { recursive: true }); runtime.components(policyFile);
      fs.writeFileSync(policyFile, bytes, { flag: 'wx' });
    }
  } else {
    if (!state.policyInputs || !HASH.test(state.policyInputs[policyPath] || '')) fail('Missing retained immutable host policy identity.');
    envelope = json(policyFile, state.policyInputs[policyPath]);
    shape(envelope, ['schemaVersion', 'task', 'asset', 'version', 'manifest', 'design', 'rights', 'budget', 'selection', 'selectionFile', 'engine', 'libraries', 'budgets', 'runtime', 'policyReferences'], 'immutable host policy');
    if (envelope.schemaVersion !== 'hephaera-schematic-host-policy/v1' || envelope.task !== task || envelope.asset !== asset || envelope.version !== version || envelope.manifest !== manifest)
      fail('Immutable host policy ownership differs.');
    if (!equal(envelope.runtime, runtimeIdentity) || !equal(envelope.engine, engine) || !equal(envelope.libraries, libraries)) fail('Native/engine/library identity changed; initialize a new design version with retained ancestry.');
    validateBudgets(envelope.budgets);
    if (!Array.isArray(envelope.policyReferences) || envelope.policyReferences.length > 127 || new Set(envelope.policyReferences.map(item => item?.path)).size !== envelope.policyReferences.length)
      fail('Invalid bounded native schematic policy reference inventory (maximum 128 including host envelope).');
    for (const item of envelope.policyReferences) inputRecord(item);
    inputRecord(envelope.rights); inputRecord(envelope.budget); inputRecord(envelope.design, 'input');
    const selected = selection(envelope.selection, sourceStyle.sha256, style);
    if (envelope.selectionFile) { inputRecord(envelope.selectionFile); const current = selection(json(runtime.projectPath(root, envelope.selectionFile.path), envelope.selectionFile.sha256), sourceStyle.sha256, style); if (!equal(current, selected)) fail('Retained pipeline selection differs.'); }
    else if (selected.selectionSource !== 'style') fail('Prompt selection requires its exact retained task evidence.');
    const expectedPolicy = Object.fromEntries([...references.values()].filter(item => item.kind === 'policy').map(item => [item.path, item.sha256]));
    expectedPolicy[policyPath] = runtime.hash(policyFile);
    if (!equal(state.policyInputs, expectedPolicy)) fail('Retained host policy inventory changed.');
    if (state.sourceDesign !== envelope.design.path || state.designSha256 !== envelope.design.sha256 || state.styleSha256 !== sourceStyle.sha256 || state.staging !== `${staging}/schematic-to-model/${asset}/${version}`)
      fail('Manifest source/style/staging ownership differs.');
    reference(state.originalDesign, 'input', state.designSha256);
    if (state.parentSnapshot) reference(state.parentSnapshot, 'input', state.parentSha256);
  }
  reference(policyPath, 'policy');
  for (const item of references.values()) if (mutableFiles.some(name => runtime.samePath(runtime.projectPath(root, name), runtime.projectPath(root, item.path)))) fail('Mutable native state cannot be reclassified as a read-only input.');
  const nativeOptions = new Map([...options].filter(([name]) => !HOST_FLAGS.has(name)));
  nativeOptions.set('root', root);
  if (operation !== 'init') nativeOptions.set('manifest', manifest);
  if (options.has('parent-manifest')) {
    const parent = inTask(options.get('parent-manifest'));
    const match = parent.match(new RegExp('^' + escape(stateRoot) + '/schematic-to-model/' + escape(asset) + '/([^/]+)/manifest\\.json$'));
    if (!match || match[1] === version) fail('Parent must be another version of this task-owned asset.');
    reference(parent, 'input'); nativeOptions.set('parent-manifest', parent);
  }
  if (operation === 'record') {
    if (!['whole-assembly-design', 'independent-model', 'human-model'].includes(need('kind'))) fail('Unsupported schematic review kind.');
    text(need('reviewer'), 'reviewer'); const evidence = inTask(need('evidence'));
    reference(evidence, 'review'); nativeOptions.set('evidence', evidence);
  }
  let drawingNames = [], inputFiles = [], partIds = [];
  const ownAttempt = (value, kind) => {
    const directory = relative(text(value, 'native attempt directory', 1024));
    const prefix = `${staging}/schematic-to-model/${asset}/${version}/attempts/${kind}-`;
    if (!directory.startsWith(prefix) || !/^[a-f0-9]{32}$/.test(directory.slice(prefix.length))) fail('Current native attempt escapes its canonical task-owned scope.');
    return directory;
  };
  if (state && ['build-parts', 'assemble', 'prove-motion', 'export', 'review', 'doctor'].includes(operation)) {
    const design = json(runtime.projectPath(root, state.originalDesign), state.designSha256);
    if (design.parts !== undefined) {
      if (!Array.isArray(design.parts) || design.parts.length > 4096) fail('Invalid bounded schematic part path inventory.');
      partIds = design.parts.map(item => identity(item?.id, 'part definition'));
    }
  }
  if (['export', 'review', 'doctor'].includes(operation) && state?.previews?.at(-1)?.status === 'complete') {
    const preview = state.previews.at(-1), directory = ownAttempt(preview.directory, 'preview'), index = runtime.projectPath(root, path.posix.join(directory, 'preview-index.json'));
    const packageIndex = json(index, preview.indexSha256);
    if (packageIndex.schemaVersion !== 'bubo-schematic-preview/v1' || !packageIndex.artifacts || typeof packageIndex.artifacts !== 'object'
      || Array.isArray(packageIndex.artifacts) || Object.keys(packageIndex.artifacts).length > 8192) fail('Invalid bounded approved schematic drawing path inventory.');
    drawingNames = Object.keys(packageIndex.artifacts);
    for (const name of drawingNames) {
      runtime.syntax(name); if (name.includes('/') || name.includes('\\')) fail('Approved drawing paths must be local filenames.');
      inputFiles.push(relative(preview.directory + '/' + name));
    }
  }
  if (operation === 'review') {
    const exportsFile = runtime.projectPath(root, path.posix.join(path.posix.dirname(manifest), 'exports.json'));
    if (fs.existsSync(exportsFile)) {
      const exports = json(exportsFile);
      if (exports.schemaVersion !== 'bubo-schematic-export-state/v1' || exports.task !== task || exports.asset !== asset || exports.version !== version
        || exports.manifest !== manifest || !Array.isArray(exports.attempts) || exports.attempts.length > 256) fail('Invalid current schematic export path inventory.');
      const exported = exports.attempts.findLast(attempt => attempt.operation === 'export');
      if (exported?.status === 'complete') {
        const packageDirectory = ownAttempt(exported.directory, 'export') + '/package';
        const packagePath = relative(packageDirectory + '/package.json');
        const sealed = json(runtime.projectPath(root, packagePath), exported.packageSha256);
        if (sealed.schemaVersion !== 'bubo-schematic-export-package/v1' || sealed.task !== task || sealed.asset !== asset || sealed.version !== version
          || !Array.isArray(sealed.files) || sealed.files.length > 16384) fail('Invalid bounded sealed native path inventory.');
        inputFiles.push(packagePath);
        for (const entry of sealed.files) {
          const name = relative(packageDirectory + '/' + text(entry.path, 'sealed native input path', 512));
          if (!runtime.within(runtime.projectPath(root, packageDirectory), runtime.projectPath(root, name))) fail('Declared native input escapes its sealed package.');
          inputFiles.push(name);
        }
      }
    }
  }
  const resourceNames = Object.keys(info.catalog?.files || {}).filter(name => name.startsWith('resources/schematic-to-model/blender/') && name.endsWith('.py'));
  const pathDiagnostics = nativePathDiagnostics({ root, task, staging, asset, version, publication: info.folder, resourceNames, drawingNames, inputFiles, partIds,
    blender: options.has('blender') ? runtime.native(options.get('blender')) : null, operation });
  let withheldBlender = null;
  if (pathDiagnostics.issues.length) {
    if (operation !== 'doctor') fail(pathUnavailable(pathDiagnostics));
    withheldBlender = options.get('blender') || null;
    nativeOptions.delete('blender');
  }
  const tools = [];
  function tool(value, expected) {
    value = runtime.native(text(value, 'Blender executable', 1024));
    if (!path.isAbsolute(value)) fail('Select an explicit absolute existing Blender executable; no PATH discovery is performed.');
    runtime.syntax(value); const file = path.resolve(value); runtime.components(file);
    if (!fs.statSync(file).isFile()) fail('Selected Blender must be a regular existing file.');
    for (const directory of [stateRoot, staging]) if (runtime.within(runtime.projectPath(root, directory), file)) fail('Native tools cannot overlap workflow state or staging.');
    const sha256 = runtime.hash(file); if (expected !== undefined && sha256 !== hash(expected)) fail('Retained Blender executable changed; do not adopt a new tool identity.');
    const prior = tools.find(item => runtime.samePath(item.path, file));
    if (prior && prior.sha256 !== sha256) fail('Native tool changed during admission.');
    if (!prior) tools.push({ path: file, sha256, kind: 'selected-native-tool' });
    return file;
  }
  let retainedTool = null;
  // Pure design and doctor never adopt a previous modeling executable.
  const usesConstruction = ['build-parts', 'assemble', 'prove-motion', 'export', 'review', 'status'].includes(operation)
    || operation === 'record' && options.get('kind') !== 'whole-assembly-design';
  if (state && usesConstruction) {
    for (const [file, schema, maximum] of [['parts.json', 'bubo-schematic-parts-state/v1', 128], ['assembly.json', 'bubo-schematic-assembly-state/v1', 128], ['exports.json', 'bubo-schematic-export-state/v1', 256]]) {
      const currentFile = runtime.projectPath(root, path.posix.join(path.posix.dirname(manifest), file));
      if (!fs.existsSync(currentFile)) continue;
      const current = json(currentFile);
      if (current.schemaVersion !== schema || current.task !== task || current.asset !== asset || current.version !== version
        || (file === 'exports.json' ? current.manifest : current.designManifest) !== manifest
        || (file === 'assembly.json' ? current.runtimeBuildSha256 : current.runtimeSha256) !== state.runtimeBuildSha256
        || !Array.isArray(current.attempts) || current.attempts.length > maximum)
        fail('Retained schematic ' + file + ' identity differs.');
      const latest = file === 'parts.json' ? current.attempts.at(-1) : current.attempts.findLast(attempt => attempt.operation === (file === 'assembly.json' ? 'assemble' : 'export'));
      if (!latest) continue;
      ownAttempt(latest.directory, file === 'parts.json' ? 'parts' : file === 'assembly.json' ? 'assembly' : 'export');
      const selected = file === 'parts.json' ? { path: latest.toolPath, sha256: latest.toolSha256 }
        : file === 'assembly.json' ? { path: latest.toolPath, sha256: latest.identity?.toolSha256 }
          : { path: latest.toolchain?.blenderPath, sha256: latest.toolchain?.blenderSha256 };
      const actual = { path: tool(selected.path, hash(selected.sha256)), sha256: selected.sha256 };
      if (retainedTool && (!runtime.samePath(retainedTool.path, actual.path) || retainedTool.sha256 !== actual.sha256)) fail('Retained schematic native stages disagree on the selected Blender identity.');
      retainedTool = actual;
    }
  }
  if (['build-parts', 'assemble', 'prove-motion', 'export', 'review'].includes(operation)) need('blender');
  if (nativeOptions.has('blender')) {
    const selected = tool(options.get('blender'), retainedTool?.sha256);
    if (retainedTool && !runtime.samePath(retainedTool.path, selected)) fail('Selected Blender differs from this version\'s retained parts/assembly tool.');
    nativeOptions.set('blender', selected);
  }
  if (operation === 'export') text(need('author'), 'model author');
  for (const item of tools) if (runtime.within(root, item.path) && references.has(relative(item.path))) fail('A native tool cannot also be a policy/input reference.');
  const inputs = runtime.within(root, info.folder) ? [relative(info.folder)] : [];
  const context = { schemaVersion: 'bubo-host-context/v1', projectRoot: root, task,
    roots: { state: stateRoot, staging, tools: [], inputs, outputs: [] },
    policy: { pipeline: 'SCHEMATIC_TO_MODEL', styleSha256: sourceStyle.sha256, engine, libraries },
    references: [...references.values()], tools, budgets: envelope.budgets,
    permissions: { provisioning: false, promotion: false } };
  return { root, task, stateRoot, context, options: nativeOptions, envelope, policyPath, pathDiagnostics, withheldBlender };
}
function escape(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function validateBudgets(value) {
  shape(value, ['timeoutSeconds', 'maxLogBytes', 'maxPrivateBytes'], 'native budgets');
  for (const [name, low, high] of [['timeoutSeconds', 1, 86400], ['maxLogBytes', 1024, 1073741824], ['maxPrivateBytes', 67108864, 68719476736]])
    if (!Number.isSafeInteger(value[name]) || value[name] < low || value[name] > high) fail('Invalid finite schematic budget: ' + name);
}
function selection(value, styleSha256, style) {
  if (!value || value.schemaVersion !== undefined && value.schemaVersion !== 1 || value.pipeline !== 'SCHEMATIC_TO_MODEL'
    || !['prompt', 'style'].includes(value.selectionSource) || value.styleContract !== 'STYLE.md' || value.styleSha256 !== styleSha256 || value.fallbackPolicy !== 'stop'
    || value.styleContractHash !== undefined && value.styleContractHash !== styleSha256 || value.selectionSource === 'style' && style.primary !== 'SCHEMATIC_TO_MODEL')
    fail('Pipeline selection is stale, inconsistent or not SCHEMATIC_TO_MODEL.');
  return { pipeline: value.pipeline, selectionSource: value.selectionSource, styleContract: value.styleContract, styleSha256, fallbackPolicy: 'stop' };
}
async function invoke(operation, options, emit = true) {
  const selectedRoot = runtime.native(options.get('root') || fail('Explicit --root is required.'));
  return maintenance.run(path.resolve(selectedRoot), async () => {
    // Admission creates an immutable policy envelope at init. Check the state
    // transition fence before that first write, as well as in shared dispatch.
    transition.assertProductionAllowed(path.resolve(selectedRoot), 'schematic-to-model ' + operation);
    const started = performance.now(), info = runtime.verified(), admitted = performance.now();
    const prepared = contextFor(operation, options, info);
    prepared.timings = { runtimeAdmissionMilliseconds: admitted - started, hostPolicyMilliseconds: performance.now() - admitted };
    if (operation !== 'doctor' || !prepared.pathDiagnostics.issues.length) return transport.execute('schematic-to-model', operation, prepared.options, prepared, info, emit);
    const result = await transport.execute('schematic-to-model', operation, prepared.options, prepared, info, false);
    const data = doctorData(result.data, prepared.pathDiagnostics, prepared.withheldBlender);
    // Keep the raw native dispatch receipt unchanged. This separate task-local
    // host receipt explains why an explicit tool was not passed to that dispatch.
    const folder = runtime.projectPath(prepared.root, prepared.stateRoot + '/schematic-host-doctor');
    fs.mkdirSync(folder, { recursive: true }); runtime.components(folder);
    fs.writeFileSync(path.join(folder, crypto.randomUUID() + '.json'), JSON.stringify({ schemaVersion: 'hephaera-schematic-host-doctor/v1',
      nativeHostContextSha256: result.hostContextSha256, selectedBlender: prepared.withheldBlender, nativeToolProbed: false,
      diagnostics: prepared.pathDiagnostics }, null, 2) + '\n', { flag: 'wx' });
    if (emit) console.log(JSON.stringify(data));
    return { ...result, data };
  });
}
const usage = 'schematic-to-model.sh <init|doctor|preview|validate|record|build-parts|assemble|prove-motion|export|review|status> --root PROJECT [options]\nInit: --task ID --asset ID --version ID --design JSON --rights JSON --budget JSON [--selection TASK_JSON] [--parent-manifest JSON]\nContinue: --manifest TASK_JSON. Native build-parts/assemble/prove-motion/export/review require --blender ABSOLUTE_EXISTING_EXECUTABLE; export also --author ID. Record: --kind whole-assembly-design|independent-model|human-model --reviewer ID --evidence TASK_JSON.\nRights: hephaera-schematic-rights/v1; budget: hephaera-schematic-budget/v1. See commands/BUBO_ARGUMENTS.md. No installation, generation, human acceptance or asset promotion is implicit.';
async function main(values) {
  if (!values.length || values.length === 1 && ['help', '--help', '-h'].includes(values[0])) { console.log(usage); return; }
  const [operation, ...args] = values; await invoke(operation, parse(args));
}
module.exports = { parse, requireCapability, contextFor, invoke, main, validateBudgets, json, nativePathDiagnostics, doctorData };
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
