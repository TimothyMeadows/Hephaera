import https from 'node:https';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { siteRoot, normalizeBase } from './build.mjs';
import localPreviewTls from '../../commands/lib/local-preview-tls.cjs';

export const previewLimits = Object.freeze({
  files: 256, fileBytes: 8 * 1024 * 1024, inventoryBytes: 128 * 1024,
  totalBytes: 32 * 1024 * 1024, responseBytes: 256 * 1024 * 1024,
  requests: 10_000, concurrency: 16, lifetimeMs: 30 * 60 * 1000,
});
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const publicName = /^(?:index\.html|404\.html|search-index\.json|assets\/(?:owl\.png|site\.(?:css|js)|guides\/[a-z0-9-]+\/[a-z0-9-]+\.(?:png|svg))|docs\/(?:[a-z][a-z0-9-]*\/)?index\.html)$/;
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;

function boundedLimits(overrides) {
  const limits = { ...previewLimits, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Object.hasOwn(previewLimits, name) || !Number.isSafeInteger(value) || value < 1 || value > previewLimits[name]) throw new Error(`Invalid preview limit: ${name}`);
  }
  return limits;
}

async function admitPath(file, directory = false) {
  if (file !== siteRoot.replace(/[\\/]$/, '') && !file.startsWith(siteRoot)) throw new Error('Preview path must stay inside website.');
  // realpath also detects redirected ancestors; inspect each website component
  // explicitly so neither symlinks nor Windows junctions are followed.
  let segment = siteRoot.replace(/[\\/]$/, '');
  for (const name of ['', ...path.relative(segment, file).split(path.sep)]) {
    segment = path.join(segment, name);
    const stat = await fs.lstat(segment, { bigint: true });
    if (stat.isSymbolicLink() || !samePath(await fs.realpath(segment), segment)) throw new Error('Preview paths must not contain links or aliases.');
    if (segment !== file && !stat.isDirectory()) throw new Error('Preview parent must be a directory.');
    if (segment === file && (directory ? !stat.isDirectory() : !stat.isFile())) throw new Error('Preview needs regular owned build files.');
    if (segment === file) return stat;
  }
  throw new Error('Preview build directory must not be a filesystem root.');
}

async function readAdmittedFile(root, name, maxBytes, expected) {
  const file = path.join(root, name);
  const before = await admitPath(file);
  if (before.size > BigInt(maxBytes) || expected && before.size !== BigInt(expected.size)) throw new Error('Preview file exceeds its bound or differs from its build inventory.');
  // Descriptor identity is checked before any content read. NOFOLLOW is additional
  // protection where supported; ancestor checks also reject Windows junctions.
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameFile(before, opened) || !sameFile(before, await admitPath(file))) throw new Error('Preview file changed during admission.');
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) throw new Error('Preview file changed during snapshot.');
      offset += read.bytesRead;
    }
    if (!sameFile(opened, await handle.stat({ bigint: true })) || !sameFile(opened, await admitPath(file))) throw new Error('Preview file changed during snapshot.');
    if (expected && createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error('Preview file hash differs from its build inventory.');
    return bytes;
  } finally {
    await handle.close();
  }
}

