import {validateVfxPackage,sha256,fields,number,integer,identifier,hash,deepFreeze,fail,VFX_FAMILIES} from '../particles/vfx-package.mjs';

const declarations=new WeakSet();
const decoder=new TextDecoder('utf-8',{fatal:true});
export const actionNumber=number;
export function actionVector(value,count,name,limit=1000000){
  if(!Array.isArray(value)||value.length!==count)fail(`${name} requires ${count} components.`);
  return value.map(v=>number(v,-limit,limit,name));
}
export function plainActionData(input){
  let count=0,characters=0;const visited=new Set();
  function copy(value,depth){
    if(++count>262144||depth>32)fail('Action data exceeds the finite object envelope.');
    if(typeof value==='number')return number(value,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,'action number');
    if(typeof value==='boolean'||value===null)return value;
    if(typeof value==='string'){characters+=value.length;if(value.length>4096||characters>16777216)fail('Action text exceeds its finite envelope.');return value;}
    if(!value||visited.has(value))fail('Action inputs require acyclic plain data.');visited.add(value);
    if(Array.isArray(value)){
      if(Object.getPrototypeOf(value)!==Array.prototype||value.length>16384||Reflect.ownKeys(value).length!==value.length+1)fail('Action arrays must be plain, dense and bounded.');
      const result=[];for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!('value'in d))fail('Action array accessors are forbidden.');result.push(copy(d.value,depth+1));}visited.delete(value);return result;
    }
    if(Object.getPrototypeOf(value)!==Object.prototype)fail('Action recipes require plain objects.');
    const result={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key)||!d||!('value'in d))fail('Action accessors/prototype fields are forbidden.');result[key]=copy(d.value,depth+1);}visited.delete(value);return result;
  }return copy(input,0);
}
export function actionPath(value){
  if(typeof value!=='string'||!value||value.length>1024||/[\\:\x00-\x1f<>"|?*]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||p.toLowerCase()==='.git'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))fail('Canonical project-relative action reference required.');return value;
}
function reference(value,sized=false){fields(value,sized?['path','sha256','bytes']:['path','sha256'],'action file reference');actionPath(value.path);hash(value.sha256);if(sized)integer(value.bytes,1,1073741824,'reference bytes');}
function jsonBytes(bytes,expected,name,maximum=16777216){
  if(!(bytes instanceof Uint8Array)||bytes.length<2||bytes.length>maximum||sha256(bytes)!==expected)fail(`Exact ${name} bytes/hash mismatch.`);
  return plainActionData(JSON.parse(decoder.decode(bytes)));
}
function unique(values,name,maximum){
  if(!Array.isArray(values)||values.length>maximum)fail(`Bounded ${name} array required.`);
  const map=new Map(),folded=new Set();for(const value of values){identifier(value.id,name);if(folded.has(value.id.toLowerCase()))fail(`Duplicate ${name} identity.`);map.set(value.id,value);folded.add(value.id.toLowerCase());}return map;
}
function runtimeRecords(value,allowed,name,maximum=1024){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum||Reflect.ownKeys(value).length!==value.length+1)fail(`Plain dense bounded ${name} inventory required.`);
  const result=[];for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!('value'in d))fail(`${name} accessors are forbidden.`);fields(d.value,allowed,name);result.push(d.value);}return result;
}
function engineIdentity(value,selection){
  if(value?.effectiveEngine!=='THREEJS'||selection?.effectiveEngine!=='THREEJS')fail('Action v2 requires resolved THREEJS.');
  for(const k of ['contractSha256','definitionSha256','registrySha256']){hash(value[k],k);if(value[k]!==selection[k])fail(`Stale action engine ${k}.`);}
}
function sameData(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const x=Object.keys(a).sort(),y=Object.keys(b).sort();return x.length===y.length&&x.every((k,i)=>k===y[i]&&sameData(a[k],b[k]));}
function transform(t){
  fields(t,['units','up','forward','handedness','position','orientation','scale','parentScale'],'cue transform');
  if(t.units!=='meters'||t.up!=='+Y'||t.forward!=='+Z'||t.handedness!=='right'||t.parentScale!=='positive-uniform')fail('Explicit runtime basis, meters and positive uniform parents required.');
  actionVector(t.position,3,'local position');const q=actionVector(t.orientation,4,'orientation',1);if(Math.abs(q.reduce((s,v)=>s+v*v,0)-1)>1e-6)fail('Normalized xyzw cue orientation required.');number(t.scale,.0001,1000,'cue scale');
}
/** Data/byte admission only. A fresh native validate result is supplied by the
 * trusted host. This module does not reproduce native closure fingerprints,
 * authenticate people, grant acceptance, or promote/copy assets.
 */
