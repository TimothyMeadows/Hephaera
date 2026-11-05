import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createThreeVfxRuntime} from '../.engine/threejs/particles/three-vfx-runtime.mjs';
import {getThreeQuarksRuntime} from '../.engine/threejs/particles/three-quarks-runtime.mjs';
import {createThreeActionScene} from '../.engine/threejs/actions/action-scene.mjs';
import {sha256} from '../.engine/threejs/particles/vfx-package.mjs';
import {originalFixture,originalActor,engineSelection,vfxBudgets,deltaPolicy,jsonBytes} from './fixtures/action-vfx/original-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const modules=path.resolve(process.env.HEPHAERA_VFX_NODE_MODULES||path.join(root,'tests/fixtures/threejs-postprocessing/node_modules'));
if(!fs.existsSync(path.join(modules,'three.quarks/package.json')))throw Error('Explicit existing fixture libraries required; no installation is attempted.');
const THREE=await import(pathToFileURL(path.join(modules,'three/build/three.module.js')));
const Quarks=await import(pathToFileURL(path.join(modules,'three.quarks/dist/three.quarks.esm.js')));
let checks=0;
const equal=(a,b,why)=>{assert.deepEqual(a,b,why);checks++;};
const ok=(value,why)=>{assert.ok(value,why);checks++;};
const near=(a,b,why)=>{assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-6,`${why}: ${a} != ${b}`);checks++;};
const rejects=(fn,pattern,why)=>{assert.throws(fn,pattern,why);checks++;};
function harness({fixtureOptions,budgets}={}){
  const scene=new THREE.Scene(),fixture=originalFixture(THREE,fixtureOptions),owned=new Set();
  const service=createThreeVfxRuntime({THREE,Quarks,scene,renderer:{isWebGLRenderer:true},engineSelection,budgets:vfxBudgets});
  const runtime=createThreeActionScene({THREE,scene,vfxRuntime:service,engineSelection,deltaPolicy,...(budgets?{budgets}:{})});
  const handle=runtime.admit(fixture.input);
  function actor(id='actor-a',prepare,onEvent=()=>{},options={}){const m=originalActor(THREE,scene);prepare?.(m,owned);m.actor=runtime.createActor({id,visualRoot:m.visual,movementRoot:m.movement,animations:m.animations,package:handle,onEvent:e=>onEvent(e,m),...options});return m;}
  const start=(m,options={})=>m.actor.start('cast',{targets:{fixed:[15,0,0]},outcomeMode:'rehearsal',...options});
  const dispose=()=>{runtime.dispose();service.dispose();fixture.release();for(const resource of owned)resource.dispose();};
  return {scene,fixture,service,runtime,actor,start,dispose};
}
function mesh(m,owned,{morph=false,skin=false,interleaved=false}={}){
  const geometry=new THREE.BoxGeometry(.2,.2,.2),material=new THREE.MeshBasicMaterial();owned.add(geometry);owned.add(material);
  if(interleaved){const positions=geometry.getAttribute('position'),data=new THREE.InterleavedBuffer(new Float32Array(positions.count*4),4);for(let i=0;i<positions.count;i++){data.array[i*4]=positions.getX(i);data.array[i*4+1]=positions.getY(i);data.array[i*4+2]=positions.getZ(i);}geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));}
  if(morph){geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').array),3)];geometry.morphAttributes.position[0].name='original-shape';}
  let object;
  if(skin){const count=geometry.getAttribute('position').count,weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));object=new THREE.SkinnedMesh(geometry,material);const bone=new THREE.Bone();bone.name='owned-bone';m.hand.add(bone);object.bind(new THREE.Skeleton([bone]));m.bone=bone;}else object=new THREE.Mesh(geometry,material);
  object.name=skin?'Skin':'Morph';m.hand.add(object);m.mesh=object;m.geometry=geometry;return object;
}

