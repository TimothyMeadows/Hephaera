'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const https = require('node:https');
const tls = require('node:tls');
const { setTimeout: delay } = require('node:timers/promises');
const store = require('../commands/lib/session-events.cjs');
const { startServer } = require('../commands/lib/session-visualizer-server.cjs');
const { start } = require('../commands/lib/session-visualizer.cjs');
const REPO = path.resolve(__dirname, '..'), OWNED = path.join(REPO, '.local', 'session-visualizer-tests');
function fixture(t) {
  fs.mkdirSync(OWNED, { recursive: true });
  const root = fs.mkdtempSync(path.join(OWNED, 'fixture-'));
  t.after(() => { const relative = path.relative(OWNED, root); assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative)); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}
function prepare(t) { const root = fixture(t), session = store.createSession(root, { host: 'codex', title: 'Test session' }); return { root, id: session.id }; }
function recorded(root, id, label = 'Test activity', fields = {}) { return store.emit(root, id, { label, ...fields }).event; }
function jsonRequest(service, route, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(service.url);
    const request = https.request({ hostname: url.hostname, port: url.port, path: route, ca: service.certificate, agent: false,
      checkServerIdentity: (_hostname, certificate) => tls.checkServerIdentity('127.0.0.1', certificate), ...options,
      headers: { Authorization: 'Bearer ' + service.token, ...options.headers } }, response => {
      let text = ''; response.on('data', chunk => { text += chunk; }); response.on('end', () => { let body; try { body = JSON.parse(text); } catch { body = text; } resolve({ status: response.statusCode, headers: response.headers, body }); });
    }); request.setTimeout(5000, () => request.destroy(new Error('Owned test deadline'))); request.on('error', reject); request.end();
  });
}
async function server(t, root) { const value = await startServer({ root, openBrowser: false }); t.after(value.close); return value; }
function child(args, env = {}, cwd = REPO) {
  return new Promise(resolve => { const proc = cp.spawn(process.execPath, args, { cwd, windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore','pipe','pipe'] }); let stdout = '', stderr = ''; proc.stdout.on('data', c => { stdout += c; }); proc.stderr.on('data', c => { stderr += c; }); proc.once('error', error => resolve({ error })); proc.once('close', (code, signal) => resolve({ code, signal, stdout, stderr })); });
}
test('event schema confines metadata, rejects secrets, traversal and links', t => {
  const { root, id } = prepare(t);
  for (const fields of [{ label: 'password=private' }, { label: 'Valid', argv: ['private'] }, { label: 'Valid', evidence: ['../outside'] }, { label: 'Valid', evidence: ['C:/outside'] }, { label: 'Valid', phase: 'invented' }]) assert.throws(() => store.emit(root, id, fields));
  assert.throws(() => store.emit(root, id, {}));
  fs.mkdirSync(path.join(root, 'actual')); fs.symlinkSync(path.join(root, 'actual'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => recorded(root, id, 'Valid', { evidence: ['linked/file'] }));
  assert.throws(() => store.rootPath(path.join(root, 'linked')));
  assert.equal(store.page(root, id).total, 0);
  const longUnicodeReference = Array(10).fill('證'.repeat(70)).join('/');
  assert.throws(() => recorded(root, id, 'Oversized UTF-8 metadata', { evidence: Array(8).fill(longUnicodeReference) }));
  assert.equal(store.page(root,id).total,0);
  recorded(root, id, '<img src=x onerror=alert(1)>', { evidence: ['assets/new.glb'] });
  assert.equal(store.page(root, id).events[0].label, '<img src=x onerror=alert(1)>');
});
test('session identity, explicit ending, opt-out and narrow deletion preserve other sessions', t => {
  const { root, id } = prepare(t), second = store.createSession(root);
  assert.equal(store.createSession(root, { sessionId: id }).id, id);
  assert.throws(() => store.remove(root, id)); recorded(root, id);
  store.end(root, id); assert.throws(() => recorded(root, id)); assert.throws(() => store.createSession(root, { sessionId: id }));
  store.remove(root, id); assert.equal(store.history(root).total, 1); assert.equal(store.session(root, second.id).id, second.id);
  store.write(root, store.CACHE + '/config.json', { enabled: false, openBrowser: false });
  assert.equal(store.emit(root, second.id, { label: 'Disabled' }).reason, 'disabled');
});
test('parallel processes publish complete ordered events without cross-session attribution', async t => {
  const { root, id } = prepare(t), other = store.createSession(root);
  const source = `const s=require('./commands/lib/session-events.cjs');for(let i=0;i<4;i++)s.emit(process.argv[1],process.argv[2],{label:'Concurrent producer'});`;
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => child(['-e', source, root, i % 2 ? id : other.id])));
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  for (const sessionId of [id, other.id]) { const p = store.page(root, sessionId); assert.equal(p.total, 24); assert.deepEqual(p.events.map(e => e.sequence), Array.from({ length: 24 }, (_, i) => i + 1)); assert.ok(p.events.every(e => e.sessionId === sessionId)); }
});
test('interrupted budget publication is reconciled without replacing retained bytes', t => {
  const { root, id } = prepare(t); const first = recorded(root, id), relative = store.CACHE + '/sessions/' + id;
  const bytes = fs.readFileSync(store.safe(root, relative + '/events/000001.json'));
  store.write(root, relative + '/budget.json', { count: 0, bytes: 0, capped: false }, true);
  assert.equal(recorded(root, id).sequence, 2);
  assert.deepEqual(fs.readFileSync(store.safe(root, relative + '/events/000001.json')), bytes);
  assert.equal(store.page(root, id).events[0].id, first.id);
  fs.writeFileSync(store.safe(root, relative + '/events/partial.tmp'), '{');
  assert.equal(store.page(root, id).total, 2);
});
test('recording caps and observer errors never change an action result', async t => {
  const { root, id } = prepare(t), relative = store.CACHE + '/sessions/' + id;
  store.write(root, relative + '/budget.json', { count: 0, bytes: store.MAX_BYTES - 1, capped: false }, true);
  assert.equal(store.emit(root, id, { label: 'Capacity test' }).reason, 'capacity');
  assert.equal(store.page(root, id).capped, true);
  const previous = process.env.HEPHAERA_SESSION_ID; process.env.HEPHAERA_SESSION_ID = id;
  t.after(() => { if (previous === undefined) delete process.env.HEPHAERA_SESSION_ID; else process.env.HEPHAERA_SESSION_ID = previous; });
  assert.equal(await store.observe(root, { label: 'Observed result' }, async () => 42), 42);
  const original = new Error('Original command failure');
  await assert.rejects(store.observe(root, { label: 'Observed failure' }, async () => { throw original; }), error => error === original);
  const countCap = prepare(t), countBase = store.CACHE + '/sessions/' + countCap.id;
  store.write(countCap.root, countBase + '/budget.json', { count: store.MAX_EVENTS, bytes: 0, capped: false }, true);
  assert.equal(store.emit(countCap.root, countCap.id, { label: 'Count cap' }).reason, 'capacity');
  assert.equal(store.read(countCap.root, countBase + '/budget.json').capped, true);
});
test('nested observers correlate child spans without global process mutation', async t => {
  const { root, id } = prepare(t), previous = process.env.HEPHAERA_SESSION_ID; process.env.HEPHAERA_SESSION_ID = id;
  try { await store.observe(root, { label: 'Parent' }, () => store.observe(root, { label: 'Child' }, async () => true)); }
  finally { if (previous === undefined) delete process.env.HEPHAERA_SESSION_ID; else process.env.HEPHAERA_SESSION_ID = previous; }
  const events = store.page(root, id).events; assert.equal(events.length, 4); assert.equal(events[1].parentId, events[0].activityId); assert.equal(events[2].status, 'succeeded');
});
test('run preserves argv, help arguments, streams and exit code without retaining payload', async t => {
  const { root, id } = prepare(t);
  const result = await child(['commands/lib/session-visualizer.cjs','run','--root',root,'--session',id,'--label','Command fixture','--',process.execPath,'-e',`process.stdout.write(process.argv.slice(1).join('|'));process.stderr.write('private-tool-output');process.exitCode=7;`,'--','--help','password=private-value']);
  assert.equal(result.code, 7); assert.equal(result.stdout, '--help|password=private-value'); assert.equal(result.stderr, 'private-tool-output');
  const events = store.page(root, id).events; assert.equal(events.length, 2); assert.equal(events[1].exitCode, 7); assert.equal(events[1].status, 'failed');
  assert.ok(!JSON.stringify(events).includes('private-value')); assert.ok(!JSON.stringify(events).includes('private-tool-output'));
  store.write(root, store.CACHE + '/sessions/' + id + '/budget.json', { malformed: true }, true);
  const broken = await child(['commands/lib/session-visualizer.cjs','run','--root',root,'--session',id,'--','node','-e',`process.stdout.write('still ran');process.exitCode=9;`]);
  assert.equal(broken.code, 9); assert.equal(broken.stdout, 'still ran');
});
test('shell observer setup failure and help leave the original command usable', t => {
  const root = fixture(t), fake = path.join(root, 'fake-tools'); fs.mkdirSync(fake);
  fs.writeFileSync(path.join(fake, 'cygpath'), '#!/usr/bin/env bash\nexit 41\n', { mode: 0o755 });
  const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles, 'Git/bin/bash.exe') : 'bash';
  const bashFake = fake.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase());
  // Supply paths as argv so spaces/metacharacters never become shell code.
  const script = 'set -euo pipefail; source "$1"; export PATH="$2:$PATH" HEPHAERA_SESSION_ID="$4"; hephaera_visualizer_entrypoint work "Fixture" "$3" "$5"; printf "original command"; exit 7';
  for (const argument of ['--help', 'work']) {
    const result = cp.spawnSync(bash, ['-c', script, 'observer-fixture', path.join(REPO, 'commands/lib/session-observer.sh'), bashFake, path.join(REPO, 'commands/session-visualizer.sh'), crypto.randomUUID(), argument], { cwd: REPO, windowsHide: true, encoding: 'utf8', env: { ...process.env, HEPHAERA_VISUALIZER_WRAPPED: '' } });
    assert.equal(result.status, 7, result.stderr); assert.equal(result.stdout, 'original command');
    if (argument === '--help') assert.equal(result.stderr, '');
  }
});

test('shell observation preserves command search, path arguments and environment', t => {
  const root = fixture(t), fake = path.join(root, 'fake-tools'); fs.mkdirSync(fake);
  fs.writeFileSync(path.join(fake, 'env'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles, 'Git/bin/bash.exe') : 'bash';
  const toBash = value => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase());
  const entry = path.join(root, 'entry.sh');
  fs.writeFileSync(entry, 'set -euo pipefail\nif [[ "${HEPHAERA_VISUALIZER_WRAPPED:-}" != 1 ]]; then export PATH="$1:$PATH"; shift; fi\nsource "$HEPHAERA_TEST_OBSERVER"\nhephaera_visualizer_entrypoint work "Search path fixture" "${BASH_SOURCE[0]}" "$@"\ncommand -v env\nprintf "%s\\n%s\\n%s" "$1" "$HEPHAERA_TEST_PATH_VALUE" "${MSYS2_ARG_CONV_EXCL-unset}"\nexit 7\n');
  const result = cp.spawnSync(bash, [entry, toBash(fake), '/tmp/literal argument/file.md'], { cwd: REPO, windowsHide: true, encoding: 'utf8', env: { ...process.env, HEPHAERA_SESSION_ID: crypto.randomUUID(), HEPHAERA_VISUALIZER_WRAPPED: '', HEPHAERA_TEST_OBSERVER: toBash(path.join(REPO, 'commands/lib/session-observer.sh')), HEPHAERA_TEST_PATH_VALUE:'/tmp/original-environment', MSYS2_ARG_CONV_EXCL:'sentinel' } });
  assert.equal(result.status, 7, result.stderr); assert.equal(result.stdout.replaceAll('\\', '/'), toBash(fake) + '/env\n/tmp/literal argument/file.md\n/tmp/original-environment\nsentinel');
});

test('public Bash run preserves path arguments and environment for a Bash target', t => {
  const { root, id } = prepare(t), bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles,'Git/bin/bash.exe') : 'bash';
  const result = cp.spawnSync(bash, [path.join(REPO,'commands/session-visualizer.sh'),'run','--session',id,'--','bash','-c','printf "%s\\n%s" "$1" "$HEPHAERA_TEST_PATH_VALUE"; exit 8','fixture','/tmp/literal argument/file.md'], { cwd:REPO, windowsHide:true, encoding:'utf8', env:{...process.env, HEPHAERA_PROJECT_ROOT:root, HEPHAERA_TEST_PATH_VALUE:'/tmp/original-environment'} });
  assert.equal(result.status,8,result.stderr); assert.equal(result.stdout,'/tmp/literal argument/file.md\n/tmp/original-environment');
  assert.equal(store.page(root,id).events.at(-1).exitCode,8);
});

