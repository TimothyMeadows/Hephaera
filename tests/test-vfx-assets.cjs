'use strict';

// Fast policy/lifecycle checks. Installed native positives are exercised by
// test-vfx-installed.py with an explicitly selected verified publication.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), cp = require('child_process');
const fixture = require('./vfx-fixture.cjs');
const { BASE, sha, write, initialize } = fixture;
const cache = path.join(BASE, '.hephaera/.cache/tasks/hephaera-vfx-lifecycle/evidence/fast');
fs.mkdirSync(cache, { recursive: true });
const root = fs.mkdtempSync(path.join(cache, 'p-')), baseline = path.join(root, '.hephaera');
for (const name of ['commands/lib', '.engine', '.styles', '.architecture'])
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
    ['doctor', '--root'], ['doctor', '--root', root, '--execute', 'true'] ]) {
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
  check(sha(path.join(root, 'MEDIA.md')) === mediaBefore && sha(path.join(root, 'AUDIO.md')) === audioBefore, 'owned resource workflow leaves unrelated media domains unchanged');
  check(!fs.existsSync(path.join(root, 'assets')), 'fast lifecycle creates no runtime asset directory');
  check(!fs.existsSync(path.join(root, '.hephaera/runtime/bubo/artifacts/bubo')), 'fast policy suite builds and installs no native publication');
  const summary = { status: 'passed', assertions: checks, root, nativeExecution: false, syntheticFixture: true,
    scope: 'Host policy, immutable lifecycle, public CLI negatives; no resource-content/render/visual/human acceptance.' };
  fs.writeFileSync(path.join(cache, 'latest.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log('PASS:', checks, 'VFX host policy assertions');
}
main().catch(error => { console.error(error.stack); console.error('Preserved VFX fixture:', root); process.exitCode = 1; });