// These valid Three PropertyBinding spellings must never escape the leased
// node graph or become scalar/indexed writes disguised as vector channels.
for(const name of ['Hand.userData[external].position','Hand.children[0].quaternion','Hand.position[x]','Hand.scale[0]']){
  const h=harness(),external=new THREE.Object3D();external.position.set(7,8,9);
  rejects(()=>h.actor('escape',m=>{m.hand.userData.external=external;m.animations=[new THREE.AnimationClip('cast',1,[new THREE.VectorKeyframeTrack(name,[0,1],[0,0,0,2,0,0])])];}),/accessor|Indexed|binding/i,name+' rejected before mixer allocation');
  equal(external.position.toArray(),[7,8,9],'rejected binding never writes external Object3D');equal(h.runtime.stats().decodedModelBytes,0,'failed actor reserves no decoded bytes');h.dispose();
}
for(const kind of ['duplicate','depth']){
  const h=harness();rejects(()=>h.actor('bad-hierarchy',m=>{if(kind==='duplicate')m.root.children.push(m.hand);else{let parent=m.hand;for(let i=0;i<257;i++){const node=new THREE.Object3D();parent.add(node);parent=node;}}}),/duplicated|depth/i,'malformed '+kind+' hierarchy rejected before recursive binding/update');equal(h.runtime.stats().decodedModelBytes,0,'malformed hierarchy reserves no model bytes');h.dispose();
}

// A real owned skeleton accessor is resolved once, then played through an
// internal UUID direct channel. Live attached-skin inverse updates are legal.
{
  const h=harness(),m=h.actor('skin', (m,owned)=>{mesh(m,owned,{skin:true});m.animations[0].tracks.push(new THREE.QuaternionKeyframeTrack('Skin.bones[owned-bone].quaternion',[0,1],[0,0,0,1,0,0,Math.SQRT1_2,Math.SQRT1_2]));});
  h.start(m);h.runtime.update(.25);const before=m.mesh.bindMatrixInverse.clone();m.movement.position.x+=2;h.runtime.update(.25);
  near(m.bone.quaternion.clone().normalize().angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/4)),0,'owned bone receives exact quaternion channel');
  ok(!m.mesh.bindMatrixInverse.equals(before),'attached skin inverse follows legitimate movement');near(m.actor.stats().time,.5,'live skin changes preserve actor time');h.dispose();
}

// Animated morph values and transforms stay live; their identity/layout and
// original morph geometry stay immutable.
{
  const h=harness(),m=h.actor('morph',(m,owned)=>{mesh(m,owned,{morph:true});m.animations[0].tracks.push(new THREE.NumberKeyframeTrack('Morph.morphTargetInfluences',[0,1],[0,1]));});
  h.start(m);h.runtime.update(.25);near(m.mesh.morphTargetInfluences[0],.25,'actual morph channel animates');m.movement.position.x+=1;h.runtime.update(.25);near(m.mesh.morphTargetInfluences[0],.5,'morph values remain live on later frame');h.dispose();
}

