// Original technical fixtures. Select an existing native-prepared atlas and verified local libraries explicitly.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {fileURLToPath} from 'node:url';
import {inspectVfxGeometry} from '../.engine/threejs/particles/vfx-package.mjs';
const args=process.argv.slice(2);
if(args.length!==2||args.some(x=>!path.isAbsolute(x)))throw Error('Select absolute existing assets and local node_modules directories');
const [directory,modules]=args;
const THREE=await import(pathToFileURL(path.join(modules,'three/build/three.module.js')));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const put=(name,bytes)=>fs.writeFileSync(path.join(directory,name),bytes,{flag:'wx'});
const json=(name,value)=>put(name,JSON.stringify(value,null,2)+'\n');
const p=JSON.parse(fs.readFileSync(path.join(directory,'prepared-package.json'),'utf8'));
const registryBytes=fs.readFileSync(new URL('../.engine/registry.json',import.meta.url));
if(sha(registryBytes)!==p.engine.registrySha256)throw Error('Native fixture engine registry changed');
const engineDefinition=JSON.parse(registryBytes).engines[p.engine.id];
const prep=sha(fs.readFileSync(path.join(directory,'preparation.json')));
const geometry=new THREE.BoxGeometry(.7,1,.5);geometry.clearGroups();
const measured=inspectVfxGeometry(geometry);
const arrays=['position','normal','uv'].map(name=>({name,array:geometry.attributes[name].array,itemSize:geometry.attributes[name].itemSize}));
arrays.push({name:'index',array:geometry.index.array,itemSize:1});
const chunks=[],views=[],accessors=[];let offset=0;
for(const entry of arrays){
  const bytes=Buffer.from(entry.array.buffer,entry.array.byteOffset,entry.array.byteLength);
  views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target:entry.name==='index'?34963:34962});
  accessors.push({bufferView:views.length-1,componentType:entry.name==='index'?5123:5126,count:entry.array.length/entry.itemSize,type:entry.itemSize===1?'SCALAR':entry.itemSize===2?'VEC2':'VEC3',
    ...(entry.name==='position'?{min:[-.35,-.5,-.25],max:[.35,.5,.25]}:{})});
  chunks.push(bytes);offset+=bytes.length;
  if(offset%4){const padding=Buffer.alloc(4-offset%4);chunks.push(padding);offset+=padding.length;}
}
const model={asset:{version:'2.0',generator:'Original Hephaera technical VFX fixture'},buffers:[{byteLength:offset}],bufferViews:views,accessors,
  meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,mode:4}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
let modelJson=Buffer.from(JSON.stringify(model));if(modelJson.length%4)modelJson=Buffer.concat([modelJson,Buffer.alloc(4-modelJson.length%4,32)]);
const bin=Buffer.concat(chunks),glb=Buffer.alloc(12+8+modelJson.length+8+bin.length);
glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
glb.writeUInt32LE(modelJson.length,12);glb.writeUInt32LE(0x4e4f534a,16);modelJson.copy(glb,20);
glb.writeUInt32LE(bin.length,20+modelJson.length);glb.writeUInt32LE(0x004e4942,24+modelJson.length);bin.copy(glb,28+modelJson.length);
put('shard.glb',glb);
json('geometry.json',Object.fromEntries(arrays.map(e=>[e.name,Array.from(e.array)])));
json('geometry-correspondence.json',{schemaVersion:'hephaera-vfx-owned-geometry-correspondence/v1',resourceSha256:sha(glb),geometrySha256:measured.sha256,
  ...measured,glbBuffers:model.bufferViews,scope:'Original actual GLB and exact matching static geometry. Independent technical review remains separate.'});
