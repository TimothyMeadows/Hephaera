'use strict';

// Host policy/ownership only. Bubo owns DTO rules, setup, Gaussian parsing and inference.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const runtime = require('./bubo-runtime.cjs');
const transport = require('./bubo-host-adapter.cjs');
const media = require('./bubo-media-adapter.cjs');
const styles = require('./style-contract.cjs');
const engines = require('./engine-contract.cjs');
const maintenance = require('./installation-maintenance.cjs');
const transition = require('./state-transition.cjs');
const CACHE = '.hephaera/.cache', SHA = /^[a-f0-9]{64}$/, ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const OPERATIONS = ['inspect', 'validate', 'setup', 'provision', 'generate', 'verify-package'];
const FLAGS = new Set(['root', 'task', 'request', 'workspace', 'media-state', 'media', 'selection', 'platform-modules', 'ledger-registration', 'timeout', 'max-log-bytes', 'max-private-bytes', 'execute']);
const ROOT_BINDING = CACHE + '/local-media/image-to-splat/shared-root.json';
const fail = message => { throw new Error(message); };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(runtime.canonical(value));
const overlap = (a, b) => runtime.within(a, b) || runtime.within(b, a);

function parse(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index++) {
    const flag = values[index], key = flag.slice(2);
    if (!/^--[a-z][a-z-]*$/.test(flag) || !FLAGS.has(key) || result.has(key)) fail('Unknown, protected or duplicate splat option: ' + flag);
    const value = key === 'execute' && (index + 1 === values.length || values[index + 1].startsWith('--')) ? 'true' : values[++index];
    if (typeof value !== 'string' || !value || value.startsWith('--')) fail('Missing value for ' + flag);
    if (key === 'execute' && value !== 'true') fail('--execute accepts only true; omit it for dry-run.');
    result.set(key, value);
  }
  return result;
}

// Strict bounded policy parsing prevents duplicate fields, rounded integers and
// changed descriptors from deciding admission before native DTO validation.
function boundedBytes(file, maximum, expected) {
  runtime.components(file);
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 2 || before.size > maximum) fail('Expected a bounded regular splat JSON document.');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  let bytes;
  try {
    const opened = fs.fstatSync(fd), signature = item => [item.dev, item.ino, item.size, item.mtimeMs, item.ctimeMs].join(':');
    if (!opened.isFile() || signature(opened) !== signature(before)) fail('Splat JSON changed before reading.');
    const buffer = Buffer.alloc(opened.size + 1); let length = 0, read;
    while ((read = fs.readSync(fd, buffer, length, buffer.length - length, null))) { length += read; if (length > opened.size) fail('Splat JSON grew while reading.'); }
    if (length !== opened.size || signature(fs.fstatSync(fd)) !== signature(opened) || signature(fs.lstatSync(file)) !== signature(opened)) fail('Splat JSON changed while reading.');
    bytes = buffer.subarray(0, length);
  } finally { fs.closeSync(fd); }
  if (expected !== undefined && digest(bytes) !== expected) fail('Typed splat JSON identity changed.');
  return bytes;
}
function document(file, maximum = 1048576, expected) {
  const bytes = boundedBytes(file, maximum, expected);
  const source = bytes.toString('utf8');
  if (!Buffer.from(source).equals(bytes)) fail('Splat JSON must use valid UTF-8.');
  const tokens = /\s*("(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:])/y;
  let offset = 0;
  function next() { tokens.lastIndex = offset; const match = tokens.exec(source); if (!match) fail('Malformed splat JSON.'); offset = tokens.lastIndex; return match[1]; }
  function visit(depth, token = next()) {
    if (depth > 64) fail('Splat JSON nesting bound exceeded.');
    if (token === '{') {
      const keys = new Set(); let key = next(); if (key === '}') return;
      while (true) {
        if (!key.startsWith('"')) fail('Malformed splat JSON object.');
        const name = JSON.parse(key); if (keys.has(name)) fail('Duplicate splat JSON field: ' + name); keys.add(name);
        if (next() !== ':') fail('Malformed splat JSON separator.'); visit(depth + 1);
        const end = next(); if (end === '}') return; if (end !== ',') fail('Malformed splat JSON separator.'); key = next();
      }
    }
    if (token === '[') { let value = next(); if (value === ']') return; while (true) { visit(depth + 1, value); const end = next(); if (end === ']') return; if (end !== ',') fail('Malformed splat JSON array.'); value = next(); } }
    if ('{}[],:'.includes(token)) fail('Malformed splat JSON value.');
    if (/^-?\d/.test(token)) { const value = Number(token); if (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)) fail('Splat JSON numbers must retain exact finite host values.'); }
  }
  visit(0); if (source.slice(offset).trim()) fail('Trailing splat JSON content.');
  const value = JSON.parse(source); if (!value || Array.isArray(value) || typeof value !== 'object') fail('Splat JSON must be an object.');
  return value;
}

