import {acquireThreeVfxSceneScheduler} from '../particles/three-vfx-runtime.mjs';
import {fields,number,integer,identifier,deepFreeze,fail} from '../particles/vfx-package.mjs';
import {validateActionV2Package,actionVector,plainActionData} from './action-package.mjs';

const scenes=new WeakMap(),rigWriters=new WeakMap(),registeredRoots=new WeakMap();
const EPS=1e-10;
export const DEFAULT_ACTION_SCENE_BUDGETS=Object.freeze({maxActors:16,maxPackages:16,maxSubsteps:512,maxEvents:8192,maxCallbacks:16384,maxWork:262144,maxMutations:64,maxEndpointUpdates:1000,maxHistory:128});
const compare=(a,b)=>a<b?-1:a>b?1:0;
const materialKeys=['version','type','opacity','transparent','alphaTest','alphaHash','depthTest','depthWrite','colorWrite','blending','blendSrc','blendDst','blendEquation','side','shadowSide','toneMapped','premultipliedAlpha','vertexColors','flatShading','wireframe','roughness','metalness','emissiveIntensity','envMapIntensity','clearcoat','clearcoatRoughness','transmission','ior','thickness','onBeforeCompile','customProgramCacheKey'];
const textureKeys=['map','alphaMap','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','lightMap','bumpMap','displacementMap','envMap','clearcoatMap','clearcoatNormalMap','clearcoatRoughnessMap','transmissionMap','thicknessMap'];
function materialState(material){
  const values=materialKeys.map(k=>material[k]);for(const k of ['color','emissive','attenuationColor','specularColor'])values.push(material[k]?.r,material[k]?.g,material[k]?.b);
  values.push(material.normalScale?.x,material.normalScale?.y);
  for(const k of textureKeys){const t=material[k];values.push(t,t?.version,t?.image,t?.source?.version,t?.colorSpace,t?.mapping,t?.wrapS,t?.wrapT,t?.minFilter,t?.magFilter,t?.flipY,t?.premultiplyAlpha,t?.channel,t?.offset?.x,t?.offset?.y,t?.repeat?.x,t?.repeat?.y,t?.rotation,t?.center?.x,t?.center?.y);}return values;
}
function beneath(node,root){const seen=new Set();for(let p=node;p;p=p.parent){if(p===root)return true;if(seen.has(p))return false;seen.add(p);}return false;}
function actualNode(root,name){const original=[],exact=[];root.traverse(n=>{if(n.userData?.name===name)original.push(n);if(n.name===name||n.uuid===name)exact.push(n);});const matches=original.length?original:exact;if(matches.length!==1)fail(`Expected one exported node ${name}; found ${matches.length}.`);return matches[0];}
function uniform(THREE,node){
  node.updateWorldMatrix(true,false);const e=node.matrixWorld.elements;
  if(e.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))fail('Finite bounded actor/anchor transform required.');
  const x=new THREE.Vector3(e[0],e[1],e[2]),y=new THREE.Vector3(e[4],e[5],e[6]),z=new THREE.Vector3(e[8],e[9],e[10]),s=[x.length(),y.length(),z.length()];
  if(Math.min(...s)<.0001||Math.max(...s)>1000||Math.max(...s)-Math.min(...s)>1e-5*Math.max(...s)||node.matrixWorld.determinant()<=0||Math.abs(x.dot(y))>1e-5*s[0]*s[1]||Math.abs(x.dot(z))>1e-5*s[0]*s[2]||Math.abs(y.dot(z))>1e-5*s[1]*s[2])fail('Positive uniform nonmirrored transform required; shear/nonuniform scale is unavailable.');
}
function snapshots(root){const result=[];root.traverse(n=>result.push({node:n,p:n.position.clone(),q:n.quaternion.clone(),s:n.scale.clone()}));return result;}
function reapply(values){for(const v of values){v.node.position.copy(v.p);v.node.quaternion.copy(v.q);v.node.scale.copy(v.s);}}
function compiledBoundaries(definition){
  const result=[{at:definition.duration,rank:8,type:'motion-end'}];
  for(const s of definition.steps){result.push({at:s.end,rank:2,type:'step-exit',step:s});result.push({at:s.start,rank:7,type:'step-enter',step:s});}
  for(const m of definition.markers)result.push({at:m.at,rank:3,type:'marker',marker:m});
  for(const c of definition.cues){result.push({at:c.start,rank:4,type:'cue-start',cue:c});result.push({at:c.end,rank:1,type:'cue-end',cue:c});for(const l of c.layers)result.push({at:l.start,rank:5,type:'layer-start',cue:c,layer:l});}
  return result.sort((a,b)=>a.at-b.at||a.rank-b.rank||compare(a.cue?.id??a.marker?.id??a.step?.id??'',b.cue?.id??b.marker?.id??b.step?.id??'')||compare(a.layer?.id??'',b.layer?.id??''));
}
/** One presentation scheduler for the entire actual Scene. It borrows the
 * scene VFX service and caller assets. Gameplay remains outside this module.
 * External animation owners must acquire/release the explicit rig lease.
 */
