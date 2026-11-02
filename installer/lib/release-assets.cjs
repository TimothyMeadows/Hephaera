'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {input,artifactPath,verifyPayload}=require('./publish.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function gh(args,binary=false){return cp.execFileSync('gh',args,{encoding:binary?undefined:'utf8',windowsHide:true,maxBuffer:67108864,stdio:['ignore','pipe','pipe']});}
function repository(){if(process.env.GITHUB_REPOSITORY!=='TimothyMeadows/Hephaera')throw new Error('Release assets require the selected repository workflow.');return process.env.GITHUB_REPOSITORY;}
async function publishAssets(directory,{execute=false,io,expectedManifest,preflight=false}={}){
 const {directory:root,receipt,files}=input(directory);
 verifyPayload(receipt,files,expectedManifest);
 if(!preflight){const publication=JSON.parse(fs.readFileSync(path.join(root,'publication.json'),'utf8'));
 if(publication.status!=='confirmed'||publication.version!==receipt.version||publication.revision!==receipt.manifest.revision)throw new Error('Both registries must be confirmed before release publication.');}
 const assets=Object.values(receipt.artifacts).map(entry=>{const file=artifactPath(root,entry);return {file,name:path.basename(file),sha256:entry.sha256};});
 const artifactDirectory=path.join(root,'artifacts');
 const manifestFile=path.join(artifactDirectory,'release-manifest-'+receipt.version+'.json');fs.writeFileSync(manifestFile,JSON.stringify(receipt.manifest,null,2)+'\n');assets.push({file:manifestFile,name:path.basename(manifestFile),sha256:hash(fs.readFileSync(manifestFile))});
 const checksums=path.join(artifactDirectory,'CHECKSUMS-'+receipt.version+'.txt');fs.writeFileSync(checksums,assets.map(a=>a.sha256+'  '+a.name).join('\n')+'\n');assets.push({file:checksums,name:path.basename(checksums),sha256:hash(fs.readFileSync(checksums))});
 const result={schemaVersion:1,version:receipt.version,revision:receipt.manifest.revision,status:execute?'reconciling':'dry-run',assets:assets.map(({name,sha256})=>({name,sha256,status:'unknown'}))};
 if(!execute&&!preflight)return result;
 const journal=path.join(root,'release-assets.json');
 if(!io){const repo=repository();io={get:()=>JSON.parse(gh(['api',`repos/${repo}/releases/tags/${receipt.version}`])),digest:asset=>asset.digest?.startsWith('sha256:')?asset.digest.slice(7):hash(gh(['api',`repos/${repo}/releases/assets/${asset.id}`,'-H','Accept: application/octet-stream'],true)),upload:asset=>gh(['release','upload',receipt.version,asset.file,'--repo',repo]),finish:()=>gh(['release','edit',receipt.version,'--draft=false','--repo',repo])};}
 if(fs.existsSync(journal)){const old=JSON.parse(fs.readFileSync(journal,'utf8'));if(old.version!==result.version||old.revision!==result.revision||JSON.stringify(old.assets.map(({name,sha256})=>({name,sha256})))!==JSON.stringify(result.assets.map(({name,sha256})=>({name,sha256}))))throw new Error('Existing release asset journal has another identity.');}
 const write=()=>{const tmp=journal+'.tmp';fs.writeFileSync(tmp,JSON.stringify(result,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,journal);};
 let remote=await io.get();if(remote.tag_name!==receipt.version)throw new Error('Release tag identity differs.');
 for(let i=0;i<assets.length;i++){
  const asset=assets[i];let existing=remote.assets.find(a=>a.name===asset.name);
  if(existing&&await io.digest(existing)!==asset.sha256)throw new Error('Existing release asset differs; never clobber published bytes.');
  if(preflight){if(!existing&&!remote.draft)throw new Error('Public release asset missing; refuse registry writes.');result.assets[i].status=existing?'confirmed':'absent-draft';continue;}
  if(!existing){
   if(!remote.draft)throw new Error('Public release has an unconfirmed asset; reconcile manually.');
   result.assets[i].status='write-intent';write();
   try{await io.upload(asset);}catch(error){result.status='needs-reconciliation';write();throw new Error('Asset upload uncertain; reconcile release-assets.json before retry.');}
   remote=await io.get();existing=remote.assets.find(a=>a.name===asset.name);
   if(!existing||await io.digest(existing)!==asset.sha256){result.status='needs-reconciliation';write();throw new Error('Release asset digest not confirmed.');}
  }
  result.assets[i].status='confirmed';write();
 }
 if(preflight){result.status='preflight-confirmed';return result;}
 if(remote.draft){result.status='publish-intent';write();try{await io.finish();}catch(error){result.status='needs-reconciliation';write();throw new Error('Release draft publication uncertain; reconcile remote state.');}}
 remote=await io.get();if(remote.draft)throw new Error('Release remains a draft.');result.status='confirmed';write();return result;
}
if(require.main===module){const args=process.argv.slice(2);if(args.length!==2||!['--execute','--check'].includes(args[1])){console.error('Usage: node installer/lib/release-assets.cjs ARTIFACT_DIRECTORY <--execute|--check>');process.exitCode=1;}else publishAssets(args[0],{execute:args[1]==='--execute',preflight:args[1]==='--check'}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={publishAssets};
