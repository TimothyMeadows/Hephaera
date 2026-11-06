'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');
const { spawnSync } = require('node:child_process');
const tlsModule = require('../commands/lib/local-preview-tls.cjs');
const originalCreateLocalTls = tlsModule.createLocalTls;
const activeIdentities = new Set();
tlsModule.createLocalTls = (options) => {
  const identity = originalCreateLocalTls(options);
  activeIdentities.add(identity);
  return {
    serverOptions: identity.serverOptions, certificate: identity.certificate, spki: identity.spki,
    dispose() {
      identity.dispose();
      assert.ok(identity.serverOptions.key.every((byte) => byte === 0), 'server cleanup must zero its owned key buffer');
      activeIdentities.delete(identity);
    }
  };
};
const { startServer } = require('../commands/lib/code-character-evidence-cli.cjs');

const repository = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(__dirname, '.evidence-security-'));
const root = path.join(temporary, 'project');
const three = path.join(temporary, 'three');
const write = (base, relative, content) => {
  const target = path.join(base, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { flag: 'wx' });
  return target;
};
const request = (running, target, options = {}) => new Promise((resolve, reject) => {
  const parsed = new URL(running.origin);
  const req = https.request({ hostname: parsed.hostname, servername: '', port: parsed.port, path: target, method: options.method ?? 'GET', headers: { host: parsed.host, ...options.headers }, ca: options.ca ?? running.certificate, minVersion: 'TLSv1.3', agent: false }, (res) => {
    assert.equal(res.socket.authorized, true);
    assert.equal(res.socket.getProtocol(), 'TLSv1.3');
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
  });
  req.setTimeout(3000, () => req.destroy(new Error('fixture request timed out')));
  req.on('error', reject);
  req.end();
});

