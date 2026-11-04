'use strict';

// Fast policy/lifecycle checks. Installed native positives are exercised by
// test-vfx-installed.py with an explicitly selected verified publication.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), cp = require('child_process');
const fixture = require('./vfx-fixture.cjs');
const { BASE, sha, write, initialize } = fixture;
const cache = path.join(BASE, '.hephaera/.cache/tasks/hephaera-vfx-lifecycle/evidence/fast');
fs.mkdirSync(cache, { recursive: true });
const root = fs.mkdtempSync(path.join(cache, 'p-')), baseline = path.join(root, '.hephaera');
for (const name of ['commands/lib', 'installer/core', '.engine', '.styles', '.architecture'])
  fs.cpSync(path.join(BASE, name), path.join(baseline, name), { recursive: true });
fs.copyFileSync(path.join(BASE, 'commands/vfx-assets.sh'), path.join(baseline, 'commands/vfx-assets.sh'));
fs.copyFileSync(path.join(BASE, 'STYLE.md'), path.join(baseline, 'STYLE.md'));
const data = initialize(root, baseline);
const lifecycle = require(path.join(baseline, 'commands/lib/vfx-assets.cjs'));
const adapter = require(path.join(baseline, 'commands/lib/bubo-vfx-adapter.cjs'));
let checks = 0;
const check = (value, reason) => { assert(value, reason); checks++; };
const rejected = async (action, expression) => { await assert.rejects(action, expression); checks++; };
const init = overrides => ({ root, task: data.task, asset: data.asset, version: data.version, creator: data.creator,
  brief: data.brief, rights: data.rights, ...overrides });
