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
}

module.exports = { collect, collectReceiving, canonical };
