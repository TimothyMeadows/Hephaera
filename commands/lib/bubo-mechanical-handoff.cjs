'use strict';

// Admission and read scope only. Native Bubo owns assembly validation and the
// complete expected-source ledger, including freshness after ownership waits.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const runtime = require('./bubo-runtime.cjs');
const fail = message => { throw new Error(message); };
const HASH = /^[a-f0-9]{64}$/;
const NAMES = ['package', 'model', 'design', 'metadata', 'provenance', 'technicalReview', 'independentReview'];
const STATES = ['design', 'parts', 'assembly', 'export'];
function object(value, keys, label, optional = []) {
  if (!value || Array.isArray(value) || typeof value !== 'object'
    || Object.keys(value).some(key => !keys.includes(key))
    || keys.some(key => !optional.includes(key) && !Object.hasOwn(value, key))) fail('Invalid mechanical ' + label + ' fields.');
}
function prepare(root, workflow, operation, options, state) {
  if (workflow !== 'model-to-animation') {
    if (options.has('handoff')) fail('Mechanical handoff requires MODEL_TO_ANIMATION and its mechanical-assembly profile.');
    return null;
  }
  if (state && state.profile !== 'mechanical-assembly' && !options.has('handoff')) return null;
  const relative = value => path.relative(root, runtime.projectPath(root, value)).split(path.sep).join('/');
  const portable = value => {
    if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)
      || path.win32.isAbsolute(value) || value !== path.posix.normalize(value)) fail('Mechanical reference must be a canonical project-relative path.');
    // Package entries are relative to the package, not the project. Validate
    // their spelling here; inspect actual ancestors only after joining scope.
    runtime.syntax(value);
    return value;
  };
  function file(value, expected) {
    const name = relative(value), full = runtime.projectPath(root, name), stat = fs.statSync(full);
    if (!stat.isFile()) fail('Mechanical input must be a regular file: ' + name);
    const sha256 = runtime.hash(full);
    if (expected !== undefined && (!HASH.test(expected) || sha256 !== expected)) fail('Changed bound mechanical input: ' + name);
    return { path: name, full, sha256, bytes: stat.size };
  }
  function document(value, expected) {
    const item = file(value, expected);
    if (item.bytes < 2 || item.bytes > 8 * 1024 * 1024) fail('Mechanical JSON exceeds its byte bound.');
    const raw = fs.readFileSync(item.full), sha256 = crypto.createHash('sha256').update(raw).digest('hex');
    if (raw.length !== item.bytes || sha256 !== item.sha256 || !Buffer.from(raw.toString('utf8'), 'utf8').equals(raw)) fail('Mechanical JSON changed or is not UTF-8.');
    return { ...item, value: JSON.parse(raw.toString('utf8')) };
  }
  const recipeName = options.get('recipe') || state?.recipe;
  if (!recipeName) {
    if (options.has('handoff') || state?.profile === 'mechanical-assembly') fail('Mechanical receiving requires its bound recipe.');
    return null;
  }
  const recipeExpected = state ? state.originals?.[relative(recipeName)] : undefined;
  if (state && state.profile === 'mechanical-assembly' && !HASH.test(recipeExpected || '')) fail('Missing immutable mechanical recipe identity.');
  const recipe = document(recipeName, recipeExpected).value;
  if (recipe.profile !== 'mechanical-assembly') {
    if (options.has('handoff') || state?.profile === 'mechanical-assembly') fail('Mechanical handoff requires the mechanical-assembly profile.');
    return null;
  }
  if (state && state.profile !== 'mechanical-assembly') fail('Retained receiving profile changed.');
  const selected = state ? state.mechanicalHandoff : options.get('handoff');
  if (!selected) fail('Mechanical assembly requires an explicit reviewed --handoff.');
  const expected = state ? state.originals?.[relative(selected)] : undefined;
  if (state && !HASH.test(expected || '')) fail('Missing immutable mechanical handoff identity.');
  const descriptor = document(selected, expected), handoff = descriptor.value;
  object(handoff, ['schemaVersion', ...NAMES, 'components', 'bindings', 'sourceState', 'humanAcceptance'], 'handoff', ['humanAcceptance']);
  if (handoff.schemaVersion !== 'bubo-mechanical-assembly-handoff/v1') fail('Unsupported mechanical handoff schema.');
  const refs = new Map(), opaque = new Map(), typedHashes = new Set();
  const bind = (item, kind = 'input', isJson = false) => {
    const prior = refs.get(item.path);
    if (prior && prior.sha256 !== item.sha256) fail('Conflicting mechanical input identities.');
    refs.set(item.path, { path: item.path, sha256: item.sha256, kind });
    if (isJson) { opaque.set(item.path, item.sha256); typedHashes.add(item.sha256); }
  };
  bind(descriptor, 'input', true);
  const sources = {};
  for (const name of NAMES) {
    object(handoff[name], ['path', 'sha256'], name + ' reference');
    const entry = handoff[name]; portable(entry.path);
    const item = name === 'model' ? file(entry.path, entry.sha256) : document(entry.path, entry.sha256);
    sources[name] = item;
    bind(item, name.endsWith('Review') ? 'review' : 'input', name !== 'model');
  }
  if (operation === 'init' && relative(options.get('model') || fail('Mechanical receiving requires --model.')) !== sources.model.path) fail('Mechanical handoff substituted the selected model.');
  object(handoff.sourceState, STATES, 'source-state fence');
  const designState = handoff.sourceState.design;
  object(designState, ['path', 'sha256'], 'design-state reference');
  portable(designState.path);
  if (!designState.path.endsWith('/manifest.json')) fail('Mechanical source state must identify its design manifest.');
  const sourceStateRoot = path.posix.dirname(designState.path);
  for (const name of STATES) {
    const entry = handoff.sourceState[name]; object(entry, ['path', 'sha256'], name + ' state reference'); portable(entry.path);
    const wanted = path.posix.join(sourceStateRoot, name === 'design' ? 'manifest.json' : (name === 'export' ? 'exports' : name) + '.json');
    if (entry.path !== wanted) fail('Mechanical source-state fence changed its canonical siblings.');
    bind(document(entry.path, entry.sha256), 'input', true);
  }
  const pkg = sources.package.value;
  if (pkg.schemaVersion !== 'bubo-schematic-export-package/v1' || !Array.isArray(pkg.files) || pkg.files.length < 1 || pkg.files.length > 16384) fail('Invalid bounded mechanical package inventory.');
  if (path.posix.basename(sources.package.path) !== 'package.json') fail('Mechanical payload must identify its sealed package.json.');
  const packageRoot = path.posix.dirname(sources.package.path), packageDirectory = runtime.projectPath(root, packageRoot);
  const stateDirectory = runtime.projectPath(root, '.hephaera/.cache/tasks/' + (state?.task || options.get('task')));
  const staging = state?.staging || '.art-staging/model-to-animation/' + options.get('asset') + '/' + options.get('version');
  const stagingDirectory = runtime.projectPath(root, staging);
  if (runtime.within(packageDirectory, stateDirectory) || runtime.within(stateDirectory, packageDirectory)
    || runtime.within(packageDirectory, stagingDirectory) || runtime.within(stagingDirectory, packageDirectory)) fail('Mechanical read-only package scope overlaps receiving state or output.');
  const inventory = new Map(), aliases = new Set(); let bytes = 0;
  for (const entry of pkg.files) {
    if (!entry || typeof entry !== 'object') fail('Invalid mechanical payload entry.');
    const name = portable(entry.path);
    const located = path.posix.join(packageRoot, name), full = runtime.projectPath(root, located);
    if (!runtime.within(packageDirectory, full) || runtime.samePath(packageDirectory, full)) fail('Mechanical payload escapes its sealed directory.');
    const alias = located.toLowerCase();
    if (aliases.has(alias) || !HASH.test(entry.sha256 || '') || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > 17179869184 - bytes) fail('Invalid/ambiguous bounded mechanical payload inventory.');
    aliases.add(alias); bytes += entry.bytes;
    const item = file(located, entry.sha256);
    if (item.bytes !== entry.bytes) fail('Changed mechanical payload byte count: ' + located);
    inventory.set(located, { sha256: entry.sha256, bytes: entry.bytes });
    // This exact hash-checked leaf is data from the sealed inventory. JSON paths
    // inside it do not become host permissions through generic discovery.
    opaque.set(located, entry.sha256);
  }
  for (const name of ['model', 'design', 'metadata', 'provenance']) {
    if (inventory.get(sources[name].path)?.sha256 !== sources[name].sha256) fail('Mechanical ' + name + ' is outside its sealed inventory.');
  }
  if (state) {
    for (const [name, item] of inventory) {
      if (state.sourceInputs?.[name] !== item.sha256) fail('Retained mechanical source ledger omitted/changed a sealed payload: ' + name);
    }
    for (const name of ['mechanicalHandoff', 'mechanicalPackage', 'mechanicalDesign', 'mechanicalMetadata']) {
      const current = state[name];
      if (typeof current !== 'string' || !HASH.test(state.originals?.[current] || '')) fail('Missing immutable mechanical ancestry: ' + name);
      const item = document(current, state.originals[current]);
      if (!typedHashes.has(item.sha256)) fail('Immutable mechanical copy differs from the reviewed source.');
      opaque.set(item.path, item.sha256);
    }
    for (const [name, item] of refs) {
      if (name === descriptor.path) continue;
      if (state.sourceInputs?.[name] !== item.sha256) fail('Retained mechanical source ledger omitted/changed an expected input: ' + name);
    }
    for (const dictionary of [state.originals, state.sourceInputs, ...Object.values(state.stages || {}).map(stage => stage.inputs)].filter(Boolean)) {
      for (const [name, hash] of Object.entries(dictionary)) {
        if (typedHashes.has(hash)) opaque.set(portable(name), hash);
        if (inventory.has(name) && inventory.get(name).sha256 !== hash) fail('Retained payload expectation differs from its sealed inventory.');
      }
    }
  }
  return {
    packageRoot, references: [...refs.values()], inventory,
    isOpaque: (name, sha256) => opaque.get(name) === sha256,
    omitExactLeaf: (name, sha256) => {
      if (!inventory.has(name)) return false;
      if (inventory.get(name).sha256 !== sha256) fail('Changed sealed mechanical payload: ' + name);
      return !refs.has(name);
    }
  };
}
module.exports = { prepare };
