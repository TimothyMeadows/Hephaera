'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
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
test('task names and purpose are captured at observation time without rewriting replay', async t => {
  const {root,id}=prepare(t),dir=store.directory(root,'.hephaera/.cache/tasks/movement-controls'),file=path.join(dir,'TASK.md');
  const original='# Improve movement controls\n\n## Goal\n\nMake keyboard movement responsive and predictable.\n\n## Private notes\n\nDo not copy this unrelated section.\n';
  fs.writeFileSync(file,original);const first=recorded(root,id,'Task checkpoint',{task:'movement-controls',operation:'Save task checkpoint'});
  assert.equal(first.schemaVersion,2);assert.equal(first.taskContext.title,'Improve movement controls');
  assert.equal(first.taskContext.summary,'Make keyboard movement responsive and predictable.');
  assert.equal(first.taskContext.reference,'.hephaera/.cache/tasks/movement-controls/TASK.md');
  assert.equal(first.taskContext.sha256,crypto.createHash('sha256').update(original).digest('hex'));
  fs.writeFileSync(file,'# Refine controller support\n\n## Goal\n\nSupport the selected controller layout.\n');
  const second=recorded(root,id,'Task completed',{task:'movement-controls',activityId:first.activityId,status:'succeeded',action:'finished'});
  assert.equal(second.taskContext.title,'Refine controller support');assert.notEqual(second.taskContext.sha256,first.taskContext.sha256);
  fs.unlinkSync(file);const events=store.page(root,id).events,reducer=await import('../visualizer/state.mjs');
  assert.equal(reducer.replay(events,1).activities.get(first.activityId).taskContext.title,'Improve movement controls');
  assert.equal(reducer.replay(events).activities.get(first.activityId).taskContext.title,'Refine controller support');
  assert.equal(JSON.stringify(events).includes('unrelated section'),false);
});
test('task context is optional, confined and bounded without ambient task inference', t => {
  const {root,id}=prepare(t),dir=store.directory(root,'.hephaera/.cache/tasks/bounded-task'),file=path.join(dir,'TASK.md');
  fs.writeFileSync(file,'# '+ 'Readable title '.repeat(30)+'\n\n## Goal\n\n'+ 'A bounded purpose. '.repeat(50));
  const bounded=recorded(root,id,'Work',{task:'bounded-task'});assert.equal(bounded.taskContext.title.length,160);assert.equal(bounded.taskContext.summary.length,320);
  assert.equal(recorded(root,id,'No explicit task').taskContext,undefined);
  for(const task of ['missing-task','../bounded-task','/outside','C:/outside'])assert.equal(recorded(root,id,'No context',{task}).taskContext,undefined);
  fs.writeFileSync(file,'# A safe title\n\n## Goal\n\napi_key=do-not-record\n');
  const redacted=recorded(root,id,'Work',{task:'bounded-task'});assert.equal(redacted.taskContext.title,'A safe title');assert.equal(redacted.taskContext.summary,undefined);
  for(const text of ['# password=do-not-record\n','# Bearer do-not-record\n','# ghp_'+ 'A'.repeat(30)+'\n','# https://user:private@example.test\n', '# '+ 'a'.repeat(140000),Buffer.from([0xff,0xfe,0xfd])]){
    fs.writeFileSync(file,text);assert.equal(recorded(root,id,'Unusable context',{task:'bounded-task'}).taskContext,undefined);
  }
  fs.writeFileSync(file,'# Safe title\n\n## Goal\n\nA safe purpose.\n');
  const linked=path.join(root,'.hephaera/.cache/tasks/linked-task');fs.symlinkSync(dir,linked,process.platform==='win32'?'junction':'dir');
  assert.equal(recorded(root,id,'Linked context',{task:'linked-task'}).taskContext,undefined);
  fs.linkSync(file,path.join(dir,'foreign-link.md'));assert.equal(recorded(root,id,'Hard-linked context',{task:'bounded-task'}).taskContext,undefined);
  assert.equal(JSON.stringify(store.page(root,id).events).includes('do-not-record'),false);
});
test('explicit run task context preserves command output and failure status', async t => {
  const {root,id}=prepare(t),dir=store.directory(root,'.hephaera/.cache/tasks/explicit-task');fs.writeFileSync(path.join(dir,'TASK.md'),'# Fix controller input\n\n## Goal\n\nKeep input stable during reconnects.\n');
  const result=await child(['commands/lib/session-visualizer.cjs','run','--root',root,'--session',id,'--task','explicit-task','--operation','Verify controller reconnection','--label','Focused verification','--',process.execPath,'-e','process.stdout.write("expected stdout");process.stderr.write("expected stderr");process.exitCode=7;']);
  assert.equal(result.code,7);assert.equal(result.stdout,'expected stdout');assert.equal(result.stderr,'expected stderr');
  const events=store.page(root,id).events;assert.equal(events.length,2);assert.equal(events[0].taskContext.title,'Fix controller input');assert.equal(events[1].taskContext.summary,'Keep input stable during reconnects.');assert.equal(events[1].operation,'Verify controller reconnection');assert.equal(events[1].status,'failed');assert.equal(events[1].exitCode,7);
  assert.equal(JSON.stringify(events).includes('expected stdout'),false);
});
test('shared task wrapper captures its documented task identifier and preserves argv', t => {
  const {root,id}=prepare(t),dir=store.directory(root,'.hephaera/.cache/tasks/wrapped-task');fs.writeFileSync(path.join(dir,'TASK.md'),'# Improve quest tracking\n\n## Goal\n\nShow the active quest clearly.\n');
  const entry=path.join(root,'record-task-checkpoint.sh'),observer=path.join(REPO,'commands/lib/session-observer.sh').replaceAll('\\','/');
  fs.writeFileSync(entry,'#!/usr/bin/env bash\nsource "$HEPHAERA_TEST_OBSERVER"\nhephaera_visualizer_entrypoint review "Task checkpoint" "${BASH_SOURCE[0]}" "$@"\nprintf "%s\\n%s" "$1" "$2"\nexit 7\n');
  const bash=process.platform==='win32'?path.join(process.env.ProgramFiles,'Git/bin/bash.exe'):'bash';
  const result=cp.spawnSync(bash,[entry,'wrapped-task','literal argument'],{cwd:REPO,windowsHide:true,encoding:'utf8',env:{...process.env,HEPHAERA_PROJECT_ROOT:root,HEPHAERA_SESSION_ID:id,HEPHAERA_VISUALIZER_WRAPPED:'',HEPHAERA_TEST_OBSERVER:observer}});
  assert.equal(result.status,7,result.stderr);assert.equal(result.stdout,'wrapped-task\nliteral argument');
  const events=store.page(root,id).events;assert.equal(events.length,2);assert.equal(events[0].taskContext.title,'Improve quest tracking');assert.equal(events[1].operation,'Task checkpoint');assert.equal(events[1].exitCode,7);assert.equal(JSON.stringify(events).includes('literal argument'),false);
});
test('task snapshots reject malformed metadata and ignore fenced instructions', t => {
  const {root,id}=prepare(t),dir=store.directory(root,'.hephaera/.cache/tasks/parsed-task');
  fs.writeFileSync(path.join(dir,'TASK.md'),'```md\n# Hidden code heading\n```\n# Visible task\n\n## Goal\n\nA real purpose.\n\n~~~\n# Hidden ending\n');
  const event=recorded(root,id,'Task operation',{task:'parsed-task'});assert.equal(event.taskContext.title,'Visible task');assert.equal(event.taskContext.summary,'A real purpose.');
  for(const change of [{taskId:'other-task'},{reference:'../private'},{sha256:'not-a-hash'},{title:'secret=do-not-record'},{summary:'x'.repeat(321)},{rawTask:'private body'}]){
    assert.throws(()=>recorded(root,id,'Invalid context',{task:'parsed-task',taskContext:{...event.taskContext,...change}}));
  }
  assert.equal(store.page(root,id).total,1);
  fs.writeFileSync(path.join(dir,'TASK.md'),'\uFEFF# Add `MODEL_TO_ACTION` support\n\n## Goal\n\nKeep **rigid parts** intact.\n');
  const formatted=recorded(root,id,'Formatted task',{task:'parsed-task'});assert.equal(formatted.taskContext.title,'Add MODEL_TO_ACTION support');assert.equal(formatted.taskContext.summary,'Keep rigid parts intact.');
  fs.writeFileSync(path.join(dir,'TASK.md'),'```md\n```js\n# Hidden code heading\n```\n# Keep C#\n\n## Goal ###\n\nPreserve technical names.\n');
  const technical=recorded(root,id,'Technical title',{task:'parsed-task'});assert.equal(technical.taskContext.title,'Keep C#');assert.equal(technical.taskContext.summary,'Preserve technical names.');
  fs.writeFileSync(path.join(dir,'TASK.md'),'<!--\n# Hidden comment title\n\n## Goal\n\nPrivate comment prose.\n');assert.equal(recorded(root,id,'Unclosed comment',{task:'parsed-task'}).taskContext,undefined);
});
test('nested observations inherit explicit task context only within the same session', async t => {
  const {root,id}=prepare(t),other=store.createSession(root),dir=store.directory(root,'.hephaera/.cache/tasks/inherited-task');fs.writeFileSync(path.join(dir,'TASK.md'),'# Keep nested work identifiable\n\n## Goal\n\nShow the parent task for nested observations.\n');
  const script=`const store=require('./commands/lib/session-events.cjs');const span=store.begin(process.argv[1],{label:'Nested operation'});span.finish('succeeded',0);`;
  const linked=await child(['commands/lib/session-visualizer.cjs','run','--root',root,'--session',id,'--task','inherited-task','--',process.execPath,'-e',script,root]);
  assert.equal(linked.code,0,linked.stderr);const events=store.page(root,id).events;assert.equal(events.length,4);assert.ok(events.every(e=>e.taskContext?.title==='Keep nested work identifiable'));assert.equal(events[1].parentId,events[0].activityId);
  const switched=await child(['commands/lib/session-visualizer.cjs','run','--root',root,'--session',other.id,'--',process.execPath,'-e',script,root],{HEPHAERA_SESSION_ID:id,HEPHAERA_TASK_ID:'inherited-task',HEPHAERA_ACTIVITY_ID:events[0].activityId});
  assert.equal(switched.code,0,switched.stderr);assert.ok(store.page(root,other.id).events.every(e=>e.task===undefined&&e.taskContext===undefined));
});
test('current work distinguishes an explicit task report from a successful operation', async t => {
  const {root,id}=prepare(t),dir=store.directory(root,'.hephaera/.cache/tasks/summary-task');fs.writeFileSync(path.join(dir,'TASK.md'),'# Improve quest tracking\n\n## Goal\n\nShow active objectives clearly.\n');
  const task=recorded(root,id,'Task running',{task:'summary-task',category:'task',action:'started',status:'running'});
  recorded(root,id,'Task checkpoint',{task:'summary-task',operation:'Record task checkpoint',action:'finished',status:'succeeded'});
  const reducer=await import('../visualizer/state.mjs');let groups=reducer.currentWork(reducer.replay(store.page(root,id).events));
  assert.equal(groups[0].title,'Improve quest tracking');assert.equal(groups[0].current.status,'running');assert.equal(groups[0].latest.status,'succeeded');assert.equal(reducer.activityText(groups[0].latest).operation,'Record task checkpoint');
  recorded(root,id,'Task completed',{task:'summary-task',category:'task',activityId:task.activityId,action:'finished',status:'succeeded'});
  groups=reducer.currentWork(reducer.replay(store.page(root,id).events));assert.equal(groups[0].current.status,'succeeded');
  assert.equal(reducer.activityText({label:'Old activity',task:'other-task',taskContext:task.taskContext}).title,'Old activity');
});
function jsonRequest(service, route, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(service.url);
    const request = http.request({ hostname: '127.0.0.1', port: url.port, path: route, agent: false, ...options,
      headers: { Host: url.host, Authorization: 'Bearer ' + service.token, ...options.headers } }, response => {
      let text = ''; response.on('data', chunk => { text += chunk; }); response.on('end', () => { let body; try { body = JSON.parse(text); } catch { body = text; } resolve({ status: response.statusCode, headers: response.headers, body }); });
    }); request.setTimeout(5000, () => request.destroy(new Error('Owned test deadline'))); request.on('error', reject); request.end();
  });
}
async function server(t, root) { const value = await startServer({ root, openBrowser: false }); t.after(value.close); return value; }
test('the exact viewer hostname is accepted without widening Host or Origin checks', async t => {
  const {root}=prepare(t),running=await server(t,root),port=new URL(running.url).port;
  const Host='my.hephaera.com:'+port,Origin='http://'+Host;
  assert.equal((await jsonRequest(running,'/api/sessions',{headers:{Host,Origin}})).status,200);
  for(const host of ['127.0.0.1:'+port,'my.hephaera.com.:'+port,'MY.HEPHAERA.COM:'+port,'other.hephaera.com:'+port,'my.hephaera.com:1'])
    assert.equal((await jsonRequest(running,'/api/sessions',{headers:{Host:host}})).status,403);
  for(const origin of ['http://127.0.0.1:'+port,'https://'+Host,'http://my.hephaera.com:1','null'])
    assert.equal((await jsonRequest(running,'/api/sessions',{headers:{Host,Origin:origin}})).status,403);
});
function child(args, env = {}, cwd = REPO) {
  return new Promise(resolve => { const proc = cp.spawn(process.execPath, args, { cwd, windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore','pipe','pipe'] }); let stdout = '', stderr = ''; proc.stdout.on('data', c => { stdout += c; }); proc.stderr.on('data', c => { stderr += c; }); proc.once('error', error => resolve({ error })); proc.once('close', (code, signal) => resolve({ code, signal, stdout, stderr })); });
}

test('HTTP listener is fixed to IPv4 loopback and refuses non-loopback connections', async t => {
  const root=fixture(t),original=http.Server.prototype.listen;let listener;
  http.Server.prototype.listen=function(...args){listener=this;return Reflect.apply(original,this,args);};
  let running;try{running=await server(t,root);}finally{http.Server.prototype.listen=original;}
  assert.match(running.url,/^http:\/\/my\.hephaera\.com:\d+$/);
  assert.equal(running.connectUrl,'http://127.0.0.1:'+listener.address().port);
  assert.equal(listener.address().address,'127.0.0.1');assert.equal(listener.address().family,'IPv4');
  assert.equal(running.schemaVersion,3);assert.equal(running.bindAddress,'127.0.0.1');
  assert.equal('certificate' in running,false);assert.equal('spki' in running,false);
  const addresses=[...new Set(Object.values(os.networkInterfaces()).flat().filter(item=>item&&!item.internal&&item.family==='IPv4').map(item=>item.address)),'::1'];
  for(const host of addresses){
    const refused=await new Promise(resolve=>{
      const socket=net.connect({host,port:listener.address().port});
      socket.setTimeout(1200,()=>{socket.destroy();resolve(true);});
      socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));
    });
    assert.equal(refused,true,'Visualizer port must not accept a non-loopback-interface or IPv6 connection.');
  }
  t.diagnostic('Actual IPv4 loopback socket verified; non-loopback/IPv6 connection probes refused: '+addresses.length);
});
test('bind overrides and non-loopback retained endpoints are rejected', async t => {
  const root=fixture(t),service=require('../commands/lib/session-visualizer-server.cjs');
  for(const key of ['host','hostname','address','bindAddress','listenAddress']){
    const result=await startServer({root,[key]:'0.0.0.0'}).then(value=>({value}),error=>({error}));
    if(result.value)await result.value.close();
    assert.match(result.error?.message||'',/unsupported.*option/i);
    assert.equal(fs.existsSync(path.join(root,store.CACHE,'server-lock')),false);
  }
  store.privateCache(root);
  const template={schemaVersion:2,transport:'http-loopback',bindAddress:'127.0.0.1',root,pid:process.pid,instanceId:crypto.randomUUID(),version:'0'.repeat(64),token:'a'.repeat(64)};
  const save=value=>store.write(root,service.RUNTIME,value,fs.existsSync(store.safe(root,service.RUNTIME,'file')));
  for(const url of ['http://0.0.0.0:49155','http://localhost:49155','http://127.0.0.2:49155','http://[::]:49155','http://[::1]:49155','http://2130706433:49155','http://127.1:49155','http://user@127.0.0.1:49155','http://127.0.0.1:80','http://127.0.0.1:49155/path','https://127.0.0.1:49155']){
    save({...template,url});assert.throws(()=>service.runtime(root));assert.equal(await service.probe({...template,url}),false);
  }
  save({...template,url:'http://127.0.0.1:49155',bindAddress:'0.0.0.0'});assert.throws(()=>service.runtime(root));
  save({...template,url:'http://127.0.0.1:49155'});assert.equal(service.runtime(root).url,'http://127.0.0.1:49155');
  store.write(root,store.CACHE+'/config.json',{enabled:true,host:'0.0.0.0'});assert.throws(()=>store.settings(root));
});
test('loopback health bypasses environment proxies and ignores bind environment variables', async t => {
  const {root,id}=prepare(t),running=await server(t,root);let forwarded=0;
  const proxy=http.createServer((_request,response)=>{forwarded++;response.writeHead(502);response.end();});
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  try{
    const proxyUrl='http://127.0.0.1:'+proxy.address().port;
    const result=await child(['commands/lib/session-visualizer.cjs','status','--root',root,'--session',id],
      {NODE_USE_ENV_PROXY:'1',HTTP_PROXY:proxyUrl,http_proxy:proxyUrl,HTTPS_PROXY:proxyUrl,https_proxy:proxyUrl,NO_PROXY:'',no_proxy:'',HOST:'0.0.0.0',BIND_ADDRESS:'::',HEPHAERA_VISUALIZER_HOST:'0.0.0.0'});
    assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).status,'running');
    assert.match(JSON.parse(result.stdout).url,/^http:\/\/my\.hephaera\.com:/);assert.equal(forwarded,0);
  }finally{await new Promise(resolve=>proxy.close(resolve));}
});
test('domain runtime pairs reject alternate origins and health never resolves DNS', async t => {
  const {root,id}=prepare(t),service=require('../commands/lib/session-visualizer-server.cjs'),running=await server(t,root);
  const port=new URL(running.url).port,original=store.read(root,service.RUNTIME);
  for(const change of [{url:'http://other.hephaera.com:'+port},{url:'http://my.hephaera.com.evil.test:'+port},
    {url:'http://my.hephaera.com.:'+port},{url:'https://my.hephaera.com:'+port},{url:'http://127.0.0.1:'+port},
    {connectUrl:'http://my.hephaera.com:'+port},{connectUrl:'http://192.0.2.1:'+port},{connectUrl:'http://127.0.0.2:'+port},
    {connectUrl:'http://[::1]:'+port},{connectUrl:'http://127.0.0.1:'+(port===49155?49156:49155)},{connectUrl:undefined}]){
    const invalid={...original,...change};store.write(root,service.RUNTIME,invalid,true);
    assert.throws(()=>service.runtime(root));assert.equal(await service.probe(invalid),false);
  }
  store.write(root,service.RUNTIME,original,true);
  const script=`const dns=require('node:dns');dns.lookup=()=>{throw Error('Unexpected DNS lookup')};dns.promises.lookup=async()=>{throw Error('Unexpected DNS lookup')};require('./commands/lib/session-visualizer.cjs').main(process.argv.slice(1)).catch(()=>{process.exitCode=1});`;
  const result=await child(['-e',script,'status','--root',root,'--session',id]);
  assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).status,'running');
});
test('previous literal HTTP owners remain available for safe probe and restart', async t => {
  const root=fixture(t),service=require('../commands/lib/session-visualizer-server.cjs');store.privateCache(root);
  const instanceId=crypto.randomUUID(),token='b'.repeat(64);let requests=0;
  const old=http.createServer((request,response)=>{requests++;assert.equal(request.headers.host,'127.0.0.1:'+old.address().port);
    assert.equal(request.headers.authorization,'Bearer '+token);response.end(JSON.stringify({instanceId}));});
  await new Promise(resolve=>old.listen(0,'127.0.0.1',resolve));
  try{const info={schemaVersion:2,transport:'http-loopback',bindAddress:'127.0.0.1',root,pid:process.pid,instanceId,version:'0'.repeat(64),token,url:'http://127.0.0.1:'+old.address().port};
    store.write(root,service.RUNTIME,info);assert.equal(service.runtime(root).schemaVersion,2);assert.equal(await service.probe(info),true);assert.equal(requests,1);
    const session=store.createSession(root);const result=await start(root,{session:session.id,noOpen:true});assert.equal(result.status,'viewer-restart-required');
  }finally{await new Promise(resolve=>old.close(resolve));}
});
test('production opens the default browser without flags or owning its lifetime', async t => {
  const {root,id}=prepare(t),helper=require('../commands/lib/session-default-browser.cjs'),open=helper.open,spawn=cp.spawn;
  let args,kills=0,unrefs=0;
  helper.open=(project,relative,options)=>open(project,relative,{...options,
    lookup:async()=>[{address:'127.0.0.1',family:4}],
    resolve:async()=>({command:fs.realpathSync(process.execPath),args:[],kind:'browser'})});
  cp.spawn=(executable,values,options)=>{
    assert.equal(executable,fs.realpathSync(process.execPath));args=values;
    assert.equal(options.detached,true);assert.equal(options.shell,false);assert.equal(options.stdio,'ignore');
    const {EventEmitter}=require('node:events'),child=new EventEmitter();child.kill=()=>kills++;child.unref=()=>unrefs++;
    queueMicrotask(()=>child.emit('spawn'));return child;
  };
  const running=await startServer({root});
  try{
    const result=await start(root,{session:id});assert.equal(result.browser,'opened-default-unverified');assert.ok(args);
    assert.equal(args.length,1);assert.ok(args[0].startsWith('file:'));assert.ok(args[0].endsWith('.html'));
    assert.equal(args.some(arg=>arg.includes(running.token)),false);
    const contents=fs.readFileSync(require('node:url').fileURLToPath(args[0]),'utf8');
    assert.ok(contents.includes(running.url));assert.ok(contents.includes(running.token));
    assert.equal(fs.existsSync(store.safe(root,store.CACHE+'/private/browser','dir')),false);
    await start(root,{session:id});assert.equal(unrefs,1,'Repeated startup does not open extra tabs');
    assert.equal(store.emit(root,id,{label:'Work continues after browser opening'}).recorded,true);
  }finally{
    await running.close();cp.spawn=spawn;helper.open=open;
  }
  assert.equal(kills,0);assert.equal(unrefs,1);assert.equal(store.session(root,id).endedAt,undefined);
});

