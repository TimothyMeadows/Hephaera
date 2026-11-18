'use strict';

// CLI routing only. The host state owner retains version/review policy; the
// verified Bubo adapter retains native admission and bounded execution.
const fs = require('node:fs'), path = require('node:path');
const runtime = require('./bubo-runtime.cjs');
const adapter = require('./bubo-splat-adapter.cjs');
const fail = message => { throw new Error(message); };
const FIELDS = {
  init: ['root', 'task', 'asset', 'version', 'creator', 'request', 'selection', 'media', 'workspace', 'media-state', 'parent-manifest', 'platform-modules', 'ledger-registration'],
  doctor: ['root', 'manifest'],
  validate: ['root', 'manifest'], generate: ['root', 'manifest'],
  'verify-package': ['root', 'manifest'], status: ['root', 'manifest'],
  review: ['root', 'manifest', 'packet'], record: ['root', 'manifest', 'evidence']
};
const INIT_KEYS = { 'media-state': 'mediaState', 'parent-manifest': 'parentManifest', 'platform-modules': 'platformModules', 'ledger-registration': 'ledgerRegistration' };

function help() {
  return 'image-to-splat <init|doctor|validate|setup|provision|generate|verify-package|review|record|status> [unique --option value arguments]\n'
    + 'init --root ROOT --task ID --asset ID --version ID --creator ID --request GENERATION_JSON --media MEDIA_MD --workspace CACHE_CHILD --media-state SHARED_CACHE_CHILD [--selection LOCAL_JSON] [--parent-manifest MANIFEST] [--platform-modules JSON] [--ledger-registration JSON]\n'
    + 'doctor --root ROOT [--manifest MANIFEST] (read-only runtime/capability metadata; no GPU probe or model load)\n'
    + 'validate|generate|verify-package|status --root ROOT --manifest MANIFEST (saved immutable request/settings/ownership; no replacement controls)\n'
    + 'review --root ROOT --manifest MANIFEST --packet REVIEW_PACKET_JSON (supplied local views; no renderer)\n'
    + 'record --root ROOT --manifest MANIFEST --evidence DECISION_JSON (independent or human-backend, reviewer and real decision evidence in document)\n'
    + 'setup|provision --root ROOT --task ID [--request NATIVE_SETUP_JSON] [--workspace CACHE_CHILD] [--media-state SHARED_CACHE_CHILD] [--media MEDIA_MD] [--selection LOCAL_JSON] [--platform-modules JSON] [--timeout SECONDS] [--max-log-bytes BYTES] [--max-private-bytes BYTES] [--execute]\n'
    + 'Provision always requires --request; setup without one is metadata-only. Setup/provision are dry-run unless separately authorized --execute is supplied. First generation requires reviewed project ledger registration, not inferred fresh history. No command installs implicitly, accepts licences, grants generation/GPU authority, resets attempts, supplies human approval or promotes assets. Read docs/IMAGE_TO_SPLAT.md and the pinned Bubo contract.';
}

function parse(values, native = adapter) {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) fail('Expected string command arguments.');
  const [operation, ...args] = values;
  if (!operation || ['help', '--help', '-h'].includes(operation) || args.includes('--help') || args.includes('-h')) return { operation: 'help', options: {} };
  if (['setup', 'provision'].includes(operation)) {
    const options = native.parse(args);
    if (options.has('ledger-registration')) fail('--ledger-registration is an immutable lifecycle init/generation input, not a setup/provision option.');
    return { operation, options };
  }
  if (!Object.hasOwn(FIELDS, operation)) fail('Unknown image-to-splat operation; use --help.');
  const options = {}, allowed = new Set(FIELDS[operation]);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!/^--[a-z][a-z0-9-]*$/.test(flag)) fail('Expected unique --option value arguments.');
    const key = flag.slice(2);
    if (!allowed.has(key) || Object.hasOwn(options, key)) fail('Unknown, duplicate or protected image-to-splat option: ' + flag);
    const value = args[++index];
    if (typeof value !== 'string' || !value || value.startsWith('--')) fail('Missing value for ' + flag + '.');
    options[key] = value;
  }
  return { operation, options };
}

function required(options, ...names) {
  for (const name of names) if (!options[name]) fail('Explicit --' + name + ' is required.');
}
function rootDirectory(value) {
  runtime.syntax(value);
  const full = path.resolve(runtime.native(value));
  runtime.components(full);
  if (!fs.statSync(full).isDirectory()) fail('The explicit project root must be an existing directory.');
  return full;
}

// Ports are trusted compiled JavaScript dependencies for CPU tests. No command
// argument, request document or recipe can select another implementation.
function createCommand({ state, native = adapter, metadata = runtime } = {}) {
  const owner = options => ({ root: rootDirectory(options.root), manifest: options.manifest });
  const service = () => state || require('./image-to-splat-state.cjs');
  async function doctor(options) {
    const root = rootDirectory(options.root);
    let dependency = null, verified = false, capability = null, reason = null;
    try {
      const info = metadata.dependency();
      dependency = { revision: info.pinned.revision, apiVersion: info.pinned.apiVersion, resourceCatalogSha256: info.pinned.resourceCatalogSha256 };
      try {
        const built = metadata.verified(); native.requireCapability(built);
        capability = built.capability.splats; verified = true;
      } catch (error) { reason = error.message; }
    } catch (error) { reason = error.message; }
    return { schemaVersion: 'hephaera-splat-doctor/v1', workflow: 'image-to-splat', root,
      runtime: { dependency, verified, capability, reason },
      asset: options.manifest ? await service().status({ root, manifest: options.manifest }) : null,
      nativeReadiness: 'unverified', gpuProbed: false, modelLoading: false, installation: false, generation: false, promotion: false,
      scope: 'Runtime metadata only; installation content, native host fit and game/device acceptance require separate evidence.' };
  }
  async function run(values) {
    const { operation, options } = parse(values, native);
    if (operation === 'help') return help();
    if (['setup', 'provision'].includes(operation)) {
      if (!options.get('root')) fail('Explicit --root is required.');
      options.set('root', rootDirectory(options.get('root')));
      if (operation === 'provision' && !options.get('request')) fail('Explicit --request is required for provision.');
      if (operation === 'setup' && options.has('execute') && !options.get('request')) fail('Setup execution requires an explicit registration --request.');
      return native.invoke(operation, options, { emit: false });
    }
    required(options, 'root');
    if (operation === 'doctor') return doctor(options);
    if (operation === 'init') {
      required(options, 'task', 'asset', 'version', 'creator', 'request', 'media', 'workspace', 'media-state');
      const input = Object.fromEntries(Object.entries(options).map(([key, value]) => [INIT_KEYS[key] || key, value]));
      input.root = rootDirectory(input.root);
      return service().init(input);
    }
    required(options, 'manifest');
    if (operation === 'review') { required(options, 'packet'); return service().review(owner(options), { packet: options.packet }); }
    if (operation === 'record') { required(options, 'evidence'); return service().record(owner(options), { evidence: options.evidence }); }
    const method = { status: 'status', validate: 'validate', generate: 'generate', 'verify-package': 'verifyPackage' }[operation];
    return service()[method](owner(options));
  }
  return { run, doctor };
}

const command = createCommand();
module.exports = { help, parse, createCommand, run: command.run };
if (require.main === module) command.run(process.argv.slice(2)).then(result => {
  if (typeof result === 'string') console.log(result); else console.log(JSON.stringify(result, null, 2));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