function bounded(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail('Explicit finite ' + label + ' bound required.');
  return value;
}
function executionBudgets(options, requested) {
  const timeoutSeconds = bounded(Number(options.get('timeout') ?? requested?.timeoutSeconds ?? 1800), 'timeout', 86400);
  const maxLogBytes = bounded(Number(options.get('max-log-bytes') ?? requested?.maxLogBytes ?? 16777216), 'log bytes', 1073741824);
  const privateValue = options.get('max-private-bytes') ?? requested?.maxProcessMemoryBytes;
  const result = { timeoutSeconds, maxLogBytes, ...(privateValue !== undefined ? { maxPrivateBytes: bounded(Number(privateValue), 'committed-memory') } : {}) };
  if (requested && (requested.timeoutSeconds > timeoutSeconds || requested.maxLogBytes > maxLogBytes || requested.maxProcessMemoryBytes > result.maxPrivateBytes)) fail('Host process bounds cannot be smaller than the selected native request.');
  return result;
}

function requireCapability(info) {
  const value = info?.capability?.splats;
  if (!info?.capability?.workflows?.includes('image-to-splat') || !value || value.generationAvailable !== true || value.provisioningExecutionAvailable !== true
      || !Array.isArray(value.operations) || OPERATIONS.some(name => !value.operations.includes(name))) fail('Verified Bubo lacks the reviewed image-to-splat execution boundary.');
}
function bindingPath(root, hash) { return runtime.projectPath(root, CACHE + '/local-media/acceptance-roots/' + hash + '.json'); }
function compareBinding(file, expected) {
  if (fs.existsSync(file) && canonical(document(file)) !== canonical(expected)) fail('The retained project-shared splat root cannot change with task, approval or workspace; explicit reviewed migration is required.');
}
function appendReference(prepared, file) {
  const value = { path: path.relative(prepared.root, file).split(path.sep).join('/'), sha256: runtime.hash(file), kind: 'policy' };
  const old = prepared.context.references.find(item => item.path === value.path);
  if (old && canonical(old) !== canonical(value)) fail('Conflicting shared-root policy reference.');
  if (!old) prepared.context.references.push(value);
  return value;
}
function ledgerDecision(root, mediaState, registration, forbidden = []) {
  const relative = file => path.relative(root, file).split(path.sep).join('/');
  function exactFile(identity) {
    if (!identity || typeof identity !== 'object' || Array.isArray(identity) || Object.keys(identity).sort().join(',') !== 'path,sha256'
        || typeof identity.path !== 'string' || !SHA.test(identity.sha256 || '')) fail('Exact ledger-registration/evidence file identity required.');
    const file = runtime.projectPath(root, identity.path), stat = fs.lstatSync(file);
    if (identity.path !== relative(file) || !stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 1048576
        || forbidden.some(scope => runtime.within(scope, file)) || runtime.hash(file) !== identity.sha256) fail('Retained ledger registration or decision evidence changed, is mutable or is not canonical.');
    return file;
  }
  const record = document(exactFile(registration), 1048576, registration.sha256);
  if (Object.keys(record).sort().join(',') !== 'approvedBy,decisionEvidence,history,mediaState,priorMediaStateRoots,schemaVersion'
      || record.schemaVersion !== 'hephaera-splat-ledger-registration/v1' || record.mediaState !== mediaState
      || !['fresh-project', 'existing-ledger'].includes(record.history) || !Array.isArray(record.priorMediaStateRoots)
      || typeof record.approvedBy !== 'string' || !record.approvedBy.trim() || record.approvedBy.length > 200 || /[\x00-\x1f]/.test(record.approvedBy))
    fail('Explicit operator ledger-history decision for this shared root is required.');
  // This records the operator's first-use history decision. It never scans for
  // other roots, proves absence of prior claims or asserts that the root stays empty.
  const prior = record.priorMediaStateRoots;
  if (record.history === 'fresh-project' ? prior.length !== 0 : prior.length !== 1 || prior[0] !== mediaState)
    fail('Undeclared, relocated or multiple prior splat roots require separately reviewed reconciliation.');
  for (const name of prior) {
    const file = runtime.projectPath(root, name);
    if (!fs.existsSync(file)) fail('An existing ledger decision must preserve its original canonical project directory.');
    const stat = fs.lstatSync(file);
    if (name !== relative(file) || !stat.isDirectory() || stat.isSymbolicLink()) fail('An existing ledger decision must preserve its original canonical project directory.');
  }
  const decisionFile = exactFile(record.decisionEvidence);
  return { registration, decisionEvidence: record.decisionEvidence, decisionFile,
    binding: { schemaVersion: 'hephaera-splat-shared-root/v1', mediaState, registration, decisionEvidence: record.decisionEvidence } };
}
function bindSharedState(prepared) {
  if (!prepared.sharedBinding) return [];
  transition.assertProductionAllowed(prepared.root, 'splat shared source-ledger binding');
  const file = runtime.projectPath(prepared.root, ROOT_BINDING), expected = prepared.rootBinding;
  if (!expected || expected.mediaState !== prepared.mediaState) fail('First splat generation requires its explicit ledger-registration decision.');
  const decision = ledgerDecision(prepared.root, prepared.mediaState, expected.registration, prepared.ledgerForbidden);
  if (canonical(decision.binding) !== canonical(expected)) fail('Retained ledger decision differs from the admitted first-use binding.');
  compareBinding(file, expected); compareBinding(bindingPath(prepared.root, prepared.sharedBinding.approvalSha256), prepared.sharedBinding);
  // Recheck the admitted first-use inputs before creating either immutable
  // binding. A receipt is not an authorization to replace changed evidence.
  for (const reference of prepared.context.references) if (runtime.hash(runtime.projectPath(prepared.root, reference.path)) !== reference.sha256) fail('First-use splat input changed before ledger binding.');
  for (const tool of prepared.context.tools) if (runtime.hash(tool.path) !== tool.sha256) fail('Selected splat tool changed before ledger binding.');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true }); runtime.components(file);
    try { fs.writeFileSync(file, JSON.stringify(expected, null, 2) + '\n', { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  compareBinding(file, expected);
  const approval = media.bindSharedState(prepared);
  return [appendReference(prepared, file), appendReference(prepared, approval),
    appendReference(prepared, runtime.projectPath(prepared.root, expected.registration.path)), appendReference(prepared, decision.decisionFile)];
}

function contextFor(operation, options, info, { policyReferences = [] } = {}) {
  if (!OPERATIONS.includes(operation)) fail('Unsupported splat operation; runtime promotion and model loading are separate.');
  if (!(options instanceof Map)) fail('Parsed splat options are required.');
  for (const key of options.keys()) if (!FLAGS.has(key)) fail('Unknown or protected splat option: --' + key);
  if (options.has('ledger-registration') && !['generate', 'validate', 'verify-package'].includes(operation)) fail('--ledger-registration applies only to generation or read-only validation, not setup or metadata inspection.');
  if (!Array.isArray(policyReferences) || policyReferences.length > 256 || policyReferences.length && operation !== 'generate') fail('Bounded internal policy references apply only to generation.');
  if (options.has('execute') && (!['setup', 'provision'].includes(operation) || options.get('execute') !== 'true')) fail('--execute applies only to explicit setup/provision.');
  if (!options.get('root') || !ID.test(options.get('task') || '') || options.get('task') === '..') fail('Explicit --root and safe --task are required.');
  requireCapability(info);
  const root = path.resolve(runtime.native(options.get('root'))); runtime.syntax(root); runtime.components(root);
  if (!fs.statSync(root).isDirectory()) fail('Project root must be an existing directory.');
  if (operation === 'generate' || options.has('execute')) transition.assertProductionAllowed(root, 'image-to-splat ' + operation);
  const task = options.get('task'), scoped = name => runtime.projectPath(root, name), relative = file => path.relative(root, file).split(path.sep).join('/');
  const cache = scoped(CACHE);
  function cacheChild(name, label) {
    const full = scoped(name);
    if (!runtime.within(cache, full) || runtime.samePath(cache, full) || fs.existsSync(full) && !fs.statSync(full).isDirectory()) fail(label + ' must be a project-cache directory child.');
    return full;
  }
  const workspaceFull = cacheChild(options.get('workspace') || CACHE + '/bubo-splats', 'Workspace'), workspace = relative(workspaceFull);
  const stateRoot = CACHE + '/tasks/' + task + '/bubo-splats', state = scoped(stateRoot), staging = scoped(workspace + '/staging');
  const mediaStateFull = cacheChild(options.get('media-state') || CACHE + '/local-media/shared-state', 'Shared media state'), mediaState = relative(mediaStateFull);
  const bindingRoot = scoped(CACHE + '/local-media'), approvalRoot = scoped(CACHE + '/local-media/acceptance-roots');
  if (overlap(workspaceFull, state) || overlap(workspaceFull, bindingRoot) || overlap(state, mediaStateFull) || overlap(staging, mediaStateFull)
      || overlap(mediaStateFull, approvalRoot) || overlap(mediaStateFull, scoped(ROOT_BINDING))) fail('Workspace, state, staging and immutable shared-root bindings require separate ownership.');
  const references = new Map(), referenceAdmissions = new Map(), tools = new Map(), inputRoots = new Set(), toolRoots = new Set(), immutable = [];
  const keyFor = name => process.platform === 'win32' ? name.toLowerCase() : name;
  function reference(value, kind = 'input', { maximum = 1048576, mutable = false } = {}) {
    const identity = typeof value === 'string' ? null : value;
    if (identity && (!identity || Array.isArray(identity) || Object.keys(identity).sort().join(',') !== 'path,sha256' || !SHA.test(identity.sha256 || ''))) fail('Exact typed path/SHA-256 identity required.');
    const file = scoped(identity ? identity.path : value), name = relative(file), stat = fs.lstatSync(file);
    if (identity && identity.path !== name) fail('Typed splat evidence requires canonical project-relative paths.');
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maximum) fail('Missing, linked or oversized splat reference.');
    if ([state, mediaStateFull, bindingRoot].some(scope => runtime.within(scope, file)) || !mutable && runtime.within(staging, file)) fail('Inputs cannot overlap mutable state, output, shared ledger or root-binding metadata.');
    const sha256 = runtime.hash(file); if (identity && sha256 !== identity.sha256) fail('Typed splat reference hash changed.');
    const key = keyFor(name), prior = references.get(key);
    if (prior && (prior.kind !== kind || prior.sha256 !== sha256)) fail('Conflicting typed splat reference.');
    if ([...tools.values()].some(tool => runtime.samePath(tool.path, file))) fail('An executable/module cannot also be an evidence reference.');
    references.set(key, { path: name, sha256, kind });
    if (!referenceAdmissions.has(key)) referenceAdmissions.set(key, { maximum, mutable });
    if (references.size > 4096) fail('Splat reference count exceeds its bound.');
    return file;
  }
  function typed(value, kind, options) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Exact typed splat reference required.'); return reference(value, kind, options); }
  function tool(identity, external = false, kind = 'selected-native-tool') {
    if (!identity || typeof identity.path !== 'string' || !SHA.test(identity.sha256 || '') || Object.keys(identity).sort().join(',') !== 'path,sha256') fail('Exact selected executable/module identity required.');
    runtime.syntax(runtime.native(identity.path)); const file = path.resolve(root, runtime.native(identity.path)); runtime.components(file);
    if (!external && (!runtime.within(workspaceFull, file) || [state, staging, mediaStateFull, bindingRoot].some(scope => overlap(file, scope)))) fail('Installed Python must stay in the selected immutable workspace.');
    if (runtime.within(root, file) && [state, staging, mediaStateFull, bindingRoot].some(scope => runtime.within(scope, file))) fail('Executable/module cannot overlap mutable execution or ledger state.');
    if (!fs.lstatSync(file).isFile() || runtime.hash(file) !== identity.sha256) fail('Selected executable/module identity changed.');
    const key = keyFor(file), prior = tools.get(key);
    if (prior && canonical(prior) !== canonical({ path: file, sha256: identity.sha256, kind })) fail('Conflicting executable/module identity.');
    if (runtime.within(root, file) && references.has(keyFor(relative(file)))) fail('An executable/module cannot also be an evidence reference.');
    tools.set(key, { path: file, sha256: identity.sha256, kind }); return file;
  }
  function dependency(name, directory = true, fresh = false) {
    const full = scoped(name);
    if (name !== relative(full) || !runtime.within(workspaceFull, full) || runtime.samePath(workspaceFull, full)
        || [state, staging, mediaStateFull, bindingRoot].some(scope => overlap(full, scope))) fail('Dependencies require separate canonical workspace children.');
    if (!fresh && !(directory ? fs.existsSync(full) && fs.statSync(full).isDirectory() : fs.existsSync(full) && fs.statSync(full).isFile())) fail('Explicit existing dependency is unavailable.');
    toolRoots.add(relative(full)); if (!fresh) { immutable.push(full); inputRoots.add(relative(full)); }
    return full;
  }
  function licences(values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 16) fail('Explicit bounded component licence references required.');
    for (const identity of values) {
      const file = typed(identity, 'rights'), value = document(file, 1048576, identity.sha256);
      if (!Array.isArray(value.evidence) || value.evidence.length < 1 || value.evidence.length > 64) fail('Applicable licence records must retain their source evidence.');
      for (const item of value.evidence) typed(item, 'rights');
    }
  }
  function registration(value, receipt = false) {
    if (!value || value.schemaVersion !== 'bubo-splat-installation-request/v1') fail('Explicit Bubo installation registration required.');
    for (const name of ['modelDirectory', 'sourceDirectory', 'environmentRoot', 'pythonBaseRoot', 'wheelhouseRoot', 'noticeDirectory']) dependency(value[name]);
    dependency(value.pythonArchive, false); tool(value.python); licences(value.licenses);
    const review = document(typed(value.componentReview, 'rights'), 1048576, value.componentReview.sha256);
    if (!Array.isArray(review.evidence) || review.evidence.length < 1 || review.evidence.length > 64) fail('Component review must retain exact source evidence.');
    for (const item of review.evidence) typed(item, 'rights');
    const output = scoped(value.receiptPath);
    if (!runtime.within(cache, output) || [state, staging, mediaStateFull, bindingRoot].some(scope => runtime.within(scope, output)) || immutable.some(scope => overlap(output, scope))) fail('Installation receipt requires a separate project-cache identity.');
    if (receipt && (!value.receiptPath || !fs.existsSync(output))) fail('Existing installation receipt identity required.');
    return output;
  }
  function installation(identity) {
    const file = typed(identity, 'input', { maximum: 33554432 }), value = document(file, 33554432, identity.sha256);
    if (value.schemaVersion !== 'bubo-splat-installation/v1' || value.registration?.receiptPath !== identity.path) fail('Installation receipt cannot be transplanted or reinterpreted.');
    registration(value.registration, true); return value;
  }
  const styleFile = reference('STYLE.md', 'policy'), style = styles.validate(styleFile);
  if (style.primary !== 'LOCAL' && !options.has('selection')) fail('Splat work requires primary LOCAL or explicit task-local LOCAL selection.');
  if (options.has('selection')) {
    const file = reference(options.get('selection'), 'policy'), selected = document(file);
    if (!runtime.within(scoped(CACHE + '/tasks/' + task), file) || selected.schemaVersion !== 1 || selected.pipeline !== 'LOCAL' || selected.fallbackPolicy !== 'stop'
        || !['prompt', 'style'].includes(selected.selectionSource) || selected.styleContract !== 'STYLE.md' || selected.styleSha256 !== style.sha256
        || selected.styleContractHash && selected.styleContractHash !== style.sha256 || selected.selectionSource === 'style' && style.primary !== 'LOCAL') fail('Splat selection must bind this task, LOCAL and current STYLE.');
  }
  const selected = styles.resolve(root, styleFile, style.primary === 'LOCAL' && !options.has('selection') ? {} : { override: 'LOCAL' }, style);
  const engine = engines.resolve(root); if (engine.outputScope || engine.selectionSource === 'prompt') fail('Production splats cannot use an isolated prototype engine override.');
  for (const name of ['ENGINE.md', 'ARCHITECTURE.md']) if (fs.existsSync(path.join(root, name))) reference(name, 'policy');
  for (const name of ['.engine/registry.json', '.engine/' + engine.projectEngine + '.md', '.styles/.pipelines/local/PIPELINE.md']) {
    const full = path.join(runtime.BASE, name); if (runtime.within(root, full)) reference(full, 'policy');
  }
  const mediaFile = reference(options.get('media') || 'MEDIA.md', 'policy'); media.validateMedia(mediaFile);
  const policy = { pipeline: selected.pipeline, styleSha256: style.sha256, engine, libraries: style.libraries.map(value => ({ id: value.id, root: value.path })), media: { path: relative(mediaFile), sha256: runtime.hash(mediaFile) } };
  let request = null, requestPath = null, nativeBudgets = null, sharedBinding = null, receiptOutput = null, rootBinding = null;
  const ledgerForbidden = [state, staging, mediaStateFull, bindingRoot];
  function ledgerRegistration(required) {
    const boundFile = scoped(ROOT_BINDING), exists = fs.existsSync(boundFile), retained = exists ? document(boundFile) : null;
    let registrationIdentity;
    if (options.has('ledger-registration')) {
      const file = reference(options.get('ledger-registration'), 'policy');
      registrationIdentity = { path: relative(file), sha256: runtime.hash(file) };
    }
    if (retained) {
      if (Object.keys(retained).sort().join(',') !== 'decisionEvidence,mediaState,registration,schemaVersion'
          || retained.schemaVersion !== 'hephaera-splat-shared-root/v1' || retained.mediaState !== mediaState)
        fail('The retained project-shared splat root cannot change; missing historical registration requires separately reviewed reconciliation.');
      if (registrationIdentity && canonical(registrationIdentity) !== canonical(retained.registration)) fail('Explicit ledger registration differs from the immutable first-use identity.');
      registrationIdentity = retained.registration;
    } else if (!registrationIdentity) {
      if (required) fail('First splat generation requires --ledger-registration with an explicit operator history decision; history is never inferred by scanning.');
      return;
    }
    const decision = ledgerDecision(root, mediaState, registrationIdentity, ledgerForbidden);
    if (retained && canonical(retained) !== canonical(decision.binding)) fail('Retained ledger decision/evidence differs from its immutable binding.');
    typed(decision.registration, 'policy'); typed(decision.decisionEvidence, 'policy'); rootBinding = decision.binding;
  }
  function generation(value, verifying = false) {
    if (value?.schemaVersion !== 'bubo-splat-generation/v1' || value.task !== task || value.request?.styleSha256 !== style.sha256) fail('Generation request must bind native task and current STYLE.');
    nativeBudgets = value.request.budgets;
    if (!Number.isSafeInteger(value.request.seed) || value.request.seed < 0) fail('Splat seeds require exact nonnegative host integers.');
    typed(value.request.input, 'input', { maximum: bounded(nativeBudgets?.maxInputBytes, 'input bytes', 536870912) }); installation(value.installation);
    if (!options.has('media-state')) fail('Generation/package verification requires explicit retained --media-state.');
    const approvalFile = typed(value.authorization, 'rights'), approval = document(approvalFile, 1048576, value.authorization.sha256);
    if (approval.schemaVersion !== 'bubo-splat-generation-approval/v1' || approval.task !== task || approval.sourceSha256 !== value.request.input.sha256 || approval.styleSha256 !== style.sha256
        || approval.ledgerRoot !== mediaState + '/image-to-splat/ledger' || approval.maximumCandidates !== 1 || approval.maximumRevisions !== 1
        || approval.generationApproved !== true || approval.gpuAvailabilityConfirmed !== true || !SHA.test(approval.catalogSha256 || '')) fail('Original source/style/catalog generation approval and shared ledger must remain unchanged.');
    typed(approval.sourceRights, 'rights');
    sharedBinding = { schemaVersion: 'hephaera-local-media-acceptance-root/v1', approvalSha256: value.authorization.sha256, mediaState };
    compareBinding(bindingPath(root, sharedBinding.approvalSha256), sharedBinding);
    ledgerRegistration(!verifying);
    // Native verification owns candidate/claim validity. Never create a claim here.
    if (!verifying && !['candidate', 'revision'].includes(value.attemptKind)) fail('Explicit native candidate/revision required.');
  }
  if (options.has('request')) {
    const file = reference(options.get('request'), 'input', { maximum: operation === 'verify-package' ? 1048576 : 65536, mutable: ['inspect', 'validate', 'verify-package'].includes(operation) });
    requestPath = relative(file); request = document(file, operation === 'verify-package' ? 1048576 : 65536);
  } else if (operation !== 'setup' || options.has('execute')) fail('Explicit --request is required.');
  if (operation === 'generate') generation(request);
  else if (operation === 'verify-package') {
    if (request.schemaVersion !== 'bubo-splat-package/v1' || request.task !== task || request.humanReview !== 'pending' || request.promotion !== false) fail('Technical-only native Gaussian package required.');
    const original = document(typed(request.request, 'input', { maximum: 65536, mutable: true }), 65536, request.request.sha256); generation(original, true);
    typed(request.source, 'input', { maximum: bounded(original.request.budgets.maxInputBytes, 'input bytes', 536870912), mutable: true });
    typed(request.workerResult, 'input', { maximum: 1048576, mutable: true });
    if (!Array.isArray(request.variants) || request.variants.length < 1 || request.variants.length > 2) fail('Bounded native Gaussian variants required.');
    for (const variant of request.variants) { typed(variant.artifact, 'input', { maximum: 65536, mutable: true }); typed(variant.payload, 'input', { maximum: 134217728, mutable: true }); }
  } else if (operation === 'setup' && request) {
    if (request.task !== task) fail('Registration task ownership mismatch.');
    receiptOutput = relative(registration(request)); if (fs.existsSync(scoped(receiptOutput))) fail('Installation receipt already exists; preserve it.');
  } else if (operation === 'provision') {
    if (request.schemaVersion !== 'bubo-splat-provision/v1' || request.task !== task) fail('Scoped native provisioning request required.');
    const install = dependency(request.installationRoot, true, true), download = dependency(request.downloadRoot, true, true);
    if (overlap(install, download)) fail('Provision install/download roots must be disjoint.');
    dependency(request.runtimeSourceRoot); dependency(request.noticeSourceRoot); licences(request.licenses); tool(request.bootstrapPython, true);
  } else if (request) {
    if (!['bubo-splat-request/v1', 'bubo-splat-artifact/v1', 'bubo-splat-inspection/v1'].includes(request.schemaVersion) || request.styleSha256 !== style.sha256) fail('Explicit current-STYLE splat request/artifact required.');
    nativeBudgets = request.budgets;
    typed(request.input, 'input', { maximum: bounded(request.budgets?.maxInputBytes, 'input bytes', 536870912), mutable: true });
    if (request.payload) typed(request.payload, 'input', { maximum: bounded(request.budgets?.maxInputBytes, 'input bytes', 536870912), mutable: true });
    if (request.seed !== undefined && (!Number.isSafeInteger(request.seed) || request.seed < 0)) fail('Splat seeds require exact nonnegative host integers.');
  }
  if (operation === 'validate' && options.has('ledger-registration')) ledgerRegistration(false);
  if (options.has('platform-modules')) {
    const modules = document(reference(options.get('platform-modules')));
    if (modules.schemaVersion !== 'hephaera-platform-modules/v1' || Object.keys(modules).sort().join(',') !== 'modules,schemaVersion' || !Array.isArray(modules.modules) || modules.modules.length > 64) fail('Explicit bounded platform module manifest required.');
    for (const identity of modules.modules) tool(identity, true, 'platform-module');
  }
  for (const name of [rootBinding && ROOT_BINDING, sharedBinding && CACHE + '/local-media/acceptance-roots/' + sharedBinding.approvalSha256 + '.json'].filter(Boolean)) {
    const file = scoped(name);
    if (fs.existsSync(file)) {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576) fail('Retained shared-root policy exceeds its original admission.');
      references.set(keyFor(name), { path: name, sha256: runtime.hash(file), kind: 'policy' });
      referenceAdmissions.set(keyFor(name), { maximum: 1048576, mutable: true });
    }
  }
  // The lifecycle queues the complete immutable closure, including large image
  // and installation inputs and rights. Freshness adds no new kind or scope:
  // retain each original admission rather than recasting it as small policy JSON.
  for (const value of policyReferences) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'path,sha256'
        || typeof value.path !== 'string' || !SHA.test(value.sha256 || '')) fail('Exact internal queued policy identity required.');
    const file = scoped(value.path), name = relative(file), key = keyFor(name), prior = references.get(key);
    if (value.path !== name) fail('Queued policy references must use canonical project-relative paths.');
    if (!prior) { typed(value, 'policy'); continue; }
    const admission = referenceAdmissions.get(key), stat = fs.lstatSync(file);
    if (!admission || prior.sha256 !== value.sha256) fail('Queued reference conflicts with its original admitted identity.');
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > admission.maximum) fail('Queued reference exceeds its original admitted byte bound.');
    if (runtime.hash(file) !== prior.sha256) fail('Queued reference changed after its original admission.');
  }
  if (immutable.some(file => [state, staging, mediaStateFull, bindingRoot].some(scope => overlap(file, scope)))) fail('Immutable dependencies overlap mutable execution or root-binding state.');
  if (info.folder && runtime.within(root, path.resolve(info.folder))) {
    const publication = scoped(info.folder); if ([workspaceFull, state, mediaStateFull].some(scope => overlap(publication, scope))) fail('Execution roots cannot overlap the verified runtime.');
    inputRoots.add(relative(publication));
  }
  const budgets = executionBudgets(options, nativeBudgets);
  if (operation === 'provision' && options.has('execute') && !budgets.maxPrivateBytes) fail('Provision execution requires explicit committed-memory bounds.');
  const context = { schemaVersion: 'bubo-host-context/v1', projectRoot: root, task,
    roots: { state: stateRoot, staging: relative(staging), tools: [...toolRoots], inputs: [...inputRoots], outputs: receiptOutput ? [receiptOutput] : [], mediaState },
    policy, references: [...references.values()], tools: [...tools.values()], budgets, permissions: { provisioning: options.get('execute') === 'true', promotion: false } };
  const forwarded = new Map([['root', root]]); if (requestPath) forwarded.set('request', requestPath); if (options.has('execute')) forwarded.set('execute', 'true');
  return { root, task, stateRoot, workspace, mediaState, context, options: forwarded, request, requestPath, sharedBinding, rootBinding, ledgerForbidden, mediaFile: relative(mediaFile) };
}

