#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {selection}=require('../lib/public-release.cjs');
const {readZip}=require('./archives.cjs');
const REPO='TimothyMeadows/Hephaera',ROOT=path.resolve(__dirname,'../..');
const STEP='Dispatch the canonical public publishing workflow once';
function adapter(){const gh=(args,binary=false)=>{try{return cp.execFileSync('gh',args,{encoding:binary?undefined:'utf8',windowsHide:true,timeout:120000,maxBuffer:2097152,stdio:['ignore','pipe','pipe']});}catch{throw new Error('GitHub public-workflow dispatch/read failed; reconcile its journal before retry.');}};return {get:endpoint=>JSON.parse(gh(['api',endpoint])),download:endpoint=>gh(['api',endpoint],true),post:(endpoint,file)=>gh(['api','--method','POST',endpoint,'--input',file]),sleep:ms=>new Promise(r=>setTimeout(r,ms))};}
async function pages(io,endpoint,key){
 const result=[],ids=new Set();let total;
 for(let page=1;page<=100;page++){
  const data=await io.get(endpoint+(endpoint.includes('?')?'&':'?')+'per_page=100&page='+page),items=data[key];
  if(!Array.isArray(items)||items.length>100||data.total_count!==undefined&&(!Number.isSafeInteger(data.total_count)||data.total_count<0))throw new Error('Incomplete dispatch recovery pagination; reconcile manually.');
  if(data.total_count!==undefined){if(total!==undefined&&data.total_count!==total)throw new Error('Dispatch recovery listing changed; reconcile manually.');total=data.total_count;}
  for(const item of items){if(!Number.isSafeInteger(item.id)||item.id<=0||ids.has(item.id))throw new Error('Dispatch recovery listing has duplicate or invalid IDs; reconcile manually.');ids.add(item.id);}
  result.push(...items);
  if(total!==undefined&&result.length>total)throw new Error('Incomplete dispatch recovery listing; do not repeat it.');
  if(total!==undefined&&result.length===total)return result;
  if(items.length<100){if(total!==undefined&&result.length<total)throw new Error('Incomplete dispatch recovery listing; do not repeat it.');return result;}
 }
 throw new Error('Dispatch recovery pagination bound reached; reconcile manually.');
}
function validJournal(old,request,tools){
 if(old.schemaVersion!==1||old.toolsSha!==tools||!['intent','confirmed','needs-reconciliation'].includes(old.status)||JSON.stringify(old.request)!==JSON.stringify(request)||!Array.isArray(old.previousRunIds)||old.previousRunIds.some(id=>!Number.isSafeInteger(id)||id<=0)||old.runId!==undefined&&(!Number.isSafeInteger(old.runId)||old.runId<=0))throw new Error('Existing dispatch intent has a different identity.');
 return old;
}
async function priorIntent(io,s,currentAttempt,request,tools){
 if(currentAttempt===1)return null;
 const artifacts=await pages(io,`repos/${REPO}/actions/runs/${s.upstreamRunId}/artifacts`,'artifacts'),possible=[];
 for(let attempt=1;attempt<currentAttempt;attempt++){
  const jobs=await pages(io,`repos/${REPO}/actions/runs/${s.upstreamRunId}/attempts/${attempt}/jobs`,'jobs'),dispatchJobs=jobs.filter(job=>job.name==='public-dispatch');
  if(dispatchJobs.length!==1)throw new Error('Prior dispatch job history is unknown; reconcile manually.');
  const job=dispatchJobs[0];if(job.run_attempt!==attempt)throw new Error('Prior dispatch attempt identity differs.');
  if(job.status==='completed'&&job.conclusion==='skipped')continue;
  const steps=Array.isArray(job.steps)?job.steps.filter(step=>step.name===STEP):[];
  if(steps.length!==1)throw new Error('Prior dispatch write-step history is unknown; do not repeat it.');
  if(steps[0].status==='completed'&&steps[0].conclusion==='skipped')continue;
  if(!['completed','in_progress'].includes(steps[0].status))throw new Error('Prior dispatch write-step state is unknown; reconcile manually.');
  const matches=artifacts.filter(artifact=>artifact.name==='public-registry-dispatch-attempt-'+attempt);
  if(matches.length!==1)throw new Error('Prior possible dispatch has no unique receipt; reconcile manually.');
  const artifact=matches[0];
  if(artifact.expired!==false||!Number.isSafeInteger(artifact.id)||artifact.id<=0||!Number.isSafeInteger(artifact.size_in_bytes)||artifact.size_in_bytes<=0||artifact.size_in_bytes>1048576||!/^sha256:[a-f0-9]{64}$/.test(artifact.digest||''))throw new Error('Prior dispatch receipt is unavailable; reconcile manually.');
  possible.push({attempt,artifact});
 }
 if(!possible.length)return null;
 const {attempt,artifact}=possible.at(-1);
 if(typeof io.download!=='function')throw new Error('Prior dispatch receipt download unavailable; reconcile manually.');
 const bytes=await io.download(`repos/${REPO}/actions/artifacts/${artifact.id}/zip`);
 if(!Buffer.isBuffer(bytes)||bytes.length>1048576||'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex')!==artifact.digest)throw new Error('Prior dispatch receipt digest differs; retain original history.');
 const entries=readZip(bytes,{maxExpandedBytes:1048576});
 if(!entries.has('public-dispatch.json')||[...entries.keys()].some(name=>!['public-dispatch.json','public-dispatch-request.json'].includes(name)))throw new Error('Prior dispatch receipt inventory differs.');
 const journal=entries.get('public-dispatch.json');validJournal(JSON.parse(journal),request,tools);
 if(entries.has('public-dispatch-request.json')&&JSON.stringify(JSON.parse(entries.get('public-dispatch-request.json')))!==JSON.stringify(request))throw new Error('Prior dispatch request identity differs.');
 return {bytes:journal,attempt,artifactId:artifact.id,digest:artifact.digest};
}
async function dispatch(directory,{selected,registrySelection='both',npmAuthMode='trusted',io=adapter()}={}){
 const s=selection(selected),tools=process.env.HEPHAERA_PUBLIC_TOOLS_SHA,git=(...args)=>cp.execFileSync('git',['-C',ROOT,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
 if(process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_REF!=='refs/heads/main'||tools!==s.upstreamToolsSha||git('rev-parse','HEAD')!==tools||git('status','--porcelain','--untracked-files=normal')||!/^https:\/\/github\.com\/TimothyMeadows\/Hephaera(?:\.git)?\/?$/i.test(git('remote','get-url','origin')))throw new Error('Dispatch requires the exact reviewed clean main workflow tools.');
 if(!['npm','nuget','both'].includes(registrySelection)||!['trusted','bootstrap'].includes(npmAuthMode))throw new Error('Invalid public registry/auth selection.');
 if((await io.get(`repos/${REPO}/commits/main`)).sha!==tools)throw new Error('Main advanced; review and launch public catch-up explicitly.');
 const release=await io.get(`repos/${REPO}/releases/${s.releaseId}`);if(release.id!==s.releaseId||release.draft!==false||release.tag_name!==s.version||release.prerelease!==s.version.includes('-'))throw new Error('GitHub release is not published with the selected identity.');
 const upstream=await io.get(`repos/${REPO}/actions/runs/${s.upstreamRunId}`);if(upstream.id!==s.upstreamRunId||upstream.head_sha!==tools||upstream.head_branch!=='main'||upstream.path!=='.github/workflows/publish-packages.yml')throw new Error('Upstream workflow identity differs.');
 const workflow=await io.get(`repos/${REPO}/actions/workflows/publish-public-packages.yml`);if(workflow.state!=='active'||workflow.path!=='.github/workflows/publish-public-packages.yml')throw new Error('Canonical public workflow is unavailable.');
 const rawAttempt=process.env.GITHUB_RUN_ATTEMPT||'1',currentAttempt=Number(rawAttempt);if(!/^[1-9]\d*$/.test(rawAttempt)||!Number.isSafeInteger(currentAttempt)||currentAttempt>100)throw new Error('Dispatch attempt history exceeds its known bound.');
 const endpoint=`repos/${REPO}/actions/workflows/${workflow.id}/runs?event=workflow_dispatch`,title=`Public registries ${s.version} release ${s.releaseId} from ${s.upstreamRunId} ${registrySelection}`;
 const request={ref:'main',inputs:{version:s.version,source_sha:s.sourceSha,release_id:String(s.releaseId),upstream_run_id:String(s.upstreamRunId),upstream_tools_sha:s.upstreamToolsSha,registry_selection:registrySelection,npm_auth_mode:npmAuthMode}};
 directory=path.resolve(directory);let current=path.parse(directory).root;for(const part of directory.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('Linked dispatch state path.');}fs.mkdirSync(directory,{recursive:true});
 const journal=path.join(directory,'public-dispatch.json'),requestFile=path.join(directory,'public-dispatch-request.json');
 const match=r=>r.display_title===title&&r.head_sha===tools&&r.head_branch==='main'&&r.created_at>=upstream.created_at;
 const restored=await priorIntent(io,s,currentAttempt,request,tools);
 if(restored&&!fs.existsSync(journal))fs.writeFileSync(journal,restored.bytes,{flag:'wx'});
 const existing=(await pages(io,endpoint,'workflow_runs')).filter(match);
 if(fs.existsSync(journal)){
  if(fs.lstatSync(journal).isSymbolicLink())throw new Error('Linked dispatch journal.');const old=validJournal(JSON.parse(fs.readFileSync(journal,'utf8')),request,tools);
  if(restored){const prior=validJournal(JSON.parse(restored.bytes),request,tools);if(prior.runId!==undefined&&old.runId!==undefined&&prior.runId!==old.runId)throw new Error('Restored and local dispatch identities differ.');}
  const found=existing.filter(r=>!old.previousRunIds.includes(r.id));if(found.length!==1||old.runId!==undefined&&old.runId!==found[0].id)throw new Error('Prior dispatch is uncertain; do not repeat it.');const resolved={...old,status:'confirmed',runId:found[0].id,url:found[0].html_url,...restored?{restoredFrom:{upstreamRunId:s.upstreamRunId,attempt:restored.attempt,artifactId:restored.artifactId,digest:restored.digest}}:{}};fs.writeFileSync(journal,JSON.stringify(resolved,null,2)+'\n');return resolved;
 }
 if(existing.length)throw new Error('A public run for this source/selection already exists; use its explicit recovery instead of duplicating dispatch.');
 // Record before the only write. A lost response never causes an automatic POST retry.
 const state={schemaVersion:1,status:'intent',request,toolsSha:tools,previousRunIds:existing.map(r=>r.id),at:new Date().toISOString()};fs.writeFileSync(journal,JSON.stringify(state,null,2)+'\n',{flag:'wx'});fs.writeFileSync(requestFile,JSON.stringify(request,null,2)+'\n',{flag:'wx'});
 try{await io.post(`repos/${REPO}/actions/workflows/${workflow.id}/dispatches`,requestFile);}catch{state.status='needs-reconciliation';fs.writeFileSync(journal,JSON.stringify(state,null,2)+'\n');throw new Error('Public dispatch is uncertain; reconcile public-dispatch.json before retry.');}
 let found=[];for(let attempt=0;attempt<12;attempt++){found=(await pages(io,endpoint,'workflow_runs')).filter(r=>match(r)&&!state.previousRunIds.includes(r.id));if(found.length===1)break;await io.sleep(1000);}
 state.status=found.length===1?'confirmed':'needs-reconciliation';if(found.length===1){state.runId=found[0].id;state.url=found[0].html_url;}fs.writeFileSync(journal,JSON.stringify(state,null,2)+'\n');if(state.status!=='confirmed')throw new Error('Dispatch accepted but run identity is unconfirmed; reconcile before retry.');return state;
}
if(require.main===module){const args=process.argv.slice(2);if(args.length!==2||args[1]!=='--execute'){console.error('Usage: dispatch-public-release.cjs JOURNAL_DIRECTORY --execute');process.exitCode=1;}else dispatch(args[0],{selected:{version:process.env.PUBLIC_VERSION,sourceSha:process.env.PUBLIC_SOURCE_SHA,releaseId:process.env.PUBLIC_RELEASE_ID,upstreamRunId:process.env.GITHUB_RUN_ID,upstreamToolsSha:process.env.HEPHAERA_PUBLIC_TOOLS_SHA},registrySelection:process.env.PUBLIC_REGISTRY_SELECTION||'both',npmAuthMode:process.env.PUBLIC_NPM_AUTH_MODE||'trusted'}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={dispatch};
