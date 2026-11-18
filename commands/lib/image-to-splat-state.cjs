'use strict';

// Host versions and decisions only. Bubo owns native DTOs, installed bytes,
// Gaussian inspection, inference, cancellation and irrevocable attempt claims.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const runtime = require('./bubo-runtime.cjs');
const styles = require('./style-contract.cjs');
const engines = require('./engine-contract.cjs');
const media = require('./bubo-media-adapter.cjs');
const native = require('./bubo-splat-adapter.cjs');
const transition = require('./state-transition.cjs');
const CACHE = '.hephaera/.cache', SHA = /^[a-f0-9]{64}$/, ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MAX_JSON = 8 * 1024 * 1024, MAX_FILE = 512 * 1024 * 1024, MAX_EVENTS = 4096;
const CANONICAL = ['front', 'right', 'back', 'left', 'top', 'bottom'];
const EVENT_KINDS = new Set(['validation-intent', 'validation-returned', 'validation-failed', 'generation-intent',
  'native-before-launch', 'native-started', 'native-closed', 'generation-returned', 'generation-failed',
  'verification-intent', 'verification-returned', 'verification-failed', 'review-packet', 'review-decision']);
const fail = message => { throw new Error(message); };
const canonical = value => JSON.stringify(runtime.canonical(value));
const equal = (left, right) => canonical(left) === canonical(right);
const digest = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const relative = (root, file) => path.relative(root, file).split(path.sep).join('/');
function text(value, label, maximum = 256) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > maximum || /[\x00-\x1f]/.test(value)) fail('Invalid ' + label + '.');
  return value;
}
function id(value, label) { if (!ID.test(text(value, label, 80)) || value === '.' || value === '..') fail('Invalid ' + label + '.'); return value; }
function data(value, allowed, required, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(label + ' must be a plain data object.');
  const descriptors = Object.getOwnPropertyDescriptors(value), result = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.includes(key) || !Object.hasOwn(descriptors[key], 'value')) fail('Unknown or protected ' + label + ' field.');
    result[key] = descriptors[key].value;
  }
  if (required.some(key => !Object.hasOwn(result, key))) fail('Missing ' + label + ' fields.');
  return result;
}
function owner(value) { return data(value, ['root', 'manifest'], ['root', 'manifest'], 'lifecycle owner'); }
function rootPath(value) {
  const input = runtime.native(text(value, 'project root', 4096)); runtime.syntax(input);
  if (!path.isAbsolute(input)) fail('Explicit absolute project root required.');
  const root = path.resolve(input); runtime.components(root);
  if (!fs.statSync(root).isDirectory()) fail('Project root must be a real directory.');
  if (path.basename(runtime.BASE).toLowerCase() === '.hephaera' && !runtime.samePath(root, path.dirname(runtime.BASE))) fail('Lifecycle root differs from the installed host.');
  return root;
}
function portable(name) {
  text(name, 'project-relative path', 4096);
  if (path.isAbsolute(name) || name.includes('\\') || /[:<>"|?*]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..'
      || part.toLowerCase() === '.git' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) fail('Canonical portable project-relative path required.');
  return name;
}
function full(root, name) {
  portable(name); const file = runtime.projectPath(root, name); let current = root;
  for (const part of name.split('/')) {
    if (!fs.existsSync(current)) break;
    const matches = fs.readdirSync(current).filter(entry => entry.toLowerCase() === part.toLowerCase());
    if (!matches.length) break;
    if (matches.length !== 1 || matches[0] !== part) fail('Path case alias or collision rejected.');
    current = path.join(current, part);
  }
  return file;
}
function identity(root, value, maximum = MAX_FILE) {
  const typed = typeof value === 'string' ? null : data(value, ['path', 'sha256'], ['path', 'sha256'], 'file identity');
  const name = portable(typed ? typed.path : value), file = full(root, name), before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > maximum) fail('Missing, linked or oversized lifecycle reference: ' + name);
  const result = { path: name, sha256: runtime.hash(file) }, after = fs.lstatSync(file);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail('Lifecycle reference changed while hashing.');
  if (typed && (!SHA.test(typed.sha256 || '') || !equal(typed, result))) fail('Referenced lifecycle bytes changed: ' + name);
  return result;
}
function put(root, name, value) {
  const file = full(root, name), bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  if (bytes.length > MAX_JSON) fail('Lifecycle record exceeds its byte bound.');
  fs.mkdirSync(path.dirname(file), { recursive: true }); runtime.components(file);
  const fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return identity(root, name, MAX_JSON);
}
function paths(task, asset, version) {
  id(task, 'task'); id(asset, 'asset'); id(version, 'version');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task)) fail('Canonical lowercase task identity required.');
  const directory = `${CACHE}/tasks/${task}/image-to-splat/${asset}/${version}`;
  return { directory, manifest: directory + '/manifest.json' };
}
function latest(state, kind) { return [...state.events].reverse().find(event => event.kind === kind); }
function cacheChild(root, value, label) {
  const file = full(root, portable(value)), cache = full(root, CACHE);
  if (!runtime.within(cache, file) || runtime.samePath(cache, file)) fail(label + ' must be a project-cache child.');
  return value;
}
function lock(state, action) {
  const file = full(state.root, state.directory + '/.write-lock'); fs.mkdirSync(path.dirname(file), { recursive: true }); runtime.components(file);
  let fd;
  try { fd = fs.openSync(file, 'wx'); } catch (error) { if (error.code === 'EEXIST') fail('Lifecycle write is already owned; inspect retained intent/lock before recovery.'); throw error; }
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const close = () => { fs.closeSync(fd); fs.unlinkSync(file); };
  try {
    const result = action();
    if (result && typeof result.then === 'function') return result.finally(close);
    close(); return result;
  } catch (error) { close(); throw error; }
}
function createService(adapter = native, ports = {}) {
  if (!adapter || typeof adapter.invoke !== 'function') fail('Trusted compiled native adapter required.');
  const port = data(ports, ['nativeIdentity'], [], 'trusted lifecycle ports');
  if (port.nativeIdentity !== undefined && typeof port.nativeIdentity !== 'function') fail('Native identity port must be a trusted function.');
  const nativeIdentity = port.nativeIdentity || (() => runtime.verified());
  const read = (root, value, maximum = MAX_JSON) => {
    const ref = identity(root, value, maximum); return native.document(full(root, ref.path), maximum, ref.sha256);
  };
  function references(root, value) {
    const found = new Map(); let nodes = 0;
    function visit(item, depth = 0) {
      if (++nodes > 8192 || depth > 32) fail('Lifecycle reference nesting bound exceeded.');
      if (Array.isArray(item)) { for (const entry of item) visit(entry, depth + 1); return; }
      if (!item || typeof item !== 'object') return;
      if (typeof item.path === 'string' && Object.hasOwn(item, 'sha256')) {
        const ref = identity(root, { path: item.path, sha256: item.sha256 }); found.set(ref.path, ref);
        if (found.size > 128) fail('Too many lifecycle references.');
      }
      for (const child of Object.values(item)) visit(child, depth + 1);
    }
    visit(value); return [...found.values()];
  }
  function policy(root, task, selection, mediaFile) {
    const style = identity(root, 'STYLE.md', 1048576), validated = styles.validate(full(root, style.path));
    let selected = null;
    if (selection) {
      selected = identity(root, selection, 1048576); const value = read(root, selected, 1048576);
      if (!runtime.within(full(root, `${CACHE}/tasks/${task}`), full(root, selected.path)) || value.schemaVersion !== 1 || value.pipeline !== 'LOCAL'
          || !['prompt', 'style'].includes(value.selectionSource) || value.styleContract !== 'STYLE.md' || value.styleSha256 !== style.sha256
          || value.styleContractHash && value.styleContractHash !== style.sha256 || value.selectionSource === 'style' && validated.primary !== 'LOCAL') fail('Explicit current task LOCAL selection required.');
    } else if (validated.primary !== 'LOCAL') fail('A non-LOCAL primary requires explicit task LOCAL selection evidence.');
    const mediaRef = identity(root, mediaFile || 'MEDIA.md', 1048576); media.validateMedia(full(root, mediaRef.path));
    const engine = engines.resolve(root), engineIdentity = { effectiveEngine: engine.effectiveEngine, contractSha256: engine.contractSha256 || null,
      definitionSha256: engine.definitionSha256, registrySha256: engine.registrySha256 };
    const files = [style, mediaRef, ...(selected ? [selected] : [])];
    if (fs.existsSync(full(root, 'ENGINE.md'))) files.push(identity(root, 'ENGINE.md', 1048576));
    const local = path.join(runtime.BASE, '.styles/.pipelines/local/PIPELINE.md');
    const localPipelineSha256 = runtime.hash(local);
    return { style, media: mediaRef, selection: selected, engine: engineIdentity, localPipelineSha256, fingerprint: digest({ style, media: mediaRef, selection: selected, engine: engineIdentity, localPipelineSha256 }), files };
  }
  function nativeSummary() {
    const info = nativeIdentity();
    if (!info || !SHA.test(info.pinned?.resourceCatalogSha256 || '') || typeof info.pinned?.revision !== 'string' || !info.capability?.build) fail('Verified native identity unavailable.');
    return { revision: info.pinned.revision, resourceCatalogSha256: info.pinned.resourceCatalogSha256, build: info.capability.build,
      fingerprint: digest({ revision: info.pinned.revision, resourceCatalogSha256: info.pinned.resourceCatalogSha256, build: info.capability.build }) };
  }
  function init(options) {
    const input = data(options, ['root', 'task', 'asset', 'version', 'creator', 'request', 'selection', 'media', 'workspace', 'mediaState', 'parentManifest', 'platformModules', 'ledgerRegistration'],
      ['root', 'task', 'asset', 'version', 'creator', 'request', 'workspace', 'mediaState'], 'lifecycle initialization');
    const root = rootPath(input.root), location = paths(input.task, input.asset, input.version); text(input.creator, 'creator', 200);
    identity(root, `${CACHE}/tasks/${input.task}/TASK.md`, 1048576);
    const request = identity(root, input.request, 65536), value = read(root, request, 65536);
    if (value.schemaVersion !== 'bubo-splat-generation/v1' || value.task !== input.task || !value.request || !value.settings || !value.limits) fail('Explicit native generation request for this task required.');
    id(value.runId, 'native run');
    if (!['candidate', 'revision'].includes(value.attemptKind) || !Number.isSafeInteger(value.request.seed) || value.request.seed < 0) fail('Explicit native attempt and exactly representable seed required.');
    const selected = policy(root, input.task, input.selection, input.media);
    if (value.request.styleSha256 !== selected.style.sha256) fail('Native request STYLE differs from current policy.');
    const refs = references(root, value), authorization = read(root, value.authorization, 65536);
    refs.push(...references(root, authorization));
    const workspace = cacheChild(root, input.workspace, 'Workspace'), mediaState = cacheChild(root, input.mediaState, 'Shared media state');
    if (runtime.within(full(root, workspace), full(root, location.directory)) || runtime.within(full(root, location.directory), full(root, workspace))) fail('Workspace cannot overlap host lifecycle state.');
    const mutable = [location.directory, workspace + '/staging', mediaState].map(name => full(root, name));
    if (mutable.some((scope, index) => mutable.some((other, j) => j !== index && (runtime.within(scope, other) || runtime.within(other, scope))))) fail('Lifecycle, staging and shared ledger require separate ownership.');
    const platformModules = input.platformModules ? identity(root, input.platformModules, 1048576) : null;
    const ledgerRegistration = input.ledgerRegistration ? identity(root, input.ledgerRegistration, 1048576) : null;
    if (ledgerRegistration) refs.push(...references(root, read(root, ledgerRegistration, 1048576)));
    const allRefs = [...new Map([request, ...refs, ...selected.files, ...(platformModules ? [platformModules] : []), ...(ledgerRegistration ? [ledgerRegistration] : [])].map(ref => [ref.path, ref])).values()];
    if (allRefs.length > 128 || allRefs.some(ref => mutable.some(scope => runtime.within(scope, full(root, ref.path))))) fail('Immutable inputs cannot overlap lifecycle/staging/shared ledger.');
    const parent = input.parentManifest ? identity(root, input.parentManifest, MAX_JSON) : null;
    if (parent) {
      const prior = load({ root, manifest: parent.path });
      if (prior.asset.task !== input.task || prior.asset.asset !== input.asset || prior.asset.version === input.version || prior.asset.runId === value.runId) fail('Parent requires same task/asset and fresh version/run identity.');
      const sameSource = prior.asset.source.sha256 === value.request.input.sha256, sameApproval = prior.asset.authorization.sha256 === value.authorization.sha256;
      if (value.attemptKind === 'revision') {
        if (prior.asset.attemptKind !== 'candidate' || !sameSource || !sameApproval) fail('Revision requires its original candidate/source/task/approval ancestry.');
      } else if (sameSource) {
        if (!sameApproval) fail('Same-source candidate continuation requires its original task/source/approval ancestry.');
        if (latest(prior, 'generation-returned')) fail('A successful same-source candidate requires an explicit revision, not another candidate.');
        // This new version is only an explicit continuation. An unresolved or
        // failed parent may already have spent its native claim; Bubo alone
        // decides that under the retained project-shared source ledger.
      } else if (sameApproval) fail('A changed source requires a separate explicit source-bound authorization.');
    } else if (value.attemptKind === 'revision') fail('A revision requires its retained candidate parent manifest.');
    const asset = { schemaVersion: 'hephaera-splat-asset/v1', task: input.task, asset: input.asset, version: input.version, creator: input.creator,
      request, source: value.request.input, authorization: value.authorization, runId: value.runId, attemptKind: value.attemptKind,
      workspace, mediaState, platformModules, ledgerRegistration, parent, policy: selected, references: allRefs, createdAt: new Date().toISOString() };
    const shell = { root, ...location };
    return lock(shell, () => {
      const technicalRequest = put(root, location.directory + '/technical-request.json', value.request);
      const ref = put(root, location.manifest, { ...asset, technicalRequest });
      return { manifest: ref.path, asset: { ...asset, technicalRequest } };
    });
  }
  function load(options) {
    const input = owner(options), root = rootPath(input.root), manifest = identity(root, input.manifest, MAX_JSON), asset = read(root, manifest, MAX_JSON);
    if (asset.schemaVersion !== 'hephaera-splat-asset/v1' || paths(asset.task, asset.asset, asset.version).manifest !== manifest.path) fail('Invalid immutable lifecycle owner.');
    const directory = paths(asset.task, asset.asset, asset.version).directory, eventsRoot = full(root, directory + '/events'), events = [];
    if (fs.existsSync(eventsRoot)) {
      const handle = fs.opendirSync(eventsRoot, { bufferSize: 32 }), entries = [];
      try { let entry; while ((entry = handle.readSync()) !== null) { if (entries.length >= MAX_EVENTS) fail('Lifecycle event limit exceeded.'); entries.push(entry.name); } }
      finally { handle.closeSync(); }
      entries.sort(); let previous = null;
      for (let i = 0; i < entries.length; i++) {
        if (entries[i] !== String(i + 1).padStart(6, '0') + '.json') fail('Incomplete or unexpected lifecycle event; retain state for review.');
        const ref = identity(root, directory + '/events/' + entries[i], MAX_JSON), event = read(root, ref, MAX_JSON);
        data(event, ['schemaVersion', 'sequence', 'manifestSha256', 'previousSha256', 'kind', 'data', 'recordedAt'], ['schemaVersion', 'sequence', 'manifestSha256', 'previousSha256', 'kind', 'data', 'recordedAt'], 'lifecycle event');
        if (event.schemaVersion !== 'hephaera-splat-event/v1' || event.sequence !== i + 1 || event.manifestSha256 !== manifest.sha256 || event.previousSha256 !== previous || !EVENT_KINDS.has(event.kind)) fail('Lifecycle event ancestry or kind differs.');
        events.push({ ...event, identity: ref }); previous = ref.sha256;
      }
    }
    return { root, manifest: manifest.path, identity: manifest, directory, asset, events };
  }
  function append(state, kind, value) {
    if (!EVENT_KINDS.has(kind) || state.events.length >= MAX_EVENTS) fail('Unsupported or exhausted lifecycle event.');
    const sequence = state.events.length + 1, event = { schemaVersion: 'hephaera-splat-event/v1', sequence, manifestSha256: state.identity.sha256,
      previousSha256: state.events.at(-1)?.identity.sha256 || null, kind, data: value, recordedAt: new Date().toISOString() };
    const ref = put(state.root, state.directory + '/events/' + String(sequence).padStart(6, '0') + '.json', event);
    state.events.push({ ...event, identity: ref }); return ref;
  }
  function observe(state) {
    const stale = [], nativeStale = [];
    const admitted = new Map(), checked = new Set();
    let generationRequest = null;
    try { generationRequest = read(state.root, state.asset.request, 65536); } catch { stale.push('source-request-or-policy-reference-changed'); }
    const generatedEvent = latest(state, 'generation-returned');
    const sourcePaths = new Set([state.asset.source.path, generatedEvent?.data.source?.path].filter(Boolean));
    const payloadPaths = new Set((generatedEvent?.data.variants || []).map(variant => variant.payload.path));
    for (const event of state.events) for (const entry of event.data.contextReferences || []) {
      try {
        const observed = data(entry, ['path', 'sha256', 'kind', 'observedBytes'], ['path', 'sha256', 'kind', 'observedBytes'], 'retained admitted reference');
        if (!['input', 'policy', 'rights', 'consent', 'review'].includes(observed.kind) || !Number.isSafeInteger(observed.observedBytes)
            || observed.observedBytes < 1 || observed.observedBytes > MAX_FILE) fail('Invalid retained admitted reference bound.');
        const key = canonical({ path: observed.path, sha256: observed.sha256 }), previous = admitted.get(key);
        if (previous && previous.observedBytes !== observed.observedBytes) fail('Conflicting admitted reference observations.');
        admitted.set(key, observed);
      } catch { stale.push('admitted-reference-observation-invalid'); }
    }
    function check(ref, reason) {
      const key = canonical(ref); if (checked.has(key)) return; checked.add(key);
      try {
        const observed = admitted.get(key);
        let maximum = /\.(?:json|md|txt|yaml|yml|csv|xml|html|svg)$/i.test(ref.path) ? MAX_JSON : MAX_FILE;
        if (generationRequest?.installation.path === ref.path) maximum = 32 * 1024 * 1024;
        else if (generationRequest && sourcePaths.has(ref.path)) maximum = generationRequest.request.budgets.maxInputBytes;
        else if (generationRequest && payloadPaths.has(ref.path)) maximum = generationRequest.limits.maxOutputBytes;
        else if (ref.path === state.asset.request.path) maximum = 65536;
        if (observed) {
          const stat = fs.lstatSync(full(state.root, ref.path));
          if (stat.size !== observed.observedBytes) fail('Admitted reference size changed before freshness hashing.');
          maximum = observed.observedBytes;
        }
        identity(state.root, ref, maximum);
      } catch { stale.push(reason); }
    }
    let currentPolicy = null;
    try { currentPolicy = policy(state.root, state.asset.task, state.asset.policy.selection, state.asset.policy.media); if (currentPolicy.fingerprint !== state.asset.policy.fingerprint) stale.push('selection-style-engine-or-media-changed'); }
    catch { stale.push('selection-style-engine-or-media-invalid'); }
    for (const ref of [...state.asset.references, state.asset.technicalRequest, ...(state.asset.parent ? [state.asset.parent] : [])]) check(ref, 'source-request-or-policy-reference-changed');
    for (const event of state.events) for (const ref of event.data.references || []) check(ref, 'returned-or-review-evidence-changed');
    const generated = latest(state, 'generation-returned'), verified = latest(state, 'verification-returned');
    const subject = latest(state, 'review-packet'); let current = null;
    if (generated) {
      try { current = nativeSummary(); if (current.fingerprint !== generated.data.nativeIdentity.fingerprint) nativeStale.push('current-native-build-changed'); }
      catch { nativeStale.push('current-native-build-unavailable'); }
    }
    return { stale: [...new Set(stale)], nativeStale: [...new Set(nativeStale)], currentPolicy, currentNative: current, generated, verified, subject };
  }
  function fresh(state, requireNative = true) {
    const observed = observe(state);
    if (observed.stale.length || requireNative && observed.nativeStale.length) fail('Current splat evidence is stale: ' + [...observed.stale, ...observed.nativeStale].join(', ') + '. Retain history and create an explicit new version; no producer relabeling.');
    return observed;
  }
  function status(options) {
    const state = load(options), observed = observe(state), decision = kind => [...state.events].reverse().find(event => event.kind === 'review-decision' && event.data.kind === kind && event.data.subjectSha256 === observed.subject?.data.subjectSha256);
    const stale = observed.stale.length > 0 || observed.nativeStale.length > 0;
    return { schemaVersion: 'hephaera-splat-status/v1', manifest: state.manifest, task: state.asset.task, asset: state.asset.asset, version: state.asset.version,
      stage: stale ? 'stale' : observed.subject ? 'review-ready' : observed.verified ? 'technically-verified' : observed.generated ? 'staged' : latest(state, 'generation-intent') ? 'dispatch-recorded' : 'planned',
      staleInputs: observed.stale, staleCurrentNative: observed.nativeStale, nativeRunId: state.asset.runId, attemptKind: state.asset.attemptKind,
      generationIntentRetained: Boolean(latest(state, 'generation-intent')), recoveryRequired: Boolean(latest(state, 'generation-intent') && !observed.generated),
      technicalVerification: stale && observed.verified ? 'stale' : observed.verified ? 'passed' : 'pending', reviewSubjectSha256: observed.subject?.data.subjectSha256 || null,
      duplicateImageGroups: observed.subject?.data.duplicateImageGroups || [], reviewWarnings: observed.subject?.data.warnings || [],
      independent: stale && decision('independent') ? 'stale' : decision('independent')?.data.accepted ?? 'pending',
      humanBackend: stale && decision('human-backend') ? 'stale' : decision('human-backend')?.data.accepted ?? 'pending',
      currentNative: observed.currentNative, nativeDependenciesReverifiedByStatus: false, historyRetained: true, eventCount: state.events.length,
      calibratedFrame: false, runtimeAcceptance: false, promotion: false };
  }
  function optionsFor(state, request) {
    const asset = state.asset, value = read(state.root, asset.request, 65536), budget = value.request.budgets;
    const options = new Map([['root', state.root], ['task', asset.task], ['request', request], ['workspace', asset.workspace], ['media-state', asset.mediaState], ['media', asset.policy.media.path],
      ['timeout', String(budget.timeoutSeconds)], ['max-log-bytes', String(budget.maxLogBytes)], ['max-private-bytes', String(budget.maxProcessMemoryBytes)]]);
    if (asset.policy.selection) options.set('selection', asset.policy.selection.path);
    if (asset.platformModules) options.set('platform-modules', asset.platformModules.path);
    if (asset.ledgerRegistration) options.set('ledger-registration', asset.ledgerRegistration.path);
    return options;
  }
  function policyReferences(state) {
    const refs = [state.identity, ...state.asset.references, state.asset.technicalRequest, ...(state.asset.parent ? [state.asset.parent] : [])];
    return [...new Map(refs.map(ref => { const current = identity(state.root, ref); return [current.path, current]; })).values()];
  }
  function admittedContextReferences(state, context) {
    if (!Array.isArray(context.references) || context.references.length > 4096) fail('Bounded admitted native references required.');
    const request = read(state.root, state.asset.request, 65536), generated = latest(state, 'generation-returned');
    const sourcePaths = new Set([state.asset.source.path, generated?.data.source?.path].filter(Boolean));
    const payloadPaths = new Set((generated?.data.variants || []).map(variant => variant.payload.path));
    const found = new Map();
    for (const entry of context.references) {
      const declared = data(entry, ['path', 'sha256', 'kind'], ['path', 'sha256', 'kind'], 'admitted native reference');
      if (!['input', 'policy', 'rights', 'consent', 'review'].includes(declared.kind)) fail('Unsupported admitted reference kind.');
      let maximum = MAX_JSON;
      if (declared.kind === 'input') {
        if (sourcePaths.has(declared.path)) maximum = request.request.budgets.maxInputBytes;
        else if (payloadPaths.has(declared.path)) maximum = request.limits.maxOutputBytes;
        else if (declared.path === request.installation.path) maximum = 32 * 1024 * 1024;
        // Tools are a separate native collection. Do not turn a model/archive
        // input into an implicit weight or platform-module scan by status.
        else if (/\.(?:safetensors|ckpt|pt|pth|onnx|gguf|bin|dll|so|dylib|exe|whl|tar|gz)$/i.test(declared.path)) continue;
      }
      if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_FILE) fail('Invalid admitted reference byte bound.');
      const ref = identity(state.root, { path: declared.path, sha256: declared.sha256 }, maximum), bytes = fs.lstatSync(full(state.root, ref.path)).size;
      const value = { ...ref, kind: declared.kind, observedBytes: bytes }, key = process.platform === 'win32' ? ref.path.toLowerCase() : ref.path;
      if (found.has(key) && !equal(found.get(key), value)) fail('Conflicting admitted native reference closure.');
      found.set(key, value);
    }
    return [...found.values()];
  }
  function recheckContextReferences(state, entries) {
    for (const entry of entries) {
      const ref = identity(state.root, { path: entry.path, sha256: entry.sha256 }, entry.observedBytes);
      if (fs.lstatSync(full(state.root, ref.path)).size !== entry.observedBytes) fail('Admitted native reference size changed before return acceptance.');
    }
  }
  function envelope(state, operation, result) {
    if (!result || result.schemaVersion !== 'bubo-execution-result/v1' || result.apiVersion !== 2 || result.status !== 'succeeded' || result.workflow !== 'image-to-splat' || result.operation !== operation) fail('Successful exact native execution envelope required.');
    const dispatch = data(result.hostSplatDispatch, ['directory', 'hostContext', 'result', 'timing', 'buildReceipt', 'resourceCatalog', 'catalog'], ['directory', 'hostContext', 'result', 'timing', 'buildReceipt', 'resourceCatalog', 'catalog'], 'native dispatch');
    if (!runtime.within(full(state.root, `${CACHE}/tasks/${state.asset.task}/bubo-splats/dispatch`), full(state.root, dispatch.directory))) fail('Native dispatch belongs to another task.');
    const refs = [];
    for (const key of ['hostContext', 'result', 'timing', 'buildReceipt', 'resourceCatalog', 'catalog']) {
      const ref = identity(state.root, dispatch[key], MAX_JSON);
      if (!runtime.within(full(state.root, dispatch.directory), full(state.root, ref.path))) fail('Native dispatch reference escaped its owned directory.');
      refs.push(ref);
    }
    const { hostSplatDispatch, ...nativeEnvelope } = result;
    if (!equal(read(state.root, dispatch.result), nativeEnvelope) || result.hostContextSha256 !== dispatch.hostContext.sha256) fail('Native result or context differs from retained dispatch.');
    const context = read(state.root, dispatch.hostContext), build = read(state.root, dispatch.buildReceipt), current = nativeSummary();
    // The native splat envelope intentionally has no runtime field. Its exact
    // admitted build is retained by the trusted adapter as an immutable receipt;
    // do not enrich or rewrite the raw native response to invent that field.
    const producerBuild = build.capabilities?.build;
    if (context.task !== state.asset.task || context.policy?.pipeline !== 'LOCAL' || context.policy?.styleSha256 !== state.asset.policy.style.sha256
        || build.schemaVersion !== 'bubo-build/v1' || build.sourceDirty !== false || build.sourceRevision !== current.revision || !equal(current.build, producerBuild)
        || producerBuild?.resourceCatalogSha256 !== dispatch.resourceCatalog.sha256 || current.resourceCatalogSha256 !== dispatch.resourceCatalog.sha256) fail('Native policy/build/catalog ancestry differs.');
    const contextReferences = admittedContextReferences(state, context);
    return { references: [...new Map([...refs, ...contextReferences.map(({ path, sha256 }) => ({ path, sha256 }))].map(ref => [ref.path, ref])).values()],
      contextReferences, nativeIdentity: current, dispatch };
  }
  function packageData(state, packageRef) {
    const ref = identity(state.root, packageRef, 65536), value = read(state.root, ref, 65536), request = read(state.root, state.asset.request, 65536);
    const output = state.asset.workspace + '/staging/image-to-splat/' + state.asset.task + '/' + state.asset.runId;
    if (ref.path !== output + '/package.json' || value.schemaVersion !== 'bubo-splat-package/v1' || value.task !== state.asset.task || value.runId !== state.asset.runId
        || value.request?.sha256 !== state.asset.request.sha256 || value.source?.sha256 !== state.asset.source.sha256 || !equal(value.installation, request.installation)
        || value.humanReview !== 'pending' || value.promotion !== false || !Array.isArray(value.variants) || value.variants.length !== request.request.gaussianCounts.length) fail('Returned package differs from the exact owned request/version.');
    const refs = [ref, ...references(state.root, value)];
    const names = [value.source, value.request, value.workerResult, ...value.variants.flatMap(variant => [variant.artifact, variant.payload])].map(item => item.path);
    if (new Set(names).size !== names.length || names.some(name => path.posix.dirname(name) !== output)) fail('Package files are missing, aliased or outside immutable staging.');
    const actual = fs.readdirSync(full(state.root, output)).sort(), expected = ['package.json', ...names.map(name => path.posix.basename(name))].sort();
    if (!equal(actual, expected)) fail('Package inventory is incomplete or contains extra files.');
    if (!equal(read(state.root, value.request, 65536), request)) fail('Retained native request differs from lifecycle request.');
    value.variants.forEach((variant, index) => {
      const count = request.request.gaussianCounts[index], artifact = read(state.root, variant.artifact, 65536);
      if (variant.payload.path !== output + '/gaussian-' + count + '.ply' || variant.artifact.path !== output + '/artifact-' + count + '.json'
          || artifact.gaussianCount !== count || !equal(artifact.payload, variant.payload) || !equal(artifact.input, value.source)
          || artifact.ancestry?.requestSha256 !== state.asset.request.sha256 || artifact.ancestry?.runtimeBuildSha256 !== value.runtimeBuildSha256
          || artifact.ancestry?.resourceCatalogSha256 !== value.resourceCatalogSha256 || artifact.styleSha256 !== state.asset.policy.style.sha256) fail('Complete ordered package variant ancestry differs.');
    });
    return { ref, value, references: [...new Map(refs.map(item => [item.path, item])).values()] };
  }
  function mutate(options, action) {
    const initial = load(options);
    return lock(initial, () => { const state = load(options); fresh(state); return action(state); });
  }
  async function dispatch(options, operation) {
    return mutate(options, async state => {
      transition.assertProductionAllowed(state.root, 'image-to-splat ' + operation);
      const observed = fresh(state);
      if (operation === 'generate' && latest(state, 'generation-intent')) fail('This version already owns a generation intent; inspect retained outcome instead of retrying.');
      if (operation === 'verify-package' && !observed.generated) fail('An exact successful generated package is required before construction verification.');
      const kind = operation === 'generate' ? 'generation' : operation === 'verify-package' ? 'verification' : 'validation';
      const request = operation === 'generate' ? state.asset.request.path : operation === 'verify-package' ? observed.generated.data.package.path : state.asset.technicalRequest.path;
      const references = policyReferences(state), intent = append(state, kind + '-intent', { operation, request: identity(state.root, request), references });
      const hooks = operation === 'generate' ? {
        beforeLaunch: detail => append(state, 'native-before-launch', { intent, context: identity(state.root, detail.contextFile), references: [identity(state.root, detail.contextFile)] }),
        spawned: detail => append(state, 'native-started', { intent, pid: detail.pid, launchState: detail.launchState }),
        closed: detail => append(state, 'native-closed', { intent, pid: detail.pid, status: detail.status, signal: detail.signal, launchState: detail.launchState })
      } : undefined;
      try {
        const result = await adapter.invoke(operation, optionsFor(state, request), { emit: false, policyReferences: operation === 'generate' ? references : [], ...(hooks ? { lifecycle: hooks } : {}) });
        fresh(state); const checked = envelope(state, operation, result);
        let packageInfo = null;
        if (operation === 'generate') {
          const before = latest(state, 'native-before-launch'), started = latest(state, 'native-started'), closed = latest(state, 'native-closed');
          if (!before || !started || !closed || closed.data.status !== 0 || closed.data.launchState !== 'started'
              || !equal(before.data.intent, intent) || !equal(started.data.intent, intent) || !equal(closed.data.intent, intent)) fail('Successful generation requires complete owned native launch and close evidence.');
          if (result.data?.schemaVersion !== 'bubo-splat-generation-result/v1' || result.data.status !== 'generated-staged' || result.data.technicalOnly !== true
              || result.data.humanReview !== 'pending' || result.data.runtimeAcceptance !== false || result.data.promotion !== false) fail('Native generation grants technical staging only.');
          packageInfo = packageData(state, result.data.manifest);
          if (result.data.outputs !== packageInfo.value.variants.length || result.data.requestSha256 !== state.asset.request.sha256 || packageInfo.value.catalogSha256 !== checked.dispatch.catalog.sha256) fail('Native generation result differs from its complete package.');
        } else if (operation === 'verify-package') {
          if (result.data?.schemaVersion !== 'bubo-splat-package-verification/v1' || result.data.valid !== true || result.data.technicalOnly !== true
              || result.data.constructionRecordsVerified !== true || result.data.humanReview !== 'pending' || result.data.runtimeAcceptance !== false || result.data.promotion !== false || result.data.gpuUsed !== false) fail('Actual native construction verification is required.');
          packageInfo = packageData(state, observed.generated.data.package);
          if (result.data.variants !== packageInfo.value.variants.length) fail('Native verification omits a density variant.');
        } else if (result.data?.schemaVersion !== 'bubo-splat-request-validation/v1' || result.data.valid !== true || result.data.gpuUsed !== false) fail('Native request validation result differs.');
        const snapshot = put(state.root, state.directory + '/native/' + operation + '-' + crypto.randomUUID() + '.json', result);
        const refs = [snapshot, ...checked.references, ...(packageInfo ? packageInfo.references : [])];
        recheckContextReferences(state, checked.contextReferences);
        append(state, kind + '-returned', { intent, envelope: snapshot, references: [...new Map(refs.map(ref => [ref.path, ref])).values()], nativeIdentity: checked.nativeIdentity,
          contextReferences: checked.contextReferences,
          ...(packageInfo ? { package: packageInfo.ref, variants: packageInfo.value.variants.map(variant => ({ artifact: variant.artifact, payload: variant.payload })), source: packageInfo.value.source } : {}) });
        return { ...result.data, manifest: state.manifest, native: result, ...(packageInfo ? { package: packageInfo.ref } : {}) };
      } catch (error) {
        try { append(state, kind + '-failed', { intent, reason: 'Native operation or host evidence publication failed; inspect retained original dispatch and claims.', automaticRetry: false }); }
        catch { /* The immutable intent remains authoritative when failure bookkeeping is interrupted. */ }
        throw error;
      }
    });
  }
  function review(options, payload) {
    const input = data(payload, ['packet'], ['packet'], 'review payload');
    return mutate(options, state => {
      const observed = fresh(state);
      if (!observed.generated || !observed.verified || !equal(observed.generated.data.package, observed.verified.data.package)) fail('Current complete native construction verification is required before review.');
      const packet = identity(state.root, input.packet, MAX_JSON), value = read(state.root, packet);
      data(value, ['schemaVersion', 'package', 'original', 'variants', 'coverage', 'caveats', 'calibratedFrame', 'displayRollDegrees'], ['schemaVersion', 'package', 'original', 'variants', 'coverage', 'caveats', 'calibratedFrame', 'displayRollDegrees'], 'review packet');
      const checked = packageData(state, observed.generated.data.package);
      if (value.schemaVersion !== 'hephaera-splat-review-packet/v1' || !equal(value.package, checked.ref) || !equal(value.original, checked.value.source)
          || value.calibratedFrame !== false || ![0, 180].includes(value.displayRollDegrees) || !Array.isArray(value.variants) || value.variants.length !== checked.value.variants.length) fail('Review must bind the original and every ordered density without a calibration claim.');
      text(value.coverage, 'declared review coverage', 4096);
      if (!Array.isArray(value.caveats) || value.caveats.length > 64 || value.caveats.some(note => !text(note, 'review caveat', 4096))) fail('Bounded explicit caveats required.');
      const refs = [packet, ...checked.references], duplicateImageGroups = [];
      for (let index = 0; index < value.variants.length; index++) {
        const variant = data(value.variants[index], ['artifact', 'payload', 'views'], ['artifact', 'payload', 'views'], 'review variant'), expected = checked.value.variants[index];
        if (!equal(variant.artifact, expected.artifact) || !equal(variant.payload, expected.payload) || !Array.isArray(variant.views) || variant.views.length < 14 || variant.views.length > 64) fail('Review omits or substitutes a density or complete view coverage.');
        const ids = new Set(), canonicalViews = new Set(), orbit = new Set(), images = new Set(), cameras = new Set(), pixels = new Map();
        for (const item of variant.views) {
          const view = data(item, ['id', 'kind', 'angle', 'image', 'camera'], ['id', 'kind', 'angle', 'image', 'camera'], 'review view');
          id(view.id, 'view'); if (ids.has(view.id)) fail('Duplicate review view identity.'); ids.add(view.id);
          if (view.kind === 'canonical') {
            if (!CANONICAL.includes(view.angle) || canonicalViews.has(view.angle)) fail('Duplicate or unsupported canonical angle.'); canonicalViews.add(view.angle);
          } else if (view.kind === 'orbit') {
            if (!Number.isFinite(view.angle) || view.angle < 0 || view.angle >= 360 || orbit.has(view.angle)) fail('Duplicate or unsupported orbit yaw.'); orbit.add(view.angle);
          } else fail('Explicit canonical/orbit view kind required.');
          const image = identity(state.root, view.image, 32 * 1024 * 1024), camera = identity(state.root, view.camera, 1048576);
          if (images.has(image.path.toLowerCase()) || image.sha256 === checked.value.source.sha256) fail('Review reuses an image as another view or substitutes the original.'); images.add(image.path.toLowerCase());
          const cameraIdentity = canonical(camera);
          if (cameras.has(cameraIdentity)) fail('Review reuses an ambiguous camera identity for different declared views.'); cameras.add(cameraIdentity);
          const repeated = pixels.get(image.sha256) || [];
          repeated.push({ id: view.id, kind: view.kind, angle: view.angle, image, camera }); pixels.set(image.sha256, repeated);
          read(state.root, camera, 1048576); refs.push(image, camera);
        }
        const yaws = [...orbit].sort((a, b) => a - b);
        if (canonicalViews.size !== CANONICAL.length || yaws.length < 8 || yaws.some((yaw, i) => (i + 1 === yaws.length ? yaws[0] + 360 : yaws[i + 1]) - yaw > 45 + 1e-9)) fail('All canonical views and declared full orbit with maximum45-degree gap are required.');
        for (const [encodedImageSha256, views] of pixels) if (views.length > 1) duplicateImageGroups.push({ variant: index, artifact: variant.artifact, payload: variant.payload, encodedImageSha256, views });
      }
      const references = [...new Map(refs.map(ref => [ref.path, ref])).values()];
      const warnings = duplicateImageGroups.length ? ['Repeated encoded image-file hashes occur in distinct supplied view files. Review symmetry, camera records and coverage independently; declared metadata does not certify rendering.'] : [];
      const subjectSha256 = digest({ manifest: state.identity, policySha256: state.asset.policy.fingerprint, package: checked.ref,
        verification: observed.verified.identity, packet, references, duplicateImageGroups });
      const ref = append(state, 'review-packet', { packet, subjectSha256, references, duplicateImageGroups, warnings, coverage: value.coverage, caveats: value.caveats, calibratedFrame: false, displayRollDegrees: value.displayRollDegrees });
      return { schemaVersion: 'hephaera-splat-review-subject/v1', manifest: state.manifest, subjectSha256, event: ref, variants: value.variants.length,
        coverage: value.coverage, caveats: value.caveats, duplicateImageGroups, warnings, calibratedFrame: false, displayOnlyRollDegrees: value.displayRollDegrees, rendererVerified: false, runtimeAcceptance: false, promotion: false };
    });
  }
  function record(options, payload) {
    const input = data(payload, ['evidence'], ['evidence'], 'review decision payload');
    return mutate(options, state => {
      const observed = fresh(state);
      if (!observed.subject) fail('A current complete review subject is required.');
      const ref = identity(state.root, input.evidence, 1048576), value = read(state.root, ref, 1048576);
      data(value, ['schemaVersion', 'kind', 'subjectSha256', 'accepted', 'reviewer', 'decisionEvidence', 'notes'], ['schemaVersion', 'kind', 'subjectSha256', 'accepted', 'reviewer', 'decisionEvidence', 'notes'], 'review decision');
      if (value.schemaVersion !== 'hephaera-splat-review/v1' || !['independent', 'human-backend'].includes(value.kind) || value.subjectSha256 !== observed.subject.data.subjectSha256 || typeof value.accepted !== 'boolean') fail('Exact current review kind, subject and explicit decision required.');
      text(value.reviewer, 'reviewer', 200); text(value.notes, 'review notes', 4096);
      if (value.kind === 'independent' && value.reviewer.toLowerCase() === state.asset.creator.toLowerCase()) fail('Independent reviewer must differ from the creator.');
      const source = identity(state.root, value.decisionEvidence, 1048576);
      if (source.path === ref.path || source.path === observed.subject.data.packet.path) fail('A decision must cite separate actual source evidence, not itself or the review packet.');
      if (value.kind === 'human-backend' && value.accepted) {
        const independent = [...state.events].reverse().find(event => event.kind === 'review-decision' && event.data.kind === 'independent');
        if (!independent || !independent.data.accepted || independent.data.subjectSha256 !== value.subjectSha256) fail('Current independent acceptance precedes human backend acceptance.');
      }
      const event = append(state, 'review-decision', { kind: value.kind, accepted: value.accepted, reviewer: value.reviewer, subjectSha256: value.subjectSha256,
        evidence: ref, decisionEvidence: source, references: [ref, source] });
      return { schemaVersion: 'hephaera-splat-review-record/v1', manifest: state.manifest, event, kind: value.kind, accepted: value.accepted,
        subjectSha256: value.subjectSha256, sourceEvidenceRecorded: true, humanAuthenticityVerifiedByCode: false, runtimeAcceptance: false, promotion: false };
    });
  }
  return { init, load, status, validate: options => dispatch(options, 'validate'), generate: options => dispatch(options, 'generate'),
    verifyPackage: options => dispatch(options, 'verify-package'), review, record };
}
const defaults = createService();
module.exports = { ...defaults, createService, identity, paths };
