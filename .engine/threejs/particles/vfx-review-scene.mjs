import {createThreeVfxRuntime} from './three-vfx-runtime.mjs';
import {createPostprocessingRuntime} from '../postprocessing/postprocessing-runtime.mjs';

/** Explicit diagnostic scene attachment. The caller owns the renderer, camera,
 * scene, asset admission and scheduling. This helper never starts a frame loop,
 * changes a game clock, loads resources or grants visual/runtime acceptance. */
export function attachVfxReviewScene({THREE,Quarks,Postprocessing,scene,renderer,camera,engineSelection,admission,budgets}) {
  const service = createThreeVfxRuntime({THREE,Quarks,scene,renderer,engineSelection,budgets});
  let composer;
  try { composer = createPostprocessingRuntime({THREE,Postprocessing,scene,renderer,camera,engineSelection,
    maxPixels:1920*1080,maxDimension:4096,maxPixelRatio:2,maxDelta:.1}); }
  catch (error) { service.dispose(); throw error; }
  let handle;
  try { handle = service.admit(admission); }
  catch (error) { composer.dispose(); service.dispose(); throw error; }
  const layers = admission.profile.layers;
  let leases = [], time = 0, disposed = false, paused = false, selected = 'all';
  const active = () => { if (disposed) throw Error('VFX review scene is disposed'); };
  function select(family = 'all') {
    active();
    if (family !== 'all' && !layers.some(layer=>layer.family===family)) throw Error('Unknown review layer family');
    service.clear(); leases=[]; time=0; selected=family;
    const chosen = layers.filter(layer=>family==='all'||layer.family===family);
    chosen.forEach((layer,index)=> {
      const position=family==='all'?[(index%3-1)*2.25,(1-Math.floor(index/3))*1.7,0]:[0,0,0];
      const lease=service.acquire({package:handle,effectId:layer.effectId,layerId:layer.layerId,
        id:'review-'+layer.layerId,ownerId:'review',parent:scene,
        ...(layer.family==='beam'?{endpoints:{start:[position[0]-.65,position[1],0],end:[position[0]+.65,position[1]+.45,0]}}:{transform:{position}})});
      leases.push({layer,lease,position});
    });
    return inspect();
  }
  function advance(delta) {
    active();
    if (!Number.isFinite(delta)||delta<0||delta>.1) throw Error('Bounded explicit review delta required');
    if(paused)return inspect();
    time+=delta;
    for (const item of leases) if(item.layer.family==='trail') item.lease.setTransform({position:[item.position[0]-.6+time*1.4,item.position[1]+Math.sin(time*9)*.22,0]});
    service.update(delta);
    return inspect();
  }
  function render({postprocessing = true} = {}) {
    active();
    if(typeof postprocessing!=='boolean')throw Error('Select a declared direct/composer review route');
    if(postprocessing)composer.render(0);else renderer.render(scene,camera);
    return inspect();
  }
  function inspect() {
    return {selected,time,paused,service:service.stats(),renderer:composer.inspect(),leases:leases.map(item=>({family:item.layer.family,...item.lease.stats()})),
      limits:'Diagnostic playback only; no artistic, human, game-engine movement/collision or MAUI/device acceptance'};
  }
  function dispose() {
    if(disposed)return;
    service.clear(); service.releasePackage(handle); service.dispose(); composer.dispose(); leases=[]; disposed=true;
  }
  return Object.freeze({select,advance,render,inspect,
    pause(){active();paused=true;service.pause();},resume(){active();paused=false;service.resume();},
    drain(){active();for(const item of leases)item.lease.stopEmission({maxTailSeconds:item.layer.maxTailSeconds});return inspect();},
    retire(){active();service.clear();return inspect();},
    setQuality(value){active();return service.setQuality(value);},
    setReducedMotion(value){active();return service.setReducedMotion(value);},
    revalidate(){active();return composer.revalidate();},dispose});
}
