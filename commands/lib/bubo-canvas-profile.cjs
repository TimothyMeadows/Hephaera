'use strict';
// Typed canvas selection admission only; never installs, launches or approves.
const fs=require('node:fs'),path=require('node:path');
const runtime=require('./bubo-runtime.cjs');
const fail=message=>{throw Error(message);};
const HASH=/^[a-f0-9]{64}$/,ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
function fields(value,names,label){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(name=>!names.includes(name))||names.some(name=>!Object.hasOwn(value,name)))fail('Exact '+label+' fields required.');}
function relative(value){if(typeof value!=='string'||!value||/[\\:\x00-\x20]/.test(value)||value.startsWith('/')||value.split('/').some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)))fail('Canonical relative canvas path required.');return value;}
function json(root,value){
 relative(value);const file=runtime.projectPath(root,value);runtime.components(file);const before=fs.lstatSync(file);
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size<2||before.size>65536)fail('Canvas JSON must be bounded ordinary2..65536bytes before read.');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));let bytes;
 try{const opened=fs.fstatSync(fd);if(opened.ino!==before.ino||opened.size!==before.size||opened.nlink!==1)fail('Canvas JSON descriptor changed.');const buffer=Buffer.alloc(65537);let count=0,n;while(count<buffer.length&&(n=fs.readSync(fd,buffer,count,buffer.length-count,null)))count+=n;if(count!==before.size||count>65536)fail('Canvas JSON changed/exceeded budget.');const after=fs.fstatSync(fd);if(after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs)fail('Canvas JSON changed during read.');bytes=buffer.subarray(0,count);}finally{fs.closeSync(fd);}
 const after=fs.lstatSync(file);if(after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||after.nlink!==1)fail('Canvas JSON path changed.');
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function file(root,value,reference,kind='input',sized=false){
 fields(value,sized?['path','sha256','bytes']:['path','sha256'],'canvas reference');relative(value.path);if(!HASH.test(value.sha256||''))fail('Exact canvas hash required.');
 const target=runtime.projectPath(root,value.path);runtime.components(target);const stat=fs.lstatSync(target);
 const cap=sized?536870912:1048576;if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size<1||stat.size>cap||sized&&(!Number.isSafeInteger(value.bytes)||value.bytes!==stat.size))fail('Bounded ordinary canvas reference required before hash.');
 reference(value.path,kind,value.sha256);return target;
}
function collect({root,task,asset,version,mode,profileFile,lineageFile,reference,tool}){
 if(!profileFile&&!lineageFile)return{inputs:[]};
 if(!profileFile||!lineageFile||mode!=='multi-view-four'||![task,asset,version].every(value=>ID.test(value||'')&&value!=='..'))fail('Paired fresh/registered four-view canvas selection required.');
 const state='.hephaera/.cache/tasks/'+task;
 for(const value of[profileFile,lineageFile])if(!relative(value).startsWith(state+'/')||!value.endsWith('.json'))fail('Canvas selectors must remain in exact active task.');
 const profile=json(root,profileFile),lineage=json(root,lineageFile);
 const required=['schemaVersion','id','mode','baseToolchain','executable','files','maxMattingChildren'];fields(profile,Object.hasOwn(profile,'existingRuntimeDependencies')?[...required,'existingRuntimeDependencies']:required,'canvas profile');
 if(profile.schemaVersion!==1||profile.id!=='birefnet-source-canvas-v1'||profile.mode!=='multi-view-four'||profile.maxMattingChildren!==4||!Array.isArray(profile.files)||profile.files.length<1||profile.files.length>32)fail('Explicit bounded source-canvas profile required.');
 fields(lineage,['schemaVersion','kind','decision','task','asset','sourceVersion','targetVersion','authorization','inputApproval','priorManifest','priorStateRoot','priorStaging','priorAttempts','priorDirectories','priorHistoryCounts','stageLimits'],'canvas lineage');
 if(lineage.schemaVersion!==1||lineage.kind!=='proof-to-model-stage-lineage'||lineage.decision!=='approved'||lineage.task!==task||lineage.asset!==asset||lineage.targetVersion!==version||!ID.test(lineage.sourceVersion||'')||lineage.sourceVersion.toLowerCase()===version.toLowerCase())fail('Canvas lineage scope changed.');
 const priorState=state+'/proof-to-model/'+asset+'/'+lineage.sourceVersion,priorStaging='.art-staging/proof-to-model/'+asset+'/'+lineage.sourceVersion;
 if(lineage.priorStateRoot!==priorState||lineage.priorStaging!==priorStaging)fail('Lineage must name exact prior roots, never a parent workspace.');
 reference(profileFile);reference(lineageFile);file(root,profile.baseToolchain,reference);file(root,lineage.authorization,reference,'policy');file(root,lineage.inputApproval,reference,'policy');
 if(lineage.priorManifest){if(lineage.priorManifest.path!==priorState+'/manifest.json')fail('Exact prior manifest required.');file(root,lineage.priorManifest,reference);}else if(fs.existsSync(runtime.projectPath(root,priorState+'/manifest.json')))fail('Existing predecessor cannot be omitted.');
 fields(profile.executable,['path','sha256','bytes'],'canvas executable');relative(profile.executable.path);
 const bundle=path.posix.dirname(profile.executable.path),seen=new Set();let bytes=0,executables=0;
 for(const entry of profile.files){if(!entry||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||bytes+entry.bytes>536870912)fail('Canvas bundle512MiB budget exceeded before hash.');relative(entry.path);const key=entry.path.toLowerCase();if(seen.has(key)||!entry.path.startsWith(bundle+'/'))fail('Canvas bundle alias/escape.');seen.add(key);bytes+=entry.bytes;
  if(entry.path===profile.executable.path){if(entry.sha256!==profile.executable.sha256||entry.bytes!==profile.executable.bytes)fail('Executable identity differs from bundle.');executables++;file(root,entry,(_path,_kind,hash)=>{const absolute=runtime.projectPath(root,entry.path);tool(absolute,true);if(runtime.hash(absolute)!==hash)fail('Selected canvas executable changed.');},'input',true);}else file(root,entry,reference,'input',true);
 }
 if(executables!==1)fail('Canvas executable must occur exactly once.');
 const runtimes=profile.existingRuntimeDependencies||[];if(!Array.isArray(runtimes)||Object.hasOwn(profile,'existingRuntimeDependencies')&&(runtimes.length<1||runtimes.length>3))fail('Bounded existing CUDA dependency list required.');
 const parents=new Set(),runtimeNames=new Set();for(const dependency of runtimes){fields(dependency,['absolutePath','sha256','bytes'],'existing CUDA dependency');if(process.platform!=='win32'||typeof dependency.absolutePath!=='string'||!HASH.test(dependency.sha256||'')||!Number.isSafeInteger(dependency.bytes)||dependency.bytes<1||dependency.bytes>536870912||!/^([A-Za-z]):\/[^:\\]+\/CUDA\/v13\.2\/bin\/x64\/(cublas64_13|cublasLt64_13|cudart64_13)\.dll$/.test(dependency.absolutePath)||dependency.absolutePath.split('/').slice(1).some(part=>!part||part==='.'||part==='..'||/[.\s]$/.test(part)||/[\x00-\x1f]/.test(part)))fail('Exact existing CUDA13.2 registered tool dependency required.');
  const absolute=path.resolve(dependency.absolutePath),name=path.basename(absolute).toLowerCase();if(runtimeNames.has(name)||profile.files.some(entry=>path.posix.basename(entry.path).toLowerCase()===name))fail('CUDA duplicate/shadow basename refused.');runtimeNames.add(name);parents.add(path.dirname(absolute).toLowerCase());runtime.components(absolute);const stat=fs.lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size!==dependency.bytes)fail('Existing CUDA dependency alias/bytes changed.');tool(absolute,true);if(runtime.hash(absolute)!==dependency.sha256)fail('Existing CUDA dependency hash changed.');
 }if(parents.size>1)fail('Existing CUDA dependencies must share one exact parent.');
 return{inputs:[bundle,priorState,priorStaging]};
}
module.exports={collect};
