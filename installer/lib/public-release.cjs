'use strict';
// Admit public mirrors only from the exact already-published GitHub artifacts.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {verifyReleaseSource,repository}=require('./release.cjs');
const {digest}=require('../core/files.cjs');
const {verifyPayload,input}=require('./publish.cjs');
const {readZip}=require('../scripts/archives.cjs');
const REPO='TimothyMeadows/Hephaera',SIGNER=REPO+'/.github/workflows/publish-packages.yml';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function numeric(value){const text=String(value);if(!/^[1-9]\d*$/.test(text)||!Number.isSafeInteger(Number(text)))throw new Error('An exact positive GitHub database ID is required.');return Number(text);}
function selection(value){
 const x={...value};x.releaseId=numeric(x.releaseId);x.upstreamRunId=numeric(x.upstreamRunId);
 if(!/^[a-f0-9]{40}$/.test(x.sourceSha||'')||!/^[a-f0-9]{40}$/.test(x.upstreamToolsSha||'')||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?$/.test(x.version||''))throw new Error('Exact source, upstream tools and version are required.');
 return {version:x.version,sourceSha:x.sourceSha,releaseId:x.releaseId,upstreamRunId:x.upstreamRunId,upstreamToolsSha:x.upstreamToolsSha};
}
function defaultAdapter(){
 const gh=(args,binary=false)=>{try{return cp.execFileSync('gh',args,{encoding:binary?undefined:'utf8',windowsHide:true,timeout:120000,maxBuffer:67108864,stdio:['ignore','pipe','pipe']});}catch{throw new Error('GitHub public-candidate operation failed; no publication performed by admission.');}};
 return {getRun:id=>JSON.parse(gh(['api',`repos/${REPO}/actions/runs/${id}`])),getRelease:id=>JSON.parse(gh(['api',`repos/${REPO}/releases/${id}`])),listPublicRuns:async()=>{const all=[];for(let page=1;page<=10;page++){const r=JSON.parse(gh(['api',`repos/${REPO}/actions/workflows/publish-public-packages.yml/runs?event=workflow_dispatch&per_page=100&page=${page}`])).workflow_runs;all.push(...r);if(r.length<100)return all;}throw new Error('Public workflow history exceeds bounded discovery; explicit reconciliation is required.');},getPublicJobs:id=>JSON.parse(gh(['api',`repos/${REPO}/actions/runs/${id}/jobs?filter=all&per_page=100`])),getArtifacts:id=>JSON.parse(gh(['api',`repos/${REPO}/actions/runs/${id}/artifacts?per_page=100`])).artifacts,downloadZip:id=>gh(['api',`repos/${REPO}/actions/artifacts/${id}/zip`],true),download:a=>gh(['api',`repos/${REPO}/releases/assets/${a.id}`,'-H','Accept: application/octet-stream'],true),
 verify:(file,s)=>{let data;try{data=JSON.parse(gh(['attestation','verify',file,'--repo',REPO,'--signer-workflow',SIGNER,'--signer-digest',s.upstreamToolsSha,'--deny-self-hosted-runners','--format','json']));}catch{throw new Error('Upstream provenance verification is unavailable or failed.');}return data.some(x=>x.verificationResult?.statement?.predicateType==='https://slsa.dev/provenance/v1'&&new RegExp('^https://github\\.com/TimothyMeadows/Hephaera/actions/runs/'+s.upstreamRunId+'/attempts/[1-9][0-9]*$').test(x.verificationResult?.statement?.predicate?.runDetails?.metadata?.invocationId||''));},sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms))};
}
function names(version){return {npm:`timothymeadows-hephaera-${version}.tgz`,nuget:`Hephaera.${version}.nupkg`,setup:`hephaera-setup-${version}.zip`,manifest:`release-manifest-${version}.json`,checksums:`CHECKSUMS-${version}.txt`};}
function confined(root){
 root=path.resolve(root);let current=path.parse(root).root;
 for(const part of root.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('Linked candidate paths are unsupported.');}
 return root;
}
async function inspectUpstream(s,io,{wait=false}={}){
 let run;
 for(let attempt=0;attempt<31;attempt++){
  run=await io.getRun(s.upstreamRunId);
  if(run.id!==s.upstreamRunId||run.head_sha!==s.upstreamToolsSha||run.head_branch!=='main'||run.path!=='.github/workflows/publish-packages.yml'||run.event!=='workflow_dispatch'||run.repository?.full_name!==REPO)throw new Error('Upstream workflow identity differs.');
  if(run.status==='completed')break;
  if(!wait||attempt===30)throw new Error('The upstream GitHub publication is not complete.');
  await io.sleep(5000);
 }
 if(run.conclusion!=='success')throw new Error('The upstream GitHub publication did not succeed.');
 const release=await io.getRelease(s.releaseId),expected=Object.values(names(s.version)).sort();
 if(release.id!==s.releaseId||release.tag_name!==s.version||release.draft!==false||release.prerelease!==s.version.includes('-')||!Array.isArray(release.assets)||JSON.stringify(release.assets.map(a=>a.name).sort())!==JSON.stringify(expected))throw new Error('Published upstream release identity or inventory differs.');
 for(const a of release.assets)if(numeric(a.id)!==a.id||!Number.isSafeInteger(a.size)||a.size<=0||a.size>67108864||!/^sha256:[a-f0-9]{64}$/.test(a.digest||''))throw new Error('Invalid published asset identity, digest or limit.');
 return {run,release};
}
function manifestAt(sourceRoot,s){const m=verifyReleaseSource(confined(sourceRoot),s.version);if(m.revision!==s.sourceSha)throw new Error('Original package source differs.');return m;}
function artifactFiles(directory,s){return Object.fromEntries(Object.entries(names(s.version)).map(([key,name])=>[key,path.join(directory,'artifacts',name)]));}
function checkedFiles(directory,s,release){
 confined(path.join(directory,'artifacts'));
 const files=artifactFiles(directory,s);
 for(const [key,file] of Object.entries(files)){const metadata=release.assets.find(a=>a.name===path.basename(file));if(fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile()||sha(fs.readFileSync(file))!==metadata.digest.slice(7)||fs.statSync(file).size!==metadata.size)throw new Error('Candidate bytes differ from the published upstream asset: '+key);}
 return files;
}
function readCandidate(directory,s,manifest,release){
 const files=checkedFiles(directory,s,release),rawManifest=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
 if(!fs.readFileSync(files.manifest).equals(rawManifest))throw new Error('Published source manifest differs from the exact original source.');
 const expectedChecksums=['npm','nuget','setup','manifest'].map(k=>sha(fs.readFileSync(files[k]))+'  '+path.basename(files[k])).join('\n')+'\n';
 if(fs.readFileSync(files.checksums,'utf8')!==expectedChecksums)throw new Error('Published checksums or inventory differ.');
 const receipt={schemaVersion:1,version:s.version,sourceDirty:false,manifest,manifestSha256:digest(manifest),manifestFileSha256:sha(rawManifest),artifacts:Object.fromEntries(['npm','nuget','setup'].map(k=>[k,{file:'artifacts/'+path.basename(files[k]),sha256:sha(fs.readFileSync(files[k]))}]))};
 verifyPayload(receipt,{npm:files.npm,nuget:files.nuget},manifest);
 return {files,receipt};
}
async function preparePublished(directory,{selected,sourceRoot,io=defaultAdapter()}={}){
 const s=selection(selected),manifest=manifestAt(sourceRoot,s);directory=confined(directory);
 if(fs.existsSync(directory)&&(!fs.statSync(directory).isDirectory()||fs.readdirSync(directory).length))throw new Error('Use a new empty public-candidate directory; preserve previous evidence.');
 const {release}=await inspectUpstream(s,io,{wait:true});fs.mkdirSync(path.join(directory,'artifacts'),{recursive:true});
 for(const a of release.assets){const bytes=await io.download(a);if(!Buffer.isBuffer(bytes)||bytes.length!==a.size||sha(bytes)!==a.digest.slice(7))throw new Error('Downloaded upstream artifact differs.');fs.writeFileSync(path.join(directory,'artifacts',a.name),bytes,{flag:'wx'});}
 const checked=checkedFiles(directory,s,release);
 // Authenticate opaque bytes before archive parsing or decompression.
 for(const file of Object.values(checked))if(await io.verify(file,s)!==true)throw new Error('Upstream provenance does not bind the approved publishing run.');
 const {receipt}=readCandidate(directory,s,manifest,release);
 const admission={schemaVersion:1,repository,selection:s,upstreamAssets:release.assets.map(({id,name,digest,size})=>({id,name,digest,size})).sort((a,b)=>a.name.localeCompare(b.name)),manifestSha256:receipt.manifestSha256,manifestFileSha256:receipt.manifestFileSha256};
 fs.writeFileSync(path.join(directory,'package-build.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(directory,'public-admission.json'),JSON.stringify(admission,null,2)+'\n',{flag:'wx'});
 return {directory,admission,receipt};
}
async function verifyPublished(directory,{selected,sourceRoot,io=defaultAdapter()}={}){
 const s=selection(selected),manifest=manifestAt(sourceRoot,s);directory=confined(fs.realpathSync(confined(directory)));
 const admissionFile=path.join(directory,'public-admission.json');if(fs.lstatSync(admissionFile).isSymbolicLink())throw new Error('Linked admission state.');const old=JSON.parse(fs.readFileSync(admissionFile,'utf8'));
 if(old.schemaVersion!==1||old.repository!==repository||JSON.stringify(old.selection)!==JSON.stringify(s))throw new Error('Candidate approval identity differs.');
 const {release}=await inspectUpstream(s,io),observed=release.assets.map(({id,name,digest,size})=>({id,name,digest,size})).sort((a,b)=>a.name.localeCompare(b.name));
 if(JSON.stringify(old.upstreamAssets)!==JSON.stringify(observed))throw new Error('Upstream assets changed after preparation.');
 if(fs.lstatSync(path.join(directory,'package-build.json')).isSymbolicLink())throw new Error('Linked build receipt.');
 const checked=checkedFiles(directory,s,release);
 for(const file of Object.values(checked))if(await io.verify(file,s)!==true)throw new Error('Upstream provenance revalidation failed.');
 const {receipt}=readCandidate(directory,s,manifest,release),stored=input(directory).receipt;
 if(digest(stored)!==digest(receipt)||old.manifestSha256!==receipt.manifestSha256||old.manifestFileSha256!==receipt.manifestFileSha256)throw new Error('Prepared receipt identity differs.');
 return {directory,admission:old,receipt};
}

async function recoverPublicJournal(directory,{selected,currentRunId,currentAttempt=1,io=defaultAdapter()}={}){
 const s=selection(selected),runId=numeric(currentRunId),attempt=numeric(currentAttempt);directory=confined(directory);
 const title=`Public registries ${s.version} release ${s.releaseId} from `;
 const prior=(await io.listPublicRuns()).filter(r=>typeof r.display_title==='string'&&r.display_title.startsWith(title)&&(r.id<runId||r.id===runId&&attempt>1)).sort((a,b)=>b.id-a.id);
 for(const r of prior){
  if(r.head_branch!=='main'||r.path!=='.github/workflows/publish-public-packages.yml'||r.repository?.full_name!==REPO)throw new Error('Prior public workflow identity differs.');
  if(r.id!==runId&&r.status!=='completed')throw new Error('An earlier public publication is still active; never publish concurrently.');
  const jobs=await io.getPublicJobs(r.id);
  if(!Number.isSafeInteger(jobs.total_count)||jobs.total_count>100||!Array.isArray(jobs.jobs)||jobs.jobs.length!==jobs.total_count)throw new Error('Prior job history exceeds bounded reconciliation or is incomplete.');
  const writes=[];
  for(const job of jobs.jobs){
   if(!['prepare','publish'].includes(job.name))throw new Error('Unknown prior public job; reconcile before retrying.');
   if(job.name!=='publish')continue;
   const jobAttempt=numeric(job.run_attempt);
   if(r.id===runId&&jobAttempt>=attempt)continue;
   if(job.conclusion==='skipped')continue;
   if(!Array.isArray(job.steps))throw new Error('Prior publisher history unavailable; reconcile before retrying.');
   if(job.steps.filter(step=>step.name==='Publish selected public registries').length!==1)throw new Error('Prior publishing step history unavailable; reconcile before retrying.');
   for(const step of job.steps)if(step.name==='Publish selected public registries'&&step.conclusion!=='skipped'&&!['pending','queued'].includes(step.status))writes.push(jobAttempt);
  }
  const artifacts=(await io.getArtifacts(r.id)).filter(a=>/^public-registry-receipt-attempt-[1-9][0-9]*$/.test(a.name)&&(! (r.id===runId)||Number(a.name.split('-').at(-1))<attempt)).sort((a,b)=>Number(b.name.split('-').at(-1))-Number(a.name.split('-').at(-1)));
  for(const a of artifacts){
   if(a.expired||a.size_in_bytes>1048576||!/^sha256:[a-f0-9]{64}$/.test(a.digest||''))throw new Error('Prior public receipt unavailable or outside limits; reconcile before any retry.');
   const zip=await io.downloadZip(numeric(a.id));if(!Buffer.isBuffer(zip)||zip.length>1048576)throw new Error('Prior receipt container exceeds bounded reconciliation.');if(sha(zip)!==a.digest.slice(7))throw new Error('Prior receipt container digest differs.');
   const entries=readZip(zip,{maxExpandedBytes:1048576}),bytes=entries.get('public-publication.json');
   if(!bytes)continue;
   const receiptAttempt=Number(a.name.split('-').at(-1));
   if(writes.some(n=>n>receiptAttempt))throw new Error('A newer public write may have started without a preserved receipt; manual reconciliation is required.');
   JSON.parse(bytes); // Schema/identity/history validation remains owned by the public publisher.
   const journal=path.join(directory,'public-publication.json'),origin=path.join(directory,'public-recovery.json');
   if(fs.existsSync(journal)){
    if(fs.lstatSync(journal).isSymbolicLink())throw new Error('Linked public journal.');
    if(!fs.readFileSync(journal).equals(bytes)){
     if(!fs.existsSync(origin)||fs.lstatSync(origin).isSymbolicLink())throw new Error('Existing local publication evidence requires reconciliation.');
     const previous=JSON.parse(fs.readFileSync(origin,'utf8'));if(sha(fs.readFileSync(journal))!==previous.seedSha256)throw new Error('Local journal advanced; do not replace attempt history.');
     fs.writeFileSync(journal,bytes);
    }
   }else fs.writeFileSync(journal,bytes,{flag:'wx'});
   const proof={schemaVersion:1,priorRunId:r.id,priorAttempt:receiptAttempt,artifactId:a.id,artifactSha256:sha(zip),seedSha256:sha(bytes)};
   if(fs.existsSync(origin)&&fs.lstatSync(origin).isSymbolicLink())throw new Error('Linked public recovery state.');fs.writeFileSync(origin,JSON.stringify(proof,null,2)+'\n');return proof;
  }
  if(writes.length)throw new Error('An earlier public write may have started without a preserved receipt; manual reconciliation is required.');
 }
 return {schemaVersion:1,priorRunId:null,seedSha256:null};
}
module.exports={preparePublished,verifyPublished,recoverPublicJournal,inspectUpstream,selection,names};