async function loadInventory(root, base, limits) {
  await admitPath(root, true);
  const source = await readAdmittedFile(root, '.preview-inventory.json', limits.inventoryBytes);
  const inventory = JSON.parse(source.toString('utf8'));
  if (inventory.schemaVersion !== 1 || inventory.base !== base || !Array.isArray(inventory.files) || inventory.files.length < 1 || inventory.files.length > limits.files) throw new Error('Build a matching bounded preview inventory first.');
  const names = new Set();
  let total = 0;
  // Validate the entire list and aggregate size before opening any listed file.
  for (const item of inventory.files) {
    if (!item || typeof item.name !== 'string' || !publicName.test(item.name) || names.has(item.name) || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > limits.fileBytes || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid public preview inventory entry.');
    names.add(item.name);
    total += item.size;
    if (total > limits.totalBytes) throw new Error('Preview inventory exceeds its aggregate byte limit.');
  }
  if (!names.has('index.html') || !names.has('404.html')) throw new Error('Preview inventory needs its home and error pages.');
  const files = new Map();
  for (const item of inventory.files) files.set(item.name, await readAdmittedFile(root, item.name, limits.fileBytes, item));
  return files;
}

function routePath(target) {
  // Use the raw origin-form target: URL normalization would hide encoded aliases
  // and dot segments. Build names need no percent encoding or platform separators.
  if (typeof target !== 'string' || target.length > 2048 || !target.startsWith('/') || target.startsWith('//') || /[\\%#\u0000-\u0020\u007f]/.test(target)) return null;
  const pathname = target.split('?')[0];
  if (!/^\/[A-Za-z0-9_./-]*$/.test(pathname) || pathname.includes('//') || pathname.split('/').some(part => part === '.' || part === '..')) return null;
  return pathname;
}

export async function startPreview({ root = path.join(siteRoot, 'dist'), basePath = process.env.SITE_BASE_PATH || '/Hephaera/', port = 4319, limits: overrides = {}, tls } = {}) {
  if (!Number.isInteger(port) || port !== 0 && (port < 1024 || port > 65535)) throw new Error('SITE_PORT must be an unprivileged port.');
  const base = normalizeBase(basePath);
  const limits = boundedLimits(overrides);
  const target = path.resolve(root);
  if (target !== path.join(siteRoot, 'dist') && !target.startsWith(`${path.join(siteRoot, '.test-output')}${path.sep}`)) throw new Error('Preview root must be website/dist or an owned website/.test-output child.');
  const files = await loadInventory(target, base, limits);
  const directories = new Set([...files.keys()].filter(name => name.endsWith('/index.html')).map(name => name.slice(0, -'index.html'.length)));
  const sockets = new Set();
  let requests = 0, active = 0, responseBytes = 0, closing = false, lifetime;
  let closePromise;
  let authority;
  const identity = localPreviewTls.createLocalTls({ projectRoot: path.resolve(siteRoot, '..'), cert: tls?.cert, key: tls?.key });
  const handleRequest = (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'close');
    const finish = (status, bytes = Buffer.alloc(0), contentType = 'text/plain; charset=utf-8', headers = {}) => {
      const length = bytes.length;
      if (request.method === 'HEAD') bytes = Buffer.alloc(0);
      if (responseBytes + bytes.length > limits.responseBytes) {
        response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': 0 }).end();
        void close(); return;
      }
      responseBytes += bytes.length;
      response.writeHead(status, { 'Content-Type': contentType, 'Content-Length': length, ...headers }).end(bytes);
    };
    if (closing || ++requests > limits.requests) { finish(503); void close(); return; }
    response.once('finish', () => { if (requests >= limits.requests) void close(); });
    if (active >= limits.concurrency) { finish(503); return; }
    active++;
    let completed = false;
    const done = () => {
      if (completed) return;
      completed = true; active--;
    };
    response.once('finish', done); response.once('close', done);
    if (request.headers.host !== authority || request.rawHeaders.filter((_, i) => i % 2 === 0 && request.rawHeaders[i].toLowerCase() === 'host').length !== 1) { finish(400); return; }
    if (request.headers.expect) { finish(417); return; }
    if (!['GET', 'HEAD'].includes(request.method)) { finish(405, Buffer.alloc(0), undefined, { Allow: 'GET, HEAD' }); return; }
    if (request.headers['transfer-encoding'] || request.headers['content-length'] && request.headers['content-length'] !== '0') { finish(400); return; }
    const pathname = routePath(request.url);
    const notFound = () => finish(404, files.get('404.html'), types['.html']);
    if (pathname === null) { notFound(); return; }
    if (pathname === '/' && base !== '/') { finish(302, undefined, undefined, { Location: base }); return; }
    if (!pathname.startsWith(base)) { notFound(); return; }
    const relative = pathname.slice(base.length);
    if (!relative.endsWith('/') && directories.has(`${relative}/`)) { finish(301, undefined, undefined, { Location: `${pathname}/` }); return; }
    const name = relative === '' || relative.endsWith('/') ? `${relative}index.html` : relative;
    const bytes = files.get(name);
    if (!bytes) { notFound(); return; }
    finish(200, bytes, types[path.posix.extname(name)]);
  };
  let server;
  try {
    server = https.createServer({ ...identity.serverOptions, maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000, connectionsCheckingInterval: 1000, handshakeTimeout: 5000 }, handleRequest);
  } catch (error) {
    identity.dispose(); files.clear(); throw error;
  }
  server.maxConnections = limits.concurrency;
  server.maxRequestsPerSocket = 1;
  server.keepAliveTimeout = 1;
  server.setTimeout(5000, socket => socket.destroy());
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  for (const event of ['checkContinue', 'checkExpectation']) server.on(event, (request, response) => server.emit('request', request, response));
  server.on('clientError', (_error, socket) => socket.destroy());
  function close() {
    if (closePromise) return closePromise;
    closing = true;
    clearTimeout(lifetime);
    closePromise = new Promise(resolve => {
      const grace = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 250);
      server.close(() => { clearTimeout(grace); for (const socket of sockets) socket.destroy(); files.clear(); identity.dispose(); resolve(); });
      server.closeIdleConnections();
    });
    return closePromise;
  }
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    authority = `127.0.0.1:${server.address().port}`;
    lifetime = setTimeout(() => { void close(); }, limits.lifetimeMs);
    return { url: `https://${authority}${base}`, certificate: identity.certificate, spki: identity.spki, close, closed: new Promise(resolve => server.once('close', resolve)) };
  } catch (error) {
    for (const socket of sockets) socket.destroy();
    files.clear(); identity.dispose();
    throw error;
  }
}

