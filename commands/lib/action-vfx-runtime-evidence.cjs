'use strict';

// Thin, read-only native source-export admission and private evidence binding.
// No decoder, compiler, native fingerprint, review decision or promotion lives here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const runtime = require('./bubo-runtime.cjs');
const host = require('./bubo-host-adapter.cjs');
const maintenance = require('./installation-maintenance.cjs');
const transition = require('./state-transition.cjs');
const { canonical } = require('./action-vfx-admission.cjs');
const fail = message => { throw new Error(message); };
const HASH = /^[a-f0-9]{64}$/;
const equal = (left, right) => JSON.stringify(runtime.canonical(left)) === JSON.stringify(runtime.canonical(right));

function request(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).some(key =>
      typeof key !== 'string' || !keys.includes(key) || !('value' in Object.getOwnPropertyDescriptor(value, key))))
    fail('Unsupported action VFX request fields.');
}
function evidenceReferences(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== 3
      || Reflect.ownKeys(value).length !== 4) fail('Supply three plain exact runtime evidence references.');
  return [0, 1, 2].map(index => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) fail('Runtime evidence cannot contain accessors or sparse entries.');
    const item = descriptor.value;
    request(item, ['kind', 'path', 'sha256', 'bytes']);
    return { kind: item.kind, path: item.path, sha256: item.sha256, bytes: item.bytes };
  });
}
function bytes(root, value, maximum = 1073741824) {
  if (!value || !HASH.test(value.sha256 || '')) fail('Exact action VFX file SHA-256 required.');
  const file = canonical(root, value.path), before = fs.statSync(file);
  if (!before.isFile() || before.size < 1 || before.size > maximum
      || value.bytes !== undefined && value.bytes !== before.size) fail('Missing, oversized or changed action VFX file.');
  const data = fs.readFileSync(file), after = fs.statSync(file);
  if (data.byteLength !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || crypto.createHash('sha256').update(data).digest('hex') !== value.sha256)
    fail('Action VFX bytes changed during exact admission: ' + value.path);
  runtime.components(file);
  return data;
}
function identity(root, value, maximum) {
  const file = canonical(root, value), sha256 = runtime.hash(file);
  const data = bytes(root, { path: value, sha256 }, maximum);
  return { path: value, sha256, bytes: data.byteLength };
}
function jsonBytes(data) { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
function fresh(root, identities) { for (const value of identities) bytes(root, value, value.bytes); }
function save(root, name, data) {
  const file = canonical(root, name), fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return identity(root, name);
}

async function admit(value) {
  request(value, ['root', 'manifest', 'mode']);
  if (!['review', 'runtime'].includes(value.mode)) fail('Explicit action VFX admission mode review or runtime is required.');
  if (typeof value.root !== 'string' || !value.root) fail('Explicit resolved project root required.');
  const root = path.resolve(runtime.native(value.root)); runtime.components(root);
  transition.assertProductionAllowed(root, 'action VFX source-export admission');
  return maintenance.run(root, () => admitOwned(root, value));
}
async function admitOwned(root, value) {
  const manifest = identity(root, value.manifest, 8388608), state = jsonBytes(bytes(root, manifest, 8388608));
  if (state.schemaVersion !== 'hephaera-model-action/v2') fail('Source-export admission requires an explicit native action v2 manifest.');
  const stage = state.stages?.export;
  if (stage?.status !== 'complete' || !stage.artifacts?.package || !stage.artifacts?.glb)
    fail('A complete native action export is required for selected-engine evidence.');
  if (state.engine?.effectiveEngine !== 'THREEJS') fail('The selected action v2 engine bridge is unavailable.');
  const approvals = {};
  if (value.mode === 'runtime') for (const kind of ['action', 'independent', 'human']) {
    const matches = (state.approvals || []).filter(item => item.kind === kind);
    if (matches.length !== 1) fail('Runtime mode requires current native action, independent and human approvals.');
    approvals[kind] = { path: matches[0].evidence, sha256: matches[0].evidenceHash };
  }
  const info = runtime.verified(), options = host.parse(['--root', root, '--manifest', value.manifest]);
  const prepared = host.contextFor('model-to-action', 'validate', options, info);
  // Validation writes no manifest. Binding it as a read-only exact reference
  // connects the native result/context bytes to this complete approval snapshot.
  if (!prepared.context.references.some(item => item.path === manifest.path)) {
    if (prepared.context.references.length >= 4096) fail('Native manifest binding exceeds the host reference bound.');
    prepared.context.references.push({ path: manifest.path, sha256: manifest.sha256, kind: 'input' });
  }
  let ownership;
  await host.execute('model-to-action', 'validate', options, prepared, info, false,
    { beforeLaunch(detail) { ownership = detail; } });
  fresh(root, [manifest]);
  if (!ownership) fail('Actual native validation ownership receipt is missing.');
  const packageReference = { path: stage.artifacts.package, sha256: stage.outputs?.[stage.artifacts.package] };
  const modelReference = { path: stage.artifacts.glb, sha256: stage.outputs?.[stage.artifacts.glb] };
  const packageBytes = bytes(root, packageReference, 8388608), modelBytes = bytes(root, modelReference);
  const declaration = jsonBytes(packageBytes);
  if (declaration.schemaVersion !== 'hephaera-action-package/v2' || !HASH.test(declaration.effectClosureSha256 || '')
      || !equal(declaration.engine, state.engine) || !equal(declaration.model, modelReference)
      || !HASH.test(state.runtimeBuildSha256 || '')) fail('Native source-export identity changed after validation.');
  const identities = [manifest, { ...packageReference, bytes: packageBytes.length }, { ...modelReference, bytes: modelBytes.length }];
  let total = packageBytes.length + modelBytes.length;
  const maximum = declaration.budgets.maxRuntimeBytes + declaration.budgets.maxEffectDependencyBytes;
  function read(reference, limit = 1073741824) {
    const data = bytes(root, reference, Math.min(limit, maximum - total));
    total += data.length; identities.push({ ...reference, bytes: data.length }); return data;
  }
  const effectSources = declaration.effectSources.map(source => ({
    id: source.id, packageBytes: read(source.package, 4194304), profileBytes: read(source.profile, 4194304),
    resourceBytes: source.resources.map(resource => ({ id: resource.id, bytes: read(resource) })),
    correspondenceBytes: source.correspondences.map(item => ({ resourceId: item.resourceId, bytes: read(item.report, 4194304) }))
  }));
  const nativeVerification = identity(root, ownership.folder + '/result.json', 8388608);
  const hostContext = identity(root, ownership.contextFile, 8388608);
  if (hostContext.sha256 !== ownership.hostContextSha256) fail('Native host context changed after validation.');
  fresh(root, [...identities, nativeVerification, hostContext]);
  for (const item of prepared.context.references)
    if (runtime.hash(runtime.projectPath(root, item.path)) !== item.sha256) fail('Native admitted source/evidence changed after validation: ' + item.path);
  for (const item of prepared.context.tools)
    if (runtime.hash(item.path) !== item.sha256) fail('Selected native tool changed after validation.');
  // Reuse the canonical build verifier; no host implementation of its native
  // fingerprint or immutable publication inventory is introduced here.
  runtime.verified();
  const referenceOnly = ({ path: file, sha256 }) => ({ path: file, sha256 });
  const nativeAdmission = {
    schemaVersion: 'hephaera-action-v2-admission/v1', operation: 'validate', status: 'verified', mode: value.mode,
    sourceKind: 'native-source-export', engine: state.engine, packageSha256: packageReference.sha256,
    modelSha256: modelReference.sha256, effectClosureSha256: declaration.effectClosureSha256,
    runtimeBuildSha256: state.runtimeBuildSha256, nativeVerification: referenceOnly(nativeVerification),
    hostContext: referenceOnly(hostContext), manifest: referenceOnly(manifest),
    ...(value.mode === 'runtime' ? { runtimeAcceptance: approvals.independent, humanAcceptance: approvals.human } : {})
  };
  const admissionReceipt = save(root, ownership.folder + '/action-vfx-admission.json', JSON.stringify(nativeAdmission, null, 2) + '\n');
  return { nativeAdmission, packageBytes, modelBytes, effectSources, admissionReceipt };
}

async function bindReceiving(value) {
  request(value, ['root', 'manifest', 'receivingPath', 'evidence', 'destination']);
  const suppliedEvidence = evidenceReferences(value.evidence);
  if (typeof value.root !== 'string' || !value.root) fail('Explicit resolved project root required.');
  const root = path.resolve(runtime.native(value.root));
  transition.assertProductionAllowed(root, 'action VFX receiving evidence binding');
  return maintenance.run(root, async () => {
    const admitted = await admitOwned(root, { root, manifest: value.manifest, mode: 'review' });
    const manifest = jsonBytes(bytes(root, admitted.nativeAdmission.manifest, 8388608));
    const stateRoot = '.hephaera/.cache/tasks/' + manifest.task;
    const destination = value.destination;
    canonical(root, destination);
    if (!destination.startsWith(stateRoot + '/') || fs.existsSync(canonical(root, destination)))
      fail('Receiving metadata requires a fresh directory in the current task cache.');
    const identities = [], seen = new Map();
    const byteLimit = jsonBytes(admitted.packageBytes).budgets.maxEffectDependencyBytes;
    let observedBytes = 0;
    function observe(item, local = true) {
      if (!item || !Number.isSafeInteger(item.bytes) || item.bytes < 1
          || local && !item.path?.startsWith(stateRoot + '/')) fail('Receiving artifacts must be exact current-task files.');
      const previous = seen.get(item.path?.toLowerCase());
      if (previous && (previous.path !== item.path || previous.sha256 !== item.sha256 || previous.bytes !== item.bytes))
        fail('Receiving artifacts alias conflicting identities.');
      if (previous) return null;
      if (identities.length >= 4096 || item.bytes > byteLimit - observedBytes)
        fail('Receiving artifacts exceed the finite host file/byte envelope.');
      const data = bytes(root, item);
      seen.set(item.path.toLowerCase(), item); identities.push(item); observedBytes += data.length;
      return data;
    }
    const receiving = identity(root, value.receivingPath, 4194304);
    const receivingBytes = observe(receiving), packet = jsonBytes(receivingBytes), a = admitted.nativeAdmission;
    if (packet.modelSha256 !== a.modelSha256 || packet.packageSha256 !== a.packageSha256
        || packet.effectClosureSha256 !== a.effectClosureSha256 || packet.runtimeBuildSha256 !== a.runtimeBuildSha256
        || !equal(packet.engine, a.engine)) fail('Receiving packet differs from the current native source export.');
    if (new Set(suppliedEvidence.map(item => item.kind)).size !== 3
        || suppliedEvidence.some(item => !['runtime-test', 'runtime-capture', 'performance-profile'].includes(item.kind)))
      fail('Supply the three distinct actual runtime test/capture/performance artifact references.');
    for (const item of suppliedEvidence) observe(item);
    let count = 0;
    function artifacts(item, depth = 0) {
      if (++count > 200000 || depth > 16) fail('Receiving metadata exceeds the finite host envelope.');
      if (Array.isArray(item)) { for (const row of item) artifacts(row, depth + 1); return; }
      if (!item || typeof item !== 'object') return;
      if (typeof item.path === 'string') observe(item, !packet.engineInputs?.includes(item));
      for (const child of Object.values(item)) if (child && typeof child === 'object') artifacts(child, depth + 1);
    }
    artifacts(packet);
    fresh(root, identities);
    bytes(root, admitted.nativeAdmission.manifest, 8388608);
    const context = jsonBytes(bytes(root, admitted.nativeAdmission.hostContext, 8388608));
    for (const item of context.references) bytes(root, item);
    bytes(root, admitted.nativeAdmission.nativeVerification, 8388608);
    const destinationFolder = canonical(root, destination);
    fs.mkdirSync(path.dirname(destinationFolder), { recursive: true }); runtime.components(path.dirname(destinationFolder));
    // An intervening creator owns the directory; never adopt its partial files.
    fs.mkdirSync(destinationFolder); runtime.components(destinationFolder);
    const receivingReference = save(root, destination + '/receiving.json', receivingBytes);
    const envelope = {
      schemaVersion: 'bubo-action-runtime-evidence/v2', status: packet.status, engine: a.engine.effectiveEngine,
      engineIdentity: a.engine, modelSha256: a.modelSha256, packageSha256: a.packageSha256,
      runtimeBuildSha256: a.runtimeBuildSha256, effectClosureSha256: a.effectClosureSha256,
      receiving: receivingReference, evidence: suppliedEvidence
    };
    const evidence = save(root, destination + '/runtime-evidence.json', JSON.stringify(envelope, null, 2) + '\n');
    return { schemaVersion: 'hephaera-action-v2-receiving-binding/v1', status: 'pending-native-review',
      receiving: receivingReference, evidence, runtime: envelope };
  });
}

module.exports = { admit, bindReceiving };
