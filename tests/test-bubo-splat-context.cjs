'use strict';

// Owned inert files and mocked transport. No model, Python/native execution,
// download, GPU query, creative attempt or actual human approval occurs here.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const runtime = require('../commands/lib/bubo-runtime.cjs');
const styles = require('../commands/lib/style-contract.cjs');
const engines = require('../commands/lib/engine-contract.cjs');
const transport = require('../commands/lib/bubo-host-adapter.cjs');
const adapter = require('../commands/lib/bubo-splat-adapter.cjs');
const cache = path.basename(runtime.BASE) === '.hephaera' ? path.join(runtime.BASE, '.cache') : path.join(runtime.BASE, '.hephaera/.cache');
const parent = path.join(cache, 'tasks/hephaera-image-to-splat/evidence/context-fixtures');
fs.mkdirSync(parent, { recursive: true });
const root = fs.mkdtempSync(path.join(parent, 'owned-'));
const task = 'owned-splat', workspace = '.hephaera/.cache/splat-tools', shared = '.hephaera/.cache/local-media/shared-state';
const requestPath = 'inputs/request.json', selectionPath = '.hephaera/.cache/tasks/' + task + '/local-selection.json';
let checks = 0;
const copy = value => JSON.parse(JSON.stringify(value));
function check(value, label) { assert(value, label); checks++; }
function rejects(fn, expression = /./, label) { assert.throws(fn, expression, label); checks++; }
function write(name, value) { const full = path.join(root, name); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n'); return name; }
function dir(name) { fs.mkdirSync(path.join(root, name), { recursive: true }); return name; }
const identity = name => ({ path: name, sha256: runtime.hash(path.join(root, name)) });
function inventory(folder = root) {
  const rows = [];
  function visit(current) { for (const name of fs.readdirSync(current).sort()) { const full = path.join(current, name), stat = fs.lstatSync(full); rows.push([path.relative(folder, full), stat.isSymbolicLink() ? 'link:' + fs.readlinkSync(full) : stat.isDirectory() ? 'directory' : runtime.hash(full)]); if (stat.isDirectory() && !stat.isSymbolicLink()) visit(full); } }
  visit(folder); return JSON.stringify(rows);
}
const styleText = fs.readFileSync(path.join(runtime.BASE, 'STYLE.md'), 'utf8').replace(/\r\n/g, '\n');
write('STYLE.md', styleText); engines.generate(root, 'THREEJS', { inline: true });
write('MEDIA.md', '# MEDIA.md\n\nGenerated from Hephaera media pipeline templates:\n- CLOUD\n- LOCAL\n\n---\n\n'
  + ['Pipeline Availability', 'Capability Matrix', 'Destinations And Budgets', 'Rights, Consent, And Provenance', 'Review And Promotion'].map(name => '## ' + name + '\n').join('\n')
  + '\nImage, music, sound-effect (SFX), and voice availability remain independent. Require the user to choose a provider. Never switch or fall back between providers silently.\n');
write(selectionPath, styles.resolve(root, 'STYLE.md', { override: 'LOCAL' }));
const source = identity(write('inputs/source.png', 'INERT owned source bytes; not an encoded image'));
const evidence = identity(write('inputs/assertion.txt', 'SYNTHETIC fixture only; no actual agreement, rights grant or generation approval'));
const sourceRights = identity(write('inputs/rights.json', { schemaVersion: 'bubo-splat-source-rights/v1', sourceSha256: source.sha256, scope: 'local-generation', rightsBasis: 'owned', approvedBy: 'SYNTHETIC-NOT-A-HUMAN' }));
const license = identity(write('inputs/licence.json', { schemaVersion: 'bubo-splat-license-evidence/v1', task, backend: 'triposplat', accepted: true, licenseIds: ['synthetic-only'], evidence: [evidence] }));
const component = identity(write('inputs/component-review.json', { schemaVersion: 'bubo-splat-component-review/v1', task, backend: 'triposplat', evidence: [evidence] }));
const registration = { schemaVersion: 'bubo-splat-installation-request/v1', task, receiptPath: workspace + '/installations/owned.json',
  modelDirectory: dir(workspace + '/models'), sourceDirectory: dir(workspace + '/source'), environmentRoot: dir(workspace + '/environment'),
  pythonBaseRoot: dir(workspace + '/base'), wheelhouseRoot: dir(workspace + '/wheels'), noticeDirectory: dir(workspace + '/notices'),
  pythonArchive: write(workspace + '/archives/python.tar.gz', 'INERT archive, never extracted'),
  python: identity(write(workspace + '/environment/Scripts/python.exe', 'INERT executable identity; never executed')), licenses: [license], componentReview: component };
const installation = identity(write(registration.receiptPath, { schemaVersion: 'bubo-splat-installation/v1', registration, catalogSha256: 'c'.repeat(64), environmentSpecificationSha256: 'd'.repeat(64), environmentSha256: 'e'.repeat(64), files: [], registeredAt: '2026-01-01T00:00:00Z' }));
const nativeBudgets = { maxGaussians: 131072, maxInputBytes: 67108864, maxDecodedBytes: 67108864, maxHeaderBytes: 65536, timeoutSeconds: 900, maxLogBytes: 16777216, maxProcessMemoryBytes: 21474836480 };
const approvalValue = { schemaVersion: 'bubo-splat-generation-approval/v1', task, ledgerRoot: shared + '/image-to-splat/ledger', sourceSha256: source.sha256,
  styleSha256: runtime.hash(path.join(root, 'STYLE.md')), catalogSha256: 'c'.repeat(64), maximumCandidates: 1, maximumRevisions: 1,
  generationApproved: true, gpuAvailabilityConfirmed: true, approvedBy: 'SYNTHETIC-NOT-A-HUMAN', sourceRights };
const approval = identity(write('inputs/generation-approval.json', approvalValue));
const ledgerDecisionEvidence = identity(write('inputs/ledger-decision.txt', 'SYNTHETIC operator history attestation fixture; no actual first-use approval'));
const ledgerRegistrationPath = write('inputs/ledger-registration.json', { schemaVersion: 'hephaera-splat-ledger-registration/v1', mediaState: shared,
  history: 'fresh-project', priorMediaStateRoots: [], approvedBy: 'SYNTHETIC-NOT-A-HUMAN', decisionEvidence: ledgerDecisionEvidence });
const base = { schemaVersion: 'bubo-splat-generation/v1', task, runId: 'candidate', attemptKind: 'candidate',
  request: { schemaVersion: 'bubo-splat-request/v1', backend: 'triposplat', styleSha256: approvalValue.styleSha256, input: source, gaussianCounts: [32768, 131072], seed: 42, budgets: nativeBudgets },
  installation, authorization: approval, settings: { steps: 20, guidance: 3, shift: 3, erodeRadius: 1 },
  limits: { maxInputPixels: 1048576, maxInputEdge: 1024, maxAspectRatio: 4, maxOutputBytes: 134217728, maxGpuAllocatedBytes: 12884901888, minGpuFreeBytes: 2147483648 } };
const bundle = '.hephaera/runtime/bubo/artifacts/bubo'; dir(bundle);
const capabilities = { workflows: ['image-to-splat'], splats: { operations: ['inspect', 'validate', 'setup', 'provision', 'generate', 'verify-package'], generationAvailable: true, provisioningExecutionAvailable: true, nativeReadinessVerified: false }, build: { cliSha256: 'a'.repeat(64) } };
const buildReceipt = { schemaVersion: 'bubo-build/v1', sourceRevision: '1'.repeat(40), sourceDirty: false, capabilities };
write(bundle + '/build-info.json', buildReceipt);
const catalogFile = write(bundle + '/resources/image-to-splat/catalog.json', { schemaVersion: 'bubo-splat-catalog/v1', backend: 'triposplat', fixture: 'inert metadata, no actual dependencies' });
write(bundle + '/resources/catalog.json', { files: { 'resources/image-to-splat/catalog.json': identity(catalogFile).sha256 } });
const info = { root: path.join(root, '.hephaera/runtime/bubo'), folder: path.join(root, bundle), executable: path.join(root, bundle + '/never-execute.bin'), receipt: buildReceipt, capability: capabilities,
  pinned: { revision: '1'.repeat(40), apiVersion: 2, resourceCatalogSha256: identity(bundle + '/resources/catalog.json').sha256, buildReceipt: 'artifacts/bubo/build-info.json' } };
function options(extra = [], noRequest = false) {
  const value = adapter.parse(['--root', root, '--task', task, '--workspace', workspace, '--media-state', shared, '--selection', selectionPath, ...(!noRequest ? ['--request', requestPath] : [])]);
  for (const [key, item] of adapter.parse(extra)) value.set(key, item);
  return value;
}
function prepare(value = base, extra = [], operation = 'generate') {
  write(requestPath, value); const selected = options(extra);
  if (operation === 'generate' && !selected.has('ledger-registration')) selected.set('ledger-registration', ledgerRegistrationPath);
  return adapter.contextFor(operation, selected, info);
}

for (const key of ['host-context', 'api-version', 'runtime', 'promotion', 'load', 'state-root', 'staging-root', 'runtime-build-sha256']) rejects(() => adapter.parse(['--' + key, 'injected']), /protected/);
rejects(() => adapter.parse(['--task', task, '--task', task]), /duplicate/);
rejects(() => adapter.parse(['--request']), /Missing/);
rejects(() => adapter.parse(['--execute', 'false']), /only true/);
check(adapter.parse(['--execute']).get('execute') === 'true', 'Explicit execute shorthand retains only true');
rejects(() => adapter.contextFor('promote', options(), info), /separate/);
rejects(() => adapter.contextFor('generate', new Map([...options(), ['host-context', 'injected']]), info), /protected/);
rejects(() => adapter.contextFor('generate', new Map([...options(), ['task', '../unsafe']]), info), /safe/);
rejects(() => prepare(base, ['--execute']), /explicit setup/);
rejects(() => adapter.contextFor('setup', options([], true), { capability: {} }), /boundary/);

write(requestPath, base);
const before = inventory(), saved = new Map(); let prepared;
try {
  for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) { saved.set(key, cp[key]); cp[key] = () => { throw new Error('Unexpected context subprocess: ' + key); }; }
  prepared = adapter.contextFor('generate', options(['--ledger-registration', ledgerRegistrationPath]), info);
  const dry = adapter.contextFor('setup', options([], true), info);
  check(dry.request === null && !dry.options.has('request') && !dry.context.permissions.provisioning, 'Metadata setup dry-run has no request, provisioning or load');
} finally { for (const [key, value] of saved) cp[key] = value; }
check(inventory() === before, 'Context admission creates no files and runs no process');
check(prepared.context.policy.pipeline === 'LOCAL' && !prepared.context.policy.purpose && prepared.context.policy.engine.effectiveEngine === 'THREEJS', 'Full-art LOCAL context retains resolved engine');
check(styles.validate(path.join(root, 'STYLE.md')).primary === 'PROOF_TO_MODEL', 'Explicit splat choice leaves visual primary unchanged');
check(prepared.context.policy.media.path === 'MEDIA.md' && prepared.context.roots.mediaState === shared, 'Current MEDIA and explicit shared state are hash-bound');
check(!prepared.context.permissions.provisioning && !prepared.context.permissions.promotion, 'Generation grants no setup or promotion');
check(prepared.context.budgets.timeoutSeconds === 900 && prepared.context.budgets.maxPrivateBytes === 21474836480, 'Declared native process ceilings retained without widening');
assert.deepEqual([...prepared.options.keys()], ['root', 'request']); checks++;
for (const name of [approval.path, sourceRights.path, license.path, component.path, evidence.path]) check(prepared.context.references.some(row => row.path === name && row.kind === 'rights'), 'Typed exact rights closure: ' + name);
check(prepared.context.tools.some(row => row.sha256 === registration.python.sha256), 'Only explicitly selected Python registered');
check(prepared.context.roots.inputs.includes(registration.environmentRoot) && prepared.context.roots.tools.includes(registration.environmentRoot), 'Installation roots are explicit tools and input-only dependencies');