test('missing or broken optional telemetry does not break shared commands or public run', t => {
  const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles,'Git/bin/bash.exe') : 'bash';
  for (const failure of ['missing-observer','missing-module','broken-module']) {
    const root = fixture(t), commands = path.join(root,'.hephaera/commands'), lib = path.join(commands,'lib'); fs.mkdirSync(lib,{recursive:true});
    for (const name of ['create-goal-file.sh','session-visualizer.sh']) fs.copyFileSync(path.join(REPO,'commands',name),path.join(commands,name));
    for (const name of ['memory-common.sh','state-transition-common.sh','brainstorm-common.sh','workflow-path-common.sh']) fs.copyFileSync(path.join(REPO,'commands/lib',name),path.join(lib,name));
    if (failure !== 'missing-observer') fs.copyFileSync(path.join(REPO,'commands/lib/session-observer.sh'),path.join(lib,'session-observer.sh'));
    if (failure === 'broken-module') fs.writeFileSync(path.join(lib,'session-visualizer.cjs'),'throw new Error("Synthetic recorder loading failure");');
    const env = {...process.env, HEPHAERA_SESSION_ID:crypto.randomUUID(), HEPHAERA_VISUALIZER_WRAPPED:'', HEPHAERA_PROJECT_ROOT:root};
    const tracked = cp.spawnSync(bash,[path.join(commands,'create-goal-file.sh'),'fixture-goal','Fixture Goal','--dry-run'],{cwd:REPO,env,windowsHide:true,encoding:'utf8'});
    const failureTrace = tracked.status !== 0 ? cp.spawnSync(bash,['-x',path.join(commands,'create-goal-file.sh'),'fixture-goal','Fixture Goal','--dry-run'],{cwd:REPO,env,windowsHide:true,encoding:'utf8'}).stderr.slice(-12000) : '';
    assert.equal(tracked.status,0,tracked.stderr || failureTrace); assert.ok(tracked.stdout.includes('# Fixture Goal'));
    const executed = cp.spawnSync(bash,[path.join(commands,'session-visualizer.sh'),'run','--session',env.HEPHAERA_SESSION_ID,'--','bash','-c','printf "original operation"; exit 8'],{cwd:REPO,env,windowsHide:true,encoding:'utf8'});
    assert.equal(executed.status,8,executed.stderr); assert.equal(executed.stdout,'original operation');
    assert.equal(fs.existsSync(path.join(root,'.hephaera/.cache/goals')),false);
  }
});

