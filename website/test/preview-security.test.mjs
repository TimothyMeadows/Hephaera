import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import localPreviewTls from '../../commands/lib/local-preview-tls.cjs';
import { startPreview, previewLimits } from '../scripts/serve.mjs';
import { buildSite, siteRoot } from '../scripts/build.mjs';

const fixtureFiles = {
  'index.html': '<!doctype html><h1>Owned preview</h1>',
  '404.html': '<!doctype html><h1>Page not found</h1>',
  'docs/index.html': '<!doctype html><h1>Guide</h1>',
  'assets/site.css': 'body { color: #123; }',
  'assets/site.js': 'const reviewed = true;',
  'search-index.json': '[{"title":"Guide"}]',
  'assets/owl.png': Buffer.from([137, 80, 78, 71]),
  'assets/guides/qa/drawing.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
};

async function fixture(t, base = '/Hephaera/') {
  const parent = path.join(siteRoot, '.test-output');
  await fs.mkdir(parent, { recursive: true });
  const folder = await fs.mkdtemp(path.join(parent, 'preview-'));
  const root = path.join(folder, 'build');
  t.after(async () => {
    assert.ok(folder.startsWith(`${parent}${path.sep}`));
    await fs.rm(folder, { recursive: true, force: true });
  });
  const files = [];
  for (const [name, content] of Object.entries(fixtureFiles)) {
    const bytes = Buffer.from(content);
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), bytes);
    files.push({ name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const inventory = { schemaVersion: 1, base, files };
  const writeInventory = () => fs.writeFile(path.join(root, '.preview-inventory.json'), JSON.stringify(inventory));
  await writeInventory();
  return { folder, root, inventory, writeInventory };
}

async function preview(t, options) {
  const running = await startPreview({ ...options, port: 0 });
  t.after(() => running.close());
  return running;
}

function request(preview, target, { method = 'GET', headers = {}, ca = preview.certificate, servername = '', maxVersion } = {}) {
  const url = new URL(preview.url);
  return new Promise((resolve, reject) => {
    // Keep certificate verification bound to the destination IP when exercising
    // wrong HTTP Host values; Node otherwise infers SNI from that header.
    const req = https.request({ hostname: url.hostname, port: url.port, path: target, method, headers, ca, servername, maxVersion, agent: false }, response => {
      const authorized = response.socket.authorized;
      const tlsVersion = response.socket.getProtocol();
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks), authorized, tlsVersion }));
    });
    req.setTimeout(1000, () => req.destroy(new Error('Fixture HTTPS request timed out.')));
    req.on('error', reject); req.end();
  });
}

test('preview requires TLS 1.3 and its exact peer identity, rejects plaintext and returns no key', async t => {
  const { root } = await fixture(t);
  const running = await preview(t, { root });
  const other = await preview(t, { root });
  assert.equal(new URL(running.url).protocol, 'https:');
  assert.ok(Buffer.isBuffer(running.certificate));
  assert.match(running.certificate.toString(), /^-----BEGIN CERTIFICATE-----/);
  assert.match(running.spki, /^[A-Za-z0-9+/]{43}=$/);
  assert.notEqual(running.spki, other.spki, 'Each default listener needs a new key.');
  assert.notDeepEqual(running.certificate, other.certificate);
  assert.deepEqual(Object.keys(running).sort(), ['certificate', 'close', 'closed', 'spki', 'url']);
  assert.doesNotMatch(JSON.stringify(running), /PRIVATE KEY/);
  const valid = await request(running, '/Hephaera/');
  assert.equal(valid.status, 200); assert.equal(valid.authorized, true); assert.equal(valid.tlsVersion, 'TLSv1.3');
  await assert.rejects(request(running, '/Hephaera/', { ca: [] }), /self.signed|certificate/i);
  await assert.rejects(request(running, '/Hephaera/', { ca: other.certificate }), /self.signed|certificate/i);
  await assert.rejects(request(running, '/Hephaera/', { servername: 'wrong.example' }), /altname|hostname|certificate/i);
  await assert.rejects(request(running, '/Hephaera/', { maxVersion: 'TLSv1.2' }), /protocol|unsupported|alert/i);
  const endpoint = new URL(running.url);
  await assert.rejects(new Promise((resolve, reject) => {
    const req = http.get({ hostname: endpoint.hostname, port: endpoint.port, path: '/Hephaera/', agent: false }, response => { response.resume(); resolve(response.statusCode); });
    req.setTimeout(1000, () => req.destroy(new Error('Plaintext fixture timed out.')));
    req.on('error', reject);
  }), /ECONNRESET|socket hang up/);
  assert.equal((await request(running, '/Hephaera/')).status, 200, 'Refused handshakes must not retire a valid listener.');
});

