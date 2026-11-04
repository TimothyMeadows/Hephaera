import * as THREE from 'three';
import * as Quarks from 'three.quarks';
import * as Postprocessing from 'postprocessing';
import {attachVfxReviewScene} from '/source/.engine/threejs/particles/vfx-review-scene.mjs';
import {inspectVfxTexture} from '/source/.engine/threejs/particles/three-vfx-runtime.mjs';
import {inspectVfxGeometry} from '/source/.engine/threejs/particles/vfx-package.mjs';

const json=async name=> {const response=await fetch('/assets/'+name);if(!response.ok)throw Error('Required explicit fixture missing: '+name);return response.json();};
const bytes=async name=>new Uint8Array(await(await fetch('/assets/'+name)).arrayBuffer());
window.__reviewReady=false;
try {
  const [fixture,pkg,profile,geometryData,decode,review]=await Promise.all(['fixture.json','render-package.json','profile.json','geometry.json','texture-correspondence.json','binding-review.json'].map(json));
  const packageBytes=await bytes('render-package.json'),raw=await bytes('atlas.rgba');
  const texture=new THREE.DataTexture(raw,decode.width,decode.height,THREE.RGBAFormat,THREE.UnsignedByteType);
  const geometry=new THREE.BufferGeometry();
  for(const name of ['position','normal','uv'])geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(geometryData[name]),name==='uv'?2:3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(geometryData.index),1));
  const textureMeasurement=inspectVfxTexture(texture),meshMeasurement=inspectVfxGeometry(geometry);
  if(textureMeasurement.pixelsSha256!==decode.pixelsSha256||meshMeasurement.sha256!==fixture.geometryMeasurement.sha256)throw Error('Actual resource data differs from its reviewed source correspondence');
  let borrowedTextureDisposed=false,borrowedGeometryDisposed=false;
  texture.addEventListener('dispose',()=>{borrowedTextureDisposed=true;});geometry.addEventListener('dispose',()=>{borrowedGeometryDisposed=true;});
  const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#view'),alpha:true,antialias:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(960,540,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
  const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
  const driver={webgl:gl.getParameter(gl.VERSION),glsl:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):'unavailable',renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):'unavailable',maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE)};
  const shaderErrors=[];renderer.debug.onShaderError=(context,program,vertex,fragment)=>{shaderErrors.push({program:context.getProgramInfoLog(program),vertex:context.getShaderInfoLog(vertex),fragment:context.getShaderInfoLog(fragment)});};
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x101720);
  const blockerGeometry=new THREE.PlaneGeometry(.35,2),blockerMaterial=new THREE.MeshBasicMaterial({color:0x101720});
  const blocker=new THREE.Mesh(blockerGeometry,blockerMaterial);blocker.visible=false;scene.add(blocker);
  const camera=new THREE.OrthographicCamera(-4.2,4.2,2.36,-2.36,.1,100);camera.position.set(2.7,3.2,8);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  blocker.quaternion.copy(camera.quaternion);blocker.position.copy(camera.position).normalize().multiplyScalar(1.5);
  const bindings=pkg.resources.map(resource=>resource.kind==='texture-png'?{id:resource.id,sha256:resource.sha256,texture,width:decode.width,height:decode.height,
    review:{resourceSha256:resource.sha256,pixelsSha256:textureMeasurement.pixelsSha256,independent:true,sourceEvidence:review.sourceEvidence}}:
    {id:resource.id,sha256:resource.sha256,geometry,review:{resourceSha256:resource.sha256,geometrySha256:meshMeasurement.sha256,maxVertices:24,maxIndices:36,maxBytes:840,independent:true,sourceEvidence:review.sourceEvidence}});
  const admission={package:pkg,packageBytes,packageSha256:fixture.packageSha256,preparationSha256:fixture.preparationSha256,profile,bindings};
  const kit=attachVfxReviewScene({THREE,Quarks,Postprocessing,scene,renderer,camera,engineSelection:fixture.engineSelection,admission,budgets:fixture.budgets});
  const families=profile.layers.map(x=>x.family),select=document.querySelector('#family');
  for(const family of families){const option=document.createElement('option');option.value=option.textContent=family;select.append(option);}
  const pixels=new Uint8Array(960*540*4);
  let route=true,seed=17,playing=false,lastTime=0;
  function reseed(){seed=17;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  function metrics(){
    gl.finish();gl.readPixels(0,0,960,540,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const background=[pixels[0],pixels[1],pixels[2]];let occupied=0,max=0,nonfinite=0;
    for(let i=0;i<pixels.length;i+=4){const difference=Math.abs(pixels[i]-background[0])+Math.abs(pixels[i+1]-background[1])+Math.abs(pixels[i+2]-background[2]);if(difference>15)occupied++;max=Math.max(max,pixels[i],pixels[i+1],pixels[i+2]);}
    const stats=kit.inspect();if(!Object.values(stats.service).filter(x=>typeof x==='number').every(Number.isFinite))nonfinite++;
    return {occupiedPixels:occupied,maxChannel:max,nonfinite,glError:gl.getError(),render:{...renderer.info.render},memory:{...renderer.info.memory},shaderErrors:[...shaderErrors],state:stats};
  }
  function frame(family='all',seconds=.25,postprocessing=true){
    playing=false;reseed();route=postprocessing;kit.select(family);select.value=family;
    const halfWidth=family==='all'?5.2:4.2;
    camera.left=-halfWidth;camera.right=halfWidth;camera.top=halfWidth*540/960;camera.bottom=-camera.top;camera.updateProjectionMatrix();
    let remaining=seconds;while(remaining>1e-12){const delta=Math.min(1/60,remaining);kit.advance(delta);remaining-=delta;}
    renderer.info.reset();kit.render({postprocessing:route});document.querySelector('#status').textContent=family+' · '+seconds.toFixed(3)+' s · '+(route?'LDR composer':'direct');
    return metrics();
  }
  select.addEventListener('change',()=>frame(select.value));
  document.querySelector('#drain').addEventListener('click',()=>{playing=false;kit.drain();});
  document.querySelector('#play').addEventListener('click',()=>{playing=!playing;if(playing){reseed();kit.select(select.value);lastTime=0;}});
  function tick(stamp){if(playing){if(lastTime){kit.advance(Math.min(.1,(stamp-lastTime)/1000));kit.render({postprocessing:route});}lastTime=stamp;}requestAnimationFrame(tick);}
  requestAnimationFrame(tick); // This isolated review page owns its one presentation loop; the library creates none.
  window.__vfxReview={families,driver,frame,metrics,
    background(value){scene.background.set(value);},
    occlusion(enabled){blocker.visible=enabled;kit.render({postprocessing:route});return metrics();},
    advance(seconds){let remaining=seconds;while(remaining>1e-12){const delta=Math.min(.05,remaining);kit.advance(delta);remaining-=delta;}kit.render({postprocessing:route});return metrics();},
    drain(){kit.drain();return metrics();},retire(){kit.retire();kit.render({postprocessing:route});return metrics();},
    quality(value){kit.setQuality(value);return kit.inspect();},reducedMotion(value){kit.setReducedMotion(value);return kit.inspect();},
    pause(){kit.pause();return kit.inspect();},resume(){kit.resume();return kit.inspect();},
    async contextCycle(){
      const extension=gl.getExtension('WEBGL_lose_context');if(!extension)return {available:false};
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const beforeFrames=kit.inspect().renderer.frames;
      extension.loseContext();let deadline=performance.now()+3000;
      while(!gl.isContextLost()&&performance.now()<deadline)await wait(10);
      if(!gl.isContextLost())throw Error('Explicit context loss did not occur');
      await wait(50);kit.render({postprocessing:true});const lostFrames=kit.inspect().renderer.frames;
      extension.restoreContext();deadline=performance.now()+5000;
      while(gl.isContextLost()&&performance.now()<deadline)await wait(10);
      if(gl.isContextLost())throw Error('Explicit context restoration unavailable');
      await wait(50);kit.render({postprocessing:true});const unvalidatedFrames=kit.inspect().renderer.frames;
      const checked=kit.revalidate();kit.render({postprocessing:true});
      return {available:true,beforeFrames,lostFrames,unvalidatedFrames,checked,after:metrics()};
    },
    dispose(){playing=false;kit.dispose();scene.remove(blocker);blockerGeometry.dispose();blockerMaterial.dispose();return {borrowedTextureDisposed,borrowedGeometryDisposed,memory:{...renderer.info.memory}};}};
  frame('all');window.__reviewReady=true;
} catch(error) {window.__reviewError=String(error.stack||error);document.querySelector('#status').textContent='Unavailable: '+error.message;console.error(error);}
