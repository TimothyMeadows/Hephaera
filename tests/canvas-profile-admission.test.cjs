'use strict';
// Synthetic CPU file admission only; no Bubo/native/provider/art execution.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const source=process.env.HEPHAERA_CANVAS_PROFILE_TEST_SOURCE||path.resolve(__dirname,'../commands/lib/bubo-canvas-profile.cjs');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hephaera-canvas-admission-')),refs=[],tools=[];
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const write=(name,value)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));return name;};
 const task='source-fixture',asset='leader',version='canvas-01',state='.hephaera/.cache/tasks/'+task,folder=state+'/profile';
 write('toolchain.json',{synthetic:true});write(state+'/authority.json',{synthetic:true});write(state+'/inputs.json',{synthetic:true});
 write('tools/canvas/matting.exe','SYNTHETIC NONEXECUTABLE');write('tools/canvas/library.dll','SYNTHETIC NONEXECUTABLE DLL');
 const reference=name=>({path:name,sha256:hash(path.join(root,name))}),sized=name=>({...reference(name),bytes:fs.statSync(path.join(root,name)).size});
 const profile={schemaVersion:1,id:'birefnet-source-canvas-v1',mode:'multi-view-four',baseToolchain:reference('toolchain.json'),executable:sized('tools/canvas/matting.exe'),files:[sized('tools/canvas/matting.exe'),sized('tools/canvas/library.dll')],maxMattingChildren:4};
 const empty=()=>Object.fromEntries(['classify','prepare-proofs','preprocess','reconstruct','finish','guided','review'].map(stage=>[stage,[]]));
 const lineage={schemaVersion:1,kind:'proof-to-model-stage-lineage',decision:'approved',task,asset,sourceVersion:'old-01',targetVersion:version,authorization:reference(state+'/authority.json'),inputApproval:reference(state+'/inputs.json'),priorManifest:null,priorStateRoot:state+'/proof-to-model/'+asset+'/old-01',priorStaging:'.art-staging/proof-to-model/'+asset+'/old-01',priorAttempts:empty(),priorDirectories:empty(),priorHistoryCounts:Object.fromEntries(Object.keys(empty()).map(stage=>[stage,0])),stageLimits:Object.fromEntries(Object.keys(empty()).map(stage=>[stage,['classify','prepare-proofs'].includes(stage)?4:1]))};
 const options={root,task,asset,version,mode:'multi-view-four',profileFile:folder+'/matting.json',lineageFile:folder+'/lineage.json',reference(name,kind='input',expected){const file=path.resolve(root,name);const sha=hash(file);if(expected!==undefined)assert.equal(sha,expected);refs.push({path:name,kind,sha256:sha});return file;},tool(file,required){assert.equal(required,true);tools.push(file);}};
 const runtime={projectPath:(base,value)=>path.resolve(base,value),components(){},hash};
 const module={exports:{}};vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(source,'utf8')+'\n})',{Buffer,TextDecoder,process})(name=>name==='./bubo-runtime.cjs'?runtime:require(name),module,module.exports);
 const save=()=>{write(options.profileFile,profile);write(options.lineageFile,lineage);};save();
 const clean=()=>{const target=path.resolve(root),temp=path.resolve(os.tmpdir());assert.ok(target.startsWith(temp+path.sep)&&path.basename(target).startsWith('hephaera-canvas-admission-'));fs.rmSync(target,{recursive:true,force:true});};
 return{root,profile,lineage,options,refs,tools,write,save,clean,collect:()=>module.exports.collect(options),collectRaw:input=>module.exports.collect(input)};
}
test('unselected canvas admission is inert and performs no native/IO callbacks',()=>{const f=fixture();try{const result=f.collectRaw({root:f.root,task:'source-fixture',reference(){throw Error('Unexpected reference');},tool(){throw Error('Unexpected tool');}});assert.deepEqual(Array.from(result.inputs),[]);assert.equal(f.refs.length,0);assert.equal(f.tools.length,0);}finally{f.clean();}});
test('selected fixture admits separate executable role, dependency input and exact readonly roots',()=>{const f=fixture();try{const result=f.collect();assert.deepEqual(Array.from(result.inputs),['tools/canvas',f.lineage.priorStateRoot,f.lineage.priorStaging]);assert.equal(f.tools.length,1);assert.ok(f.tools[0].endsWith(path.join('canvas','matting.exe')));assert.ok(f.refs.some(ref=>ref.path==='tools/canvas/library.dll'));assert.ok(!f.refs.some(ref=>ref.path==='tools/canvas/matting.exe'));}finally{f.clean();}});
test('paired selection, class/version and exact predecessor scope refuse before tool admission',()=>{
 for(const mode of ['pair','class','version','root']){
  const f=fixture();
  try{
   if(mode==='class')f.lineage.asset='foreign';
   if(mode==='version')f.lineage.targetVersion='retry';
   if(mode==='root')f.lineage.priorStaging='.art-staging';
   f.save();
   if(mode==='pair')f.options.lineageFile=null;
   assert.throws(f.collect);
   assert.equal(f.tools.length,0);
  }finally{f.clean();}
 }
});
test('overbudget first bundle entry refuses before any binary tool callback',()=>{const f=fixture();try{f.profile.files[0].bytes=536870913;f.save();assert.throws(f.collect,/budget/);assert.equal(f.tools.length,0);assert.ok(!f.refs.some(ref=>ref.path.endsWith('.dll')));}finally{f.clean();}});
test('changed dependency bytes and alias paths refuse',()=>{for(const mode of['bytes','alias']){const f=fixture();try{if(mode==='bytes')f.write('tools/canvas/library.dll','CHANGED SYNTHETIC DLL');else f.profile.files[1].path='../escape.dll';f.save();assert.throws(f.collect);}finally{f.clean();}}});
test('existing predecessor cannot be represented as zero-prior',()=>{const f=fixture();try{f.write(f.lineage.priorStateRoot+'/manifest.json',{synthetic:true});assert.throws(f.collect,/predecessor/);assert.equal(f.tools.length,0);}finally{f.clean();}});
test('actual bridge refuses selected canvas when installed native capability is missing, before policy/tool work',()=>{
 const f=fixture();try{
  const adapter=path.join(path.dirname(source),'bubo-host-adapter.cjs'),module={exports:{}},runtime={native:value=>value,components(){},syntax(){},projectPath:(root,value)=>path.resolve(root,value)};
  const mockRequire=name=>name==='./bubo-runtime.cjs'?runtime:name.startsWith('./')?new Proxy({},{get(){throw Error('Unexpected policy/tool work before native capability refusal');}}):require(name);
  vm.runInNewContext('(function(require,module,exports,__filename,__dirname){'+fs.readFileSync(adapter,'utf8')+'\n})',{Buffer,TextDecoder,process})(mockRequire,module,module.exports,adapter,path.dirname(adapter));
  const options=new Map([['root',f.root],['task','source-fixture'],['asset','leader'],['version','canvas-01'],['mode','multi-view-four'],['preprocessing-profile',f.options.profileFile],['stage-lineage',f.options.lineageFile]]);
  assert.throws(()=>module.exports.contextFor('proof-to-model','init',options,{capability:{proofToModel:{fourViewConditioningProfile:'cardinal-four-v1'}}}),/not qualified/);
 }finally{f.clean();}
});
