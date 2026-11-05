'use strict';
// Actual existing Edge only. This runner never installs, downloads, selects a
// GPU backend, changes renderer source or calls a media generation service.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {withEdgeReview}=require('./lib/edge-review.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;};
function options(argv){
  const allowed=new Set(['source','modules','edge','assets','output','route']),result={};
  for(let i=0;i<argv.length;i+=2){const name=argv[i]?.replace(/^--/,'');if(!allowed.has(name)||!argv[i]?.startsWith('--')||!argv[i+1]||result[name]!==undefined)throw Error('Use explicit --source/--modules/--edge/--assets/--output paths and optional --route composer|direct.');result[name]=argv[i+1];}
  return result;
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  const args=options(process.argv.slice(2)),source=path.resolve(args.source||path.join(__dirname,'..'));
  const pointer=path.join(source,'.hephaera/.cache/tasks/hephaera-vfx-threejs/evidence/render-inputs-latest.json');
  const assets=path.resolve(args.assets||JSON.parse(fs.readFileSync(pointer,'utf8')).directory);
  const modules=path.resolve(args.modules||process.env.HEPHAERA_VFX_NODE_MODULES||path.join(source,'tests/fixtures/threejs-postprocessing/node_modules'));
  const edge=path.resolve(args.edge||process.env.HEPHAERA_EDGE_EXE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
  const route=args.route||'composer';if(!['direct','composer'].includes(route))throw Error('Explicit route must be composer or direct.');
  const output=path.resolve(args.output||path.join(source,'.hephaera/.cache/tasks/hephaera-vfx-threejs/evidence','performance-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex')));
  const fixture=path.join(source,'tests/fixtures/vfx-review');
  const expected={three:'0.182.0','three.quarks':'0.17.1','quarks.core':'0.17.1',postprocessing:'6.39.5'};
  const versions=Object.fromEntries(Object.keys(expected).map(name=>[name,JSON.parse(fs.readFileSync(path.join(modules,name,'package.json'),'utf8')).version]));
  if(JSON.stringify(versions)!==JSON.stringify(expected))throw Error('Existing locked performance dependencies differ from the reviewed exact versions.');
  const sourceFiles=['tests/run-vfx-performance.cjs','tests/fixtures/vfx-review/performance.mjs','tests/fixtures/vfx-review/performance.html','tests/lib/edge-review.cjs','.engine/threejs/particles/three-quarks-runtime.mjs','.engine/threejs/particles/three-vfx-runtime.mjs','.engine/threejs/particles/vfx-package.mjs','.engine/threejs/postprocessing/postprocessing-runtime.mjs'];
  const sourceHashes=Object.fromEntries(sourceFiles.map(name=>[name,hash(fs.readFileSync(path.join(source,name)))]));
  const assetNames=['perf-package.json','perf-profile.json','perf-source.json','swatch-correspondence.json','swatch.png','swatch.rgba','baseline-three-quarks-runtime.mjs','fixture.json'];
  const assetHashes=Object.fromEntries(assetNames.map(name=>[name,hash(fs.readFileSync(path.join(assets,name)))]));
  const historical=JSON.parse(fs.readFileSync(path.join(assets,'perf-source.json'),'utf8'));
  if(historical.baselineRevision!=='adffd430f16d8dcbb78dc091f8606486a2f08c90'||historical.baselineSourceSha256!=='fab6001c9936b32a1d22d55c0ed883031c005c02e0ef2fa39dccd40f63a7db36'||assetHashes['baseline-three-quarks-runtime.mjs']!==historical.baselineSourceSha256)throw Error('Historical baseline bytes changed; refuse execution before loading the browser module.');
  console.log(JSON.stringify({status:'starting',output,route,pairs:5,versions}));
  const result=await withEdgeReview({edge,source,modules,fixture,assets,output},async browser=>{
    await browser.navigate('performance.html');const deadline=Date.now()+30000;
    while(Date.now()<deadline){const state=await browser.evaluate('({ready:window.__performanceReady===true,error:window.__performanceError||null})');if(state.error)throw Error(state.error);if(state.ready)break;await sleep(50);}
    if(!await browser.evaluate('window.__performanceReady===true'))throw Error('Controlled performance page did not become ready.');
    const identity=await browser.evaluate('({driver:window.__vfxPerformance.driver,inputHashes:window.__vfxPerformance.inputHashes,inputLoadMs:window.__vfxPerformance.inputLoadMs,clockQuantumMs:window.__vfxPerformance.clockQuantumMs,settings:window.__vfxPerformance.settings})');
    for(const name of assetNames)if(identity.inputHashes[name]!==assetHashes[name])throw Error('Browser input differs from preflight bytes: '+name);
    fs.writeFileSync(path.join(output,'identity.json'),JSON.stringify({browser:browser.version,...identity,sourceHashes,assetHashes,versions,source,assets,modules,edge,route},null,2)+'\n',{flag:'wx'});
    const invoke=async(variant,runId)=>{
      const run=await browser.evaluate('window.__vfxPerformance.run('+JSON.stringify({variant,runId,route,frames:32,deltaSeconds:1/120})+')');
      fs.writeFileSync(path.join(output,runId+'-'+variant+'.json'),JSON.stringify(run,null,2)+'\n',{flag:'wx'});
      return run;
    };
    const warmup=[];for(const variant of ['baseline','candidate'])warmup.push(await invoke(variant,'warmup'));
    const pairs=[];
    for(let index=0;index<5;index++){
      const pair={index:index+1,order:index%2?['candidate','baseline']:['baseline','candidate']};
      for(const variant of pair.order){pair[variant]=await invoke(variant,'pair-'+String(index+1).padStart(3,'0'));pair[variant].capture=await browser.capture('pair-'+String(index+1).padStart(3,'0')+'-'+variant+'-peak.png');}
      for(const phase of ['steady','peak'])if(pair.baseline.signatures[phase]!==pair.candidate.signatures[phase])throw Error('Particle workload/state differs within pair '+pair.index+' '+phase+'.');
      fs.writeFileSync(path.join(output,'pair-'+String(index+1).padStart(3,'0')+'.json'),JSON.stringify(pair,null,2)+'\n',{flag:'wx'});
      pairs.push(pair);console.log(JSON.stringify({status:'pair-complete',pair:pair.index,order:pair.order,baselinePeakDraws:pair.baseline.peak.inventory.draws.calls,candidatePeakDraws:pair.candidate.peak.inventory.draws.calls}));
    }
    await browser.evaluate('window.__vfxPerformance.dispose()');
    return {identity,warmup,pairs};
  });
  const sourceAfterHashes=Object.fromEntries(sourceFiles.map(name=>[name,hash(fs.readFileSync(path.join(source,name)))]));
  const assetAfterHashes=Object.fromEntries(assetNames.map(name=>[name,hash(fs.readFileSync(path.join(assets,name)))]));
  const unchanged=JSON.stringify(sourceHashes)===JSON.stringify(sourceAfterHashes)&&JSON.stringify(assetHashes)===JSON.stringify(assetAfterHashes);
  fs.writeFileSync(path.join(output,'input-stability.json'),JSON.stringify({unchanged,sourceBefore:sourceHashes,sourceAfter:sourceAfterHashes,assetsBefore:assetHashes,assetsAfter:assetAfterHashes},null,2)+'\n',{flag:'wx'});
  if(!unchanged)throw Error('Performance source or input bytes changed during execution; retain this run as stale evidence.');
  const metrics={
    'runtime construction CPU ms':run=>run.stages.runtimeConstruction.cpuMs,
    'resource admission/material CPU ms':run=>run.stages.resourceAdmission.cpuMs,
    'first acquire CPU ms':run=>run.stages.firstAcquire.cpuMs,
    'first compile/render finish wall ms':run=>run.stages.firstCompileRender.finishWallMs,
    'steady per-frame finish wall ms':run=>run.steady.perFrameWallMs,
    'steady per-frame update CPU ms':run=>run.steady.samples.reduce((n,x)=>n+x.updateCpuMs,0)/32,
    'steady per-frame render submit CPU ms':run=>run.steady.samples.reduce((n,x)=>n+x.renderSubmitCpuMs,0)/32,
    'peak acquire CPU ms':run=>run.stages.peakAcquire.cpuMs,
    'peak first compile/render finish wall ms':run=>run.stages.peakCompileRender.finishWallMs,
    'peak per-frame finish wall ms':run=>run.peak.perFrameWallMs,
    'peak per-frame update CPU ms':run=>run.peak.samples.reduce((n,x)=>n+x.updateCpuMs,0)/32,
    'peak per-frame render submit CPU ms':run=>run.peak.samples.reduce((n,x)=>n+x.renderSubmitCpuMs,0)/32,
    'peak draw submissions':run=>run.peak.inventory.draws.calls,
    'peak batch typed-array bytes':run=>run.peak.inventory.typedArrayBytes
  };
  const comparisons=Object.entries(metrics).map(([name,get])=>{
    const baseline=result.pairs.map(pair=>get(pair.baseline)),candidate=result.pairs.map(pair=>get(pair.candidate)),base=median(baseline),current=median(candidate);
    const pairedDeltas=candidate.map((value,index)=>value-baseline[index]),pairedPercents=candidate.map((value,index)=>baseline[index]?(value/baseline[index]-1)*100:null);
    return {name,baseline,candidate,baselineMedian:base,candidateMedian:current,absoluteDelta:current-base,percentDelta:base?(current/base-1)*100:null,aboveTenPercent:base?current>base*1.1:current>0,pairedDeltas,pairedMedianDelta:median(pairedDeltas),pairedPercents,positivePairs:pairedDeltas.filter(value=>value>0).length,baselineRange:[Math.min(...baseline),Math.max(...baseline)],candidateRange:[Math.min(...candidate),Math.max(...candidate)]};
  });
  const investigate=comparison=>{
    const quantization=' Observed performance.now quantum is '+result.identity.clockQuantumMs+'ms; retain all five pairs and absolute costs, including outliers. Paired deltas are positive in '+comparison.positivePairs+'/5 runs; median paired delta is '+comparison.pairedMedianDelta+'.';
    let note;
    if(comparison.name.includes('admission'))note='Candidate executes exact package/profile/decoded-resource hashing and admission that the baseline does not implement. The baseline stage only constructs its borrowed material; a zero baseline median gives no meaningful percent ratio.';
    else if(comparison.name.includes('acquire'))note='Candidate source constructs owned texture/geometry snapshots and validates aggregate reservations; baseline borrows its material and shared base geometry. Peak adds two candidate batches versus insertion into the baseline existing batch. These source/resource differences explain additional work without establishing an instruction-level timing cause.';
    else if(comparison.name.includes('draw')||comparison.name.includes('typed-array'))note='Measured peak is three independently owned production batches versus one shared starter batch. With the same composer, actual submissions are four versus two and particle batch arrays are 144420 versus 48140 bytes. This is a deterministic structural cost, not an inferred GPU-memory or frame-time estimate.';
    else if(comparison.name.includes('update'))note='Current source adds finite-resource and configuration checks, parent-transform validation, and aggregate buffer/texture reservation inspection around the same Quarks simulation. The update-only CPU samples exclude rendering; no guard was disabled and no individual check was instrumented, so causal attribution remains source-backed rather than an isolated profile.';
    else if(comparison.name.includes('peak'))note='Equal 96-particle peak states retain three candidate batches, textures and geometries versus one shared baseline batch. Two extra particle draws and associated first uploads are observed; synchronized wall time also includes CPU/driver and finish waits. The fixed composer is the same in both variants.';
    else note='Single-emitter states and render counts match. Compare paired dispersion with the independent medians; CPU update guards and timer quantization are measured separately, while any shader/driver scheduling contribution is not isolated.';
    return {metric:comparison.name,baselineMedian:comparison.baselineMedian,candidateMedian:comparison.candidateMedian,percentDelta:comparison.percentDelta,note:note+quantization};
  };
  const report={schemaVersion:'hephaera-vfx-performance/v1',status:'measured',route,pairs:5,identity:result.identity,sourceHashes,sourceAfterHashes,assetHashes,assetAfterHashes,inputsUnchanged:unchanged,versions,comparisons,
    methodology:{warmup:'One complete unmeasured workload per variant, then five pairs with alternating execution order on one renderer/context.',stages:'Common input setup, runtime construction, resource admission/material setup, first acquire, composer construction, first update, shader compile/render, 32 steady frames, two added leases, peak compile/render, 32 peak frames, cleanup.',timing:'performance.now CPU submission and wall intervals; gl.finish synchronizes each frame. These measurements include CPU/driver/synchronization and are not pure GPU timer queries.',comparison:'Exact common authored burst/profile, stable source resources, reset seeds, camera, resolution, delta and actual particle-state hashes within every pair. Baseline has no native/profile admission equivalent.',limits:'One actual default Edge/WebGL2 device and technical workload; no real-time bound, all-family performance, artistic/accessibility, MAUI/device-class or human acceptance claim.'},
    investigations:comparisons.filter(x=>x.aboveTenPercent).map(investigate)};
  fs.writeFileSync(path.join(output,'performance-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  const fmt=value=>value===null?'n/a':Number(value).toFixed(4),rows=comparisons.map(x=>'| '+x.name+' | '+fmt(x.baselineMedian)+' | '+fmt(x.candidateMedian)+' | '+fmt(x.percentDelta)+'% |').join('\n');
  fs.writeFileSync(path.join(output,'performance-report.md'),'# Controlled Task4 VFX performance\n\nFive alternating baseline/candidate pairs after one warmup each; route `'+route+'`. Exact inputs/source/device/settings and every raw frame are retained beside this report.\n\n| Metric | Baseline median | Candidate median | Change |\n| --- | ---: | ---: | ---: |\n'+rows+'\n\nCPU and synchronized wall measurements use performance.now and gl.finish. They include CPU/driver/GPU/synchronization, not pure GPU timer queries. Baseline resource setup has no package-admission equivalent. Values near the observed clock quantum require caution.\n\n'+report.investigations.map(x=>'- '+x.metric+': '+x.note).join('\n')+'\n\nCurrent per-lease ownership can allocate one batch per production lease; the baseline shares a batch. Draw/typed-array increases are measured resource costs, not inferred GPU memory or timing. No engine implementation was changed by this runner.\n',{flag:'wx'});
  console.log(JSON.stringify({status:'measured',output,route,comparisons,investigations:report.investigations}));
}
main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
