'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process');
const dns = require('node:dns').promises, { pathToFileURL } = require('node:url');
const store = require('./session-events.cjs');
const failure = reason => Object.assign(new Error(reason), { reason });
function outside(root, candidate, directory = false) {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate) || /[\x00-\x1f]/.test(candidate)) throw failure('default-browser-unavailable');
  const real = fs.realpathSync(candidate), relative = path.relative(root, real), stat = fs.statSync(real);
  if (!relative || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
    || !(directory ? stat.isDirectory() : stat.isFile())) throw failure('default-browser-unavailable');
  return real;
}
function tool(root, name) {
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    try { const value=outside(root,path.join(directory,name));fs.accessSync(value,fs.constants.X_OK);return value; } catch {}
  }
  return null;
}
function query(executable, args, signal) {
  return new Promise((resolve,reject) => cp.execFile(executable,args,{encoding:'utf8',maxBuffer:4096,timeout:2000,windowsHide:true,signal},(error,stdout) => error ? reject(failure('default-browser-unavailable')) : resolve(stdout.trim())));
}
function abortable(promise, signal) {
  return new Promise((resolve,reject) => {
    const cancel=()=>reject(failure('default-browser-timeout'));
    Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',cancel);resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(error);});
    if(signal.aborted)cancel();
    else signal.addEventListener('abort',cancel,{once:true});
  });
}
async function resolveBrowser(root, { platform=process.platform, run=query, find=tool, signal } = {}) {
  if(platform==='win32') {
    const powershell=path.join(process.env.SystemRoot || 'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    const value=JSON.parse(await run(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'session-default-browser-windows.ps1')],signal));
    if(typeof value.executable!=='string'||!value.executable.toLowerCase().endsWith('.exe'))throw failure('default-browser-unavailable');
    return {command:outside(root,value.executable),args:[],kind:'browser',provider:'windows-http-default'};
  }
  if(platform==='darwin') {
    const application=await run('/usr/bin/osascript',['-l','JavaScript',path.join(__dirname,'session-default-browser-macos.js')],signal);
    if(!application.endsWith('.app'))throw failure('default-browser-unavailable');
    return {command:outside(root,'/usr/bin/open'),args:['-a',outside(root,application,true)],kind:'utility',provider:'macos-http-default'};
  }
  if(platform!=='linux')throw failure('default-browser-platform-unavailable');
  if(!process.env.DISPLAY&&!process.env.WAYLAND_DISPLAY&&run===query)throw failure('desktop-session-unavailable');
  const mime=find(root,'xdg-mime');if(!mime)throw failure('default-browser-launcher-unavailable');
  const id=await run(mime,['query','default','x-scheme-handler/http'],signal);
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.desktop$/.test(id))throw failure('default-browser-unavailable');
  const gtk=find(root,'gtk-launch');if(gtk)return {command:gtk,args:[id],kind:'utility',provider:'linux-http-default'};
  const gio=find(root,'gio');
  if(gio)for(const directory of [process.env.XDG_DATA_HOME||path.join(os.homedir(),'.local/share'),...(process.env.XDG_DATA_DIRS||'/usr/local/share:/usr/share').split(':')]) {
    try { const desktop=outside(root,path.join(directory,'applications',id));return {command:gio,args:['launch',desktop],kind:'utility',provider:'linux-http-default'}; } catch {}
  }
  const opener=find(root,'xdg-open');
  if(opener&&await run(mime,['query','default','text/html'],signal)===id)return {command:opener,args:[],kind:'utility',provider:'linux-http-default'};
  throw failure('default-browser-launcher-unavailable');
}
async function launch(plan, uri, signal) {
  if(signal.aborted)throw failure('default-browser-timeout');
  // An OS launcher may replace itself with the browser. Neither may be killed
  // by a timeout or service shutdown; only read-only registration queries abort.
  await new Promise((resolve,reject)=>{
    const child=cp.spawn(plan.command,[...plan.args,uri],{detached:true,windowsHide:false,stdio:'ignore',shell:false});
    child.once('spawn',()=>{child.unref();resolve();});child.once('error',()=>reject(failure('default-browser-launch-failed')));
  });
}
async function open(root, relative, { lookup=dns.lookup.bind(dns), resolve=resolveBrowser, start=launch, timeoutMs=2700, signal: parentSignal } = {}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  const signal=parentSignal ? AbortSignal.any([controller.signal,parentSignal]) : controller.signal;
  try {
    root=store.rootPath(root);
    if(typeof relative!=='string'||!relative.startsWith(store.CACHE+'/private/launch/')||!relative.endsWith('.html'))throw failure('private-bootstrap-unavailable');
    const file=store.safe(root,relative,'file'),stat=fs.lstatSync(file);
    if(stat.nlink!==1||stat.size>16384)throw failure('private-bootstrap-unavailable');
    let addresses;
    try { addresses=await abortable(lookup('my.hephaera.com',{all:true,verbatim:true}),signal); } catch(error) { if(signal.aborted)throw failure('default-browser-timeout');throw failure('hostname-unavailable'); }
    if(!Array.isArray(addresses)||!addresses.length||addresses.some(a=>!['127.0.0.1','::1'].includes(a.address)))throw failure('hostname-not-loopback');
    if(!addresses.some(a=>a.address==='127.0.0.1'))throw failure('hostname-ipv4-unavailable');
    const plan=await abortable(resolve(root,{signal}),signal);
    if(signal.aborted)throw failure('default-browser-timeout');
    await abortable(start(plan,pathToFileURL(file).href,signal),signal);
    return {status:'opened-default-unverified'};
  } catch(error) { return {status:'browser-unavailable',reason:signal.aborted?'default-browser-timeout':error.reason||'default-browser-unavailable'}; }
  finally { clearTimeout(timer); }
}
module.exports={open,resolveBrowser};
