'use strict';

// Local-only Web3 selection and unsigned policy inspection. No SDK import,
// network connection, signer, deployment or automatic engine selection.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const files = require('./bubo-runtime.cjs');
const transition = require('./state-transition.cjs');
const BASE = path.resolve(__dirname, '../..');
const fail = text => { throw new Error(text); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(files.canonical(value));
const UINT256 = (1n << 256n) - 1n;

function exact(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    fail(name + ' must be a plain JSON object.');
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
      || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key)
        || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')))
    fail(name + ' has missing, unknown or non-data fields.');
  return value;
}
function integer(value, name, { positive = false } = {}) {
  if (typeof value !== 'string' || value.length > 78 || !/^(0|[1-9][0-9]*)$/.test(value)
      || BigInt(value) > UINT256 || (positive && BigInt(value) === 0n)) fail(name + ' must be a canonical uint256 decimal string.');
  return value;
}
function address(value, name = 'Address') {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) fail(name + ' must be a nonzero EVM address.');
  return value.toLowerCase();
}
function denseArray(value, name, max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(name + ' must be a plain data array.');
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (!Number.isSafeInteger(length) || length > max || Reflect.ownKeys(value).length !== length + 1) fail(name + ' must be a bounded dense data array.');
  const result = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(name + ' cannot contain accessors or sparse entries.');
    result.push(descriptor.value);
  }
  return result;
}
function unique(input, allowed, name, min = 1, max = 64) {
  const values = denseArray(input, name, max);
  if (values.length < min || values.some(v => typeof v !== 'string' || !allowed.includes(v)) || new Set(values).size !== values.length)
    fail(name + ' must contain distinct supported values.');
  return [...values];
}
function rootDirectory(value) {
  if (typeof value !== 'string' || !value) fail('Explicit resolved project root is required.');
  const root = path.resolve(files.native(value)); files.syntax(root); files.components(root);
  if (!fs.lstatSync(root).isDirectory()) fail('Project root must be a real directory.');
  return root;
}
function snapshot(root, relative, parse = true) {
  const file = files.projectPath(root, relative), before = fs.lstatSync(file);
  const signature = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
  if (!before.isFile() || before.size > 1048576) fail('Missing, nonregular or oversized policy file.');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || signature(opened) !== signature(before)) fail('Policy changed before reading.');
    const buffer = Buffer.alloc(opened.size + 1);
    let total = 0, count;
    while ((count = fs.readSync(fd, buffer, total, buffer.length - total, null))) {
      total += count;
      if (total > opened.size) fail('Policy grew while reading.');
    }
    const after = fs.fstatSync(fd), current = fs.lstatSync(file);
    if (total !== opened.size || !current.isFile() || signature(after) !== signature(opened) || signature(current) !== signature(after)) fail('Policy changed while reading.');
    const bytes = buffer.subarray(0, total), text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { file, sha256: hash(bytes), value: parse ? JSON.parse(text) : text };
  } finally { fs.closeSync(fd); }
}
function json(root, relative) { return snapshot(root, relative).value; }
function contractBody(root) {
  const prefix = files.samePath(root, BASE) ? '.' : './.hephaera';
  return '# WEB3.md\n\n<!-- hephaera-web3:v1 -->\nRead `' + prefix + '/.web3/CONTRACT.md` instructions\n\nPolicy: `web3-game.json`. Engine, architecture, STYLE and media selections remain independent.\n';
}
function checkContract(root) {
  if (!fs.existsSync(files.projectPath(root, 'WEB3.md'))) fail('Web3 policy has no WEB3.md authority; inspect interrupted initialization before continuing.');
  const authority = snapshot(root, 'WEB3.md', false), text = authority.value.replace(/\r\n/g, '\n');
  const expected = contractBody(root).trim();
  if (!text.startsWith(expected) || (text.match(/<!-- hephaera-web3:v1 -->/g) || []).length !== 1
      || [...text.matchAll(/^Read `([^`]*\.web3\/CONTRACT\.md)` instructions\s*$/gm)].length !== 1)
    fail('WEB3.md needs its exact current shared authority; review edits instead of silent regeneration.');
  return authority.sha256;
}
function registrySnapshot() {
  const result = snapshot(BASE, '.web3/chains.json'), value = result.value;
  exact(value, ['schemaVersion', 'observedDate', 'chains'], 'Chain registry');
  if (value.schemaVersion !== 'hephaera-web3-chains/v1' || !/^\d{4}-\d{2}-\d{2}$/.test(value.observedDate)) fail('Unsupported registry.');
  exact(value.chains, ['ETHEREUM', 'SEPOLIA', 'BASE', 'BASE_SEPOLIA', 'IMMUTABLE', 'IMMUTABLE_TESTNET'], 'Registered chains');
  const expected = { ETHEREUM: '1', SEPOLIA: '11155111', BASE: '8453', BASE_SEPOLIA: '84532', IMMUTABLE: '13371', IMMUTABLE_TESTNET: '13473' };
  for (const [id, chain] of Object.entries(value.chains)) {
    exact(chain, ['chainId', 'network', 'nativeSymbol', 'source', 'constraints'], 'Chain ' + id);
    if (chain.chainId !== expected[id] || !['mainnet', 'testnet'].includes(chain.network)
        || typeof chain.nativeSymbol !== 'string' || !chain.nativeSymbol || !chain.source.startsWith('https://')
        || !denseArray(chain.constraints, 'Chain constraints', 16).length || chain.constraints.some(c => typeof c !== 'string' || !c)) fail('Invalid chain definition.');
  }
  return result;
}
function registry() { return registrySnapshot().value; }
function validateWithRegistry(input, data) {
  exact(input, ['schemaVersion', 'chains', 'origin', 'matchPolicy', 'ownership', 'walletKinds', 'collections', 'services', 'distribution'], 'Web3 specification');
  if (input.schemaVersion !== 'hephaera-web3/v1') fail('Unsupported Web3 schema.');
  const chains = unique(input.chains, Object.keys(data.chains), 'Selected chains', 1, 6);
  if (typeof input.origin !== 'string' || input.origin.length > 512) fail('Origin must be an exact HTTPS origin.');
  let origin; try { origin = new URL(input.origin); } catch { fail('Invalid origin.'); }
  if (origin.protocol !== 'https:' || origin.origin !== input.origin || origin.username || origin.password || origin.search || origin.hash)
    fail('Origin must be an exact HTTPS origin without credentials, path, query or fragment.');
  if (!['snapshot-license', 'strict-lock'].includes(input.matchPolicy)) fail('Select snapshot-license or strict-lock explicitly.');
  exact(input.ownership, ['maxAgeSeconds', 'blockTag', 'rpcEnvironment'], 'Ownership policy');
  if (!Number.isSafeInteger(input.ownership.maxAgeSeconds) || input.ownership.maxAgeSeconds < 1 || input.ownership.maxAgeSeconds > 86400
      || !['latest', 'safe', 'finalized'].includes(input.ownership.blockTag)) fail('Ownership freshness and canonical block policy are required.');
  exact(input.ownership.rpcEnvironment, chains, 'RPC environment bindings');
  for (const value of Object.values(input.ownership.rpcEnvironment)) {
    if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{1,79}$/.test(value)) fail('RPC bindings contain environment variable names only, never endpoint/credential values.');
  }
  unique(input.walletKinds, ['eoa', 'erc1271', 'erc6492', 'eip7702'], 'Wallet kinds', 1, 4);
  unique(input.services, ['passport', 'immutable-orderbook', 'hosted-indexer', 'paymaster', 'wallet-relay'], 'Explicit optional services', 0, 5);
  const collections = denseArray(input.collections, 'Collections', 128);
  const keys = new Set(), identities = new Set();
  for (const collection of collections) {
    exact(collection, ['key', 'chain', 'address', 'standard', 'deploymentBlock', 'runtimeCodeHash', 'operatorPolicy'], 'Collection');
    if (typeof collection.key !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(collection.key) || keys.has(collection.key)) fail('Collection key must be unique and portable.');
    if (!chains.includes(collection.chain) || !['ERC721', 'ERC1155'].includes(collection.standard)) fail('Collection chain/standard is not selected.');
    const id = data.chains[collection.chain].chainId + ':' + address(collection.address);
    if (identities.has(id)) fail('Duplicate chain/collection identity.');
    integer(collection.deploymentBlock, 'Deployment block');
    if (typeof collection.runtimeCodeHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(collection.runtimeCodeHash)
        || /^0x0{64}$/.test(collection.runtimeCodeHash)) fail('Runtime code hash must be the reviewed nonzero keccak256 identity.');
    const immutable = collection.chain.startsWith('IMMUTABLE');
    if (collection.operatorPolicy !== (immutable ? 'immutable-allowlist' : 'standard')) fail('Collection operator policy does not match its chain.');
    keys.add(collection.key); identities.add(id);
  }
  exact(input.distribution, ['channel', 'nftUnlocksGameplay'], 'Distribution policy');
  if (!['unselected', 'web', 'direct-desktop', 'google-play', 'apple-app-store', 'steam'].includes(input.distribution.channel)
      || typeof input.distribution.nftUnlocksGameplay !== 'boolean') fail('Select a supported distribution policy.');
  // Serialize only after strict shape/descriptor checks; never invoke recipe code.
  return JSON.parse(canonical(input));
}
function validateSpec(input) { return validateWithRegistry(input, registry()); }
function distribution(policy) {
  const channel = policy.distribution.channel;
  if (channel === 'steam') return { status: 'blocked', reason: 'Current Steam rules exclude issuing/exchanging NFTs. Recheck the actual channel before release.' };
  if (channel === 'apple-app-store' && policy.distribution.nftUnlocksGameplay)
    return { status: 'blocked', reason: 'Current Apple NFT ownership/functionality restriction conflicts with this declared use. Regional purchase links do not establish eligibility.' };
  return { status: 'unverified', reason: 'Actual target, regional policy, payments and publication approval remain separate.' };
}
function inspect({ root: rootValue, config = 'web3-game.json' } = {}) {
  const root = rootDirectory(rootValue), file = files.projectPath(root, config);
  if (!fs.existsSync(file)) return { schemaVersion: 'hephaera-web3-inspection/v1', configured: false, configuration: config,
    readiness: 'unconfigured', networkContacted: false, installed: false, signed: false, broadcast: false };
  if (config !== 'web3-game.json') fail('Use the canonical web3-game.json policy named by WEB3.md; alternate active policies are unsupported.');
  const authority = checkContract(root), specification = snapshot(root, config), definitions = registrySnapshot();
  const data = definitions.value, policy = validateWithRegistry(specification.value, data);
  return { schemaVersion: 'hephaera-web3-inspection/v1', configured: true, configuration: config, configurationSha256: specification.sha256,
    contractSha256: authority, policySha256: hash(canonical(policy)), registrySha256: definitions.sha256, observedDate: data.observedDate,
    chains: policy.chains.map(id => ({ id, ...data.chains[id], readiness: 'unverified' })),
    collections: policy.collections.length, matchPolicy: policy.matchPolicy, optionalServices: policy.services,
    distribution: distribution(policy), readiness: 'unverified', networkContacted: false, installed: false, signed: false, broadcast: false };
}
function initialize({ root: rootValue, spec } = {}) {
  const root = rootDirectory(rootValue); transition.assertProductionAllowed(root, 'Web3 initialization');
  if (!spec) fail('Initialization requires an explicit reviewed --spec JSON file.');
  const policy = validateSpec(json(root, spec)), config = files.projectPath(root, 'web3-game.json'), contract = files.projectPath(root, 'WEB3.md');
  if (fs.existsSync(config) || fs.existsSync(contract)) fail('Existing Web3 configuration is preserved; initialization never overwrites.');
  const body = contractBody(root);
  let first = false;
  try {
    fs.writeFileSync(config, JSON.stringify(policy, null, 2) + '\n', { flag: 'wx' }); first = true;
    fs.writeFileSync(contract, body, { flag: 'wx' });
  } catch (error) {
    // Remove only our unchanged first write after an ordinary second-write failure.
    if (first && fs.readFileSync(config, 'utf8') === JSON.stringify(policy, null, 2) + '\n') fs.unlinkSync(config);
    throw error;
  }
  return inspect({ root });
}
function assetIdentity(input) {
  exact(input, ['chainId', 'contractAddress', 'tokenId'], 'Asset identity');
  return { chainId: integer(input.chainId, 'Chain ID', { positive: true }), contractAddress: address(input.contractAddress), tokenId: integer(input.tokenId, 'Token ID') };
}
function main(args) {
  const operation = args.shift();
  if (!operation || operation === '--help' || args.includes('--help')) {
    console.log('Usage: web3-game.sh registry | inspect|validate|doctor --root ROOT [--config FILE] | init --root ROOT --spec FILE | asset --root ROOT --input FILE\nAll commands are local-only; no SDK installation, wallet signing or chain submission.'); return;
  }
  const options = {};
  const allowed = { registry: [], inspect: ['root', 'config'], validate: ['root', 'config'], doctor: ['root', 'config'], init: ['root', 'spec'], asset: ['root', 'input'] };
  if (!Object.hasOwn(allowed, operation)) fail('Unknown Web3 operation.');
  while (args.length) {
    const key = args.shift();
    if (!key?.startsWith('--') || !allowed[operation].includes(key.slice(2)) || Object.hasOwn(options, key.slice(2)) || !args.length || args[0].startsWith('--')) fail('Unknown, duplicate or missing Web3 argument.');
    options[key.slice(2)] = args.shift();
  }
  let result;
  if (operation === 'registry') result = registry();
  else if (operation === 'init') result = initialize(options);
  else if (operation === 'asset') result = assetIdentity(json(rootDirectory(options.root), options.input));
  else {
    result = inspect(options);
    if (operation === 'validate' && !result.configured) fail('Web3 is unconfigured.');
    if (operation === 'doctor') result.prerequisites = { node: process.versions.node, sdk: 'not-inspected', wallet: 'not-connected', chain: 'not-contacted',
      nativeDevice: 'not-run', operatorCompatibility: 'unverified', productionAudit: 'not-established' };
  }
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) { try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { registry, validateSpec, inspect, initialize, assetIdentity, rootDirectory, main };