const mutations=[
  ['position bytes',{},m=>m.geometry.attributes.position.setX(0,200)],
  ['position version',{},m=>{m.geometry.attributes.position.setX(0,200);m.geometry.attributes.position.needsUpdate=true;}],
  ['attribute identity',{},m=>m.geometry.setAttribute('position',m.geometry.attributes.position.clone())],
  ['attribute layout',{},m=>{m.geometry.attributes.position.normalized=true;}],
  ['index bytes',{},m=>m.geometry.index.setX(0,7)],
  ['index version',{},m=>{m.geometry.index.needsUpdate=true;}],
  ['group binding',{},m=>{m.geometry.groups[0].materialIndex=2;}],
  ['draw range',{},m=>m.geometry.setDrawRange(3,3)],
  ['morph bytes',{morph:true},m=>m.geometry.morphAttributes.position[0].setX(0,123)],
  ['morph array identity',{morph:true},m=>{m.geometry.morphAttributes.position=[...m.geometry.morphAttributes.position];}],
  ['morph space',{morph:true},m=>{m.geometry.morphTargetsRelative=true;}],
  ['morph dictionary',{morph:true},m=>{m.mesh.morphTargetDictionary['original-shape']=3;}],
  ['interleaved bytes',{interleaved:true},m=>{m.geometry.attributes.position.data.array[0]=123;}],
  ['interleaved version',{interleaved:true},m=>{m.geometry.attributes.position.data.needsUpdate=true;}],
  ['skin index bytes',{skin:true},m=>m.geometry.attributes.skinIndex.setX(0,2)],
  ['skin weight bytes',{skin:true},m=>m.geometry.attributes.skinWeight.setX(0,.5)],
  ['skeleton bone binding',{skin:true},m=>{m.mesh.skeleton.bones=[...m.mesh.skeleton.bones];}],
  ['skeleton inverse',{skin:true},m=>{m.mesh.skeleton.boneInverses[0].elements[12]=9;}],
  ['skin bind matrix',{skin:true},m=>{m.mesh.bindMatrix.elements[12]=9;}],
  ['hierarchy parent',{},m=>m.root.add(m.anchor)],
  ['hierarchy addition',{},m=>m.hand.add(new THREE.Object3D())],
  ['geometry binding',{},m=>{m.mesh.geometry=new THREE.BufferGeometry();}],
];
for(const[name,options,mutate]of mutations){
  const h=harness(),a=h.actor('actor-a',(m,owned)=>mesh(m,owned,options)),b=h.actor('actor-b'),bytes=h.runtime.stats().decodedModelBytes;
  let disposed=0;a.geometry.addEventListener('dispose',()=>disposed++);h.start(a);h.start(b);mutate(a);
  rejects(()=>h.runtime.update(.25),/presentation failures/i,name+' drift fails the affected generation');
  equal(a.actor.state,'idle',name+' retires affected actor');near(b.actor.stats().time,.25,name+' preserves unrelated actor time');near(h.service.stats().time,.25,name+' preserves one Scene clock');equal(disposed,0,name+' never disposes caller geometry');
  a.actor.dispose();equal(h.runtime.stats().decodedModelBytes,0,name+' releases decoded snapshots');ok(bytes>0,name+' reserved decoded bytes');h.dispose();
}

// A redirected transform object is rejected without writing the external
// vector during failure cleanup; the old owned binding can still be released.
{
  const h=harness(),m=h.actor(),external=new THREE.Vector3(90,80,70);h.start(m);h.runtime.update(.1);
  Object.defineProperty(m.hand,'position',{value:external,configurable:true,enumerable:true});rejects(()=>h.runtime.update(.1),/presentation failures/i,'transform identity drift rejected');equal(external.toArray(),[90,80,70],'failure cleanup does not write redirected external transform');h.dispose();
}

// Byte reservations cover the union of actors, and no failed admission takes
// a reservation or prevents a later actor after disposal.
{
  const h=harness({budgets:{maxDecodedModelBytes:1000}}),a=h.actor('first',(m,owned)=>mesh(m,owned));const bytes=h.runtime.stats().decodedModelBytes;ok(bytes>0&&bytes<=1000,'actual decoded snapshot fits explicit byte budget');
  rejects(()=>h.actor('second',(m,owned)=>mesh(m,owned)),/snapshot byte budget/i,'aggregate decoded bytes refuse second actor');equal(h.runtime.stats().decodedModelBytes,bytes,'failed actor keeps existing reservation exact');a.actor.dispose();equal(h.runtime.stats().decodedModelBytes,0,'disposing actor releases aggregate bytes');h.actor('second',(m,owned)=>mesh(m,owned));h.dispose();
}
{
  const h=harness({budgets:{maxWork:1000}}),m=h.actor('work',(m,owned)=>{const geometry=new THREE.PlaneGeometry(1,1,32,32),material=new THREE.MeshBasicMaterial();owned.add(geometry);owned.add(material);m.hand.add(new THREE.Mesh(geometry,material));});h.start(m);
  rejects(()=>h.runtime.update(.425),/Aggregate scene interval/i,'decoded byte comparison cost participates in preflight');equal(h.runtime.stats().time,0,'decoded work preflight advances no Scene time');equal(m.actor.stats().time,0,'decoded work preflight advances no actor time');h.dispose();
}