test('default browser DNS guard rejects unsafe or unavailable answers before any browser query', async t => {
  const {root}=prepare(t),helper=require('../commands/lib/session-default-browser.cjs');
  store.privateCache(root);store.directory(root,store.CACHE+'/private/launch');
  const relative=store.CACHE+'/private/launch/test.html';fs.writeFileSync(store.safe(root,relative,'file'),'<title>Test handoff</title>');
  let queries=0,launches=0;
  const options={resolve:async()=>{queries++;return {};},start:async()=>{launches++;}};
  for(const addresses of [[],[{address:'192.0.2.1'}],[{address:'127.0.0.2'}],[{address:'127.0.0.1'},{address:'192.0.2.1'}],[{address:'::1'}]]) {
    assert.equal((await helper.open(root,relative,{...options,lookup:async()=>addresses})).status,'browser-unavailable');
  }
  assert.equal((await helper.open(root,relative,{...options,lookup:async()=>{throw Error('DNS private diagnostic');}})).reason,'hostname-unavailable');
  assert.equal(queries,0);assert.equal(launches,0);
  assert.equal((await helper.open(root,relative,{...options,lookup:async()=>[{address:'127.0.0.1'},{address:'::1'}]})).status,'opened-default-unverified');
  assert.equal(queries,1);assert.equal(launches,1);
  for(const unsafe of ['../outside.html',store.CACHE+'/private/launch/../test.html',store.CACHE+'/session.html']) {
    assert.equal((await helper.open(root,unsafe,options)).status,'browser-unavailable');
  }
  const alias=store.safe(root,store.CACHE+'/private/launch/alias.html','file');fs.linkSync(store.safe(root,relative,'file'),alias);
  assert.equal((await helper.open(root,relative,options)).status,'browser-unavailable');assert.equal(queries,1);fs.unlinkSync(alias);
});