test('run preserves the original working directory inside a host project', async t => {
  const { root, id } = prepare(t), cwd = path.join(root, 'subdirectory'); fs.mkdirSync(cwd);
  const result = await child([path.join(REPO,'commands/lib/session-visualizer.cjs'),'run','--root',root,'--session',id,'--',process.execPath,'-e','process.stdout.write(process.cwd())'], {}, cwd);
  assert.equal(result.code, 0); assert.equal(result.stdout, cwd);
});
test('command observation does not depend on the viewer server or static UI being available', async t => {
  const { root, id } = prepare(t), lib = path.join(root,'.hephaera/commands/lib'); fs.mkdirSync(lib,{recursive:true});
  for (const name of ['session-visualizer.cjs','session-events.cjs','state-transition.cjs']) fs.copyFileSync(path.join(REPO,'commands/lib',name),path.join(lib,name));
  const result = await child([path.join(lib,'session-visualizer.cjs'),'run','--root',root,'--session',id,'--',process.execPath,'-e',`process.stdout.write('independent command');process.exitCode=3;`]);
  assert.equal(result.code,3); assert.equal(result.stdout,'independent command'); assert.equal(store.page(root,id).events.at(-1).exitCode,3);
});
test('switching explicit sessions does not inherit a parent from another session', async t => {
  const { root, id } = prepare(t), other = store.createSession(root);
  const result = await child(['commands/lib/session-visualizer.cjs','run','--root',root,'--session',id,'--',process.execPath,'-e','process.exitCode=0'],
    { HEPHAERA_SESSION_ID: other.id, HEPHAERA_ACTIVITY_ID: crypto.randomUUID() });
  assert.equal(result.code,0); assert.equal(store.page(root,id).events[0].parentId,null); assert.equal(store.page(root,other.id).total,0);
});
test('POSIX child termination is forwarded as cancellation without fabricated success', { skip: process.platform === 'win32' ? 'Native Windows console signals require host/device evidence.' : false }, async t => {
  const { root, id } = prepare(t);
  const result = await child(['commands/lib/session-visualizer.cjs','run','--root',root,'--session',id,'--',process.execPath,'-e','process.kill(process.pid,"SIGTERM")']);
  assert.equal(result.signal,'SIGTERM'); assert.equal(store.page(root,id).events.at(-1).status,'cancelled');
});
test('native observation preserves ownership callbacks and actual child results', async t => {
  const { root, id } = prepare(t), script = path.join(root, 'child.cjs');
  fs.writeFileSync(script, `const fs=require('node:fs'),crypto=require('node:crypto');const args=process.argv.slice(2),file=args[args.indexOf('--host-context')+1];console.log(JSON.stringify({schemaVersion:'bubo-execution-result/v1',apiVersion:2,status:'succeeded',hostContextSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),data:{ok:true}}));`);
  const previous = process.env.HEPHAERA_SESSION_ID; process.env.HEPHAERA_SESSION_ID = id;
  try {
    const calls = [], hooks = Object.fromEntries(['beforeLaunch','spawned','closed'].map(k => [k, () => calls.push(k)]));
    const value = await require('../commands/lib/bubo-host-adapter.cjs').execute(script, 'ok', new Map(), { root, stateRoot: '.hephaera/.cache/tasks/native-fixture', context: { budgets: { timeoutSeconds: 5, maxLogBytes: 1048576 } } }, { executable: process.execPath }, false, hooks);
    assert.equal(value.data.ok, true); assert.deepEqual(calls, ['beforeLaunch','spawned','closed']);
    const observations = store.page(root, id).events;
    assert.equal(observations.at(-1).status, 'succeeded');
    assert.equal(observations.some(event => event.label.includes(script)), false, 'Native command arguments must not become telemetry labels.');
  } finally { if (previous === undefined) delete process.env.HEPHAERA_SESSION_ID; else process.env.HEPHAERA_SESSION_ID = previous; }
});
test('real clone and submodule mounts start the shipped UI without source builds or setup hooks', async t => {
  const base = fixture(t), source = path.join(base, 'source'); fs.mkdirSync(source);
  const hooks = path.join(base, 'empty-hooks'); fs.mkdirSync(hooks);
  for (const relative of ['visualizer','commands/lib/session-events.cjs','commands/lib/session-visualizer.cjs','commands/lib/session-visualizer-server.cjs','commands/lib/session-observer.sh','commands/lib/private-visualizer-cache.ps1','commands/lib/local-preview-tls.cjs','commands/lib/state-transition.cjs','commands/lib/installation-maintenance.cjs','commands/lib/memory-common.sh','commands/lib/state-transition-common.sh','commands/session-visualizer.sh','commands/resolve-hephaera-paths.sh','logo.png','.gitignore']) {
    const destination = path.join(source, relative); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.cpSync(path.join(REPO, relative), destination, { recursive: true });
  }
  const git = (cwd, ...args) => cp.execFileSync('git', ['-c','core.hooksPath=' + hooks,'-c','core.fsmonitor=false','-c','commit.gpgsign=false','-c','tag.gpgsign=false',...args], { cwd, windowsHide: true, stdio: ['ignore','pipe','pipe'] }).toString();
  git(source, 'init','-q'); git(source,'add','.'); git(source,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Synthetic visualizer installation fixture');
  for (const kind of ['clone','submodule']) {
    const host = path.join(base, kind); fs.mkdirSync(host); git(host,'init','-q');
    if (kind === 'clone') git(host,'clone','--quiet','--no-hardlinks',source,'.hephaera');
    else git(host,'-c','protocol.file.allow=always','submodule','add','--quiet',source,'.hephaera');
    const cli = path.join(host,'.hephaera/commands/lib/session-visualizer.cjs');
    const launched = await child([cli,'start','--root',host,'--no-open','--host','cursor'], {}, path.join(host,'.hephaera'));
    assert.equal(launched.code,0,launched.stderr); const response = JSON.parse(launched.stdout);
    assert.equal(response.status,'running');
    try {
      assert.equal(fs.existsSync(path.join(host,'.hephaera/.cache/visualizer/sessions',response.sessionId,'session.json')),true);
      assert.equal(fs.existsSync(path.join(host,'.hephaera/.hephaera')),false);
      assert.equal(git(path.join(host,'.hephaera'),'status','--porcelain').trim(),'');
      const conflict = await child([cli,'start','--root',base,'--no-open']);
      assert.notEqual(conflict.code,0); assert.equal(fs.existsSync(path.join(base,'.hephaera/.cache/visualizer')),false);
    } finally { await child([cli,'stop','--root',host]); }
  }
});
test('TLS service rejects unauthorized peers, wrong origins, writes and arbitrary files', async t => {
  const { root, id } = prepare(t); recorded(root, id); const running = await server(t, root);
  assert.equal((await jsonRequest(running, '/api/sessions')).status, 200);
  assert.equal((await jsonRequest(running, '/api/sessions', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await jsonRequest(running, '/api/sessions', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await jsonRequest(running, '/api/sessions', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await jsonRequest(running, '/api/sessions', { method: 'POST' })).status, 405);
  assert.equal((await jsonRequest(running, '/.hephaera/.cache/SYSTEM_MEMORY.md')).status, 404);
  assert.equal((await jsonRequest(running, '/%2e%2e/private')).status, 400);
  const staticPage = await jsonRequest(running, '/'); assert.equal(staticPage.status, 200); assert.ok(staticPage.headers['content-security-policy'].includes("connect-src 'self'"));
  await assert.rejects(new Promise((resolve, reject) => { https.get(running.url, response => { response.resume(); resolve(); }).on('error', reject); }), /certificate/i);
  await assert.rejects(new Promise((resolve, reject) => { https.get(running.url, { ca: running.certificate, maxVersion: 'TLSv1.2' }, resolve).on('error', reject); }), /protocol|SSL|TLS/i);
});
test('concurrent project servers and simultaneous sessions keep capabilities and history separate', async t => {
  const left = prepare(t), right = prepare(t), alternate = store.createSession(left.root);
  recorded(left.root, left.id, 'Left session'); recorded(left.root, alternate.id, 'Alternate session'); recorded(right.root, right.id, 'Right project');
  const [one, two] = await Promise.all([server(t, left.root), server(t, right.root)]);
  assert.notEqual(one.url, two.url); assert.notEqual(one.token, two.token);
  assert.equal((await jsonRequest(one, '/api/sessions')).body.total, 2);
  assert.equal((await jsonRequest(two, '/api/sessions')).body.total, 1);
  assert.equal((await jsonRequest(one, '/api/sessions/' + alternate.id + '/snapshot')).body.events[0].label, 'Alternate session');
  assert.equal((await jsonRequest(one, '/api/sessions/' + left.id + '/snapshot')).body.events[0].label, 'Left session');
  assert.equal((await jsonRequest(one, '/api/sessions/' + right.id + '/snapshot')).status, 400);
  assert.equal((await jsonRequest(one, '/api/sessions', { headers: { Authorization: 'Bearer ' + two.token } })).status, 401);
});

test('viewer credentials use private filesystem permissions and reject linked private storage', async t => {
  const { root } = prepare(t), running = await server(t, root), privateDirectory = store.safe(root, store.CACHE + '/private', 'dir'), runtimeFile = store.safe(root, require('../commands/lib/session-visualizer-server.cjs').RUNTIME, 'file');
  if (process.platform === 'win32') {
    const script = '$ErrorActionPreference="Stop"; $allowed=@([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value,"S-1-5-18","S-1-5-32-544"); $valid=[System.IO.Directory]::GetAccessControl($env:HEPHAERA_TEST_PRIVATE_DIRECTORY).AreAccessRulesProtected; foreach($rule in [System.IO.File]::GetAccessControl($env:HEPHAERA_TEST_PRIVATE_FILE).GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -eq "Allow" -and $rule.IdentityReference.Value -notin $allowed){$valid=$false}}; [Console]::Write($valid.ToString())';
    const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const observed = cp.execFileSync(powershell, ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], { windowsHide:true, encoding:'utf8', env:{...process.env, HEPHAERA_TEST_PRIVATE_DIRECTORY:privateDirectory, HEPHAERA_TEST_PRIVATE_FILE:runtimeFile} });
    assert.equal(observed, 'True');
    const modules = path.join(root,'incompatible-modules'), securityModule = path.join(modules,'Microsoft.PowerShell.Security'); fs.mkdirSync(securityModule,{recursive:true});
    fs.writeFileSync(path.join(securityModule,'Microsoft.PowerShell.Security.psd1'), "@{ModuleVersion='99.0';RootModule='incompatible.psm1'}");
    fs.writeFileSync(path.join(securityModule,'incompatible.psm1'), "throw 'Synthetic incompatible PowerShell module; must not be loaded.'");
    const inherited = await child(['-e',"require('./commands/lib/session-events.cjs').privateCache(process.argv[1]);",root],{PSModulePath:modules});
    assert.equal(inherited.code,0,inherited.stderr);
  } else {
    assert.equal(fs.statSync(privateDirectory).mode & 0o077, 0); assert.equal(fs.statSync(runtimeFile).mode & 0o077, 0);
  }
  assert.ok(await require('../commands/lib/session-visualizer-server.cjs').probe(running));
  const linked = fixture(t); store.directory(linked, store.CACHE); const destination = path.join(linked,'other'); fs.mkdirSync(destination);
  fs.symlinkSync(destination, path.join(linked,store.CACHE,'private'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => store.privateCache(linked)); assert.equal(fs.readdirSync(destination).length,0);
});

test('SSE reconnect resumes after the applied ID and receives new events within one second', async t => {
  const { root, id } = prepare(t); recorded(root, id, 'First'); recorded(root, id, 'Second'); const running = await server(t, root);
  const received = [], started = performance.now();
  await new Promise((resolve, reject) => {
    const request = https.get(running.url + '/api/sessions/' + id + '/events?after=1', { ca: running.certificate, agent: false, headers: { Authorization: 'Bearer ' + running.token } }, response => {
      let buffer = ''; response.on('data', chunk => {
        buffer += chunk; let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) { const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); if (!block.includes('event: activity')) continue; const value = JSON.parse(block.split('\n').find(l => l.startsWith('data: ')).slice(6)); received.push(value.sequence); if (value.sequence === 3) { request.destroy(); resolve(); } }
      });
    }); request.setTimeout(3000, () => request.destroy(new Error('SSE test deadline'))); request.on('error', reject);
    setTimeout(() => recorded(root, id, 'Third'), 100);
  });
  assert.deepEqual(received, [2,3]); assert.ok(performance.now() - started < 1000);
});
test('10,000-event history is paged and a fresh update does not replay old files', async t => {
  const { root, id } = prepare(t), template = recorded(root, id), base = store.CACHE + '/sessions/' + id;
  let bytes = fs.statSync(store.safe(root, base + '/events/000001.json')).size;
  for (let sequence = 2; sequence <= 10000; sequence++) { const value = { ...template, id: crypto.randomUUID(), activityId: crypto.randomUUID(), sequence, producerSequence: sequence, label: 'Performance fixture' }; const encoded = JSON.stringify(value) + '\n'; fs.writeFileSync(store.safe(root, base + '/events/' + String(sequence).padStart(6, '0') + '.json'), encoded); bytes += Buffer.byteLength(encoded); }
  store.write(root, base + '/budget.json', { count: 10000, bytes, capped: false }, true);
  assert.equal(store.page(root, id).events.length, 200);
  const running = await server(t, root), startAt = performance.now(); recorded(root, id, 'Fresh activity');
  const result = await jsonRequest(running, '/api/sessions/' + id + '/snapshot?after=10000');
  assert.equal(result.body.events.length, 1); assert.equal(result.body.events[0].sequence, 10001); assert.ok(performance.now() - startAt < 1000);
  // Consume enough real SSE to exceed the response high-water mark. Accepted
  // frames must drain, not be destroyed before a large history can catch up.
  const sequences = [];
  await new Promise((resolve, reject) => {
    const request = https.get(running.url + '/api/sessions/' + id + '/events', { ca: running.certificate, agent: false, headers: { Authorization: 'Bearer ' + running.token } }, response => {
      let buffer = '';
      response.on('data', chunk => { buffer += chunk; let index;
        while ((index = buffer.indexOf('\n\n')) >= 0) { const block = buffer.slice(0,index); buffer = buffer.slice(index+2);
          if (!block.includes('event: activity')) continue;
          const event = JSON.parse(block.split('\n').find(l => l.startsWith('data: ')).slice(6)); sequences.push(event.sequence);
          if (event.sequence === 10001) { request.destroy(); resolve(); }
        }
      });
    });
    const deadline = setTimeout(() => request.destroy(new Error('Bulk SSE deadline')), 20000);
    request.on('close', () => clearTimeout(deadline)); request.on('error', reject);
  });
  assert.equal(sequences.length,10001); assert.deepEqual(sequences,Array.from({length:10001},(_,i)=>i+1));
});
test('live reduction and replay agree, ignore duplicate IDs and reject recording gaps', async t => {
  const { root, id } = prepare(t), reducer = await import('../visualizer/state.mjs');
  const first = recorded(root, id, 'Build', { action: 'started' }); recorded(root, id, 'Build', { activityId: first.activityId, action: 'finished', status: 'succeeded' });
  recorded(root, id, 'Verify', { phase: 'verification', parentId: first.activityId, status: 'waiting' });
  const events = store.page(root, id).events, live = reducer.emptyState(); for (const event of events) reducer.applyEvent(live, event);
  assert.deepEqual(live, reducer.replay(events)); reducer.applyEvent(live, events[0]); assert.equal(live.cursor, 3);
  assert.throws(() => reducer.applyEvent(reducer.emptyState(), events[2])); assert.equal(reducer.replay(events, 1).activities.get(first.activityId).status, 'running');
});
test('mode structures follow explicit parent reports without activating project workflows', async t => {
  const { root, id } = prepare(t), reducer = await import('../visualizer/state.mjs');
  const branch = recorded(root, id, 'Reported branch', { category: 'branch', mode: 'brainstorm' });
  const idea = recorded(root, id, 'Reported idea', { category: 'idea', parentId: branch.activityId });
  const goal = recorded(root, id, 'Reported goal', { category: 'goal', mode: 'goal' });
  recorded(root, id, 'Reported task', { category: 'task', parentId: goal.activityId });
  const gauntlet = recorded(root, id, 'Reported gauntlet', { category: 'gauntlet', mode: 'gauntlet' });
  const unit = recorded(root, id, 'Reported unit', { category: 'work-unit', parentId: gauntlet.activityId });
  recorded(root, id, 'Reported critic round', { category: 'round', parentId: unit.activityId, status: 'blocked' });
  recorded(root, id, 'Unassigned activity');
  const events = store.page(root, id).events, state = reducer.replay(events), groups = reducer.modeGroups(state);
  assert.deepEqual(groups.map(group => [group.mode, group.total]), [['brainstorm',2], ['goal',2], ['gauntlet',3]]);
  assert.equal(groups[0].activities[1].parentId, branch.activityId); assert.equal(groups[0].activities[1].activityId, idea.activityId);
  assert.equal(reducer.modeGroups(state, 1)[0].activities.length, 1);
  assert.equal(reducer.modeGroups(reducer.replay(events, 1))[0].total, 1);
  assert.equal(fs.existsSync(path.join(root, 'BRAINSTORM.md')), false);
  assert.equal(fs.existsSync(path.join(root, '.hephaera/.cache/goals')), false);
  assert.equal(fs.existsSync(path.join(root, '.hephaera/.cache/gauntlets')), false);
  const cyclic = crypto.randomUUID(); recorded(root, id, 'Malformed reported relationship', { activityId: cyclic, parentId: cyclic });
  assert.deepEqual(reducer.modeGroups(reducer.replay(store.page(root,id).events)).map(group => group.total), [2,2,3]);
});

test('startup is idempotent, honors persistent disable and survives occupied ports', async t => {
  const root = fixture(t); store.directory(root, store.CACHE); store.write(root, store.CACHE + '/config.json', { enabled: false });
  assert.equal((await start(root, {})).status, 'disabled'); assert.equal(fs.existsSync(store.safe(root, store.CACHE + '/sessions')), false);
  const { root: other, id } = prepare(t), running = await server(t, other);
  const reused = await start(other, { session: id, noOpen: true }); assert.equal(reused.url, running.url); assert.equal(reused.sessionId, id);
  const occupiedRoot = fixture(t); await assert.rejects(startServer({ root: occupiedRoot, port: Number(new URL(running.url).port), openBrowser: false }), /EADDRINUSE/);
});
test('server restart preserves replay and session ownership while rotating access capabilities', async t => {
  const { root, id } = prepare(t), first = recorded(root, id, 'Before restart');
  const before = store.page(root, id).events, original = await server(t, root);
  await original.close();
  assert.equal(store.page(root, id).ended, null);
  const restarted = await server(t, root);
  assert.notEqual(restarted.instanceId, original.instanceId); assert.notEqual(restarted.token, original.token);
  assert.equal((await jsonRequest(restarted, '/api/sessions', { headers: { Authorization: 'Bearer ' + original.token } })).status, 401);
  assert.deepEqual((await jsonRequest(restarted, '/api/sessions/' + id + '/snapshot')).body.events, before);
  recorded(root, id, 'After restart', { parentId: first.activityId, phase: 'verification', status: 'succeeded' });
  const continued = await jsonRequest(restarted, '/api/sessions/' + id + '/snapshot?after=1');
  assert.equal(continued.body.events.length, 1); assert.equal(continued.body.events[0].parentId, first.activityId);
  assert.equal(continued.body.ended, null);
});

test('missing explicit TLS prerequisite reports its specific limitation without fallback or installation', async t => {
  const root = fixture(t);
  const result = await child(['commands/lib/session-visualizer.cjs','start','--root',root,'--no-open'], { HEPHAERA_OPENSSL: path.join(root, 'unavailable-openssl') });
  assert.equal(result.code,0); const status = JSON.parse(result.stdout);
  assert.equal(status.status,'viewer-unavailable'); assert.equal(status.reason,'tls-prerequisite-unavailable');
  assert.equal(fs.existsSync(path.join(root,store.CACHE,'server-lock')),false);
  assert.equal(store.history(root).total,1); // Retain the attempted session; do not reset history.
});