// A confirmed impact replaces anchor rotation with the surface frame, then
// retains the authored local quarter turn. Parent/cue scale is applied once.
for(const normal of [[0,1,0],[0,0,1]]){
  const qLocal=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
  const h=harness({fixtureOptions:{families:['impact'],mutate(pkg,sources){const cue=pkg.actions[0].cues[0];cue.transform.orientation=qLocal.toArray();cue.transform.scale=1.5;const source=sources[0],profile=JSON.parse(new TextDecoder().decode(source.profileBytes));profile.layers[0].geometry={kind:'ring',innerRadius:.1,outerRadius:.2,segments:8};source.profileBytes=jsonBytes(profile);source.reference.profile.sha256=sha256(source.profileBytes);}}});
  const m=h.actor();m.movement.scale.setScalar(2);m.visual.rotation.y=.4;h.start(m,{outcomeMode:'host-outcomes'});h.runtime.update(.875);
  ok(m.actor.presentOutcome({generation:m.actor.generation,cue:'impact',position:[14,1,0],normal,timestamp:h.runtime.stats().time}),'reviewed oriented impact accepted');
  const carrier=h.scene.children.find(n=>n.type==='Object3D'&&n.children.some(c=>c.type==='ParticleEmitter'));ok(carrier,'actual ring effect carrier found');
  const expected=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...normal)).multiply(qLocal);near(carrier.getWorldQuaternion(new THREE.Quaternion()).angleTo(expected),0,'surface frame multiplies authored local orientation');near(carrier.getWorldScale(new THREE.Vector3()).x,3,'combined parent/cue scale appears once');equal(carrier.getWorldPosition(new THREE.Vector3()).toArray(),[14,1,0],'confirmed position owns impact origin');h.dispose();
}

// Invalid-input callbacks cannot recurse beyond the declared mutation limit,
// and the originating budget error reaches the caller rather than a catch.
{
  const h=harness({fixtureOptions:{families:['beam'],mutate(pkg){pkg.targets[0]={id:'fixed',mode:'continuous-world-point',maxDistance:20,maxAgeSeconds:1,maxUpdatesPerSecond:100,clock:'presentation-seconds',generation:'match-action',sampleAt:'interval-end-before-fx',onInvalid:'retire-effect'};}}});
  let calls=0;const invalid=m=>({target:'fixed',generation:m.actor.generation-1,timestamp:h.runtime.stats().time,point:[15,0,0]});
  const a=h.actor('actor-a',undefined,(event,m)=>{if(event.type==='endpoint-invalid'){calls++;m.actor.setEndpoint(invalid(m));}}),b=h.actor('actor-b');h.start(a,{targets:{}});h.start(b,{targets:{}});
  const ambient=getThreeQuarksRuntime(h.scene).createEmitter({id:'unrelated-ambient',capacity:8,kind:'rate',rate:2,lifetime:.5,duration:3,looping:true,speed:0});
  const before=h.runtime.stats().time;let failure;try{a.actor.setEndpoint(invalid(a));}catch(error){failure=error;}
  ok(failure&&!(failure instanceof RangeError)&&/mutations.*budget/i.test(failure.message),'original mutation budget error propagates');equal(calls,64,'reentrant invalid endpoint callbacks respect 64-mutation limit');equal(a.actor.state,'idle','recursive generation retired');equal(h.runtime.stats().time,before,'callback recursion does not move Scene time');equal(b.actor.stats().time,0,'callback recursion preserves other actor');equal(ambient.stats().time,0,'callback recursion preserves ambient time');ok(ambient.stats().active&&!ambient.stats().paused,'callback recursion preserves ambient ownership/state');h.runtime.update(.1);near(b.actor.stats().time,.1,'other actor continues after isolated recursion');near(ambient.stats().time,.1,'ambient continues through the same accepted interval');h.dispose();
}

