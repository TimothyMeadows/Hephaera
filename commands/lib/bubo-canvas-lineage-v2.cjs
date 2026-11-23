'use strict';
// Typed one-level lineage admission. No writes, native calls or human authority.
const fs=require('node:fs'),path=require('node:path'),runtime=require('./bubo-runtime.cjs');
const fail=message=>{throw Error(message);},ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const STAGES=['classify','prepare-proofs','preprocess','reconstruct','finish','guided','review'];
const FIELDS=['schemaVersion','kind','decision','task','asset','sourceVersion','targetVersion','authorization','inputApproval','priorManifest','priorStateRoot','priorStaging','priorAttempts','priorDirectories','priorHistoryCounts','stageLimits'];
function fields(value,names,label){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==names.length||names.some(name=>!Object.hasOwn(value,name)))fail('Exact '+label+' fields required.');}
function sameRef(a,b){return a?.path===b?.path&&a?.sha256===b?.sha256;}
function capability(value){if(value?.stageLineageVersion!==1||JSON.stringify(value.stageLineageVersions)!=='[1,2]')fail('Installed native publication has not qualified explicit one-level canvas lineage v2.');}
function collect({root,task,asset,version,lineage,capabilities,json,file,reference}){
 capability(capabilities);
 const state='.hephaera/.cache/tasks/'+task;
 function taskRef(value,kind='input'){if(typeof value?.path!=='string'||!value.path.startsWith(state+'/')||!value.path.endsWith('.json'))fail('Exact active-task lineage reference required.');return file(value,kind);}
 function readRef(value){taskRef(value);return json(value.path,1048576);}
 function paths(value,stage,staging){if(!Array.isArray(value)||value.length>4)fail('Bounded stage attempts required.');const sorted=[...value].sort();if(value.some((name,index)=>typeof name!=='string'||name!==sorted[index]||!name.startsWith(staging+'/attempts/'+stage+'-')||name.slice((staging+'/attempts/').length).includes('/')||name.includes('\\')||name.includes(':')||name.split('/').some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part))))fail('Canonical sorted stage attempt paths required.');if(new Set(value.map(name=>name.toLowerCase())).size!==value.length)fail('Stage attempt aliases refused.');}
 function scope(value,chained){
  fields(value,chained?[...FIELDS,'inheritedLineage']:FIELDS,'canvas '+(chained?'v2':'inherited v1')+' lineage');
  if(value.schemaVersion!==(chained?2:1)||value.kind!=='proof-to-model-stage-lineage'||value.decision!=='approved'||value.task!==task||value.asset!==asset||![value.sourceVersion,value.targetVersion].every(name=>ID.test(name||'')&&name!=='..')||value.sourceVersion.toLowerCase()===value.targetVersion.toLowerCase())fail('Same-task/class fresh lineage versions required.');
  const oldState=state+'/proof-to-model/'+asset+'/'+value.sourceVersion,oldArt='.art-staging/proof-to-model/'+asset+'/'+value.sourceVersion;
  if(value.priorStateRoot!==oldState||value.priorStaging!==oldArt||value.priorManifest?.path!==oldState+'/manifest.json')fail('Actual exact predecessor roots/manifest required.');
  for(const key of['priorAttempts','priorDirectories','priorHistoryCounts','stageLimits'])fields(value[key],STAGES,key);
  for(const stage of STAGES){paths(value.priorAttempts[stage],stage,oldArt);paths(value.priorDirectories[stage],stage,oldArt);const count=value.priorHistoryCounts[stage],limit=['classify','prepare-proofs'].includes(stage)?4:stage==='preprocess'?(chained?3:2):1;if(value.stageLimits[stage]!==limit||!Number.isSafeInteger(count)||count<0||count>value.priorAttempts[stage].length||value.priorDirectories[stage].some(name=>!value.priorAttempts[stage].includes(name))||value.priorAttempts[stage].length>limit)fail('No erased or expanded stage counters.');if(!['classify','prepare-proofs','preprocess'].includes(stage)&&value.priorAttempts[stage].length)fail('No model/downstream expenditure may be reset.');}
  if(value.priorAttempts.preprocess.length!==1||value.priorDirectories.preprocess.length!==1||value.priorHistoryCounts.preprocess!==1)fail('Exactly one OWN predecessor preprocessing start per version required.');
  return{state:oldState,art:oldArt};
 }
 function stageBound(manifest,pathname,expected){const stages=manifest.stages;if(!stages||typeof stages!=='object'||Array.isArray(stages)||Object.keys(stages).length>STAGES.length)fail('Bounded actual native stages required.');let matches=0;for(const stage of Object.values(stages)){if(!stage.inputs||typeof stage.inputs!=='object'||Array.isArray(stage.inputs)||Object.keys(stage.inputs).length>512)fail('Bounded actual stage inputs required.');if(Object.hasOwn(stage.inputs,pathname)){matches++;if(stage.inputs[pathname]!==expected)fail('Immediate prior immutable stage hash disagrees with current metadata bytes.');}}if(!matches)fail('Actual prior stage-bound metadata hash required.');}
 const immediateRoots=scope(lineage,true);if(lineage.targetVersion!==version)fail('Current target version changed.');
 const immediate=readRef(lineage.priorManifest);
 if(immediate.schemaVersion!==3||immediate.task!==task||immediate.asset!==asset||immediate.version!==lineage.sourceVersion||immediate.staging!==immediateRoots.art||immediate.stageLineageFile!==lineage.inheritedLineage?.path||typeof immediate.preprocessingProfileFile!=='string')fail('Inherited selector must belong to actual immediate manifest.');
 taskRef(lineage.inheritedLineage);const inherited=json(lineage.inheritedLineage.path);
 stageBound(immediate,lineage.inheritedLineage.path,lineage.inheritedLineage.sha256);
 const originalRoots=scope(inherited,false);
 if(inherited.targetVersion!==lineage.sourceVersion||lineage.targetVersion.toLowerCase()===inherited.sourceVersion.toLowerCase()||!sameRef(inherited.inputApproval,lineage.inputApproval))fail('Only one distinct same-class v1 ancestor and unchanged input authority allowed.');
 const original=readRef(inherited.priorManifest);
 if(original.schemaVersion!==3||original.task!==task||original.asset!==asset||original.version!==inherited.sourceVersion||original.staging!==originalRoots.art||original.stageLineageFile!=null||original.preprocessingProfileFile!=null)fail('Original cannot contain chained recovery selectors.');
 // Register the prior paired profile only via its unanimously recorded input SHA.
 const profilePath=immediate.preprocessingProfileFile,profileHashes=Object.values(immediate.stages).map(stage=>stage.inputs?.[profilePath]).filter(value=>value!==undefined);
 if(!profileHashes.length||new Set(profileHashes).size!==1)fail('Actual immediate profile bytes must be stage-bound.');taskRef({path:profilePath,sha256:profileHashes[0]});
 function inventory(manifest,value,roots){
  if(!Array.isArray(manifest.history)||manifest.history.length>512)fail('Bounded actual predecessor history required.');
  const byStage=Object.fromEntries(STAGES.map(stage=>[stage,[]])),directory=runtime.projectPath(root,roots.art+'/attempts');runtime.components(directory);
  if(!fs.existsSync(directory))fail('Actual retained prior attempt root required.');const handle=fs.opendirSync(directory);let count=0;
  try{let entry;while((entry=handle.readSync())){if(++count>100||!entry.isDirectory()||entry.isSymbolicLink())fail('Unknown/linked/unbounded retained attempt entry.');const stage=STAGES.find(stage=>entry.name.startsWith(stage+'-'));if(!stage)fail('Unknown retained stage directory.');const full=path.join(directory,entry.name);runtime.components(full);byStage[stage].push(roots.art+'/attempts/'+entry.name);}}finally{handle.closeSync();}
  for(const stage of STAGES){const dirs=byStage[stage].sort(),starts=manifest.history.filter(item=>item?.event==='stage-start'&&item.stage===stage);if(starts.some(item=>typeof item.attempt!=='string'||!item.attempt.startsWith(roots.art+'/attempts/'+stage+'-')||item.attempt.slice((roots.art+'/attempts/').length).includes('/')))fail('History escaped exact retained staging root.');const attempts=[...new Set([...dirs,...starts.map(item=>item.attempt)])].sort();if(JSON.stringify(dirs)!==JSON.stringify(value.priorDirectories[stage])||JSON.stringify(attempts)!==JSON.stringify(value.priorAttempts[stage])||starts.length!==value.priorHistoryCounts[stage])fail('Actual retained directories/history changed, including EMPTY starts.');}
  if(manifest.stages?.preprocess?.status!=='failed'||manifest.stages.preprocess.attempt!==value.priorAttempts.preprocess[0]||manifest.stages.reconstruct)fail('Both actually retained preprocessing stages must be failed with model0.');
 }
 inventory(immediate,lineage,immediateRoots);inventory(original,inherited,originalRoots);
 for(const stage of STAGES){const attempts=[...inherited.priorAttempts[stage],...lineage.priorAttempts[stage]];if(new Set(attempts.map(name=>name.toLowerCase())).size!==attempts.length||attempts.length>lineage.stageLimits[stage])fail('Cumulative inherited/OWN count cannot reset or exceed stage ceiling.');}
 taskRef(inherited.authorization,'policy');taskRef(inherited.inputApproval,'policy');taskRef(lineage.inputApproval,'policy');taskRef(lineage.authorization,'policy');
 const grant=json(lineage.authorization.path);fields(grant,['schemaVersion','kind','authorized','actor','task','asset','sourceVersion','targetVersion','stage','priorManifest','inheritedLineage','consumedAttempts','maximumAttempts','maximumChildren','automaticRetries'],'additional-stage assertion');
 fields(grant.priorManifest,['path','sha256'],'grant prior manifest reference');fields(grant.inheritedLineage,['path','sha256'],'grant inherited lineage reference');
 if(grant.schemaVersion!==1||grant.kind!=='proof-to-model-additional-stage'||grant.authorized!==true||typeof grant.actor!=='string'||!grant.actor.trim()||grant.actor.length>256||grant.task!==task||grant.asset!==asset||grant.sourceVersion!==lineage.sourceVersion||grant.targetVersion!==version||grant.stage!=='preprocess'||!sameRef(grant.priorManifest,lineage.priorManifest)||!sameRef(grant.inheritedLineage,lineage.inheritedLineage)||grant.consumedAttempts!==2||grant.maximumAttempts!==3||grant.maximumChildren!==4||grant.automaticRetries!==false)fail('Exact future two-spent/one-additional/max4/no-retry assertion required; not human authentication.');
 return{inputs:[immediateRoots.state,immediateRoots.art,originalRoots.state,originalRoots.art]};
}
module.exports={collect,capability};