for (const [key, value] of [['timeout', '0'], ['timeout', 'Infinity'], ['max-log-bytes', '1.5'], ['max-private-bytes', '-1']]) rejects(() => prepare(base, ['--' + key, value]), /finite/);
rejects(() => prepare(base, ['--timeout', '899']), /smaller/);
for (const seed of [Number.MAX_SAFE_INTEGER + 1, 1.5, -1, null]) { const value = copy(base); value.request.seed = seed; rejects(() => prepare(value), /exact|finite|integers/); }
const maximumSeed = copy(base); maximumSeed.request.seed = Number.MAX_SAFE_INTEGER; check(prepare(maximumSeed).request.request.seed === Number.MAX_SAFE_INTEGER, 'Maximum safe seed retained exactly');
write(requestPath, '{"schemaVersion":"bubo-splat-generation/v1","task":"a","task":"b"}'); rejects(() => adapter.contextFor('generate', options(), info), /Duplicate/);
write(requestPath, '{"x":1e999}'); rejects(() => adapter.contextFor('generate', options(), info), /finite/);
write(requestPath, base);
for (const location of ['.hephaera/.cache', '.hephaera/.cache/tasks/' + task, '.hephaera/.cache/local-media', '../outside', 'assets/runtime']) rejects(() => prepare(base, ['--workspace', location]), /cache|Traversal|separate/);
rejects(() => prepare(base, ['--media-state', workspace + '/staging']), /separate/);
const badSource = copy(base); badSource.request.input.sha256 = '0'.repeat(64); rejects(() => prepare(badSource), /hash changed/);
const badInstallation = copy(base); badInstallation.installation.sha256 = '0'.repeat(64); rejects(() => prepare(badInstallation), /hash changed/);
const badTask = copy(base); badTask.task = 'another'; rejects(() => prepare(badTask), /task/);
const badRights = copy(base); badRights.authorization = identity(write('inputs/unapproved.json', { ...approvalValue, generationApproved: false })); rejects(() => prepare(badRights), /approval/);
const badLedger = copy(base); badLedger.authorization = identity(write('inputs/wrong-ledger.json', { ...approvalValue, ledgerRoot: '.hephaera/.cache/fresh/image-to-splat/ledger' })); rejects(() => prepare(badLedger), /ledger/);
const badReceipt = copy(base); badReceipt.installation = identity(write(workspace + '/installations/transplanted.json', JSON.parse(fs.readFileSync(path.join(root, installation.path))))); rejects(() => prepare(badReceipt), /transplanted/);
const oldPython = fs.readFileSync(path.join(root, registration.python.path)); write(registration.python.path, 'changed tool'); rejects(() => prepare(), /identity changed/); write(registration.python.path, oldPython);
const noSelection = options(); noSelection.delete('selection'); write(requestPath, base); rejects(() => adapter.contextFor('generate', noSelection, info), /LOCAL/);
write('STYLE.md', styleText + '\n'); rejects(() => prepare(), /current STYLE/); write('STYLE.md', styleText);
const selection = styles.resolve(root, 'STYLE.md', { override: 'LOCAL' }); write(selectionPath, { ...selection, fallbackPolicy: 'fallback' }); rejects(() => prepare(), /current STYLE/); write(selectionPath, selection);

