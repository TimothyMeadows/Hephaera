import * as THREE from 'three';
import * as Quarks from 'three.quarks';
import * as Postprocessing from 'postprocessing';
import {createThreeQuarksRuntime as createBaseline} from '/assets/baseline-three-quarks-runtime.mjs';
import {createThreeVfxRuntime} from '/source/.engine/threejs/particles/three-vfx-runtime.mjs';
import {createPostprocessingRuntime} from '/source/.engine/threejs/postprocessing/postprocessing-runtime.mjs';

// Original technical benchmark, with no private scheduler or backend fallback.
// Workload inputs are explicitly supplied local artifacts, never generated here.
window.__performanceReady=false;
const status=document.querySelector('#status');
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
const load=async name=>{const response=await fetch('/assets/'+name);if(!response.ok)throw Error('Required local performance input missing: '+name);return new Uint8Array(await response.arrayBuffer());};
const parse=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const copy=value=>JSON.parse(JSON.stringify(value));
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};

try {
  const loadStart=performance.now();
  const names=['perf-package.json','perf-profile.json','perf-source.json','swatch-correspondence.json','swatch.png','swatch.rgba','baseline-three-quarks-runtime.mjs','fixture.json'];
  const files=Object.fromEntries(await Promise.all(names.map(async name=>[name,await load(name)])));
  const pkg=parse(files['perf-package.json']),profile=parse(files['perf-profile.json']),source=parse(files['perf-source.json']),decode=parse(files['swatch-correspondence.json']),fixture=parse(files['fixture.json']);
  const inputHashes=Object.fromEntries(await Promise.all(names.map(async name=>[name,await sha(files[name])])));
  if(inputHashes['perf-package.json']!==source.packageSha256||profile.nativePackageSha256!==source.packageSha256||inputHashes['baseline-three-quarks-runtime.mjs']!==source.baselineSourceSha256||inputHashes['swatch.png']!==source.resourceSha256||decode.sourceSha256!==source.resourceSha256||inputHashes['swatch.rgba']!==decode.pixelsSha256)throw Error('Exact performance input identities do not match the supplied source/correspondence records.');
  if(decode.width!==1||decode.height!==1||files['swatch.rgba'].length!==4||pkg.resources.length!==1||pkg.resources[0].id!=='swatch'||pkg.resources[0].sha256!==source.resourceSha256)throw Error('This benchmark requires its explicit original 1px common workload.');
  const layer=profile.layers[0],emission=layer?.emission;
  if(profile.layers.length!==1||layer.family!=='sprite'||layer.size!==.35||layer.speed!==.6||layer.space!=='world'||emission.kind!=='burst'||emission.capacity!==64||emission.count!==32||emission.rate!==0||emission.lifetimeSeconds!==10||emission.durationSeconds!==10)throw Error('Unexpected common-workload profile.');
  const inputLoadMs=performance.now()-loadStart;
  const engineSelection={...fixture.engineSelection,effectiveEngine:'THREEJS',particles:{package:'three.quarks'},postprocessing:{backend:'PMNDRS_POSTPROCESSING'}};
  const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#view'),alpha:true,antialias:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(960,540,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.info.autoReset=false;
  const gl=renderer.getContext();
  if(!(gl instanceof WebGL2RenderingContext)||gl.isContextLost())throw Error('An actual available WebGL2 context is required.');
  const debug=gl.getExtension('WEBGL_debug_renderer_info');
  const driver={webgl:gl.getParameter(gl.VERSION),glsl:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):'unavailable',renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable',maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),disjointTimerQueryAvailable:!!gl.getExtension('EXT_disjoint_timer_query_webgl2')};
  if(/swiftshader|llvmpipe|software rasterizer|microsoft basic render|\bwarp\b/i.test(driver.renderer))throw Error('The explicit default browser selected software rendering; no hardware result or backend fallback is claimed.');
  const shaderErrors=[];
  renderer.debug.onShaderError=(context,program,vertex,fragment)=>shaderErrors.push({program:context.getProgramInfoLog(program),vertex:context.getShaderInfoLog(vertex),fragment:context.getShaderInfoLog(fragment)});
  const originalRandom=Math.random,pixels=new Uint8Array(960*540*4);
  let running=false,disposed=false;
  const reseed=value=>{let seed=value>>>0;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
  const clockSamples=[];let previous=performance.now();for(let i=0;i<10000;i++){const now=performance.now();if(now>previous)clockSamples.push(now-previous);previous=now;}
  const clockQuantumMs=clockSamples.length?Math.min(...clockSamples):null;
  function timed(action) {
    gl.finish();const start=performance.now(),value=action(),cpuEnd=performance.now();gl.finish();
    return {value,cpuMs:cpuEnd-start,finishWallMs:performance.now()-start};
  }
  function inventory(scene,fx,composer) {
    let owners=0,systems=0,particles=0,pooledParticles=0,batches=0,typedArrayBytes=0,vertices=0,indices=0;
    const arrays=new Set(),geometries=new Set(),states=[];
    scene.traverse(node=>{
      if(node.type==='BatchedRenderer'){owners++;batches+=node.batches.length;}
      if(node.system instanceof Quarks.ParticleSystem){
        const s=node.system;systems++;particles+=s.particleNum;pooledParticles+=s.particles.length;
        states.push({id:node.name||String(states.length),particles:s.particles.slice(0,s.particleNum).map(p=>({age:p.age,life:p.life,position:[p.position.x,p.position.y,p.position.z],velocity:[p.velocity.x,p.velocity.y,p.velocity.z]}))});
      }
      if(node.geometry?.isBufferGeometry&&!geometries.has(node.geometry)){
        const geometry=node.geometry;geometries.add(geometry);vertices+=geometry.getAttribute('position')?.count??0;indices+=geometry.index?.count??0;
        for(const attribute of [...Object.values(geometry.attributes),geometry.index].filter(Boolean)){const array=attribute.array??attribute.data?.array;if(array&&!arrays.has(array)){arrays.add(array);typedArrayBytes+=array.byteLength;}}
      }
    });
    return {owners,systems,particles,pooledParticles,batches,typedArrayBytes,vertices,indices,draws:{...renderer.info.render},rendererMemory:{...renderer.info.memory},service:fx.stats(),composer:composer?.inspect()??null,particleState:states};
  }
  function readPixels() {
    gl.finish();gl.readPixels(0,0,960,540,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const background=[pixels[0],pixels[1],pixels[2]];let occupiedPixels=0;
    for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-background[0])+Math.abs(pixels[i+1]-background[1])+Math.abs(pixels[i+2]-background[2])>15)occupiedPixels++;
    return {occupiedPixels,glError:gl.getError()};
  }
  async function run({variant,runId,route='composer',frames=32,deltaSeconds=1/120}) {
    if(running||disposed)throw Error('Performance run is reentrant or disposed.');
    if(!['baseline','candidate'].includes(variant)||!['direct','composer'].includes(route)||frames!==32||deltaSeconds!==1/120||typeof runId!=='string')throw Error('Unexpected bounded benchmark parameters.');
    if(gl.isContextLost())throw Error('Context lost before benchmark run.');
    running=true;status.textContent=runId+' · '+variant+' · '+route;
    let fx,composer,material,texture,pkgHandle;
    const started=performance.now(),errorsBefore=shaderErrors.length;
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x101720);
    const camera=new THREE.OrthographicCamera(-4.2,4.2,2.36,-2.36,.1,100);camera.position.set(2.7,3.2,8);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
    const stages={};
    try {
      const input=timed(()=>{
        texture=new THREE.DataTexture(new Uint8Array(files['swatch.rgba']),1,1,THREE.RGBAFormat,THREE.UnsignedByteType);
        texture.flipY=true;texture.premultiplyAlpha=false;texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.wrapS=THREE.ClampToEdgeWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;texture.needsUpdate=true;
      });stages.inputResource={cpuMs:input.cpuMs,finishWallMs:input.finishWallMs};
      const construction=timed(()=>variant==='baseline'?createBaseline({THREE,Quarks,scene,renderer,engineSelection,maxSystems:profile.budgets.maxSystems,maxParticles:profile.budgets.maxParticles,maxDelta:.1}):createThreeVfxRuntime({THREE,Quarks,scene,renderer,engineSelection,budgets:profile.budgets}));
      fx=construction.value;stages.runtimeConstruction={cpuMs:construction.cpuMs,finishWallMs:construction.finishWallMs};
      const admission=timed(()=>{
        if(variant==='baseline'){material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.NormalBlending,premultipliedAlpha:false,toneMapped:true});return null;}
        return fx.admit({package:pkg,packageBytes:files['perf-package.json'],packageSha256:source.packageSha256,profile,
          bindings:[{id:'swatch',sha256:source.resourceSha256,texture,width:1,height:1,colorSpace:'srgb',alpha:'straight',review:{resourceSha256:source.resourceSha256,pixelsSha256:decode.pixelsSha256,independent:true,sourceEvidence:{path:'swatch-correspondence.json',sha256:inputHashes['swatch-correspondence.json']}}}]});
      });pkgHandle=admission.value;stages.resourceAdmission={cpuMs:admission.cpuMs,finishWallMs:admission.finishWallMs,scope:variant==='baseline'?'Borrowed material setup; historical helper has no package admission.':'Production native/profile/resource admission with exact source correspondence.'};
      const create=(id,position)=>{
        if(variant==='baseline'){
          const handle=fx.createEmitter({id,kind:'burst',capacity:64,count:32,rate:0,lifetime:10,duration:10,looping:false,size:.35,speed:.6,color:[1,1,1,1],space:'world',shape:'point',material});handle.emitter.position.fromArray(position);return handle;
        }
        return fx.acquire({package:pkgHandle,effectId:'common',layerId:'sprite',id,ownerId:id,transform:{position}});
      };
      const acquire=timed(()=>create('actor-a',[-1,0,0]));stages.firstAcquire={cpuMs:acquire.cpuMs,finishWallMs:acquire.finishWallMs};
      if(route==='composer'){
        const setup=timed(()=>createPostprocessingRuntime({THREE,Postprocessing,scene,camera,renderer,engineSelection,maxPixels:960*540,maxDimension:4096,maxPixelRatio:1,maxDelta:.1}));composer=setup.value;stages.composerConstruction={cpuMs:setup.cpuMs,finishWallMs:setup.finishWallMs};
      }
      const render=()=>{if(composer){if(!composer.render(deltaSeconds))throw Error('Composer suppressed a controlled visible benchmark frame.');}else renderer.render(scene,camera);};
      reseed(17);const initial=timed(()=>fx.update(deltaSeconds));stages.initialUpdate={cpuMs:initial.cpuMs,finishWallMs:initial.finishWallMs};
      renderer.info.reset();
      const compile=timed(()=>{renderer.compile(scene,camera);render();});stages.firstCompileRender={cpuMs:compile.cpuMs,finishWallMs:compile.finishWallMs};
      const compiled=inventory(scene,fx,composer);
      function phase() {
        const samples=[];gl.finish();const start=performance.now();
        for(let i=0;i<frames;i++){
          renderer.info.reset();const t0=performance.now();fx.update(deltaSeconds);const t1=performance.now();render();const t2=performance.now();gl.finish();const t3=performance.now();
          samples.push({updateCpuMs:t1-t0,renderSubmitCpuMs:t2-t1,renderFinishWallMs:t3-t1,finishWaitMs:t3-t2,frameFinishWallMs:t3-t0});
        }
        const totalWallMs=performance.now()-start;
        return {frames,deltaSeconds,totalWallMs,perFrameWallMs:totalWallMs/frames,samples,median:Object.fromEntries(Object.keys(samples[0]).map(key=>[key,median(samples.map(s=>s[key]))])),inventory:inventory(scene,fx,composer)};
      }
      const steady=phase();
      const peakAcquire=timed(()=>{create('actor-b',[1,0,0]);create('ambient',[0,.5,0]);});stages.peakAcquire={cpuMs:peakAcquire.cpuMs,finishWallMs:peakAcquire.finishWallMs};
      reseed(29);const peakInitial=timed(()=>fx.update(deltaSeconds));stages.peakInitialUpdate={cpuMs:peakInitial.cpuMs,finishWallMs:peakInitial.finishWallMs};
      renderer.info.reset();const peakCompile=timed(()=>{renderer.compile(scene,camera);render();});stages.peakCompileRender={cpuMs:peakCompile.cpuMs,finishWallMs:peakCompile.finishWallMs};
      const peak=phase(),pixelCheck=readPixels();
      if(compiled.owners!==1||steady.inventory.systems!==1||steady.inventory.particles!==32||peak.inventory.systems!==3||peak.inventory.particles!==96||!pixelCheck.occupiedPixels||pixelCheck.glError!==gl.NO_ERROR||shaderErrors.length!==errorsBefore)throw Error('Actual workload, pixels, owner count or GPU errors failed validation.');
      const signatures={steady:await sha(new TextEncoder().encode(JSON.stringify(steady.inventory.particleState))),peak:await sha(new TextEncoder().encode(JSON.stringify(peak.inventory.particleState)))};
      delete compiled.particleState;delete steady.inventory.particleState;delete peak.inventory.particleState;
      const result={runId,variant,route,frames,deltaSeconds,stages,compiled,steady,peak,pixelCheck,signatures,shaderErrors:shaderErrors.slice(errorsBefore),elapsedWallMs:performance.now()-started};
      // Cleanup is observed separately and cannot lower timed rendering costs.
      const cleanupStart=performance.now();composer?.dispose();composer=null;fx.dispose();fx=null;material?.dispose();material=null;texture.dispose();texture=null;gl.finish();
      result.cleanup={wallMs:performance.now()-cleanupStart,sceneChildren:scene.children.length,rendererMemory:{...renderer.info.memory},glError:gl.getError()};
      if(result.cleanup.sceneChildren!==0||result.cleanup.glError!==gl.NO_ERROR)throw Error('Owned benchmark resources did not retire cleanly.');
      return result;
    } finally {
      Math.random=originalRandom;composer?.dispose();fx?.dispose();material?.dispose();texture?.dispose();running=false;
    }
  }
  window.__vfxPerformance=Object.freeze({driver,inputHashes,inputLoadMs,clockQuantumMs,
    settings:{width:960,height:540,pixelRatio:1,outputColorSpace:THREE.SRGBColorSpace,toneMapping:THREE.NoToneMapping,camera:{kind:'orthographic',bounds:[-4.2,4.2,2.36,-2.36,.1,100],position:[2.7,3.2,8],target:[0,0,0]},initialSeed:17,peakSeed:29,particlesPerEmitter:32,capacityPerEmitter:64,lifetimeSeconds:10,size:.35,speed:.6,steadyFrames:32,peakFrames:32,deltaSeconds:1/120},run,
    dispose(){if(running)throw Error('Cannot dispose a running benchmark.');if(disposed)return;disposed=true;Postprocessing.Pass.fullscreenGeometry.dispose();renderer.dispose();}});
  status.textContent='Ready · explicit default WebGL2 · no animation loop';window.__performanceReady=true;
} catch(error){window.__performanceError=String(error.stack||error);status.textContent='Unavailable: '+error.message;console.error(error);}
