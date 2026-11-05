'use strict';

// Exact host read admission only. Bubo owns source/preparation validation,
// fingerprints, resource decoding, compilation and portable closure handling.
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('./bubo-runtime.cjs');
const fail = message => { throw new Error(message); };
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const KINDS = new Set(['input', 'policy', 'rights', 'review', 'consent']);
const RUNTIME_ENTRIES = Object.freeze({
  'action-driver': '.hephaera/.engine/threejs/actions/action-v2.mjs',
  'scene-scheduler': '.hephaera/.engine/threejs/actions/action-scene.mjs',
  'particle-runtime': '.hephaera/.engine/threejs/particles/three-quarks-runtime.mjs',
  'vfx-runtime': '.hephaera/.engine/threejs/particles/three-vfx-runtime.mjs',
  'postprocessing-runtime': '.hephaera/.engine/threejs/postprocessing/postprocessing-runtime.mjs'
});
const RUNTIME_SOURCES = Object.freeze([...Object.values(RUNTIME_ENTRIES),
  '.hephaera/.engine/threejs/actions/action-package.mjs',
  '.hephaera/.engine/threejs/particles/vfx-package.mjs']);
const MAX_RUNTIME_FILE_BYTES = 8 * 1024 * 1024;

function canonical(root, value) {
  if (typeof value !== 'string' || value.includes('\\') || path.posix.isAbsolute(value)
      || value.split('/').some(part => !part || part === '.' || part === '..'))
    fail('Action VFX references require canonical project-relative paths.');
  runtime.syntax(value);
  const file = runtime.projectPath(root, value);
  if (path.relative(root, file).split(path.sep).join('/') !== value)
    fail('Action VFX reference aliases a project path.');
  return file;
}
function array(value, name, maximum = 4096) {
  if (!Array.isArray(value) || value.length > maximum) fail('Missing or oversized action VFX ' + name + '.');
  return value;
}
function fields(value, allowed, name) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key)
        || !('value' in Object.getOwnPropertyDescriptor(value, key)))) fail('Invalid action VFX ' + name + ' fields.');
}

// The fixed owned runtime closure is host presentation evidence, not native
// asset policy. A captured private copy cannot replace an installed identity.
function collectRuntimeSources({ root, receiving, stateRoot, reference }) {
  const inputs = array(receiving?.engineInputs, 'receiving engine inputs', 10);
  const inventoryRows = inputs.filter(item => item.role === 'library-inventory');
  if (inventoryRows.length !== 1) fail('Receiving evidence requires one typed library-inventory wrapper.');
  const references = [];
  function exact(item, local = false) {
    fields(item, ['path', 'sha256', 'bytes'], 'runtime source reference');
    const file = canonical(root, item.path), stat = fs.statSync(file);
    if (!HASH.test(item.sha256 || '') || !Number.isSafeInteger(item.bytes) || item.bytes < 1
        || item.bytes > MAX_RUNTIME_FILE_BYTES || !stat.isFile() || stat.size !== item.bytes
        || local && !item.path.startsWith(stateRoot + '/')) fail('Runtime source/report requires exact bounded current file bytes.');
    if (runtime.hash(file) !== item.sha256 || fs.statSync(file).size !== item.bytes)
      fail('Current canonical runtime source/report changed: ' + item.path);
    reference(item.path, 'input', item.sha256);
    references.push({ path: item.path, sha256: item.sha256, bytes: item.bytes });
    return file;
  }
  const row = inventoryRows[0];
  const inventoryFile = exact({ path: row.path, sha256: row.sha256, bytes: row.bytes }, true);
  const inventory = runtime.json(inventoryFile);
  fields(inventory, ['schemaVersion', 'report', 'runtimeSources'], 'library inventory');
  if (inventory.schemaVersion !== 'hephaera-action-vfx-library-inventory/v1')
    fail('Receiving evidence requires the typed current-runtime library-inventory wrapper.');
  if (typeof inventory.report?.path !== 'string' || !inventory.report.path.endsWith('.json'))
    fail('The factual captured library report must be an exact JSON artifact.');
  exact(inventory.report, true); // Opaque factual report; no library discovery or execution.
  const sources = array(inventory.runtimeSources, 'runtime source closure', RUNTIME_SOURCES.length);
  if (sources.length !== RUNTIME_SOURCES.length) fail('Receiving runtime source closure is incomplete.');
  const required = new Set(RUNTIME_SOURCES), observed = new Map();
  let sourceBytes = 0;
  for (const item of sources) {
    if (!required.delete(item?.path)) fail('Receiving runtime source closure has an unknown, duplicate or noncanonical module.');
    if (!Number.isSafeInteger(item.bytes) || item.bytes > 16 * 1024 * 1024 - sourceBytes)
      fail('Receiving runtime source closure exceeds its finite byte envelope.');
    exact(item); sourceBytes += item.bytes; observed.set(item.path, item);
  }
  for (const [role, expectedPath] of Object.entries(RUNTIME_ENTRIES)) {
    const rows = inputs.filter(item => item.role === role), source = observed.get(expectedPath);
    if (rows.length !== 1 || rows[0].path !== expectedPath || rows[0].sha256 !== source.sha256 || rows[0].bytes !== source.bytes)
      fail('Receiving ' + role + ' must match its current canonical runtime source identity.');
  }
  return { references };
}