const help = `Usage: npm run preview -- [--cert CERT.pem --key KEY.pem]

Serve the bounded public build at https://127.0.0.1:4319/Hephaera/.
SITE_PORT and SITE_BASE_PATH select the port and build base path.
By default, an existing OpenSSL creates a fresh short-lived identity entirely
in memory. No certificate is installed in your trust store. Use the printed
SPKI pin with an isolated Chromium profile, or explicitly supply an existing
trusted certificate/key pair valid for 127.0.0.1. TLS 1.3 is required.
See website/README.md and docs/LOCAL_PREVIEW_TLS.md for exact client trust.
`;

async function readTlsFile(file, maxBytes) {
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) throw new Error('TLS inputs must be regular bounded PEM files (certificate: 64 KiB; key: 32 KiB).');
    const bytes = Buffer.alloc(stat.size);
    try {
      let offset = 0;
      while (offset < bytes.length) {
        const result = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!result.bytesRead) throw new Error('TLS input changed while reading.');
        offset += result.bytesRead;
      }
      return bytes;
    } catch (error) { bytes.fill(0); throw error; }
  } finally { await handle.close(); }
}

async function runPreview(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(help); return; }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    if (!['--cert', '--key'].includes(name) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(options, name)) throw new Error('Use --help, or provide --cert CERT.pem and --key KEY.pem together.');
    options[name] = args[i + 1];
  }
  if (Boolean(options['--cert']) !== Boolean(options['--key'])) throw new Error('--cert and --key must be supplied together.');
  let key;
  try {
    const tls = options['--cert'] ? { cert: await readTlsFile(options['--cert'], 64 * 1024), key: key = await readTlsFile(options['--key'], 32 * 1024) } : undefined;
    const preview = await startPreview({ port: Number(process.env.SITE_PORT || 4319), tls });
    console.log(`Hephaera preview: ${preview.url} (expires after 30 minutes)`);
    console.log(`Certificate SPKI SHA-256: ${preview.spki}`);
    console.log('Trust only this per-run pin in an isolated Chromium profile, or use your explicitly trusted certificate. See website/README.md.');
    const stop = () => { void preview.close(); };
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
    void preview.closed.then(() => { for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, stop); });
  } finally { key?.fill(0); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPreview(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
