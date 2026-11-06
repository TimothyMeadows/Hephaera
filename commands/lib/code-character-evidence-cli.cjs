'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('node:https');
const path = require('path');
const { createRequire } = require('module');
const { analyze, objectSha256 } = require('./code-character-evidence-analyzer.cjs');
const { contractHashes, profileMeasurementProjection, validateProfile } = require('./code-character-cli.cjs');
const { relativeInside, rootPath, sha256 } = require('./code-model-cli.cjs');
const { createLocalTls } = require('./local-preview-tls.cjs');

const VIEW_IDS = new Set(['front', 'rear', 'left', 'right', 'top', 'bottom', 'orbit-left', 'orbit-right', 'hero', 'runtime']);

function fail(message) {
  throw new Error(message);
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function parseOptions(values, repeatable = new Set()) {
  const options = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) {
      options._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (index + 1 >= values.length || values[index + 1].startsWith('--')) fail(`--${key} requires a value.`);
    const next = values[++index];
    if (repeatable.has(key)) (options[key] ??= []).push(next);
    else if (options[key] !== undefined) fail(`--${key} may be supplied only once.`);
    else options[key] = next;
  }
  return options;
}

function rejectUnknown(options, allowed) {
  for (const key of Object.keys(options)) if (key !== '_' && !allowed.has(key)) fail(`Unknown option: --${key}`);
}