const inspect = { schemaVersion: 'bubo-splat-inspection/v1', styleSha256: approvalValue.styleSha256, input: identity(write(workspace + '/staging/retained/scene.ply', 'INERT PLY test bytes')), budgets: nativeBudgets };
check(prepare(inspect, [], 'inspect').context.permissions.promotion === false, 'Read-only PLY inspection admits owned staging bytes without promotion');
check(prepare(base.request, [], 'validate').options.get('request') === requestPath, 'Native request validation uses request flag');
const newRegistration = { ...registration, receiptPath: workspace + '/installations/new.json' };
check(prepare(newRegistration, [], 'setup').context.roots.outputs.includes(newRegistration.receiptPath), 'Registration dry-run supplies exact separate receipt output');
check(prepare(newRegistration, ['--execute'], 'setup').context.permissions.provisioning, 'Registration execution stays explicitly authorized');
const provision = { schemaVersion: 'bubo-splat-provision/v1', task, installationRoot: workspace + '/fresh-install', downloadRoot: workspace + '/downloads',
  runtimeSourceRoot: dir(workspace + '/crt-source'), noticeSourceRoot: dir(workspace + '/vs-source'), bootstrapPython: identity(write('inputs/bootstrap.bin', 'INERT bootstrap, never executed')), licenses: [license] };
