'use strict';
// Public mirrors use admitted upstream bytes; they never rebuild or retag them.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { input, verifyPayload, npmDistTag } = require('./publish.cjs');
const { digest } = require('../core/files.cjs');
const NPM = 'https://registry.npmjs.org';
const NUGET = 'https://api.nuget.org/v3/index.json';
const SIGNATURES = 'https://api.nuget.org/v3-index/repository-signatures/5.0.0/index.json';
const SDK = '10.0.400';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sri = bytes => 'sha512-' + crypto.createHash('sha512').update(bytes).digest('base64');
const fail = message => { throw new Error(message); };
const now = () => new Date().toISOString();

function selectedChannels(value = ['npm', 'nuget']) {
  if (!Array.isArray(value) || !value.length || value.some(x => !['npm', 'nuget'].includes(x)) || new Set(value).size !== value.length) fail('Select distinct public registry channels.');
  return ['npm', 'nuget'].filter(x => value.includes(x));
}
function candidate(directory, { expectedManifest, channels } = {}) {
  if (!expectedManifest) fail('An explicit admitted release manifest is required.');
  const selected = selectedChannels(channels), data = input(directory);
  verifyPayload(data.receipt, data.files, expectedManifest);
  const original = zipEntries(fs.readFileSync(data.files.nuget));
  if ([...original.entries.keys()].some(x => x.toLowerCase() === '.signature.p7s')) fail('Public NuGet input must remain unsigned.');
  const tag = npmDistTag(data.receipt.version);
  const identity = { version: data.receipt.version, revision: data.receipt.manifest.revision, manifestSha256: data.receipt.manifestSha256,
    originals: Object.fromEntries(['npm', 'nuget'].map(x => [x, data.receipt.artifacts[x].sha256])) };
  return { ...data, selected, tag, identity, expectedNpm: sri(fs.readFileSync(data.files.npm)) };
}
function regular(file) { if (fs.existsSync(file) && (fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile())) fail('Unsafe public publication state path.'); }
function loadJournal(ctx) {
  const file = path.join(ctx.directory, 'public-publication.json'); regular(file);
  if (!fs.existsSync(file)) return { schemaVersion: 1, identity: ctx.identity, channels: {}, history: [] };
  const old = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (old.schemaVersion !== 1 || digest(old.identity) !== digest(ctx.identity) || !old.channels || Array.isArray(old.channels) || Object.keys(old.channels).some(x => !['npm', 'nuget'].includes(x)) || !Array.isArray(old.history) || old.history.some((x, i) => x.sequence !== i + 1)) fail('Public publication journal identity/history differs; retain it.');
  for (const event of old.history) {
    const declared = event.channel === undefined ? event.selectedChannels : [event.channel];
    if (!Array.isArray(declared) || !declared.length || declared.some(channel => !['npm', 'nuget'].includes(channel) || !Object.hasOwn(old.channels, channel))) fail('Public publication history has a missing or unknown channel; retain it.');
  }
  for (const [channel, state] of Object.entries(old.channels)) if (!state || !['not-inspected', 'absent', 'confirmed', 'pending', 'uncertain', 'write-intent'].includes(state.status) || !Number.isSafeInteger(state.attempts) || state.attempts < 0 || (['not-inspected', 'absent'].includes(state.status) && state.attempts !== 0) || (['pending', 'uncertain', 'write-intent'].includes(state.status) && state.attempts === 0) || state.attempts !== old.history.filter(x => x.event === 'write-intent' && x.channel === channel).length || state.originalSha256 !== ctx.identity.originals[channel]) fail('Public publication channel history is malformed; retain it.');
  return old;
}
function writeJournal(ctx, journal, event) {
  journal.history.push({ sequence: journal.history.length + 1, at: now(), ...event });
  const file = path.join(ctx.directory, 'public-publication.json'); regular(file);
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(journal, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temporary, file);
}
function fixedUrl(value, origin, pathname) {
  const u = new URL(value);
  if (u.origin !== origin || u.username || u.password || u.search || u.hash || u.pathname !== pathname) fail('Unexpected public registry resource.');
  return u.href;
}
async function responseBytes(response, limit) {
  if (Number(response.headers?.get('content-length') || 0) > limit) fail('Public registry response exceeds its bound.');
  let bytes;
  if (response.body?.getReader) {
    const reader = response.body.getReader(), pieces = []; let size = 0;
    try { for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > limit) fail('Public registry response exceeds its bound.'); pieces.push(Buffer.from(item.value)); } }
    finally { reader.releaseLock(); }
    bytes = Buffer.concat(pieces);
  } else bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limit) fail('Public registry response exceeds its bound.');
  return bytes;
}
async function get(url, limit = 64 * 1024 * 1024) {
  let response;
  try { response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) }); }
  catch { fail('Public registry readback unavailable.'); }
  if (response.status === 404) return null;
  if (!response.ok) fail('Public registry readback unavailable.');
  return responseBytes(response, limit);
}
async function json(url) {
  const bytes = await get(url, 2 * 1024 * 1024);
  if (!bytes) fail('Public registry service metadata unavailable.');
  try { return JSON.parse(bytes); } catch { fail('Invalid public registry service metadata.'); }
}