test('default browser lookup is bounded and cannot launch after timeout or service cancellation', async t => {
  const {root}=prepare(t),helper=require('../commands/lib/session-default-browser.cjs');
  store.privateCache(root);store.directory(root,store.CACHE+'/private/launch');
  const relative=store.CACHE+'/private/launch/test.html';fs.writeFileSync(store.safe(root,relative,'file'),'Test');
  let launches=0;
  const options={lookup:async()=>[{address:'127.0.0.1'}],resolve:async()=>{await delay(50);return {};},start:async()=>launches++,timeoutMs:10};
  assert.equal((await helper.open(root,relative,options)).reason,'default-browser-timeout');await delay(60);assert.equal(launches,0);
  const controller=new AbortController();controller.abort();
  assert.equal((await helper.open(root,relative,{...options,signal:controller.signal})).status,'browser-unavailable');assert.equal(launches,0);
  assert.equal((await helper.open(root,relative,{...options,signal:controller.signal,lookup:async()=>{throw Error('Cancelled lookup');}})).status,'browser-unavailable');
  await delay(10);assert.equal(launches,0);
});

test('default HTTP browser providers use structured OS registrations, not the HTML editor', async t => {
  const {root}=prepare(t),helper=require('../commands/lib/session-default-browser.cjs');
  const find=(project,name)=>'/usr/bin/'+name;
  const plan=await helper.resolveBrowser(root,{platform:'linux',find,run:async(exe,args)=>{
    assert.deepEqual(args,['query','default','x-scheme-handler/http']);return 'org.example.Browser.desktop';
  }});
  assert.deepEqual(plan.args,['org.example.Browser.desktop']);assert.equal(plan.command,'/usr/bin/gtk-launch');
  await assert.rejects(helper.resolveBrowser(root,{platform:'linux',find,run:async()=>';do-not-execute.desktop'}));
  await assert.rejects(helper.resolveBrowser(root,{platform:'linux',find:(_,name)=>['xdg-mime','xdg-open'].includes(name)?'/usr/bin/'+name:null,
    run:async(exe,args)=>args[2]==='text/html'?'editor.desktop':'browser.desktop'}));
  await assert.rejects(helper.resolveBrowser(root,{platform:'win32',run:async()=>JSON.stringify({executable:process.execPath+' --profile anything'})}));
  await assert.rejects(helper.resolveBrowser(root,{platform:'unsupported'}));
});

