'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {publish,ownedUrl,npmDistTag}=require('../installer/lib/publish.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(dirty=false,version='5.1.0-rc.1'){
 const directory=path.resolve(__dirname,'../.local/publication-tests',crypto.randomUUID());fs.mkdirSync(path.join(directory,'artifacts'),{recursive:true});
 const {digest}=require('../installer/core/files.cjs'),{writeZip}=require('../installer/scripts/archives.cjs'),zlib=require('node:zlib');
 const code=Buffer.from("'use strict'; // fixture\n"),coreFiles={'cli.cjs':sha(code),'manifest.cjs':sha(code)};
 const manifest={schemaVersion:1,version,sourceDirty:dirty,repository:'https://github.com/TimothyMeadows/Hephaera.git',revision:'a'.repeat(40),tree:'b'.repeat(40),tag:version,bubo:JSON.parse(fs.readFileSync(path.resolve(__dirname,'../runtime/bubo.lock.json'))),coreFiles};
 const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
 const tarEntries=new Map([['package/package.json',Buffer.from(JSON.stringify({name:'@timothymeadows/hephaera',version:manifest.version}))],['package/core/release-manifest.json',bytes],...Object.keys(coreFiles).map(n=>['package/core/'+n,code])]);
 const zipEntries=new Map([['Hephaera.nuspec',Buffer.from('<package><metadata><id>Hephaera</id><version>'+manifest.version+'</version></metadata></package>')],['tools/net10.0/any/embedded/core/release-manifest.json',bytes],...Object.keys(coreFiles).map(n=>['tools/net10.0/any/embedded/core/'+n,code])]);
 const tar=[];for(const [name,data]of tarEntries){const header=Buffer.alloc(512);header.write(name);header.write('0000644\0',100);header.write(data.length.toString(8).padStart(11,'0')+'\0',124);header.fill(32,148,156);header[156]=48;const sum=header.reduce((a,b)=>a+b,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);tar.push(header,data,Buffer.alloc((512-data.length%512)%512));}tar.push(Buffer.alloc(1024));
 const payloads={npm:zlib.gzipSync(Buffer.concat(tar)),nuget:writeZip(zipEntries)};
 const receipt={schemaVersion:1,version:manifest.version,sourceDirty:dirty,manifest,manifestSha256:digest(manifest),manifestFileSha256:sha(bytes),artifacts:{}};
 for(const channel of ['npm','nuget']){const file='artifacts/'+channel;fs.writeFileSync(path.join(directory,file),payloads[channel]);receipt.artifacts[channel]={file,sha256:sha(payloads[channel])};}
 fs.writeFileSync(path.join(directory,'package-build.json'),JSON.stringify(receipt));return {directory,receipt};
}
test('publication has a dry-run with no external calls and rejects dirty/tampered artifacts',async()=>{const f=fixture();const plan=await publish(f.directory,{expectedManifest:f.receipt.manifest});assert.equal(plan.status,'dry-run');assert.equal(fs.existsSync(path.join(f.directory,'publication.json')),false);fs.appendFileSync(path.join(f.directory,f.receipt.artifacts.npm.file),'tamper');await assert.rejects(publish(f.directory,{expectedManifest:f.receipt.manifest}),/digest/);const g=fixture();g.receipt.sourceDirty=true;fs.writeFileSync(path.join(g.directory,'package-build.json'),JSON.stringify(g.receipt));await assert.rejects(publish(g.directory,{expectedManifest:g.receipt.manifest}),/clean/);});
test('partial registry writes reconcile existing bytes before only missing channel upload',async()=>{const f=fixture(),expected=(await publish(f.directory,{expectedManifest:f.receipt.manifest})).expected,remote={npm:null,nuget:null},calls=[];let fail=true;const io={lookup:async channel=>remote[channel],upload:async channel=>{calls.push(channel);if(channel==='nuget'&&fail)throw new Error('uncertain');remote[channel]=expected[channel];}};await assert.rejects(publish(f.directory,{expectedManifest:f.receipt.manifest,execute:true,io}),/incomplete/);assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory,'publication.json'))).channels.npm.status,'confirmed');fail=false;const final=await publish(f.directory,{expectedManifest:f.receipt.manifest,execute:true,io});assert.equal(final.status,'confirmed');assert.deepEqual(calls,['npm','nuget','nuget']);await publish(f.directory,{expectedManifest:f.receipt.manifest,execute:true,io});assert.equal(calls.length,3);});
test('remote collisions refuse every write; download resources stay in selected feed',async()=>{const f=fixture();let writes=0;await assert.rejects(publish(f.directory,{expectedManifest:f.receipt.manifest,execute:true,io:{lookup:async()=> 'wrong digest',upload:async()=>writes++}}),/different bytes/);assert.equal(writes,0);assert.throws(()=>ownedUrl('https://example.com/private'),/Unexpected/);assert.throws(()=>ownedUrl('https://nuget.pkg.github.com/other/index.json'),/Unexpected/);});