// Teardown fences admission and actor commands before synchronous rig-release
// callbacks. A callback can neither recursively tear down nor start a new
// generation that escapes the original actor snapshot. Original errors escape
// only after all old resources and the borrowed clock claim are released.
for(const mode of ['handled','unhandled']){
  const h=harness();let releases=0,blocked,b;
  const a=h.actor('actor-a',(m,owned)=>mesh(m,owned),undefined,{rigOwnership:{acquire(){return {};},release(){
    releases++;equal(h.runtime.stats().closing,true,'closing fence is visible before rig release');h.runtime.dispose();
    try{h.actor('late-actor');}catch(error){blocked=error;if(mode==='unhandled')throw error;}
    rejects(()=>h.start(b),/disposed|closing/i,'closing rejects an existing actor restart');
    rejects(()=>h.runtime.admit(h.fixture.input),/disposed|closing/i,'closing rejects package admission');
  }}});
  b=h.actor('actor-b');h.start(a);h.start(b);
  const ambient=getThreeQuarksRuntime(h.scene).createEmitter({id:'dispose-ambient',capacity:8,kind:'rate',rate:2,lifetime:.5,duration:3,looping:true,speed:0});h.runtime.update(.1);
  if(mode==='handled')h.runtime.dispose();else{let failure;try{h.runtime.dispose();}catch(error){failure=error;}equal(failure,blocked,'original release-callback error surfaces after cleanup');}
  ok(blocked&&/disposed|closing/i.test(blocked.message),'closing rejects newly registered actor');
  const state=h.runtime.stats();equal(state.disposed,true,'Scene disposal completes');equal(state.closing,false,'closing finishes even after callback failure');equal(state.actors,[],'no old or callback-created actor survives');equal(state.packages,0,'all owned package admissions released');equal(state.decodedModelBytes,0,'all decoded snapshots released');equal(state.activeEffects,0,'all owned generation handles retired');equal(h.service.stats().productionSystems,0,'no production system survives disposal');equal(h.service.stats().packages,0,'no production package lease survives disposal');
  ok(ambient.stats().active&&!ambient.stats().paused,'borrowed ambient remains active');near(ambient.stats().time,.1,'disposal does not advance ambient');h.service.update(.05);near(ambient.stats().time,.15,'caller regains the one borrowed clock after disposal');h.runtime.dispose();equal(releases,1,'recursive/repeated disposal releases each rig lease once');
  const replacement=createThreeActionScene({THREE,scene:h.scene,vfxRuntime:h.service,engineSelection,deltaPolicy});replacement.update(.05);near(ambient.stats().time,.2,'Scene registry and clock claim can be reused after cleanup');replacement.dispose();h.dispose();
}
{
  const h=harness({budgets:{maxMutations:1}}),a=h.actor('midframe',undefined,(event,m)=>{if(event.type==='marker'){m.actor.pause();h.runtime.dispose();}});h.start(a);
  const ambient=getThreeQuarksRuntime(h.scene).createEmitter({id:'midframe-ambient',capacity:8,kind:'rate',rate:2,lifetime:.5,duration:3,looping:true,speed:0});h.runtime.update(.425);
  equal(h.runtime.stats().actors,[],'internal teardown succeeds after current mutation allowance is consumed');equal(h.runtime.stats().packages,0,'mid-update disposal releases packages');near(ambient.stats().time,.375,'mid-update disposal preserves ambient at the explicit disposal boundary');h.service.update(.05);near(ambient.stats().time,.425,'ambient clock returns after mid-update disposal');h.dispose();
}

const sourceFiles=['.engine/threejs/actions/action-scene.mjs','.engine/threejs/actions/action-package.mjs','.engine/threejs/particles/three-vfx-runtime.mjs','.engine/threejs/particles/three-quarks-runtime.mjs','tests/fixtures/action-vfx/original-fixture.mjs','tests/test-action-vfx-decoded-model.mjs'];
const result={status:'passed',checks,sourceHashes:Object.fromEntries(sourceFiles.map(name=>[name,sha256(fs.readFileSync(path.join(root,name)))])),scope:'Original engineering fixtures, synthetic byte admission and actual installed Three/Quarks CPU execution. No GPU/native construction, visual acceptance or promotion claim.'};
if(process.env.HEPHAERA_ACTION_VFX_DECODED_RESULT)fs.writeFileSync(process.env.HEPHAERA_ACTION_VFX_DECODED_RESULT,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
