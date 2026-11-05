import {createThreeQuarksRuntime, acquireThreeQuarksProductionOwner, getThreeQuarksRuntime} from './three-quarks-runtime.mjs';
import {validateVfxPackage, inspectVfxGeometry, atlasFrameIndex, atlasFrameUv, sha256, fields, number, integer, identifier, hash, fail} from './vfx-package.mjs';

const services = new WeakMap();
const serviceInternals = new WeakMap();
/** Cooperative clock ownership: callers retain assets and host lifecycle control. */
export function acquireThreeVfxSceneScheduler(service, {THREE, scene} = {}) {
  const internal = serviceInternals.get(service);
  if (!internal || internal.THREE !== THREE || internal.scene !== scene) fail('An actual VFX service for this exact THREE/Scene is required.');
  return internal.claim();
}
const vector = (value,n,name,limit=1000000) => {
  if(!Array.isArray(value)||value.length!==n)fail(`${name} must contain ${n} components.`);
  value.forEach(v=>number(v,-limit,limit,name)); return [...value];
};
export function inspectVfxTexture(texture) {
  const image=texture?.image;
  if(!texture?.isDataTexture||texture.isDataArrayTexture||texture.isData3DTexture||texture.isCompressedTexture||!image||!(image.data instanceof Uint8Array)||image.data instanceof Uint8ClampedArray)fail('Bounded RGBA Uint8 DataTexture required; no implicit decoder/loader.');
  integer(image.width,1,8192,'texture width');integer(image.height,1,8192,'texture height');
  const bytes=image.width*image.height*4;
  if(bytes>67108864||image.data.byteLength!==bytes||texture.mipmaps.length)fail('Texture pixels/mipmap layout exceeds the fixed profile.');
  return Object.freeze({width:image.width,height:image.height,bytes,pixelsSha256:sha256(image.data)});
}
function review(binding, resource, measurement, kind) {
  const r=binding.review;
  fields(r,kind==='geometry'?['resourceSha256','geometrySha256','maxVertices','maxIndices','maxBytes','independent','sourceEvidence']:['resourceSha256','pixelsSha256','independent','sourceEvidence'],'resource review');
  if(r.resourceSha256!==resource.sha256||r.independent!==true||r[kind==='geometry'?'geometrySha256':'pixelsSha256']!==measurement[kind==='geometry'?'sha256':'pixelsSha256'])fail('Reviewed resource source/snapshot hash mismatch.');
  fields(r.sourceEvidence,['path','sha256'],'source correspondence evidence'); hash(r.sourceEvidence.sha256);
  if(typeof r.sourceEvidence.path!=='string'||!r.sourceEvidence.path||r.sourceEvidence.path.length>1024||r.sourceEvidence.path.split('/').some(s=>!s||s==='.'||s==='..')||/[\\:\x00-\x1f]/.test(r.sourceEvidence.path))fail('Exact project-relative source correspondence evidence required.');
  if(kind==='geometry') {
    integer(r.maxVertices,1,1048576,'review maxVertices');integer(r.maxIndices,0,3145728,'review maxIndices');integer(r.maxBytes,1,67108864,'review maxBytes');
    if(measurement.vertices>r.maxVertices||measurement.indices>r.maxIndices||measurement.bytes>r.maxBytes)fail('Actual geometry exceeds reviewed resource bounds.');
  }
}
function validateBindings(THREE, declaration, bindings) {
  if(!Array.isArray(bindings)||bindings.length!==declaration.package.resources.length)fail('Every native resource needs one exact reviewed binding.');
  const result=new Map();let textureBytes=0,geometryBytes=0;
  for(const b of bindings) {
    fields(b,['id','sha256','texture','width','height','colorSpace','alpha','geometry','review'],'resource binding');
    const resource=declaration.package.resources.find(r=>r.id===b.id);
    if(!resource||b.sha256!==resource.sha256||result.has(b.id))fail('Missing/duplicate resource binding or hash mismatch.');
    if(resource.kind==='texture-png') {
      if(b.geometry||b.texture?.format!==THREE.RGBAFormat||b.texture?.type!==THREE.UnsignedByteType)fail('The fixed texture profile requires RGBA unsigned bytes.');
      const measure=inspectVfxTexture(b.texture);if(measure.width!==b.width||measure.height!==b.height)fail('Actual texture dimensions differ from binding.');
      textureBytes+=measure.bytes;if(textureBytes>declaration.profile.budgets.maxTextureBytes)fail('Admitted package texture bytes exceed its finite profile budget.');
      const atlas=declaration.package.atlases?.find(a=>a.resourceId===b.id);
      const colorSpace=atlas?.colorSpace??b.colorSpace,alpha=atlas?.alpha??b.alpha;
      if(!['srgb','linear'].includes(colorSpace)||alpha!=='straight'||(atlas&&(atlas.width!==measure.width||atlas.height!==measure.height))||(b.colorSpace!==undefined&&b.colorSpace!==colorSpace)||(b.alpha!==undefined&&b.alpha!==alpha))fail('Explicit texture alpha/color/dimensions must match native metadata.');
      review(b,resource,measure,'texture'); result.set(b.id,{binding:b,resource,measure,colorSpace,alpha});
    } else {
      if(b.texture||!b.geometry)fail('Native GLB requires a reviewed bounded geometry binding; no proxy substitution.');
      const measure=inspectVfxGeometry(b.geometry);geometryBytes+=measure.bytes;if(geometryBytes>declaration.profile.budgets.maxBufferBytes)fail('Admitted package geometry bytes exceed its finite profile budget.');review(b,resource,measure,'geometry');result.set(b.id,{binding:b,resource,measure});
    }
  }
  return result;
}

