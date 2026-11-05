'use strict';

// Local tooling only. No installation, global trust change or key file. The
// installed issuer writes a fresh private key and public certificate into one
// bounded anonymous stdout pipe; private PEM remains in owned process memory.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const fail = message => { throw new Error(message); };
const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
};

function issuer(projectRoot) {
  const candidates = [];
  const explicit = process.env.HEPHAERA_OPENSSL;
  if (explicit) candidates.push(explicit);
  if (!explicit && process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean))
      candidates.push(path.join(base, 'Git', 'usr', 'bin', 'openssl.exe'), path.join(base, 'Git', 'mingw64', 'bin', 'openssl.exe'));
  }
  for (const directory of (explicit ? [] : (process.env.PATH || '').split(path.delimiter))) {
    if (directory && path.isAbsolute(directory)) candidates.push(path.join(directory, process.platform === 'win32' ? 'openssl.exe' : 'openssl'));
  }
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate) || /[\x00-\x1f]/.test(candidate)) continue;
    let real;
    try {
      real = fs.realpathSync(candidate);
      if (inside(projectRoot, real) || !fs.statSync(real).isFile() || (process.platform === 'win32' && path.extname(real).toLowerCase() !== '.exe')) continue;
    } catch { continue; }
    return real;
  }
  fail('HTTPS preview needs installed OpenSSL outside the project, or an explicit certificate/key pair. No software was installed and HTTP is unavailable.');
}

function pemBlock(bytes, name) {
  const begin = Buffer.from(`-----BEGIN ${name}-----`), end = Buffer.from(`-----END ${name}-----`);
  const start = bytes.indexOf(begin), finish = bytes.indexOf(end, start);
  if (start < 0 || finish < start) fail('The local TLS issuer did not return a complete identity.');
  return Buffer.from(bytes.subarray(start, finish + end.length));
}

function validateIdentity(cert, key) {
  if (!Buffer.isBuffer(cert) || !Buffer.isBuffer(key) || cert.length > 65536 || key.length > 32768 || !cert.length || !key.length)
    fail('A local TLS identity requires bounded certificate and private-key buffers.');
  let x509, privateKey;
  try { x509 = new crypto.X509Certificate(cert); privateKey = crypto.createPrivateKey(key); }
  catch { fail('Invalid local TLS certificate or private key.'); }
  if (!x509.checkPrivateKey(privateKey) || x509.checkIP('127.0.0.1') !== '127.0.0.1' || x509.ca)
    fail('Local TLS certificate must match its key and the loopback IP, and must not be a CA.');
  const from = Date.parse(x509.validFrom), until = Date.parse(x509.validTo), now = Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(until) || from > now || until <= now) fail('Local TLS certificate is not currently valid.');
  const detail = privateKey.asymmetricKeyDetails || {};
  if (!(privateKey.asymmetricKeyType === 'ec' && ['prime256v1', 'secp384r1', 'secp521r1'].includes(detail.namedCurve))
      && !(privateKey.asymmetricKeyType === 'rsa' && detail.modulusLength >= 2048)) fail('Local TLS identity requires a supported strong signing key.');
  const spki = crypto.createHash('sha256').update(x509.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
  return { spki, certificateSha256: crypto.createHash('sha256').update(x509.raw).digest('hex'), validUntil: new Date(until).toISOString() };
}

function createLocalTls({ projectRoot, cert, key } = {}) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) fail('Local TLS requires the explicit project root.');
  const root = fs.realpathSync(projectRoot);
  if (!fs.statSync(root).isDirectory()) fail('Local TLS project root must be a directory.');
  if (Boolean(cert) !== Boolean(key)) fail('Supply both certificate and private key, or neither.');
  let certificate, privatePem, output;
  try {
    if (cert && key) {
      if (!Buffer.isBuffer(cert) || !Buffer.isBuffer(key) || cert.length > 65536 || key.length > 32768)
        fail('A supplied local TLS identity requires bounded certificate and private-key buffers.');
      // Copy caller buffers; disposal never overwrites caller-owned identity.
      certificate = Buffer.from(cert); privatePem = Buffer.from(key);
    } else {
      const executable = issuer(root);
      const result = cp.spawnSync(executable, ['req', '-new', '-x509', '-sha256', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
        '-nodes', '-keyout', '-', '-out', '-', '-days', '1', '-config', '-', '-subj', '/CN=127.0.0.1',
        '-addext', 'subjectAltName=IP:127.0.0.1', '-addext', 'basicConstraints=critical,CA:FALSE',
        '-addext', 'keyUsage=critical,digitalSignature', '-addext', 'extendedKeyUsage=serverAuth'],
      { input: Buffer.from('[req]\ndistinguished_name=dn\n[dn]\n'), windowsHide: true, shell: false, timeout: 15000, maxBuffer: 65536 });
      output = result.stdout;
      if (result.error || result.status !== 0 || !Buffer.isBuffer(output)) fail('Installed OpenSSL could not issue the local TLS identity. No private diagnostics were logged and no HTTP fallback was used.');
      certificate = pemBlock(output, 'CERTIFICATE');
      privatePem = pemBlock(output, 'PRIVATE KEY');
    }
    const metadata = validateIdentity(certificate, privatePem);
    let disposed = false;
    const identity = { ...metadata, minVersion: 'TLSv1.3', ephemeral: !cert,
      get certificate() { return Buffer.from(certificate); },
      dispose() { if (!disposed) { privatePem.fill(0); disposed = true; } },
      toJSON() { return { ...metadata, minVersion: 'TLSv1.3', ephemeral: !cert }; } };
    Object.defineProperty(identity, 'serverOptions', { value: { key: privatePem, cert: certificate, minVersion: 'TLSv1.3' }, enumerable: false });
    return Object.freeze(identity);
  } catch (error) {
    privatePem?.fill(0);
    throw error;
  } finally { if (Buffer.isBuffer(output)) output.fill(0); }
}

module.exports = { createLocalTls };
