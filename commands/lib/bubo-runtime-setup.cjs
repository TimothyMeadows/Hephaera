'use strict';
const path = require('node:path');
const cp = require('node:child_process');
const runtime = require('./bubo-runtime.cjs');
const maintenance = require('./installation-maintenance.cjs');
const root = path.basename(runtime.BASE) === '.hephaera' ? path.dirname(runtime.BASE) : runtime.BASE;
async function ownedProcess(executable, values, timeoutMilliseconds) {
  const child=cp.spawn(executable,values,{cwd:runtime.BASE,stdio:'inherit',windowsHide:true,detached:process.platform!=='win32',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  let canceled=false;
  const cancel=()=>{canceled=true;if(!child.pid)return;if(process.platform==='win32')cp.spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else try{process.kill(-child.pid,'SIGKILL');}catch{}};
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  const timer=setTimeout(cancel,timeoutMilliseconds);
  try{const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});if(canceled||status!==0)throw new Error('Explicit Bubo source/build process failed or was canceled.');}
  finally{clearTimeout(timer);process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
async function main(args) {
  const [operation, configuration = 'Release', ...extra] = args;
  if (extra.length || !['initialize','build'].includes(operation) || operation === 'initialize' && args.length !== 1 || !['Release','Debug'].includes(configuration)) throw new Error('Use initialize, or build [Release|Debug].');
  await maintenance.run(root, async () => {
    if (operation === 'initialize') {
      await ownedProcess('git', ['-C', runtime.BASE, 'submodule','update','--init','--recursive','--checkout','runtime/bubo'], 600000);
      runtime.resource('proof-to-model/manifest.schema.json');
      console.log('Initialized the recorded Bubo revision. Build explicitly; no native tools/models were installed.');
      return;
    }
    runtime.resource('proof-to-model/manifest.schema.json');
    runtime.run('dotnet', ['--version']);
    const script = path.join(runtime.BASE, 'runtime/bubo/scripts', process.platform === 'win32' ? 'build.ps1' : 'build.sh');
    const executable = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const values = process.platform === 'win32' ? ['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Configuration',configuration] : [script,configuration];
    await ownedProcess(executable,values,1800000);
    const info = runtime.verified();
    console.log(JSON.stringify({ revision:info.pinned.revision, apiVersion:2, build:info.capability.build },null,2));
  });
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode=1; });
module.exports = { main, ownedProcess };
