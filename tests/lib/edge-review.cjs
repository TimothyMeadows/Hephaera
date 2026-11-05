'use strict';
// Existing, explicitly selected Edge only. No installation, CDN, GPU override or renderer fallback.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), cp = require('node:child_process');
const crypto = require('node:crypto');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function safeFile(root, relative) {
  if (relative.split('/').some(x => !x || x === '.' || x === '..' || x === '.git') || /[\\\x00]/.test(relative)) throw Error('Unsafe local review path');
  const full = path.resolve(root, relative);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw Error('Review path escaped explicit route');
  let current = path.parse(full).root;
  for (const part of full.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw Error('Review routes refuse linked components');
  }
  if (!fs.statSync(full).isFile()) throw Error('Review route is not a file');
  return full;
}
class Cdp {
  constructor(socket) {
    this.socket = socket; this.sequence = 0; this.pending = new Map(); this.events = [];
    socket.addEventListener('message', event => {
      if (typeof event.data !== 'string' || event.data.length > 16 * 1024 * 1024) return socket.close();
      const data = JSON.parse(event.data);
      if (data.id) {
        const item = this.pending.get(data.id); if (!item) return;
        this.pending.delete(data.id); clearTimeout(item.timer);
        data.error ? item.reject(Error(JSON.stringify(data.error))) : item.resolve(data.result);
      } else if (this.events.length < 2048) this.events.push(data);
    });
    socket.addEventListener('close', () => {
      for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(Error('Owned browser connection closed')); }
      this.pending.clear();
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Owned browser connection timeout')), 10000);
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, {once:true});
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(Error('Owned browser connection failed')); }, {once:true});
    });
    return new Cdp(socket);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error('Owned browser command timed out: ' + method)); }, 45000);
      this.pending.set(id, {resolve,reject,timer});
      this.socket.send(JSON.stringify({id,method,params,...(sessionId ? {sessionId} : {})}));
    });
  }
}
async function withEdgeReview({edge, source, modules, fixture, assets, output}, action) {
  for (const value of [edge,source,modules,fixture,assets,output]) if (!path.isAbsolute(value)) throw Error('Review paths must be explicitly absolute');
  if (!fs.statSync(edge).isFile()) throw Error('Explicit existing Edge executable unavailable');
  if (fs.existsSync(output)) throw Error('Review output already exists; retain its evidence');
  fs.mkdirSync(output, {recursive:true});
  const routes = {'/source/':source,'/deps/':modules,'/fixture/':fixture,'/assets/':assets};
  const allowedPackages = new Set(['three','three.quarks','quarks.core','postprocessing']);
  const requests = [];
  const server = http.createServer((req,res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const prefix = Object.keys(routes).find(x => pathname.startsWith(x));
      if (!prefix) throw Error('Unregistered local review route');
      const relative = pathname.slice(prefix.length);
      if (prefix === '/source/' && !relative.startsWith('.engine/threejs/')) throw Error('Only registered renderer source is exposed');
      if (prefix === '/deps/' && !allowedPackages.has(relative.split('/')[0])) throw Error('Undeclared dependency');
      const file = safeFile(routes[prefix], relative);
      if (requests.length >= 2048) throw Error('Review request budget exceeded');
      const fd = fs.openSync(file,'r'); let bytes;
      try {
        const size = fs.fstatSync(fd).size;
        if (size < 1 || size > 64 * 1024 * 1024) throw Error('Review resource byte budget exceeded');
        bytes = Buffer.alloc(size);
        let offset = 0;
        while (offset < size) {
          const count = fs.readSync(fd,bytes,offset,Math.min(65536,size-offset),null);
          if (!count) throw Error('Review input was truncated'); offset += count;
        }
        if (fs.readSync(fd,Buffer.alloc(1),0,1,null) || fs.fstatSync(fd).size !== size) throw Error('Review input changed size');
      } finally { fs.closeSync(fd); }
      requests.push({path:pathname,bytes:bytes.length,sha256:hash(bytes)});
      res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'");
      res.end(bytes);
    } catch { res.statusCode = 404; res.end('Unavailable local review resource'); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const profile = path.join(output,'owned-edge-profile');
  const args = ['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'];
  let browser, cdp, exited = false, stderr = '', completed = false;
  try {
    browser = cp.spawn(edge,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
    browser.once('close', () => { exited = true; });
    browser.once('error', () => { exited = true; });
    browser.stderr.on('data', chunk => { if (stderr.length < 1024*1024) stderr += chunk; });
    const portFile = path.join(profile,'DevToolsActivePort'), started = Date.now();
    while (!fs.existsSync(portFile) && !exited && Date.now()-started < 20000) await wait(50);
    if (!fs.existsSync(portFile)) throw Error('Explicit Edge did not open its owned local debugging port');
    const [port,endpoint] = fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);
    cdp = await Cdp.connect('ws://127.0.0.1:' + port + endpoint);
    const version = await cdp.send('Browser.getVersion');
    const {targetId} = await cdp.send('Target.createTarget',{url:'about:blank'});
    const {sessionId} = await cdp.send('Target.attachToTarget',{targetId,flatten:true});
    await cdp.send('Page.enable',{},sessionId);
    await cdp.send('Runtime.enable',{},sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:960,height:600,deviceScaleFactor:1,mobile:false},sessionId);
    const evaluate = async expression => {
      const value = await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
      if (value.exceptionDetails) throw Error('Review page exception: ' + (value.exceptionDetails.exception?.description || value.exceptionDetails.text));
      return value.result.value;
    };
    const api = {origin,version,requests,evaluate,
      navigate: relative => cdp.send('Page.navigate',{url:origin+'/fixture/'+relative},sessionId),
      capture: async name => {
        if (!/^[a-z0-9_-]+\.png$/.test(name)) throw Error('Unsafe review capture name');
        const frame = await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
        const bytes = Buffer.from(frame.data,'base64'); fs.writeFileSync(path.join(output,name),bytes,{flag:'wx'});
        return {path:name,bytes:bytes.length,sha256:hash(bytes)};
      }};
    const result = await action(api);
    fs.writeFileSync(path.join(output,'browser-result.json'),JSON.stringify({version,result,requests,flags:args.filter(x=>!x.startsWith('--user-data-dir')&&!x.startsWith('--remote-debugging')),completedAt:new Date().toISOString(),scope:'Explicit default Edge WebGL2 on this host; no forced GPU/software backend or MAUI/device acceptance'},null,2));
    completed = true;
    return result;
  } finally {
    if (cdp) { try { await cdp.send('Browser.close'); } catch {} cdp.socket.close(); }
    if (browser && !exited) {
      await Promise.race([new Promise(resolve => browser.once('close',resolve)),wait(5000)]);
      if (!exited) {
        if (process.platform === 'win32') await new Promise(resolve => cp.execFile('taskkill',['/PID',String(browser.pid),'/T','/F'],{windowsHide:true},()=>resolve()));
        else browser.kill('SIGTERM');
        const deadline = Date.now()+5000;
        while (!exited && Date.now()<deadline) await wait(25);
      }
    }
    server.closeAllConnections(); server.close();
    // Do not publish the session-local DevTools endpoint printed by Chromium.
    fs.writeFileSync(path.join(output,'browser-log.txt'),stderr.split(/\r?\n/).filter(line=>!line.includes('DevTools listening')).join('\n'));
    fs.writeFileSync(path.join(output,'cleanup.json'),JSON.stringify({completed,browserPid:browser?.pid??null,retired:exited,ownedProfileRetained:true},null,2));
  }
}
module.exports = {withEdgeReview};