function atomicWrite(file, value) {
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
  let installed = false;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, file);
    installed = true;
  } finally {
    if (!installed && fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function regularFile(root, value, label) {
  const located = relativeInside(root, value, label, true);
  const stat = fs.lstatSync(located.absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular non-symbolic-link file.`);
  return located;
}

function outputFile(root, value, label) {
  const located = relativeInside(root, value, label);
  fs.mkdirSync(path.dirname(located.absolute), { recursive: true });
  if (fs.existsSync(located.absolute)) fail(`${label} already exists: ${located.relative}`);
  if (!relativeInside(root, path.dirname(located.absolute), `${label} parent`, true)) fail(`${label} parent is unsafe.`);
  return located;
}

function reportContext(root, validated, captureMode, comparisonPath = null) {
  const source = regularFile(root, validated.linked.manifest.target.sourcePath, 'Linked code-model source');
  const hashes = contractHashes(validated.profile, validated.linked.manifest);
  const contracts = {
    profile: { path: validated.located.relative, sha256: hashes.profile, measurementSpecSha256: objectSha256(profileMeasurementProjection(validated.profile)) },
    manifest: { path: validated.linked.linked.relative, sha256: hashes.manifest },
    source: { path: source.relative, sha256: sha256(source.absolute) }
  };
  let comparison = null;
  if (comparisonPath) {
    const located = regularFile(root, comparisonPath, 'Comparison report');
    const previous = readJson(located.absolute, 'Comparison report');
    if (previous.schemaVersion !== 'hephaera-code-character-evidence/v1') fail('Comparison report has an unsupported schemaVersion.');
    if (previous.characterId !== validated.profile.characterId) fail('Comparison report belongs to a different character.');
    comparison = {
      report: { path: located.relative, sha256: sha256(located.absolute) },
      previousSourceSha256: previous.contracts?.source?.sha256 ?? null,
      changedSource: previous.contracts?.source?.sha256 !== contracts.source.sha256,
      previousOverallDecision: previous.overallDecision,
      previousGateDecisions: Object.fromEntries((previous.gateResults ?? []).map((gate) => [gate.id, gate.decision]))
    };
  }
  return { captureMode, contracts, comparison };
}

function analyzeOperation(root, values) {
  const options = parseOptions(values);
  rejectUnknown(options, new Set(['measurements', 'output', 'compare']));
  if (options._.length !== 1) fail('Analyze requires exactly one PROFILE.');
  if (!options.measurements || !options.output) fail('Analyze requires --measurements and --output.');
  const validated = validateProfile(root, null, 'strict', options._[0]);
  const measurement = regularFile(root, options.measurements, 'Measurement fixture');
  const output = outputFile(root, options.output, 'Evidence report output');
  const context = reportContext(root, validated, 'fixture', options.compare);
  context.contracts.measurements = { path: measurement.relative, sha256: sha256(measurement.absolute) };
  const report = analyze(validated.profile, validated.linked.manifest, readJson(measurement.absolute, 'Measurement fixture'), context);
  atomicWrite(output.absolute, report);
  process.stdout.write(`Analyzed untrusted calibration fixture: ${measurement.relative}\n`);
  process.stdout.write(`Evidence report: ${output.relative}\n`);
  process.stdout.write(`Machine result: ${report.overallDecision}\n`);
}

function locatePackage(root, packageName) {
  const hostRequire = createRequire(path.join(root, '__hephaera-evidence-host__.cjs'));
  let entry;
  try {
    entry = hostRequire.resolve(packageName);
  } catch {
    fail(`${packageName === 'three' ? 'Three.js' : 'Playwright'} is unavailable in the host project; install or approve it through the host architecture. Hephaera installed nothing.`);
  }
  let current = path.dirname(entry);
  while (current !== path.dirname(current)) {
    const packageFile = path.join(current, 'package.json');
    if (fs.existsSync(packageFile)) {
      const metadata = readJson(packageFile, `${packageName} package metadata`);
      if (metadata.name === packageName || (packageName === 'playwright' && metadata.name === 'playwright-core')) {
        return { root: current, entry, metadata, hostRequire };
      }
    }
    current = path.dirname(current);
  }
  fail(`Unable to locate the installed ${packageName} package root.`);
}

const SERVER_LIMITS = Object.freeze({ files: 256, fileBytes: 8 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, requests: 4096, concurrent: 16, sockets: 32, lifetimeMs: 120000 });
const RESPONSE_HEADERS = Object.freeze({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });

function immutableResponder(bytes, contentType) {
  // Admission owns this private snapshot. A request may select the responder,
  // but supplies no body, filename, MIME type or other response content.
  const body = Buffer.from(bytes);
  const headers = Object.freeze({ ...RESPONSE_HEADERS, 'content-type': contentType, 'content-length': body.length });
  return (response) => {
    response.writeHead(200, headers);
    response.end(body);
  };
}

function serverLimits(overrides = {}) {
  const limits = { ...SERVER_LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(limits, key) || !Number.isSafeInteger(value) || value < 1 || value > limits[key]) fail(`Invalid evidence server limit: ${key}`);
    limits[key] = value;
  }
  return limits;
}

function modulePath(value) {
  if (typeof value !== 'string' || value.length > 1024 || value.includes('\\') || value.includes(':')) fail('Evidence module requires a canonical project-relative path.');
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /[\x00-\x1f\x7f]/.test(segment) || /[. ]$/.test(segment))) fail('Evidence module requires a canonical project-relative path.');
  const lower = segments.map((segment) => segment.toLowerCase());
  if (lower.includes('.git') || lower.some((segment, index) => ['.hephaera', '.opencaw'].includes(segment) && lower[index + 1] === '.cache')) fail('Private state cannot be served as an evidence module.');
  if (!/\.(?:m?js|json)$/i.test(value)) fail('Evidence modules must be JavaScript or JSON.');
  return value;
}

function snapshotModule(base, relative, limits) {
  // Check every component, including junctions, before opening a declared file.
  // HTTPS requests never reach the filesystem; only this bounded admission does.
  const resolvedBase = path.resolve(base);
  const baseReal = fs.realpathSync(resolvedBase);
  if (path.relative(resolvedBase, baseReal) !== '' || fs.lstatSync(resolvedBase).isSymbolicLink()) fail('Evidence module root must not be a filesystem alias.');
  let current = resolvedBase;
  const segments = relative.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || path.relative(current, fs.realpathSync(current)) !== '' || (index < segments.length - 1 ? !stat.isDirectory() : !stat.isFile())) fail('Evidence modules must use regular files and non-link directories.');
  }
  const lexical = path.relative(resolvedBase, current);
  const real = path.relative(baseReal, fs.realpathSync(current));
  if (!lexical || lexical.startsWith('..') || path.isAbsolute(lexical) || lexical !== real) fail('Evidence module resolves outside its declared root.');
  const descriptor = fs.openSync(current, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1 || before.size > limits.fileBytes) fail('Evidence module exceeds the file limit or is not an owned regular file.');
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (!count) fail('Evidence module changed during admission.');
      offset += count;
    }
    const after = fs.fstatSync(descriptor);
    const installed = fs.lstatSync(current);
    if (before.dev !== installed.dev || before.ino !== installed.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || installed.isSymbolicLink() || path.relative(current, fs.realpathSync(current)) !== '') fail('Evidence module changed during admission.');
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function pageSource(adapterUrl, threeUrl = '/three/three.module.js') {
  const literal = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
  return `<!doctype html>
<meta charset="utf-8">
<title>Hephaera code-character evidence</title>
<style>html,body{margin:0;background:#111;color:#eee}#stage{position:relative;overflow:hidden;width:800px;height:800px}canvas{display:block}</style>
<div id="stage"></div>
<script type="importmap">${JSON.stringify({ imports: { three: threeUrl } }).replace(/</g, '\\u003c')}</script>
<script type="module">
import * as THREE from ${literal(threeUrl)};
import { createCodeCharacterEvidenceAdapter } from ${literal(adapterUrl)};
const stage = document.querySelector('#stage');
let adapter;
window.__hephaeraEvidence = {
  async start(config) {
    if (typeof createCodeCharacterEvidenceAdapter !== 'function') throw new Error('Adapter must export createCodeCharacterEvidenceAdapter.');
    adapter = await createCodeCharacterEvidenceAdapter({ THREE, stage, profile: config.profile, seed: config.seed });
    for (const method of ['capture','sampleStructure','sampleMotion','sampleRuntime','constructionHash','lifecycleCycle','dispose']) {
      if (typeof adapter?.[method] !== 'function') throw new Error('Adapter is missing required method: ' + method);
    }
    return true;
  },
  async capture(request) { await adapter.capture(request); if (!stage.querySelector('canvas')) throw new Error('Adapter capture must render a canvas below #stage.'); },
  async sample(config) {
    const structure = await adapter.sampleStructure(config);
    const motion = await adapter.sampleMotion(config);
    const sampled = await adapter.sampleRuntime(config);
    const constructionHashes = [];
    for (let run = 1; run <= config.constructionRuns; run += 1) constructionHashes.push(await adapter.constructionHash({ run, ...config }));
    const lifecycle = [];
    for (let cycle = 1; cycle <= config.lifecycleCycles; cycle += 1) lifecycle.push(await adapter.lifecycleCycle({ cycle, ...config }));
    return { structure, motion, runtime: { ...sampled, constructionHashes, lifecycle } };
  },
  async stop() { await adapter?.dispose(); adapter = null; }
};
</script>`;
}

async function startServer(root, threeRoot, adapter, options = {}) {
  const limits = serverLimits(options.limits);
  const prefix = `/evidence-${crypto.randomBytes(32).toString('hex')}/`;
  const routeFor = (kind, relative) => `${prefix}${kind}/${relative.split('/').map(encodeURIComponent).join('/')}`;
  const responders = new Map();
  const modules = [];
  let totalBytes = 0;
  const add = (kind, base, relative) => {
    modulePath(relative);
    const route = routeFor(kind, relative);
    if (responders.has(route)) fail('Evidence module inventory contains a duplicate.');
    if (modules.length >= limits.files) fail('Evidence module inventory exceeds the file count limit.');
    const bytes = snapshotModule(base, relative, limits);
    totalBytes += bytes.length;
    if (totalBytes > limits.totalBytes) fail('Evidence module inventory exceeds the aggregate byte limit.');
    responders.set(route, immutableResponder(bytes, /\.json$/i.test(relative) ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8'));
    modules.push(Object.freeze({ path: `${kind}/${relative}`, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }));
  };
  if (!Array.isArray(options.modules ?? []) || (options.modules?.length ?? 0) > limits.files) fail('Evidence modules must be a bounded explicit inventory.');
  add('project', root, adapter.relative);
  for (const relative of options.modules ?? []) add('project', root, relative);
  add('three', threeRoot, 'build/three.module.js');
  // Current Three.js splits its browser build into these two sibling modules.
  if (fs.existsSync(path.join(threeRoot, 'build', 'three.core.js'))) add('three', threeRoot, 'build/three.core.js');
  const adapterUrl = routeFor('project', adapter.relative);
  const html = Buffer.from(pageSource(adapterUrl, routeFor('three', 'build/three.module.js')));
  totalBytes += html.length;
  if (html.length > limits.fileBytes || totalBytes > limits.totalBytes) fail('Evidence page exceeds the byte limit.');
  const pageResponder = immutableResponder(html, 'text/html; charset=utf-8');
  responders.set(prefix, pageResponder);
  responders.set(`${prefix}index.html`, pageResponder);
  const tlsIdentity = createLocalTls({ projectRoot: root });
  const sockets = new Set();
  let host;
  let requests = 0;
  let active = 0;
  let closing = false;
  let stopReason = 'closed';
  let timer;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const close = async (reason = 'closed') => {
    if (closing) return closed;
    closing = true;
    stopReason = reason;
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    server.close(() => resolveClosed(reason));
    for (const socket of sockets) socket.destroy();
    return closed;
  };
  const onAbort = () => { void close('cancelled'); };
  const onRequest = (request, response) => {
    const send = (status, text, extra = {}) => {
      response.writeHead(status, { ...RESPONSE_HEADERS, 'content-type': 'text/plain; charset=utf-8', ...extra });
      response.end(text);
    };
    requests += 1;
    if (closing || requests > limits.requests) return send(429, 'Evidence request limit reached', { connection: 'close' });
    if (active >= limits.concurrent) return send(503, 'Evidence concurrency limit reached', { connection: 'close' });
    active += 1;
    let released = false;
    const release = () => { if (!released) { released = true; active -= 1; } };
    response.once('finish', release);
    response.once('close', release);
    try {
      const hosts = request.rawHeaders.filter((_, index) => index % 2 === 0 && request.rawHeaders[index].toLowerCase() === 'host');
      if (hosts.length !== 1 || request.headers.host !== host) return send(403, 'Host rejected');
      if (request.method !== 'GET') return send(405, 'Method rejected', { allow: 'GET' });
      // Match the original request target, never a URL-normalized alias.
      const target = request.url;
      if (typeof target !== 'string' || target.length > 2048 || !target.startsWith('/') || target.includes('?') || target.includes('#') || target.includes('\\')) return send(404, 'Not found');
      const respond = responders.get(target);
      if (!respond) return send(404, 'Not found');
      respond(response);
    } catch {
      if (!response.headersSent) send(400, 'Malformed request');
      else response.destroy();
    }
  };
  let server;
  try {
    server = https.createServer({ ...tlsIdentity.serverOptions, handshakeTimeout: 5000 }, onRequest);
  } catch (error) {
    tlsIdentity.dispose();
    throw error;
  }
  server.maxConnections = limits.sockets;
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 1000;
  server.setTimeout(5000, (socket) => socket.destroy());
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.once('close', () => { clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort); tlsIdentity.dispose(); resolveClosed(stopReason); });
  try {
    await new Promise((resolve, reject) => {
      const onError = (error) => { server.removeListener('listening', onListening); reject(error); };
      const onListening = () => { server.removeListener('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(0, '127.0.0.1');
    });
  } catch (error) {
    tlsIdentity.dispose();
    for (const socket of sockets) socket.destroy();
    if (server.listening) await close('listen failed');
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === 'string') { await close('listen failed'); fail('Evidence server did not receive an OS-assigned loopback port.'); }
  host = `127.0.0.1:${address.port}`;
  const origin = `https://${host}`;
  timer = setTimeout(() => { void close('lifetime limit reached'); }, limits.lifetimeMs);
  timer.unref();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) await close('cancelled');
  return { server, origin, url: `${origin}${prefix}`, prefix, close, closed, modules: Object.freeze(modules), limits: { ...limits }, certificate: tlsIdentity.certificate, spki: tlsIdentity.spki };
}

function artifactName(key) {
  return `${key.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()}.png`;
}

async function captureOperation(root, values, engineEvidence) {
  const options = parseOptions(values, new Set(['view', 'module']));
  rejectUnknown(options, new Set(['adapter', 'module', 'output-dir', 'view', 'compare', 'viewport-width', 'viewport-height', 'pixel-ratio']));
  if (options._.length !== 1) fail('Capture requires exactly one PROFILE.');
  if (!options.adapter || !options['output-dir']) fail('Capture requires --adapter and --output-dir.');
  const validated = validateProfile(root, null, 'strict', options._[0]);
  const adapter = regularFile(root, options.adapter, 'Browser evidence adapter');
  if (!/\.m?js$/i.test(adapter.relative)) fail('Browser evidence adapter must be a JavaScript ESM file.');
  for (const module of options.module ?? []) {
    modulePath(module);
    require('./engine-contract.cjs').requireEngine(root, 'THREEJS', { ...(engineEvidence ? { evidence: engineEvidence } : {}), output: module });
  }
  const requestedViews = options.view ?? validated.profile.silhouette.requiredViews;
  for (const view of requestedViews) if (!VIEW_IDS.has(view) || view === 'runtime') fail(`Unsupported capture view: ${view}`);
  for (const view of validated.profile.silhouette.requiredViews) if (!requestedViews.includes(view)) fail(`Capture cannot omit required view: ${view}`);
  const width = Number(options['viewport-width'] ?? 800);
  const height = Number(options['viewport-height'] ?? 800);
  const pixelRatio = Number(options['pixel-ratio'] ?? 1);
  if (!Number.isInteger(width) || width < 64 || width > 4096 || !Number.isInteger(height) || height < 64 || height > 4096) fail('Viewport dimensions must be integers from 64 to 4096.');
  if (!Number.isFinite(pixelRatio) || pixelRatio < 0.5 || pixelRatio > 4) fail('Pixel ratio must be from 0.5 to 4.');

  const inputIdentities = new Map();
  const rememberInput = (value, label, expectedObject, suppliedBytes) => {
    const located = regularFile(root, value, label);
    const bytes = suppliedBytes ?? fs.readFileSync(located.absolute);
    if (expectedObject && objectSha256(JSON.parse(bytes.toString('utf8'))) !== objectSha256(expectedObject)) fail(`Evidence input changed before capture: ${label}.`);
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (inputIdentities.has(located.relative) && inputIdentities.get(located.relative) !== digest) fail(`Evidence input changed before capture: ${label}.`);
    inputIdentities.set(located.relative, digest);
  };
  rememberInput(validated.located.relative, 'Character profile', validated.profile);
  rememberInput(validated.linked.linked.relative, 'Linked manifest', validated.linked.manifest);
  rememberInput(validated.linked.manifest.target.sourcePath, 'Linked source');
  const moduleLimits = serverLimits();
  for (const relative of [adapter.relative, ...options.module ?? []]) rememberInput(relative, 'Browser evidence module', null, snapshotModule(root, relative, moduleLimits));
  if (options.compare) rememberInput(options.compare, 'Comparison report');
  if (engineEvidence) rememberInput(engineEvidence, 'Engine override evidence');
  const engineIdentity = () => require('./engine-contract.cjs').requireEngine(root, 'THREEJS', { ...(engineEvidence ? { evidence: engineEvidence } : {}), output: adapter.relative });
  const initialEngineIdentity = objectSha256(engineIdentity());
  const reportAnalysisContext = reportContext(root, validated, 'browser', options.compare);
  const verifyInputs = () => {
    for (const [relative, digest] of inputIdentities) {
      const current = regularFile(root, relative, 'Evidence input');
      if (sha256(current.absolute) !== digest) fail(`Evidence input changed during capture: ${relative}.`);
    }
    if (objectSha256(engineIdentity()) !== initialEngineIdentity) fail('Evidence engine identity changed during capture.');
  };
  verifyInputs();
  if (reportAnalysisContext.contracts.source.sha256 !== inputIdentities.get(reportAnalysisContext.contracts.source.path) || (options.compare && reportAnalysisContext.comparison.report.sha256 !== inputIdentities.get(reportAnalysisContext.comparison.report.path))) fail('Evidence context changed before capture.');

  const output = relativeInside(root, options['output-dir'], 'Evidence output directory');
  if (fs.existsSync(output.absolute)) fail(`Evidence output directory already exists: ${output.relative}`);
  fs.mkdirSync(path.dirname(output.absolute), { recursive: true });
  const realOutputParent = fs.realpathSync(path.dirname(output.absolute));
  const outputParentRelative = path.relative(root, realOutputParent);
  if (outputParentRelative.startsWith('..') || path.isAbsolute(outputParentRelative)) fail('Evidence output parent resolves outside the project root.');
  const lock = `${output.absolute}.lock`;
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code === 'EEXIST') fail(`Evidence output is locked by another capture: ${output.relative}`);
    throw error;
  }

  let running;
  let browser;
  let captureTask;
  let stopping = false;
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  let completed = false;
  try {
    const threePackage = locatePackage(root, 'three');
    const threeModule = path.join(threePackage.root, 'build', 'three.module.js');
    if (!fs.existsSync(threeModule)) fail('Installed Three.js does not expose build/three.module.js required by the browser harness.');
    const playwrightPackage = locatePackage(root, 'playwright');
    const playwright = playwrightPackage.hostRequire(playwrightPackage.entry);
    if (!playwright?.chromium?.launch) fail('Installed Playwright package does not expose Chromium.');
    running = await startServer(root, threePackage.root, adapter, { modules: options.module, signal: cancellation.signal });
    const verifyServedModules = () => {
      for (const module of running.modules) {
        const projectModule = module.path.startsWith('project/');
        const relative = module.path.slice(projectModule ? 'project/'.length : 'three/'.length);
        if (projectModule && inputIdentities.get(relative) !== module.sha256) fail(`Evidence admitted module changed before capture: ${relative}.`);
        const current = snapshotModule(projectModule ? root : threePackage.root, relative, running.limits);
        if (crypto.createHash('sha256').update(current).digest('hex') !== module.sha256) fail(`Evidence served module changed during capture: ${relative}.`);
      }
    };
    verifyInputs();
    verifyServedModules();
    options.origin = running.origin;
    captureTask = (async () => {
      try {
        // Playwright launches into its own fresh temporary user-data directory.
        // Chromium's trust exception is limited to this run's exact public key.
        browser = await playwright.chromium.launch({ headless: true, chromiumSandbox: true, timeout: 30000, args: [`--ignore-certificate-errors-spki-list=${running.spki}`] });
        if (stopping || cancellation.signal.aborted) {
          await browser.close();
          fail('Evidence capture was cancelled.');
        }
      } catch (error) {
        fail(`Playwright Chromium browser is unavailable or failed its sandboxed launch: ${error.message}. Hephaera installed nothing and did not disable the sandbox.`);
      }
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: pixelRatio, serviceWorkers: 'block' });
      const page = await context.newPage();
      const externalRequests = [];
      await page.route('**/*', async (route) => {
        const target = new URL(route.request().url());
        if (target.origin !== options.origin) {
          externalRequests.push(target.href);
          await route.abort('blockedbyclient');
        } else await route.continue();
      });
      await page.goto(running.url, { waitUntil: 'networkidle', timeout: 30000 });
      const seed = validated.linked.manifest.runtime.deterministicSeed;
      await page.evaluate(async ({ profile, seed: deterministicSeed }) => window.__hephaeraEvidence.start({ profile, seed: deterministicSeed }), { profile: validated.profile, seed });
      fs.mkdirSync(output.absolute);
      const stage = page.locator('#stage');
      const captured = [];
      const captureOne = async (request, key) => {
        await page.evaluate((value) => window.__hephaeraEvidence.capture(value), request);
        const filename = artifactName(key);
        const absolute = path.join(output.absolute, filename);
        await stage.screenshot({ path: absolute, animations: 'disabled' });
        captured.push({ key, path: `${output.relative}/${filename}`, sha256: sha256(absolute) });
      };
      for (const view of requestedViews) {
        for (const pixelHeight of validated.profile.intent.presentation.pixelHeights) {
          await captureOne({ view, pixelHeight, kind: 'whole' }, `${view}:${pixelHeight}:whole`);
          await captureOne({ view, pixelHeight, kind: 'semantic-mask' }, `${view}:${pixelHeight}:semantic-mask`);
          for (const partId of validated.profile.intent.signatureParts) {
            await captureOne({ view, pixelHeight, kind: 'isolated', partId }, `${view}:${pixelHeight}:isolated:${partId}`);
          }
        }
      }
      await captureOne({ view: 'runtime', pixelHeight: 'runtime', kind: 'whole' }, 'runtime:runtime:whole');
      const structureThresholds = validated.profile.gates.find((gate) => gate.id === 'structure-integrity').claim.thresholds;
      const interactionThresholds = validated.profile.gates.find((gate) => gate.id === 'interaction-runtime').claim.thresholds;
      const optimizationThresholds = validated.profile.gates.find((gate) => gate.id === 'optimization-budget').claim.thresholds;
      const sampleConfig = {
        actorCount: validated.profile.budgets.representativeActors,
        constructionRuns: optimizationThresholds.constructionRuns,
        lifecycleCycles: Math.max(interactionThresholds.lifecycleCycles, optimizationThresholds.lifecycleCycles),
        groundingToleranceRatio: structureThresholds.groundingToleranceRatio,
        contactToleranceRatio: interactionThresholds.contactToleranceRatio
      };
      const sampled = await page.evaluate((config) => window.__hephaeraEvidence.sample(config), sampleConfig);
      await page.evaluate(() => window.__hephaeraEvidence.stop());
      verifyInputs();
      verifyServedModules();
      const observation = {
        schemaVersion: 'hephaera-code-character-observation/v1',
        capture: { seed, viewport: { width, height, pixelRatio }, views: captured, externalRequests, serviceWorkers: 'blocked' },
        structure: sampled.structure,
        motion: sampled.motion,
        runtime: sampled.runtime
      };
      const observationPath = path.join(output.absolute, 'observation.json');
      atomicWrite(observationPath, observation);
      reportAnalysisContext.contracts.adapter = { path: adapter.relative, sha256: running.modules.find((item) => item.path === `project/${adapter.relative}`).sha256 };
      reportAnalysisContext.contracts.captureConfiguration = {
        sha256: objectSha256({ seed, viewport: { width, height, pixelRatio }, requestedViews, pixelHeights: validated.profile.intent.presentation.pixelHeights, signatureParts: validated.profile.intent.signatureParts, sampleConfig })
      };
      const report = analyze(validated.profile, validated.linked.manifest, observation, reportAnalysisContext);
      report.browserSecurity = { origin: options.origin, osAssignedPort: true, chromiumSandbox: true, tls: { minimumVersion: 'TLSv1.3', certificateSpkiSha256: running.spki, trust: 'exact-run-spki' }, serviceWorkers: 'blocked', externalRequests, admittedModules: running.modules, serverLimits: running.limits };
      const reportPath = path.join(output.absolute, 'report.json');
      atomicWrite(reportPath, report);
      completed = true;
      process.stdout.write(`Captured sandboxed browser evidence: ${output.relative}\n`);
      process.stdout.write(`Machine result: ${report.overallDecision}\n`);
    })();
    await Promise.race([captureTask, running.closed.then((reason) => { fail(`Evidence capture stopped: ${reason}.`); })]);
  } finally {
    stopping = true;
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    cancellation.abort();
    if (browser) await browser.close().catch(() => {});
    if (running) await running.close();
    if (captureTask) await captureTask.catch(() => {});
    if (!completed && fs.existsSync(output.absolute)) fs.rmSync(output.absolute, { recursive: true, force: true });
    if (fs.existsSync(lock)) fs.rmdirSync(lock);
  }
}

async function main() {
  let [operation, rootArg, ...values] = process.argv.slice(2);
  if (!operation || !rootArg) fail('Internal invocation requires an operation and project root.');
  const root = rootPath(rootArg);
  const engineEvidenceAt = values.indexOf('--engine-evidence');
  const engineEvidence = engineEvidenceAt < 0 ? null : values[engineEvidenceAt + 1];
  if (['capture', 'analyze'].includes(operation)) values = require('./engine-contract.cjs').codeProduction(root, 'evidence', operation, values);
  if (operation === 'analyze') return analyzeOperation(root, values);
  if (operation === 'capture') return captureOperation(root, values, engineEvidence);
  fail(`Unknown code-character evidence operation: ${operation}`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { locatePackage, pageSource, startServer };