const provisionPrepared = prepare(provision, [], 'provision');
check(!fs.existsSync(path.join(root, provision.installationRoot)) && !provisionPrepared.context.permissions.provisioning, 'Provision dry-run creates no installation/download directory');
rejects(() => prepare(provision, ['--execute'], 'provision'), /committed-memory/);
check(prepare(provision, ['--execute', '--max-private-bytes', '21474836480'], 'provision').context.permissions.provisioning, 'Provision execute needs explicit selected operation and finite memory');
rejects(() => prepare({ ...provision, downloadRoot: provision.installationRoot + '/nested' }, [], 'provision'), /disjoint/);
const platform = identity(write('inputs/platform-owned.dll', 'INERT module, never loaded'));
write('inputs/platform-modules.json', { schemaVersion: 'hephaera-platform-modules/v1', modules: [platform] });
check(prepare(base, ['--platform-modules', 'inputs/platform-modules.json']).context.tools.some(row => row.kind === 'platform-module'), 'Exact platform module pins remain separate from input references');
write('inputs/platform-modules.json', { schemaVersion: 'hephaera-platform-modules/v1', modules: [identity(write(workspace + '/staging/bad-module.dll', 'INERT'))] });
rejects(() => prepare(base, ['--platform-modules', 'inputs/platform-modules.json']), /mutable/);
const hostPolicy = identity(write('.hephaera/.cache/tasks/' + task + '/host-version.json', { source, fixture: 'queued host policy' }));
write(requestPath, base); check(adapter.contextFor('generate', options(['--ledger-registration', ledgerRegistrationPath]), info, { policyReferences: [hostPolicy] }).context.references.some(row => row.path === hostPolicy.path && row.kind === 'policy'), 'Host-only policy identity survives ownership waits');
rejects(() => adapter.contextFor('setup', options([], true), info, { policyReferences: [hostPolicy] }), /only to generation/);
let links = 0;
try {
  const alias = path.join(root, 'linked-inputs'); fs.symlinkSync(path.join(root, 'inputs'), alias, process.platform === 'win32' ? 'junction' : 'dir'); links++;
  const value = copy(base); value.request.input.path = 'linked-inputs/source.png'; rejects(() => prepare(value), /symbolic links|junctions/);
} catch (error) { if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }

