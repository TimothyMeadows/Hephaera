'use strict';

// Hephaera owns policy and caller scope. Bubo owns every execution algorithm.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const runtime = require('./bubo-runtime.cjs');
const transition = require('./state-transition.cjs');
const engines = require('./engine-contract.cjs');
const styles = require('./style-contract.cjs');
const mechanicalHandoff = require('./bubo-mechanical-handoff.cjs');
const actionVfx = require('./action-vfx-admission.cjs');
const fail = message => { throw new Error(message); };
const IDS = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const FILE_FLAGS = new Set(['rights', 'recipe', 'toolchain', 'selection', 'library-search', 'evidence', 'proof-set', 'classification', 'finish-settings', 'finish-budget', 'revision', 'source-review', 'sources', 'proof', 'model', 'motion-package', 'motion-source', 'mapping', 'brief', 'proof-metadata', 'source-metadata', 'editable-source', 'artifact', 'source', 'handoff']);
const PATH_FIELDS = new Set(['path', 'image', 'stagedPath', 'copyEvidence', 'handoff', 'preparedGlb', 'authoringEvidence', 'generationManifest', 'generationReceipt', 'authorization', 'mediaContract', 'proof', 'rights', 'recipe', 'toolchain', 'brief', 'sourceSet', 'classification', 'proofSet', 'evidence', 'reviewEvidence', 'motionPackage', 'mapping', 'model', 'editableSource', 'receipt', 'sourceReview']);
function parse(values) {
  const options = new Map();
  for (let index = 0; index < values.length; index++) {
    const name = values[index];
    if (name === '--host-style-sha256') fail('Hephaera supplies protected execution option --host-style-sha256.');
    if (!/^--[a-z][a-z-]*$/.test(name) || options.has(name.slice(2))) fail('Expected unique --option value arguments.');
    const key = name.slice(2);
    const value = key === 'execute' && (index + 1 === values.length || values[index + 1].startsWith('--')) ? 'true'
      : index + 1 < values.length && !values[index + 1].startsWith('--') ? values[++index] : fail('Missing value for ' + name);
    if (['host-context', 'api-version', 'baseline-root', 'state-root', 'staging-root', 'runtime-build-sha256', 'runtime-resource-catalog-sha256', 'host-style-sha256'].includes(key)) fail('Hephaera supplies protected execution option --' + key + '.');
    if (key === 'execute' && value !== 'true') fail('--execute accepts only true; omit it for dry-run setup.');
    options.set(key, value);
  }
  return options;
}
function bash() {
  if (process.env.HEPHAERA_BASH) { runtime.components(process.env.HEPHAERA_BASH); return process.env.HEPHAERA_BASH; }
  if (process.platform === 'win32') {
    for (const folder of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      const candidate = path.join(folder, 'Git/bin/bash.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  const result = process.platform === 'win32' ? cp.spawnSync('where.exe', ['bash'], { encoding: 'utf8', windowsHide: true }) : cp.spawnSync('which', ['bash'], { encoding: 'utf8' });
  const found = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : null;
  if (!found) fail('An existing Bash runtime is required by Hephaera policy resolvers; nothing was installed.');
  return found;
}
function policyCommand(command, args, root, asJson = true) {
  const shellPath = value => process.platform === 'win32' ? value.replace(/\\/g, '/') : value;
  const value = runtime.run(bash(), [shellPath(path.join(runtime.BASE, 'commands', command)), ...args.map(shellPath)], { env: { ...process.env, HEPHAERA_PROJECT_ROOT: shellPath(root) } });
  return asJson ? JSON.parse(value) : value;
}
function executable(value, root, required = false) {
  if (!value) return null;
  value = runtime.native(value);
  let full;
  if (path.isAbsolute(value) || value.includes('/') || value.includes('\\')) full = path.resolve(root, value);
  else {
    const result = cp.spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [value], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (result.status === 0) full = result.stdout.trim().split(/\r?\n/)[0];
  }
  if (!full || !fs.existsSync(full)) { if (required) fail('Selected existing executable is unavailable: ' + value + '. No tool was installed.'); return null; }
  runtime.components(full);
  if (!fs.statSync(full).isFile()) fail('Selected executable must be a regular file.');
  return full;
}
function contextFor(workflow, operation, options, info) {
  const rootArg = options.get('root');
  if (!rootArg) fail('Explicit resolved --root is required; Hephaera never infers a workspace parent.');
  const root = path.resolve(runtime.native(rootArg)); runtime.components(root);
  runtime.syntax(root);
  if (!fs.statSync(root).isDirectory()) fail('Project root must be a real directory.');
  const relative = value => path.relative(root, runtime.projectPath(root, value)).split(path.sep).join('/');
  const manifest = options.get('manifest');
  const state = manifest && fs.existsSync(runtime.projectPath(root, manifest)) ? runtime.json(runtime.projectPath(root, manifest)) : null;
  const task = options.get('task') || state?.task;
  if (!IDS.test(task || '') || task === '..') fail('A safe --task (init) or current task-owned manifest is required.');
  if (options.has('task') && state && state.task !== task) fail('Manifest/task ownership mismatch.');
  const effectInspection = workflow === 'model-to-action' && operation === 'inspect-effects';
  if (operation !== 'init' && !effectInspection && (!state || !manifest)) fail('A current --manifest is required.');
  if (state && (!state.hostPolicySha256 || !state.runtimeBuildSha256)) fail('Historical pre-extraction state is preserved. Initialize a new asset version with retained ancestry and fresh affected verification; do not rewrite old approvals.');
  const stateRoot = '.hephaera/.cache/tasks/' + task;
  if (manifest && !relative(manifest).startsWith(stateRoot + '/')) fail('Manifest must stay in the active canonical task cache.');
  const actionRecipePath = workflow === 'model-to-action' && (options.get('recipe') || state?.recipe);
  const actionRecipe = actionRecipePath ? runtime.json(runtime.projectPath(root, actionRecipePath)) : null;
  const actionV2 = actionRecipe?.schemaVersion === 2;
  if (effectInspection && !actionV2) fail('inspect-effects requires an explicit action recipe v2.');
  const references = new Map(); const tools = new Map(); const visitedJson = new Set(); const admittedHashes = new Map();
  let mechanical = null;
  function reference(value, kind = 'input', expected) {
    const file = runtime.projectPath(root, value), rel = relative(file);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail('Missing referenced input: ' + rel);
    const actual = runtime.hash(file);
    if (expected !== undefined && actual !== expected) fail('Retained source changed: ' + rel);
    admittedHashes.set(rel, actual);
    if (mechanical?.omitExactLeaf(rel, actual)) return file;
    const previous = references.get(rel);
    references.set(rel, { path: rel, sha256: actual, kind: previous?.kind === 'policy' ? 'policy' : kind });
    if (references.size > 4096) fail('Host reference bound exceeded; narrow the input set.');
    return file;
  }
  function discover(value, depth = 0) {
    if (depth > 32) fail('Nested input metadata exceeds the host bound.');
    if (Array.isArray(value)) { for (const item of value) discover(item, depth + 1); return; }
    if (!value || typeof value !== 'object') return;
    // Typed v2 collectors admit these exact files without recursively treating
    // native package-relative paths or original host roots as generic metadata.
    if (actionV2 && ['bubo-host-context/v1', 'bubo-vfx-preparation-result/v1', 'bubo-vfx-package/v1', 'bubo-vfx-package/v2',
      'bubo-action-runtime-evidence/v2', 'bubo-action-effect-receiving/v1'].includes(value.schemaVersion)) return;
    for (const [key, item] of Object.entries(value)) {
      if (actionV2 && key === 'effectSources') continue;
      if (['engine', 'blender'].includes(key) && item && typeof item === 'object' && typeof item.path === 'string') continue; // Exact executable admission is separate below.
      if (key === 'libraryArtifactHashes' && item && typeof item === 'object') {
        for (const [name, expected] of Object.entries(item)) { const file = reference(name); if (runtime.hash(file) !== expected) fail('Library-copy ancestry changed: ' + name); }
      } else if (PATH_FIELDS.has(key) && typeof item === 'string' && item && !/^[a-z][a-z0-9+.-]*:\/\//i.test(item)) {
        if (item.startsWith('unavailable:')) continue;
        let located;
        try { located = runtime.projectPath(root, item); }
        catch (error) {
          // These schema fields also carry human descriptions (for example a
          // generation receipt's inputs[].rights). Explicit CLI files above
          // stay strict; Bubo validates each actual file field before use.
          if (['rights', 'proof', 'recipe', 'brief', 'model'].includes(key)) continue;
          throw error;
        }
        if (fs.existsSync(located) && fs.statSync(located).isFile()) input(item);
      } else if (item && typeof item === 'object') discover(item, depth + 1);
    }
  }
  function input(value, kind, expected) {
    const file = reference(value, kind, expected), rel = relative(file);
    if (path.extname(file).toLowerCase() === '.json' && !visitedJson.has(file) && !mechanical?.isOpaque(rel, admittedHashes.get(rel))) { visitedJson.add(file); discover(runtime.json(file)); }
    return file;
  }
  mechanical = mechanicalHandoff.prepare(root, workflow, operation, options, state);
  for (const item of mechanical?.references || []) reference(item.path, item.kind, item.sha256);
  const styleFile = reference('STYLE.md', 'policy');
  const styleInfo = styles.validate(styleFile);
  let selectedOverride = null;
  const retainedSelection = state && path.posix.join(path.posix.dirname(relative(manifest)), 'pipeline-selection.json');
  const selectionPath = options.get('selection') || (retainedSelection && fs.existsSync(runtime.projectPath(root, retainedSelection)) ? retainedSelection : null);
  if (selectionPath) {
    input(selectionPath, 'policy');
    const selected = runtime.json(runtime.projectPath(root, selectionPath));
    if (selected.schemaVersion !== 1 || !['prompt', 'style'].includes(selected.selectionSource) || selected.fallbackPolicy !== 'stop'
      || relative(selected.styleContract) !== 'STYLE.md' || selected.styleSha256 !== runtime.hash(styleFile)
      || selected.styleContractHash && selected.styleContractHash !== selected.styleSha256) fail('Prompt pipeline selection is stale or inconsistent.');
    if (selected.selectionSource === 'style' && selected.pipeline !== styleInfo.primary) fail('Retained primary selection changed.');
    if (selected.selectionSource === 'prompt') selectedOverride = selected.pipeline;
  }
  const selection = styles.resolve(root, styleFile, selectedOverride ? { override: selectedOverride } : {}, styleInfo);
  if (workflow === 'proof-to-model' && selection.pipeline !== 'PROOF_TO_MODEL') fail('Proof production requires selected PROOF_TO_MODEL; no pipeline fallback occurred.');
  const engine = engines.resolve(root);
  if (engine.outputScope || engine.selectionSource === 'prompt') fail('These production workflows do not accept a prototype engine override.');
  if (actionV2 && engine.effectiveEngine !== 'THREEJS') fail('Action v2 production bridge is unavailable for the selected engine; no fallback occurred.');
  for (const name of ['ENGINE.md', 'ARCHITECTURE.md']) if (fs.existsSync(path.join(root, name))) reference(name, 'policy');
  for (const name of ['.engine/registry.json', '.engine/' + engine.projectEngine + '.md']) {
    const file = path.join(runtime.BASE, name);
    if (runtime.within(root, file)) reference(file, 'policy');
  }
  const libraries = styleInfo.libraries.map(item => ({ id: item.id, root: item.path }));
  const policy = { pipeline: selection.pipeline, styleSha256: runtime.hash(styleFile), engine, libraries };
  if (!mechanical && fs.existsSync(path.join(root, 'MEDIA.md'))) { const file = reference('MEDIA.md', 'policy'); policy.media = { path: relative(file), sha256: runtime.hash(file) }; }
  for (const [name, value] of options) if (FILE_FLAGS.has(name)) input(value, name === 'rights' ? 'rights' : ['evidence', 'source-review'].includes(name) ? 'review' : 'input');
  if (options.has('reuse-manifest')) input(options.get('reuse-manifest'), 'input');
  if (state) {
    for (const name of ['rights', 'recipe', 'toolchain', 'brief', 'proofMetadata', 'sourceMetadata', 'sourceReview']) if (state[name]) input(state[name], name === 'rights' ? 'rights' : name === 'sourceReview' ? 'review' : 'input');
    for (const dictionary of [state.originals, state.sourceInputs, ...Object.values(state.stages || {}).map(stage => stage.inputs)].filter(Boolean)) for (const [name, expected] of Object.entries(dictionary)) {
      input(name, 'input', expected);
    }
  }
  // Procedural assemblies do not acquire an ambient media policy. An explicit
  // or historical media input remains bound and retains its policy identity.
  if (mechanical && references.has('MEDIA.md')) { const file = reference('MEDIA.md', 'policy'); policy.media = { path: relative(file), sha256: runtime.hash(file) }; }
  const configs = [];
  for (const value of [options.get('toolchain'), options.get('recipe'), state?.toolchain, state?.recipe].filter(Boolean)) configs.push(runtime.json(runtime.projectPath(root, value)));
  function tool(value, required = false) {
    const file = executable(value, root, required);
    if (file && !tools.has(file)) tools.set(file, { path: file, sha256: runtime.hash(file), kind: 'selected-native-tool' });
  }
  if (!effectInspection) tool(options.get('blender'), options.has('blender'));
  if (!effectInspection) for (const config of configs) { tool(process.platform !== 'win32' ? config.engine?.path?.replace(/\.exe$/, '') : config.engine?.path); tool(config.blender?.path); }
  const nativeOperation = new Set(['finish', 'review', 'inspect', 'prepare', 'rig', 'author', 'retarget', 'bake', 'export', 'compose', 'doctor']);
  if (!effectInspection && (workflow !== 'proof-to-model' || nativeOperation.has(operation))) tool(options.get('blender') || configs.find(item => item.blender)?.blender.path || 'blender');
  if (workflow === 'proof-to-model') { tool('nvidia-smi'); tool('nvcc'); }
  if (!effectInspection) for (const stage of Object.values(state?.stages || {})) for (const name of Object.keys(stage.externalInputs || {})) {
    const file = path.resolve(runtime.native(name));
    if (!runtime.within(info.folder, file)) tool(file, true);
  }
  if (!effectInspection && state?.blender) tool(state.blender, true);
  for (const file of tools.keys()) if (runtime.within(root, file)) references.delete(relative(file));
  const inputs = [];
  if (actionV2) {
    const admitted = actionVfx.collect({ root, recipe: actionRecipe, stateRoot, reference });
    for (const scope of admitted.inputs) if (!inputs.includes(scope)) inputs.push(scope);
    for (const approval of state?.approvals || []) reference(approval.evidence, 'review', approval.evidenceHash);
    const evidencePaths = [options.get('evidence'), ...(state?.approvals || []).map(item => item.evidence)].filter(Boolean);
    if (!effectInspection) for (const value of evidencePaths) actionVfx.collectReceiving({ root, evidence: runtime.json(runtime.projectPath(root, value)), stateRoot, reference });
  }
  if (mechanical) inputs.push(mechanical.packageRoot);
  if (!(operation === 'setup' && options.get('execute') === 'true')) for (const config of configs) if (config.modelDir) {
    const directory = relative(config.modelDir);
    if (!inputs.includes(directory)) inputs.push(directory);
  }
  // The whole verified publication is read-only; motion/action bind shared DLLs
  // as baseline inputs as well as the catalog's execution resources.
  if (runtime.within(root, info.folder)) inputs.push(relative(info.folder));
  const declaredTimeouts = configs.map(item => item.limits?.timeoutSeconds ?? item.budgets?.timeoutSeconds).filter(value => value !== undefined);
  if (declaredTimeouts.some(value => !Number.isSafeInteger(value) || value < 1 || value > 86400)) fail('Invalid finite native timeout in selected configuration.');
  const requestedTimeout = options.has('timeout') ? Number(options.get('timeout')) : 1;
  if (!Number.isSafeInteger(requestedTimeout) || requestedTimeout < 1 || requestedTimeout > 86400) fail('Invalid finite requested timeout.');
  const timeoutSeconds = Math.max(1800, requestedTimeout, ...declaredTimeouts);
  const declaredLogs = configs.map(item => item.limits?.maxLogBytes ?? item.budgets?.maxLogBytes).filter(value => value !== undefined);
  if (declaredLogs.some(value => !Number.isSafeInteger(value) || value < 1 || value > 1073741824)) fail('Invalid finite native log bound.');
  const context = { schemaVersion: 'bubo-host-context/v1', projectRoot: root, task,
    roots: { state: stateRoot, staging: '.art-staging', tools: ['.local/tools'], inputs, outputs: ['assets/models'] }, policy,
    references: [...references.values()], tools: [...tools.values()], budgets: { timeoutSeconds, maxLogBytes: Math.max(16777216, ...declaredLogs) },
    permissions: { provisioning: operation === 'setup' && options.get('execute') === 'true', promotion: operation === 'promote' } };
  return { root, task, stateRoot, context, options };
}
async function invoke(workflow, operation, options) {
  return require('./installation-maintenance.cjs').run(path.resolve(runtime.native(options.get('root') || process.cwd())), () => invokeOwned(workflow, operation, options));
}
async function invokeOwned(workflow, operation, options) {
  const started = performance.now(), info = runtime.verified(), admitted = performance.now();
  const prepared = contextFor(workflow, operation, options, info);
  prepared.timings = { runtimeAdmissionMilliseconds: admitted - started, hostPolicyMilliseconds: performance.now() - admitted };
  return execute(workflow, operation, options, prepared, info);
}
async function execute(workflow, operation, options, prepared, info, emit = true, lifecycle) {
  // Trusted compiled callers may persist ownership. Hooks are never accepted
  // through recipe JSON, CLI options or the native execution contract.
  if (lifecycle !== undefined && (!lifecycle || typeof lifecycle !== 'object' || Array.isArray(lifecycle)
      || Object.keys(lifecycle).some(key => !['beforeLaunch', 'spawned', 'closed'].includes(key) || typeof lifecycle[key] !== 'function')))
    fail('Native lifecycle hooks require a fixed compiled caller.');
  return require('./installation-maintenance.cjs').run(prepared.root, () => executeOwned(workflow, operation, options, prepared, info, emit, lifecycle));
}
async function executeOwned(workflow, operation, options, prepared, info, emit = true, lifecycle) {
  const readOnlyInspection=workflow==='blender-inspection'&&operation==='inspect'&&prepared.context?.policy?.purpose==='read-only-blender-inspection';
  if(!readOnlyInspection)transition.assertProductionAllowed(prepared.root,workflow+' '+operation);
  const folder = runtime.projectPath(prepared.root, prepared.stateRoot + '/bubo-host/' + crypto.randomUUID());
  fs.mkdirSync(folder, { recursive: true }); runtime.components(folder);
  const contextFile = path.join(folder, 'host-context.json');
  fs.writeFileSync(contextFile, JSON.stringify(prepared.context, null, 2) + '\n', { flag: 'wx' });
  const args = [workflow, operation, '--api-version', '2', '--host-context', contextFile];
  for (const [name, value] of options) {
    // This manifest-free query needs a host task for durable receipts; native
    // receives that identity from the validated context, not an init-only flag.
    if (workflow === 'model-to-action' && operation === 'inspect-effects' && name === 'task') continue;
    args.push('--' + name, value);
  }
  const executionStarted = performance.now();
  const ownership = Object.freeze({ workflow, operation, hostPid: process.pid,
    contextFile: path.relative(prepared.root, contextFile).split(path.sep).join('/'),
    hostContextSha256: runtime.hash(contextFile),
    folder: path.relative(prepared.root, folder).split(path.sep).join('/'), executable: info.executable });
  const notify = (name, detail) => {
    const result = lifecycle?.[name]?.(Object.freeze({ ...ownership, ...detail }));
    if (result && typeof result.then === 'function') fail('Native ownership persistence hooks must be synchronous.');
  };
  // There is necessarily a launch/PID-record window. An interrupted caller
  // must preserve an incomplete intent and report unknown ownership, never
  // infer child retirement from the parent's death.
  notify('beforeLaunch', {});
  let child;
  try { child = cp.spawn(info.executable, args, { cwd: prepared.root, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] }); }
  catch (error) { notify('closed', { pid: null, status: null, signal: null, error: String(error.message), spawned: false, launchState: 'spawn-failed' }); throw error; }
  let spawnError, sawSpawn = false;
  const pidKnown = () => Number.isSafeInteger(child.pid) && child.pid > 0;
  child.once('spawn', () => { sawSpawn = true; });
  const retired = new Promise(resolve => {
    child.once('error', error => { spawnError = error; });
    child.once('close', (status, signal) => resolve({ status, signal }));
  });
  let text = '', overflow = false;
  child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { text += chunk; if (Buffer.byteLength(text) > 8 * 1024 * 1024) { overflow = true; child.kill(); } });
  // SIGINT reaches Bubo's managed cancellation handler on Linux, allowing it
  // to retire the native setsid group. Windows closes the owned native job.
  const cancel = () => child.kill(process.platform === 'win32' ? 'SIGTERM' : 'SIGINT');
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  const timeout = setTimeout(cancel, (prepared.context.budgets.timeoutSeconds + 60) * 1000);
  let status, closed;
  try {
    try { if (pidKnown()) notify('spawned', { pid: child.pid, launchState: 'started' }); }
    catch (error) {
      cancel(); closed = await retired;
      notify('closed', { pid: child.pid ?? null, status: closed.status, signal: closed.signal, error: String(error.message), spawned: pidKnown() || sawSpawn, launchState: pidKnown() ? 'started' : 'unknown' });
      throw error;
    }
    closed = await retired; status = closed.status;
    const launchState = pidKnown() ? 'started' : spawnError && !sawSpawn ? 'spawn-failed' : 'unknown';
    notify('closed', { pid: child.pid ?? null, status, signal: closed.signal, error: spawnError ? String(spawnError.message) : null, spawned: pidKnown() || sawSpawn, launchState });
    if (spawnError) throw spawnError;
    if (!pidKnown()) fail('Native child PID was not observed; preserve unknown ownership and retained launch intent.');
  }
  finally { clearTimeout(timeout); process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
  if (overflow) fail('Bubo result exceeded the bounded host buffer.');
  let result; try { result = JSON.parse(text); } catch { fail('Bubo did not return one valid machine-readable result.'); }
  fs.writeFileSync(path.join(folder, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(folder, 'timing.json'), JSON.stringify({ schemaVersion: 1, workflow, operation, hostPid: process.pid,
    ...(prepared.timings || {}), runtimeProcessMilliseconds: performance.now() - executionStarted,
    modelLoadingMilliseconds: null, inferenceMilliseconds: null,
    limits: 'Runtime process includes CLI startup and workflow/native work. Host does not infer model-loading or inference phases from elapsed time.' }, null, 2) + '\n', { flag: 'wx' });
  if (status !== 0 || result.status !== 'succeeded') fail(result.error || 'Bubo execution failed; inspect retained task-local evidence.');
  if (result.schemaVersion !== 'bubo-execution-result/v1' || result.apiVersion !== 2 || result.hostContextSha256 !== runtime.hash(contextFile)) fail('Bubo result/context identity mismatch.');
  if (emit && result.data && typeof result.data === 'object') console.log(JSON.stringify(result.data));
  else if (emit && result.data !== null && result.data !== undefined) console.log(String(result.data));
  return result;
}
async function main(values) {
  const [workflow, operation, ...args] = values;
  if (!['proof-to-model', 'model-to-animation', 'model-to-action'].includes(workflow)) fail('Unknown host asset workflow.');
  if (!operation || operation === 'help' || operation === '--help' || args.includes('--help')) {
    const operations = workflow === 'proof-to-model' ? 'init classify prepare-proofs setup preprocess reconstruct finish review record reuse validate status doctor promote'
      : workflow === 'model-to-animation' ? 'init doctor inspect prepare rig author retarget bake export review record validate status promote'
      : 'init doctor inspect-effects inspect compose export review record validate status promote';
    console.log(`${workflow} <operation> --root PROJECT [--manifest FILE] [options]\nOperations: ${operations}\nInit (manifest defaults beneath the active task): --task ID --asset ID --version ID --actor ID --recipe JSON ${workflow === 'proof-to-model' ? '--rights JSON --toolchain JSON (--proof IMAGE | --sources JSON)' : workflow === 'model-to-animation' ? '--model GLB --rights JSON [--blender EXECUTABLE]' : '--motion-package JSON --source-review JSON [--blender EXECUTABLE]'}\nContinuation: --manifest FILE; record: --kind KIND --reviewer ID --evidence JSON; promote: --destination assets/models/NAME. ${workflow === 'proof-to-model' ? 'Finish accepts --finish-settings JSON and --finish-budget JSON; diagnostics require explicit --mode single-view-diagnostic.' : workflow === 'model-to-animation' ? 'Retarget requires --motion-source GLB --mapping JSON; author accepts --revision JSON.' : 'Source review binds actual model, rig, clip hashes and rights.'}\nFull arguments and receipt rules: ${path.join(runtime.BASE, 'commands/BUBO_ARGUMENTS.md')}\nInitialize with initialize-bubo-runtime.sh and build explicitly with build-bubo-runtime.sh. No installation, license acceptance, generation, human approval or asset promotion is implicit.`); return;
  }
  await invoke(workflow, operation, parse(args));
}
module.exports = { parse, contextFor, invoke, execute, executable, policyCommand };
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