async function main() {
  write(root, 'evidence/adapter.mjs', "import { value } from './sibling.mjs'; export function createCodeCharacterEvidenceAdapter() { return value; }\n");
  write(root, 'evidence/sibling.mjs', "import data from './data.json' with { type: 'json' }; export const value = data.value;\n");
  write(root, 'evidence/data.json', '{"value":"inert-public-fixture"}\n');
  for (const privatePath of ['.hephaera/.cache/private.json', '.opencaw/.cache/private.json', '.git/private.json', 'unrelated.json', 'unlisted.mjs']) write(root, privatePath, '{"fixture":"inert-unlisted"}\n');
  write(three, 'build/three.module.js', "export { REVISION } from './three.core.js';\n");
  write(three, 'build/three.core.js', "export const REVISION = 'fixture';\n");
  write(three, 'build/unlisted.js', '// unlisted engine file\n');
  const adapter = { relative: 'evidence/adapter.mjs' };
  const modules = ['evidence/sibling.mjs', 'evidence/data.json'];

  console.log('[1/7] exact useful routes, relative JS/JSON and Three core closure, immutable bytes');
  let running = await startServer(root, three, adapter, { modules });
  try {
    assert.match(running.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
    const certificate = new crypto.X509Certificate(running.certificate);
    assert.equal(certificate.checkIP('127.0.0.1'), '127.0.0.1');
    assert.equal(running.spki, crypto.createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64'));
    assert.equal(running.server.address().address, '127.0.0.1');
    const page = await request(running, running.prefix);
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /^text\/html/);
    assert.match(page.text, /type="importmap"/);
    assert.ok(page.text.includes(`${running.prefix}three/build/three.module.js`));
    assert.equal((await request(running, `${running.prefix}index.html`)).status, 200);
    const adapterRoute = `${running.prefix}project/evidence/adapter.mjs`;
    const servedAdapter = await request(running, adapterRoute);
    assert.equal(servedAdapter.status, 200);
    const sibling = new URL('./sibling.mjs', `${running.origin}${adapterRoute}`).pathname;
    const data = new URL('./data.json', `${running.origin}${sibling}`).pathname;
    assert.equal((await request(running, sibling)).status, 200);
    const json = await request(running, data);
    assert.equal(json.status, 200);
    assert.match(json.headers['content-type'], /^application\/json/);
    assert.equal(JSON.parse(json.text).value, 'inert-public-fixture');
    assert.equal(json.headers['x-content-type-options'], 'nosniff');
    assert.equal(json.headers['referrer-policy'], 'no-referrer');
    assert.equal((await request(running, `${running.prefix}three/build/three.core.js`)).status, 200);
    fs.writeFileSync(path.join(root, adapter.relative), '// changed after admission\n');
    assert.equal((await request(running, adapterRoute)).text, servedAdapter.text);

    console.log('[2/7] private/unlisted/alias/capability/Host/method routes deny without filesystem access');
    const originalOpen = fs.openSync;
    fs.openSync = () => { throw new Error('request must not open any file'); };
    try {
      const denied = ['/', '/project/evidence/adapter.mjs', '/three/three.module.js', '/evidence-wrong/project/evidence/adapter.mjs', `${running.prefix}project/unrelated.json`, `${running.prefix}project/unlisted.mjs`, `${running.prefix}project/.hephaera/.cache/private.json`, `${running.prefix}project/.opencaw/.cache/private.json`, `${running.prefix}project/.git/private.json`, `${running.prefix}three/build/unlisted.js`, `${running.prefix}project/evidence/%61dapter.mjs`, `${running.prefix}project/evidence/%2e%2e/evidence/adapter.mjs`, `${running.prefix}project/evidence/../evidence/adapter.mjs`, `${adapterRoute}?alias=1`, `${adapterRoute}/`, `${running.prefix}project/%E0%A4%A`, `http://127.0.0.1${adapterRoute}`];
      for (const target of denied) assert.equal((await request(running, target)).status, 404, target);
      assert.equal((await request(running, adapterRoute)).status, 200);
      for (const host of ['localhost', 'example.invalid', `${new URL(running.origin).host}.example.invalid`]) assert.equal((await request(running, adapterRoute, { headers: { host } })).status, 403);
      for (const method of ['POST', 'PUT', 'HEAD', 'OPTIONS']) assert.equal((await request(running, adapterRoute, { method })).status, 405);
    } finally { fs.openSync = originalOpen; }
  } finally { await running.close(); }
  assert.equal(running.server.listening, false);
  assert.equal(activeIdentities.size, 0, 'normal close must dispose the TLS identity');
  await assert.rejects(request(running, running.prefix), /ECONNREFUSED|ECONNRESET/);

  console.log('[3/7] admission rejects private paths, lexical aliases, links and hardlinks');
  for (const relative of ['.hephaera/.cache/private.json', '.opencaw/.cache/private.json', '.git/private.json', 'evidence/../unrelated.json', 'evidence\\adapter.mjs', '/evidence/adapter.mjs', 'C:/evidence/adapter.mjs', 'evidence/adapter.mjs:alias', 'evidence/adapter.mjs.']) await assert.rejects(startServer(root, three, { relative }), /Private state|canonical/);
  await assert.rejects(startServer(root, three, adapter, { modules: ['.hephaera/.cache/private.json'] }), /Private state/);
  await assert.rejects(startServer(root, three, adapter, { modules: [adapter.relative] }), /duplicate/);
  fs.symlinkSync(path.join(root, 'evidence'), path.join(root, 'linked-directory'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(startServer(root, three, { relative: 'linked-directory/adapter.mjs' }), /non-link/);
  await assert.rejects(startServer(path.join(root, 'linked-directory'), three, { relative: 'adapter.mjs' }), /alias/);
  fs.linkSync(path.join(root, 'unrelated.json'), path.join(root, 'hardlink.json'));
  await assert.rejects(startServer(root, three, adapter, { modules: ['hardlink.json'] }), /owned regular/);
  try {
    fs.symlinkSync(path.join(root, 'unrelated.json'), path.join(root, 'linked-file.json'), 'file');
    await assert.rejects(startServer(root, three, adapter, { modules: ['linked-file.json'] }), /non-link/);
  } catch (error) {
    if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
    console.log('File symlink fixture unavailable under host permissions; directory junction and hardlink checks ran.');
  }
  const originalOpen = fs.openSync;
  fs.openSync = (filename, flags, ...args) => {
    if (filename === path.join(root, adapter.relative)) {
      if (fs.constants.O_NONBLOCK !== undefined) assert.ok(flags & fs.constants.O_NONBLOCK);
      throw Object.assign(new Error('inert admission race'), { code: 'EAGAIN' });
    }
    return originalOpen(filename, flags, ...args);
  };
  try { await assert.rejects(startServer(root, three, adapter), /inert admission race/); }
  finally { fs.openSync = originalOpen; }
  if (process.platform !== 'win32') {
    const worker = spawnSync(process.execPath, ['-e', `
      const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
      const {spawnSync}=require('node:child_process');
      const {startServer}=require(process.argv[3]);
      const root=process.argv[1],three=process.argv[2],racing=path.join(root,'racing.mjs'),fifo=path.join(root,'inert-fifo');
      fs.writeFileSync(racing,'// inert regular fixture\\n',{flag:'wx'});
      const made=spawnSync('mkfifo',[fifo],{timeout:1000});
      if(made.status!==0) throw new Error('Owned POSIX FIFO fixture creation failed.');
      const open=fs.openSync;
      fs.openSync=(file,...args)=>{if(file===racing)fs.renameSync(fifo,racing);return open(file,...args);};
      assert.rejects(startServer(root,three,{relative:'racing.mjs'}),/regular file/).then(()=>console.log('POSIX swapped FIFO rejected without blocking')).catch(error=>{console.error(error);process.exitCode=1;});
    `, root, three, path.join(repository, 'commands/lib/code-character-evidence-cli.cjs')], { encoding: 'utf8', timeout: 3000 });
    assert.ifError(worker.error);
    assert.equal(worker.status, 0, worker.stderr);
    console.log(worker.stdout.trim());
  } else {
    console.log('POSIX swapped-FIFO runtime check unavailable on Windows; inert open-race rejection ran.');
  }

  console.log('[4/7] finite files, per-file/aggregate bytes and requests');
  for (const limits of [{ files: 1 }, { fileBytes: 1 }, { totalBytes: 1 }]) await assert.rejects(startServer(root, three, adapter, { modules, limits }), /limit|bounded/);
  await assert.rejects(startServer(root, three, adapter, { limits: { lifetimeMs: Infinity } }), /Invalid/);
  running = await startServer(root, three, adapter, { limits: { requests: 2 } });
  try {
    assert.equal((await request(running, running.prefix)).status, 200);
    assert.equal((await request(running, running.prefix)).status, 200);
    assert.equal((await request(running, running.prefix)).status, 429);
  } finally { await running.close(); }

  console.log('[5/7] finite concurrency, owned socket cleanup, cancellation and lifetime');
  running = await startServer(root, three, adapter, { limits: { concurrent: 1, sockets: 2 } });
  let markHeld;
  const responseHeld = new Promise((resolve) => { markHeld = resolve; });
  // Hold a real response before end so host TCP buffer size cannot make this racy.
  running.server.prependListener('request', (req, res) => {
    if (req.url === `${running.prefix}project/${adapter.relative}`) {
      res.end = () => { markHeld(); return res; };
    }
  });
  const held = tls.connect({ port: Number(new URL(running.origin).port), host: '127.0.0.1', ca: running.certificate, minVersion: 'TLSv1.3' });
  try {
    await once(held, 'secureConnect');
    assert.equal(held.authorized, true);
    held.pause();
    held.write(`GET ${running.prefix}project/${adapter.relative} HTTP/1.1\r\nHost: ${new URL(running.origin).host}\r\n\r\n`);
    await responseHeld;
    assert.equal((await request(running, running.prefix)).status, 503);
    await running.close('fixture cancellation');
    assert.equal(await running.closed, 'fixture cancellation');
  } finally { held.destroy(); await running.close(); }
  const cancellation = new AbortController();
  running = await startServer(root, three, adapter, { signal: cancellation.signal });
  cancellation.abort();
  assert.equal(await running.closed, 'cancelled');
  assert.equal(running.server.listening, false);
  assert.equal(activeIdentities.size, 0, 'cancellation must dispose the TLS identity');
  running = await startServer(root, three, adapter, { limits: { sockets: 2 } });
  const idleSockets = [net.connect(new URL(running.origin).port, '127.0.0.1'), net.connect(new URL(running.origin).port, '127.0.0.1')];
  try {
    await Promise.all(idleSockets.map((socket) => once(socket, 'connect')));
    await assert.rejects(request(running, running.prefix), /ECONNRESET|socket hang up/);
    assert.equal(await new Promise((resolve, reject) => running.server.getConnections((error, count) => error ? reject(error) : resolve(count))), 2);
  } finally {
    await running.close();
    for (const socket of idleSockets) socket.destroy();
  }
  running = await startServer(root, three, adapter, { limits: { lifetimeMs: 25 } });
  assert.equal(await running.closed, 'lifetime limit reached');
  assert.equal(running.server.listening, false);
  assert.equal(activeIdentities.size, 0, 'lifetime expiry must dispose the TLS identity');
  const createServer = https.createServer;
  try {
    https.createServer = () => { throw new Error('inert TLS server construction failure'); };
    await assert.rejects(startServer(root, three, adapter), /inert TLS server construction failure/);
    assert.equal(activeIdentities.size, 0, 'construction failure must dispose the TLS identity');
    https.createServer = (...args) => {
      const server = createServer(...args);
      server.listen = () => { queueMicrotask(() => server.emit('error', new Error('inert TLS listen failure'))); return server; };
      return server;
    };
    await assert.rejects(startServer(root, three, adapter), /inert TLS listen failure/);
    assert.equal(activeIdentities.size, 0, 'listen failure must dispose the TLS identity');
  } finally { https.createServer = createServer; }

  console.log('[6/7] capabilities are fresh and cannot cross runs');
  const first = await startServer(root, three, adapter);
  const second = await startServer(root, three, adapter);
  try {
    assert.notEqual(first.prefix, second.prefix);
    assert.notEqual(first.spki, second.spki);
    assert.equal((await request(second, first.prefix)).status, 404);
    await assert.rejects(request(second, second.prefix, { ca: first.certificate }), /certificate|self-signed|signature/i);
    await assert.rejects(new Promise((resolve, reject) => {
      const req = http.get(`${second.origin.replace('https:', 'http:')}${second.prefix}`, resolve);
      req.setTimeout(3000, () => req.destroy(new Error('plaintext rejection timed out')));
      req.once('error', reject);
    }), /ECONNRESET|socket hang up/);
  } finally { await first.close(); await second.close(); }

  console.log('[7/7] installed locked Three.js browser modules are useful through exact routes');
  const actualThree = path.join(repository, 'tests/fixtures/threejs-quarks/node_modules/three');
  if (!fs.existsSync(path.join(actualThree, 'build/three.module.js'))) {
    console.log('Installed Three.js fixture unavailable; actual-engine route verification not run. No dependency installed.');
  } else {
    const metadata = JSON.parse(fs.readFileSync(path.join(actualThree, 'package.json'), 'utf8'));
    assert.equal(metadata.version, '0.182.0');
    running = await startServer(root, actualThree, adapter);
    try {
      const moduleRoute = `${running.prefix}three/build/three.module.js`;
      const served = await request(running, moduleRoute);
      assert.equal(served.status, 200);
      assert.equal(served.text, fs.readFileSync(path.join(actualThree, 'build/three.module.js'), 'utf8'));
      assert.match(served.text, /from ['"]\.\/three\.core\.js['"]/);
      const coreRoute = new URL('./three.core.js', `${running.origin}${moduleRoute}`).pathname;
      const core = await request(running, coreRoute);
      assert.equal(core.status, 200);
      assert.equal(core.text, fs.readFileSync(path.join(actualThree, 'build/three.core.js'), 'utf8'));
      console.log(`Verified installed Three.js ${metadata.version} module/core closure (${served.text.length + core.text.length} characters).`);
    } finally { await running.close(); }
  }
  console.log('Code-character evidence security tests passed.');
  assert.equal(activeIdentities.size, 0, 'all owned TLS identities must retire');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  tlsModule.createLocalTls = originalCreateLocalTls;
  assert.ok(path.dirname(temporary) === __dirname && path.basename(temporary).startsWith('.evidence-security-'));
  fs.rmSync(temporary, { recursive: true, force: true });
});