export function validateActionV2Package(input,selection){
  fields(input,['packageBytes','packageSha256','modelBytes','nativeAdmission','effectSources','engineSelection','admissionReceipt'],'action v2 admission');
  selection=plainActionData(selection??input.engineSelection);
  const admission=plainActionData(input.nativeAdmission),packageSha256=input.packageSha256??admission.packageSha256;
  hash(packageSha256);const p=jsonBytes(input.packageBytes,packageSha256,'action package');
  if(input.admissionReceipt!==undefined)reference(plainActionData(input.admissionReceipt),input.admissionReceipt.bytes!==undefined);
  fields(p,['schemaVersion','asset','version','profile','fps','model','source','motion','engine','rig','coordinateSystem','sourceMotion','anchors','targets','budgets','actions','verification','effectSources','effectClosureSha256'],'action v2 package');
  if(p.schemaVersion!=='hephaera-action-package/v2'||!['skinned','articulated','rigid'].includes(p.profile))fail('Explicit supported action package v2 required; v1 remains on its original player.');
  identifier(p.asset);identifier(p.version);integer(p.fps,1,120,'action fps');engineIdentity(p.engine,selection);
  if(!sameData(p.engine,selection))fail('Action admission requires the complete current selected engine identity.');
  reference(p.model);reference(p.source);reference(p.motion);hash(p.effectClosureSha256);
  if(!(input.modelBytes instanceof Uint8Array)||!input.modelBytes.length||input.modelBytes.length>268435456||sha256(input.modelBytes)!==p.model.sha256)fail('Exact delivered model bytes/hash required.');
  fields(p.coordinateSystem,['runtimeUp','runtimeForward','units','handedness','parentScale'],'action coordinates');
  if(p.coordinateSystem.runtimeUp!=='+Y'||p.coordinateSystem.runtimeForward!=='+Z'||p.coordinateSystem.units!=='meters'||p.coordinateSystem.handedness!=='right'||p.coordinateSystem.parentScale!=='positive-uniform')fail('Action runtime coordinate contract is unsupported.');
  fields(admission,['schemaVersion','operation','status','mode','sourceKind','engine','packageSha256','modelSha256','effectClosureSha256','runtimeBuildSha256','nativeVerification','hostContext','manifest','runtimeAcceptance','humanAcceptance'],'native admission');
  if(admission.schemaVersion!=='hephaera-action-v2-admission/v1'||admission.operation!=='validate'||admission.status!=='verified'||!['review','runtime'].includes(admission.mode))fail('Fresh host-native validate admission required.');
  if(admission.sourceKind!=='native-source-export')fail('Only a freshly validated native source export is admitted; promoted destination re-admission is unavailable.');
  if(admission.packageSha256!==packageSha256||admission.modelSha256!==p.model.sha256||admission.effectClosureSha256!==p.effectClosureSha256||!sameData(admission.engine,p.engine))fail('Native admission does not bind this exact delivered package/engine.');
  hash(admission.runtimeBuildSha256);for(const k of ['nativeVerification','hostContext','manifest'])reference(admission[k]);
  if(admission.mode==='runtime'){reference(admission.runtimeAcceptance);reference(admission.humanAcceptance);}
  const b=p.budgets;
  const budgetLimits={maxActions:64,maxStepsPerAction:256,maxExpandedSteps:2048,maxEffects:256,maxParticles:65536,maxFrames:1000000,maxReviewFrames:10000,maxRuntimeBytes:1073741824,timeoutSeconds:86400,maxLogBytes:1073741824,maxAttempts:100,maxVerificationBytes:68719476736,maxEffectSources:64,maxEffectFiles:16384,maxEffectDependencyBytes:4294967296,maxEffectJsonBytes:268435456,maxTrailSamples:65536};
  fields(b,[...Object.keys(budgetLimits),'maxActionSeconds','maxTailSeconds'],'action budgets');for(const[k,max]of Object.entries(budgetLimits))if(k!=='maxVerificationBytes'||b[k]!==undefined)integer(b[k],1,max,k);number(b.maxActionSeconds,1,3600,'maxActionSeconds');number(b.maxTailSeconds,0,60,'maxTailSeconds');
  const anchors=unique(p.anchors,'anchor',10000),targets=unique(p.targets,'target',64),actions=unique(p.actions,'action',b.maxActions),sources=unique(p.effectSources,'effect source',b.maxEffectSources);
  if(!actions.size||!sources.size)fail('Nonempty action/effect inventories required.');
  if(!p.rig||typeof(p.rig.rootBone??p.rig.rootNode)!=='string')fail('Actual rig root identity required.');
  for(const anchor of anchors.values()){if(typeof anchor.node!=='string'||!anchor.node||anchor.node.length>1024)fail('Actual exported anchor identity required.');}
  for(const t of targets.values()){
    fields(t,t.mode==='continuous-world-point'?['id','mode','maxDistance','maxAgeSeconds','maxUpdatesPerSecond','clock','generation','sampleAt','onInvalid']:['id','mode','maxDistance'],'target');number(t.maxDistance,.001,100000,'target range');
    if(t.mode==='continuous-world-point'){number(t.maxAgeSeconds,.001,1,'endpoint age');integer(t.maxUpdatesPerSecond,1,1000,'endpoint rate');if(t.clock!=='presentation-seconds'||t.generation!=='match-action'||t.sampleAt!=='interval-end-before-fx'||t.onInvalid!=='retire-effect')fail('Unsupported live endpoint policy.');}else if(t.mode!=='fixed-world-point')fail('Unsupported target mode.');
  }
  const wires=runtimeRecords(input.effectSources,['id','packageBytes','profileBytes','resourceBytes','correspondenceBytes','bindings'],'effect byte binding',64);
  if(wires.length!==sources.size)fail('Every exact effect source needs raw byte bindings.');
  const effectSources=[],runtimeFiles=new Map();let totalBytes=input.packageBytes.length+input.modelBytes.length;
  const countFile=(path,digest,length)=>{const old=runtimeFiles.get(path.toLowerCase());if(old){if(old.path!==path||old.digest!==digest||old.length!==length)fail('Runtime files alias inconsistent bytes.');return;}runtimeFiles.set(path.toLowerCase(),{path,digest,length});totalBytes+=length;};
  for(const source of sources.values()){
    fields(source,['id','effectId','package','profile','resources','correspondences','ancestry'],'runtime effect source');reference(source.package);fields(source.profile,['schemaVersion','path','sha256'],'effect profile reference');reference({path:source.profile.path,sha256:source.profile.sha256});identifier(source.effectId);
    if(source.profile.schemaVersion!=='hephaera-three-vfx-profile/v1')fail('Unsupported effect profile reference schema.');unique(source.resources,'runtime resource',1024);
    if(!Array.isArray(source.correspondences)||source.correspondences.length!==source.resources.length||new Set(source.correspondences.map(c=>c.resourceId)).size!==source.correspondences.length)fail('Correspondence inventory must cover every exact resource once.');
    fields(source.ancestry,['sourceClosureSha256','productionReviewSha256','rightsSha256','nativePreparationSha256'],'effect ancestry');for(const key of ['sourceClosureSha256','productionReviewSha256','rightsSha256'])hash(source.ancestry[key]);if(source.ancestry.nativePreparationSha256!==undefined)hash(source.ancestry.nativePreparationSha256);
    const wire=wires.filter(v=>v.id===source.id);if(wire.length!==1)fail('Missing/duplicate effect source byte binding.');const w=wire[0];
    const native=jsonBytes(w.packageBytes,source.package.sha256,'effect package',4194304),profile=jsonBytes(w.profileBytes,source.profile.sha256,'production profile',1048576);
    const declaration=validateVfxPackage({package:native,packageSha256:source.package.sha256,...(profile.preparationSha256===undefined?{}:{preparationSha256:profile.preparationSha256}),profile});
    for(const k of ['contractSha256','definitionSha256','registrySha256'])if(native.engine[k]!==p.engine[k])fail('Effect engine differs from the delivered action.');
    if(!native.effects.some(v=>v.id===source.effectId))fail('Selected native effect is missing.');
    const rawResources=runtimeRecords(w.resourceBytes,['id','bytes'],'raw resource'),bindings=runtimeRecords(w.bindings,['id','sha256','texture','width','height','colorSpace','alpha','geometry','review'],'resource binding');
    if(rawResources.length!==source.resources.length||bindings.length!==source.resources.length||source.resources.length!==native.resources.length)fail('Complete exact native resource closure required.');
    for(const r of source.resources){
      fields(r,['id','kind','path','sha256','bytes'],'effect resource');reference({path:r.path,sha256:r.sha256,bytes:r.bytes},true);
      const nr=native.resources.filter(v=>v.id===r.id),rb=rawResources.filter(v=>v.id===r.id),binding=bindings.filter(v=>v.id===r.id),cor=source.correspondences.filter(v=>v.resourceId===r.id);
      if(nr.length!==1||rb.length!==1||binding.length!==1||cor.length!==1||nr[0].sha256!==r.sha256||nr[0].kind!==r.kind||nr[0].bytes!==r.bytes||cor[0].resourceSha256!==r.sha256||cor[0].kind!==(r.kind==='mesh-glb'?'geometry':'texture'))fail('Native resource closure identity mismatch.');
      fields(rb[0],['id','bytes'],'raw resource');if(!(rb[0].bytes instanceof Uint8Array)||rb[0].bytes.length!==r.bytes||sha256(rb[0].bytes)!==r.sha256)fail('Exact raw effect resource bytes/hash mismatch.');
      const review=plainActionData(binding[0].review);
      if(binding[0].sha256!==r.sha256||review?.resourceSha256!==r.sha256||review?.[r.kind==='mesh-glb'?'geometrySha256':'pixelsSha256']!==cor[0].decodedSha256||review?.sourceEvidence?.path!==cor[0].report.path||review?.sourceEvidence?.sha256!==cor[0].report.sha256)fail('Decoded binding differs from the native correspondence.');
      countFile(r.path,r.sha256,r.bytes);
    }
    const rawCorrespondences=runtimeRecords(w.correspondenceBytes,['resourceId','bytes'],'raw correspondence');if(rawCorrespondences.length!==source.correspondences.length)fail('Complete correspondence report bytes required.');
    for(const cor of source.correspondences){fields(cor,['resourceId','resourceSha256','kind','decodedSha256','report'],'correspondence');reference(cor.report,true);const raw=rawCorrespondences.filter(v=>v.resourceId===cor.resourceId);if(raw.length!==1)fail('Exact correspondence byte binding required.');const report=jsonBytes(raw[0].bytes,cor.report.sha256,'correspondence',1048576);if(raw[0].bytes.length!==cor.report.bytes||report.resourceId!==cor.resourceId||report.resourceSha256!==cor.resourceSha256||report.decodedSha256!==cor.decodedSha256||report.kind!==cor.kind||report.independent!==true||report.schemaVersion!=='bubo-vfx-resource-correspondence/v1')fail('Correspondence report identity mismatch.');countFile(cor.report.path,cor.report.sha256,raw[0].bytes.length);}
    countFile(source.package.path,source.package.sha256,w.packageBytes.length);countFile(source.profile.path,source.profile.sha256,w.profileBytes.length);
    effectSources.push({id:source.id,source,declaration,bindings});
  }
  if(totalBytes>b.maxRuntimeBytes||runtimeFiles.size>b.maxEffectFiles)fail('Complete receiving bytes/files exceed action runtime budget.');
  let boundaryCount=0;
  for(const a of actions.values()){
    fields(a,['id','role','clip','duration','motionSha256','steps','cues','markers','retireAt'],'compiled action');identifier(a.clip);hash(a.motionSha256);number(a.duration,1/p.fps,b.maxActionSeconds,'action duration');number(a.retireAt,a.duration,a.duration+b.maxTailSeconds,'action retirement');
    if(!Array.isArray(a.steps)||!a.steps.length||a.steps.length>b.maxExpandedSteps||!Array.isArray(a.markers)||!Array.isArray(a.cues)||!a.cues.length||a.cues.length>b.maxEffects)fail('Bounded action steps/cues/markers required.');
    const cues=unique(a.cues,'cue',256);let boundaries=a.steps.length*2+a.markers.length+2;
    for(const step of a.steps){number(step.start,0,a.duration,'step start');number(step.end,step.start+.000000001,a.duration,'step end');}
    for(const marker of a.markers){identifier(marker.id);number(marker.at,0,a.duration,'marker time');}
    for(const c of cues.values()){
      fields(c,['id','type','source','anchor','start','end','placement','target','transform','lifetime','overrides','trail','retireAt','layers'],'compiled effect cue');
      if(c.type!=='effect'||!sources.has(c.source)||!anchors.has(c.anchor)||!['anchor-follow','captured-world','fixed-target-projectile','fixed-target','beam'].includes(c.placement))fail('Unsupported or missing cue reference.');
      number(c.start,0,a.duration,'cue start');number(c.end,c.start+.000000001,a.duration,'cue end');number(c.retireAt,c.start,a.retireAt,'cue retirement');transform(c.transform);
      fields(c.lifetime,['tailSeconds','pause','tailAttachment','cancel'],'cue lifetime');number(c.lifetime.tailSeconds,0,b.maxTailSeconds,'cue tail');if(!['follow-action','continue-on-scene'].includes(c.lifetime.pause)||!['follow-anchor','capture-world-on-stop'].includes(c.lifetime.tailAttachment)||c.lifetime.cancel!=='retire-generation')fail('Unsupported cue lifecycle.');
      if(c.lifetime.tailAttachment==='follow-anchor'&&!['anchor-follow','beam'].includes(c.placement))fail('Only anchor-follow/beam placement permits attached tails.');
      if(['fixed-target','fixed-target-projectile','beam'].includes(c.placement)){if(!targets.has(c.target)||(targets.get(c.target).mode==='continuous-world-point'&&c.placement!=='beam'))fail('Missing or incompatible target.');}else if(c.target!==undefined)fail('Untargeted cue contains a target.');
      const source=effectSources.find(v=>v.id===c.source),layers=source.declaration.layers.filter(v=>v.effectId===source.source.effectId);
      if(!Array.isArray(c.layers)||c.layers.length!==layers.length)fail('Compiled layers must cover the exact selected effect.');
      const seen=new Set();for(const l of c.layers){fields(l,['id','family','space','start','stopAt','retireAt','emissionDurationSeconds','particleLifetimeSeconds','tailSeconds'],'compiled layer');const profile=layers.find(v=>v.layerId===l.id);if(!profile||seen.has(l.id)||l.family!==profile.family||l.space!==profile.space||!VFX_FAMILIES.includes(l.family))fail('Compiled layer identity mismatch.');seen.add(l.id);number(l.start,c.start,c.end,'layer start');number(l.stopAt,l.start+.000000001,c.end,'layer stop');number(l.retireAt,l.stopAt,c.retireAt,'layer retirement');if(Math.abs(l.start-(c.start+profile.native.startSeconds))>1e-7||Math.abs(l.stopAt-l.start-profile.emission.durationSeconds)>1e-7||Math.abs(l.retireAt-l.stopAt-l.tailSeconds)>1e-7||l.tailSeconds!==Math.min(c.lifetime.tailSeconds,profile.maxTailSeconds)||l.emissionDurationSeconds!==profile.emission.durationSeconds||l.particleLifetimeSeconds!==profile.emission.lifetimeSeconds)fail('Compiled layer timing differs from its exact profile.');boundaries+=3;}
      if(c.overrides!==undefined){if(!Array.isArray(c.overrides)||c.overrides.length>128)fail('Bounded parameter reductions required.');const seenOverrides=new Set();for(const o of c.overrides){fields(o,['layer','sizeMultiplier','colorMultiplier','emissionMultiplier'],'cue reductions');if(!seen.has(o.layer)||seenOverrides.has(o.layer))fail('Unknown/duplicate override layer.');seenOverrides.add(o.layer);if(o.sizeMultiplier!==undefined)number(o.sizeMultiplier,.0001,1,'size reduction');if(o.emissionMultiplier!==undefined)number(o.emissionMultiplier,0,1,'emission reduction');if(o.colorMultiplier!==undefined)actionVector(o.colorMultiplier,4,'color reduction',1).forEach(v=>number(v,0,1,'color reduction'));}}
      if(layers.some(l=>l.family==='trail')){fields(c.trail,['reset','maxSamples','distanceMeters'],'trail policy');if(c.trail.reset!=='teleport-or-discontinuity')fail('Explicit trail discontinuity reset required.');integer(c.trail.maxSamples,2,Math.min(b.maxTrailSamples,...layers.filter(l=>l.family==='trail').map(l=>l.historyPoints)),'trail samples');number(c.trail.distanceMeters,.0001,100000,'trail discontinuity');}
      boundaries+=2;
    }
    if(boundaries>8192)fail('Action boundary inventory exceeds the finite runtime profile.');boundaryCount+=boundaries;
  }
  const data=deepFreeze({package:p,packageSha256,nativeAdmission:admission,totalBytes,boundaryCount});
  // Runtime objects are borrowed; never freeze a caller's texture/geometry.
  const result=Object.freeze({...data,effectSources:Object.freeze(effectSources.map(s=>Object.freeze(s)))});declarations.add(result);return result;
}
export function isActionV2Declaration(value){return declarations.has(value);}