test('OS browser launchers are detached without a cancellation kill handle', async t => {
  const {root}=prepare(t),helper=require('../commands/lib/session-default-browser.cjs'),original=cp.spawn;
  store.privateCache(root);store.directory(root,store.CACHE+'/private/launch');
  const relative=store.CACHE+'/private/launch/utility.html';fs.writeFileSync(store.safe(root,relative,'file'),'Test');
  const controller=new AbortController();let unrefs=0,kills=0;
  cp.spawn=(command,args,options)=>{
    assert.equal(command,process.execPath);assert.deepEqual(args,['-a','Registered browser',require('node:url').pathToFileURL(store.safe(root,relative,'file')).href]);
    assert.equal(options.detached,true);assert.equal(options.signal,undefined);assert.equal(options.shell,false);
    const child=new(require('node:events').EventEmitter)();child.unref=()=>unrefs++;child.kill=()=>kills++;
    queueMicrotask(()=>child.emit('spawn'));return child;
  };
  try {
    const result=await helper.open(root,relative,{signal:controller.signal,lookup:async()=>[{address:'127.0.0.1'}],resolve:async()=>({command:process.execPath,args:['-a','Registered browser'],kind:'utility'})});
    assert.equal(result.status,'opened-default-unverified');controller.abort();assert.equal(unrefs,1);assert.equal(kills,0);
  } finally { cp.spawn=original; }
});