p.resources.push({id:'shard',kind:'mesh-glb',path:'shard.glb',sha256:sha(glb),bytes:glb.length});
const families=['sprite','burst','ring','mesh','projectile','trail','impact','ground-indicator','beam'];
const counts={sprite:1,burst:12,ring:1,mesh:1,projectile:1,trail:1,impact:8,'ground-indicator':1,beam:1};
p.effects=[{id:p.id,durationSeconds:2,layers:families.map(kind=>({id:kind,kind,startSeconds:0,durationSeconds:1.5,
  resourceIds:['sprite','burst','impact'].includes(kind)?['atlas']:['mesh','projectile'].includes(kind)?['shard']:[],
  maxParticles:counts[kind],maxVertices:kind==='trail'?16:kind==='mesh'||kind==='projectile'?24:kind==='ring'||kind==='ground-indicator'?66:kind==='beam'?18:counts[kind]*4,
  maxDrawCalls:1,maxTrailPoints:kind==='trail'?8:0}))}];
p.atlases[0].bindings=['sprite','burst','impact'].map(layerId=>({effectId:p.id,layerId}));
p.budgets={maxPackageBytes:1048576,maxDependencyBytes:Math.max(...p.resources.map(r=>r.bytes)),maxTotalDependencyBytes:p.resources.reduce((n,r)=>n+r.bytes,0),
  maxDependencies:2,maxEffects:1,maxLayers:9,maxParticles:64,maxVertices:1024,maxDrawCalls:9,maxTrailPoints:8,maxDurationSeconds:2};
const packageBytes=Buffer.from(JSON.stringify(p,null,2)+'\n');put('render-package.json',packageBytes);
const budgets={maxSystems:32,maxParticles:1024,maxTrailPoints:1024,maxVertices:100000,maxIndices:300000,maxDrawCalls:64,maxTextureBytes:1048576,maxBufferBytes:33554432,maxDurationSeconds:2,maxUpdateSeconds:.1};
const profile={schemaVersion:'hephaera-three-vfx-profile/v1',nativePackageSha256:sha(packageBytes),preparationSha256:prep,budgets,
  layers:families.map(family=>({effectId:p.id,layerId:family,family,
    emission:{kind:'burst',capacity:counts[family],count:counts[family],rate:0,lifetimeSeconds:.8,durationSeconds:.8},
    size:family==='beam'?.07:['sprite','mesh','projectile'].includes(family)?1.1:family==='ring'||family==='ground-indicator'?1.2:family==='trail'?.12:.3,
    speed:family==='burst'?1.2:family==='impact'?.7:0,color:family==='beam'?[1,.25,.08,.9]:family==='ring'||family==='ground-indicator'?[.1,.7,1,.85]:[1,1,1,1],
    space:['mesh','projectile'].includes(family)?'local':'world',maxTailSeconds:.4,
    ...(['sprite','burst','impact'].includes(family)?{resourceId:'atlas'}:{}),
    ...(['mesh','projectile'].includes(family)?{geometry:{kind:'binding',resourceId:'shard'}}:{}),
    ...(['ring','ground-indicator'].includes(family)?{geometry:{kind:'ring',innerRadius:.28,outerRadius:.5,segments:32}}:{}),
    ...(family==='trail'?{trail:{historyPoints:8}}:{})}))};
json('profile.json',profile);
json('fixture.json',{schemaVersion:'hephaera-vfx-review-fixture/v1',packageSha256:sha(packageBytes),preparationSha256:prep,
  engineSelection:{effectiveEngine:p.engine.id,...Object.fromEntries(Object.entries(p.engine).filter(([k])=>k!=='id')),
    particles:{package:'three.quarks',backend:engineDefinition.particleBackend},postprocessing:{package:'postprocessing',backend:engineDefinition.postprocessingBackend,renderer:'WebGLRenderer',profile:'ldr'}},budgets,
  geometryMeasurement:measured,limits:['Original technical fixture, not a game asset or human acceptance','Preparation ancestry copied unchanged; composed layer limits are explicit','Real renderer evidence and independent source correspondence review are separate gates']});
geometry.dispose();
console.log(JSON.stringify({directory,packageSha256:sha(packageBytes),preparationSha256:prep,geometry:measured,families}));
