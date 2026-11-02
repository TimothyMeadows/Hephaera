#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {preparePublished,verifyPublished,recoverPublicJournal,selection}=require('../lib/public-release.cjs');
const {inspectPublic,publishPublic}=require('../lib/public-publish.cjs');
const TOOLS=path.resolve(__dirname,'../..');
function selected(){return selection({version:process.env.PUBLIC_VERSION,sourceSha:process.env.PUBLIC_SOURCE_SHA,releaseId:process.env.PUBLIC_RELEASE_ID,upstreamRunId:process.env.PUBLIC_UPSTREAM_RUN_ID,upstreamToolsSha:process.env.PUBLIC_UPSTREAM_TOOLS_SHA});}
function channels(){const choice=process.env.PUBLIC_REGISTRY_SELECTION||'both';if(!['npm','nuget','both'].includes(choice))throw new Error('Select npm, nuget or both public registries.');return choice==='both'?['npm','nuget']:[choice];}
function verifyTools(){
 const git=(...args)=>cp.execFileSync('git',['-C',TOOLS,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
 if(process.env.GITHUB_REPOSITORY!=='TimothyMeadows/Hephaera'||process.env.GITHUB_REF!=='refs/heads/main'||!/^[a-f0-9]{40}$/.test(process.env.HEPHAERA_PUBLIC_TOOLS_SHA||'')||git('rev-parse','HEAD')!==process.env.HEPHAERA_PUBLIC_TOOLS_SHA||git('status','--porcelain','--untracked-files=normal')||!/^https:\/\/github\.com\/TimothyMeadows\/Hephaera(?:\.git)?\/?$/i.test(git('remote','get-url','origin')))throw new Error('Public publication requires the exact clean reviewed main workflow tools.');
}
async function run(mode,directory,sourceRoot){
 if(!['prepare','publish'].includes(mode))throw new Error('Unknown public release operation.');verifyTools();const s=selected(),targetChannels=channels(),auth=process.env.PUBLIC_NPM_AUTH_MODE||'trusted';if(!['trusted','bootstrap'].includes(auth))throw new Error('Select trusted or bootstrap npm authentication explicitly.');
 const candidate=mode==='prepare'?await preparePublished(directory,{selected:s,sourceRoot}):await verifyPublished(directory,{selected:s,sourceRoot});
 await recoverPublicJournal(candidate.directory,{selected:s,currentRunId:process.env.GITHUB_RUN_ID,currentAttempt:process.env.GITHUB_RUN_ATTEMPT||'1'});
 const options={expectedManifest:candidate.receipt.manifest,channels:targetChannels,npmAuthMode:auth};
 const result=mode==='prepare'?await inspectPublic(candidate.directory,options):await publishPublic(candidate.directory,{...options,execute:true});
 const plan=path.join(candidate.directory,'public-plan.json');if(fs.existsSync(plan)&&fs.lstatSync(plan).isSymbolicLink())throw new Error('Linked public plan.');fs.writeFileSync(plan,JSON.stringify(result,null,2)+'\n');
 if(mode==='prepare'&&process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'need_npm='+String(result.needUploads.includes('npm'))+'\nneed_nuget='+String(result.needUploads.includes('nuget'))+'\n');
 return result;
}
if(require.main===module){const args=process.argv.slice(2);if(args[2]!=='--source-root'||!((args[0]==='prepare'&&args.length===4)||(args[0]==='publish'&&args.length===5&&args[4]==='--execute'))){console.error('Usage: public-release-runner.cjs prepare|publish DIRECTORY --source-root SOURCE [--execute for publish]');process.exitCode=1;}else run(args[0],args[1],args[3]).then(result=>{console.log(JSON.stringify(result,null,2));if(args[0]==='publish'&&!result.selectedComplete)process.exitCode=1;}).catch(error=>{console.error(error.message);process.exitCode=1;});}
module.exports={run};