test('default browser failure reports a reason while recording and command outcomes continue', async t => {
  const {root,id}=prepare(t),helper=require('../commands/lib/session-default-browser.cjs'),open=helper.open;
  helper.open=async()=>({status:'browser-unavailable',reason:'default-browser-unavailable'});
  const running=await startServer({root});
  try {
    const result=await start(root,{session:id});assert.equal(result.status,'running');assert.equal(result.browserReason,'default-browser-unavailable');
    const command=cp.spawnSync(process.execPath,[path.join(REPO,'commands/lib/session-visualizer.cjs'),'run','--root',root,'--session',id,'--',process.execPath,'-e','process.exit(23)'],{encoding:'utf8'});
    assert.equal(command.status,23);assert.equal(store.page(root,id).events.at(-1).status,'failed');
  } finally { await running.close();helper.open=open; }
});
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

test('hard-linked metadata is rejected while an interrupted owned publication recovers', t => {
  const { root, id } = prepare(t), other = fixture(t), base = store.CACHE + '/sessions/' + id;
  const foreign = path.join(other,'linked.json');
  fs.linkSync(path.join(root,base,'session.json'),foreign);
  assert.throws(() => store.session(root,id)); fs.unlinkSync(foreign);
  const first = recorded(root,id), relative = base + '/events/000001.json', published = path.join(root,relative);
  const retained = fs.readFileSync(published), temp = published + '.' + crypto.randomUUID() + '.tmp';
  fs.linkSync(published,temp); store.write(root,base+'/budget.json',{count:0,bytes:0,capped:false},true);
  assert.equal(recorded(root,id).sequence,2); assert.equal(fs.existsSync(temp),false);
  assert.deepEqual(fs.readFileSync(published),retained);
  const reconciled = store.read(root,base+'/budget.json');
  fs.linkSync(published,foreign); assert.throws(() => store.page(root,id));
  store.write(root,base+'/budget.json',{count:0,bytes:0,capped:false},true);
  assert.throws(() => recorded(root,id)); assert.equal(fs.existsSync(foreign),true); assert.deepEqual(fs.readFileSync(published),retained);
  fs.unlinkSync(foreign); store.write(root,base+'/budget.json',reconciled,true);
  assert.equal(store.page(root,id).events[0].id,first.id);
  fs.writeFileSync(path.join(root,'artifact.json'),'{}'); fs.linkSync(path.join(root,'artifact.json'),foreign);
  assert.throws(() => recorded(root,id,'Linked evidence',{evidence:['artifact.json']})); fs.unlinkSync(foreign);
  store.end(root,id); fs.linkSync(path.join(root,base,'budget.json'),foreign);
  assert.throws(() => store.remove(root,id)); assert.equal(fs.existsSync(published),true); fs.unlinkSync(foreign);
});
test('parallel processes publish complete ordered events without cross-session attribution', async t => {
  if(process.platform==='win32') {
    const pending=prepare(t), lock=path.join(pending.root,store.CACHE,'sessions',pending.id,'writer-lock'), mkdir=fs.mkdirSync; let injected=false;
    fs.mkdirSync=function(target,...args){if(target===lock&&!injected){injected=true;throw Object.assign(new Error('Synthetic delete-pending lock directory'),{code:'EPERM'});}return mkdir.call(this,target,...args);};
    try { recorded(pending.root,pending.id); assert.equal(injected,true); assert.equal(store.page(pending.root,pending.id).total,1); } finally { fs.mkdirSync=mkdir; }
  }
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
  if(process.platform==='win32') {
    const unsigned = await child(['commands/lib/session-visualizer.cjs','run','--root',root,'--session',id,'--',process.execPath,'-e','process.exitCode=3221225477;']);
    assert.equal(unsigned.code,3221225477);
    const terminal = store.page(root,id).events.at(-1); assert.equal(terminal.status,'failed'); assert.equal(terminal.exitCode,3221225477);
  }
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
  const taskDir=store.directory(root,'.hephaera/.cache/tasks/missing-helper');fs.writeFileSync(path.join(taskDir,'TASK.md'),'# A readable task\n');
  for (const name of ['session-visualizer.cjs','session-events.cjs','state-transition.cjs']) fs.copyFileSync(path.join(REPO,'commands/lib',name),path.join(lib,name));
  const result = await child([path.join(lib,'session-visualizer.cjs'),'run','--root',root,'--session',id,'--task','missing-helper','--',process.execPath,'-e',`process.stdout.write('independent command');process.exitCode=3;`]);
  assert.equal(result.code,3); assert.equal(result.stdout,'independent command'); assert.equal(store.page(root,id).events.at(-1).exitCode,3);
  assert.equal(store.page(root,id).events.at(-1).taskContext,undefined);
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

test('native admission, process failure and requested cancellation keep distinct outcomes', async t => {
  const { root, id } = prepare(t), script = path.join(root,'native-outcome.cjs'), failed = path.join(root,'native-failed.cjs');
  fs.writeFileSync(script,'setInterval(()=>{},1000);');
  fs.writeFileSync(failed,'process.exitCode=7;');
  const source = `const adapter=require('./commands/lib/bubo-host-adapter.cjs');const [root,script,failed]=process.argv.slice(1),errors=[];const prepared=timeout=>({root,stateRoot:'.hephaera/.cache/tasks/native-outcome',context:{budgets:{timeoutSeconds:timeout,maxLogBytes:1048576}}});(async()=>{try{await adapter.execute(script,'run',new Map(),prepared(0),{executable:process.execPath},false);}catch(error){errors.push(error.message)}try{await adapter.execute(failed,'run',new Map(),prepared(5),{executable:process.execPath},false);}catch(error){errors.push(error.message)}try{await adapter.execute(script,'run',new Map(),prepared(5),{executable:process.execPath},false,{spawned(){process.emit('SIGTERM')}});}catch(error){errors.push(error.message)}console.log(JSON.stringify(errors));})().catch(()=>{process.exitCode=1});`;
  const result = await child(['-e',source,root,script,failed],{HEPHAERA_SESSION_ID:id});
  assert.equal(result.code,0,result.stderr);
  const errors = JSON.parse(result.stdout); assert.equal(errors.length,3); assert.equal(errors[1],'Bubo did not return one valid machine-readable result.'); assert.equal(errors[2],errors[1]);
  const finished=store.page(root,id).events.filter(event=>event.action==='finished');
  assert.deepEqual(finished.map(event=>event.status),['blocked','failed','cancelled']); assert.equal(finished[1].exitCode,7);
});
test('real clone and submodule mounts start the shipped UI without source builds or setup hooks', async t => {
  const base = fixture(t), source = path.join(base, 'source'); fs.mkdirSync(source);
  const hooks = path.join(base, 'empty-hooks'); fs.mkdirSync(hooks);
  for (const relative of ['visualizer','commands/lib/session-events.cjs','commands/lib/session-visualizer.cjs','commands/lib/session-visualizer-server.cjs','commands/lib/session-observer.sh','commands/lib/private-visualizer-cache.ps1','commands/lib/state-transition.cjs','commands/lib/installation-maintenance.cjs','commands/lib/memory-common.sh','commands/lib/state-transition-common.sh','commands/session-visualizer.sh','commands/resolve-hephaera-paths.sh','logo.png','.gitignore']) {
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
test('HTTP service rejects unauthorized peers, wrong origins, writes and arbitrary files', async t => {
  const { root, id } = prepare(t); recorded(root, id); const running = await server(t, root);
  assert.equal((await jsonRequest(running, '/api/sessions')).status, 200);
  assert.equal((await jsonRequest(running, '/api/sessions', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await jsonRequest(running, '/api/sessions', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await jsonRequest(running, '/api/sessions', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await jsonRequest(running, '/api/sessions', { headers: { Origin: 'http://evil.example' } })).status, 403);
  assert.equal((await jsonRequest(running, '/api/sessions', { headers: { Origin: 'null' } })).status, 403);
  for (const host of ['localhost','0.0.0.0','[::1]','127.0.0.2','2130706433']) assert.equal((await jsonRequest(running, '/api/sessions', { headers: { Host: host + ':' + new URL(running.url).port } })).status,403);
  assert.equal((await jsonRequest(running, '/api/sessions', { method: 'POST' })).status, 405);
  assert.equal((await jsonRequest(running, '/api/sessions', { method: 'OPTIONS' })).status, 405);
  assert.equal((await jsonRequest(running, '/.hephaera/.cache/SYSTEM_MEMORY.md')).status, 404);
  assert.equal((await jsonRequest(running, '/%2e%2e/private')).status, 400);
  const staticPage = await jsonRequest(running, '/'); assert.equal(staticPage.status, 200); assert.ok(staticPage.headers['content-security-policy'].includes("connect-src 'self'"));
  assert.equal(staticPage.headers['access-control-allow-origin'],undefined);
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
    const request = http.get(running.connectUrl + '/api/sessions/' + id + '/events?after=1', { agent: false, headers: { Host: new URL(running.url).host, Authorization: 'Bearer ' + running.token } }, response => {
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
    const request = http.get(running.connectUrl + '/api/sessions/' + id + '/events', { agent: false, headers: { Host: new URL(running.url).host, Authorization: 'Bearer ' + running.token } }, response => {
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
  const waiting = recorded(root,id,'Waiting fixture',{status:'waiting',blocker:'Awaiting verification'});
  recorded(root,id,'Waiting fixture',{activityId:waiting.activityId,status:'waiting'});
  recorded(root,id,'Waiting fixture',{activityId:waiting.activityId,action:'finished',status:'succeeded'});
  const resumed = store.page(root,id).events;
  assert.equal(reducer.replay(resumed,5).activities.get(waiting.activityId).blocker,'Awaiting verification');
  for(const event of resumed.slice(3)) reducer.applyEvent(live,event);
  assert.deepEqual(live,reducer.replay(resumed)); assert.equal(live.activities.get(waiting.activityId).blocker,undefined);
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
test('the internal worker refuses accidental foreground startup', t => {
  const root = fixture(t);
  const result = cp.spawnSync(process.execPath, [path.join(REPO,'commands/lib/session-visualizer-server.cjs'),root,crypto.randomUUID(),'0'],
    { cwd:REPO, windowsHide:true, encoding:'utf8', timeout:4000 });
  assert.equal(result.status,2,'Direct worker invocation must exit instead of occupying the agent command.');
  assert.match(result.stderr,/session-visualizer\.sh start/);
  assert.equal(fs.existsSync(path.join(root,store.CACHE,'server-lock')),false);
});
test('captured shell startup returns and the background service survives its caller', async t => {
  const root = fixture(t), cli = path.join(REPO,'commands/lib/session-visualizer.cjs');
  const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles,'Git/bin/bash.exe') : 'bash';
  const caller = path.join(root,'caller.cjs');
  fs.writeFileSync(caller,`const cp=require('node:child_process');const [bash,entry,root]=process.argv.slice(2);const output=cp.execFileSync(bash,[entry,'start','--host','codex','--no-open'],{windowsHide:true,encoding:'utf8',timeout:25000,env:{...process.env,HEPHAERA_PROJECT_ROOT:root,HEPHAERA_SESSION_ID:''}});process.send(JSON.parse(output));setInterval(()=>{},1000);`);
  const parent = cp.spawn(process.execPath,[caller,bash,path.join(REPO,'commands/session-visualizer.sh'),root],
    { cwd:REPO,windowsHide:true,detached:process.platform !== 'win32',stdio:['ignore','pipe','pipe','ipc'] });
  let diagnostics = '', running;
  parent.stderr.on('data',bytes=>{diagnostics=(diagnostics+bytes).slice(-4096);});
  const exited = new Promise(resolve=>parent.once('close',resolve));
  const terminate = () => { if(parent.exitCode !== null || parent.signalCode !== null)return;try { if(process.platform === 'win32')parent.kill();else process.kill(-parent.pid,'SIGTERM'); } catch {} };
  try {
    const response = await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Captured startup did not return within its bounded startup window. '+diagnostics)),30000);
      parent.once('message',value=>{clearTimeout(timer);resolve(value);});
      parent.once('error',error=>{clearTimeout(timer);reject(error);});
      parent.once('exit',()=>{clearTimeout(timer);reject(new Error('Caller exited before startup returned. '+diagnostics));});
    });
    running = require('../commands/lib/session-visualizer-server.cjs').runtime(root);
    assert.equal(response.status,'running'); assert.equal(response.execution,'background'); assert.equal(response.pid,running.pid);
    assert.match(response.nextStep,/Continue/); assert.ok(running.pid !== parent.pid);
    terminate(); await exited;
    assert.equal(await require('../commands/lib/session-visualizer-server.cjs').probe(running),true);
    const before=store.page(root,response.sessionId).total;
    const stream = new Promise((resolve,reject)=>{
      const request=http.get(running.connectUrl+'/api/sessions/'+response.sessionId+'/events?after='+before,
        {agent:false,headers:{Host:new URL(running.url).host,Authorization:'Bearer '+running.token}},response=>{
          let wire='';response.on('data',bytes=>{wire+=bytes;if(wire.includes('After launcher exit')){resolve();request.destroy();}});
        });
      request.setTimeout(5000,()=>request.destroy(new Error('No fresh background event.')));request.once('error',reject);
    });
    const [result]=await Promise.all([child([cli,'run','--root',root,'--session',response.sessionId,'--label','After launcher exit','--',process.execPath,'-e','process.stdout.write("continued work");']),stream]);
    assert.equal(result.code,0,result.stderr);assert.equal(result.stdout,'continued work');
    const status=await child([cli,'status','--root',root,'--session',response.sessionId]);
    assert.equal(status.code,0,status.stderr);const detail=JSON.parse(status.stdout);
    assert.equal(detail.execution,'background');assert.equal(detail.pid,running.pid);
    assert.equal(detail.activity.total,before+2);assert.equal(detail.activity.lastRecordedSequence,before+2);
    assert.equal(detail.activity.lastRecordedAt,store.page(root,response.sessionId,before+1,1).events[0].at);
  } finally {
    terminate();await exited;
    // Keep cleanup bound to this fixture's exact service; never kill unknown owners.
    if(!running)try{running=require('../commands/lib/session-visualizer-server.cjs').runtime(root);}catch{}
    if(running)await child([cli,'stop','--root',root]);
  }
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

test('HTTP startup needs no OpenSSL and creates no certificate or pin metadata', async t => {
  const root = fixture(t);
  const result = await child(['commands/lib/session-visualizer.cjs','start','--root',root,'--no-open'], { HEPHAERA_OPENSSL: path.join(root, 'unavailable-openssl') });
  assert.equal(result.code,0); const status = JSON.parse(result.stdout);
  try {
    assert.equal(status.status,'running');assert.match(status.url,/^http:\/\/my\.hephaera\.com:/);
    const owned=require('../commands/lib/session-visualizer-server.cjs').runtime(root);
    assert.equal(owned.schemaVersion,3);assert.equal('certificate' in owned,false);assert.equal('spki' in owned,false);
    assert.equal(store.history(root).total,1);
  }finally{await child(['commands/lib/session-visualizer.cjs','stop','--root',root]);}
});
test('legacy HTTPS ownership can still be probed for explicit shutdown only', async t => {
  const root=fixture(t),service=require('../commands/lib/session-visualizer-server.cjs');store.privateCache(root);
  const old={schemaVersion:1,root,pid:process.pid,instanceId:crypto.randomUUID(),version:'0'.repeat(64),url:'https://127.0.0.1:49155',token:'b'.repeat(64),certificate:'Synthetic public legacy certificate'};
  store.write(root,service.RUNTIME,old);assert.equal(service.runtime(root).url,old.url);
  const original=https.get;let requests=0;
  https.get=(url,options,callback)=>{
    requests++;assert.equal(url,old.url+'/api/health');assert.equal(options.agent.options.ca,old.certificate);
    assert.equal(options.headers.Authorization,'Bearer '+old.token);
    const {EventEmitter}=require('node:events'),request=new EventEmitter();request.setTimeout=()=>request;request.destroy=()=>{};
    queueMicrotask(()=>{const response=new EventEmitter();response.statusCode=200;callback(response);response.emit('data',JSON.stringify({instanceId:old.instanceId}));response.emit('end');});return request;
  };
  try{assert.equal(await service.probe(old),true);assert.equal(await service.probe({...old,url:'https://localhost:49155'}),false);assert.equal(requests,1);}
  finally{https.get=original;}
});
test('changed service identity requests an explicit restart without replacing a live owner', async t => {
  const {root,id}=prepare(t),owned=await server(t,root),service=require('../commands/lib/session-visualizer-server.cjs');
  const previous=store.read(root,service.RUNTIME);store.write(root,service.RUNTIME,{...previous,version:'0'.repeat(64)},true);
  try{const result=await start(root,{session:id,noOpen:true});assert.equal(result.status,'viewer-restart-required');assert.equal(result.sessionId,id);assert.equal(await service.probe(owned),true);}
  finally{store.write(root,service.RUNTIME,previous,true);}
});
