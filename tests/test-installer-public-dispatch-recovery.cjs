'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),area=path.join(root,'.local','public-dispatch-tests-'+crypto.randomUUID()),tools=path.join(area,'tools');fs.mkdirSync(tools,{recursive:true});
const {writeZip}=require('../installer/scripts/archives.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const env={...process.env,GIT_CONFIG_GLOBAL:path.join(area,'gitconfig'),GIT_CONFIG_NOSYSTEM:'1'};for(const key of Object.keys(env))if(/^GIT_CONFIG_(COUNT|KEY_|VALUE_)/.test(key))delete env[key];fs.writeFileSync(env.GIT_CONFIG_GLOBAL,'[core]\n autocrlf = false\n[commit]\n gpgsign = false\n');
function git(...args){return cp.execFileSync('git',['-C',tools,'-c','core.hooksPath='+path.join(root,'installer/core/no-hooks'),'-c','user.name=Dispatch Fixture','-c','user.email=fixture@example.invalid',...args],{encoding:'utf8',env,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();}
for(const file of ['installer/scripts/dispatch-public-release.cjs','installer/scripts/archives.cjs','installer/lib/public-release.cjs','installer/lib/release.cjs','installer/lib/publish.cjs','installer/core/files.cjs']){const target=path.join(tools,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,fs.readFileSync(path.join(root,file)));}
git('init','-q','-b','main');git('remote','add','origin','https://github.com/TimothyMeadows/Hephaera.git');git('add','.');git('commit','-qm','Owned reviewed dispatcher tools');const toolsSha=git('rev-parse','HEAD');
const {dispatch}=require(path.join(tools,'installer/scripts/dispatch-public-release.cjs'));
const selected={version:'5.1.0-rc.1',sourceSha:'a'.repeat(40),releaseId:456,upstreamRunId:123,upstreamToolsSha:toolsSha},STEP='Dispatch the canonical public publishing workflow once';
const request={ref:'main',inputs:{version:selected.version,source_sha:selected.sourceSha,release_id:'456',upstream_run_id:'123',upstream_tools_sha:toolsSha,registry_selection:'nuget',npm_auth_mode:'trusted'}};
const title=`Public registries ${selected.version} release 456 from 123 nuget`;
const run=id=>({id,display_title:title,head_sha:toolsSha,head_branch:'main',created_at:'2026-01-01T00:00:01Z',html_url:'https://github.com/TimothyMeadows/Hephaera/actions/runs/'+id});
const job=(attempt,overrides={})=>({id:100+attempt,name:'public-dispatch',run_attempt:attempt,status:'completed',conclusion:'success',steps:[{name:STEP,status:'completed',conclusion:'success'}],...overrides});
function receipt(attempt,overrides={}){
 const state={schemaVersion:1,status:'intent',request,toolsSha,previousRunIds:[],at:'2026-01-01T00:00:00Z',...overrides};
 const raw=Buffer.from(JSON.stringify(state)),bytes=writeZip(new Map([['public-dispatch.json',raw],['public-dispatch-request.json',Buffer.from(JSON.stringify(request))]]));
 return {raw,bytes,metadata:{id:700+attempt,name:'public-registry-dispatch-attempt-'+attempt,expired:false,size_in_bytes:bytes.length,digest:'sha256:'+hash(bytes)}};
}
function io(options={}){
 const receipts=options.receipts||[],calls=[],remote=options.runs||[];let posts=0;
 const api={get:async endpoint=>{
  calls.push(endpoint);const url=new URL(endpoint,'https://api.github.com/'),page=Number(url.searchParams.get('page')||1),pathname=url.pathname;
  if(pathname.endsWith('/commits/main'))return {sha:toolsSha};
  if(pathname.endsWith('/releases/456'))return {id:456,tag_name:selected.version,draft:false,prerelease:true};
  if(pathname.endsWith('/actions/runs/123'))return {id:123,head_sha:toolsSha,head_branch:'main',path:'.github/workflows/publish-packages.yml',created_at:'2026-01-01T00:00:00Z'};
  if(pathname.endsWith('/actions/workflows/publish-public-packages.yml'))return {id:555,state:'active',path:'.github/workflows/publish-public-packages.yml'};
  if(pathname.endsWith('/actions/runs/123/artifacts'))return {total_count:receipts.length,artifacts:receipts.map(x=>x.metadata).slice((page-1)*100,page*100)};
  const match=pathname.match(/\/actions\/runs\/123\/attempts\/(\d+)\/jobs$/);
  if(match){const attempt=Number(match[1]),jobs=options.jobs?.[attempt]||[job(attempt)];return {total_count:jobs.length,jobs:jobs.slice((page-1)*100,page*100)};}
  if(pathname.endsWith('/actions/workflows/555/runs'))return options.runPage?options.runPage(page):{total_count:remote.length,workflow_runs:remote.slice((page-1)*100,page*100)};
  throw new Error('Unexpected owned metadata route');
 },download:async endpoint=>{calls.push(endpoint);const id=Number(endpoint.match(/artifacts\/(\d+)\/zip$/)?.[1]);const found=receipts.find(x=>x.metadata.id===id);assert.ok(found);return found.bytes;},post:async(endpoint,file)=>{posts++;assert.equal(endpoint,'repos/TimothyMeadows/Hephaera/actions/workflows/555/dispatches');assert.deepEqual(JSON.parse(fs.readFileSync(file)),request);remote.push(run(999));},sleep:async()=>{}};
 return {api,calls,posts:()=>posts};
}
async function execute(attempt,adapter,label){
 const keys={GITHUB_REPOSITORY:'TimothyMeadows/Hephaera',GITHUB_REF:'refs/heads/main',HEPHAERA_PUBLIC_TOOLS_SHA:toolsSha,GITHUB_RUN_ATTEMPT:String(attempt)},saved=Object.fromEntries(Object.keys(keys).map(key=>[key,process.env[key]]));Object.assign(process.env,keys);
 const directory=path.join(area,label+'-'+crypto.randomUUID());
 try{return {result:await dispatch(directory,{selected,registrySelection:'nuget',io:adapter.api}),directory};}catch(error){error.ownedDirectory=directory;throw error;}finally{for(const[key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}
}

test('fresh runner restores prior dispatch intent and confirms old run without another POST',async()=>{
 const first=receipt(1),adapter=io({receipts:[first],runs:[run(999)]});const {result,directory}=await execute(2,adapter,'restore');assert.equal(result.status,'confirmed');assert.equal(result.runId,999);assert.equal(result.restoredFrom.attempt,1);assert.equal(adapter.posts(),0);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'public-dispatch.json'))).request,request);assert.ok(adapter.calls.includes('repos/TimothyMeadows/Hephaera/actions/artifacts/701/zip'));
});

test('restored uncertain intent with no visible run is retained, never POSTed again',async()=>{
 const prior=receipt(1,{status:'needs-reconciliation'}),adapter=io({receipts:[prior]});let caught;try{await execute(2,adapter,'uncertain');}catch(error){caught=error;}assert.match(caught?.message||'',/uncertain/);assert.equal(adapter.posts(),0);assert.deepEqual(fs.readFileSync(path.join(caught.ownedDirectory,'public-dispatch.json')),prior.raw);
});

test('all prior dispatch attempts require known step history and receipt after possible writes',async()=>{
 for(const options of [
  {receipts:[receipt(1)],attempt:3},
  {receipts:[receipt(2)],attempt:3},
  {receipts:[],attempt:2,jobs:{1:[job(1,{steps:[]})]}},
  {receipts:[],attempt:2,jobs:{1:[job(1,{steps:[{name:'renamed dispatch step',status:'completed',conclusion:'success'}]})]}},
  {receipts:[],attempt:2,jobs:{1:[]}},
  {receipts:[receipt(1)],attempt:2,jobs:{1:[job(1,{run_attempt:undefined})]}}
 ]){const adapter=io(options);await assert.rejects(execute(options.attempt,adapter,'missing'),/receipt|history|attempt identity/);assert.equal(adapter.posts(),0);}
});

test('latest same-upstream receipt is restored only after checking every prior attempt',async()=>{
 const adapter=io({receipts:[receipt(1),receipt(2,{status:'confirmed',runId:999})],runs:[run(999)]});const {result}=await execute(3,adapter,'latest');assert.equal(result.restoredFrom.attempt,2);assert.ok(adapter.calls.some(x=>x.includes('/attempts/1/jobs')));assert.ok(adapter.calls.some(x=>x.includes('/attempts/2/jobs')));assert.ok(adapter.calls.includes('repos/TimothyMeadows/Hephaera/actions/artifacts/702/zip'));assert.equal(adapter.posts(),0);
});

test('an exact duplicate beyond the first100 canonical workflow runs prevents POST',async()=>{
 const others=Array.from({length:100},(_,i)=>({...run(2000+i),display_title:'Different release '+i,head_sha:'b'.repeat(40)}));const adapter=io({runs:[...others,run(999)]});await assert.rejects(execute(1,adapter,'old-duplicate'),/already exists/);assert.equal(adapter.posts(),0);assert.ok(adapter.calls.some(x=>x.includes('page=2')));
});

test('missing or incomplete paginated run history cannot authorize dispatch',async()=>{
 const adapter=io({runPage:()=>({total_count:101,workflow_runs:[]})});await assert.rejects(execute(1,adapter,'incomplete'),/Incomplete/);assert.equal(adapter.posts(),0);
});

test('changing totals or duplicate IDs across pages cannot hide a previous dispatch',async()=>{
 const first=Array.from({length:100},(_,i)=>({...run(2000+i),display_title:'Other '+i,head_sha:'b'.repeat(40)}));
 for(const mode of ['changed-total','duplicate-id']){
  const adapter=io({runPage:page=>page===1?{total_count:101,workflow_runs:first}:{total_count:mode==='changed-total'?102:101,workflow_runs:[mode==='duplicate-id'?first[0]:{...run(3000),display_title:'Other last',head_sha:'b'.repeat(40)}]}});
  await assert.rejects(execute(1,adapter,mode),/changed|duplicate/);assert.equal(adapter.posts(),0);
 }
});

test('corrupt expired oversized or substituted prior receipt never resets dispatch identity',async()=>{
 for(const modify of [x=>x.metadata.expired=true,x=>x.bytes=Buffer.from('tampered'),x=>{x.bytes=Buffer.alloc(1048577);x.metadata.digest='sha256:'+hash(x.bytes);},x=>{const replacement=receipt(1,{toolsSha:'b'.repeat(40)});Object.assign(x,replacement);}]){
  const prior=receipt(1);modify(prior);const adapter=io({receipts:[prior],runs:[run(999)]});await assert.rejects(execute(2,adapter,'bad-receipt'),/receipt|identity|digest/);assert.equal(adapter.posts(),0);
 }
});

test('an explicitly skipped prior dispatch step permits exactly one fresh POST',async()=>{
 const adapter=io({jobs:{1:[job(1,{conclusion:'failure',steps:[{name:STEP,status:'completed',conclusion:'skipped'}]})]}});const {result}=await execute(2,adapter,'known-skipped');assert.equal(result.status,'confirmed');assert.equal(adapter.posts(),1);
});