test('uncertain release-asset upload reconciles remote bytes without clobber',async()=>{const f=fixture(),expected=(await publish(f.directory,{expectedManifest:f.receipt.manifest})).expected;await publish(f.directory,{expectedManifest:f.receipt.manifest,execute:true,io:{lookup:async c=>expected[c],upload:async()=>assert.fail()}});const {publishAssets}=require('../installer/lib/release-assets.cjs');const remote={id:123,tag_name:f.receipt.version,draft:true,prerelease:f.receipt.version.includes('-'),assets:[]};let uploads=0,fail=true;const io={get:async()=>remote,digest:async a=>a.digest,upload:async a=>{uploads++;remote.assets.push({name:a.name,digest:a.sha256});if(fail){fail=false;throw new Error('uncertain response');}},finish:async()=>remote.draft=false};await assert.rejects(publishAssets(f.directory,{execute:true,io,expectedManifest:f.receipt.manifest}),/uncertain/);const result=await publishAssets(f.directory,{execute:true,io,expectedManifest:f.receipt.manifest});assert.equal(result.status,'confirmed');assert.equal(uploads,4);await publishAssets(f.directory,{execute:true,io,expectedManifest:f.receipt.manifest});assert.equal(uploads,4);remote.assets[0].digest='different';await assert.rejects(publishAssets(f.directory,{execute:true,io,expectedManifest:f.receipt.manifest}),/never clobber/);});

test('relabeling dirty receipt fields cannot disguise embedded preview packages',async()=>{const f=fixture(true);f.receipt.sourceDirty=false;f.receipt.manifest.sourceDirty=false;const {digest}=require('../installer/core/files.cjs');f.receipt.manifestSha256=digest(f.receipt.manifest);f.receipt.manifestFileSha256=sha(Buffer.from(JSON.stringify(f.receipt.manifest,null,2)+'\n'));fs.writeFileSync(path.join(f.directory,'package-build.json'),JSON.stringify(f.receipt));await assert.rejects(publish(f.directory,{expectedManifest:f.receipt.manifest}),/Embedded/);});

test('artifact metadata cannot use Windows separators to escape its declared directory',()=>{const f=fixture();const {artifactPath}=require('../installer/lib/publish.cjs');const secret=Buffer.from('owned fixture only');fs.writeFileSync(path.join(f.directory,'owned-fixture'),secret);assert.throws(()=>artifactPath(f.directory,{file:'artifacts/..\\owned-fixture',sha256:sha(secret)}),/Invalid artifact/);});

test('first draft and matching public retries are checked before any registry write',async()=>{const f=fixture();const {publishAssets}=require('../installer/lib/release-assets.cjs');const remote={id:123,tag_name:f.receipt.version,draft:true,prerelease:f.receipt.version.includes('-'),assets:[]};let writes=0;const io={get:async()=>remote,digest:async a=>a.digest,upload:async()=>writes++,finish:async()=>writes++};const draft=await publishAssets(f.directory,{preflight:true,expectedManifest:f.receipt.manifest,io});assert.equal(draft.status,'preflight-confirmed');assert.equal(writes,0);remote.draft=false;await assert.rejects(publishAssets(f.directory,{preflight:true,expectedManifest:f.receipt.manifest,io}),/Public release asset missing/);assert.equal(writes,0);});

