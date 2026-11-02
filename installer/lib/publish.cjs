'use strict';
// Explicit two-feed publication; credentials remain process-local and unrecorded.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function artifactPath(root, entry) {
  if (!entry || typeof entry.file !== 'string' || !entry.file.startsWith('artifacts/') || entry.file.includes(String.fromCharCode(92)) || path.isAbsolute(entry.file) || entry.file.split('/').some(x => !x || x === '..' || x === '.' || x.includes(':'))) throw new Error('Invalid artifact path.');
  let current=root;
  for(const part of entry.file.split('/')){ current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw new Error('Linked artifact path.'); }
  if(!fs.statSync(current).isFile()||hash(fs.readFileSync(current))!==entry.sha256)throw new Error('Artifact digest mismatch.');
  return current;
}
function verifyPayload(receipt,files,expectedManifest) {
  const {digest}=require('../core/files.cjs');
  const expected=expectedManifest||require('./release.cjs').createManifest(path.resolve(__dirname,'../..'));
  if(digest(receipt.manifest)!==digest(expected)||expected.sourceDirty)throw new Error('Package receipt does not match the verified clean release checkout.');
  const bytes=Buffer.from(JSON.stringify(expected,null,2)+'\n');
  if(receipt.manifestSha256!==digest(expected)||receipt.manifestFileSha256!==hash(bytes))throw new Error('Release receipt manifest digests disagree.');
  const archives=require('../scripts/archives.cjs');
  for(const channel of ['npm','nuget']){
    const entries=channel==='npm'?archives.readTarGzip(fs.readFileSync(files[channel])):archives.readZip(fs.readFileSync(files[channel]));
    const manifestName=[...entries.keys()].filter(n=>n.endsWith('/core/release-manifest.json'));
    if(manifestName.length!==1||!entries.get(manifestName[0]).equals(bytes))throw new Error('Embedded '+channel+' manifest differs from selected release.');
    const prefix=manifestName[0].slice(0,-'release-manifest.json'.length);
    const core=[...entries.keys()].filter(n=>n.startsWith(prefix)&&n!==manifestName[0]);
    if(core.length!==Object.keys(expected.coreFiles).length)throw new Error('Embedded core inventory differs.');
    for(const [name,digest_]of Object.entries(expected.coreFiles))if(!entries.has(prefix+name)||hash(entries.get(prefix+name))!==digest_)throw new Error('Embedded '+channel+' core hash differs.');
    if(channel==='npm'){const metadata=JSON.parse(entries.get('package/package.json'));if(metadata.name!=='@timothymeadows/hephaera'||metadata.version!==receipt.version)throw new Error('npm package identity differs.');}
    else {const names=[...entries.keys()].filter(n=>n.endsWith('.nuspec'));if(names.length!==1)throw new Error('NuGet metadata differs.');const text=entries.get(names[0]).toString();if(!/<id>Hephaera<\/id>/i.test(text)||!text.includes('<version>'+receipt.version+'</version>'))throw new Error('NuGet package identity differs.');}
  }
  if(receipt.artifacts.setup){
    const entries=archives.readZip(fs.readFileSync(artifactPath(path.dirname(path.dirname(files.npm)),receipt.artifacts.setup)));
    const setup=JSON.parse(entries.get('setup-release.json'));
    if(setup.version!==receipt.version||setup.manifestSha256!==digest(expected)||setup.manifestFileSha256!==hash(bytes))throw new Error('Setup bundle release identity differs.');
    const names=['README.md','setup-nuget.sh','setup-nuget.ps1','setup-local-tool.cjs','NuGet.Hephaera.config','npmrc.example'];
    if(JSON.stringify(Object.keys(setup.files).sort())!==JSON.stringify(names.sort()))throw new Error('Setup bundle inventory differs.');
    for(const name of names){
      const committed=cp.execFileSync('git',['-C',path.resolve(__dirname,'../..'),'show',expected.revision+':installer/setup/'+name],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      if(!entries.has(name)||hash(entries.get(name))!==setup.files[name]||hash(committed)!==setup.files[name])throw new Error('Setup bundle source bytes differ.');
    }
  }
}
function input(directory) {
  directory = fs.realpathSync(directory);
  const receipt = JSON.parse(fs.readFileSync(path.join(directory,'package-build.json'),'utf8'));
  if (receipt.schemaVersion !== 1 || receipt.sourceDirty || receipt.manifest?.sourceDirty || receipt.manifest?.repository !== 'https://github.com/TimothyMeadows/Hephaera.git' || receipt.version !== receipt.manifest?.version || !/^[a-f0-9]{40}$/.test(receipt.manifest?.revision || '') || !/^[a-f0-9]{40}$/.test(receipt.manifest?.tree || '')) throw new Error('Only an identified clean release build can publish.');
  const files = {};
  for (const channel of ['npm','nuget']) {
    const entry = receipt.artifacts?.[channel];
    const file = artifactPath(directory, entry);
    files[channel] = file;
  }
  return { directory,receipt,files };
}
function npmCommand(args) {
  if (process.platform === 'win32') throw new Error('Registry publication uses the Linux release workflow.');
  const r = cp.spawnSync('npm',args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:1048576});
  if (r.error) throw new Error('npm registry operation failed.');
  return r;
}
function credentials() {
  const token = process.env.GITHUB_TOKEN || process.env.NODE_AUTH_TOKEN;
  const actor = process.env.GITHUB_ACTOR;
  if (!token || !actor) throw new Error('Publishing requires the authorized workflow token and actor.');
  return {Authorization:'Basic '+Buffer.from(actor+':'+token).toString('base64')};
}
function ownedUrl(value) {
  const u = new URL(value);
  if (u.origin !== 'https://nuget.pkg.github.com' || !u.pathname.toLowerCase().startsWith('/timothymeadows/') || u.username || u.password) throw new Error('Unexpected NuGet feed URL.');
  return u.href;
}
async function getNuget(version) {
  const headers=credentials();
  const index=await fetch('https://nuget.pkg.github.com/TimothyMeadows/index.json',{headers,signal:AbortSignal.timeout(30000)});
  if (!index.ok) throw new Error('Cannot authenticate/read the selected NuGet feed.');
  const services=await index.json();
  const base=services.resources?.find(r=>r['@type']==='PackageBaseAddress/3.0.0')?.['@id'];
  if (!base) throw new Error('NuGet feed has no verified package-download resource.');
  const id='hephaera',v=version.toLowerCase();
  const directory=new URL(ownedUrl(base));
  if(!directory.pathname.endsWith('/'))directory.pathname+='/';
  const url=ownedUrl(new URL(`${id}/${v}/${id}.${v}.nupkg`,directory).href);
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(60000)});
  if(response.status===404)return null;
  if(!response.ok)throw new Error('NuGet package readback failed.');
  const size=Number(response.headers.get('content-length')||0);
  if(size>64*1024*1024)throw new Error('Unexpected NuGet artifact size.');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>64*1024*1024)throw new Error('Unexpected NuGet artifact size.');
  return hash(bytes);
}
async function lookup(channel,version) {
  if(channel==='nuget')return getNuget(version);
  const r=npmCommand(['view',`@timothymeadows/hephaera@${version}`,'dist.integrity','--json','--registry=https://npm.pkg.github.com']);
  if(r.status!==0){ if(/E404|"code"\s*:\s*"E404"/.test(r.stderr+r.stdout))return null; throw new Error('npm package readback failed; check registry access.'); }
  const integrity=JSON.parse(r.stdout);if(typeof integrity!=='string'||!integrity.startsWith('sha512-'))throw new Error('Invalid npm integrity readback.');return integrity;
}
/** @param {string} version @returns {'next'|'latest'} */
function npmDistTag(version) {
  if(typeof version!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?$/.test(version)||version.split('-')[1]?.split('.').some(label=>/^0\d+$/.test(label)))throw new Error('Invalid release version for npm dist-tag.');
  return version.includes('-')?'next':'latest';
}
async function upload(channel,file,version) {
  if(channel==='npm') {
    const r=npmCommand(['publish',file,'--ignore-scripts','--registry=https://npm.pkg.github.com','--tag',npmDistTag(version)]);
    if(r.status!==0)throw new Error('npm publication failed or is uncertain; reconcile the recorded operation.');
  } else {
    const token=process.env.GITHUB_TOKEN;if(!token)throw new Error('Missing workflow token.');
    const config=path.resolve(__dirname,'../setup/NuGet.Hephaera.config');
    const actor=process.env.GITHUB_ACTOR;if(!actor)throw new Error('Missing workflow actor.');
    const env={...process.env,['NuGetPackageSourceCredentials_HephaeraGitHub']:`Username=${actor};Password=${token};ValidAuthenticationTypes=Basic`};
    const cwd=path.join(path.dirname(path.dirname(file)),'.nuget-publish');fs.mkdirSync(cwd,{recursive:true});
    const configFile=path.join(cwd,'NuGet.Config');if(fs.existsSync(configFile)&&fs.lstatSync(configFile).isSymbolicLink())throw new Error('Unsafe publish configuration.');fs.writeFileSync(configFile,fs.readFileSync(config));
    const r=cp.spawnSync('dotnet',['nuget','push',file,'--source','HephaeraGitHub','--api-key',token],{cwd,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:1048576,env});
    if(r.error||r.status!==0)throw new Error('NuGet publication failed or is uncertain; reconcile the recorded operation.');
  }
}
async function publish(directory,{execute=false,io={lookup,upload},expectedManifest}={}) {
  const {directory:root,receipt,files}=input(directory);
  verifyPayload(receipt,files,expectedManifest);
  const expected={npm:'sha512-'+crypto.createHash('sha512').update(fs.readFileSync(files.npm)).digest('base64'),nuget:receipt.artifacts.nuget.sha256};
  const plan={schemaVersion:1,version:receipt.version,revision:receipt.manifest.revision,npmDistTag:npmDistTag(receipt.version),expected,channels:{},status:execute?'reconciling':'dry-run'};
  if(!execute)return plan;
  const journal=path.join(root,'publication.json');
  if(fs.existsSync(journal)){
    if(fs.lstatSync(journal).isSymbolicLink())throw new Error('Unsafe publication journal.');
    const old=JSON.parse(fs.readFileSync(journal,'utf8'));
    if(old.version!==plan.version||JSON.stringify(old.expected)!==JSON.stringify(expected))throw new Error('Existing publication identity differs; do not overwrite.');
  }
  const write=()=>{const tmp=journal+'.tmp';fs.writeFileSync(tmp,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,journal);};
  // Reconcile both feeds before making either write.
  for(const channel of ['npm','nuget']){
    const observed=await io.lookup(channel,plan.version);
    if(observed!==null&&observed!==expected[channel])throw new Error('Published '+channel+' version has different bytes; use a new version.');
    plan.channels[channel]={status:observed===null?'confirmed-absent':'confirmed',digest:observed};
  }
  write();
  for(const channel of ['npm','nuget']){
    if(plan.channels[channel].status==='confirmed')continue;
    plan.channels[channel].status='write-intent';write();
    try{
      await io.upload(channel,files[channel],plan.version);
      const observed=await io.lookup(channel,plan.version);
      if(observed!==expected[channel])throw new Error('Published digest is not yet confirmed.');
      plan.channels[channel]={status:'confirmed',digest:observed};write();
    }catch(error){plan.channels[channel].status='uncertain';plan.status='needs-reconciliation';write();throw new Error('Publication incomplete. Retain publication.json and reconcile registry state before retrying.');}
  }
  plan.status='confirmed';write();return plan;
}
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length<1||args.length>2||args[1]&&args[1]!=='--execute'){console.error('Usage: node installer/lib/publish.cjs ARTIFACT_DIRECTORY [--execute]');process.exitCode=1;}
  else publish(args[0],{execute:args[1]==='--execute'}).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={input,publish,ownedUrl,artifactPath,verifyPayload,npmDistTag};
