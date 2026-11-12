'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const cp = require('node:child_process');
const { pathToFileURL } = require('node:url');
const store = require('./session-events.cjs');
const { createLocalTls } = require('./local-preview-tls.cjs');
const BASE = path.resolve(__dirname, '../..');
const versionHash = crypto.createHash('sha256').update(fs.readFileSync(__filename)).update(fs.readFileSync(require.resolve('./session-events.cjs')));
versionHash.update(fs.readFileSync(path.join(__dirname, 'session-visualizer.cjs')));
versionHash.update(fs.readFileSync(path.join(__dirname, 'private-visualizer-cache.ps1')));
for (const name of ['index.html','app.mjs','state.mjs','app.css']) versionHash.update(fs.readFileSync(path.join(BASE, 'visualizer', name)));
const VERSION = versionHash.digest('hex');
const RUNTIME = store.CACHE + '/private/runtime.json';
function runtime(root) {
  const value = store.read(root, RUNTIME, 32768);
  if (value.schemaVersion !== 1 || value.root !== root || !Number.isInteger(value.pid) || value.pid < 1 || !store.UUID.test(value.instanceId)
    || !/^https:\/\/127\.0\.0\.1:\d+$/.test(value.url) || !/^[a-f0-9]{64}$/.test(value.token) || typeof value.certificate !== 'string' || value.certificate.length > 16384) throw new Error('Invalid visualizer service ownership.');
  return value;
}
function probe(info) {
  return new Promise(resolve => {
    const request = https.get(info.url + '/api/health', { ca: info.certificate, agent: false, headers: { Authorization: 'Bearer ' + info.token } }, response => {
      let bytes = ''; response.on('data', chunk => { bytes += chunk; if (bytes.length > 4096) request.destroy(); });
      response.on('end', () => { try { resolve(response.statusCode === 200 && JSON.parse(bytes).instanceId === info.instanceId); } catch { resolve(false); } });
    });
    request.setTimeout(1500, () => request.destroy()); request.on('error', () => resolve(false));
  });
}
function browserExecutable(root) {
  const explicit = process.env.HEPHAERA_VISUALIZER_BROWSER;
  const candidates = explicit ? [explicit] : [];
  if (!explicit && process.platform === 'win32') for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
    candidates.push(path.join(base, 'Microsoft/Edge/Application/msedge.exe'), path.join(base, 'Google/Chrome/Application/chrome.exe'));
  }
  if (!explicit && process.platform === 'darwin') candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  if (!explicit && process.platform !== 'win32') for (const base of (process.env.PATH || '').split(path.delimiter)) if (path.isAbsolute(base)) for (const name of ['google-chrome','microsoft-edge','chromium','chromium-browser']) candidates.push(path.join(base, name));
  for (const candidate of candidates) try {
    if (!path.isAbsolute(candidate)) continue;
    const real = fs.realpathSync(candidate), relative = path.relative(root, real);
    if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) continue;
    if (fs.statSync(real).isFile() && (process.platform !== 'win32' || real.toLowerCase().endsWith('.exe'))) return real;
  } catch {}
  return null;
}
async function startServer({ root, instanceId = crypto.randomUUID(), port = 0, openBrowser = true, background = false } = {}) {
  root = store.rootPath(root); store.id(instanceId);
  if (!Number.isInteger(port) || port !== 0 && (port < 1024 || port > 65535)) throw new Error('Invalid visualizer port.');
  store.privateCache(root);
  const lock = store.safe(root, store.CACHE + '/server-lock', 'dir');
  fs.mkdirSync(lock, { mode: 0o700 });
  let held, tls, server, timer, expiry, closing = false;
  const clients = new Set(), browsers = new Set(), launchFiles = new Map();
  const token = crypto.randomBytes(32).toString('hex');
  const ownerFile = store.CACHE + '/server-lock/owner.json';
  store.write(root, ownerFile, { instanceId, pid: process.pid });
  async function close() {
    if (closing) return; closing = true;
    clearInterval(timer); clearTimeout(expiry);
    for (const response of clients) response.destroy();
    for (const child of browsers) { try { child.kill(); } catch {} }
    for (const [relative, bytes] of launchFiles) try {
      const full = store.safe(root, relative, 'file');
      if (fs.statSync(full).size === bytes.length && fs.readFileSync(full).equals(bytes)) fs.unlinkSync(full);
    } catch {}
    if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    tls?.dispose(); held?.release();
    try { const owned = runtime(root); if (owned.instanceId === instanceId) fs.unlinkSync(store.safe(root, RUNTIME, 'file')); } catch {}
    for (const relative of [store.CACHE + '/stop.json', ownerFile]) try { const value = store.read(root, relative); if (value.instanceId === instanceId) fs.unlinkSync(store.safe(root, relative, 'file')); } catch {}
    try { fs.rmdirSync(lock); } catch {}
  }
  try {
    held = require('./installation-maintenance.cjs').lease(root);
    tls = createLocalTls({ projectRoot: root });
    const files = new Map();
    for (const [url, relative, type] of [['/','visualizer/index.html','text/html'],['/app.mjs','visualizer/app.mjs','text/javascript'],['/state.mjs','visualizer/state.mjs','text/javascript'],['/app.css','visualizer/app.css','text/css'],['/logo.png','logo.png','image/png']]) {
      const full = store.safe(BASE, relative, 'file'), stat = fs.statSync(full);
      if (stat.size > 2 * 1024 * 1024) throw new Error('Visualizer static asset exceeds its bound.');
      files.set(url, { bytes: fs.readFileSync(full), type });
    }
    let info;
    const auth = value => typeof value === 'string' && /^Bearer [a-f0-9]{64}$/.test(value) && crypto.timingSafeEqual(Buffer.from(value), Buffer.from('Bearer ' + token));
    server = https.createServer({ ...tls.serverOptions, maxHeaderSize: 16384 }, (request, response) => {
      const finish = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); };
      response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      if (!info || request.headers.host !== new URL(info.url).host || request.headers.origin && request.headers.origin !== info.url) return finish(403, { error: 'Invalid request origin.' });
      if (request.method !== 'GET' || request.headers['transfer-encoding'] || request.headers['content-length'] && request.headers['content-length'] !== '0') return finish(405, { error: 'Read-only service.' });
      const target = request.url;
      if (!target || target.length > 2048 || !/^\/[A-Za-z0-9_/?=&.-]*$/.test(target) || target.includes('..') || target.includes('//')) return finish(400, { error: 'Invalid route.' });
      const url = new URL(target, info.url);
      const asset = files.get(url.pathname);
      if (asset && !url.search) { response.writeHead(200, { 'Content-Type': asset.type + (asset.type.startsWith('text/') ? '; charset=utf-8' : '') }); response.end(asset.bytes); return; }
      if (!auth(request.headers.authorization)) return finish(401, { error: 'Local viewer authorization required.' });
      try {
        if (url.pathname === '/api/health') return finish(200, { instanceId, version: VERSION });
        if (url.pathname === '/api/sessions') return finish(200, store.history(root, Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('limit') || 50)));
        const match = /^\/api\/sessions\/([a-f0-9-]+)\/(snapshot|events)$/.exec(url.pathname);
        if (!match) return finish(404, { error: 'Unknown route.' });
        store.id(match[1]);
        let cursor = Number(url.searchParams.get('after') || request.headers['last-event-id'] || 0);
        if (match[2] === 'snapshot') return finish(200, store.page(root, match[1], cursor, Number(url.searchParams.get('limit') || 200)));
        const initial = store.page(root, match[1], cursor, 1);
        if (cursor > initial.total) return finish(400, { error: 'Cursor exceeds recorded events.' });
        if (clients.size >= 16) return finish(429, { error: 'Viewer connection limit reached.' });
        response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        response.write(': connected\n\n'); clients.add(response);
        let busy = false, blocked = false, slowDeadline, lastMeta = '', heartbeat = Date.now();
        const send = (kind, data, sequence) => {
          if (response.destroyed) return false;
          const accepted = response.write((sequence !== undefined ? 'id: ' + sequence + '\n' : '') + 'event: ' + kind + '\ndata: ' + JSON.stringify(data) + '\n\n');
          if (!accepted) {
            blocked = true;
            slowDeadline = setTimeout(() => response.destroy(), 5000);
            response.once('drain', () => { clearTimeout(slowDeadline); blocked = false; tick(); });
          }
          return true; // write(false) still accepted this frame into the bounded buffer.
        };
        const tick = () => {
          if (busy || blocked || response.destroyed) return; busy = true;
          try {
            const snapshot = store.page(root, match[1], cursor, 200);
            for (const event of snapshot.events) { if (!send('activity', event, event.sequence)) return; cursor = event.sequence; if (blocked) return; }
            const { events: ignored, ...metadata } = snapshot;
            const meta = JSON.stringify(metadata);
            if (meta !== lastMeta) { send('metadata', metadata); lastMeta = meta; }
            if (cursor < snapshot.total && !blocked) setImmediate(tick);
            if (Date.now() - heartbeat > 15000) { response.write(': heartbeat\n\n'); heartbeat = Date.now(); }
          } catch { send('unavailable', { error: 'Recording is unavailable; retained events were not modified.' }); response.end(); }
          finally { busy = false; }
        };
        const interval = setInterval(tick, 200); response.once('close', () => { clearInterval(interval); clearTimeout(slowDeadline); clients.delete(response); }); tick();
      } catch { finish(400, { error: 'Invalid or unavailable session metadata.' }); }
    });
    server.maxConnections = 64; server.requestTimeout = 15000; server.headersTimeout = 10000;
    server.on('tlsClientError', () => {});
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    info = { schemaVersion: 1, root, pid: process.pid, execution: background ? 'background' : 'embedded', instanceId, version: VERSION, url: 'https://127.0.0.1:' + server.address().port,
      token, certificate: tls.certificate.toString(), spki: tls.spki, createdAt: new Date().toISOString() };
    store.write(root, RUNTIME, info, fs.existsSync(store.safe(root, RUNTIME, 'file')));
    store.directory(root, store.CACHE + '/requests'); store.directory(root, store.CACHE + '/opened');
    let polling = false;
    timer = setInterval(async () => {
      if (polling || closing) return; polling = true;
      try {
        const stopFile = store.safe(root, store.CACHE + '/stop.json', 'file');
        if (fs.existsSync(stopFile) && store.read(root, store.CACHE + '/stop.json').instanceId === instanceId) { await close(); return; }
        const requests = fs.readdirSync(store.safe(root, store.CACHE + '/requests', 'dir')).filter(n => /^[a-f0-9-]+\.json$/.test(n)).slice(0, 50);
        for (const name of requests) {
          const relative = store.CACHE + '/requests/' + name, request = store.read(root, relative);
          if (request.instanceId !== instanceId) continue;
          store.session(root, request.sessionId);
          const marker = store.CACHE + '/opened/' + instanceId + '-' + request.sessionId + '.json';
          if (!fs.existsSync(store.safe(root, marker, 'file'))) {
            let status = 'disabled';
            const executable = openBrowser && store.settings(root).openBrowser ? browserExecutable(root) : null;
            if (openBrowser && store.settings(root).openBrowser) status = executable ? 'launching' : 'browser-unavailable';
            if (executable) {
              const profile = store.directory(root, store.CACHE + '/private/browser/' + instanceId);
              store.directory(root, store.CACHE + '/private/launch');
              const launchRelative = store.CACHE + '/private/launch/' + instanceId + '-' + request.sessionId + '.html';
              const destination = info.url + '/#session=' + request.sessionId + '&token=' + token;
              const bytes = Buffer.from('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=' + destination.replaceAll('&', '&amp;') + '"><title>Opening Hephaera</title>');
              const launch = store.safe(root, launchRelative, 'file');
              fs.writeFileSync(launch, bytes, { flag: 'wx', mode: 0o600 }); launchFiles.set(launchRelative, bytes);
              const child = cp.spawn(executable, ['--user-data-dir=' + profile, '--ignore-certificate-errors-spki-list=' + tls.spki,
                '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server',
                pathToFileURL(launch).href], { windowsHide: false, stdio: 'ignore' });
              browsers.add(child); child.once('error', () => {}); child.once('exit', () => browsers.delete(child));
              status = await new Promise(resolve => { child.once('spawn', () => resolve('launched-unverified')); child.once('error', () => resolve('browser-unavailable')); });
            }
            store.write(root, marker, { status });
          }
          fs.unlinkSync(store.safe(root, relative, 'file'));
        }
      } catch { /* Observation must not change project execution. */ }
      finally { polling = false; }
    }, 200);
    expiry = setTimeout(close, Math.min(23 * 3600000, Date.parse(tls.validUntil) - Date.now() - 60000));
    return { ...info, close };
  } catch (error) { await close(); throw error; }
}
module.exports = { VERSION, RUNTIME, runtime, probe, startServer, browserExecutable };
if (require.main === module) {
  const [mode, root, instanceId, rawPort, ...extra] = process.argv.slice(2);
  if (mode !== '--background-worker' || !root || !instanceId || extra.length) {
    console.error('Internal visualizer worker: use commands/session-visualizer.sh start. Startup detaches the service and returns; do not run or wait on this module in the foreground.');
    process.exitCode = 2;
  } else startServer({ root, instanceId, port: Number(rawPort || 0), background: true }).then(service => {
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => service.close());
  }).catch(error => {
    try {
      const reason = error.code === 'EADDRINUSE' ? 'port-unavailable' : error.code === 'HEPHAERA_PRIVACY_UNAVAILABLE' ? 'private-cache-unavailable' : /OpenSSL|TLS|certificate/i.test(error.message) ? 'tls-prerequisite-unavailable' : /EEXIST|ownership|maintenance|lease/i.test(error.message) ? 'service-ownership-unavailable' : 'service-startup-unavailable';
      store.write(store.rootPath(root), store.CACHE + '/failure-' + instanceId + '.json', { reason });
    } catch {}
    process.exitCode = 1;
  });
}