test('explicit certificate/key stays private and listener shutdown disposes its owned key', async t => {
  const { root } = await fixture(t);
  const originalCreate = localPreviewTls.createLocalTls;
  const source = originalCreate({ projectRoot: path.resolve(siteRoot, '..') });
  t.after(() => source.dispose());
  const suppliedKey = Buffer.from(source.serverOptions.key);
  t.after(() => suppliedKey.fill(0));
  const ownedKeys = [];
  localPreviewTls.createLocalTls = options => {
    const identity = originalCreate(options);
    ownedKeys.push(identity.serverOptions.key);
    return identity;
  };
  try {
    const running = await preview(t, { root, tls: { cert: source.certificate, key: suppliedKey } });
    assert.equal(running.spki, source.spki);
    assert.equal((await request(running, '/Hephaera/')).status, 200);
    assert.ok(ownedKeys[0].some(byte => byte !== 0));
    await running.close();
    assert.ok(ownedKeys[0].every(byte => byte === 0), 'Listener closure must erase its owned PEM.');
    assert.ok(suppliedKey.some(byte => byte !== 0), 'Caller-owned input must remain caller-owned.');
    const occupying = await preview(t, { root });
    const port = Number(new URL(occupying.url).port);
    await assert.rejects(startPreview({ root, port }), /EADDRINUSE/);
    assert.ok(ownedKeys.at(-1).every(byte => byte === 0), 'Listen failure must erase its owned PEM.');
    await assert.rejects(startPreview({ root, port: 0, tls: { cert: source.certificate } }), /certificate|key|together|pair/i);
  } finally { localPreviewTls.createLocalTls = originalCreate; }
});

test('preview CLI explains exact trust and refuses incomplete or oversized TLS inputs', async t => {
  const run = args => spawnSync(process.execPath, [path.join(siteRoot, 'scripts/serve.mjs'), ...args], { cwd: siteRoot, encoding: 'utf8', timeout: 5000, maxBuffer: 65536, windowsHide: true });
  const help = run(['--help']);
  assert.equal(help.status, 0); assert.match(help.stdout, /SPKI pin/); assert.match(help.stdout, /TLS 1\.3/);
  for (const args of [['--cert', 'unused.pem'], ['--key', 'unused.pem'], ['--cert', 'a', '--cert', 'b'], ['--http']]) {
    const refused = run(args);
    assert.equal(refused.status, 1); assert.doesNotMatch(refused.stdout, /Hephaera preview:/);
  }
  const { folder } = await fixture(t);
  const certFile = path.join(folder, 'inert-certificate.dat'), keyFile = path.join(folder, 'inert-key.dat');
  await fs.writeFile(certFile, 'inert fixture');
  await fs.writeFile(keyFile, Buffer.alloc(32 * 1024 + 1));
  const keyExcess = run(['--cert', certFile, '--key', keyFile]);
  assert.equal(keyExcess.status, 1); assert.match(keyExcess.stderr, /bounded PEM files/);
  await fs.writeFile(certFile, Buffer.alloc(64 * 1024 + 1));
  const certExcess = run(['--cert', certFile, '--key', keyFile]);
  assert.equal(certExcess.status, 1); assert.match(certExcess.stderr, /bounded PEM files/);
});

async function observeOpens(operation) {
  const opened = [];
  const active = new Set();
  const original = fs.open;
  fs.open = async (file, ...args) => {
    opened.push(path.resolve(file));
    const handle = await original(file, ...args);
    active.add(handle);
    const close = handle.close.bind(handle);
    handle.close = async () => { try { await close(); } finally { active.delete(handle); } };
    return handle;
  };
  try { await operation(opened); } finally {
    fs.open = original;
    const leaked = active.size;
    for (const handle of active) await handle.close();
    assert.equal(leaked, 0, 'Every admission descriptor must be closed.');
  }
}