test('NuGet publication admits exactly the selected Hephaera package ID',async()=>{const f=fixture(),{readZip,writeZip}=require('../installer/scripts/archives.cjs');const file=path.join(f.directory,f.receipt.artifacts.nuget.file),entries=readZip(fs.readFileSync(file));const legacy=['Hephaera','Cli'].join('.');entries.set('Hephaera.nuspec',Buffer.from(entries.get('Hephaera.nuspec').toString().replace('<id>Hephaera</id>','<id>'+legacy+'</id>')));fs.writeFileSync(file,writeZip(entries));f.receipt.artifacts.nuget.sha256=sha(fs.readFileSync(file));fs.writeFileSync(path.join(f.directory,'package-build.json'),JSON.stringify(f.receipt));await assert.rejects(publish(f.directory,{expectedManifest:f.receipt.manifest}),/NuGet package identity differs/);});

test('npm dist-tag selection rejects invalid release version types and spellings',()=>{
 for(const version of [undefined,null,5,{},'','v5.1.0','5.1.0+local','05.1.0','5.1.0-01'])assert.throws(()=>npmDistTag(version),/Invalid release version/);
});

for(const [version,tag] of [['5.1.0-rc.1','next'],['5.1.0','latest']])test('default npm publisher explicitly tags '+version+' as '+tag,()=>{
 const f=fixture(false,version),cp=require('node:child_process');
 // Run the actual default lookup/upload path in an isolated child. Only the
 // process/network boundary is replaced; no registry command or request runs.
 const script=String.raw`
  const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
  const directory=process.argv[1],receipt=JSON.parse(fs.readFileSync(path.join(directory,'package-build.json')));
  const files=Object.fromEntries(Object.entries(receipt.artifacts).map(([key,value])=>[key,path.join(directory,value.file)]));
  const integrity='sha512-'+crypto.createHash('sha512').update(fs.readFileSync(files.npm)).digest('base64');
  let npmPresent=false,nugetPresent=false;const calls=[];
  Object.defineProperty(process,'platform',{value:'linux'});
  process.env.GITHUB_TOKEN='owned-test-token';process.env.GITHUB_ACTOR='owned-test-actor';
  cp.spawnSync=(command,args)=>{
   calls.push({command,args});
   if(command==='npm'&&args[0]==='view')return npmPresent?{status:0,stdout:JSON.stringify(integrity),stderr:''}:{status:1,stdout:'',stderr:'E404'};
   if(command==='npm'&&args[0]==='publish'){npmPresent=true;return {status:0,stdout:'',stderr:''};}
   if(command==='dotnet'&&args[0]==='nuget'&&args[1]==='push'){nugetPresent=true;return {status:0,stdout:'',stderr:''};}
   throw new Error('Unexpected process boundary');
  };
  globalThis.fetch=async value=>{
   const url=String(value);
   if(url==='https://nuget.pkg.github.com/TimothyMeadows/index.json')return {ok:true,json:async()=>({resources:[{'@type':'PackageBaseAddress/3.0.0','@id':'https://nuget.pkg.github.com/TimothyMeadows/download/'}]})};
   assert.equal(url,'https://nuget.pkg.github.com/TimothyMeadows/download/hephaera/'+receipt.version+'/hephaera.'+receipt.version+'.nupkg');
   return nugetPresent?{ok:true,status:200,headers:{get:()=>String(fs.statSync(files.nuget).size)},arrayBuffer:async()=>fs.readFileSync(files.nuget)}:{ok:false,status:404};
  };
  require(process.argv[2]).publish(directory,{execute:true,expectedManifest:receipt.manifest}).then(plan=>{
   assert.equal(plan.status,'confirmed');
   console.log(JSON.stringify({npmDistTag:plan.npmDistTag,publish:calls.filter(call=>call.command==='npm'&&call.args[0]==='publish')}));
  }).catch(error=>{console.error(error);process.exitCode=1;});
 `;
 const result=JSON.parse(cp.execFileSync(process.execPath,['-e',script,f.directory,path.resolve(__dirname,'../installer/lib/publish.cjs')],{encoding:'utf8',windowsHide:true,env:{SystemRoot:process.env.SystemRoot||''}}));
 assert.equal(result.npmDistTag,tag);
 assert.deepEqual(result.publish,[{command:'npm',args:['publish',path.join(f.directory,f.receipt.artifacts.npm.file),'--ignore-scripts','--registry=https://npm.pkg.github.com','--tag',tag]}]);
});

