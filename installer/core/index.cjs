'use strict';
const f = require('./files.cjs'), cp = require('node:child_process'), os = require('node:os');
const manifests = require('./manifest.cjs'), maintenance = require('./maintenance.cjs');
const BLOCK = '<!-- HEPHAERA_BOOTSTRAP_START -->\n## Hephaera Bootstrap (Managed)\n\nRead and follow `./.hephaera/AGENTS.md` before repository-local instructions.\nHephaera is installed only in `./.hephaera/`. Project-local durable memory, tasks,\nworkflow state and reports are stored only in `./.hephaera/.cache/`.\n<!-- HEPHAERA_BOOTSTRAP_END -->';
const IGNORE = '# hephaera-installer:begin\n/.hephaera/\n# hephaera-installer:end';
const PRIVATE = '.hephaera/.cache/installer', RECEIPT = PRIVATE + '/installation.json', PENDING = PRIVATE + '/pending.json';
const HOST_CONTRACTS = ['ENGINE.md', 'ARCHITECTURE.md', 'STYLE.md', 'MEDIA.md', 'AUDIO.md', 'MUSIC.md', 'VOICE.md', 'BRAINSTORM.md', 'BRAINSTORM_SUMMARY.md'];
const NO_HOOKS = f.path.join(__dirname, 'no-hooks');
function gitEnvironment(environment) {
  const result = { ...environment }, count = Number(result.GIT_CONFIG_COUNT || 0);
  if (!Number.isInteger(count) || count < 0 || count > 64) f.fail('Unverifiable Git environment configuration.');
  result.GIT_CONFIG_COUNT = String(count + 2);
  result['GIT_CONFIG_KEY_' + count] = 'core.hooksPath'; result['GIT_CONFIG_VALUE_' + count] = NO_HOOKS;
  result['GIT_CONFIG_KEY_' + (count + 1)] = 'core.fsmonitor'; result['GIT_CONFIG_VALUE_' + (count + 1)] = 'false';
  return result;
}
function run(executable, args, cwd, options = {}) {
  if (f.fs.readdirSync(NO_HOOKS).join('\n') !== 'empty.cjs') f.fail('Installer hook suppression directory changed.');
  if (executable === 'git') args = ['-c', 'core.hooksPath=' + NO_HOOKS, '-c', 'core.fsmonitor=false', ...args];
  const result = cp.spawnSync(executable, args, { cwd, windowsHide: true, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, ...options, env: gitEnvironment(options.env || process.env) });
  if (result.error || result.status !== 0) {
    const diagnostics = { executable: f.path.basename(executable), exitCode: result.status, signal: result.signal || null, errorCode: result.error ? result.error.code || 'EXECUTION_ERROR' : null };
    const error = new Error(diagnostics.executable + ' failed (exit=' + diagnostics.exitCode + ', code=' + (diagnostics.errorCode || diagnostics.signal || 'NONZERO_EXIT') + '); inspect prerequisites and retained operation diagnostics.');
    error.diagnostics = diagnostics; throw error;
  }
  return result.stdout;
}
const git = (root, args) => run('git', ['-C', root, ...args], root).trim();
const sourcePaths = root => git(root, ['-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', '-z', 'HEAD']).split('\0').filter(Boolean);
const sourceEntries = root => git(root, ['-c', 'core.quotepath=false', 'ls-tree', '-r', '-z', 'HEAD']).split('\0').filter(Boolean).map(line => { const at = line.indexOf('\t'); return { mode: line.slice(0, at).split(' ')[0], name: line.slice(at + 1) }; });
const text = file => f.fs.existsSync(file) ? f.fs.readFileSync(file) : null;
function managedSpan(bytes, block) {
  if (!bytes) return null;
  // Latin-1 maps each byte to one code unit, so offsets remain correct even
  // when unrelated host text contains Unicode or undecodable bytes. Match
  // only LF/CRLF variation; every other managed byte must remain canonical.
  const pattern = Buffer.from(block, 'utf8').toString('latin1').split('\n').map(line => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\r?\\n');
  const match = new RegExp(pattern).exec(bytes.toString('latin1'));
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}
function markers(bytes, block, start, end) {
  const value = bytes ? bytes.toString('utf8') : '';
  if (value.includes(start) || value.includes(end)) {
    if (value.split(start).length !== 2 || value.split(end).length !== 2 || !managedSpan(bytes, block)) f.fail('Managed marker is malformed, duplicated or changed; reconcile explicitly.');
    return true;
  }
  return false;
}
function hostRoot(value) {
  const root = f.root(value);
  if (!f.same(f.path.resolve(git(root, ['rev-parse', '--show-toplevel'])), root)) f.fail('Project must be its own existing Git root.');
  for (const name of ['AGENTS.md', '.gitignore', 'hephaera.lock.json', '.hephaera', '.opencaw']) f.safe(root, name);
  if (f.fs.existsSync(f.safe(root, '.opencaw'))) f.fail('Legacy installation requires explicit reviewed migration.');
  const agents = text(f.safe(root, 'AGENTS.md'));
  if (agents && /OPENCAW_BOOTSTRAP_/.test(agents.toString('utf8'))) f.fail('Legacy bootstrap requires explicit migration.');
  markers(agents, BLOCK, 'HEPHAERA_BOOTSTRAP_START', 'HEPHAERA_BOOTSTRAP_END');
  markers(text(f.safe(root, '.gitignore')), IGNORE, 'hephaera-installer:begin', 'hephaera-installer:end');
  if (f.fs.existsSync(f.safe(root, '.hephaera/.cache/STATE_TRANSITION.json'))) f.fail('State transition fence requires explicit reconciliation.');
  if (git(root, ['ls-files', '--', '.hephaera']).length) f.fail('Host index tracks .hephaera; manual clone/submodule migration is required.');
  return root;
}
function bootstrapSnapshot(root) {
  const file = f.safe(root, 'AGENTS.md'), before = text(file);
  const present = markers(before, BLOCK, 'HEPHAERA_BOOTSTRAP_START', 'HEPHAERA_BOOTSTRAP_END');
  return { before: before ? before.toString('base64') : null, expected: present ? before.toString('base64') : Buffer.concat([before || Buffer.from('# AGENTS.md\n\n'), Buffer.from((before ? '\n\n' : '') + BLOCK + '\n')]).toString('base64'), inserted: !present };
}
function cacheSnapshot(root) {
  const cache = f.safe(root, '.hephaera/.cache');
  const files = f.inventory(cache, name => name === 'installer' || name.startsWith('installer/'));
  const system = text(f.safe(root, '.hephaera/.cache/SYSTEM_MEMORY.md'));
  const contracts = Object.fromEntries(HOST_CONTRACTS.map(n => [n, f.fs.existsSync(f.safe(root, n)) ? f.hash(f.safe(root, n)) : null]));
  return { files, system: system ? system.toString('base64') : null, contracts };
}
function verifyCache(root, snapshot, baseline) {
  for (const [name, expected] of Object.entries(snapshot.files)) {
    if (name === 'SYSTEM_MEMORY.md') continue;
    if (!f.fs.existsSync(f.safe(root, '.hephaera/.cache/' + name)) || f.hash(f.safe(root, '.hephaera/.cache/' + name)) !== expected) f.fail('Durable state changed unexpectedly: ' + name);
  }
  if (snapshot.system !== null) {
    const old = Buffer.from(snapshot.system, 'base64'), actual = text(f.safe(root, '.hephaera/.cache/SYSTEM_MEMORY.md'));
    const source = f.fs.readFileSync(f.safe(baseline, 'commands/lib/memory-common.sh'), 'utf8').replace(/\r\n/g, '\n');
    const match = /hephaera_system_defaults\(\)\s*\{\s*cat <<'EOF'\n([\s\S]*?)\nEOF/.exec(source);
    if (!match) f.fail('Cannot identify canonical system-memory defaults.');
    const existing = old.toString('utf8').split(/\r?\n/), append = match[1].split('\n').filter(line => line && !existing.includes(line)).map(line => line + '\n').join('');
    if (!actual || !actual.equals(Buffer.concat([old, Buffer.from(append)]))) f.fail('System memory changed outside declared default appends.');
  }
  for (const [name, expected] of Object.entries(snapshot.contracts)) {
    const actual = f.fs.existsSync(f.safe(root, name)) ? f.hash(f.safe(root, name)) : null;
    if (actual !== expected) f.fail('Host contract changed during scaffold: ' + name);
  }
}
function findBash() {
  if (process.platform !== 'win32') { run('bash', ['--version'], process.cwd()); return 'bash'; }
  const location = run('git', ['--exec-path'], process.cwd()).trim();
  const executable = f.path.resolve(location, '../../..', 'bin/bash.exe');
  if (f.fs.existsSync(executable)) { run(executable, ['--version'], process.cwd()); return executable; }
  try { run('wsl.exe', ['--exec', 'bash', '--version'], process.cwd()); return { provider: 'WSL' }; } catch {}
  f.fail('Existing Git Bash or WSL Bash is required; no software was installed.');
}
function scaffold(root, baseline, snapshot, bootstrap, bash) {
  for (const [name, expected] of Object.entries(snapshot.files)) {
    if (name !== 'SYSTEM_MEMORY.md' && (!f.fs.existsSync(f.safe(root, '.hephaera/.cache/' + name)) || f.hash(f.safe(root, '.hephaera/.cache/' + name)) !== expected)) f.fail('Durable state changed since operation preparation: ' + name);
  }
  const currentSnapshot = cacheSnapshot(root);
  const environment = { ...process.env, HEPHAERA_PROJECT_ROOT: root.replace(/\\/g, '/') };
  const output = typeof bash === 'string'
    ? run(bash, [f.path.join(baseline, 'commands/create-host-ai-scaffold.sh').replace(/\\/g, '/')], root, { env: environment })
    : run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f.path.join(baseline, 'commands/install-windows-bash.ps1'), '-Provider', 'WSL', '-RunScaffold', '-ProjectRoot', root], root, { env: environment });
  const selected = output.split(/\r?\n/).find(line => line.startsWith('HEPHAERA_PROJECT_ROOT='));
  const native = value => process.platform === 'win32' ? value.replace(/^\/(?:mnt\/)?([a-zA-Z])\//, (_, drive) => drive.toUpperCase() + ':/') : value;
  if (!selected || !f.same(f.path.resolve(native(selected.slice('HEPHAERA_PROJECT_ROOT='.length))), root)) f.fail('Scaffold resolved a different project root.');
  if (!text(f.safe(root, 'AGENTS.md')).equals(Buffer.from(bootstrap.expected, 'base64'))) f.fail('Scaffold changed unrelated host AGENTS bytes.');
  for (const name of ['SYSTEM_MEMORY.md', 'MEMORY.md', 'RULES.md', 'REPO_MAP.md', 'DEBUG.md', 'tasks/TODO.md', 'tasks/OPEN_ISSUES.md', 'tasks/example-task/TASK.md']) if (!f.fs.statSync(f.safe(root, '.hephaera/.cache/' + name)).isFile()) f.fail('Scaffold required file is absent.');
  verifyCache(root, snapshot, baseline);
  verifyCache(root, currentSnapshot, baseline);
}
function exclusive(root, action, recover = false, confirmQuiescent = false) {
  const directory = f.safe(root, '.hephaera-installer.lock'), ownerFile = f.path.join(directory, 'owner.json');
  if (recover && f.fs.existsSync(directory)) {
    const previous = f.read(f.safe(root, '.hephaera-installer.lock/owner.json'));
    if (previous.schemaVersion !== 1 || previous.host !== os.hostname() || !Number.isInteger(previous.pid) || previous.pid < 1 || !/^[0-9a-f-]{36}$/.test(previous.id || '')) f.fail('Unknown installer lock owner.');
    try { process.kill(previous.pid, 0); f.fail('Installer owner remains active.'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    if (confirmQuiescent !== true) f.fail('A stale installer owner does not prove child quiescence. Review remaining owned Git workers, then recover --confirm-quiescent.');
    f.fs.unlinkSync(ownerFile); f.fs.rmdirSync(directory);
  }
  try { f.fs.mkdirSync(directory); } catch (e) { if (e.code === 'EEXIST') f.fail('Installer operation is active or interrupted; recover explicitly.'); throw e; }
  const owner = { schemaVersion: 1, id: f.crypto.randomUUID(), host: os.hostname(), pid: process.pid };
  f.fs.writeFileSync(ownerFile, JSON.stringify(owner), { flag: 'wx', mode: 0o600 });
  try { return action(); } finally {
    if (f.digest(f.read(ownerFile)) !== f.digest(owner)) f.fail('Installer lock ownership changed.');
    f.fs.unlinkSync(ownerFile); f.fs.rmdirSync(directory);
  }
}
function createInstaller(options = {}) {
  const coreDirectory = options.coreDirectory || __dirname;
  const manifest = options.manifest || f.read(f.path.join(coreDirectory, 'release-manifest.json'));
  const identity = manifests.verifyManifest(manifest, coreDirectory), channel = options.channel || process.env.HEPHAERA_INSTALLER_CHANNEL || 'npm';
  if (!['npm', 'nuget'].includes(channel)) f.fail('Unknown installer channel.');
  const verified = () => { manifests.verifyManifest(manifest, coreDirectory); if (manifest.sourceDirty) f.fail('Dirty preview manifest cannot modify a project. Use a clean release package.'); };
  const baselinePath = root => f.safe(root, '.hephaera');
  const fault = phase => { if (options.fault) options.fault(phase); };
  function failure(operation, error, message) {
    operation.error = message;
    if (error.diagnostics) {
      operation.diagnostics = error.diagnostics;
      if (['ETIMEDOUT', 'EINTR'].includes(error.diagnostics.errorCode) || error.diagnostics.signal) operation.requiresQuiescentConfirmation = true;
    }
  }
  function checkSource(baseline, selected) {
    if (!f.fs.existsSync(f.safe(baseline, '.git'))) f.fail('Managed source is not its own Git checkout.');
    if (!f.same(f.path.resolve(git(baseline, ['rev-parse', '--show-toplevel'])), baseline)) f.fail('Managed source Git root differs.');
    if (git(baseline, ['rev-parse', 'HEAD']) !== selected.revision || git(baseline, ['rev-parse', 'HEAD^{tree}']) !== selected.tree) f.fail('Managed source revision/tree changed.');
    if (git(baseline, ['status', '--porcelain', '--untracked-files=all', '--ignore-submodules=all'])) f.fail('Managed source/index contains edits or unknown files.');
    if (git(baseline, ['rev-list', '--branches', '--not', '--remotes'])) f.fail('Managed source retains unpublished local commits; reconcile explicitly.');
    const nested = f.safe(baseline, 'runtime/bubo');
    if (f.fs.existsSync(f.safe(baseline, 'runtime/bubo/.git'))) {
      if (!f.same(f.path.resolve(git(nested, ['rev-parse', '--show-toplevel'])), nested)) f.fail('Nested Bubo Git root changed.');
      if (git(nested, ['status', '--porcelain', '--untracked-files=all'])) f.fail('Nested Bubo source/index contains edits or unknown files.');
      if (git(nested, ['rev-list', 'HEAD', '--branches', '--not', '--remotes'])) f.fail('Nested Bubo contains unpublished local commits.');
    }
    if (f.digest(f.read(f.safe(baseline, 'runtime/bubo.lock.json'))) !== f.digest(selected.bubo)) f.fail('Source Bubo lock differs from release.');
    const link = git(baseline, ['ls-files', '--stage', '--', 'runtime/bubo']).split(/\s+/);
    if (link[0] !== '160000' || link[1] !== selected.bubo.revision || link[2] !== '0') f.fail('Source Bubo gitlink differs from release.');
    if (git(baseline, ['config', '--file', '.gitmodules', '--get', 'submodule.runtime/bubo.url']) !== selected.bubo.repository) f.fail('Source Bubo URL differs from release.');
    const portable = new Map();
    for (const { mode, name: line } of sourceEntries(baseline)) {
      if (!['100644', '100755', '160000'].includes(mode) || (mode === '160000' && line !== 'runtime/bubo')) f.fail('Release contains an unsupported link or Git entry.');
      if (line.split('/').some(part => ['.cache', '.local', '.art-staging', '.git'].includes(part.toLowerCase()))) f.fail('Release source tracks protected local-state paths.');
      const parts = line.split('/');
      for (let i = 1; i <= parts.length; i++) {
        const prefix = parts.slice(0, i).join('/'), prior = portable.get(prefix.toLowerCase());
        if (prior && prior !== prefix) f.fail('Release source contains case-colliding paths.');
        portable.set(prefix.toLowerCase(), prefix);
      }
      if (line.split('/').some(part => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) f.fail('Release source contains a nonportable Windows path.');
      f.safe(baseline, line);
    }
  }
  function clone(root, directory) {
    const transport = options.transport;
    if (transport && (!transport.local || typeof transport.repository !== 'string')) f.fail('Invalid programmatic fixture transport.');
    const repository = transport ? transport.repository : manifest.repository;
    run('git', ['clone', '--no-checkout', '--no-hardlinks', '--template=' + NO_HOOKS, '--', repository, directory], root);
    git(directory, ['checkout', '--detach', manifest.revision]);
    if (git(directory, ['rev-parse', 'refs/tags/' + manifest.tag + '^{}']) !== manifest.revision) f.fail('Release tag moved or differs from exact source revision.');
    if (transport) git(directory, ['remote', 'set-url', 'origin', manifest.repository]);
    checkSource(directory, manifest);
  }
  function lockData(active = true) { return { schemaVersion: 1, version: manifest.version, repository: manifest.repository, revision: manifest.revision, tree: manifest.tree, tag: manifest.tag, manifestSha256: identity.manifestSha256, channel, active, releaseManifest: manifest }; }
  function exactVersionMessage(lock) {
    return channel === 'nuget'
      ? 'Acquire exact package version ' + lock.version + ': dotnet tool install Hephaera --version ' + lock.version + ' --tool-path <EMPTY_TOOL_DIRECTORY> --configfile ./NuGet.Hephaera.config; then run that tool to restore --project <PROJECT>.'
      : 'Acquire exact package version ' + lock.version + ': npm exec --yes --package=@timothymeadows/hephaera@' + lock.version + ' -- hephaera restore --project <PROJECT>.';
  }
  function validateLock(lock) {
    manifests.validateManifest(lock && lock.releaseManifest);
    if (lock.schemaVersion !== 1 || lock.releaseManifest.sourceDirty || !['npm', 'nuget'].includes(lock.channel) || typeof lock.active !== 'boolean' || lock.manifestSha256 !== f.digest(lock.releaseManifest) || ['version', 'repository', 'revision', 'tree', 'tag'].some(name => lock[name] !== lock.releaseManifest[name])) f.fail('Managed lock is malformed or changed.');
    return lock;
  }
  function owned(root, matching = true) {
    const file = f.safe(root, 'hephaera.lock.json');
    if (!f.fs.existsSync(file)) f.fail('Installation is unmanaged; explicit migration is required.');
    const lock = validateLock(f.read(file));
    if (matching && lock.manifestSha256 !== identity.manifestSha256) f.fail(exactVersionMessage(lock));
    const receipt = f.read(f.safe(root, RECEIPT));
    if (receipt.schemaVersion !== 1 || receipt.manifestSha256 !== lock.manifestSha256 || receipt.revision !== lock.revision) f.fail('Installation receipt and lock disagree.');
    checkSource(baselinePath(root), lock.releaseManifest);
    return { lock, receipt };
  }
  function save(root, operation) { f.write(f.safe(root, PENDING), operation); f.write(f.safe(root, PRIVATE + '/operations/' + operation.id + '.json'), operation); }
  function finish(root, operation, bash) {
    const baseline = baselinePath(root);
    operation.phase = 'scaffold-started'; save(root, operation); fault('scaffold-before');
    scaffold(root, baseline, operation.cache, operation.bootstrap, bash); fault('scaffold-after');
    if (operation.withBuboSource) {
      // Same pinned Git/resource admission as the canonical initializer, while
      // our existing writer lease excludes its separately guarded entrypoint.
      const fixtureArguments = options.transport && options.transport.local && options.transport.buboRepository
        ? ['-c', 'protocol.file.allow=always', '-c', 'submodule.runtime/bubo.url=' + options.transport.buboRepository] : [];
      git(baseline, [...fixtureArguments, 'submodule', 'update', '--init', '--recursive', '--checkout', 'runtime/bubo']);
      run(process.execPath, [f.path.join(baseline, 'commands/lib/bubo-runtime.cjs'), 'resource', 'proof-to-model/manifest.schema.json'], root);
    }
    const bootstrap = operation.previousBootstrap || { inserted: operation.bootstrap.inserted, block: BLOCK };
    f.write(f.safe(root, RECEIPT), { schemaVersion: 1, revision: manifest.revision, manifestSha256: identity.manifestSha256, bootstrap, source: 'git', nativeReadiness: 'unverified' });
    f.write(f.safe(root, 'hephaera.lock.json'), lockData());
    operation.phase = 'complete'; operation.completedAt = new Date().toISOString();
    f.write(f.safe(root, PRIVATE + '/operations/' + operation.id + '.json'), operation);
    f.fs.unlinkSync(f.safe(root, PENDING));
    if (operation.temporary) {
      const temporary = f.safe(root, operation.temporary);
      if (!/^\.hephaera-install-[0-9a-f-]{36}$/.test(operation.temporary)) f.fail('Invalid owned staging directory.');
      // Retain completed staging as private, versioned operation evidence;
      // never relocate or recursively remove the existing durable cache.
      const retained = f.safe(root, PRIVATE + '/retained/' + operation.id);
      f.fs.mkdirSync(f.path.dirname(retained), { recursive: true });
      f.fs.renameSync(temporary, retained);
    }
    return { installed: true, scaffold: 'complete', ...identity, channel, project: root, nativeReadiness: 'unverified' };
  }
  function setup(root, settings = {}, restore = false) {
    verified(); root = hostRoot(root);
    if (settings.dryRun) {
      if (f.fs.existsSync(baselinePath(root))) owned(root);
      else if (f.fs.existsSync(f.safe(root, 'hephaera.lock.json')) && !restore) f.fail('Use restore with the exact host-locked package.');
      options.bash || findBash();
      return { operation: 'install', dryRun: true, ...identity, project: root, mandatoryScaffold: true, plannedOwnedWrites: ['.hephaera shared checkout', 'hephaera.lock.json', '.gitignore managed block', 'AGENTS.md managed block', '.hephaera/.cache missing scaffold files and protected default appends', '.hephaera/.cache/installer operation receipts'], stagedTargetAdmission: 'not-run', requiresCandidateStaging: true, withBuboSource: !!settings.withBuboSource };
    }
    return exclusive(root, () => {
      if (f.fs.existsSync(baselinePath(root))) {
        owned(root); return repairOwned(root, settings);
      }
      if (f.fs.existsSync(f.safe(root, 'hephaera.lock.json'))) {
        const locked = validateLock(f.read(f.safe(root, 'hephaera.lock.json')));
        if (!restore || locked.manifestSha256 !== identity.manifestSha256 || f.digest(locked.releaseManifest) !== identity.manifestSha256) f.fail('Use restore with the exact host-locked package.');
      }
      if (f.fs.readdirSync(root).some(name => /^\.hephaera-install-[0-9a-f-]+$/.test(name) && f.read(f.safe(root, name + '/intent.json')).phase !== 'complete')) f.fail('Interrupted installation exists; recover explicitly.');
      const bash = options.bash || findBash(), id = f.crypto.randomUUID(), temporary = '.hephaera-install-' + id;
      f.fs.mkdirSync(f.safe(root, temporary));
      const operation = { schemaVersion: 1, id, kind: 'install', phase: 'prepared', manifestSha256: identity.manifestSha256, temporary, withBuboSource: !!settings.withBuboSource, bootstrap: bootstrapSnapshot(root), cache: cacheSnapshot(root) };
      f.write(f.safe(root, temporary + '/intent.json'), operation);
      try {
        clone(root, f.safe(root, temporary + '/source'));
        if (f.fs.existsSync(baselinePath(root))) f.fail('Installation destination appeared during staging.');
        // Fence supported dispatch before source becomes visible. A first
        // installation must never briefly look like an unmanaged checkout.
        f.write(f.safe(root, 'hephaera.lock.json'), lockData(false));
        f.fs.renameSync(f.safe(root, temporary + '/source'), baselinePath(root));
        save(root, operation); operation.phase = 'source-materialized'; save(root, operation); fault('source-materialized');
        const ignoreFile = f.safe(root, '.gitignore'), before = text(ignoreFile);
        if (!markers(before, IGNORE, 'hephaera-installer:begin', 'hephaera-installer:end')) f.fs.appendFileSync(ignoreFile, (before ? '\n\n' : '') + IGNORE + '\n');
        const lease = maintenance.acquireWrite(root);
        try { return finish(root, operation, bash); } finally { lease.release(); }
      } catch (e) {
        failure(operation, e, 'Operation failed at ' + operation.phase + '; use recover with the exact package.');
        if (f.fs.existsSync(baselinePath(root))) save(root, operation); else f.write(f.safe(root, temporary + '/intent.json'), operation);
        throw e;
      }
    });
  }
  function repairOwned(root, settings = {}) {
    const { receipt } = owned(root);
    if (f.fs.existsSync(f.safe(root, PENDING))) f.fail('Pending operation requires recover.');
    const lease = maintenance.acquireWrite(root);
    const operation = { schemaVersion: 1, id: f.crypto.randomUUID(), kind: 'repair', phase: 'prepared', manifestSha256: identity.manifestSha256, cache: cacheSnapshot(root), bootstrap: bootstrapSnapshot(root), previousBootstrap: receipt.bootstrap, withBuboSource: !!settings.withBuboSource };
    try { save(root, operation); return finish(root, operation, options.bash || findBash()); } catch (e) { failure(operation, e, 'Repair incomplete; use recover.'); save(root, operation); throw e; } finally { lease.release(); }
  }
  function update(root, settings = {}) {
    verified(); root = hostRoot(root); const previous = owned(root, false);
    const plan = { operation: 'update', from: previous.lock.version, to: manifest.version, revision: manifest.revision, manifestSha256: identity.manifestSha256, cachePreserved: true, nativeReadiness: 'unverified' };
    if (settings.dryRun) return { ...plan, dryRun: true, stagedTargetAdmission: 'not-run', requiresCandidateStaging: true };
    return exclusive(root, () => {
      const lease = maintenance.acquireWrite(root); let operation;
      try {
        owned(root, false);
        if (f.fs.existsSync(f.safe(root, PENDING))) f.fail('Pending operation requires recover.');
        const id = f.crypto.randomUUID(), temporary = '.hephaera-install-' + id;
        f.fs.mkdirSync(f.safe(root, temporary));
        operation = { schemaVersion: 1, id, kind: 'update', phase: 'prepared', manifestSha256: identity.manifestSha256, temporary, previousLock: previous.lock, previousBootstrap: previous.receipt.bootstrap, cache: cacheSnapshot(root), bootstrap: bootstrapSnapshot(root) };
        f.write(f.safe(root, temporary + '/intent.json'), operation); save(root, operation);
        clone(root, f.safe(root, temporary + '/candidate'));
        const baseline = baselinePath(root), candidate = f.safe(root, temporary + '/candidate');
        for (const name of sourcePaths(candidate)) {
          const destination = f.safe(baseline, name);
          if (f.fs.existsSync(destination) && !git(baseline, ['ls-files', '--', name])) f.fail('New source collides with an unknown file: ' + name);
        }
        operation.phase = 'candidate-verified';
        save(root, operation);
        git(baseline, ['fetch', '--no-tags', '--', candidate, manifest.revision]);
        git(baseline, ['checkout', '--detach', '--no-overwrite-ignore', manifest.revision]);
        operation.phase = 'source-updated'; save(root, operation); fault('source-updated');
        checkSource(baseline, manifest);
        return finish(root, operation, options.bash || findBash());
      } catch (e) { if (operation) { failure(operation, e, 'Update incomplete; recover with the exact target package.'); save(root, operation); } throw e; } finally { lease.release(); }
    });
  }
  function recover(root, settings = {}) {
    verified(); root = hostRoot(root);
    return exclusive(root, () => {
      const reconciled = maintenance.reconcile(root, { confirmQuiescent: settings.confirmQuiescent });
      let operation;
      if (f.fs.existsSync(f.safe(root, PENDING))) operation = f.read(f.safe(root, PENDING));
      else {
        const candidates = f.fs.readdirSync(root).filter(n => /^\.hephaera-install-[0-9a-f-]+$/.test(n)).map(n => f.read(f.safe(root, n + '/intent.json'))).filter(o => o.phase !== 'complete');
        if (!candidates.length && reconciled.reconciled.length) return { recovered: true, maintenance: reconciled, ...doctor(root) };
        if (candidates.length !== 1) f.fail('Exactly one known interrupted operation is required.');
        operation = candidates[0];
      }
      if (operation.schemaVersion !== 1 || operation.manifestSha256 !== identity.manifestSha256 || !/^[0-9a-f-]{36}$/.test(operation.id || '')) f.fail('Interrupted operation identity differs; use its exact package.');
      if (!['install', 'repair', 'update'].includes(operation.kind) || (operation.temporary && operation.temporary !== '.hephaera-install-' + operation.id)) f.fail('Interrupted operation ownership is invalid.');
      if (operation.requiresQuiescentConfirmation && settings.confirmQuiescent !== true) f.fail('Interrupted process termination does not prove child quiescence. Review remaining owned workers, then recover --confirm-quiescent.');
      if (settings.confirmQuiescent === true) operation.operatorConfirmedQuiescenceAt = new Date().toISOString();
      const lockFile = f.safe(root, 'hephaera.lock.json'), beforeLock = text(lockFile);
      const existingLock = beforeLock ? validateLock(f.read(lockFile)) : null;
      if (!existingLock && f.fs.existsSync(baselinePath(root))) f.fail('Visible managed source has no host lock; reconcile explicitly before recovery.');
      if (existingLock && existingLock.manifestSha256 !== identity.manifestSha256) {
        const previous = operation.previousLock && validateLock(operation.previousLock);
        if (!previous || f.digest({ ...existingLock, active: previous.active }) !== f.digest(previous)) f.fail('Host lock changed outside the interrupted operation; reconcile explicitly.');
      }
      try {
      if (!f.fs.existsSync(baselinePath(root))) {
        if (operation.kind !== 'install' || !operation.temporary) f.fail('Lost source/cache cannot be recreated by non-install recovery.');
        const retry = operation.temporary + '/retry-' + f.crypto.randomUUID(); clone(root, f.safe(root, retry));
        const currentLock = text(lockFile);
        if ((beforeLock === null) !== (currentLock === null) || (beforeLock && !beforeLock.equals(currentLock))) f.fail('Host lock changed while recovery staged source.');
        f.write(lockFile, existingLock ? { ...existingLock, active: false } : lockData(false));
        fault('recovery-before-publication');
        f.fs.renameSync(f.safe(root, retry), baselinePath(root));
        operation.phase = 'source-materialized'; save(root, operation); fault('recovery-source-materialized');
      }
      const lease = maintenance.acquireWrite(root);
      try {
        if (operation.kind === 'update' && git(baselinePath(root), ['rev-parse', 'HEAD']) !== manifest.revision) {
          checkSource(baselinePath(root), operation.previousLock.releaseManifest);
          const candidate = operation.temporary + '/retry-' + f.crypto.randomUUID(); clone(root, f.safe(root, candidate));
          git(baselinePath(root), ['fetch', '--no-tags', '--', f.safe(root, candidate), manifest.revision]);
          git(baselinePath(root), ['checkout', '--detach', '--no-overwrite-ignore', manifest.revision]);
          operation.phase = 'source-updated'; save(root, operation);
        }
        checkSource(baselinePath(root), manifest);
        const agents = text(f.safe(root, 'AGENTS.md'));
        if (agents && agents.toString('base64') === operation.bootstrap.expected) operation.bootstrap = { ...operation.bootstrap, before: operation.bootstrap.expected };
        else if ((agents ? agents.toString('base64') : null) !== operation.bootstrap.before) f.fail('Host AGENTS changed after interruption; reconcile explicitly.');
        const ignoreFile = f.safe(root, '.gitignore'), before = text(ignoreFile);
        if (!markers(before, IGNORE, 'hephaera-installer:begin', 'hephaera-installer:end')) f.fs.appendFileSync(ignoreFile, (before ? '\n\n' : '') + IGNORE + '\n');
        return finish(root, operation, options.bash || findBash());
      } finally { lease.release(); }
      } catch (e) {
        failure(operation, e, 'Recovery incomplete; use the exact package and required quiescence confirmation.');
        if (f.fs.existsSync(baselinePath(root))) save(root, operation);
        else if (operation.temporary) f.write(f.safe(root, operation.temporary + '/intent.json'), operation);
        throw e;
      }
    }, true, settings.confirmQuiescent);
  }
  function doctor(root) {
    root = hostRoot(root); const file = f.safe(root, 'hephaera.lock.json');
    if (!f.fs.existsSync(file)) return { managed: false, installed: f.fs.existsSync(baselinePath(root)), migrationRequired: f.fs.existsSync(baselinePath(root)), ...identity };
    const lock = validateLock(f.read(file)), pending = f.fs.existsSync(f.safe(root, PENDING)); let source = 'unavailable';
    try { owned(root, false); source = 'verified'; } catch { source = 'changed-or-incomplete'; }
    let native = 'source-absent';
    if (f.fs.existsSync(f.safe(root, '.hephaera/runtime/bubo/.git'))) {
      const nested = f.safe(root, '.hephaera/runtime/bubo');
      if (git(nested, ['rev-parse', 'HEAD']) !== lock.releaseManifest.bubo.revision) native = 'source-stale';
      else if (!f.fs.existsSync(f.safe(root, '.hephaera/runtime/bubo/artifacts/bubo/build-info.json'))) native = 'initialized-unbuilt';
      else { try { run(process.execPath, [f.safe(root, '.hephaera/commands/lib/bubo-runtime.cjs'), 'verify'], root); native = 'runtime-verified'; } catch { native = 'build-stale-or-unverified'; } }
    }
    let scaffoldState = 'unverified';
    if (source === 'verified') {
      const agents = text(f.safe(root, 'AGENTS.md')), ignore = text(f.safe(root, '.gitignore'));
      const complete = managedSpan(agents, BLOCK) && managedSpan(ignore, IGNORE) && ['SYSTEM_MEMORY.md', 'MEMORY.md', 'RULES.md', 'REPO_MAP.md', 'DEBUG.md', 'tasks/TODO.md', 'tasks/OPEN_ISSUES.md', 'tasks/example-task/TASK.md'].every(name => f.fs.existsSync(f.safe(root, '.hephaera/.cache/' + name)) && f.fs.statSync(f.safe(root, '.hephaera/.cache/' + name)).isFile());
      scaffoldState = complete ? 'complete' : 'incomplete';
    }
    return { managed: true, active: lock.active, version: lock.version, revision: lock.revision, source, scaffold: pending ? 'incomplete' : !lock.active ? 'inactive' : scaffoldState, recoveryRequired: pending, nativeReadiness: native, generationReadiness: 'unverified' };
  }
  function deactivate(root, settings = {}) {
    verified(); root = hostRoot(root);
    return exclusive(root, () => {
      const { lock, receipt } = owned(root), lease = maintenance.acquireWrite(root);
      try {
        if (f.fs.existsSync(f.safe(root, PENDING))) f.fail('Recover the pending operation before deactivation.');
        if (settings.removeBootstrap) {
          if (!receipt.bootstrap.inserted || receipt.bootstrap.block !== BLOCK) f.fail('Bootstrap was not inserted by this installer.');
          const file = f.safe(root, 'AGENTS.md'), before = text(file);
          if (!markers(before, BLOCK, 'HEPHAERA_BOOTSTRAP_START', 'HEPHAERA_BOOTSTRAP_END')) f.fail('Owned bootstrap is absent.');
          const span = managedSpan(before, BLOCK); let end = span.end;
          if (before[end] === 13 && before[end + 1] === 10) end += 2;
          else if (before[end] === 10) end += 1;
          else f.fail('Owned bootstrap bytes changed.');
          f.fs.writeFileSync(file, Buffer.concat([before.subarray(0, span.start), before.subarray(end)]));
        }
        f.write(f.safe(root, 'hephaera.lock.json'), { ...lock, active: false });
        return { active: false, sourcePreserved: true, cachePreserved: true, ignorePreserved: true };
      } finally { lease.release(); }
    });
  }
  return { verify: () => manifests.verifyManifest(manifest, coreDirectory), install: setup, init: setup, doctor, status: doctor, restore(root) { verified(); root = hostRoot(root); const lock = validateLock(f.read(f.safe(root, 'hephaera.lock.json'))); if (lock.manifestSha256 !== identity.manifestSha256) f.fail(exactVersionMessage(lock)); return setup(root, {}, true); }, repair(root, settings = {}) { verified(); root = hostRoot(root); return exclusive(root, () => repairOwned(root, settings)); }, update, recover, deactivate, uninstall: deactivate };
}
module.exports = { createInstaller, BLOCK, IGNORE, git, run };