function snapshot(prepared, source, destination, maximum, expected) {
  const bytes = boundedBytes(source, maximum, expected);
  const full = runtime.projectPath(prepared.root, destination); fs.writeFileSync(full, bytes, { flag: 'wx' });
  return { path: destination, sha256: runtime.hash(full) };
}
async function invoke(operation, options, { emit = true, policyReferences = [], lifecycle } = {}) {
  if (typeof emit !== 'boolean') fail('Splat result emission must be boolean.');
  if (!(options instanceof Map) || !options.get('root')) fail('Explicit parsed splat root is required.');
  return maintenance.run(path.resolve(runtime.native(options.get('root'))), async () => {
    const started = performance.now(), info = runtime.verified(), admitted = performance.now();
    const prepared = contextFor(operation, options, info, { policyReferences });
    prepared.timings = { runtimeAdmissionMilliseconds: admitted - started, hostPolicyMilliseconds: performance.now() - admitted };
    const sources = { buildReceipt: runtime.projectPath(info.root, info.pinned.buildReceipt), resourceCatalog: path.join(info.folder, 'resources/catalog.json'), catalog: path.join(info.folder, 'resources/image-to-splat/catalog.json') };
    const expected = Object.fromEntries(Object.entries(sources).map(([name, file]) => [name, runtime.hash(file)]));
    if (canonical(document(sources.buildReceipt, 8388608, expected.buildReceipt)) !== canonical(info.receipt)
        || expected.resourceCatalog !== info.pinned.resourceCatalogSha256
        || document(sources.resourceCatalog, 8388608, expected.resourceCatalog).files?.['resources/image-to-splat/catalog.json'] !== expected.catalog) fail('Runtime snapshot differs from the verified admission.');
    if (operation === 'generate') bindSharedState(prepared);
    const dispatchRoot = prepared.stateRoot + '/dispatch/' + crypto.randomUUID();
    const result = await transport.execute('image-to-splat', operation, prepared.options, { ...prepared, stateRoot: dispatchRoot }, info, false, lifecycle);
    if (result.workflow !== 'image-to-splat' || result.operation !== operation) fail('Native result names another workflow/operation.');
    const parent = runtime.projectPath(prepared.root, dispatchRoot + '/bubo-host'), entries = fs.readdirSync(parent);
    if (entries.length !== 1) fail('Ambiguous owned splat dispatch receipt.');
    const directory = path.posix.join(dispatchRoot, 'bubo-host', entries[0]);
    const identity = name => { const value = directory + '/' + name; return { path: value, sha256: runtime.hash(runtime.projectPath(prepared.root, value)) }; };
    const provenance = { directory, hostContext: identity('host-context.json'), result: identity('result.json'), timing: identity('timing.json'),
      buildReceipt: snapshot(prepared, sources.buildReceipt, directory + '/runtime-build.json', 8388608, expected.buildReceipt),
      resourceCatalog: snapshot(prepared, sources.resourceCatalog, directory + '/runtime-resources.json', 8388608, expected.resourceCatalog),
      catalog: snapshot(prepared, sources.catalog, directory + '/splat-catalog.json', 8388608, expected.catalog) };
    if (emit) console.log(JSON.stringify({ ...result.data, hostSplatDispatch: provenance }));
    return { ...result, hostSplatDispatch: provenance };
  });
}

module.exports = { parse, document, requireCapability, executionBudgets, contextFor, invoke, bindSharedState, ROOT_BINDING };