function defaultReleaseAssets(f,scenario={}){
 const script=String.raw`
  const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
  const directory=process.argv[1],scenario=JSON.parse(process.argv[2]),receipt=JSON.parse(fs.readFileSync(path.join(directory,'package-build.json')));
  const remote=scenario.remote||{id:123,tag_name:receipt.version,draft:true,prerelease:receipt.version.includes('-'),assets:[]},calls=[];let reads=0;
  const cliId=Object.hasOwn(scenario,'cliId')?scenario.cliId:remote.id;
  const endpoint='repos/TimothyMeadows/Hephaera/releases/'+cliId;
  process.env.GITHUB_REPOSITORY='TimothyMeadows/Hephaera';
  // The entire gh process boundary is replaced. By-tag REST deliberately fails,
  // matching the authenticated draft lookup failure that prompted this repair.
  cp.execFileSync=(command,args)=>{
   assert.equal(command,'gh');calls.push(args);
   if(args[0]==='release'&&args[1]==='view'){
    assert.deepEqual(args,['release','view',receipt.version,'--repo','TimothyMeadows/Hephaera','--json','databaseId,tagName']);
    return JSON.stringify({databaseId:cliId,tagName:scenario.cliTag||receipt.version});
   }
   assert.equal(args[0],'api');
   if(args[1].includes('/releases/tags/'))throw new Error('By-tag REST cannot return this draft');
   const method=args.includes('--method')?args[args.indexOf('--method')+1]:'GET';
   if(method==='GET'&&args[1]===endpoint){
    reads++;const value=structuredClone(remote);
    if(Object.hasOwn(scenario,'restId'))value.id=scenario.restId;
    if(Object.hasOwn(scenario,'restTag'))value.tag_name=scenario.restTag;
    if(Object.hasOwn(scenario,'restPrerelease'))value.prerelease=scenario.restPrerelease;
    if(scenario.omitPrerelease)delete value.prerelease;
    if(reads>1&&Object.hasOwn(scenario,'laterId'))value.id=scenario.laterId;
    if(reads>1&&Object.hasOwn(scenario,'laterTag'))value.tag_name=scenario.laterTag;
    if(reads>1&&Object.hasOwn(scenario,'laterPrerelease'))value.prerelease=scenario.laterPrerelease;
    if(reads>1&&scenario.omitLaterPrerelease)delete value.prerelease;
    return JSON.stringify(value);
   }
   if(method==='POST'){
    const url=new URL(args[1]);assert.equal(url.origin,'https://uploads.github.com');assert.equal(url.pathname,'/repos/TimothyMeadows/Hephaera/releases/'+cliId+'/assets');
    assert.equal(args[args.indexOf('-H')+1],'Content-Type: application/octet-stream');
    const file=args[args.indexOf('--input')+1];assert.equal(url.searchParams.get('name'),path.basename(file));
    const asset={id:remote.assets.length+1000,name:path.basename(file),digest:'sha256:'+crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};remote.assets.push(asset);
    if(scenario.uncertainUpload)throw new Error('Owned uncertain upload boundary');
    return JSON.stringify(asset);
   }
   if(method==='PATCH'){
    assert.equal(args[1],endpoint);assert.deepEqual(args,['api',endpoint,'--method','PATCH','-F','draft=false']);remote.draft=false;
    if(Object.hasOwn(scenario,'finishPrerelease'))remote.prerelease=scenario.finishPrerelease;
    if(scenario.omitFinalPrerelease)delete remote.prerelease;
    return JSON.stringify(remote);
   }
   throw new Error('Unexpected gh boundary');
  };
  require(process.argv[3]).publishAssets(directory,{execute:!!scenario.execute,preflight:!scenario.execute,expectedManifest:receipt.manifest,expectedReleaseId:scenario.expectedReleaseId}).then(result=>console.log(JSON.stringify({ok:true,result,calls,remote}))).catch(error=>console.log(JSON.stringify({ok:false,error:error.message,calls,remote})));
 `;
 return JSON.parse(require('node:child_process').execFileSync(process.execPath,['-e',script,f.directory,JSON.stringify(scenario),path.resolve(__dirname,'../installer/lib/release-assets.cjs')],{encoding:'utf8',windowsHide:true,env:{SystemRoot:process.env.SystemRoot||''}}));
}
async function confirmedRegistries(f){
 const expected=(await publish(f.directory,{expectedManifest:f.receipt.manifest})).expected;
 await publish(f.directory,{execute:true,expectedManifest:f.receipt.manifest,io:{lookup:async channel=>expected[channel],upload:async()=>assert.fail('No registry upload expected')}});
}
const releaseWrites=result=>result.calls.filter(args=>args.includes('POST')||args.includes('PATCH'));

