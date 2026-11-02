'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const baseline = path.resolve(__dirname, '..'), core = path.join(baseline, 'installer/core');
const files = require('../installer/core/files.cjs'), { createInstaller, BLOCK } = require('../installer/core/index.cjs');
const leases = require('../installer/core/maintenance.cjs');
fs.mkdirSync(path.join(baseline, '.local'), { recursive: true });
const area = fs.mkdtempSync(path.join(baseline, '.local', 'installer-core-'));
const execute = (root, args) => {
  const result = cp.spawnSync('git', ['-C', root, '-c', 'user.name=Installer Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
};
function fixture(label) {
  const root = path.join(area, label); fs.mkdirSync(root);
  const source = path.join(root, 'source'), host = path.join(root, 'host'); fs.mkdirSync(source); fs.mkdirSync(host);
  execute(source, ['init', '-q']); execute(host, ['init', '-q']);
  for (const name of ['commands/create-host-ai-scaffold.sh', 'commands/resolve-hephaera-paths.sh', 'commands/lib/memory-common.sh', 'commands/lib/state-transition-common.sh', 'commands/lib/platform-common.sh', 'commands/lib/bubo-runtime.cjs', '.gitignore', '.gitattributes']) {
    const output = path.join(source, name); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.copyFileSync(path.join(baseline, name), output);
  }
  fs.writeFileSync(path.join(source, 'AGENTS.md'), '# Shared baseline\n');
  const lock = JSON.parse(fs.readFileSync(path.join(baseline, 'runtime/bubo.lock.json')));
  fs.mkdirSync(path.join(source, 'runtime')); fs.writeFileSync(path.join(source, 'runtime/bubo.lock.json'), JSON.stringify(lock));
  fs.writeFileSync(path.join(source, '.gitmodules'), '[submodule "runtime/bubo"]\n\tpath = runtime/bubo\n\turl = https://github.com/TimothyMeadows/Bubo.git\n');
  execute(source, ['add', '.']); execute(source, ['update-index', '--add', '--cacheinfo', '160000,' + lock.revision + ',runtime/bubo']); execute(source, ['commit', '-qm', 'Fixture source']);
  function manifest(version) {
    execute(source, ['tag', version]);
    return { schemaVersion: 1, version, repository: 'https://github.com/TimothyMeadows/Hephaera.git', revision: execute(source, ['rev-parse', 'HEAD']), tree: execute(source, ['rev-parse', 'HEAD^{tree}']), tag: version, bubo: lock, sourceDirty: false, coreFiles: files.inventory(core, name => name === 'release-manifest.json') };
  }
  const first = manifest('1.0.0');
  const make = (selected = first, extra = {}) => createInstaller({ manifest: selected, coreDirectory: core, transport: { local: true, repository: source }, ...extra });
  return { root, source, host, first, manifest, make };
}
test('fresh managed install automatically runs real canonical scaffold and repeat preserves durable bytes', () => {
  const x = fixture('install'); const agents = Buffer.from('Host rules with CRLF\r\n'); fs.writeFileSync(path.join(x.host, 'AGENTS.md'), agents);
  fs.writeFileSync(path.join(x.host, 'ENGINE.md'), 'A host-owned engine contract\n');
  const installer = x.make(), result = installer.install(x.host);
  assert.equal(result.scaffold, 'complete');
  assert.equal(fs.readFileSync(path.join(x.host, 'AGENTS.md'), 'utf8'), agents.toString() + '\n\n' + BLOCK + '\n');
  assert.equal(fs.readFileSync(path.join(x.host, 'ENGINE.md'), 'utf8'), 'A host-owned engine contract\n');
  assert.equal(installer.doctor(x.host).nativeReadiness, 'source-absent');
  const cache = path.join(x.host, '.hephaera/.cache'); fs.writeFileSync(path.join(cache, 'private-ledger.json'), '{"consumed":1}');
  const before = files.inventory(cache, name => name === 'installer' || name.startsWith('installer/'));
  installer.install(x.host);
  assert.deepEqual(files.inventory(cache, name => name === 'installer' || name.startsWith('installer/')), before);
  assert.equal(fs.readFileSync(path.join(x.host, '.gitignore'), 'utf8').split('/.hephaera/').length, 2);
  assert.equal(execute(x.host, ['ls-files', '--', '.hephaera']), '');
});
test('manifest/core tamper and dirty previews reject before project mutation', () => {
  const x = fixture('identities');
  assert.throws(() => createInstaller({ manifest: { ...x.first, coreFiles: { ...x.first.coreFiles, 'index.cjs': '0'.repeat(64) } }, coreDirectory: core }), /core changed/);
  const dirty = x.make({ ...x.first, sourceDirty: true }); assert.throws(() => dirty.install(x.host), /Dirty preview/);
  assert.equal(fs.existsSync(path.join(x.host, '.hephaera')), false);
  assert.equal(fs.existsSync(path.join(x.host, 'AGENTS.md')), false);
});
test('manual installs, malformed markers, parent roots and linked destinations fail before mutation', () => {
  const x = fixture('boundaries'); fs.writeFileSync(path.join(x.host, 'AGENTS.md'), '<!-- HEPHAERA_BOOTSTRAP_START -->\n');
  assert.throws(() => x.make().install(x.host), /marker/); assert.equal(fs.existsSync(path.join(x.host, '.hephaera')), false);
  fs.unlinkSync(path.join(x.host, 'AGENTS.md')); fs.mkdirSync(path.join(x.host, '.hephaera'));
  assert.throws(() => x.make().install(x.host), /unmanaged/);
  const child = path.join(x.host, 'child'); fs.mkdirSync(child); assert.throws(() => x.make().install(child), /own existing Git root/);
});
test('partial scaffold failure retains state and exact recovery finishes without resetting ledgers', () => {
  const x = fixture('recovery'); let once = true;
  const installer = x.make(x.first, { fault(phase) { if (phase === 'scaffold-after' && once) { once = false; throw new Error('Injected late interruption'); } } });
  assert.throws(() => installer.install(x.host), /Injected late interruption/);
  assert.equal(installer.doctor(x.host).recoveryRequired, true);
  const cache = path.join(x.host, '.hephaera/.cache'); fs.writeFileSync(path.join(cache, 'attempts.json'), '{"started":1}');
  assert.throws(() => leases.acquireRead(x.host), /inactive|incomplete operation/);
  const agents = fs.readFileSync(path.join(x.host, 'AGENTS.md'));
  assert.equal(installer.recover(x.host).scaffold, 'complete');
  assert.deepEqual(fs.readFileSync(path.join(x.host, 'AGENTS.md')), agents);
  assert.equal(fs.readFileSync(path.join(cache, 'attempts.json'), 'utf8'), '{"started":1}');
});
test('repair permits only canonical missing system defaults and preserves original prefix', () => {
  const x = fixture('defaults'); const installer = x.make(); installer.install(x.host);
  const file = path.join(x.host, '.hephaera/.cache/SYSTEM_MEMORY.md'), prefix = '# System Memory\n\n- Keep the custom constraint.\n';
  fs.writeFileSync(file, prefix); installer.repair(x.host);
  assert.equal(fs.readFileSync(file, 'utf8').startsWith(prefix), true);
  const complete = fs.readFileSync(file); installer.repair(x.host); assert.deepEqual(fs.readFileSync(file), complete);
});
test('updates preserve cache location, reject edits/collisions and restore exact locked version', () => {
  const x = fixture('update'); x.make().install(x.host);
  const cache = path.join(x.host, '.hephaera/.cache'); fs.writeFileSync(path.join(cache, 'ledger.json'), '{"remaining":0}');
  const original = path.join(x.host, '.hephaera/AGENTS.md'); fs.appendFileSync(original, 'local change');
  fs.writeFileSync(path.join(x.source, 'new-source.txt'), 'new version\n'); execute(x.source, ['add', '.']); execute(x.source, ['update-index', '--add', '--cacheinfo', '160000,' + x.first.bubo.revision + ',runtime/bubo']); execute(x.source, ['commit', '-qm', 'Update fixture']);
  const second = x.manifest('1.1.0'), newer = x.make(second);
  assert.throws(() => newer.update(x.host, { dryRun: true }), /edits/);
  execute(path.join(x.host, '.hephaera'), ['checkout', '--', 'AGENTS.md']);
  const plan = newer.update(x.host, { dryRun: true }); assert.equal(plan.to, '1.1.0');
  const reader = leases.acquireRead(x.host); assert.throws(() => newer.update(x.host), /readers are active/); reader.release();
  assert.equal(newer.update(x.host).version, '1.1.0');
  assert.equal(fs.readFileSync(path.join(cache, 'ledger.json'), 'utf8'), '{"remaining":0}');
  assert.equal(fs.readFileSync(path.join(x.host, '.hephaera/new-source.txt'), 'utf8').replace(/\r\n/g, '\n'), 'new version\n');
  assert.throws(() => x.make().restore(x.host), /exact package version/);
  assert.equal(newer.restore(x.host).scaffold, 'complete');
});
test('deactivation retains source/cache/ignore and read admission refuses inactive lock', () => {
  const x = fixture('deactivate'), installer = x.make(); installer.install(x.host);
  const cache = path.join(x.host, '.hephaera/.cache'); fs.writeFileSync(path.join(cache, 'consent.json'), 'private');
  const ignore = fs.readFileSync(path.join(x.host, '.gitignore'));
  installer.deactivate(x.host, { removeBootstrap: true });
  assert.equal(fs.readFileSync(path.join(x.host, 'AGENTS.md'), 'utf8').includes('HEPHAERA_BOOTSTRAP_START'), false);
  assert.equal(fs.readFileSync(path.join(cache, 'consent.json'), 'utf8'), 'private');
  assert.deepEqual(fs.readFileSync(path.join(x.host, '.gitignore')), ignore);
  assert.throws(() => leases.acquireRead(x.host), /inactive/);
});
test('maintenance gate prevents readers/writer overlap and stale captured identities', () => {
  const x = fixture('leases'); x.make().install(x.host);
  const captured = leases.captureIdentity(x.host), one = leases.acquireRead(x.host, captured), two = leases.acquireRead(x.host, captured);
  assert.throws(() => leases.acquireWrite(x.host), /readers are active/); one.release(); one.release(); two.release();
  const writer = leases.acquireWrite(x.host); assert.throws(() => leases.acquireRead(x.host), /writer is active/); writer.release();
  const lockFile = path.join(x.host, 'hephaera.lock.json'), lock = JSON.parse(fs.readFileSync(lockFile)); files.write(lockFile, { ...lock, active: false });
  assert.throws(() => leases.acquireRead(x.host, captured), /identity changed/);
  const directory = path.join(x.host, '.hephaera/.cache/installer/maintenance/readers'); fs.writeFileSync(path.join(directory, 'unknown.json'), '{}');
  assert.throws(() => leases.acquireWrite(x.host), /Invalid maintenance reader/);
});
test('actual child reader blocks writer until process releases its lease', async () => {
  const x = fixture('child-reader'); x.make().install(x.host);
  const script = 'const m=require(process.argv[1]);const l=m.acquireRead(process.argv[2]);process.stdout.write("ready\\n");setTimeout(()=>{l.release();},300);';
  const child = cp.spawn(process.execPath, ['-e', script, path.join(core, 'maintenance.cjs'), x.host], { windowsHide: true });
  await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.once('data', resolve); });
  assert.throws(() => leases.acquireWrite(x.host), /readers are active/);
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code ? reject(new Error('child failed')) : resolve()); });
  leases.acquireWrite(x.host).release();
});
test('ignored next-version collisions fail without overwriting foreign bytes', () => {
  const x = fixture('collision'); x.make().install(x.host);
  const installed = path.join(x.host, '.hephaera');
  fs.mkdirSync(path.join(installed, '.git/info'), { recursive: true });
  fs.appendFileSync(path.join(installed, '.git/info/exclude'), '\nforeign.txt\n');
  fs.writeFileSync(path.join(installed, 'foreign.txt'), 'user-owned');
  fs.writeFileSync(path.join(x.source, 'foreign.txt'), 'release-owned'); execute(x.source, ['add', 'foreign.txt']); execute(x.source, ['commit', '-qm', 'Add collision candidate']);
  const newer = x.make(x.manifest('1.2.0'));
  assert.throws(() => newer.update(x.host), /collides with an unknown/);
  assert.equal(fs.readFileSync(path.join(installed, 'foreign.txt'), 'utf8'), 'user-owned');
  assert.equal(execute(installed, ['rev-parse', 'HEAD']), x.first.revision);
});
test('interrupted update recovers exact target and retains private state', () => {
  const x = fixture('update-recover'); x.make().install(x.host);
  fs.writeFileSync(path.join(x.host, '.hephaera/.cache/private.json'), '{"approved":false}');
  fs.writeFileSync(path.join(x.source, 'updated.txt'), 'updated'); execute(x.source, ['add', 'updated.txt']); execute(x.source, ['commit', '-qm', 'Second release']);
  const second = x.manifest('1.3.0'); let fail = true;
  const newer = x.make(second, { fault(phase) { if (phase === 'source-updated' && fail) { fail = false; throw new Error('Interrupted update'); } } });
  assert.throws(() => newer.update(x.host), /Interrupted update/);
  assert.equal(newer.doctor(x.host).recoveryRequired, true);
  assert.equal(newer.recover(x.host).version, '1.3.0');
  assert.equal(fs.readFileSync(path.join(x.host, '.hephaera/.cache/private.json'), 'utf8'), '{"approved":false}');
});
test('fresh restore uses host lock and refuses a different package identity', () => {
  const x = fixture('fresh-restore'); x.make().install(x.host);
  const restored = path.join(x.root, 'restored'); fs.mkdirSync(restored); execute(restored, ['init', '-q']);
  fs.copyFileSync(path.join(x.host, 'hephaera.lock.json'), path.join(restored, 'hephaera.lock.json'));
  assert.equal(x.make().restore(restored).version, '1.0.0');
  assert.equal(fs.existsSync(path.join(restored, '.hephaera/.cache/SYSTEM_MEMORY.md')), true);
});
test('moved release tags are refused and interrupted pre-install source is retained', () => {
  const x = fixture('moved-tag');
  fs.writeFileSync(path.join(x.source, 'later.txt'), 'later'); execute(x.source, ['add', 'later.txt']); execute(x.source, ['commit', '-qm', 'Move tag']); execute(x.source, ['tag', '-f', '1.0.0']);
  assert.throws(() => x.make().install(x.host), /tag moved/);
  assert.equal(fs.existsSync(path.join(x.host, '.hephaera')), false);
  assert.equal(fs.existsSync(path.join(x.host, 'AGENTS.md')), false);
  assert.equal(fs.readdirSync(x.host).some(n => n.startsWith('.hephaera-install-')), true);
});
test('linked durable cache is refused without touching its target', () => {
  const x = fixture('links'); const outside = path.join(x.root, 'outside'); fs.mkdirSync(outside);
  fs.mkdirSync(path.join(x.host, '.hephaera')); fs.symlinkSync(outside, path.join(x.host, '.hephaera/.cache'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => x.make().install(x.host), /symbolic links|junctions/);
  assert.deepEqual(fs.readdirSync(outside), []);
});
test('explicit source opt-in admits only the existing pinned Bubo source without a native build', () => {
  const x = fixture('source-opt-in');
  const installer = x.make(x.first, { transport: { local: true, repository: x.source, buboRepository: path.join(baseline, 'runtime/bubo') } });
  assert.equal(installer.install(x.host, { withBuboSource: true }).scaffold, 'complete');
  assert.equal(execute(path.join(x.host, '.hephaera/runtime/bubo'), ['rev-parse', 'HEAD']), x.first.bubo.revision);
  assert.equal(fs.existsSync(path.join(x.host, '.hephaera/runtime/bubo/artifacts/bubo/build-info.json')), false);
  assert.equal(installer.doctor(x.host).nativeReadiness, 'initialized-unbuilt');
  const nested = path.join(x.host, '.hephaera/runtime/bubo');
  execute(nested, ['checkout', '--detach', 'HEAD^']);
  assert.equal(installer.doctor(x.host).nativeReadiness, 'source-stale');
  execute(nested, ['checkout', '--detach', x.first.bubo.revision]);
  fs.appendFileSync(path.join(nested, 'README.md'), '\nLocal source change.\n');
  assert.throws(() => installer.update(x.host, { dryRun: true }), /Nested Bubo source\/index/);
  assert.throws(() => installer.repair(x.host, { withBuboSource: true }), /Nested Bubo source\/index/);
  execute(nested, ['checkout', '--', 'README.md']);
  execute(nested, ['checkout', '-b', 'unpublished-fixture']); fs.appendFileSync(path.join(nested, 'README.md'), '\nUnpublished source.\n'); execute(nested, ['add', 'README.md']); execute(nested, ['commit', '-qm', 'Unpublished fixture change']);
  assert.throws(() => installer.update(x.host, { dryRun: true }), /Nested Bubo contains unpublished/);
});
test('crashed maintenance owner is preserved until explicit known-owner reconciliation', async () => {
  const x = fixture('crashed-owner'); x.make().install(x.host);
  const script = 'require(process.argv[1]).acquireRead(process.argv[2]);process.stdout.write("owned\\n");';
  const child = cp.spawn(process.execPath, ['-e', script, path.join(core, 'maintenance.cjs'), x.host], { windowsHide: true });
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code ? reject(new Error('child failed')) : resolve()); });
  assert.throws(() => leases.acquireWrite(x.host), /Stale or unverifiable/);
  const directory = path.join(x.host, '.hephaera/.cache/installer/maintenance'), before = files.inventory(directory);
  assert.throws(() => leases.reconcile(x.host), /confirm-quiescent/);
  assert.deepEqual(files.inventory(directory), before);
  assert.equal(x.make().recover(x.host, { confirmQuiescent: true }).maintenance.reconciled.length, 1);
  leases.acquireWrite(x.host).release();
});
test('initial install dry-run performs no project writes and reports target admission limits', () => {
  const x = fixture('install-preview'), before = files.inventory(x.host);
  const plan = x.make().install(x.host, { dryRun: true });
  assert.equal(plan.mandatoryScaffold, true); assert.equal(plan.stagedTargetAdmission, 'not-run'); assert.equal(plan.requiresCandidateStaging, true);
  assert.deepEqual(files.inventory(x.host), before); assert.equal(fs.existsSync(path.join(x.host, '.hephaera')), false);
});
test('user hooks and clone templates are suppressed for installer-owned Git operations', () => {
  const x = fixture('hooks'), hooks = path.join(x.root, 'user-hooks'), template = path.join(x.root, 'user-template'), marker = path.join(x.root, 'HOOK-FIRED');
  fs.mkdirSync(hooks); fs.mkdirSync(path.join(template, 'hooks'), { recursive: true });
  const script = '#!/usr/bin/env bash\nprintf hooked > "' + marker.replace(/\\/g, '/') + '"\n';
  for (const p of [path.join(hooks, 'post-checkout'), path.join(template, 'hooks/post-checkout')]) { fs.writeFileSync(p, script); fs.chmodSync(p, 0o755); }
  const values = { GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: hooks, GIT_CONFIG_KEY_1: 'init.templateDir', GIT_CONFIG_VALUE_1: template };
  const prior = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  try { Object.assign(process.env, values); x.make().install(x.host); } finally { for (const [k,v] of Object.entries(prior)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.existsSync(path.join(x.host, '.hephaera/.git/hooks/post-checkout')), false);
});
test('failed scaffold process retains exact executable and exit status without raw diagnostics', () => {
  const x = fixture('process-diagnostics');
  assert.throws(() => x.make(x.first, { bash: process.execPath }).install(x.host), /exit=1/);
  const pending = JSON.parse(fs.readFileSync(path.join(x.host, '.hephaera/.cache/installer/pending.json')));
  assert.equal(pending.diagnostics.exitCode, 1); assert.equal(pending.diagnostics.executable, path.basename(process.execPath));
  assert.deepEqual(Object.keys(pending.diagnostics).sort(), ['errorCode', 'executable', 'exitCode', 'signal']);
  assert.equal(x.make().recover(x.host).scaffold, 'complete');
});
test('top-level lock identity mutations cannot contradict nested verified release identity', () => {
  const x = fixture('lock-consistency'), installer = x.make(); installer.install(x.host);
  const file = path.join(x.host, 'hephaera.lock.json'), original = JSON.parse(fs.readFileSync(file));
  for (const [name, value] of [['repository', 'https://example.invalid/foreign.git'], ['tree', '0'.repeat(40)], ['tag', 'other'], ['channel', 'foreign']]) {
    files.write(file, { ...original, [name]: value });
    assert.throws(() => installer.repair(x.host), /lock is malformed/);
  }
  files.write(file, { ...original, releaseManifest: { ...original.releaseManifest, bubo: null } });
  assert.throws(() => installer.repair(x.host), /Bubo identity/);
  files.write(file, original); assert.equal(installer.doctor(x.host).source, 'verified');
});
test('CRLF managed host blocks survive Git checkout, repeat, restore and exact deactivation', () => {
  const x = fixture('host-crlf'), installer = x.make();
  const agentsFile = path.join(x.host, 'AGENTS.md'), ignoreFile = path.join(x.host, '.gitignore');
  fs.writeFileSync(agentsFile, 'Project règles 🌙\r\nKeep these host instructions.\r\n');
  fs.writeFileSync(ignoreFile, '# Host café 🦉\r\nbuild/\r\n');
  installer.install(x.host);
  const toCrlf = bytes => Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n'));
  fs.writeFileSync(agentsFile, toCrlf(fs.readFileSync(agentsFile))); fs.writeFileSync(ignoreFile, toCrlf(fs.readFileSync(ignoreFile)));
  const agents = fs.readFileSync(agentsFile), ignore = fs.readFileSync(ignoreFile);
  assert.equal(installer.doctor(x.host).scaffold, 'complete');
  installer.install(x.host); installer.restore(x.host);
  assert.deepEqual(fs.readFileSync(agentsFile), agents); assert.deepEqual(fs.readFileSync(ignoreFile), ignore);
  fs.writeFileSync(agentsFile, Buffer.from(agents.toString('utf8').replace('Read and follow', 'Read  and follow')));
  assert.throws(() => installer.doctor(x.host), /marker is malformed/);
  fs.writeFileSync(agentsFile, agents);
  const needle = Buffer.from(BLOCK.replace(/\n/g, '\r\n') + '\r\n'), at = agents.indexOf(needle);
  assert.ok(at > 0);
  installer.deactivate(x.host, { removeBootstrap: true });
  assert.deepEqual(fs.readFileSync(agentsFile), Buffer.concat([agents.subarray(0, at), agents.subarray(at + needle.length)]));
  assert.deepEqual(fs.readFileSync(ignoreFile), ignore);
});
test('recovery fences initial pre-lock failure before recovered source publication', () => {
  const x = fixture('recovery-publication');
  assert.throws(() => x.make(x.first, { transport: { local: true, repository: path.join(x.root, 'missing-source') } }).install(x.host), /git.*failed/);
  assert.equal(fs.existsSync(path.join(x.host, '.hephaera')), false);
  assert.equal(fs.existsSync(path.join(x.host, 'hephaera.lock.json')), false);
  let observedBefore = false, observedAfter = false;
  const recovering = x.make(x.first, { fault(phase) {
    if (phase === 'recovery-before-publication') {
      observedBefore = true; assert.equal(fs.existsSync(path.join(x.host, '.hephaera')), false);
      const identity = leases.captureIdentity(x.host); assert.equal(identity.managed, true); assert.equal(identity.active, false);
    }
    if (phase === 'recovery-source-materialized') {
      observedAfter = true; assert.equal(fs.existsSync(path.join(x.host, '.hephaera')), true);
      assert.equal(leases.captureIdentity(x.host).active, false);
      assert.throws(() => leases.acquireRead(x.host), /inactive|incomplete operation/);
      throw new Error('Interrupted recovered publication');
    }
  } });
  assert.throws(() => recovering.recover(x.host), /Interrupted recovered publication/);
  assert.equal(observedBefore, true); assert.equal(observedAfter, true);
  assert.equal(x.make().recover(x.host).scaffold, 'complete');
  assert.equal(leases.captureIdentity(x.host).active, true);
});
test('recovery preserves an unrelated approved host lock instead of overwriting it', () => {
  const x = fixture('recovery-lock-identity');
  assert.throws(() => x.make(x.first, { transport: { local: true, repository: path.join(x.root, 'missing-source') } }).install(x.host), /git.*failed/);
  const other = x.manifest('2.0.0'), lock = { schemaVersion: 1, version: other.version, repository: other.repository, revision: other.revision, tree: other.tree, tag: other.tag, manifestSha256: files.digest(other), channel: 'npm', active: true, releaseManifest: other };
  const lockFile = path.join(x.host, 'hephaera.lock.json'); files.write(lockFile, lock); const before = fs.readFileSync(lockFile);
  assert.throws(() => x.make().recover(x.host), /Host lock changed outside/);
  assert.deepEqual(fs.readFileSync(lockFile), before); assert.equal(fs.existsSync(path.join(x.host, '.hephaera')), false);
});
test('terminated-process diagnostics require explicit quiescence review before recovery', () => {
  const x = fixture('termination-confirmation');
  const interrupted = x.make(x.first, { fault(phase) {
    if (phase === 'scaffold-before') { const error = new Error('Supplied termination diagnostic'); error.diagnostics = { executable: 'fixture-worker', exitCode: null, signal: 'SIGTERM', errorCode: 'ETIMEDOUT' }; throw error; }
  } });
  assert.throws(() => interrupted.install(x.host), /Supplied termination diagnostic/);
  const pending = path.join(x.host, '.hephaera/.cache/installer/pending.json'), before = fs.readFileSync(pending);
  assert.equal(JSON.parse(before).requiresQuiescentConfirmation, true);
  assert.throws(() => x.make().recover(x.host), /confirm-quiescent/);
  assert.deepEqual(fs.readFileSync(pending), before);
  assert.equal(x.make().recover(x.host, { confirmQuiescent: true }).scaffold, 'complete');
});
module.exports = { fixture, area };