write(requestPath, base);
const missingDecisionBefore = inventory();
rejects(() => adapter.contextFor('generate', options(), info), /First splat generation requires --ledger-registration/);
check(inventory() === missingDecisionBefore && !fs.existsSync(path.join(root, adapter.ROOT_BINDING)), 'Missing first-use decision causes no binding, mutation or dispatch');
for (const operation of ['setup', 'provision', 'inspect']) rejects(() => adapter.contextFor(operation, options(['--ledger-registration', ledgerRegistrationPath]), info), /not setup or metadata/);
const firstDecisionBytes = fs.readFileSync(path.join(root, ledgerRegistrationPath)), firstDecision = JSON.parse(firstDecisionBytes);
for (const changed of [{ ...firstDecision, history: 'inferred-empty' }, { ...firstDecision, approvedBy: '' },
  { ...firstDecision, priorMediaStateRoots: [shared] }, { ...firstDecision, undeclared: true },
  { ...firstDecision, decisionEvidence: { ...ledgerDecisionEvidence, sha256: '0'.repeat(64) } }]) {
  write(ledgerRegistrationPath, changed); rejects(() => prepare(), /decision|reconciliation|changed/);
  check(!fs.existsSync(path.join(root, adapter.ROOT_BINDING)), 'Invalid first-use history/evidence never creates a root binding');
}
write(ledgerRegistrationPath, firstDecisionBytes);
const firstReadOnly = prepare(base.request, ['--ledger-registration', ledgerRegistrationPath], 'validate');
check(!firstReadOnly.options.has('ledger-registration') && !fs.existsSync(path.join(root, adapter.ROOT_BINDING)), 'Optional lifecycle validation verifies host decision without forwarding it or binding state');
prepared = prepare();
const oldDecision = fs.readFileSync(path.join(root, ledgerDecisionEvidence.path));
write(ledgerDecisionEvidence.path, 'Changed synthetic attestation');
rejects(() => adapter.bindSharedState(prepared), /registration or decision evidence changed/);
check(!fs.existsSync(path.join(root, adapter.ROOT_BINDING)) && !fs.existsSync(path.join(root, '.hephaera/.cache/local-media/acceptance-roots', approval.sha256 + '.json')), 'Changed first-use evidence creates neither shared-root nor approval binding');
write(ledgerDecisionEvidence.path, oldDecision);
prepared = prepare();
adapter.bindSharedState(prepared);
check(fs.existsSync(path.join(root, adapter.ROOT_BINDING)), 'First explicit generation binds project-global shared root');
check(!fs.existsSync(path.join(root, shared, 'image-to-splat/ledger')), 'Host binding spends no native candidate/revision');
check(prepared.context.references.some(row => row.path === adapter.ROOT_BINDING && row.kind === 'policy'), 'Global binding becomes exact queued policy reference');
for (const name of [ledgerRegistrationPath, ledgerDecisionEvidence.path]) check(prepared.context.references.some(row => row.path === name && row.kind === 'policy'), 'First-use decision identity reaches native policy references: ' + name);
const retainedRoot = JSON.parse(fs.readFileSync(path.join(root, adapter.ROOT_BINDING)));
assert.deepEqual(retainedRoot.registration, identity(ledgerRegistrationPath)); checks++;
assert.deepEqual(retainedRoot.decisionEvidence, ledgerDecisionEvidence); checks++;
write(requestPath, base); check(adapter.contextFor('generate', options(), info).rootBinding.registration.sha256 === retainedRoot.registration.sha256, 'Existing binding permits omitted flag while revalidating the retained decision');
const alternateDecisionPath = write('inputs/alternate-ledger-registration.json', JSON.parse(fs.readFileSync(path.join(root, ledgerRegistrationPath))));
rejects(() => prepare(base, ['--ledger-registration', alternateDecisionPath]), /immutable first-use identity/);
write(ledgerDecisionEvidence.path, 'Changed after first-use binding'); rejects(() => adapter.contextFor('generate', options(), info), /registration or decision evidence changed/); write(ledgerDecisionEvidence.path, oldDecision);
const differentShared = '.hephaera/.cache/new-ledger', otherTask = 'different-native-task';
const differentApproval = identity(write('inputs/new-task-approval.json', { ...approvalValue, task: otherTask, ledgerRoot: differentShared + '/image-to-splat/ledger' }));
const differentSelection = '.hephaera/.cache/tasks/' + otherTask + '/local-selection.json'; write(differentSelection, selection);
const differentRequest = { ...copy(base), task: otherTask, authorization: differentApproval }; write(requestPath, differentRequest);
rejects(() => adapter.contextFor('generate', adapter.parse(['--root', root, '--task', otherTask, '--request', requestPath, '--workspace', workspace, '--selection', differentSelection, '--media-state', differentShared]), info), /project-shared splat root/);
check(!fs.existsSync(path.join(root, differentShared)), 'New task/new approval cannot create a fresh source ledger root');
const secondRun = copy(base); secondRun.runId = 'reviewed-revision'; secondRun.attemptKind = 'revision';
const laterClaim = shared + '/image-to-splat/ledger/' + source.sha256 + '/candidate.json';
write(laterClaim, 'SYNTHETIC claim appearing after first-use registration; never executed');
const laterClaimHash = identity(laterClaim).sha256;
check(prepare(secondRun).sharedBinding.approvalSha256 === approval.sha256, 'Revision retains original task/approval/global shared root');
write(requestPath, secondRun); check(adapter.contextFor('generate', options(), info).rootBinding.registration.sha256 === retainedRoot.registration.sha256
  && identity(laterClaim).sha256 === laterClaimHash, 'Fresh-project registration remains a historical decision after later claims exist; no unused-today assertion or claim edit');