export function createThreeActionScene({THREE,scene,vfxRuntime,engineSelection,budgets:requested={},deltaPolicy,onTrace=()=>{}}={}){
  if(!scene?.isScene||!THREE||String(THREE.REVISION)!=='182'||engineSelection?.effectiveEngine!=='THREEJS'||typeof onTrace!=='function')fail('Actual selected Three r182 Scene, VFX service and trace port required.');
  if(scenes.has(scene))fail('This Scene already has an action presentation scheduler.');
  fields(requested,Object.keys(DEFAULT_ACTION_SCENE_BUDGETS),'scene action budgets');
  const budgets={...DEFAULT_ACTION_SCENE_BUDGETS,...requested};for(const[k,v]of Object.entries(budgets))integer(v,1,k==='maxWork'?16777216:k==='maxActors'||k==='maxPackages'?128:65536,k);
  const policy=plainActionData(deltaPolicy);fields(policy,['exceptionalDelta','maxDeltaSeconds','maxSubstepSeconds','hidden','resume'],'presentation delta policy');
  if(!['reject','pause','cancel'].includes(policy.exceptionalDelta)||!['pause','cancel'].includes(policy.hidden)||policy.resume!=='discard-backlog')fail('Explicit bounded exceptional/hidden/resume policy required.');number(policy.maxDeltaSeconds,.001,30,'maxDeltaSeconds');number(policy.maxSubstepSeconds,.001,.1,'maxSubstepSeconds');
  const clock=acquireThreeVfxSceneScheduler(vfxRuntime,{THREE,scene}),actors=new Map(),packages=new Map();
  let disposed=false,suspended=false,updating=false,sceneTime=0,serial=0,frame=0,transactionDepth=0,counts=null,failures=[],history=[],endpointHistory=[],totalUpdates=0,totalSubsteps=0;
  const alive=()=>{if(disposed||clock.stats().disposed)fail('Action scene or borrowed VFX service is disposed.');};
  function consume(kind,amount=1){if(!counts)return;if(kind!=='work')counts[kind]+=amount;counts.work+=amount;if(counts[kind]>budgets[{events:'maxEvents',callbacks:'maxCallbacks',substeps:'maxSubsteps',mutations:'maxMutations',work:'maxWork'}[kind]]||counts.work>budgets.maxWork)fail(`Aggregate scene ${kind} work budget exceeded.`);}
  function transaction(fn){const outer=transactionDepth++===0;if(outer&&!updating){counts={events:0,callbacks:0,substeps:0,mutations:0,work:0};failures=[];}try{return fn();}finally{transactionDepth--;if(outer&&!updating)counts=null;}}
  function remember(event){history.push(event);if(history.length>budgets.maxHistory)history.shift();}
  function valid(a,g,c){return!disposed&&!a.disposed&&a.generation===g&&a.current===c;}
  function pausedEffect(a,r){return a.paused&&r.cue.lifetime.pause==='follow-action'||a.blockedFrame===frame&&updating&&r.cue.lifetime.pause==='follow-action';}
  function syncPause(a){for(const r of a.effects.values()){if(pausedEffect(a,r))r.lease.pause();else r.lease.resume();}}
  function releaseRig(a,preserve=true){
    if(!a.mixer){for(const n of a.locked)if(rigWriters.get(n)===a)rigWriters.delete(n);a.locked.clear();a.releaseExternal?.();return;}const saved=preserve?snapshots(a.root):null;
    try{a.mixer.stopAllAction();a.mixer.uncacheRoot(a.root);if(saved)reapply(saved);a.root.updateMatrixWorld(true);}finally{for(const n of a.locked)if(rigWriters.get(n)===a)rigWriters.delete(n);a.locked.clear();a.mixer=null;a.clipAction=null;a.releaseExternal?.();}
  }
  function removeEffect(a,r){if(a.effects.get(r.id)!==r)return; a.effects.delete(r.id);try{r.lease.retire();}finally{r.carrier.removeFromParent();}}
  function halt(a,kind,notify=true){
    const previous=a.current,retired=[...a.effects.values()];a.generation++;a.current=null;a.paused=false;a.blockedFrame=updating?frame:-1;a.endpoints.clear();a.pending=[];
    let error;try{releaseRig(a,true);}catch(e){error=e;}for(const r of retired)try{removeEffect(a,r);}catch(e){error??=e;}
    if(notify&&previous)emit(a,kind,{previousAction:previous.definition.id},a.generation,null);
    if(error)throw error;
  }
  function callback(fn,event,a,g,c){
    consume('callbacks');try{const result=fn(event);if(result&&typeof result.then==='function')fail('Presentation callbacks must finish synchronously.');}catch(error){if(a&&valid(a,g,c)){try{halt(a,'action-failed',false);}catch(cleanup){failures.push(cleanup);}}failures.push(error);if(!updating)throw error;}
    return a?valid(a,g,c):!disposed;
  }
  function trace(type,detail={},a=null,g=a?.generation,c=a?.current){const event=deepFreeze({type,sceneTime,...(a?{actor:a.id,generation:g,time:c?.time??0}:{}),...detail});remember(event);return callback(onTrace,event,a,g,c);}
  function emit(a,type,detail={},g=a.generation,c=a.current){
    if(!valid(a,g,c))return false;consume('events');const event=deepFreeze({type,sceneTime,actor:a.id,generation:g,action:c?.definition.id??null,time:c?.time??0,...detail});remember(event);
    if(!callback(a.onEvent,event,a,g,c))return false;return callback(onTrace,event,a,g,c);
  }
  function assertActor(a){if(!beneath(a.root,scene)||!beneath(a.movementRoot,scene)||!beneath(a.root,a.movementRoot))fail('Actor or movement root left its declared Scene/hierarchy.');uniform(THREE,a.root);for(const n of a.anchors.values()){if(!beneath(n,a.root))fail('Exported anchor left its actor.');uniform(THREE,n);}}
  function assertSourceClips(a){
    consume('work',a.sourceWork);for(const s of a.sourceRecords){if(s.clip.name!==s.name||s.clip.duration!==s.duration||s.clip.tracks.length!==s.tracks.length||s.clip.tracks.some((t,i)=>t!==s.tracks[i].source))fail('Borrowed source clip identity changed.');for(const t of s.tracks){if(t.source.name!==t.name||t.source.getInterpolation()!==t.interpolation||t.source.times.length!==t.times.length||t.source.values.length!==t.values.length||t.source.times.some((v,i)=>v!==t.times[i])||t.source.values.some((v,i)=>v!==t.values[i]))fail('Borrowed source clip samples changed; obtain fresh receiving evidence.');}}
  }
  function assertMaterials(a){consume('work',a.materialWork);for(const record of a.materialRecords){const actual=Array.isArray(record.node.material)?record.node.material:[record.node.material];if(actual.length!==record.materials.length||actual.some((m,i)=>m!==record.materials[i].material))fail('Borrowed model material binding changed.');for(const s of record.materials){const state=materialState(s.material);if(state.length!==s.state.length||state.some((v,i)=>!Object.is(v,s.state[i])))fail('Borrowed model material/texture state changed; obtain fresh receiving evidence.');}}}
  function anchorMatrix(a,cue){const n=a.anchors.get(cue.anchor);if(!n||!beneath(n,a.root))fail('Actual exported anchor is unavailable.');uniform(THREE,n);const local=new THREE.Matrix4().compose(new THREE.Vector3(...cue.transform.position),new THREE.Quaternion(...cue.transform.orientation),new THREE.Vector3().setScalar(cue.transform.scale));return n.matrixWorld.clone().multiply(local);}
  function worldTransform(matrix,carrier){uniform(THREE,scene);const local=new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(matrix);local.decompose(carrier.position,carrier.quaternion,carrier.scale);uniform(THREE,carrier);}
  function captureCue(a,c){
    if(c.snapshots.has(c.cue.id))return c.snapshots.get(c.cue.id);
    const matrix=anchorMatrix(a,c.cue),position=new THREE.Vector3().setFromMatrixPosition(matrix),point=c.cue.target?c.current.targets[c.cue.target]:null;
    if(point&&position.distanceTo(new THREE.Vector3(...point))>a.declaration.package.targets.find(t=>t.id===c.cue.target).maxDistance)fail('Fixed target exceeds range from the exact delivered release anchor.');
    const result={matrix,origin:position.toArray(),target:point?[...point]:null,sceneStart:sceneTime,actionStart:c.current.time};c.snapshots.set(c.cue.id,result);return result;
  }
  function invalidEndpoint(a,target,reason){
    const g=a.generation,c=a.current;for(const r of [...a.effects.values()])if(r.cue.target===target)removeEffect(a,r);
    if(c)c.invalidTargets.add(target);if(c&&valid(a,g,c))emit(a,'endpoint-invalid',{target,reason},g,c);return false;
  }
  function endpoint(a,cue,time,origin){
    const target=a.declaration.package.targets.find(t=>t.id===cue.target);if(target.mode==='fixed-world-point')return a.current.targets[cue.target];
    const sample=a.endpoints.get(target.id);
    if(!sample||sample.generation!==a.generation||sample.timestamp>time+EPS||time-sample.timestamp>target.maxAgeSeconds+EPS||new THREE.Vector3(...origin).distanceTo(new THREE.Vector3(...sample.point))>target.maxDistance){invalidEndpoint(a,target.id,'missing-stale-or-out-of-range');return null;}return sample.point;
  }
  function poseEffect(a,r,time){
    if(!valid(a,r.generation,r.current)||a.effects.get(r.id)!==r)return false;
    consume('work');
    if(r.stopped&&r.cue.lifetime.tailAttachment==='capture-world-on-stop')return true;
    if(!beneath(a.root,scene)||!beneath(a.anchors.get(r.cue.anchor),a.root)){removeEffect(a,r);return false;}
    let matrix=r.snapshot.matrix.clone();
    if(r.cue.placement==='anchor-follow'||r.cue.placement==='beam')matrix=anchorMatrix(a,r.cue);
    if(r.cue.placement==='fixed-target-projectile'){
      const progress=Math.max(0,Math.min(1,(r.cue.lifetime.pause==='continue-on-scene'?time-r.snapshot.sceneStart:(a.current.time-r.cue.start))/(r.cue.end-r.cue.start)));
      matrix.setPosition(new THREE.Vector3(...r.snapshot.origin).lerp(new THREE.Vector3(...r.snapshot.target),progress));
    }else if(r.cue.placement==='fixed-target')matrix.setPosition(new THREE.Vector3(...r.snapshot.target));
    worldTransform(matrix,r.carrier);
    const position=r.carrier.getWorldPosition(new THREE.Vector3()).toArray();
    if(r.cue.trail&&r.lastPosition&&new THREE.Vector3(...position).distanceTo(new THREE.Vector3(...r.lastPosition))>r.cue.trail.distanceMeters){r.lease.resetHistory();if(!trace('trail-reset',{cue:r.cue.id,layer:r.layer.id},a,r.generation,r.current))return false;}
    r.lastPosition=position;
    if(r.layer.family==='beam'){
      const origin=new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),point=endpoint(a,r.cue,time,origin);if(!point)return false;
      r.lease.setEndpoints({start:origin,end:point,widthScale:new THREE.Vector3().setFromMatrixScale(matrix).x});r.currentTarget=[...point];
    }
    return true;
  }
  function acquireLayer(a,current,cue,layer,snapshot){
    const g=a.generation,source=a.packageEntry.sources.get(cue.source);
    const initialMatrix=layer.family==='beam'?anchorMatrix(a,cue):snapshot.matrix,initialOrigin=new THREE.Vector3().setFromMatrixPosition(initialMatrix).toArray();
    const target=layer.family==='beam'?endpoint(a,cue,sceneTime,initialOrigin):null;if(layer.family==='beam'&&!target||!valid(a,g,current))return;
    const id=`action-${++serial}`,carrier=new THREE.Object3D();scene.add(carrier);
    let lease;try{
      worldTransform(initialMatrix,carrier);const reduction=cue.overrides?.find(o=>o.layer===layer.id),overrides=reduction?Object.fromEntries(Object.entries(reduction).filter(([k])=>k!=='layer')):undefined;
      lease=vfxRuntime.acquire({package:source.handle,effectId:source.source.effectId,layerId:layer.id,id,ownerId:a.id,parent:carrier,schedulerTiming:true,
        ...(overrides?{overrides}:{}),...(layer.family==='trail'?{maxHistoryPoints:cue.trail.maxSamples}:{}),...(layer.family==='beam'?{endpoints:{start:initialOrigin,end:target,widthScale:new THREE.Vector3().setFromMatrixScale(initialMatrix).x}}:{})});
      if(!valid(a,g,current)){lease.retire();carrier.removeFromParent();return;}
      const stopActionTime=snapshot.outcome?snapshot.actionStart+(layer.stopAt-cue.start):layer.stopAt,retireActionTime=snapshot.outcome?snapshot.actionStart+(layer.retireAt-cue.start):layer.retireAt;
      const r={id,lease,carrier,cue,layer,snapshot,current,stopActionTime,retireActionTime,stopSceneTime:sceneTime+layer.emissionDurationSeconds,retireSceneTime:sceneTime+layer.emissionDurationSeconds+layer.tailSeconds,
        stopRemaining:layer.emissionDurationSeconds,tailRemaining:layer.tailSeconds,stopped:false,generation:g,startedScene:sceneTime,lastPosition:null,currentTarget:target?[...target]:snapshot.target};a.effects.set(id,r);poseEffect(a,r,sceneTime);syncPause(a);
      emit(a,'layer-start',{cue:cue.id,layer:layer.id,family:layer.family,origin:[...snapshot.origin],target:r.currentTarget},g,current);
    }catch(error){lease?.retire();carrier.removeFromParent();throw error;}
  }
  function stopLayer(a,r){
    if(a.effects.get(r.id)!==r||r.stopped)return;r.stopped=true;r.stopRemaining=0;r.tailRemaining=Math.max(0,r.cue.lifetime.pause==='continue-on-scene'?r.retireSceneTime-sceneTime:r.retireActionTime-r.current.time);
    // Carrier was sampled at this exact stop boundary before the last FX step.
    // A captured tail keeps that transform, even when locomotion resumes.
    r.lease.stopEmission({maxTailSeconds:r.layer.tailSeconds});
    emit(a,'layer-stop',{cue:r.cue.id,layer:r.layer.id,worldPosition:r.carrier.getWorldPosition(new THREE.Vector3()).toArray()});
    if(a.effects.get(r.id)===r&&(!r.tailRemaining||r.lease.stats().retired)){removeEffect(a,r);emit(a,'layer-retire',{cue:r.cue.id,layer:r.layer.id});completeIfReady(a);}
  }
  function completeIfReady(a){const c=a.current;if(c&&c.motionEnded&&!a.effects.size&&!a.pending.length&&!c.complete){c.complete=true;emit(a,'action-complete');}}
  function transition(a,boundary){
    const c=a.current,g=a.generation;if(!c)return;
    if(boundary.type==='cue-start'){
      if(c.outcomeMode==='host-outcomes'&&boundary.cue.placement==='fixed-target'&&boundary.cue.layers.some(l=>l.family==='impact')){c.suppressed.add(boundary.cue.id);return;}
      const snap=captureCue(a,{cue:boundary.cue,current:c,snapshots:c.snapshots});emit(a,'cue-start',{cue:boundary.cue.id,origin:snap.origin,target:snap.target},g,c);
    }else if(boundary.type==='layer-start'){
      if(c.suppressed.has(boundary.cue.id)||c.invalidTargets.has(boundary.cue.target))return;
      const snapshot=c.snapshots.get(boundary.cue.id)??captureCue(a,{cue:boundary.cue,current:c,snapshots:c.snapshots});acquireLayer(a,c,boundary.cue,boundary.layer,snapshot);
    }else if(boundary.type==='motion-end'){
      c.motionEnded=true;releaseRig(a,true);emit(a,'motion-end',{},g,c);if(valid(a,g,c))completeIfReady(a);
    }else if(boundary.type==='marker')emit(a,'marker',{marker:boundary.marker.name,markerId:boundary.marker.id,step:boundary.marker.step,occurrence:boundary.marker.occurrence},g,c);
    else if(boundary.type==='cue-end'){if(!c.suppressed.has(boundary.cue.id))emit(a,'cue-end',{cue:boundary.cue.id},g,c);}
    else emit(a,boundary.type,{step:boundary.step.id,occurrence:boundary.step.occurrence},g,c);
  }
  function processDue(){
    let loops=0;
    while(!disposed){
      if(++loops>budgets.maxEvents+budgets.maxMutations)fail('Aggregate same-time transition budget exceeded.');
      const due=[];
      for(const a of actors.values()){
        for(const r of a.effects.values())if(r.observedRetired||r.stopped&&r.tailRemaining<=0)due.push({a,r,rank:-1,key:r.cue.id+'/'+r.layer.id,retire:true});else if(r.stopRemaining<=0&&!r.stopped)due.push({a,r,rank:0,key:r.cue.id+'/'+r.layer.id});
        const c=a.current;if(!c||c.complete||a.paused||a.blockedFrame===frame&&updating)continue;const b=c.boundaries[c.cursor];if(b&&b.at<=c.time)due.push({a,b,rank:b.rank,key:b.cue?.id??b.marker?.id??b.step?.id??''});
        for(const pending of a.pending)if(pending.remaining<=0)due.push({a,pending,rank:5,key:pending.cue.id+'/'+pending.layer.id});
      }
      if(!due.length)break;due.sort((x,y)=>compare(x.a.id,y.a.id)||x.rank-y.rank||compare(x.key,y.key));const d=due[0],g=d.a.generation,c=d.a.current;
      try{consume('work');if(d.r){if(d.retire){removeEffect(d.a,d.r);emit(d.a,'layer-retire',{cue:d.r.cue.id,layer:d.r.layer.id});completeIfReady(d.a);}else stopLayer(d.a,d.r);}else if(d.pending){d.a.pending=d.a.pending.filter(p=>p!==d.pending);acquireLayer(d.a,c,d.pending.cue,d.pending.layer,d.pending.snapshot);}else{c.cursor++;transition(d.a,d.b);}}
      catch(error){if(valid(d.a,g,c))halt(d.a,'action-failed',false);failures.push(error);if(!updating)throw error;}
    }
  }
  function sample(a,time){const c=a.current;if(!c)return;consume('work',a.poseWork);assertActor(a);assertMaterials(a);if(!c.motionEnded&&a.mixer){assertSourceClips(a);a.mixer.setTime(Math.min(time,c.definition.duration));a.root.updateMatrixWorld(true);}for(const r of [...a.effects.values()])poseEffect(a,r,sceneTime);}
  function nextDelta(remaining){
    let next=Math.min(remaining,policy.maxSubstepSeconds,clock.maxUpdateSeconds);
    for(const a of actors.values()){
      const c=a.current;if(c&&!c.complete&&!a.paused&&a.blockedFrame!==frame){const b=c.boundaries[c.cursor];if(b)next=Math.min(next,Math.max(0,b.at-c.time));}
      if(c&&!c.complete&&!a.paused&&a.blockedFrame!==frame)for(const p of a.pending)next=Math.min(next,Math.max(0,p.remaining));
      for(const r of a.effects.values())if(!pausedEffect(a,r))next=Math.min(next,Math.max(0,r.stopped?r.tailRemaining:r.stopRemaining));
    }return next;
  }
  function preflight(delta){
    const points=new Set([0,delta]);let events=0,active=0;
    for(const a of actors.values()){
      const c=a.current;active+=a.effects.size;if(c&&!c.complete&&!a.paused){for(let i=c.cursor;i<c.boundaries.length;i++){const d=c.boundaries[i].at-c.time;if(d>delta+EPS)break;if(d>=-EPS){points.add(Math.max(0,Math.min(delta,d)));events++;}}for(const cue of c.definition.cues)for(const l of cue.layers)for(const at of [l.stopAt,l.retireAt]){const d=at-c.time;if(d>=0&&d<=delta){points.add(d);events++;}}}
      for(const r of a.effects.values())if(!pausedEffect(a,r)){const stop=r.stopped?Infinity:r.stopRemaining,retire=r.stopped?r.tailRemaining:r.stopRemaining+r.tailRemaining;if(stop<=delta){points.add(stop);events++;}if(retire<=delta){points.add(retire);events++;}}
      if(c&&!c.complete&&!a.paused)for(const pending of a.pending)for(const d of [pending.remaining,pending.remaining+pending.layer.emissionDurationSeconds,pending.remaining+pending.layer.emissionDurationSeconds+pending.layer.tailSeconds])if(d<=delta){points.add(d);events++;}
    }
    const sorted=[...points].sort((a,b)=>a-b),step=Math.min(policy.maxSubstepSeconds,clock.maxUpdateSeconds,...[...packages.values()].flatMap(e=>e.declaration.effectSources.map(s=>s.declaration.profile.budgets.maxUpdateSeconds)));
    let steps=0;for(let i=1;i<sorted.length;i++)steps+=Math.ceil(Math.max(0,sorted[i]-sorted[i-1])/step);
    // Include every potentially starting layer/tail and all observer calls.
    events+=active*2+actors.size;const sourceWork=[...actors.values()].reduce((n,a)=>n+(a.current?a.poseWork+a.materialWork+(!a.current.motionEnded?a.sourceWork:0):0),0);
    const work=steps*(2+actors.size+active+events+sourceWork)+events*8,callbacks=events*2+steps;
    if(steps>budgets.maxSubsteps||events>budgets.maxEvents||callbacks>budgets.maxCallbacks||work>budgets.maxWork)fail('Aggregate scene interval exceeds the declared substep/event/callback/work budget; no time advanced.');
  }
  function admit(input){
    alive();if(updating)fail('Cannot admit packages during a scene update.');if(packages.size>=budgets.maxPackages)fail('Scene admitted package budget exceeded.');
    const declaration=validateActionV2Package(input,engineSelection);if([...packages.values()].some(e=>e.declaration.packageSha256===declaration.packageSha256))fail('Action package is already admitted; reuse its handle.');
    const sources=new Map();try{for(const s of declaration.effectSources){const d=s.declaration,handle=vfxRuntime.admit({package:d.package,packageSha256:d.packageSha256,...(d.preparationSha256===undefined?{}:{preparationSha256:d.preparationSha256}),profile:d.profile,bindings:s.bindings});sources.set(s.id,{...s,handle});}}catch(error){for(const s of sources.values())vfxRuntime.releasePackage(s.handle);throw error;}
    const handle=Object.freeze({packageSha256:declaration.packageSha256,asset:declaration.package.asset,version:declaration.package.version,mode:declaration.nativeAdmission.mode});packages.set(handle,{declaration,sources});return handle;
  }
  function createActor({id,visualRoot,movementRoot=visualRoot,animations,package:handle,onEvent=()=>{},rigOwnership}={}){
    alive();if(updating)fail('Cannot register an actor during a scene update.');identifier(id);if(actors.has(id)||actors.size>=budgets.maxActors)fail('Unique actor identity and finite scene inventory required.');
    const entry=packages.get(handle);if(!entry)fail('Action package handle belongs to this Scene only.');
    if(!visualRoot?.isObject3D||!movementRoot?.isObject3D||!beneath(visualRoot,movementRoot)||!beneath(visualRoot,scene)||registeredRoots.has(visualRoot)||typeof onEvent!=='function')fail('Unique actual visual root under its movement root/Scene required.');
    if(!Array.isArray(animations)||animations.length>128)fail('Bounded actual exported clips required.');
    if(rigOwnership!==undefined&&(!rigOwnership||typeof rigOwnership.acquire!=='function'||typeof rigOwnership.release!=='function'))fail('External rig ownership requires explicit acquire/release ports.');
    const a={id,root:visualRoot,movementRoot,declaration:entry.declaration,packageEntry:entry,onEvent,rigOwnership,externalLease:null,anchors:new Map(),clips:new Map(),sourceRecords:[],sourceWork:1,poseWork:1,materialRecords:[],materialWork:0,locked:new Set(),effects:new Map(),pending:[],endpoints:new Map(),generation:0,current:null,paused:false,disposed:false,mixer:null,clipAction:null,blockedFrame:-1};
    const p=entry.declaration.package,members=new Set();visualRoot.traverse(n=>{members.add(n);if(members.size>10000)fail('Actor node inventory exceeds the bounded presentation profile.');});
    visualRoot.traverse(n=>{if(n.isSkinnedMesh&&n.skeleton.bones.some(b=>!members.has(b)))fail('Shared/external skeleton bones require a skeleton-aware actor clone.');});
    for(const anchor of p.anchors)a.anchors.set(anchor.id,actualNode(visualRoot,anchor.node));
    for(const node of members)if(node.material){const materials=Array.isArray(node.material)?node.material:[node.material];if(materials.length>128||materials.some(m=>!m?.isMaterial))fail('Bounded actual borrowed model materials required.');a.materialRecords.push({node,materials:materials.map(material=>({material,state:materialState(material)}))});a.materialWork+=materials.length;}
    const root=actualNode(visualRoot,p.rig.rootBone??p.rig.rootNode),ancestors=new Set([root]);for(let n=root.parent;n;n=n.parent){ancestors.add(n);if(n===visualRoot)break;}
    a.poseWork=Math.max(1,Math.ceil(members.size/16)+a.anchors.size);const names=new Set();let samples=0,trackCount=0;
    for(const clip of animations){
      if(names.has(clip.name))fail('Duplicate actual composite clip names.');names.add(clip.name);const definition=p.actions.find(v=>v.clip===clip.name);if(!definition)continue;
      if(!clip.isAnimationClip&&!(clip instanceof THREE.AnimationClip)||!clip.tracks.length||Math.abs(clip.duration-definition.duration)>Math.max(.0001,definition.duration*.00001))fail('Exact exported composite clip/duration required.');
      const tracks=[],sourceTracks=[];for(const track of clip.tracks){
        const parsed=THREE.PropertyBinding.parseTrackName(track.name),target=parsed.objectName==='bones'?actualNode(visualRoot,parsed.objectIndex):parsed.nodeName?actualNode(visualRoot,parsed.nodeName):visualRoot;
        if(!members.has(target)||!['position','quaternion','scale','morphTargetInfluences'].includes(parsed.propertyName))fail('Unsupported or external animation write target.');
        const width=track.getValueSize(),interpolation=track.getInterpolation();samples+=track.values.length+track.times.length;trackCount++;if(!(track.times instanceof Float32Array)||!(track.values instanceof Float32Array)||samples>4194304||trackCount>8192||!width||!track.times.length||track.times.some((v,i)=>!Number.isFinite(v)||v<0||v>definition.duration+.001||i>0&&v<=track.times[i-1])||track.values.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9))fail('Bounded finite actual glTF Float32 clip samples required.');
        if(![THREE.InterpolateDiscrete,THREE.InterpolateLinear,THREE.InterpolateSmooth].includes(interpolation)||(parsed.propertyName==='quaternion'?width!==4:['position','scale'].includes(parsed.propertyName)?width!==3:false))fail('Unsupported custom/cubic-spline interpolant or animation channel width; no interpolation fallback is permitted.');
        if(ancestors.has(target)&&['position','quaternion','scale'].includes(parsed.propertyName)){const first=track.values.slice(0,width);if(track.values.some((v,i)=>Math.abs(v-first[i%width])>1e-6))fail('Composite root/ancestors must remain in place.');}
        const Track=parsed.propertyName==='quaternion'?THREE.QuaternionKeyframeTrack:parsed.propertyName==='morphTargetInfluences'?THREE.NumberKeyframeTrack:THREE.VectorKeyframeTrack;
        const copy=new Track(track.name,new Float32Array(track.times),new Float32Array(track.values),track.getInterpolation());tracks.push(copy);sourceTracks.push({source:track,name:track.name,times:new Float32Array(track.times),values:new Float32Array(track.values),interpolation:track.getInterpolation()});
      }
      a.clips.set(clip.name,new THREE.AnimationClip(clip.name,clip.duration,tracks));a.sourceRecords.push({clip,name:clip.name,duration:clip.duration,tracks:sourceTracks});
    }
    a.sourceWork=Math.max(1,Math.ceil(samples/256));for(const definition of p.actions)if(!a.clips.has(definition.clip))fail('Actual exported composite clip is missing.');
    function actorLive(){alive();if(a.disposed)fail('Action actor is disposed.');}
    function unlock(){if(a.externalLease!==null){const lease=a.externalLease;a.externalLease=null;const result=a.rigOwnership.release(lease);if(result&&typeof result.then==='function')fail('External rig release must finish synchronously.');}}
    // External mixers cooperate through these two host ports; their internals
    // cannot be discovered safely through Three.js globals or userData.
    a.releaseExternal=unlock;
    function start(actionId,options={}){return transaction(()=>{
      actorLive();consume('mutations');fields(options,['targets','outcomeMode'],'action start');if(!['rehearsal','host-outcomes'].includes(options.outcomeMode))fail('Explicit rehearsal or host-outcomes mode required.');
      const definition=p.actions.find(v=>v.id===actionId);if(!definition)fail('Unknown compiled action.');
      const targetInputs=plainActionData(options.targets??{});fields(targetInputs,p.targets.filter(t=>t.mode==='fixed-world-point').map(t=>t.id),'fixed target snapshots');const targets={};for(const cue of definition.cues){const target=p.targets.find(t=>t.id===cue.target);if(target?.mode==='fixed-world-point')targets[target.id]=actionVector(targetInputs[target.id],3,'fixed target snapshot');}
      const expectedGeneration=a.generation+1;halt(a,'action-cancelled',false);if(a.generation!==expectedGeneration||a.current!==null)return a.generation;assertActor(a);assertSourceClips(a);assertMaterials(a);
      for(const n of members){const writer=rigWriters.get(n);if(writer&&writer!==a)fail('Actor root/bones already have a rig-write owner.');}
      if(rigOwnership){const generation=a.generation,lease=rigOwnership.acquire(Object.freeze({actor:id,generation,visualRoot}));if(lease===false||lease===undefined||lease===null||typeof lease.then==='function')fail('External animation owner denied synchronous rig-write ownership.');if(a.generation!==generation||a.current!==null){rigOwnership.release(lease);return a.generation;}a.externalLease=lease;}
      try{for(const n of members){rigWriters.set(n,a);a.locked.add(n);}
      a.mixer=new THREE.AnimationMixer(visualRoot);a.clipAction=a.mixer.clipAction(a.clips.get(definition.clip));a.clipAction.setLoop(THREE.LoopOnce,1);a.clipAction.clampWhenFinished=true;a.clipAction.play();a.mixer.update(0);visualRoot.updateMatrixWorld(true);}catch(error){halt(a,'action-failed',false);throw error;}
      const c={definition,time:0,boundaries:compiledBoundaries(definition),cursor:0,targets,snapshots:new Map(),invalidTargets:new Set(),suppressed:new Set(),outcomes:new Set(),outcomeMode:options.outcomeMode,motionEnded:false,complete:false,sceneStarted:sceneTime};a.current=c;a.paused=false;a.blockedFrame=updating?frame:-1;
      const g=a.generation;try{emit(a,'action-started',{},g,c);if(valid(a,g,c)){const blocked=a.blockedFrame;a.blockedFrame=-1;processDue();if(valid(a,g,c))a.blockedFrame=blocked;syncPause(a);}}catch(error){if(valid(a,g,c))halt(a,'action-failed',false);throw error;}return a.generation;
    });}
    const api=Object.freeze({start,play:start,get generation(){return a.generation;},get state(){return a.disposed?'disposed':!a.current?'idle':a.current.complete?'complete':a.paused?'paused':a.current.motionEnded?'draining':'playing';},
      pause(){return transaction(()=>{actorLive();consume('mutations');a.paused=true;if(updating)a.blockedFrame=frame;syncPause(a);return true;});},
      resume(){return transaction(()=>{actorLive();consume('mutations');assertActor(a);a.paused=false;syncPause(a);return true;});},
      cancel(){return transaction(()=>{actorLive();consume('mutations');halt(a,'action-cancelled');});},
      reset(){return transaction(()=>{actorLive();consume('mutations');halt(a,'action-reset');});},
      setEndpoint(input){return transaction(()=>{
        actorLive();fields(input,['target','generation','timestamp','point'],'live endpoint');const c=a.current,target=p.targets.find(t=>t.id===input.target);if(!c||!target||target.mode!=='continuous-world-point')fail('Active declared continuous endpoint required.');
        try{number(input.timestamp,0,sceneTime+EPS,'endpoint timestamp');const point=actionVector(input.point,3,'endpoint');if(input.generation!==a.generation) return invalidEndpoint(a,target.id,'generation');
          const old=a.endpoints.get(target.id);if(old&&input.timestamp<=old.timestamp)return invalidEndpoint(a,target.id,'nonmonotonic');const times=(old?.times??[]).filter(t=>t>sceneTime-1);if(times.length>=Math.min(target.maxUpdatesPerSecond,budgets.maxEndpointUpdates))return invalidEndpoint(a,target.id,'rate');
          endpointHistory=endpointHistory.filter(t=>t>sceneTime-1);if(endpointHistory.length>=budgets.maxEndpointUpdates)return invalidEndpoint(a,target.id,'scene-rate');endpointHistory.push(input.timestamp);
          a.endpoints.set(target.id,{generation:a.generation,timestamp:input.timestamp,point,times:[...times,input.timestamp]});return true;
        }catch(error){invalidEndpoint(a,target.id,'invalid-input');return false;}
      });},
      presentOutcome(input){return transaction(()=>{
        actorLive();consume('mutations');fields(input,['generation','cue','position','normal','timestamp'],'presentation outcome');const c=a.current;if(!c||c.complete||c.outcomeMode!=='host-outcomes'||input.generation!==a.generation)return false;
        const cue=c.definition.cues.find(v=>v.id===input.cue&&v.placement==='fixed-target'&&v.layers.some(l=>l.family==='impact'));if(!cue||c.outcomes.has(cue.id)||c.time<cue.start-EPS||c.time+(cue.retireAt-cue.start)>c.definition.retireAt+EPS)return false;
        number(input.timestamp,Math.max(0,sceneTime-policy.maxDeltaSeconds),sceneTime,'outcome timestamp');const position=actionVector(input.position,3,'outcome position'),normal=actionVector(input.normal,3,'outcome normal',1);if(Math.abs(new THREE.Vector3(...normal).length()-1)>1e-5)fail('Normalized outcome normal required.');
        c.outcomes.add(cue.id);const snapshot={matrix:anchorMatrix(a,cue),origin:position,target:position,sceneStart:sceneTime,actionStart:c.time,outcome:true};snapshot.matrix.setPosition(new THREE.Vector3(...position));
        // Outcome normal is a bounded presentation input, never a contact test.
        const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...normal)),scale=new THREE.Vector3().setFromMatrixScale(snapshot.matrix);snapshot.matrix.compose(new THREE.Vector3(...position),rotation,scale);
        const generation=a.generation;try{for(const layer of cue.layers){if(!valid(a,generation,c))return false;const delay=layer.start-cue.start;if(delay>EPS)a.pending.push({cue,layer,snapshot,remaining:delay});else acquireLayer(a,c,cue,layer,snapshot);}if(valid(a,generation,c))emit(a,'presentation-outcome',{cue:cue.id,position,normal},generation,c);return valid(a,generation,c);}catch(error){if(valid(a,generation,c))halt(a,'action-failed',false);throw error;}
      });},
      stats(){return deepFreeze({id,state:api.state,generation:a.generation,time:a.current?.time??0,motionEnded:a.current?.motionEnded??false,activeEffects:a.effects.size,effects:[...a.effects.values()].map(r=>({id:r.id,cue:r.cue.id,layer:r.layer.id,family:r.layer.family,generation:r.generation,age:r.lease.stats().time,tailRemaining:r.tailRemaining,paused:r.lease.stats().paused,draining:r.stopped,worldPosition:r.carrier.getWorldPosition(new THREE.Vector3()).toArray(),origin:[...r.snapshot.origin],target:r.currentTarget?[...r.currentTarget]:null,handle:r.lease.stats()}))});},
      dispose(){if(a.disposed)return;transaction(()=>{consume('mutations');a.disposed=true;try{halt(a,'actor-disposed',false);}finally{actors.delete(id);registeredRoots.delete(visualRoot);}});}
    });a.api=api;assertActor(a);actors.set(id,a);registeredRoots.set(visualRoot,a);return api;
  }
  const api=Object.freeze({admit,createActor,
    releasePackage(handle){alive();if([...actors.values()].some(a=>a.packageEntry===packages.get(handle)))fail('Dispose package actors before releasing their package.');const e=packages.get(handle);if(!e)return false;for(const s of e.sources.values())vfxRuntime.releasePackage(s.handle);packages.delete(handle);return true;},
    update(delta){return transaction(()=>{
      alive();if(updating)fail('Scene action clock cannot reenter.');number(delta,0,Number.MAX_SAFE_INTEGER,'presentation delta');
      if(delta>policy.maxDeltaSeconds){if(policy.exceptionalDelta==='pause'){api.suspend('exceptional-delta');return api.stats();}if(policy.exceptionalDelta==='cancel'){for(const a of [...actors.values()])a.api.cancel();return api.stats();}fail('Exceptional presentation delta rejected; no backlog replay.');}
      if(suspended||delta===0)return api.stats();if(clock.stats().paused)fail('Borrowed scene clock is globally paused; use host scene suspension/resume.');
      preflight(delta);frame++;updating=true;counts={events:0,callbacks:0,substeps:0,mutations:0,work:0};failures=[];const end=sceneTime+delta;
      try{
        for(const a of actors.values()){a.blockedFrame=-1;syncPause(a);}processDue();
        while(!disposed&&sceneTime<end){
          const dt=nextDelta(end-sceneTime);if(dt<=0){processDue();if(nextDelta(end-sceneTime)<=0)fail('Presentation scheduler made no bounded progress.');continue;}
          consume('substeps');const next=sceneTime+dt;sceneTime=next;
          for(const a of [...actors.values()].sort((a,b)=>compare(a.id,b.id))){
            const c=a.current,g=a.generation;if(!c)continue;const advancing=!a.paused&&a.blockedFrame!==frame&&!c.complete;
            if(advancing){const nextBoundary=c.boundaries[c.cursor]?.at;c.time=Math.min(c.definition.retireAt,nextBoundary!==undefined&&nextBoundary>=c.time&&nextBoundary-c.time<=dt?nextBoundary:c.time+dt);for(const pending of a.pending)pending.remaining=Math.max(0,pending.remaining-dt);}
            try{consume('work');sample(a,c.time);}catch(error){if(valid(a,g,c))halt(a,'action-failed',false);failures.push(error);}
          }
          // All needed delivered poses/endpoints are now at b. Advance exactly
          // the previously active FX once, then apply stable transitions at b.
          clock.update(dt);totalSubsteps++;
          for(const a of actors.values())for(const r of [...a.effects.values()]){
            if(!pausedEffect(a,r)){const sceneClock=r.cue.lifetime.pause==='continue-on-scene';if(r.stopped)r.tailRemaining=Math.max(0,sceneClock?r.retireSceneTime-sceneTime:r.retireActionTime-r.current.time);else r.stopRemaining=Math.max(0,sceneClock?r.stopSceneTime-sceneTime:r.stopActionTime-r.current.time);}
            if(r.lease.stats().retired)r.observedRetired=true;
          }
          trace('fx-step',{from:next-dt,to:next,delta:dt});processDue();for(const a of actors.values())completeIfReady(a);
        }totalUpdates++;
      }catch(error){failures.push(error);for(const a of [...actors.values()])try{halt(a,'action-failed',false);}catch(cleanup){failures.push(cleanup);}suspended=true;vfxRuntime.pause();}
      finally{updating=false;for(const a of actors.values()){a.blockedFrame=-1;syncPause(a);}const errors=failures;counts=null;if(errors.length)throw new AggregateError(errors,'Action presentation failures; affected generations were retired.');}
      return api.stats();
    });},
    suspend(reason='hidden'){alive();if(!['hidden','exceptional-delta','host'].includes(reason))fail('Explicit suspension reason required.');if(reason==='hidden'&&policy.hidden==='cancel')for(const a of [...actors.values()])a.api.cancel();suspended=true;vfxRuntime.pause();for(const a of actors.values())a.endpoints.clear();},
    resume(){alive();for(const a of actors.values())assertActor(a);vfxRuntime.resume();suspended=false;},
    reset(){alive();for(const a of [...actors.values()])a.api.reset();history=[];},
    stats(){return deepFreeze({disposed,suspended,time:sceneTime,updates:totalUpdates,substeps:totalSubsteps,actors:[...actors.values()].sort((a,b)=>compare(a.id,b.id)).map(a=>a.api.stats()),activeEffects:[...actors.values()].reduce((n,a)=>n+a.effects.size,0),packages:packages.size,vfx:clock.stats(),history:[...history]});},
    dispose(){if(disposed)return;let error;for(const a of [...actors.values()])try{a.api.dispose();}catch(e){error??=e;}for(const e of packages.values())for(const s of e.sources.values())try{vfxRuntime.releasePackage(s.handle);}catch(e2){error??=e2;}packages.clear();clock.release();scenes.delete(scene);disposed=true;if(error)throw error;}
  });scenes.set(scene,api);return api;
}
