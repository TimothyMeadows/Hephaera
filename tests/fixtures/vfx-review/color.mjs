import * as THREE from 'three';
import * as Quarks from 'three.quarks';
import * as Postprocessing from 'postprocessing';
import {createThreeVfxRuntime,inspectVfxTexture} from '/source/.engine/threejs/particles/three-vfx-runtime.mjs';
import {inspectVfxGeometry} from '/source/.engine/threejs/particles/vfx-package.mjs';
import {createPostprocessingRuntime} from '/source/.engine/threejs/postprocessing/postprocessing-runtime.mjs';

// Original diagnostic fixtures only. The Node driver independently verifies
// the referenced PNG/GLB correspondence reports before serving this page.
const json=async name=>(await fetch('/assets/'+name)).json();
const bytes=async name=>new Uint8Array(await(await fetch('/assets/'+name)).arrayBuffer());
window.__colorReady=false;
try {
  const [fixture,pkg,profile,geometryData,decode,review,swatchPackage,swatchProfile,swatchDecode,swatchReview]=await Promise.all(
    ['fixture.json','render-package.json','profile.json','geometry.json','texture-correspondence.json','binding-review.json',
      'perf-package.json','perf-profile.json','swatch-correspondence.json','swatch-binding-review.json'].map(json));
  const texture=new THREE.DataTexture(await bytes('atlas.rgba'),decode.width,decode.height,THREE.RGBAFormat,THREE.UnsignedByteType);
  const swatch=new THREE.DataTexture(await bytes('swatch.rgba'),1,1,THREE.RGBAFormat,THREE.UnsignedByteType);
  const geometry=new THREE.BufferGeometry();
  for(const name of ['position','normal','uv'])geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(geometryData[name]),name==='uv'?2:3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(geometryData.index),1));
  const measurement=inspectVfxTexture(texture),mesh=inspectVfxGeometry(geometry),swatchMeasurement=inspectVfxTexture(swatch);
  if(measurement.pixelsSha256!==decode.pixelsSha256||swatchMeasurement.pixelsSha256!==swatchDecode.pixelsSha256)throw Error('Actual reviewed pixels differ');
  const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#view'),alpha:true,antialias:false,preserveDrawingBuffer:true});
  renderer.setSize(960,540,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
  const gl=renderer.getContext(),shaderErrors=[];
  renderer.debug.onShaderError=(context,program,vertex,fragment)=>shaderErrors.push({program:context.getProgramInfoLog(program),vertex:context.getShaderInfoLog(vertex),fragment:context.getShaderInfoLog(fragment)});
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4,4,2.25,-2.25,.1,100);camera.position.set(0,0,8);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const service=createThreeVfxRuntime({THREE,Quarks,scene,renderer,engineSelection:fixture.engineSelection,budgets:fixture.budgets});
  const composer=createPostprocessingRuntime({THREE,Postprocessing,scene,renderer,camera,engineSelection:fixture.engineSelection});
  const atlasProfile=structuredClone(profile);atlasProfile.layers=atlasProfile.layers.filter(layer=>layer.family==='sprite');
  const bindings=pkg.resources.map(resource=>resource.kind==='texture-png'?{id:resource.id,sha256:resource.sha256,texture,width:decode.width,height:decode.height,
    review:{resourceSha256:resource.sha256,pixelsSha256:measurement.pixelsSha256,independent:true,sourceEvidence:review.sourceEvidence}}:
    {id:resource.id,sha256:resource.sha256,geometry,review:{resourceSha256:resource.sha256,geometrySha256:mesh.sha256,maxVertices:24,maxIndices:36,maxBytes:840,independent:true,sourceEvidence:review.sourceEvidence}});
  const atlasHandle=service.admit({package:pkg,packageBytes:await bytes('render-package.json'),packageSha256:fixture.packageSha256,preparationSha256:fixture.preparationSha256,profile:atlasProfile,bindings});
  const opaqueProfile=structuredClone(swatchProfile);Object.assign(opaqueProfile.layers[0],{size:1.1,speed:0});
  Object.assign(opaqueProfile.layers[0].emission,{count:1,lifetimeSeconds:.8,durationSeconds:.8});opaqueProfile.budgets.maxDurationSeconds=2;
  const resource=swatchPackage.resources[0];
  const opaqueHandle=service.admit({package:swatchPackage,packageBytes:await bytes('perf-package.json'),packageSha256:swatchProfile.nativePackageSha256,profile:opaqueProfile,
    bindings:[{id:resource.id,sha256:resource.sha256,texture:swatch,width:1,height:1,colorSpace:'srgb',alpha:'straight',
      review:{resourceSha256:resource.sha256,pixelsSha256:swatchMeasurement.pixelsSha256,independent:true,sourceEvidence:swatchReview.sourceEvidence}}]});
  const referenceTexture=texture.clone(),referenceSwatch=swatch.clone();
  for(const item of [referenceTexture,referenceSwatch]){item.flipY=true;item.premultiplyAlpha=false;item.colorSpace=THREE.SRGBColorSpace;item.generateMipmaps=false;item.minFilter=THREE.LinearFilter;item.magFilter=THREE.LinearFilter;item.needsUpdate=true;}
  let reference,referenceMaterial,referenceGeometry;
  const pixels=new Uint8Array(960*540*4);
  function frame(kind='atlas',background='dark',postprocessing=false){
    service.clear();if(reference){scene.remove(reference);referenceMaterial.dispose();referenceGeometry.dispose();}
    scene.background=new THREE.Color(background==='dark'?0x101720:0xe8edf1);
    const isAtlas=kind==='atlas',layer=isAtlas?atlasProfile.layers[0]:opaqueProfile.layers[0];
    const atlas=pkg.atlases[0],rect=atlas.frames[0];
    const width=isAtlas?rect.width/rect.height:1;
    referenceGeometry=new THREE.PlaneGeometry(width,1);referenceGeometry.scale(layer.size,layer.size,1);
    if(isAtlas){const uv=referenceGeometry.getAttribute('uv');for(let index=0;index<uv.count;index++)uv.setXY(index,(rect.x+uv.getX(index)*rect.width)/atlas.width,(atlas.height-rect.y-rect.height+uv.getY(index)*rect.height)/atlas.height);uv.needsUpdate=true;}
    referenceMaterial=new THREE.MeshBasicMaterial({map:isAtlas?referenceTexture:referenceSwatch,transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,premultipliedAlpha:false,toneMapped:true});
    reference=new THREE.Mesh(referenceGeometry,referenceMaterial);reference.position.x=-1;scene.add(reference);
    service.acquire({package:isAtlas?atlasHandle:opaqueHandle,effectId:layer.effectId,layerId:layer.layerId,id:'color',ownerId:'color-review',parent:scene,transform:{position:[1,0,0]}});
    service.update(.01);renderer.info.reset();if(postprocessing)composer.render(0);else renderer.render(scene,camera);
    gl.finish();gl.readPixels(0,0,960,540,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let maximum=0,total=0,count=0;
    const halfWidth=Math.floor(width*layer.size*60)-5,halfHeight=Math.floor(layer.size*60)-5;
    for(let y=-halfHeight;y<=halfHeight;y+=2)for(let x=-halfWidth;x<=halfWidth;x+=2){
      const left=((270+y)*960+360+x)*4,right=((270+y)*960+600+x)*4;
      for(let channel=0;channel<4;channel++){const difference=Math.abs(pixels[left+channel]-pixels[right+channel]);maximum=Math.max(maximum,difference);total+=difference;count++;}
    }
    const center=(270*960+600)*4;
    document.querySelector('#status').textContent=kind+' / '+background+' / '+(postprocessing?'LDR composer':'direct')+' / reference left, VFX right';
    return {kind,background,postprocessing,maximumChannelDifference:maximum,meanChannelDifference:total/count,comparedChannels:count,center:Array.from(pixels.slice(center,center+4)),glError:gl.getError(),shaderErrors:[...shaderErrors],render:{...renderer.info.render},service:service.stats()};
  }
  window.__colorReview={frame,dispose(){service.clear();service.releasePackage(atlasHandle);service.releasePackage(opaqueHandle);service.dispose();composer.dispose();if(reference){scene.remove(reference);referenceMaterial.dispose();referenceGeometry.dispose();}referenceTexture.dispose();referenceSwatch.dispose();texture.dispose();swatch.dispose();geometry.dispose();renderer.dispose();}};
  frame();window.__colorReady=true;
} catch(error){window.__reviewError=String(error.stack||error);document.querySelector('#status').textContent='Unavailable: '+error.message;console.error(error);}