test('preview preserves HTML, MIME, base paths, images, HEAD and predictable errors', async t => {
  for (const basePath of ['/Hephaera/', '/']) {
    const { root } = await fixture(t, basePath);
    const running = await preview(t, { root, basePath });
    for (const [name, type] of [['index.html', 'text/html'], ['assets/site.css', 'text/css'], ['assets/site.js', 'text/javascript'], ['search-index.json', 'application/json'], ['assets/owl.png', 'image/png'], ['assets/guides/qa/drawing.svg', 'image/svg+xml']]) {
      const result = await request(running, basePath + name);
      assert.equal(result.status, 200);
      assert.ok(result.headers['content-type'].startsWith(type));
      assert.equal(result.headers['x-content-type-options'], 'nosniff');
      assert.deepEqual(result.bytes, Buffer.from(fixtureFiles[name]));
    }
    assert.equal((await request(running, basePath)).status, 200);
    const head = await request(running, basePath, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(head.bytes.length, 0);
    assert.equal(Number(head.headers['content-length']), Buffer.byteLength(fixtureFiles['index.html']));
    assert.equal((await request(running, `${basePath}docs`)).headers.location, `${basePath}docs/`);
    assert.equal((await request(running, `${basePath}docs/`)).status, 200);
    assert.equal((await request(running, `${basePath}index.html?view=reviewed`)).status, 200);
    const absent = await request(running, `${basePath}absent`);
    assert.equal(absent.status, 404); assert.equal(absent.headers['x-content-type-options'], 'nosniff');
    assert.equal(absent.bytes.toString(), fixtureFiles['404.html']);
    if (basePath !== '/') assert.equal((await request(running, '/')).headers.location, basePath);
  }
});

test('request paths never open files; unlisted, private, outside and encoded aliases fail', async t => {
  const { root } = await fixture(t);
  await fs.writeFile(path.join(root, 'unlisted.json'), '{"fixture":"not-public"}');
  const running = await preview(t, { root });
  await observeOpens(async opened => {
    for (const target of ['/Hephaera/unlisted.json', '/Hephaera/.hephaera/.cache/fixture.json', '/Hephaera/.git/config', '/Hephaera/.preview-inventory.json', '/Hephaera/../outside.json', '/Hephaera/%2e%2e/outside.json', '/Hephaera/assets%2fsite.js', '/Hephaera/assets\\site.js', '/Hephaera//index.html', 'http://example.com/Hephaera/index.html', '//example.com/Hephaera/index.html']) {
      const result = await request(running, target);
      assert.equal(result.status, 404, target);
      assert.equal(result.bytes.toString(), fixtureFiles['404.html']);
    }
    assert.equal((await request(running, '/Hephaera/')).status, 200);
    assert.deepEqual(opened, []);
  });
});

test('wrong Host, unsupported methods and body/expectation requests are bounded refusals', async t => {
  const { root } = await fixture(t);
  const running = await preview(t, { root });
  for (const host of ['example.com', 'localhost', '127.0.0.1:1', new URL(running.url).host + '.example.com']) {
    assert.equal((await request(running, '/Hephaera/', { headers: { Host: host } })).status, 400);
  }
  const method = await request(running, '/Hephaera/', { method: 'POST' });
  assert.equal(method.status, 405); assert.equal(method.headers.allow, 'GET, HEAD');
  assert.equal((await request(running, '/Hephaera/', { headers: { 'Content-Length': '1' } })).status, 400);
  assert.equal((await request(running, '/Hephaera/', { headers: { Expect: '100-continue' } })).status, 417);
});

test('inventory rejects outside names and resource excess before opening listed files', async t => {
  const owned = await fixture(t);
  await observeOpens(async opened => {
    for (const name of ['../outside.json', '.hephaera/.cache/fixture.json', 'assets/../outside.json', 'assets/site.js:fixture', 'C:/owned/fixture.json']) {
      owned.inventory.files = [{ name, size: 0, sha256: '0'.repeat(64) }];
      await owned.writeInventory(); opened.length = 0;
      await assert.rejects(startPreview({ root: owned.root, port: 0 }), /inventory entry/);
      assert.deepEqual(opened, [path.join(owned.root, '.preview-inventory.json')]);
    }
  });
  const bounded = await fixture(t);
  await observeOpens(async opened => {
    for (const limits of [{ files: 1 }, { totalBytes: 1 }, { fileBytes: 1 }, { inventoryBytes: 1 }]) {
      opened.length = 0;
      await assert.rejects(startPreview({ root: bounded.root, port: 0, limits }), /bound|limit|inventory/i);
      assert.ok(opened.every(name => name === path.join(bounded.root, '.preview-inventory.json')));
    }
    opened.length = 0;
    await assert.rejects(startPreview({ root: bounded.folder, port: 0, limits: { lifetimeMs: Infinity } }), /limit/);
    await assert.rejects(startPreview({ root: path.join(siteRoot, 'assets'), port: 0 }), /Preview root/);
    assert.deepEqual(opened, []);
  });
});

test('linked files and junction directories are refused before opening their bytes', async t => {
  const owned = await fixture(t);
  const alias = path.join(owned.folder, 'build-alias');
  await fs.symlink(owned.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await observeOpens(async opened => {
    await assert.rejects(startPreview({ root: alias, port: 0 }), /links|aliases/);
    assert.deepEqual(opened, []);
  });
  const outside = path.join(owned.folder, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'site.js'), 'const outsideFixture = true;');
  await fs.rm(path.join(owned.root, 'assets'), { recursive: true });
  await fs.symlink(outside, path.join(owned.root, 'assets'), process.platform === 'win32' ? 'junction' : 'dir');
  await observeOpens(async opened => {
    await assert.rejects(startPreview({ root: owned.root, port: 0 }), /links|aliases/);
    assert.ok(!opened.some(file => file.includes(`${path.sep}assets${path.sep}`)));
  });
  const linked = await fixture(t);
  await fs.unlink(path.join(linked.root, 'index.html'));
  try {
    await fs.symlink(path.join(linked.root, '404.html'), path.join(linked.root, 'index.html'), 'file');
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') { t.diagnostic('Windows file symlinks unavailable; the actual directory-junction refusal passed.'); return; }
    throw error;
  }
  await observeOpens(async opened => {
    await assert.rejects(startPreview({ root: linked.root, port: 0 }), /links|aliases/);
    assert.ok(!opened.includes(path.join(linked.root, 'index.html')));
  });
});

test('inventory hashes fail closed and accepted bytes stay immutable after startup', async t => {
  const changed = await fixture(t);
  await fs.writeFile(path.join(changed.root, 'index.html'), 'x'.repeat(Buffer.byteLength(fixtureFiles['index.html'])));
  await observeOpens(async () => {
    await assert.rejects(startPreview({ root: changed.root, port: 0 }), /hash differs/);
  });
  const owned = await fixture(t);
  const running = await preview(t, { root: owned.root });
  await fs.writeFile(path.join(owned.root, 'index.html'), 'Replaced inert fixture');
  await fs.unlink(path.join(owned.root, '404.html'));
  assert.equal((await request(running, '/Hephaera/')).bytes.toString(), fixtureFiles['index.html']);
  assert.equal((await request(running, '/Hephaera/absent')).bytes.toString(), fixtureFiles['404.html']);
});

test('a file replaced between path admission and open is rejected before descriptor reads', async t => {
  const owned = await fixture(t);
  const file = path.join(owned.root, 'index.html');
  const original = fs.open;
  let descriptorReads = 0;
  fs.open = async (name, ...args) => {
    if (name === file) {
      if (constants.O_NONBLOCK) assert.equal(args[0] & constants.O_NONBLOCK, constants.O_NONBLOCK, 'admission must not block on a replaced POSIX FIFO');
      await fs.rename(file, path.join(owned.root, 'original-fixture.html'));
      await fs.writeFile(file, 'x'.repeat(Buffer.byteLength(fixtureFiles['index.html'])));
    }
    const handle = await original(name, ...args);
    if (name === file) {
      const read = handle.read.bind(handle);
      handle.read = (...args) => { descriptorReads++; return read(...args); };
    }
    return handle;
  };
  try {
    await assert.rejects(startPreview({ root: owned.root, port: 0 }), /changed during admission/);
    assert.equal(descriptorReads, 0);
  } finally { fs.open = original; }
});

test('finite request/byte/lifetime limits and cancellation release listener and idle sockets', async t => {
  const owned = await fixture(t);
  const requests = await preview(t, { root: owned.root, limits: { requests: 2 } });
  assert.equal((await request(requests, '/Hephaera/')).status, 200);
  assert.equal((await request(requests, '/Hephaera/')).status, 200);
  await requests.closed;
  await assert.rejects(request(requests, '/Hephaera/'), /ECONNREFUSED|ECONNRESET/);
  const bytes = await preview(t, { root: owned.root, limits: { responseBytes: 1 } });
  assert.equal((await request(bytes, '/Hephaera/')).status, 503);
  await bytes.closed;
  const lifetime = await preview(t, { root: owned.root, limits: { lifetimeMs: 30 } });
  await lifetime.closed;
  await assert.rejects(request(lifetime, '/Hephaera/'), /ECONNREFUSED|ECONNRESET/);
  const cancel = await preview(t, { root: owned.root, limits: { concurrency: 1 } });
  const endpoint = new URL(cancel.url);
  const socket = tls.connect({ host: endpoint.hostname, port: endpoint.port, ca: cancel.certificate });
  t.after(() => socket.destroy());
  socket.on('error', () => {});
  await once(socket, 'secureConnect');
  socket.write('GET /Hephaera/ HTTP/1.1\r\n');
  await assert.rejects(request(cancel, '/Hephaera/'), { code: 'ECONNRESET' });
  const socketClosed = once(socket, 'close');
  await cancel.close(); await socketClosed; await cancel.close();
  await assert.rejects(request(cancel, '/Hephaera/'), /ECONNREFUSED|ECONNRESET/);
  assert.equal(previewLimits.concurrency, 16);
});

test('the real generated public build inventory is accepted by preview', async t => {
  const parent = path.join(siteRoot, '.test-output');
  await fs.mkdir(parent, { recursive: true });
  const output = await fs.mkdtemp(path.join(parent, 'preview-build-'));
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  const built = await buildSite({ output });
  const running = await preview(t, { root: output });
  for (const name of ['', 'assets/site.css', 'assets/site.js', 'search-index.json', 'docs/', ...built.images]) assert.equal((await request(running, `/Hephaera/${name}`)).status, 200, name);
});