function collect({ root, recipe, stateRoot, reference }) {
  if (recipe?.schemaVersion !== 2) return { inputs: [] };
  const inputs = new Set(), seen = new Map();
  function exact(value, kind = 'input') {
    if (!value || typeof value !== 'object' || !HASH.test(value.sha256 || '') || !KINDS.has(kind))
      fail('Action VFX admission requires exact typed file references.');
    const file = canonical(root, value.path), stat = fs.statSync(file);
    if (!stat.isFile() || stat.size < 1 || stat.size > 1073741824
        || value.bytes !== undefined && (!Number.isSafeInteger(value.bytes) || value.bytes !== stat.size))
      fail('Action VFX referenced file has a missing or changed finite length: ' + value.path);
    const previous = seen.get(value.path.toLowerCase());
    if (previous && (previous.path !== value.path || previous.sha256 !== value.sha256
        || previous.kind !== kind && previous.kind !== 'input' && kind !== 'input'))
      fail('Action VFX references alias conflicting identities or evidence kinds.');
    const selectedKind = previous?.kind && kind === 'input' ? previous.kind : kind;
    reference(value.path, selectedKind, value.sha256);
    seen.set(value.path.toLowerCase(), { path: value.path, sha256: value.sha256, kind: selectedKind });
    return file;
  }
  function json(value, kind) { return runtime.json(exact(value, kind)); }
  function child(directory, relative) {
    canonical(root, relative); // Check before joining; joining must not erase traversal.
    const result = directory ? directory + '/' + relative : relative;
    canonical(root, result); return result;
  }
  function originalContext(source, seal, request, output) {
    let originalState = stateRoot;
    if (source.preparationContext) {
      const context = json(source.preparationContext), expectedState = '.hephaera/.cache/tasks/' + seal.taskId;
      if (!ID.test(seal.taskId || '') || seal.taskId === '..' || context.task !== seal.taskId
          || typeof context.projectRoot !== 'string' || !context.projectRoot
          || !runtime.samePath(path.resolve(runtime.native(context.projectRoot || '')), root)
          || context.roots?.state !== expectedState)
        fail('Preparation context must retain its canonical original task in the same project.');
      originalState = expectedState;
      if (context.permissions?.provisioning !== false || context.permissions?.promotion !== false
          || array(context.tools, 'preparation tools').length || array(context.roots.tools, 'preparation tool roots').length)
        fail('Original preparation context cannot expand tool or write authority.');
      const parents = new Set(array(request.sources, 'preparation sources', 1024).map(item => path.posix.dirname(item.path)));
      function scope(value) {
        canonical(root, value);
        if (value === '.art-staging' || value === output || value === expectedState
            || value.startsWith(expectedState + '/')) return;
        if (!parents.has(value) || /^(?:\.hephaera(?:\/\.cache(?:\/tasks)?)?|assets\/models)$/.test(value))
          fail('Original preparation context requests a broad or unrelated read scope.');
        inputs.add(value);
      }
      scope(context.roots.state); scope(context.roots.staging);
      if (context.roots.mediaState !== undefined) scope(context.roots.mediaState);
      for (const value of array(context.roots.inputs, 'preparation input roots')) scope(value);
      for (const value of array(context.roots.outputs, 'preparation output roots')) scope(value);
      if (originalState !== stateRoot) inputs.add(originalState);
      for (const item of array(context.references, 'preparation context references')) {
        if (item.path === source.productionReview.path)
          fail('Preparation context cannot hash-reference its dependent production review.');
        exact(item, item.kind);
      }
    }
    else if (seal.taskId !== stateRoot.slice('.hephaera/.cache/tasks/'.length))
      fail('Cross-task preparation reuse requires its explicit original context.');
    const started = array(seal.files, 'preparation files', 260).find(item => item.path === 'started.json');
    if (!started || !ID.test(seal.id || '') || !ID.test(seal.version || '')) fail('Preparation seal omits its permanent claim identity.');
    exact({ path: originalState + '/vfx-preparation/' + seal.id + '/' + seal.version + '.json', sha256: started.sha256, bytes: started.bytes });
  }
  for (const source of array(recipe.effectSources, 'effect sources', 64)) {
    const declaration = json(source.package), directory = path.posix.dirname(source.package.path);
    json(source.profile);
    for (const item of array(declaration.resources, 'native resources', 1024))
      exact({ path: child(directory === '.' ? '' : directory, item.path), sha256: item.sha256, bytes: item.bytes });
    for (const correspondence of array(source.correspondences, 'canonical correspondences', 1024)) json(correspondence.report);
    const rights = json(source.rights, 'rights');
    for (const item of array(rights.inputs, 'rights inputs', 1024)) exact(item);
    const production = json(source.productionReview, 'review');
    for (const item of array(production.evidence, 'production evidence', 1024)) exact(item, 'review');
    if (source.preparation) {
      const seal = json(source.preparation);
      if (!source.preparation.path.endsWith('/preparation.json')) fail('Preparation must retain its exact native seal path.');
      const output = source.preparation.path.slice(0, -'/preparation.json'.length);
      for (const item of array(seal.files, 'preparation files', 260))
        exact({ path: child(output, item.path), sha256: item.sha256, bytes: item.bytes });
      const request = json({ path: seal.requestPath, sha256: seal.requestSha256 });
      for (const item of array(request.sources, 'preparation sources', 1024)) exact(item);
      originalContext(source, seal, request, output);
    } else if (source.preparationContext) fail('An original preparation context needs its exact native preparation seal.');
  }
  return { inputs: [...inputs] };
}

// Receiving artifacts remain private current-task evidence. Only the native
// receiver interprets coverage, tests, performance and acceptance assertions.
function collectReceiving({ root, evidence, stateRoot, reference }) {
  if (!evidence?.runtime || evidence.runtime.schemaVersion !== 'bubo-action-runtime-evidence/v2') return;
  function exact(item, kind, local = true) {
    const full = canonical(root, item?.path);
    if (!HASH.test(item.sha256 || '') || !Number.isSafeInteger(item.bytes) || item.bytes < 1
        || !fs.statSync(full).isFile() || fs.statSync(full).size !== item.bytes
        || local && !item.path.startsWith(stateRoot + '/')) fail('Receiving evidence requires exact current-task artifact bytes.');
    reference(item.path, kind, item.sha256); return full;
  }
  for (const item of array(evidence.runtime.evidence, 'runtime evidence', 3)) exact(item, 'review');
  const receiving = runtime.json(exact(evidence.runtime.receiving, 'review'));
  for (const item of array(receiving.engineInputs, 'receiving engine inputs', 10)) exact(item, 'input', false);
  collectRuntimeSources({ root, receiving, stateRoot, reference });
}

module.exports = { collect, collectReceiving, collectRuntimeSources, canonical };