// A second owned project contains declared pre-feature claim bytes. Its first
// host binding must preserve the original root; no scan or migration is inferred.
const historyRoot = fs.mkdtempSync(path.join(parent, 'history-'));
fs.cpSync(root, historyRoot, { recursive: true, filter: value => {
  const name = path.relative(root, value).split(path.sep).join('/');
  return name !== '.hephaera/.cache/local-media' && !name.startsWith('.hephaera/.cache/local-media/') && !fs.lstatSync(value).isSymbolicLink();
} });
function historyWrite(name, value) { const full = path.join(historyRoot, name); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n'); return name; }
const historyIdentity = name => ({ path: name, sha256: runtime.hash(path.join(historyRoot, name)) });
const originalShared = '.hephaera/.cache/original-native-state', originalClaim = originalShared + '/image-to-splat/ledger/' + source.sha256 + '/candidate.json';
historyWrite(originalClaim, 'SYNTHETIC pre-feature spent claim; preserve exact bytes');
const originalClaimHash = historyIdentity(originalClaim).sha256;
const historyInfo = { ...info, root: path.join(historyRoot, '.hephaera/runtime/bubo'), folder: path.join(historyRoot, bundle) };
const historyApproval = historyIdentity(historyWrite(approval.path, { ...approvalValue, ledgerRoot: originalShared + '/image-to-splat/ledger' }));
historyWrite(requestPath, { ...copy(base), authorization: historyApproval });
const existingDecision = { schemaVersion: 'hephaera-splat-ledger-registration/v1', mediaState: originalShared, history: 'existing-ledger', priorMediaStateRoots: [originalShared], approvedBy: 'SYNTHETIC-NOT-A-HUMAN', decisionEvidence: ledgerDecisionEvidence };
function historyOptions(name = originalShared, includeDecision = true) { return adapter.parse(['--root', historyRoot, '--task', task, '--workspace', workspace, '--media-state', name, '--selection', selectionPath, '--request', requestPath, ...(includeDecision ? ['--ledger-registration', ledgerRegistrationPath] : [])]); }
rejects(() => adapter.contextFor('generate', historyOptions(originalShared, false), historyInfo), /First splat generation requires/);
check(!fs.existsSync(path.join(historyRoot, adapter.ROOT_BINDING)) && historyIdentity(originalClaim).sha256 === originalClaimHash, 'Undeclared pre-feature history stays untouched before first-use attestation');
historyWrite(ledgerRegistrationPath, { ...existingDecision, priorMediaStateRoots: [originalShared, '.hephaera/.cache/other-prior-root'] });
rejects(() => adapter.contextFor('generate', historyOptions(), historyInfo), /multiple prior splat roots/);
historyWrite(ledgerRegistrationPath, { ...existingDecision, mediaState: '.hephaera/.cache/relocated-state' });
historyWrite(approval.path, { ...approvalValue, ledgerRoot: '.hephaera/.cache/relocated-state/image-to-splat/ledger' });
historyWrite(requestPath, { ...copy(base), authorization: historyIdentity(approval.path) });
rejects(() => adapter.contextFor('generate', historyOptions('.hephaera/.cache/relocated-state'), historyInfo), /relocated or multiple/);
check(!fs.existsSync(path.join(historyRoot, '.hephaera/.cache/relocated-state')) && historyIdentity(originalClaim).sha256 === originalClaimHash, 'Relocation attempts create no new root and preserve old claims');
historyWrite(ledgerRegistrationPath, { ...existingDecision, history: 'fresh-project' });
historyWrite(approval.path, { ...approvalValue, ledgerRoot: originalShared + '/image-to-splat/ledger' }); historyWrite(requestPath, { ...copy(base), authorization: historyIdentity(approval.path) });
rejects(() => adapter.contextFor('generate', historyOptions(), historyInfo), /Undeclared/);
historyWrite(ledgerRegistrationPath, existingDecision);
const historicalPrepared = adapter.contextFor('generate', historyOptions(), historyInfo); adapter.bindSharedState(historicalPrepared);
check(historicalPrepared.context.roots.mediaState === originalShared && historyIdentity(originalClaim).sha256 === originalClaimHash, 'Explicit existing-ledger decision binds original root without editing or resetting its claim');
check(adapter.contextFor('generate', historyOptions(originalShared, false), historyInfo).rootBinding.mediaState === originalShared, 'Retained existing-ledger decision is reread without a repeated flag');
const historicalRegistration = fs.readFileSync(path.join(historyRoot, ledgerRegistrationPath)); historyWrite(ledgerRegistrationPath, { ...existingDecision, approvedBy: 'changed' });
rejects(() => adapter.contextFor('generate', historyOptions(originalShared, false), historyInfo), /registration or decision evidence changed/);
historyWrite(ledgerRegistrationPath, historicalRegistration);
check(historyIdentity(originalClaim).sha256 === originalClaimHash, 'Failed retained-registration revalidation leaves original claim bytes unchanged');

// The lifecycle queues the complete immutable native closure, not only small
// host policies. Keep each already-admitted file's kind and exact byte ceiling.
const largeSourceBytes = Buffer.alloc(1048593, 0x51), largeSource = identity(write('inputs/large-source.png', largeSourceBytes));
const largeRegistration = { ...registration, receiptPath: workspace + '/installations/large.json' };
const largeReceiptValue = { ...JSON.parse(fs.readFileSync(path.join(root, installation.path))), registration: largeRegistration,
  files: Array.from({ length: 7000 }, (_, index) => ({ path: workspace + '/environment/Lib/site-packages/owned-' + index + '.py', sha256: 'b'.repeat(64), bytes: 1 })) };
const largeInstallation = identity(write(largeRegistration.receiptPath, largeReceiptValue));
const largeReceiptBytes = fs.readFileSync(path.join(root, largeInstallation.path));
const largeRights = identity(write('inputs/large-rights.json', { schemaVersion: 'bubo-splat-source-rights/v1', sourceSha256: largeSource.sha256, scope: 'local-generation', rightsBasis: 'owned', approvedBy: 'SYNTHETIC-NOT-A-HUMAN' }));
const largeApproval = identity(write('inputs/large-approval.json', { ...approvalValue, sourceSha256: largeSource.sha256, sourceRights: largeRights }));
const largeGeneration = { ...copy(base), runId: 'large-owned-context', request: { ...copy(base.request), input: largeSource, budgets: { ...nativeBudgets, maxInputBytes: largeSourceBytes.length } },
  installation: largeInstallation, authorization: largeApproval };
write(requestPath, largeGeneration);
const mixedClosure = [identity(requestPath), largeSource, largeInstallation, largeApproval, largeRights, license, component, evidence,
  identity('STYLE.md'), identity('MEDIA.md'), identity(selectionPath), identity(ledgerRegistrationPath), ledgerDecisionEvidence, identity(adapter.ROOT_BINDING), hostPolicy];
const mixed = adapter.contextFor('generate', options(), info, { policyReferences: mixedClosure });
check(largeSourceBytes.length > 1048576 && largeReceiptBytes.length > 1048576, 'Native-shaped source and installation receipt exceed the generic policy byte bound');
for (const item of [identity(requestPath), largeSource, largeInstallation]) check(mixed.context.references.some(row => row.path === item.path && row.kind === 'input' && row.sha256 === item.sha256), 'Queued original input keeps its admitted kind/hash: ' + item.path);
for (const item of [largeApproval, largeRights, license, component, evidence]) check(mixed.context.references.some(row => row.path === item.path && row.kind === 'rights' && row.sha256 === item.sha256), 'Queued rights closure keeps its admitted kind/hash: ' + item.path);
check(mixed.context.references.some(row => row.path === hostPolicy.path && row.kind === 'policy'), 'New host-only queued metadata remains policy');
check(mixed.context.references.every(row => Object.keys(row).sort().join(',') === 'kind,path,sha256'), 'Private admission limits add no unsupported native reference fields');
rejects(() => adapter.contextFor('generate', options(), info, { policyReferences: [{ ...largeSource, sha256: '0'.repeat(64) }] }), /conflicts with its original admitted identity/);
rejects(() => adapter.contextFor('generate', options(), info, { policyReferences: [{ ...largeInstallation, sha256: '0'.repeat(64) }] }), /conflicts with its original admitted identity/);
const oversizedHostPolicy = identity(write('inputs/oversized-host-policy.bin', Buffer.alloc(1048577, 0x48)));
rejects(() => adapter.contextFor('generate', options(), info, { policyReferences: [oversizedHostPolicy] }), /oversized splat reference/);
const hashBeforeQueueTests = runtime.hash;
try {
  let changed = false;
  runtime.hash = file => {
    if (!changed && runtime.samePath(file, path.join(root, hostPolicy.path))) { changed = true; fs.appendFileSync(path.join(root, largeSource.path), 'growth after original admission'); }
    return hashBeforeQueueTests(file);
  };
  rejects(() => adapter.contextFor('generate', options(), info, { policyReferences: [hostPolicy, largeSource] }), /original admitted byte bound/);
  check(changed, 'Source overgrowth occurred between original admission and queued freshness check');
} finally { runtime.hash = hashBeforeQueueTests; write(largeSource.path, largeSourceBytes); }
try {
  let changed = false;
  runtime.hash = file => {
    if (!changed && runtime.samePath(file, path.join(root, hostPolicy.path))) { changed = true; fs.truncateSync(path.join(root, largeInstallation.path), 33554433); }
    return hashBeforeQueueTests(file);
  };
  rejects(() => adapter.contextFor('generate', options(), info, { policyReferences: [hostPolicy, largeInstallation] }), /original admitted byte bound/);
  check(changed, 'Installation overgrowth uses the original 32 MiB admission instead of a generic policy ceiling');
} finally { runtime.hash = hashBeforeQueueTests; write(largeInstallation.path, largeReceiptBytes); }
write(requestPath, base);

async function run() {
  const originalVerified = runtime.verified, originalExecute = transport.execute;
  let forwardedLifecycle;
  const lifecycle = { beforeLaunch() {} };
  try {
    runtime.verified = () => info;
    transport.execute = async (workflow, operation, forwarded, execution, actualInfo, emit, hooks) => {
      check(workflow === 'image-to-splat' && emit === false && actualInfo === info, 'Fixed workflow uses verified shared bounded transport'); forwardedLifecycle = hooks;
      const folder = execution.stateRoot + '/bubo-host/owned-dispatch';
      const context = identity(write(folder + '/host-context.json', execution.context));
      const result = { schemaVersion: 'bubo-execution-result/v1', apiVersion: 2, workflow, operation, status: 'succeeded', hostContextSha256: context.sha256, data: { schemaVersion: 'owned-mock-dry-run/v1', gpuUsed: false } };
      write(folder + '/result.json', result); write(folder + '/timing.json', { fixture: 'mock transport; no native process' }); return result;
    };
    const result = await adapter.invoke('setup', options([], true), { emit: false, lifecycle });
    check(forwardedLifecycle === lifecycle, 'Trusted lifecycle hooks reach shared transport unchanged');
    for (const key of ['hostContext', 'result', 'timing', 'buildReceipt', 'resourceCatalog', 'catalog']) check(runtime.hash(path.join(root, result.hostSplatDispatch[key].path)) === result.hostSplatDispatch[key].sha256, 'Exact immutable dispatch identity: ' + key);
    check(fs.readFileSync(path.join(root, result.hostSplatDispatch.buildReceipt.path)).equals(fs.readFileSync(path.join(root, bundle + '/build-info.json'))), 'Build provenance snapshot retains admitted bytes');
    const savedBuild = fs.readFileSync(path.join(root, bundle + '/build-info.json')), earlierExecute = transport.execute;
    transport.execute = async (...args) => { const value = await earlierExecute(...args); write(bundle + '/build-info.json', { ...buildReceipt, sourceRevision: '9'.repeat(40) }); return value; };
    await assert.rejects(() => adapter.invoke('setup', options([], true), { emit: false }), /identity changed/); checks++;
    write(bundle + '/build-info.json', savedBuild);
  } finally { runtime.verified = originalVerified; transport.execute = originalExecute; }
  console.log(JSON.stringify({ status: 'pass', checks, actualLinkCases: links, network: false, softwareInstalled: false, nativeExecuted: false, gpuUsed: false, generation: false, scope: 'owned inert host-context and mocked transport fixtures only' }));
}
run().catch(error => { console.error(error); process.exitCode = 1; });
