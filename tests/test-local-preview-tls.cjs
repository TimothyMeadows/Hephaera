'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');
const cp = require('node:child_process');
const { test } = require('node:test');
const { createLocalTls } = require('../commands/lib/local-preview-tls.cjs');
const projectRoot = path.resolve(__dirname, '..');

function identity(t, options = {}) {
  const result = createLocalTls({ projectRoot, ...options });
  t.after(() => result.dispose());
  return result;
}
function get(server, { ca, plaintext = false, ...options } = {}) {
  return new Promise((resolve, reject) => {
    const req = (plaintext ? http : https).get({ hostname: '127.0.0.1', port: server.address().port, agent: false, ca, ...options }, response => {
      const parts = [];
      const protocol = response.socket.getProtocol?.();
      response.on('data', chunk => parts.push(chunk));
      response.on('end', () => resolve({ body: Buffer.concat(parts).toString(), protocol }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('owned TLS request deadline')));
    req.on('error', reject);
  });
}

test('fresh non-CA loopback identities have per-run signing keys and public-only metadata', t => {
  const first = identity(t), second = identity(t);
  assert.notEqual(first.spki, second.spki);
  const cert = new crypto.X509Certificate(first.certificate);
  assert.equal(cert.checkIP('127.0.0.1'), '127.0.0.1');
  assert.equal(cert.ca, false);
  assert.equal(cert.verify(cert.publicKey), true);
  assert.equal(cert.checkPrivateKey(crypto.createPrivateKey(first.serverOptions.key)), true);
  assert.ok(Date.parse(cert.validTo) - Date.now() <= 24 * 60 * 60 * 1000);
  assert.equal(first.serverOptions.minVersion, 'TLSv1.3');
  assert.equal(Object.keys(first).includes('serverOptions'), false);
  assert.equal(JSON.stringify(first).includes('PRIVATE KEY'), false);
  assert.equal(JSON.stringify(first).includes('"key"'), false);
});

test('real HTTPS validates the exact certificate and refuses unknown peer, plaintext and downgrade', async t => {
  const tls = identity(t), wrongPeer = identity(t);
  let requests = 0;
  const server = https.createServer(tls.serverOptions, (_request, response) => { requests++; response.end('owned verified bytes'); });
  server.on('tlsClientError', () => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  assert.deepEqual(await get(server, { ca: tls.certificate }), { body: 'owned verified bytes', protocol: 'TLSv1.3' });
  await assert.rejects(get(server), /self-signed|certificate/i);
  await assert.rejects(get(server, { ca: wrongPeer.certificate }), /self-signed|certificate/i);
  await assert.rejects(get(server, { plaintext: true }), /socket hang up|ECONNRESET/);
  await assert.rejects(get(server, { ca: tls.certificate, maxVersion: 'TLSv1.2' }), /protocol|SSL|TLS/i);
  assert.equal(requests, 1);
});

test('signing is bounded, shell-free and writes no key, certificate or configuration file', t => {
  const spawn = cp.spawnSync, write = fs.writeFileSync;
  let calls = 0;
  cp.spawnSync = (executable, args, options) => {
    calls++;
    assert.equal(path.isAbsolute(executable), true);
    assert.equal(args[args.indexOf('-keyout') + 1], '-');
    assert.equal(args[args.indexOf('-out') + 1], '-');
    assert.equal(args[args.indexOf('-config') + 1], '-');
    assert.equal(options.input.toString(), '[req]\ndistinguished_name=dn\n[dn]\n');
    assert.equal(args.some(arg => arg.includes('PRIVATE KEY')), false);
    assert.equal(options.shell, false);
    assert.equal(options.timeout, 15000);
    assert.equal(options.maxBuffer, 65536);
    return spawn(executable, args, options);
  };
  fs.writeFileSync = () => { throw new Error('TLS identity must not write a file'); };
  try { const result = createLocalTls({ projectRoot }); result.dispose(); }
  finally { cp.spawnSync = spawn; fs.writeFileSync = write; }
  assert.equal(calls, 1);
});

test('owned private PEM is cleared on disposal without changing caller-owned buffers', t => {
  const generated = identity(t);
  const callerKey = Buffer.from(generated.serverOptions.key), cert = generated.certificate;
  const supplied = createLocalTls({ projectRoot, key: callerKey, cert });
  const before = Buffer.from(callerKey);
  supplied.dispose(); supplied.dispose();
  assert.equal(supplied.serverOptions.key.every(byte => byte === 0), true);
  assert.deepEqual(callerKey, before);
  assert.equal(supplied.ephemeral, false);
  callerKey.fill(0); before.fill(0);
});

test('invalid identity, project and explicit issuer fail closed without fallback', t => {
  const tls = identity(t), other = identity(t);
  assert.throws(() => createLocalTls({ projectRoot: '.' }), /explicit project root/);
  assert.throws(() => createLocalTls({ projectRoot, cert: tls.certificate }), /both/);
  assert.throws(() => createLocalTls({ projectRoot, cert: tls.certificate, key: other.serverOptions.key }), /match its key/);
  assert.throws(() => createLocalTls({ projectRoot, cert: Buffer.from('not a certificate'), key: Buffer.from('not a key') }), /Invalid local TLS/);
  const saved = process.env.HEPHAERA_OPENSSL;
  process.env.HEPHAERA_OPENSSL = path.join(projectRoot, 'unavailable-openssl.exe');
  try { assert.throws(() => createLocalTls({ projectRoot }), /installed OpenSSL.*HTTP is unavailable/); }
  finally { if (saved === undefined) delete process.env.HEPHAERA_OPENSSL; else process.env.HEPHAERA_OPENSSL = saved; }
});

test('issuer failure is generic and clears private stdout without echoing diagnostics', () => {
  const original = cp.spawnSync;
  const output = Buffer.from('INERT PRIVATE OUTPUT NOT FOR DIAGNOSTICS');
  cp.spawnSync = () => ({ status: 1, stdout: output, stderr: Buffer.from('INERT PRIVATE DIAGNOSTIC') });
  try { assert.throws(() => createLocalTls({ projectRoot }), error => /could not issue/.test(error.message) && !/INERT/.test(error.message)); }
  finally { cp.spawnSync = original; }
  assert.equal(output.every(byte => byte === 0), true);
});