const options = () => ({ root, manifest: data.manifest });
function cli(...args) {
  const result = cp.spawnSync(process.execPath, [path.join(BASE, 'commands/lib/vfx-assets.cjs'), ...args],
    { cwd: BASE, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert(!result.error, result.error?.message);
  return result;
}
function fixtureCommand(...args) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(process.execPath, [path.join(baseline, 'commands/lib/vfx-assets.cjs'), ...args],
      { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Owned fixture command exceeded 20 seconds.')); }, 20000);
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}
function deadOwner() {
  const child = cp.spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(child.status, 0);
  const pid = Number(child.stdout);
  assert(Number.isSafeInteger(pid) && pid > 0);
  assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
  return pid;
}
async function recoveryCases() {
  const ownerTime = new Date().toISOString();
  async function initialized(asset) {
    return lifecycle.run('init', init({ asset }));
  }
  async function preparedTakeover(asset, writerPresent) {
    const state = await initialized(asset), assetDirectory = path.posix.dirname(path.posix.dirname(state.manifest));
    const directory = assetDirectory + '/.recovery-claims/claim-000001', writerPid = deadOwner(), claimPid = deadOwner();
    const writer = { pid: writerPid, startedAt: ownerTime };
    // These bounded synthetic receipts describe a recoverer crash on either
    // side of writer removal. No completed receipt is supplied or invented.
    const intent = write(root, directory + '/intent.json', { schemaVersion: 'hephaera-vfx-recovery-claim/v1', sequence: 1,
      pid: claimPid, nonce: require('crypto').randomUUID(), previousSha256: null,
      manifest: fixture.ref(root, state.manifest), createdAt: ownerTime });
    const archive = assetDirectory + '/.recoveries/recovery-' + require('crypto').randomUUID();
    const archived = write(root, archive + '/write-lock.json', writer);
    if (writerPresent) write(root, assetDirectory + '/.write-lock', writer);
    const assetValue = JSON.parse(fs.readFileSync(path.join(root, state.manifest)));
    const report = write(root, archive + '/recovery.json', { schemaVersion: 'hephaera-vfx-recovery/v2',
      manifest: fixture.ref(root, state.manifest), budget: assetValue.budget, claim: fixture.ref(root, intent), previousRecovery: null,
      writerPresentAtPreparation: true, archivedLock: fixture.ref(root, archived), archivedMarker: null,
      owner: { ownerPid: writerPid, startedAt: ownerTime, path: assetDirectory + '/.write-lock', sha256: sha(path.join(root, archived)), proof: 'ESRCH' },
      processes: { known: [], childCleanup: 'unverified-no-tracked-child-identities', processTermination: false },
      interruptedAttempts: [], countersReset: false, copiesRemoved: false, acceptanceInherited: false, preparedAt: ownerTime });
    write(root, directory + '/prepared.json', { schemaVersion: 'hephaera-vfx-recovery-prepared/v1',
      intent: fixture.ref(root, intent), recovery: fixture.ref(root, report), createdAt: ownerTime });
    return { ...state, assetDirectory, directory, archive, intent, report, archived };
  }
  const activeClaim = await initialized('active-claim'), activeDirectory = path.posix.dirname(path.posix.dirname(activeClaim.manifest));
  const activeIntent = write(root, activeDirectory + '/.recovery-claims/claim-000001/intent.json', {
    schemaVersion: 'hephaera-vfx-recovery-claim/v1', sequence: 1, pid: process.pid, nonce: require('crypto').randomUUID(),
    previousSha256: null, manifest: fixture.ref(root, activeClaim.manifest), createdAt: ownerTime });
  const activeHash = sha(path.join(root, activeIntent));
  check((await lifecycle.run('status', { root, manifest: activeClaim.manifest })).ownership.claim.state === 'active', 'status identifies an actual live recovery claimant');
  await rejected(() => lifecycle.run('recover', { root, manifest: activeClaim.manifest }), /already owned|unverified|ESRCH|active/i);
  check(sha(path.join(root, activeIntent)) === activeHash && fs.readdirSync(path.join(root, activeDirectory, '.recovery-claims')).length === 1,
    'active recovery claim prevents takeover without creating another ordinal');
  for (const writerPresent of [true, false]) {
    const takeover = await preparedTakeover('prepared-' + (writerPresent ? 'before-release' : 'after-release'), writerPresent);
    const before = Object.fromEntries([takeover.intent, takeover.report, takeover.archived, takeover.directory + '/prepared.json']
      .map(file => [file, sha(path.join(root, file))]));
    const observed = await lifecycle.run('status', { root, manifest: takeover.manifest });
    check(observed.ownership.claim.state === 'abandoned' && observed.ownership.claim.receiptState === (writerPresent ? 'prepared' : 'prepared-writer-absent'),
      'status exposes prepared recovery crash ' + (writerPresent ? 'before' : 'after') + ' writer removal');
    const resumed = await lifecycle.run('recover', { root, manifest: takeover.manifest });
    check(resumed.recovered && resumed.resumed && JSON.parse(fs.readFileSync(path.join(root, resumed.claim.path))).sequence === 2
      && fs.readFileSync(path.join(root, resumed.archive, 'write-lock.json')).equals(fs.readFileSync(path.join(root, takeover.archived))),
    'dead prepared claimant resumes with retained exact writer bytes ' + (writerPresent ? 'before' : 'after') + ' removal');
    check(Object.entries(before).every(([file, expected]) => sha(path.join(root, file)) === expected)
      && (await lifecycle.run('status', { root, manifest: takeover.manifest })).ownership.writable,
    'ordinal takeover preserves prior claim/archive evidence and restores writable ownership');
  }
  const malformedClaim = await preparedTakeover('malformed-claim-receipt', true);
  const malformedReceipt = JSON.parse(fs.readFileSync(path.join(root, malformedClaim.directory, 'prepared.json')));
  malformedReceipt.intent.sha256 = '0'.repeat(64);
  write(root, malformedClaim.directory + '/prepared.json', malformedReceipt);
  check((await lifecycle.run('status', { root, manifest: malformedClaim.manifest })).ownership.claim.state === 'unverified', 'malformed prepared receipt cannot establish claimant completion');
  await rejected(() => lifecycle.run('recover', { root, manifest: malformedClaim.manifest }), /prepared|intent|changed|claim/i);
  const transplanted = await preparedTakeover('transplanted-claim-receipt', false);
  const donor = await preparedTakeover('donor-claim-receipt', false);
  const donorRecovered = await lifecycle.run('recover', { root, manifest: donor.manifest });
  write(root, transplanted.directory + '/writer-released.json', { schemaVersion: 'hephaera-vfx-recovery-release/v1',
    intent: fixture.ref(root, transplanted.intent), recovery: fixture.ref(root, transplanted.report), removedHere: false, confirmedAbsent: true, recordedAt: ownerTime });
  write(root, transplanted.directory + '/completed.json', { schemaVersion: 'hephaera-vfx-recovery-claim-completed/v1',
    intent: fixture.ref(root, transplanted.intent), status: 'succeeded', recovery: fixture.ref(root, transplanted.report),
    completion: donorRecovered.completion, reason: 'Synthetic transplanted completion must be rejected.', createdAt: ownerTime });
  check((await lifecycle.run('status', { root, manifest: transplanted.manifest })).ownership.claim.state === 'unverified', 'another asset completion cannot certify a prepared claim');
  await rejected(() => lifecycle.run('recover', { root, manifest: transplanted.manifest }), /completion|archive|receipt|claim/i);
  const legacy = await initialized('legacy-marker-owner'), legacyDirectory = path.posix.dirname(path.posix.dirname(legacy.manifest));
  const legacyMarker = write(root, legacyDirectory + '/.recovery-lock', { schemaVersion: 'hephaera-vfx-recovery-lock/v1',
    pid: deadOwner(), startedAt: ownerTime, token: require('crypto').randomUUID() });
  const legacyBytes = fs.readFileSync(path.join(root, legacyMarker));
  const legacyRecovered = await lifecycle.run('recover', { root, manifest: legacy.manifest });
  check(fs.readFileSync(path.join(root, legacyRecovered.archive, 'recovery-marker.json')).equals(legacyBytes)
    && !fs.existsSync(path.join(root, legacyMarker)) && (await lifecycle.run('status', { root, manifest: legacy.manifest })).ownership.writable,
  'proven dead legacy recovery marker is archived without a recursive takeover lock');
  const live = await initialized('live-owner'), liveDirectory = path.posix.dirname(path.posix.dirname(live.manifest));
  const liveLock = write(root, liveDirectory + '/.write-lock', { pid: process.pid, startedAt: ownerTime });
  const liveBytes = fs.readFileSync(path.join(root, liveLock));
  const liveStatus = await lifecycle.run('status', { root, manifest: live.manifest });
  check(liveStatus.ownership.state === 'active' && !liveStatus.ownership.writable, 'status identifies a live writer without terminating its process');
  await rejected(() => lifecycle.run('recover', { root, manifest: live.manifest }), /proven dead|active|ESRCH/i);
  check(fs.readFileSync(path.join(root, liveLock)).equals(liveBytes) && !fs.existsSync(path.join(root, liveDirectory, '.recoveries')),
    'live-owner recovery refusal preserves exact lock bytes and creates no archive');
  const malformed = await initialized('malformed-owner'), malformedDirectory = path.posix.dirname(path.posix.dirname(malformed.manifest));
  const malformedLock = write(root, malformedDirectory + '/.write-lock', { pid: -1, startedAt: 'not-a-time' });
  const malformedBytes = fs.readFileSync(path.join(root, malformedLock));
  check((await lifecycle.run('status', { root, manifest: malformed.manifest })).ownership.state === 'unverified', 'malformed ownership is explicitly unverified');
  await rejected(() => lifecycle.run('recover', { root, manifest: malformed.manifest }), /unverified|malformed|proven dead|ESRCH/i);
  check(fs.readFileSync(path.join(root, malformedLock)).equals(malformedBytes), 'malformed-owner recovery refusal preserves its evidence');

  const abandoned = await initialized('abandoned-owner'), directory = path.posix.dirname(path.posix.dirname(abandoned.manifest));
  const pid = deadOwner(), abandonedLock = write(root, directory + '/.write-lock', { pid, startedAt: ownerTime });
  const abandonedBytes = fs.readFileSync(path.join(root, abandonedLock));
  const ledger = path.join(root, directory, '.history'), names = fs.readdirSync(ledger).sort(), last = names.at(-1);
  const previous = JSON.parse(fs.readFileSync(path.join(ledger, last))), sequence = previous.sequence + 1;
  const attempt = '.art-staging/tasks/qa/vfx/abandoned-owner/v1/attempts/provisional-' + require('crypto').randomUUID();
  // Simulate the documented crash window after the durable reservation and
  // before stage-started. This is synthetic protocol state, not native output.
  write(root, directory + '/.history/' + String(sequence).padStart(6, '0') + '.json', {
    schemaVersion: 'hephaera-vfx-reservation/v1', sequence, budgetSha256: sha(path.join(root, directory, '.budget.json')),
    previousSha256: sha(path.join(ledger, last)), kind: 'attempt-reserved',
    data: { version: 'v1', phase: 'provisional', attempt, manifest: fixture.ref(root, abandoned.manifest) }, recordedAt: new Date().toISOString()
  });
  const residue = write(root, attempt + '/package/partial.png', fixture.png()), residueHash = sha(path.join(root, residue));
  const reservations = Object.fromEntries(fs.readdirSync(ledger).map(name => [name, sha(path.join(ledger, name))]));
  const pending = await lifecycle.run('status', { root, manifest: abandoned.manifest });
  check(pending.ownership.state === 'abandoned' && pending.phases.provisional.attempts === 1
    && pending.phases.provisional.reservationOnlyAttempts.includes(attempt) && !pending.phases.provisional.accepted,
  'status exposes a dead owner and reservation-only interrupted attempt without granting acceptance');
  const recovered = await lifecycle.run('recover', { root, manifest: abandoned.manifest });
  check(recovered.recovered && recovered.interruptedAttempts.includes(attempt) && !recovered.humanRuntimeAcceptance
    && recovered.processes.processTermination === false && recovered.processes.childCleanup === 'unverified-no-tracked-child-identities',
  'proven ESRCH recovery records interruption and leaves untracked child cleanup explicitly unverified');
  const recoveryEvents = fs.readdirSync(path.join(root, path.posix.dirname(abandoned.manifest), 'events')).sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(root, path.posix.dirname(abandoned.manifest), 'events', name))));
  const preparedIndex = recoveryEvents.findIndex(event => event.kind === 'lock-recovery-prepared');
  const completedIndex = recoveryEvents.findIndex(event => event.kind === 'lock-recovered');
  check(preparedIndex >= 0 && completedIndex > preparedIndex && recoveryEvents[completedIndex].data.completion.sha256 === sha(path.join(root, recovered.completion.path)),
    'recovery completion is separately hash-bound and recorded after preparation');
  check(fs.readFileSync(path.join(root, recovered.archive, 'write-lock.json')).equals(abandonedBytes)
    && sha(path.join(root, residue)) === residueHash && !fs.existsSync(path.join(root, abandonedLock)),
  'dead-owner recovery archives exact ownership bytes and retains copied residue');
  check(JSON.stringify(Object.fromEntries(fs.readdirSync(ledger).map(name => [name, sha(path.join(ledger, name))]))) === JSON.stringify(reservations),
    'recovery preserves the complete attempt/revision reservation chain');
  const after = await lifecycle.run('status', { root, manifest: abandoned.manifest });
  check(after.ownership.writable && after.ownership.state === 'available' && after.phases.provisional.attempts === 1
    && after.phases.provisional.interruptedAttempts.includes(attempt) && after.phases.provisional.incompleteAttempts.length === 0,
  'recovered asset becomes writable while its interrupted attempt remains consumed');
  const child = await lifecycle.run('init', init({ asset: 'abandoned-owner', version: 'v2', 'parent-manifest': abandoned.manifest }));
  for (let retry = 0; retry < 2; retry++)
    await rejected(() => lifecycle.run('stage', { root, manifest: child.manifest, phase: 'provisional', package: data.packagePath }), /Bubo|initialized|built|dependency|Git|runtime/i);
  await rejected(() => lifecycle.run('stage', { root, manifest: child.manifest, phase: 'provisional', package: data.packagePath }), /candidate|budget|exhaust/i);
  check((await lifecycle.run('status', { root, manifest: child.manifest })).phases.provisional.attempts === 2,
    'new-version retries share the original allowance including its recovered interrupted attempt');
  const archived = path.join(root, recovered.archive, 'write-lock.json'), archiveBytes = fs.readFileSync(archived);
  try {
    fs.appendFileSync(archived, '\n');
    check((await lifecycle.run('status', { root, manifest: abandoned.manifest })).fresh === false, 'archived ownership evidence drift invalidates recovery freshness');
  } finally { fs.writeFileSync(archived, archiveBytes); }

  const concurrent = await preparedTakeover('concurrent-owner', true), concurrentDirectory = concurrent.assetDirectory;
  const results = await Promise.all([fixtureCommand('recover', '--root', root, '--manifest', concurrent.manifest),
    fixtureCommand('recover', '--root', root, '--manifest', concurrent.manifest)]);
  check(results.filter(result => result.code === 0).length === 1 && results.filter(result => result.code !== 0).length === 1,
    'two actual competing recovery processes produce exactly one successful archive');
  check(fs.readdirSync(path.join(root, concurrentDirectory, '.recoveries')).length === 2
    && (await lifecycle.run('status', { root, manifest: concurrent.manifest })).ownership.writable,
  'competing takeovers preserve the prior audit and exactly one successful successor archive');
}
async function drift(name, reason) {
  const file = path.join(root, name), before = fs.readFileSync(file);
  try {
    fs.appendFileSync(file, '\n');
    const stale = await lifecycle.run('status', options());
    check(stale.fresh === false && stale.stale.length > 0 && Object.values(stale.phases).every(value => value.accepted === false), reason + ' invalidates current acceptance');
  } finally { fs.writeFileSync(file, before); }
  check((await lifecycle.run('status', options())).fresh === true, reason + ' is current after exact restoration');
  check(sha(file) === require('crypto').createHash('sha256').update(before).digest('hex'), reason + ' restores exact bytes');
}
async function main() {
  for (const args of [ ['promote', '--root', root], ['generate', '--root', root],
    ['doctor', '--root', root, '--host-context', 'injected.json'], ['doctor', '--root', root, '--root', root],
    ['doctor', '--root'], ['doctor', '--root', root, '--execute', 'true'], ['recover', '--root', root, '--manifest', data.manifest, '--force', 'true'] ]) {
    const result = cli(...args);
    check(result.status !== 0 && /unknown|unsupported|duplicate|unique|missing|protected|argument|operation/i.test(result.stdout + result.stderr),
      'public CLI refuses unsupported operation or flags: ' + args.join(' '));
  }
  const snapshot = adapter.snapshot(root);
  check(snapshot.engine.selectionSource === 'contract' && /^[a-f0-9]{64}$/.test(snapshot.engine.contractSha256), 'snapshot binds the real explicit ENGINE contract');
  check(snapshot.style.styleSha256 === sha(path.join(root, 'STYLE.md')), 'snapshot binds actual STYLE bytes');
  check(snapshot.architecture.sha256 === sha(path.join(root, 'ARCHITECTURE.md')), 'snapshot binds actual architecture bytes');
  check(snapshot.contractFiles.some(item => item.path.endsWith('.engine/registry.json')) && snapshot.contractFiles.some(item => item.path.endsWith('.engine/THREEJS.md')),
    'snapshot includes actual installed engine registry and definition references');
  const snapshotAgain = adapter.snapshot(root);
  check(snapshot.fingerprint === snapshotAgain.fingerprint, 'repeated unchanged policy snapshots have a stable fingerprint');
  const engineFile = path.join(root, 'ENGINE.md'), engineBytes = fs.readFileSync(engineFile);
  try {
    fs.unlinkSync(engineFile);
    assert.throws(() => adapter.snapshot(root), /explicit|ENGINE|contract|ENOENT/i); checks++;
    await rejected(() => lifecycle.run('init', init()), /explicit|ENGINE|contract|ENOENT/i);
    check(!fs.existsSync(path.join(root, data.manifest)), 'missing ENGINE cannot fabricate a contract hash or initialize lifecycle state');
  } finally { fs.writeFileSync(engineFile, engineBytes); }
  await rejected(() => lifecycle.run('init', init({ task: 'missing-task' })), /task|TASK/i);
  await rejected(() => lifecycle.run('init', init({ asset: '../escape' })), /identifier|path|safe|invalid|asset/i);
  await rejected(() => lifecycle.run('init', init({ brief: '../outside.json' })), /path|travers|escape|reserved/i);
  write(root, 'inputs/bad-brief.json', { ...JSON.parse(fs.readFileSync(path.join(root, data.brief))), executable: 'never execute this' });
  await rejected(() => lifecycle.run('init', init({ brief: 'inputs/bad-brief.json' })), /unknown|brief|property|field/i);
  write(root, 'inputs/duplicate-brief.json', fs.readFileSync(path.join(root, data.brief), 'utf8').replace('"intent":', '"intent":"duplicate", "intent":'));
  await rejected(() => lifecycle.run('init', init({ brief: 'inputs/duplicate-brief.json' })), /duplicate/i);
  write(root, 'inputs/unlicensed.json', { ...JSON.parse(fs.readFileSync(path.join(root, data.rights))), origin: 'unknown' });
  await rejected(() => lifecycle.run('init', init({ rights: 'inputs/unlicensed.json' })), /origin|rights|owned|licensed/i);
  const generated = JSON.parse(fs.readFileSync(path.join(root, data.rights)));
  generated.origin = 'generated';
  write(root, 'inputs/generated.json', generated);
  await rejected(() => lifecycle.run('init', init({ rights: 'inputs/generated.json' })), /generated|MEDIA|media|unavailable|authorization/i);
  check(!fs.existsSync(path.join(root, data.manifest)), 'invalid/generated input policy creates no VFX version');
  const mediaBefore = sha(path.join(root, 'MEDIA.md')), audioBefore = sha(path.join(root, 'AUDIO.md'));
  const initialized = await lifecycle.run('init', init());
  check(initialized.manifest === data.manifest, 'init returns canonical task-owned VFX state');
  const stateBytes = fs.readFileSync(path.join(root, data.manifest)), stateHash = sha(path.join(root, data.manifest));
  const status = await lifecycle.run('status', options());
  check(status.humanRuntimeAcceptance === false && status.promotionAvailable === false, 'host state grants no human runtime acceptance or promotion');
  await rejected(() => lifecycle.run('init', init()), /exist|immutable|version|retained/i);
  check(fs.readFileSync(path.join(root, data.manifest)).equals(stateBytes), 'duplicate init preserves immutable manifest bytes');
  await rejected(() => lifecycle.run('stage', { ...options(), phase: 'detailed', package: data.packagePath }), /provisional|accept/i);
  for (const name of ['STYLE.md', 'ENGINE.md', 'ARCHITECTURE.md', 'inputs/brief.json', 'inputs/rights.json', 'inputs/permission.txt'])
    await drift(name, name + ' drift');
  await drift('.hephaera/.engine/THREEJS.md', 'engine definition drift');
  await drift('.hephaera/.engine/registry.json', 'engine registry drift');
  await drift('.hephaera/commands/vfx-assets.sh', 'host launcher drift');
  await drift('.hephaera/commands/lib/vfx-assets.cjs', 'host lifecycle tool drift');
  for (const tool of ['engine-contract', 'style-contract', 'installation-maintenance', 'state-transition', 'bubo-mechanical-handoff'])
    await drift('.hephaera/commands/lib/' + tool + '.cjs', tool + ' transitive host tool drift');
  for (const tool of ['maintenance', 'files']) await drift('.hephaera/installer/core/' + tool + '.cjs', tool + ' installer gate drift');
  for (const kind of ['model', 'rig', 'clip', 'marker', 'transform'])
    await drift('inputs/bindings/' + kind + (kind === 'model' ? '.glb' : '.json'), kind + ' binding drift');
  const revision = await lifecycle.run('init', init({ version: 'v2', 'parent-manifest': data.manifest }));
  check(revision.manifest === data.revisedManifest && sha(path.join(root, data.manifest)) === stateHash, 'new version preserves exact parent and prior immutable state');
  const revisedStatus = await lifecycle.run('status', { root, manifest: revision.manifest });
  check(revisedStatus.humanRuntimeAcceptance === false && revisedStatus.promotionAvailable === false, 'revision inherits no human/runtime or promotion authority');
  await rejected(() => lifecycle.run('init', init({ version: 'v3' })), /parent|ancestry|budget|existing/i);
  const expanded = JSON.parse(fs.readFileSync(path.join(root, data.brief)));
  expanded.budgets.maxCandidates++;
  write(root, 'inputs/expanded-brief.json', expanded);
  await rejected(() => lifecycle.run('init', init({ version: 'v3', 'parent-manifest': revision.manifest, brief: 'inputs/expanded-brief.json' })), /budget|increase|reset/i);
  check(!fs.existsSync(path.join(root, data.manifest.replace('/v1/', '/v3/'))), 'new roots and expanded revision budgets cannot reset the retained asset allowance');
  const oldBrief = fs.readFileSync(path.join(root, data.brief));
  write(root, 'inputs/corrected-brief.json', JSON.parse(oldBrief));
  try {
    fs.appendFileSync(path.join(root, data.brief), '\n');
    check((await lifecycle.run('status', { root, manifest: revision.manifest })).fresh === false, 'stale original source invalidates its prior version');
    const corrected = await lifecycle.run('init', init({ version: 'v3', 'parent-manifest': revision.manifest, brief: 'inputs/corrected-brief.json' }));
    const correctedStatus = await lifecycle.run('status', { root, manifest: corrected.manifest });
    check(correctedStatus.fresh === true && Object.values(correctedStatus.phases).every(phase => !phase.accepted), 'explicit revision repairs stale external input while retaining parent history and clearing acceptance');
  } finally { fs.writeFileSync(path.join(root, data.brief), oldBrief); }
  const partial = '.hephaera/.cache/tasks/qa/vfx/partial/v1/inputs/brief.json';
  const partialStage = '.art-staging/tasks/qa/vfx/partial/v1/attempts/provisional-interrupted/package/package.json';
  write(root, partial, 'Retained interrupted input snapshot\n');
  write(root, partialStage, { private: true, description: 'Retained partial copy; never a sealed VFX package.' });
  const partialHashes = [sha(path.join(root, partial)), sha(path.join(root, partialStage))];
  await rejected(() => lifecycle.run('init', init({ asset: 'partial' })), /partial|existing|retain|parent|ancestry/i);
  await rejected(() => lifecycle.run('stage', { root, manifest: partial.replace('/inputs/brief.json', '/manifest.json'), phase: 'provisional', package: data.packagePath }), /ENOENT|missing/i);
  check(partialHashes[0] === sha(path.join(root, partial)) && partialHashes[1] === sha(path.join(root, partialStage))
    && !fs.existsSync(path.join(root, partial.replace('/inputs/brief.json', '/manifest.json'))), 'interrupted partial input/copy residue is retained and never adopted or sealed');
  await recoveryCases();
  check(sha(path.join(root, 'MEDIA.md')) === mediaBefore && sha(path.join(root, 'AUDIO.md')) === audioBefore, 'owned resource workflow leaves unrelated media domains unchanged');
  check(!fs.existsSync(path.join(root, 'assets')), 'fast lifecycle creates no runtime asset directory');
  check(!fs.existsSync(path.join(root, '.hephaera/runtime/bubo/artifacts/bubo')), 'fast policy suite builds and installs no native publication');
  const summary = { status: 'passed', assertions: checks, root, nativeExecution: false, syntheticFixture: true,
    scope: 'Host policy, immutable lifecycle, public CLI negatives; no resource-content/render/visual/human acceptance.' };
  fs.writeFileSync(path.join(cache, 'latest.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log('PASS:', checks, 'VFX host policy assertions');
}
main().catch(error => { console.error(error.stack); console.error('Preserved VFX fixture:', root); process.exitCode = 1; });