test('default release adapter resolves a private draft through CLI then REST by ID',()=>{
 const result=defaultReleaseAssets(fixture(),{expectedReleaseId:123});
 assert.equal(result.ok,true,result.error);assert.equal(result.result.status,'preflight-confirmed');assert.equal(result.result.releaseId,123);
 assert.deepEqual(result.calls.map(args=>args.slice(0,2)),[['release','view'],['api','repos/TimothyMeadows/Hephaera/releases/123']]);
 assert.equal(releaseWrites(result).length,0);
});

test('default release adapter rejects invalid CLI IDs and mismatched selected tags before writes',async()=>{
 const f=fixture();await confirmedRegistries(f);
 for(const cliId of [null,0,-1,1.5,'123',Number.MAX_SAFE_INTEGER+1]){
  const result=defaultReleaseAssets(f,{execute:true,cliId});assert.equal(result.ok,false);assert.match(result.error,/Invalid release database ID/);assert.equal(result.calls.length,1);assert.equal(releaseWrites(result).length,0);
 }
 const result=defaultReleaseAssets(f,{execute:true,cliTag:'different-version'});assert.equal(result.ok,false);assert.match(result.error,/tag identity/);assert.equal(result.calls.length,1);assert.equal(releaseWrites(result).length,0);
});

test('default release adapter rejects invalid or mismatched REST identities before writes',async()=>{
 const f=fixture();await confirmedRegistries(f);
 for(const scenario of [{restId:0},{restId:'123'},{restId:124},{restTag:'different-version'}]){
  const result=defaultReleaseAssets(f,{execute:true,...scenario});assert.equal(result.ok,false);assert.match(result.error,/database ID|tag identity/);assert.equal(result.calls.length,2);assert.equal(releaseWrites(result).length,0);
 }
});

test('default asset uploads and publication keep one ID and published retry makes no writes',async()=>{
 const f=fixture();await confirmedRegistries(f);
 const first=defaultReleaseAssets(f,{execute:true,expectedReleaseId:123});assert.equal(first.ok,true,first.error);assert.equal(first.result.status,'confirmed');assert.equal(first.result.releaseId,123);
 const writes=releaseWrites(first);assert.equal(writes.filter(args=>args.includes('POST')).length,4);assert.equal(writes.filter(args=>args.includes('PATCH')).length,1);assert.equal(writes.at(-1).includes('PATCH'),true);
 assert.equal(first.remote.draft,false);assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory,'release-assets.json'))).releaseId,123);
 const retry=defaultReleaseAssets(f,{execute:true,expectedReleaseId:123,remote:first.remote});assert.equal(retry.ok,true,retry.error);assert.equal(retry.result.status,'confirmed');assert.equal(releaseWrites(retry).length,0);
 const journal=path.join(f.directory,'release-assets.json'),before=fs.readFileSync(journal);
 const conflict=defaultReleaseAssets(f,{execute:true,expectedReleaseId:124,remote:first.remote});assert.equal(conflict.ok,false);assert.match(conflict.error,/pinned release/);assert.deepEqual(conflict.calls,[]);assert.deepEqual(fs.readFileSync(journal),before);
});

test('uncertain default upload pins the journal ID and refuses a replacement release on retry',async()=>{
 const f=fixture();await confirmedRegistries(f);
 const first=defaultReleaseAssets(f,{execute:true,uncertainUpload:true});assert.equal(first.ok,false);assert.match(first.error,/upload uncertain/);assert.equal(releaseWrites(first).length,1);
 const journal=path.join(f.directory,'release-assets.json'),before=fs.readFileSync(journal);assert.equal(JSON.parse(before).releaseId,123);
 const retry=defaultReleaseAssets(f,{execute:true,cliId:124,remote:{...first.remote,id:124}});assert.equal(retry.ok,false);assert.match(retry.error,/pinned release/);assert.equal(retry.calls.length,1);assert.equal(releaseWrites(retry).length,0);assert.deepEqual(fs.readFileSync(journal),before);
});

