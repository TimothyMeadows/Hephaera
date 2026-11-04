'use strict';
// Explicit local Edge + already installed libraries + native-derived original fixtures.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {withEdgeReview}=require('./lib/edge-review.cjs');
const BASE=path.resolve(__dirname,'..'),args=process.argv.slice(2);
if(args.length!==4)throw Error('Use EDGE_EXE EXISTING_NODE_MODULES ASSETS_DIRECTORY NEW_OUTPUT_DIRECTORY');
const [edge,modules,assets,output]=args.map(x=>path.resolve(x));
let checks=0;
const check=(value,message)=>{if(!value)throw Error(message);checks++;};
const sourceNames=['.engine/threejs/particles/three-quarks-runtime.mjs','.engine/threejs/particles/three-vfx-runtime.mjs','.engine/threejs/particles/vfx-package.mjs','.engine/threejs/particles/vfx-review-scene.mjs','.engine/threejs/postprocessing/postprocessing-runtime.mjs','tests/fixtures/vfx-review/scene.mjs','tests/fixtures/vfx-review/index.html','tests/fixtures/vfx-review/color.mjs','tests/fixtures/vfx-review/color.html','tests/run-vfx-webgl.cjs','tests/lib/edge-review.cjs'];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before=Object.fromEntries(sourceNames.map(name=>[name,sha(path.join(BASE,name))]));
const evidenceHashes={};
function verifyReport(bindingName){
  const binding=JSON.parse(fs.readFileSync(path.join(assets,bindingName),'utf8')).sourceEvidence;
  function reviewedFile(relative,expected){
    if(typeof relative!=='string'||relative.includes('\\')||relative.split('/').some(x=>!x||x==='.'||x==='..')||path.isAbsolute(relative))throw Error('Unsafe source-correspondence evidence path');
    const file=path.resolve(BASE,relative);if(!file.startsWith(BASE+path.sep))throw Error('Source evidence escaped project');
    let current=BASE;for(const part of relative.split('/')){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('Linked source evidence refused');}
    const actual=sha(file);check(actual===expected,'Stale independently reviewed source evidence: '+relative);evidenceHashes[relative]=actual;return file;
  }
  const report=JSON.parse(fs.readFileSync(reviewedFile(binding.path,binding.sha256),'utf8'));
  check(report.independent===true&&report.status==='passed','Independent technical source-correspondence review missing');
  for(const item of report.evidenceFiles)reviewedFile(item.path,item.sha256);
}
verifyReport('binding-review.json');verifyReport('swatch-binding-review.json');
withEdgeReview({edge,source:BASE,modules,fixture:path.join(BASE,'tests/fixtures/vfx-review'),assets,output},async browser=>{
  await browser.navigate('index.html');
  const start=Date.now();let ready=false,error;
  while(Date.now()-start<30000){({ready,error}=await browser.evaluate('({ready:!!window.__reviewReady,error:window.__reviewError||null})'));if(error)throw Error(error);if(ready)break;await new Promise(resolve=>setTimeout(resolve,50));}
  check(ready,'Actual review page did not become ready');
  const driver=await browser.evaluate('window.__vfxReview.driver'),families=await browser.evaluate('window.__vfxReview.families');
  check(/^WebGL 2\.0/.test(driver.webgl),'Actual selected context is not WebGL2');
  const captures=[],frames=[];
  for(const family of ['all',...families]){
    for(const postprocessing of [false,true]){
      const result=await browser.evaluate(`window.__vfxReview.frame(${JSON.stringify(family)},.25,${postprocessing})`);
      check(result.glError===0&&result.shaderErrors.length===0,'Actual shader/GL failure in '+family);
      check(result.nonfinite===0,'Nonfinite runtime report in '+family);
      check(result.occupiedPixels>10,'Blank actual output for '+family+' / '+postprocessing);
      if(!postprocessing)check(result.render.calls<=result.state.service.drawCalls,'Actual direct draw calls exceed owned aggregate reservation in '+family);
      frames.push({family,postprocessing,...result});
      if(postprocessing)captures.push(await browser.capture('layer-'+family+'.png'));
    }
  }
  const pauseStart=await browser.evaluate("window.__vfxReview.frame('trail',.2,true);window.__vfxReview.pause()");
  const paused=await browser.evaluate('window.__vfxReview.advance(.1)');
  check(paused.state.time===pauseStart.time&&paused.state.leases[0].time===pauseStart.leases[0].time,'Review pause advanced trail path or particles');
  await browser.evaluate('window.__vfxReview.resume()');
  const quality=[];
  for(const tier of [2,1,0]){
    const result=await browser.evaluate(`window.__vfxReview.quality(${tier});window.__vfxReview.frame('burst',.2,true)`);
    quality.push({tier,...result,capture:await browser.capture('quality-'+tier+'.png')});
  }
  check(quality[0].state.service.particles>quality[1].state.service.particles&&quality[1].state.service.particles>0&&quality[2].state.service.particles===0,'Actual quality tiers did not bound emission');
  const staticCue=await browser.evaluate("window.__vfxReview.quality(1);window.__vfxReview.frame('ground-indicator',.2,true)");
  check(staticCue.state.service.particles===1&&staticCue.occupiedPixels>10,'Nonzero quality removed a static ground cue');
  const reduced=await browser.evaluate("window.__vfxReview.quality(2);window.__vfxReview.reducedMotion(true);window.__vfxReview.frame('burst',.2,true)");
  check(reduced.state.service.reducedMotion===true&&reduced.state.service.particles<quality[0].state.service.particles,'Reduced-motion emission was not reduced');
  captures.push(await browser.capture('reduced-motion.png'));
  await browser.evaluate('window.__vfxReview.reducedMotion(false)');
  const foregroundBefore=await browser.evaluate("window.__vfxReview.frame('mesh',.2,true)");
  const occluded=await browser.evaluate('window.__vfxReview.occlusion(true)');
  check(occluded.occupiedPixels>0&&occluded.occupiedPixels<foregroundBefore.occupiedPixels*.95,'Actual foreground geometry did not occlude VFX');
  captures.push(await browser.capture('mesh-occluded.png'));await browser.evaluate('window.__vfxReview.occlusion(false)');
  const context=await browser.evaluate("window.__vfxReview.frame('all',.2,true);window.__vfxReview.contextCycle()");
  if(context.available){
    check(context.beforeFrames===context.lostFrames&&context.beforeFrames===context.unvalidatedFrames,'Composer rendered a lost or restored unvalidated context');
    check(context.after.state.renderer.frames===context.beforeFrames+1&&context.after.occupiedPixels>10&&context.after.glError===0,'Restored and revalidated actual context did not render');
    captures.push(await browser.capture('context-restored.png'));
  }
  const atlasFrames=[];
  for(const [name,seconds,expected] of [['first',.01,0],['middle',.045,1],['last',.08,2],['repeat',.11,0]]){
    const value=await browser.evaluate(`window.__vfxReview.frame('sprite',${seconds},true)`);
    const actual=value.state.leases.find(x=>x.family==='sprite').frameIndices;
    check(actual.length===1&&actual[0]===expected,'Actual rendered atlas frame order differs at '+name);
    atlasFrames.push({name,seconds,expected,...value,capture:await browser.capture('atlas-'+name+'.png')});
  }
  const tailStart=await browser.evaluate("window.__vfxReview.frame('all',.2,true);window.__vfxReview.drain()");
  check(tailStart.state.service.systems>0,'Drain prematurely removed every system');
  const drained=await browser.evaluate('window.__vfxReview.advance(.6)');
  check(drained.state.service.systems===0,'Declared bounded tails survived their deadline');
  await browser.evaluate("window.__vfxReview.frame('all',.2,true)");
  const retired=await browser.evaluate('window.__vfxReview.retire()');
  check(retired.state.service.systems===0,'Hard retirement left active systems');
  const cleanup=await browser.evaluate('window.__vfxReview.dispose()');
  check(!cleanup.borrowedTextureDisposed&&!cleanup.borrowedGeometryDisposed,'Review disposal released caller resources');
  await browser.navigate('color.html');
  const colorStart=Date.now();let colorReady=false;
  while(Date.now()-colorStart<30000){const value=await browser.evaluate('({ready:!!window.__colorReady,error:window.__reviewError||null})');if(value.error)throw Error(value.error);if(value.ready){colorReady=true;break;}await new Promise(resolve=>setTimeout(resolve,50));}
  check(colorReady,'Actual color reference page unavailable');
  const colors=[];
  for(const kind of ['swatch','atlas'])for(const background of ['dark','light'])for(const postprocessing of [false,true]){
    const value=await browser.evaluate(`window.__colorReview.frame(${JSON.stringify(kind)},${JSON.stringify(background)},${postprocessing})`);
    check(value.glError===0&&value.shaderErrors.length===0,'Color-reference shader/GL failure');
    check(value.maximumChannelDifference<=3,'Actual VFX color/alpha differs from ordinary Three.js reference: '+JSON.stringify(value));
    if(kind==='swatch')check(value.center.slice(0,3).every((channel,index)=>Math.abs(channel-[128,64,192][index])<=2),'Opaque sRGB reference is not preserved');
    colors.push({...value,capture:await browser.capture('color-'+kind+'-'+background+'-'+(postprocessing?'composer':'direct')+'.png')});
  }
  await browser.evaluate('window.__colorReview.dispose()');
  const after=Object.fromEntries(sourceNames.map(name=>[name,sha(path.join(BASE,name))]));
  check(JSON.stringify(before)===JSON.stringify(after),'Renderer source changed during capture; evidence is stale');
  for(const [name,hash]of Object.entries(evidenceHashes))check(sha(path.join(BASE,name))===hash,'Source correspondence changed during review');
  return {checks,driver,frames,captures,atlasFrames,colors,quality,staticCue,reduced,occlusion:{foregroundBefore,occluded},context,pause:{pauseStart,paused},tail:{tailStart,drained,retired},cleanup,sourceHashes:after,evidenceHashes,
    assetHashes:Object.fromEntries(fs.readdirSync(assets).filter(name=>fs.statSync(path.join(assets,name)).isFile()).map(name=>[name,sha(path.join(assets,name))])),
    limits:['Actual local Edge WebGL2 only; no other browser/device or MAUI acceptance','Pixel metrics diagnose nonblank output and source state; artistic/human acceptance remains separate','Independent source correspondence report binds actual PNG/RGBA and GLB/geometry; runtime accepts a narrow host-decoded resource profile']};
}).then(result=>console.log(JSON.stringify({output,checks:result.checks,driver:result.driver,captures:result.captures.length}))).catch(error=>{console.error(error.stack||error);process.exitCode=1;});
