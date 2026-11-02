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

test('uncertain release-asset upload reconciles remote bytes without clobber',async()=>{const f=fixture(),expected=(await publish(f.directory,{expectedManifest:f.receipt.manifest})).expected;await publish(f.directory,{expectedManifest:f.receipt.manifest,execute:true,io:{lookup:async c=>expected[c],upload:async()=>assert.fail()}});const {publishAssets}=require('../installer/lib/release-assets.cjs');const remote={tag_name:f.receipt.version,draft:true,assets:[]};let uploads=0,fail=true;const io={get:async()=>remote,digest:async a=>a.digest,upload:async a=>{uploads++;remote.assets.push({name:a.name,digest:a.sha256});if(fail){fail=false;throw new Error('uncertain response');}},finish:async()=>remote.draft=false};await assert.rejects(publishAssets(f.directory,{execute:true,io,expectedManifest:f.receipt.manifest}),/uncertain/);const result=await publishAssets(f.directory,{execute:true,io,expectedManifest:f.receipt.manifest});assert.equal(result.status,'confirmed');assert.equal(uploads,4);await publishAssets(f.directory,{execute:true,io,expectedManifest:f.receipt.manifest});assert.equal(uploads,4);remote.assets[0].digest='different';await assert.rejects(publishAssets(f.directory,{execute:true,io,expectedManifest:f.receipt.manifest}),/never clobber/);});

test('relabeling dirty receipt fields cannot disguise embedded preview packages',async()=>{const f=fixture(true);f.receipt.sourceDirty=false;f.receipt.manifest.sourceDirty=false;const {digest}=require('../installer/core/files.cjs');f.receipt.manifestSha256=digest(f.receipt.manifest);f.receipt.manifestFileSha256=sha(Buffer.from(JSON.stringify(f.receipt.manifest,null,2)+'\n'));fs.writeFileSync(path.join(f.directory,'package-build.json'),JSON.stringify(f.receipt));await assert.rejects(publish(f.directory,{expectedManifest:f.receipt.manifest}),/Embedded/);});

test('artifact metadata cannot use Windows separators to escape its declared directory',()=>{const f=fixture();const {artifactPath}=require('../installer/lib/publish.cjs');const secret=Buffer.from('owned fixture only');fs.writeFileSync(path.join(f.directory,'owned-fixture'),secret);assert.throws(()=>artifactPath(f.directory,{file:'artifacts/..\\owned-fixture',sha256:sha(secret)}),/Invalid artifact/);});

test('first draft and matching public retries are checked before any registry write',async()=>{const f=fixture();const {publishAssets}=require('../installer/lib/release-assets.cjs');const remote={tag_name:f.receipt.version,draft:true,assets:[]};let writes=0;const io={get:async()=>remote,digest:async a=>a.digest,upload:async()=>writes++,finish:async()=>writes++};const draft=await publishAssets(f.directory,{preflight:true,expectedManifest:f.receipt.manifest,io});assert.equal(draft.status,'preflight-confirmed');assert.equal(writes,0);remote.draft=false;await assert.rejects(publishAssets(f.directory,{preflight:true,expectedManifest:f.receipt.manifest,io}),/Public release asset missing/);assert.equal(writes,0);});

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