// Bound metadata and decompression before admitting any untrusted ZIP content.
function zipEntries(bytes) {
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10) || bytes.readUInt16LE(end + 10) === 65535) fail('Unsupported NuGet ZIP envelope.');
  let cursor = bytes.readUInt32LE(end + 16);
  if (cursor + bytes.readUInt32LE(end + 12) !== end) fail('Invalid NuGet ZIP directory.');
  const count = bytes.readUInt16LE(end + 10), lower = new Set(), regions = [], metadata = new Map(); let total = 0;
  if (count > 20000) fail('NuGet ZIP entry count exceeds its bound.');
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) fail('Invalid NuGet ZIP directory.');
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24), nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32), local = bytes.readUInt32LE(cursor + 42), attrs = bytes.readUInt32LE(cursor + 38);
    total += size; if (total > 67108864 || ![0, 8].includes(method)) fail('NuGet ZIP payload exceeds its supported bounds.');
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength), name = nameBytes.toString('utf8'), mode = (attrs >>> 16) & 0o170000;
    if (cursor + 46 + nameLength + extra + comment > end || !Buffer.from(name).equals(nameBytes) || !name || name.includes('\\') || name.includes(':') || name.includes('\0') || name.split('/').some(x => !x || x === '.' || x === '..') || lower.has(name.toLowerCase()) || flags & 1 || (mode && mode !== 0o100000) || attrs & 16) fail('Unsafe NuGet ZIP entry metadata.');
    lower.add(name.toLowerCase());
    if (local + 30 > bytes.readUInt32LE(end + 16) || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 26) !== nameLength || !bytes.subarray(local + 30, local + 30 + nameLength).equals(nameBytes)) fail('NuGet ZIP local/central identity differs.');
    const start = local + 30 + nameLength + bytes.readUInt16LE(local + 28); let finish = start + compressed;
    const crc = bytes.readUInt32LE(cursor + 16);
    if (flags & 8) {
      let descriptor = finish;
      if (descriptor + 4 <= bytes.readUInt32LE(end + 16) && bytes.readUInt32LE(descriptor) === 0x08074b50) descriptor += 4;
      if (descriptor + 12 > bytes.readUInt32LE(end + 16) || bytes.readUInt32LE(descriptor) !== crc || bytes.readUInt32LE(descriptor + 4) !== compressed || bytes.readUInt32LE(descriptor + 8) !== size) fail('NuGet ZIP data descriptor differs.');
      finish = descriptor + 12;
    } else if (bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== size) fail('NuGet ZIP local/central integrity differs.');
    if (finish > bytes.readUInt32LE(end + 16) || regions.some(([a, b]) => local < b && finish > a)) fail('Overlapping NuGet ZIP entries.');
    regions.push([local, finish]); metadata.set(name, { method, flags, start, compressed, size, crc }); cursor += 46 + nameLength + extra + comment;
  }
  if (cursor !== end) fail('NuGet ZIP directory inventory differs.');
  let previous = 0;
  for (const [start, finish] of regions.sort(([a], [b]) => a - b)) { if (start !== previous) fail('Unreferenced NuGet ZIP data.'); previous = finish; }
  if (previous !== bytes.readUInt32LE(end + 16)) fail('Unreferenced NuGet ZIP data.');
  const entries = new Map();
  for (const [name, item] of metadata) {
    const body = bytes.subarray(item.start, item.start + item.compressed);
    let output; try { output = item.method === 0 ? body : zlib.inflateRawSync(body, { maxOutputLength: Math.max(1, item.size) }); } catch { fail('NuGet ZIP entry integrity differs.'); }
    if (output.length !== item.size || zlib.crc32(output) !== item.crc) fail('NuGet ZIP entry integrity differs.');
    entries.set(name, output);
  }
  return { entries, metadata };
}
function equivalentNuget(original, served) {
  const a = zipEntries(original), b = zipEntries(served);
  if ([...a.entries.keys()].some(x => x.toLowerCase() === '.signature.p7s')) fail('Public NuGet input must remain unsigned.');
  const signature = b.entries.get('.signature.p7s'), info = b.metadata.get('.signature.p7s');
  if (!signature?.length || !info || info.method !== 0 || info.flags & 8 || b.entries.size !== a.entries.size + 1) fail('NuGet repository signature envelope differs.');
  for (const [name, bytes] of a.entries) if (!b.entries.has(name) || !bytes.equals(b.entries.get(name))) fail('Public NuGet payload differs from the approved unsigned input.');
  return { payloadEquivalent: true, entries: a.entries.size, originalSha256: hash(original), servedSha256: hash(served) };
}
function workDirectory(root, label) {
  const parent = path.join(root, '.public-registry');
  if (fs.existsSync(parent) && (fs.lstatSync(parent).isSymbolicLink() || !fs.statSync(parent).isDirectory())) fail('Unsafe public registry workspace.');
  fs.mkdirSync(parent, { recursive: true });
  const work = path.join(parent, label + '-' + crypto.randomUUID()); fs.mkdirSync(work);
  return work;
}
function baseEnvironment(work) {
  const env = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'DOTNET_ROOT', 'DOTNET_ROOT(x86)', 'DOTNET_ROOT_X64', 'ALLUSERSPROFILE', 'PUBLIC']) if (process.env[name]) env[name] = process.env[name];
  for (const name of ['tmp', 'dotnet-home', 'packages', 'http-cache', 'plugins-cache']) fs.mkdirSync(path.join(work, name));
  return { ...env, TEMP: path.join(work, 'tmp'), TMP: path.join(work, 'tmp'), DOTNET_CLI_HOME: path.join(work, 'dotnet-home'), DOTNET_CLI_UI_LANGUAGE: 'en', DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', NUGET_PACKAGES: path.join(work, 'packages'), NUGET_HTTP_CACHE_PATH: path.join(work, 'http-cache'), NUGET_PLUGINS_CACHE_PATH: path.join(work, 'plugins-cache'), NUGET_CERT_REVOCATION_MODE: 'online', DOTNET_NUGET_SIGNATURE_VERIFICATION: 'true' };
}
function command(file, args, work, env, diagnostics) {
  const result = cp.spawnSync(file, args, { cwd: work, env, encoding: 'utf8', windowsHide: true, timeout: 240000, maxBuffer: 2097152 });
  if (diagnostics) fs.writeFileSync(diagnostics, (result.stdout || '') + '\n' + (result.stderr || '') + '\nProcess exit: ' + result.status + '\n', { flag: 'wx' });
  if (result.error || result.status !== 0) fail('Public registry process failed; retain reconciliation state.');
  return (result.stdout || '') + '\n' + (result.stderr || '');
}
function sdk(work, env) {
  fs.writeFileSync(path.join(work, 'global.json'), JSON.stringify({ sdk: { version: SDK, rollForward: 'disable', allowPrerelease: false } }), { flag: 'wx' });
  if (command('dotnet', ['--version'], work, env).trim() !== SDK) fail('The pinned public NuGet SDK is unavailable.');
}
async function nugetTrust(services) {
  const resource = services.resources?.find(x => x['@type'] === 'RepositorySignatures/5.0.0')?.['@id'];
  fixedUrl(resource, 'https://api.nuget.org', '/v3-index/repository-signatures/5.0.0/index.json');
  const trust = await json(SIGNATURES);
  if (trust.allRepositorySigned !== true || !Array.isArray(trust.signingCertificates) || !trust.signingCertificates.length || trust.signingCertificates.length > 8) fail('NuGet.org repository certificate policy is unavailable.');
  const fingerprints = [];
  for (const entry of trust.signingCertificates) {
    const pin = entry.fingerprints?.['2.16.840.1.101.3.4.2.1'];
    if (typeof pin !== 'string' || !/^[a-f0-9]{64}$/i.test(pin)) fail('Invalid NuGet.org repository certificate.');
    const url = fixedUrl(entry.contentUrl, 'https://api.nuget.org', '/v3-index/repository-signatures/certificates/' + pin.toLowerCase() + '.crt');
    const bytes = await get(url, 1048576); if (!bytes) fail('NuGet.org repository certificate unavailable.');
    let certificate; try { certificate = new crypto.X509Certificate(bytes); } catch { fail('Invalid NuGet.org repository certificate.'); }
    if (certificate.fingerprint256.replaceAll(':', '').toLowerCase() !== pin.toLowerCase()) fail('NuGet.org repository certificate fingerprint differs.');
    fingerprints.push(pin.toLowerCase());
  }
  return { repository: NUGET, owner: 'TimothyMeadows', fingerprints: [...new Set(fingerprints)] };
}
function verifyNugetRepository(file, trust, root) {
  if (trust.repository !== NUGET || trust.owner !== 'TimothyMeadows' || !Array.isArray(trust.fingerprints) || !trust.fingerprints.length || trust.fingerprints.some(x => !/^[a-f0-9]{64}$/i.test(x))) fail('Invalid NuGet.org verification policy.');
  const work = workDirectory(root, 'verify'), env = baseEnvironment(work); sdk(work, env);
  const config = path.join(work, 'NuGet.Config');
  fs.writeFileSync(config, '<configuration><config><add key="signatureValidationMode" value="require" /></config><packageSources><clear /></packageSources><trustedSigners><clear /><repository name="nuget.org" serviceIndex="' + NUGET + '">' + trust.fingerprints.map(pin => '<certificate fingerprint="' + pin + '" hashAlgorithm="SHA256" allowUntrustedRoot="false" />').join('') + '<owners>TimothyMeadows</owners></repository></trustedSigners></configuration>', { flag: 'wx' });
  const diagnostics = path.join(work, 'verification.log');
  const output = command('dotnet', ['nuget', 'verify', file, '--all', '--configfile', config, ...trust.fingerprints.flatMap(x => ['--certificate-fingerprint', x]), '--verbosity', 'detailed', '--force-english-output'], work, env, diagnostics);
  const failed = /\bNU\d{4}\b|Package signature validation failed|\b[1-9]\d* (?:errors|warnings)\b|^\s*(?:error|warning)\s*:/im.test(output);
  const matched = trust.fingerprints.filter(pin => output.replaceAll(':', '').toLowerCase().includes(pin));
  if (failed || !/Successfully verified package ['"].+['"]\./.test(output) || !/Signature type:\s*Repository/i.test(output) || !matched.length) fail('NuGet.org repository signature verification did not complete successfully.');
  return { verified: true, repository: NUGET, owner: 'TimothyMeadows', sdk: SDK, certificateFingerprints: matched, successMarker: true, repositorySignature: true, diagnosticsClean: true, diagnosticsFile: diagnostics, diagnosticsSha256: hash(fs.readFileSync(diagnostics)) };
}

function npmTool() {
  if (process.version !== 'v24.15.0') fail('The pinned public npm runtime is unavailable.');
  const roots = [path.join(path.dirname(process.execPath), 'node_modules/npm'), path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm')];
  const root = roots.find(x => fs.existsSync(path.join(x, 'package.json')));
  if (!root || JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version !== '11.12.1') fail('The pinned public npm CLI is unavailable.');
  return path.join(root, 'bin/npm-cli.js');
}
function npmAuth(mode) {
  if (mode === 'bootstrap') { if (!process.env.NPM_BOOTSTRAP_TOKEN) fail('Public npm bootstrap credentials are unavailable.'); return; }
  if (mode !== 'trusted') fail('Select public npm trusted or bootstrap authentication.');
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || !process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) fail('Public npm trusted publishing identity is unavailable.');
  const u = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.actions.githubusercontent.com') || u.username || u.password) fail('Unexpected public npm identity provider.');
}
function defaultAdapter(ctx, mode) {
  let services, certificates;
  const index = async () => services || (services = await json(NUGET));
  const trustPolicy = async () => certificates || (certificates = await nugetTrust(await index()));
  const adapter = {
    async lookup(channel) {
      if (channel === 'npm') {
        const bytes = await get(NPM + '/@timothymeadows%2Fhephaera/' + ctx.receipt.version, 2097152); if (!bytes) return null;
        let metadata; try { metadata = JSON.parse(bytes); } catch { fail('Invalid public npm readback.'); }
        if (metadata.name !== '@timothymeadows/hephaera' || metadata.version !== ctx.receipt.version || metadata.dist?.integrity !== ctx.expectedNpm) fail('Public npm version collides with the admitted package.');
        const url = fixedUrl(metadata.dist.tarball, NPM, '/@timothymeadows/hephaera/-/hephaera-' + ctx.receipt.version + '.tgz');
        const served = await get(url); if (!served || sri(served) !== ctx.expectedNpm || hash(served) !== ctx.identity.originals.npm) fail('Public npm tarball differs from the admitted package.');
        return { integrity: ctx.expectedNpm, originalSha256: hash(served), servedSha256: hash(served) };
      }
      const resource = (await index()).resources?.find(x => x['@type'] === 'PackageBaseAddress/3.0.0')?.['@id'];
      const base = new URL(resource); if (!base.pathname.endsWith('/')) base.pathname += '/';
      fixedUrl(base.href, 'https://api.nuget.org', '/v3-flatcontainer/');
      const version = ctx.receipt.version.toLowerCase(), url = base.href + 'hephaera/' + version + '/hephaera.' + version + '.nupkg';
      const served = await get(url); if (!served) return null;
      const equivalence = equivalentNuget(fs.readFileSync(ctx.files.nuget), served), trust = await trustPolicy();
      const work = workDirectory(ctx.directory, 'download'), file = path.join(work, 'Hephaera.' + version + '.nupkg'); fs.writeFileSync(file, served, { flag: 'wx' });
      const verification = await adapter.verifyNuget(file, trust, ctx.directory);
      if (verification?.verified !== true || verification.repository !== NUGET) fail('NuGet.org signature verification is unavailable.');
      return { ...equivalence, verification };
    },
    verifyNuget: verifyNugetRepository,
    async auth(channel) {
      if (channel === 'npm') { npmTool(); npmAuth(mode); }
      else { if (!process.env.NUGET_API_KEY) fail('Public NuGet credentials are unavailable.'); await trustPolicy(); const work = workDirectory(ctx.directory, 'sdk'); sdk(work, baseEnvironment(work)); }
      return true;
    },
    async upload(channel, file) {
      const work = workDirectory(ctx.directory, channel), env = baseEnvironment(work), config = path.join(work, channel === 'npm' ? 'user.npmrc' : 'NuGet.Config');
      if (channel === 'npm') {
        npmAuth(mode); const tool = npmTool();
        fs.mkdirSync(path.join(work, 'npm-cache')); const global = path.join(work, 'global.npmrc'); fs.writeFileSync(global, '', { flag: 'wx' });
        fs.writeFileSync(config, 'registry=' + NPM + '/\n@timothymeadows:registry=' + NPM + '/\n' + (mode === 'bootstrap' ? '//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n' : ''), { flag: 'wx' });
        Object.assign(env, { NPM_CONFIG_USERCONFIG: config, NPM_CONFIG_GLOBALCONFIG: global, NPM_CONFIG_CACHE: path.join(work, 'npm-cache'), NPM_CONFIG_UPDATE_NOTIFIER: 'false' });
        if (mode === 'bootstrap') env.NODE_AUTH_TOKEN = process.env.NPM_BOOTSTRAP_TOKEN;
        else for (const name of ['GITHUB_ACTIONS', 'RUNNER_ENVIRONMENT', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_REPOSITORY_ID', 'GITHUB_REPOSITORY_OWNER_ID', 'GITHUB_WORKFLOW_REF', 'GITHUB_WORKFLOW_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'GITHUB_SERVER_URL', 'GITHUB_API_URL']) if (process.env[name]) env[name] = process.env[name];
        command(process.execPath, [tool, 'publish', file, '--registry=' + NPM, '--access', 'public', '--tag', ctx.tag, '--ignore-scripts', '--userconfig', config, '--globalconfig', global, '--cache', env.NPM_CONFIG_CACHE, '--logs-max=0', '--update-notifier=false'], work, env);
      } else {
        sdk(work, env); if (!process.env.NUGET_API_KEY) fail('Public NuGet credentials are unavailable.'); env.NUGET_API_KEY = process.env.NUGET_API_KEY;
        fs.writeFileSync(config, '<configuration><packageSources><clear /><add key="nuget.org" value="' + NUGET + '" /></packageSources></configuration>', { flag: 'wx' });
        command('dotnet', ['nuget', 'push', file, '--source', NUGET, '--configfile', config, '--no-symbols', '--timeout', '180'], work, env);
      }
      return { accepted: true };
    },
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms))
  };
  return adapter;
}
function observation(ctx, channel, value) {
  if (value === null) return null;
  if (!value || value.originalSha256 !== ctx.identity.originals[channel] || !/^[a-f0-9]{64}$/.test(value.servedSha256 || '')) fail('Public registry version collides with the admitted package.');
  if (channel === 'npm' && (value.integrity !== ctx.expectedNpm || value.servedSha256 !== ctx.identity.originals.npm)) fail('Public npm version collides with the admitted package.');
  if (channel === 'nuget' && (value.payloadEquivalent !== true || value.verification?.verified !== true || value.verification.repository !== NUGET)) fail('Public NuGet signature/content verification is incomplete.');
  return value;
}
function plan(ctx, journal, status) {
  const channels = {};
  for (const channel of ['npm', 'nuget']) channels[channel] = { ...journal.channels[channel], selected: ctx.selected.includes(channel), status: journal.channels[channel]?.status || (ctx.selected.includes(channel) ? 'not-inspected' : 'not-selected'), originalSha256: ctx.identity.originals[channel] };
  return { schemaVersion: 1, version: ctx.receipt.version, revision: ctx.receipt.manifest.revision, manifestSha256: ctx.identity.manifestSha256, selectedChannels: ctx.selected, status, channels, needUploads: [], blockedChannels: [], selectedComplete: ctx.selected.every(x => channels[x].status === 'confirmed'), bothPublicReady: ['npm', 'nuget'].every(x => channels[x].status === 'confirmed'), readinessEvidence: 'current-selected-and-retained-journal' };
}
async function reconcile(ctx, journal, adapter) {
  const result = plan(ctx, journal, 'inspected');
  for (const channel of ctx.selected) {
    let value; try { value = observation(ctx, channel, await adapter.lookup(channel, ctx)); } catch { fail('Public ' + channel + ' readback failed or differs; no upload is permitted.'); }
    const old = journal.channels[channel];
    if (value) result.channels[channel] = { ...result.channels[channel], ...value, status: 'confirmed', lastVerifiedAt: now(), observed: 'present' };
    else if (old && ['write-intent', 'pending', 'uncertain', 'confirmed'].includes(old.status)) { result.channels[channel] = { ...result.channels[channel], status: old.status === 'confirmed' ? 'uncertain' : old.status, observed: 'absent' }; result.blockedChannels.push(channel); }
    else { result.channels[channel] = { ...result.channels[channel], status: 'absent', observed: 'absent' }; result.needUploads.push(channel); }
  }
  result.selectedComplete = ctx.selected.every(x => result.channels[x].status === 'confirmed'); result.bothPublicReady = ['npm', 'nuget'].every(x => result.channels[x].status === 'confirmed');
  if (result.blockedChannels.length) result.status = 'needs-reconciliation';
  return result;
}
async function inspectPublic(directory, options = {}) {
  const ctx = candidate(directory, options), journal = loadJournal(ctx), adapter = Object.assign(defaultAdapter(ctx, options.npmAuthMode), options.io || {});
  return reconcile(ctx, journal, adapter);
}
async function publishPublic(directory, options = {}) {
  const ctx = candidate(directory, options);
  if (!options.execute) return { ...plan(ctx, loadJournal(ctx), 'dry-run'), requiresInspection: true };
  const lock = path.join(ctx.directory, 'public-publication.lock'), marker = crypto.randomUUID();
  let handle; try { handle = fs.openSync(lock, 'wx'); fs.writeFileSync(handle, marker); } catch { fail('Public publication is already owned; reconcile its lock before retry.'); }
  try {
    const journal = loadJournal(ctx);
    for (const channel of ctx.selected) if (!journal.channels[channel]) journal.channels[channel] = { status: 'not-inspected', attempts: 0, originalSha256: ctx.identity.originals[channel] };
    writeJournal(ctx, journal, { event: 'started', selectedChannels: ctx.selected });
    const adapter = Object.assign(defaultAdapter(ctx, options.npmAuthMode), options.io || {}), result = await reconcile(ctx, journal, adapter);
    if (result.blockedChannels.length) return result;
    // All selected reads and all missing selected auth checks precede any upload.
    for (const channel of result.needUploads) if (await adapter.auth(channel, ctx) !== true) fail('Selected public registry authentication is unavailable.');
    for (const channel of ctx.selected) journal.channels[channel] = { ...result.channels[channel], attempts: journal.channels[channel]?.attempts || 0 };
    writeJournal(ctx, journal, { event: 'reconciled', selectedChannels: ctx.selected });
    for (const channel of result.needUploads) {
      const state = journal.channels[channel]; state.status = 'write-intent'; state.attempts++;
      writeJournal(ctx, journal, { event: 'write-intent', channel, attempt: state.attempts });
      try {
        if ((await adapter.upload(channel, ctx.files[channel], ctx))?.accepted !== true) fail('Public upload acceptance is unverified.');
        state.status = 'pending'; writeJournal(ctx, journal, { event: 'upload-accepted', channel, attempt: state.attempts });
        let verified = false;
        for (let i = 0; i < 31; i++) {
          if (i) await adapter.sleep(30000);
          const value = observation(ctx, channel, await adapter.lookup(channel, ctx));
          if (value) { Object.assign(state, value, { status: 'confirmed', lastVerifiedAt: now() }); verified = true; writeJournal(ctx, journal, { event: 'confirmed', channel, attempt: state.attempts }); break; }
        }
        if (!verified) { writeJournal(ctx, journal, { event: 'indexing-pending', channel, attempt: state.attempts }); break; }
      } catch {
        state.status = 'uncertain'; writeJournal(ctx, journal, { event: 'uncertain', channel, attempt: state.attempts }); break;
      }
    }
    const final = plan(ctx, journal, 'selected-complete');
    if (!final.selectedComplete) final.status = ctx.selected.some(x => final.channels[x].status === 'uncertain') ? 'needs-reconciliation' : 'pending';
    final.blockedChannels = ctx.selected.filter(x => ['pending', 'uncertain', 'write-intent'].includes(final.channels[x].status));
    return final;
  } finally {
    fs.closeSync(handle); regular(lock);
    if (fs.readFileSync(lock, 'utf8') !== marker) fail('Public publication lock identity changed; retain it.');
    fs.unlinkSync(lock);
  }
}
module.exports = { inspectPublic, publishPublic, equivalentNuget, verifyNugetRepository };