/** Scene-owned finite presentation leases. One borrowed owner clock advances
 * starter, ambient, actor effects and tails. No scheduler, callbacks or gameplay.
 */
export function createThreeVfxRuntime({THREE,Quarks,scene,renderer,engineSelection,owner,budgets}={}) {
  const budgetCeilings={maxSystems:128,maxParticles:65536,maxTrailPoints:65536,maxVertices:16777216,maxIndices:50331648,maxDrawCalls:128,maxTextureBytes:268435456,maxBufferBytes:268435456,maxDurationSeconds:3600,maxUpdateSeconds:.1};
  if(budgets!==undefined){fields(budgets,Object.keys(budgetCeilings),'scene VFX budgets');for(const key of Object.keys(budgets)){const max=budgetCeilings[key];if(['maxDurationSeconds','maxUpdateSeconds'].includes(key))number(budgets[key],.000001,max,key);else integer(budgets[key],['maxTrailPoints','maxIndices','maxTextureBytes'].includes(key)?0:1,max,key);}}
  if(THREE&&String(THREE.REVISION)!=='182')fail('The fixed production profile requires the reviewed Three r182 / Quarks 0.17.1 API.');
  if(Quarks&&(Quarks.RenderMode?.Mesh!==2||Quarks.RenderMode?.Trail!==3))fail('The fixed production profile requires the reviewed Quarks mesh/trail API.');
  const ownsOwner=!owner;
  if(!owner&&getThreeQuarksRuntime(scene))fail('Scene already has a Quarks owner; share that owner explicitly.');
  if(!owner)owner=createThreeQuarksRuntime({THREE,Quarks,scene,renderer,engineSelection,...budgets,maxDelta:budgets?.maxUpdateSeconds??.1});
  const host=acquireThreeQuarksProductionOwner(owner);
  if(host.THREE!==THREE||host.Quarks!==Quarks||host.scene!==scene||host.renderer!==renderer||engineSelection?.effectiveEngine!=='THREEJS')fail('Production adapter must share the exact selected THREEJS owner/libraries/Scene/renderer.');
  if(String(THREE.REVISION)!=='182'||Quarks.RenderMode.Mesh!==2||Quarks.RenderMode.Trail!==3)fail('The fixed production profile requires the reviewed Three r182 / Quarks 0.17.1 API.');
  if(services.has(owner))fail('Quarks owner already has a production service.');
  const limits={...host.limits,maxUpdateSeconds:host.maxDelta,...budgets};
  limits.maxDurationSeconds=Math.min(host.limits.maxDurationSeconds,limits.maxDurationSeconds);
  const releaseConstraint=host.constrain(limits);
  const packages=new Map(),records=new Map();let disposed=false,closing=false,generation=0,schedulerClaim=null;
  const alive=()=>{if(disposed||closing||owner.stats().disposed)fail('VFX service is disposed.');};
  const valid=r=>!disposed&&!r.disposed&&records.get(r.id)===r&&host.isAlive(r);
  function parentTransform(parent) {
    parent.updateWorldMatrix(true,false);const e=parent.matrixWorld.elements;
    if(e.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))fail('Finite bounded parent transform required.');
    const a=new THREE.Vector3(e[0],e[1],e[2]),b=new THREE.Vector3(e[4],e[5],e[6]),c=new THREE.Vector3(e[8],e[9],e[10]),scales=[a.length(),b.length(),c.length()];
    if(Math.min(...scales)<.0001||Math.max(...scales)>1000||Math.max(...scales)-Math.min(...scales)>1e-5*Math.max(...scales)||parent.matrixWorld.determinant()<=0||Math.abs(a.dot(b))>1e-5*scales[0]*scales[1]||Math.abs(a.dot(c))>1e-5*scales[0]*scales[2]||Math.abs(b.dot(c))>1e-5*scales[1]*scales[2])fail('Positive uniform nonmirrored parent transform required; shear/nonuniform scale is unsupported.');
  }
  function checkProfile(declaration, extra) {
    const aggregate=owner.stats(),total={systems:aggregate.systems,particles:aggregate.capacity,trailPoints:aggregate.trailPoints,vertices:Math.max(aggregate.vertices,aggregate.reservedVertices),indices:Math.max(aggregate.indices,aggregate.reservedIndices),drawCalls:aggregate.drawCalls,textureBytes:aggregate.textureBytes,bufferBytes:Math.max(aggregate.bufferBytes,aggregate.reservedBufferBytes)};
    for(const [key,name]of Object.entries({systems:'maxSystems',particles:'maxParticles',trailPoints:'maxTrailPoints',vertices:'maxVertices',indices:'maxIndices',drawCalls:'maxDrawCalls',textureBytes:'maxTextureBytes',bufferBytes:'maxBufferBytes'})){let limit=Math.min(limits[name],declaration.profile.budgets[name]);for(const r of records.values())limit=Math.min(limit,r.declaration.profile.budgets[name]);if(total[key]+(extra[key]??0)>limit)fail(`Aggregate production ${name} capacity exceeded.`);}
  }
  function admit(input) {
    alive(); fields(input,['package','packageSha256','preparationSha256','profile','bindings','packageBytes'],'VFX admission');
    if(packages.size>=Math.min(128,limits.maxSystems))fail('Bounded admitted package inventory exceeded; release an unused package first.');
    // Validate/copy the supplied data before comparing exact file bytes. A
    // JSON.stringify of a caller's raw object could execute a getter/toJSON.
    const declaration=validateVfxPackage({package:input.package,packageSha256:input.packageSha256,...(input.preparationSha256===undefined?{}:{preparationSha256:input.preparationSha256}),profile:input.profile});
    if(input.packageBytes!==undefined) {
      if(!(input.packageBytes instanceof Uint8Array)||input.packageBytes.length>4194304||sha256(input.packageBytes)!==input.packageSha256)fail('Exact native package bytes/hash mismatch.');
      const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input.packageBytes));
      if(JSON.stringify(parsed)!==JSON.stringify(declaration.package))fail('Native parsed snapshot differs from exact package bytes.');
    }
    for(const key of ['contractSha256','definitionSha256','registrySha256'])if(engineSelection[key]!==undefined&&engineSelection[key]!==declaration.package.engine[key])fail('Native package engine identity differs from the selected host.');
    if(declaration.profile.budgets.maxUpdateSeconds<host.maxDelta&&!schedulerClaim)fail('Profile maxUpdateSeconds must cover the owner maximum delta unless a bounded scene scheduler owns the clock.');
    for(const layer of declaration.layers)if(layer.emission.durationSeconds+layer.maxTailSeconds>Math.min(limits.maxDurationSeconds,declaration.profile.budgets.maxDurationSeconds,layer.native.durationSeconds))fail('Production emission and tail exceed scene, owner, profile or native duration.');
    const resources=validateBindings(THREE,declaration,input.bindings);
    const handle=Object.freeze({id:declaration.package.id,version:declaration.package.version,packageSha256:declaration.packageSha256,preparationSha256:declaration.preparationSha256});
    packages.set(handle,{declaration,resources});return handle;
  }
  function retire(r) {if(!valid(r))return false;return host.remove(r);}
  function neutralize(r) {
    if(!r.system)return;
    const s=r.system;s.emissionOverTime.value=0;s.emissionOverDistance.value=0;
    s.emissionState.waitEmiting=0;s.emissionState.burstIndex=s.emissionBursts.length;s.emissionState.burstWaveIndex=0;s.emissionState.isBursting=false;
    s.endEmit();
    // endEmit fires upstream listeners synchronously. Recheck ownership before
    // touching state, even though this service itself installs no callbacks.
    if(valid(r)){s.emissionState.waitEmiting=0;s.emissionState.burstIndex=s.emissionBursts.length;}
  }
  function stopEmission(r,options={}) {
    if(!valid(r))return false;fields(options,['maxTailSeconds'],'drain');
    const tail=options.maxTailSeconds??r.layer.maxTailSeconds;number(tail,0,r.layer.maxTailSeconds,'maxTailSeconds');
    const remaining=Math.max(0,r.expiresAfterSeconds-r.time);
    if(r.draining){r.tailRemaining=Math.min(r.tailRemaining,tail,remaining);if(!r.tailRemaining)retire(r);return true;}
    r.draining=true;r.tailRemaining=Math.min(tail,remaining);neutralize(r);
    if(!valid(r))return false;if(!r.tailRemaining)retire(r);return true;
  }
  function transform(r,input) {
    if(!valid(r))return false;fields(input,['position','quaternion','scale'],'transform');
    if(r.layer.family==='beam')fail('Beam transforms are owned by explicit world endpoints.');
    const position=input.position===undefined?null:vector(input.position,3,'position'),quaternion=input.quaternion===undefined?null:vector(input.quaternion,4,'quaternion',1),scale=input.scale===undefined?null:vector(input.scale,3,'scale',1000);
    if(quaternion&&Math.abs(quaternion.reduce((n,v)=>n+v*v,0)-1)>1e-5)fail('Normalized orientation quaternion required.');
    if(scale&&(scale.some(v=>v<.0001)||Math.max(...scale)-Math.min(...scale)>1e-6))fail('Only positive uniform presentation scale is admitted.');
    const object=r.system?.emitter??r.object;if(position)object.position.fromArray(position);if(quaternion)object.quaternion.fromArray(quaternion);if(scale)object.scale.fromArray(scale);return true;
  }
  function endpoints(r,input) {
    if(!valid(r))return false;if(r.layer.family!=='beam')fail('Only beam leases accept endpoints.');fields(input,['start','end','widthScale'],'endpoints');
    const widthScale=number(input.widthScale??1,.0001,1000,'beam world width scale');
    const a=vector(input.start,3,'beam start'),b=vector(input.end,3,'beam end'),start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);
    number(start.distanceTo(end),.000001,1000000,'beam length');
    // Endpoint coordinates are explicitly world-space. Geometry remains under
    // the scene, independent of the separate attachment lifetime sentinel.
    parentTransform(scene);scene.worldToLocal(start);scene.worldToLocal(end);const direction=end.clone().sub(start),length=direction.length(),e=scene.matrixWorld.elements,scale=Math.hypot(e[0],e[1],e[2]);
    r.object.position.copy(start).add(end).multiplyScalar(.5);r.object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());r.object.scale.set(r.layer.size*widthScale/scale,length,r.layer.size*widthScale/scale);r.endpointData={start:a,end:b,widthScale};return true;
  }
  function acquire(input) {
    alive();if(host.isUpdating())fail('Cannot acquire effects during scene update.');fields(input,['package','effectId','layerId','id','ownerId','parent','transform','endpoints','overrides','maxHistoryPoints','schedulerTiming'],'lease');identifier(input.id);identifier(input.ownerId);
    if(input.schedulerTiming!==undefined&&(typeof input.schedulerTiming!=='boolean'||input.schedulerTiming&&!schedulerClaim))fail('Explicit lease timing requires the claimed scene scheduler.');
    const admitted=packages.get(input.package);if(!admitted)fail('Package handle belongs to a different service or was not admitted.');
    if(records.has(input.id))fail('Effect lease id already exists.');
    const {declaration,resources}=admitted,originalLayer=declaration.layers.find(c=>c.effectId===input.effectId&&c.layerId===input.layerId);if(!originalLayer)fail('Exact admitted effect/layer required.');
    const reduction=input.overrides??{};fields(reduction,['sizeMultiplier','colorMultiplier','emissionMultiplier'],'lease reductions');
    const sizeMultiplier=number(reduction.sizeMultiplier??1,.0001,1,'size reduction'),emissionMultiplier=number(reduction.emissionMultiplier??1,0,1,'emission reduction');
    const colorMultiplier=reduction.colorMultiplier===undefined?[1,1,1,1]:vector(reduction.colorMultiplier,4,'color reduction',1);colorMultiplier.forEach(v=>number(v,0,1,'color reduction'));
    if(input.maxHistoryPoints!==undefined&&(originalLayer.family!=='trail'||!Number.isInteger(input.maxHistoryPoints)||input.maxHistoryPoints<2||input.maxHistoryPoints>originalLayer.historyPoints))fail('Trail history reduction must fit the admitted history.');
    // Per-lease copies only reduce presentation. Native capacity/reservations
    // remain intact, and neither source profile nor borrowed resource mutates.
    const layer={...originalLayer,size:originalLayer.size*sizeMultiplier,color:originalLayer.color.map((v,i)=>v*colorMultiplier[i]),historyPoints:input.maxHistoryPoints??originalLayer.historyPoints,
      emission:{...originalLayer.emission,count:Math.floor(originalLayer.emission.count*emissionMultiplier),rate:originalLayer.emission.rate*emissionMultiplier}};
    const expiresAfterSeconds=layer.emission.durationSeconds+layer.maxTailSeconds;
    if(expiresAfterSeconds>Math.min(limits.maxDurationSeconds,declaration.profile.budgets.maxDurationSeconds,layer.native.durationSeconds))fail('Production lifetime exceeds current scene, owner, profile or native duration.');
    const parent=input.parent??scene;if(!parent?.isObject3D||!host.sameScene(parent))fail('Lease parent must be attached beneath its Scene.');
    parentTransform(parent);
    if(layer.family==='beam'&&!input.endpoints)fail('Beam requires explicit finite world endpoints.');if(layer.family!=='beam'&&input.endpoints)fail('Only beam accepts endpoints.');
    // Source resources remain borrowed and are rechecked immediately before
    // owned allocation; later host edits cannot change the owned snapshots.
    const textureResource=layer.resourceId?resources.get(layer.resourceId):null;
    if(textureResource){const actual=inspectVfxTexture(textureResource.binding.texture);if(actual.pixelsSha256!==textureResource.measure.pixelsSha256)fail('Borrowed texture changed after admission.');}
    const geometryResource=layer.geometry?.kind==='binding'?resources.get(layer.geometry.resourceId):null;
    if(geometryResource&&inspectVfxGeometry(geometryResource.binding.geometry).sha256!==geometryResource.measure.sha256)fail('Borrowed geometry changed after admission.');
    const em=layer.emission,trail=layer.family==='trail',beam=layer.family==='beam';
    const geometryVertices=beam?18:geometryResource?geometryResource.measure.vertices:layer.geometry?.kind==='ring'?(layer.geometry.segments+1)*2:4;
    const geometryIndices=beam?48:geometryResource?geometryResource.measure.indices:layer.geometry?.kind==='ring'?layer.geometry.segments*6:6;
    const vertices=trail?em.capacity*layer.historyPoints*2:geometryVertices*em.capacity,indices=trail?em.capacity*layer.historyPoints*6:geometryIndices*em.capacity;
    if(vertices>layer.native.maxVertices||layer.native.maxDrawCalls<1)fail('Actual production geometry exceeds explicitly reserved native layer limits.');
    const ownedBufferBytes=beam?geometryVertices*32+geometryIndices*2:0;
    const batchCapacity=trail?10000:1000;let grown=batchCapacity;const demand=trail?em.capacity*layer.historyPoints*2:em.capacity;if(demand>grown)while(demand>=grown)grown*=2;
    const estimatedBufferBytes=beam?ownedBufferBytes:grown*(trail?160:geometryResource||layer.geometry?.kind==='ring'?64:52)+geometryVertices*32+geometryIndices*4;
    const reservation={vertices,indices,trailPoints:trail?em.capacity*layer.historyPoints:0,textureBytes:textureResource?.measure.bytes??0,ownedBufferBytes,extraDrawCalls:beam?1:0};
    const allocatedVertices=Math.max(vertices,trail?grown*2:geometryVertices),allocatedIndices=Math.max(indices,trail?grown*6:geometryIndices);
    const extra={systems:1,particles:em.capacity,vertices:allocatedVertices,indices:allocatedIndices,trailPoints:reservation.trailPoints,textureBytes:reservation.textureBytes,bufferBytes:estimatedBufferBytes,drawCalls:1};checkProfile(declaration,extra);
    host.checkBounds(extra);
    let geometry,texture,material,system,object,record;
    try {
      if(textureResource) {
        texture=new THREE.DataTexture(new Uint8Array(textureResource.binding.texture.image.data),textureResource.measure.width,textureResource.measure.height,THREE.RGBAFormat,THREE.UnsignedByteType);
        texture.flipY=true;texture.premultiplyAlpha=false;texture.colorSpace=textureResource.colorSpace==='srgb'?THREE.SRGBColorSpace:THREE.LinearSRGBColorSpace;
        texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.wrapS=THREE.ClampToEdgeWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;texture.needsUpdate=true;
      }
      material=new THREE.MeshBasicMaterial({map:texture??null,transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.NormalBlending,premultipliedAlpha:false,toneMapped:true});
      if(beam) {
        // This fixed transparent double-sided presentation has one declared
        // draw, so Three must not submit its usual back/front two-pass route.
        material.forceSinglePass=true;
        geometry=new THREE.CylinderGeometry(.5,.5,1,8,1,true);material.color.setRGB(...layer.color.slice(0,3));material.opacity=layer.color[3];object=new THREE.Mesh(geometry,material);
      }
      else {
        if(geometryResource) {
          // Copy only admitted arrays, never source Object3D/userData/materials,
          // custom clone methods, embedded code, loaders or animation state.
          geometry=new THREE.BufferGeometry();const source=geometryResource.binding.geometry;
          for(const name of Object.keys(source.attributes))geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(source.attributes[name].array),source.attributes[name].itemSize));
          if(source.index)geometry.setIndex(new THREE.BufferAttribute(source.index.array instanceof Uint16Array?new Uint16Array(source.index.array):new Uint32Array(source.index.array),1));
        } else if(layer.geometry?.kind==='ring')geometry=new THREE.RingGeometry(layer.geometry.innerRadius,layer.geometry.outerRadius,layer.geometry.segments);
        else {
          // Billboard size is world height. Preserve the reviewed bitmap's
          // interior aspect independently of atlas cell padding/extrusion.
          // Trail geometry is an unused upstream settings placeholder.
          const frame=layer.atlas?.metadata.frames[0];
          const aspect=trail||!textureResource?1:frame?frame.width/frame.height:textureResource.measure.width/textureResource.measure.height;
          geometry=new THREE.PlaneGeometry(aspect,1);
        }
        if(layer.family==='ground-indicator')geometry.rotateX(-Math.PI/2);
        if(textureResource&&geometryResource){const uv=geometry.getAttribute('uv');if(!uv)fail('Textured mesh needs bounded UVs.');for(let i=0;i<uv.array.length;i++)number(uv.array[i],0,1,'mesh UV');}
        if(layer.atlas) {
          const {metadata:a,layout}=layer.atlas,uv=atlasFrameUv(a,0),f=a.frames[0];
          if(trail){texture.offset.set(uv.u0,uv.v0);texture.repeat.set(uv.u1-uv.u0,uv.v1-uv.v0);texture.updateMatrix();}
          else {
            const col=f.cellX/f.cellWidth,bottomRow=layout.rows-1-f.cellY/f.cellHeight;
            const u0=uv.u0*layout.columns-col,v0=uv.v0*layout.rows-bottomRow,u1=uv.u1*layout.columns-col,v1=uv.v1*layout.rows-bottomRow,attribute=geometry.getAttribute('uv');
            if(!attribute)fail('Atlas geometry needs explicit bounded UVs.');for(let i=0;i<attribute.count;i++)attribute.setXY(i,u0+attribute.getX(i)*(u1-u0),v0+attribute.getY(i)*(v1-v0));attribute.needsUpdate=true;
          }
        }
        const behaviors=[];
        if(layer.atlas&&!trail) {const a=layer.atlas.metadata,tiles=layer.atlas.layout.tiles;behaviors.push(Object.freeze({type:'HephaeraExactAtlas',initialize(p){p.uvTile=tiles[0];},frameUpdate(){},update(p,delta){p.uvTile=tiles[atlasFrameIndex(a,p.age+delta)];},reset(){}}));}
        system=new Quarks.ParticleSystem({duration:em.durationSeconds,looping:false,prewarm:false,autoDestroy:false,
          startLife:new Quarks.ConstantValue(em.lifetimeSeconds),startSpeed:new Quarks.ConstantValue(layer.speed),startSize:new Quarks.ConstantValue(layer.size),startColor:new Quarks.ConstantColor(new THREE.Vector4(...layer.color)),
          emissionOverTime:new Quarks.ConstantValue(em.rate),emissionOverDistance:new Quarks.ConstantValue(0),emissionBursts:em.kind==='burst'?[{time:0,count:new Quarks.ConstantValue(em.count),cycle:1,interval:0,probability:1}]:[],
          behaviors,shape:new Quarks.PointEmitter(),worldSpace:layer.space==='world',material,instancingGeometry:geometry,
          renderMode:trail?Quarks.RenderMode.Trail:geometryResource||layer.geometry?.kind==='ring'?Quarks.RenderMode.Mesh:Quarks.RenderMode.BillBoard,
          ...(trail?{rendererEmitterSettings:{startLength:new Quarks.ConstantValue(layer.historyPoints),followLocalOrigin:true}}:{}),
          uTileCount:trail?1:layer.atlas?.layout.columns??1,vTileCount:trail?1:layer.atlas?.layout.rows??1,blendTiles:false,softParticles:false});
      }
      const token=++generation,ownedSettings=system?{...system.getRendererSettings()}:null,ownedGenerators=system?{life:system.startLife,speed:system.startSpeed,size:system.startSize,color:system.startColor,rate:system.emissionOverTime,distance:system.emissionOverDistance,bursts:system.emissionBursts,trail:system.rendererEmitterSettings?.startLength}:null;
      record={id:input.id,ownerId:input.ownerId,token,production:true,system,object,layer,declaration,profileBudgets:declaration.profile.budgets,config:{capacity:em.capacity},reservation,estimatedBufferBytes,
        preallocation:extra,
        disposed:false,paused:false,draining:false,tailRemaining:0,time:0,expiresAfterSeconds,parent,currentRate:em.rate,currentCount:em.count,schedulerTiming:input.schedulerTiming===true,
        assert(){
          if(!valid(record))return;if(!host.sameScene(parent))fail('Lease attachment left its Scene.');parentTransform(parent);
          if(system){const settings=system.getRendererSettings(),g=ownedGenerators;
            if(settings.material!==material||settings.instancingGeometry!==geometry||settings.renderMode!==ownedSettings.renderMode||settings.uTileCount!==ownedSettings.uTileCount||settings.vTileCount!==ownedSettings.vTileCount||settings.softParticles||settings.blendTiles||system.neededToUpdateRender||system.behaviors!==behaviorsForSystem||system.behaviors.length!==behaviorsSnapshot.length||system.behaviors.some((b,i)=>b!==behaviorsSnapshot[i])||system.prewarm||system.autoDestroy||system.onlyUsedByOther||system.duration!==em.durationSeconds||system.looping||system.worldSpace!==(layer.space==='world')||system.startLife!==g.life||g.life.value!==em.lifetimeSeconds||system.startSpeed!==g.speed||g.speed.value!==layer.speed||system.startSize!==g.size||g.size.value!==layer.size||system.startColor!==g.color||system.emissionOverTime!==g.rate||g.rate.value!==(record.draining?0:record.currentRate)||system.emissionOverDistance!==g.distance||g.distance.value!==0||system.emissionBursts!==g.bursts||g.bursts.length!==(em.kind==='burst'?1:0)||(g.bursts[0]&&(g.bursts[0].count.value!==record.currentCount||g.bursts[0].time!==0||g.bursts[0].probability!==1))||(trail&&(system.rendererEmitterSettings.startLength!==g.trail||g.trail.value!==layer.historyPoints||!system.rendererEmitterSettings.followLocalOrigin)))fail('Owned production system configuration changed.');
          }
        },
        beforeStep(){if(beam&&record.endpointData)endpoints(record,record.endpointData);},
        afterStep(delta){
          if(!valid(record)||record.paused)return;record.time=Math.min(record.time+delta,record.expiresAfterSeconds);
          if(system&&(system.particleNum>em.capacity||system.particles.length>em.capacity)){retire(record);fail('Production particle capacity breached; lease retired.');}
          const points=system?.particles.reduce((n,p)=>n+(p.previous?.length??0),0)??0;if(points>reservation.trailPoints){retire(record);fail('Production trail history capacity breached.');}
          if(record.time>=record.expiresAfterSeconds){retire(record);return;}
          if(record.draining){record.tailRemaining-=delta;if(record.tailRemaining<=(record.schedulerTiming?0:1e-10)||(!beam&&system.particleNum===0))retire(record);}
          else if(!record.schedulerTiming&&record.time+1e-10>=em.durationSeconds)stopEmission(record);
        },
        quality(q,reduced){if(system){system.emitter.visible=q!==0;if(!record.draining){record.currentRate=em.rate*[0,.5,1][q]*(reduced?.25:1);system.emissionOverTime.value=record.currentRate;record.currentCount=Math.floor(em.count*[0,.5,1][q]*(reduced?.25:1));if(q>0&&em.count>0&&['ring','ground-indicator'].includes(layer.family))record.currentCount=Math.max(1,record.currentCount);if(system.emissionBursts[0])system.emissionBursts[0].count.value=record.currentCount;}}else object.visible=q!==0;},
        unlink(){if(records.get(record.id)===record)records.delete(record.id);},
        release(){record.disposed=true;record.unlink();if(system)for(const p of system.particles)p.previous?.clear();object?.removeFromParent();try{geometry.dispose();}finally{try{material.dispose();}finally{texture?.dispose();}}}
      };
      const behaviorsForSystem=system?.behaviors,behaviorsSnapshot=system?[...system.behaviors]:[];
      records.set(record.id,record);host.add(record,beam?scene:parent);
      if(input.transform)transform(record,input.transform);if(input.endpoints)endpoints(record,input.endpoints);
      const state=owner.stats();record.quality(state.quality,state.reducedMotion);
      const lease=Object.freeze({id:record.id,ownerId:record.ownerId,generation:token,
        setTransform(value){return transform(record,value);},setEndpoints(value){return endpoints(record,value);},
        pause(){if(!valid(record))return false;record.paused=true;system?.pause();return true;},resume(){if(!valid(record))return false;record.paused=false;system?.play();return true;},
        stopEmission(options){return stopEmission(record,options);},
        resetHistory(){if(!valid(record))return false;for(const p of system?.particles??[])p.previous?.clear();return true;},
        retire(){return retire(record);},
        stats(){return Object.freeze({id:record.id,ownerId:record.ownerId,generation:token,disposed:!valid(record),retired:!valid(record),paused:record.paused,draining:record.draining,time:record.time,particles:valid(record)?system?.particleNum??0:0,pooledParticles:valid(record)?system?.particles.length??0:0,historyPoints:valid(record)?system?.particles.reduce((n,p)=>n+(p.previous?.length??0),0)??0:0,frameIndices:Object.freeze(valid(record)&&system?system.particles.slice(0,system.particleNum).map(p=>p.uvTile):[]),tailRemaining:Math.max(0,record.tailRemaining)});}
      });return lease;
    }catch(error){if(record&&host.isAlive(record))host.remove(record);else{records.delete(input.id);system?.dispose();geometry?.dispose();material?.dispose();texture?.dispose();object?.removeFromParent();}throw error;}
  }
  const api=Object.freeze({admit,acquire,
    releasePackage(handle){alive();if(!packages.has(handle))return false;const entry=packages.get(handle);if([...records.values()].some(r=>r.declaration===entry.declaration))fail('Cannot release a package while its layer leases are live.');packages.delete(handle);return true;},
    update(delta){alive();if(schedulerClaim)fail('The scene presentation scheduler owns this VFX clock.');number(delta,0,limits.maxUpdateSeconds,'deltaSeconds');return owner.update(delta);},stats(){const state=owner.stats();return Object.freeze({...state,disposed:disposed||state.disposed,ownerDisposed:state.disposed,productionSystems:records.size,packages:packages.size});},
    pause(){alive();owner.pause();},resume(){alive();owner.resume();},
    setQuality(value){alive();owner.setQuality(value);},setReducedMotion(value){alive();owner.setReducedMotion(value);},
    clear(){alive();for(const r of [...records.values()])retire(r);},reset(){alive();for(const r of [...records.values()])retire(r);generation++;},
    dispose(){if(disposed||closing)return;closing=true;let error;for(const r of [...records.values()])try{retire(r);}catch(e){error??=e;}packages.clear();services.delete(owner);releaseConstraint();try{if(ownsOwner)owner.dispose();}catch(e){error??=e;}disposed=true;closing=false;generation++;if(error)throw error;}
  });services.set(owner,api);
  serviceInternals.set(api,{THREE,scene,claim(){
    alive();if(schedulerClaim)fail('The VFX scene clock already has a scheduler.');
    const clock=host.claimClock(),token={};schedulerClaim=token;let released=false;
    return Object.freeze({get maxUpdateSeconds(){let maximum=Math.min(host.maxDelta,limits.maxUpdateSeconds);for(const r of records.values())maximum=Math.min(maximum,r.declaration.profile.budgets.maxUpdateSeconds);return maximum;},
      update(delta){alive();if(released||schedulerClaim!==token)fail('VFX scheduler claim is retired.');number(delta,0,this.maxUpdateSeconds,'deltaSeconds');return clock.update(delta);},
      stats:api.stats,release(){if(released)return;released=true;if(schedulerClaim===token)schedulerClaim=null;clock.release();}});
  }});return api;
}