test('default adapter revalidates the release identity after upload before any further write',async()=>{
 for(const scenario of [{laterId:124},{laterTag:'different-version'},{laterPrerelease:false},{omitLaterPrerelease:true}]){
  const f=fixture();await confirmedRegistries(f);
  const result=defaultReleaseAssets(f,{execute:true,...scenario});assert.equal(result.ok,false);assert.match(result.error,/pinned release|tag identity|prerelease identity/);assert.equal(releaseWrites(result).length,1);assert.equal(releaseWrites(result)[0].includes('POST'),true);
 }
});

test('default release adapter cannot write or resolve a release before both registries confirm',()=>{
 const f=fixture();fs.writeFileSync(path.join(f.directory,'publication.json'),JSON.stringify({status:'needs-reconciliation',version:f.receipt.version,revision:f.receipt.manifest.revision}));
 const result=defaultReleaseAssets(f,{execute:true});assert.equal(result.ok,false);assert.match(result.error,/Both registries/);assert.deepEqual(result.calls,[]);
});

test('expected release ID rejects invalid inputs before artifact reads or adapter calls',async()=>{
 const {publishAssets}=require('../installer/lib/release-assets.cjs');let calls=0;
 for(const expectedReleaseId of [null,0,-1,1.5,'123',Number.MAX_SAFE_INTEGER+1])await assert.rejects(publishAssets(path.join(__dirname,'absent-'+crypto.randomUUID()),{expectedReleaseId,io:{get:async()=>{calls++;}}}),/Invalid release database ID/);
 assert.equal(calls,0);
});

test('default preflight and execution reject a different approved release ID before writes',async()=>{
 const f=fixture();await confirmedRegistries(f);
 for(const execute of [false,true]){
  const result=defaultReleaseAssets(f,{execute,expectedReleaseId:124});assert.equal(result.ok,false);assert.match(result.error,/pinned release/);assert.equal(result.calls.length,1);assert.equal(releaseWrites(result).length,0);
 }
 assert.equal(fs.existsSync(path.join(f.directory,'release-assets.json')),false);
});

test('injected adapters must match the expected release ID before upload or publication',async()=>{
 const f=fixture();await confirmedRegistries(f);let writes=0;
 const {publishAssets}=require('../installer/lib/release-assets.cjs');
 const io={get:async()=>({id:123,tag_name:f.receipt.version,draft:true,prerelease:f.receipt.version.includes('-'),assets:[]}),upload:async()=>writes++,finish:async()=>writes++};
 await assert.rejects(publishAssets(f.directory,{execute:true,expectedManifest:f.receipt.manifest,expectedReleaseId:124,io}),/pinned release/);assert.equal(writes,0);
 const correct=await publishAssets(f.directory,{preflight:true,expectedManifest:f.receipt.manifest,expectedReleaseId:123,io});assert.equal(correct.status,'preflight-confirmed');assert.equal(correct.releaseId,123);assert.equal(writes,0);
});

test('default adapter rejects missing or wrong prerelease classification before writes',async()=>{
 for(const [version,scenario] of [['5.1.0-rc.1',{restPrerelease:false}],['5.1.0-rc.1',{omitPrerelease:true}],['5.1.0',{restPrerelease:true}]]){
  const f=fixture(false,version);await confirmedRegistries(f);
  const result=defaultReleaseAssets(f,{execute:true,expectedReleaseId:123,...scenario});assert.equal(result.ok,false);assert.match(result.error,/prerelease identity/);assert.equal(releaseWrites(result).length,0);
 }
 const stable=defaultReleaseAssets(fixture(false,'5.1.0'),{expectedReleaseId:123});assert.equal(stable.ok,true,stable.error);assert.equal(stable.result.status,'preflight-confirmed');
});

test('default adapter revalidates prerelease classification after draft publication',async()=>{
 for(const scenario of [{finishPrerelease:false},{omitFinalPrerelease:true}]){
  const f=fixture();await confirmedRegistries(f);
  const result=defaultReleaseAssets(f,{execute:true,expectedReleaseId:123,...scenario});assert.equal(result.ok,false);assert.match(result.error,/prerelease identity/);assert.equal(releaseWrites(result).filter(args=>args.includes('PATCH')).length,1);
  assert.notEqual(JSON.parse(fs.readFileSync(path.join(f.directory,'release-assets.json'))).status,'confirmed');
 }
});
