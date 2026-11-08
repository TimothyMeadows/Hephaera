'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const policy = require('../commands/lib/web3-game.cjs');
const base = path.resolve(__dirname, '..');
const temporary = path.join(base, '.local', 'web3-policy-tests');
fs.mkdirSync(temporary, { recursive: true });
const host = () => fs.mkdtempSync(path.join(temporary, 'host-'));
const spec = () => ({ schemaVersion: 'hephaera-web3/v1', chains: ['ETHEREUM', 'BASE', 'IMMUTABLE'], origin: 'https://game.example',
  matchPolicy: 'snapshot-license', ownership: { maxAgeSeconds: 60, blockTag: 'finalized', rpcEnvironment: { ETHEREUM: 'GAME_ETH_RPC', BASE: 'GAME_BASE_RPC', IMMUTABLE: 'GAME_IMX_RPC' } },
  walletKinds: ['eoa', 'erc1271', 'erc6492', 'eip7702'], collections: [], services: [], distribution: { channel: 'web', nftUnlocksGameplay: true } });
const collection = (chain = 'ETHEREUM') => ({ key: 'cards', chain, address: '0x' + '1'.repeat(40), standard: 'ERC721', deploymentBlock: '1',
  runtimeCodeHash: '0x' + '1'.repeat(64), operatorPolicy: chain.startsWith('IMMUTABLE') ? 'immutable-allowlist' : 'standard' });
function cli(args) { return cp.spawnSync(process.execPath, [path.join(base, 'commands/lib/web3-game.cjs'), ...args], { encoding: 'utf8', timeout: 10000, windowsHide: true }); }

test('explicit opt-in; inspection does not select an engine or mutate independent contracts', () => {
  const root = host();
  for (const name of ['ENGINE.md', 'STYLE.md', 'AUDIO.md', 'MUSIC.md', 'VOICE.md']) fs.writeFileSync(path.join(root, name), 'retained ' + name);
  assert.equal(policy.inspect({ root }).readiness, 'unconfigured');
  fs.writeFileSync(path.join(root, 'reviewed.json'), JSON.stringify(spec()));
  const receipt = policy.initialize({ root, spec: 'reviewed.json' });
  assert.equal(receipt.configured, true); assert.equal(receipt.readiness, 'unverified');
  assert.deepEqual(receipt.chains.map(c => c.chainId), ['1', '8453', '13371']);
  for (const key of ['networkContacted', 'installed', 'signed', 'broadcast']) assert.equal(receipt[key], false);
  for (const name of ['ENGINE.md', 'STYLE.md', 'AUDIO.md', 'MUSIC.md', 'VOICE.md']) assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), 'retained ' + name);
  const before = fs.readFileSync(path.join(root, 'web3-game.json'));
  assert.throws(() => policy.initialize({ root, spec: 'reviewed.json' }), /never overwrites/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'web3-game.json')), before);
});

test('strict schema rejects silent fallback, credentials, getters and unknown authority', () => {
  for (const mutate of [
    p => { p.chains = []; }, p => { p.chains = ['ETH']; }, p => { p.chains.push('BASE'); },
    p => { p.origin = 'https://user:secret@game.example'; }, p => { p.origin = 'https://game.example/path'; }, p => { p.origin = 'http://game.example'; },
    p => { p.ownership.rpcEnvironment.ETHEREUM = 'https://rpc.example/token'; }, p => { p.ownership.rpcEnvironment.OTHER = 'OTHER_RPC'; },
    p => { p.ownership.maxAgeSeconds = Infinity; }, p => { p.ownership.blockTag = 'pending'; },
    p => { p.walletKinds = ['universal']; }, p => { p.services = ['arbitrary-service']; }, p => { p.matchPolicy = 'auto-escrow'; },
    p => { p.privateKey = 'not-a-key'; }, p => { p.collections = [collection(), collection()]; },
    p => { p.collections = [collection('IMMUTABLE')]; p.collections[0].operatorPolicy = 'standard'; },
    p => { p.collections = [collection()]; p.collections[0].runtimeCodeHash = '0x' + '0'.repeat(64); },
    p => { p.collections = [collection()]; p.collections[0].deploymentBlock = 12; },
  ]) { const input = spec(); mutate(input); assert.throws(() => policy.validateSpec(input)); }
  let invoked = false; const input = spec();
  Object.defineProperty(input, 'origin', { enumerable: true, get() { invoked = true; return 'https://game.example'; } });
  assert.throws(() => policy.validateSpec(input), /non-data/); assert.equal(invoked, false);
  const dangerous = JSON.parse(JSON.stringify(spec()).replace('"schemaVersion"', '"__proto__":{"polluted":true},"schemaVersion"'));
  assert.throws(() => policy.validateSpec(dangerous)); assert.equal({}.polluted, undefined);
});

test('identity preserves uint256 precision and separates chains', () => {
  const tokenId = ((1n << 256n) - 1n).toString(), contractAddress = '0x' + 'A'.repeat(40);
  const asset = policy.assetIdentity({ chainId: '1', contractAddress, tokenId });
  assert.equal(asset.tokenId, tokenId); assert.equal(asset.contractAddress, contractAddress.toLowerCase());
  assert.notDeepEqual(asset, policy.assetIdentity({ chainId: '8453', contractAddress, tokenId }));
  for (const value of [0, '01', '-1', '1.1', (1n << 256n).toString()]) assert.throws(() => policy.assetIdentity({ chainId: '1', contractAddress, tokenId: value }));
});

test('path guards, bounded reads and retained transition fence precede initialization', () => {
  const root = host(); fs.writeFileSync(path.join(root, 'reviewed.json'), JSON.stringify(spec()));
  assert.throws(() => policy.inspect({ root, config: '../foreign.json' }), /Traversal/);
  fs.writeFileSync(path.join(root, 'oversize.json'), ' '.repeat(1048577));
  assert.throws(() => policy.initialize({ root, spec: 'oversize.json' }), /oversized/);
  fs.mkdirSync(path.join(root, '.hephaera/.cache'), { recursive: true });
  fs.writeFileSync(path.join(root, '.hephaera/.cache/STATE_TRANSITION.json'), '{"status":"prepared"}');
  assert.throws(() => policy.initialize({ root, spec: 'reviewed.json' }), /State transition/);
  assert.equal(fs.existsSync(path.join(root, 'web3-game.json')), false);
  const other = host(); fs.writeFileSync(path.join(other, 'WEB3.md'), 'foreign');
  fs.writeFileSync(path.join(other, 'reviewed.json'), JSON.stringify(spec()));
  assert.throws(() => policy.initialize({ root: other, spec: 'reviewed.json' }), /never overwrites/);
  assert.equal(fs.readFileSync(path.join(other, 'WEB3.md'), 'utf8'), 'foreign');
});

test('doctor stays local and distinguishes policy acceptance from distribution/runtime readiness', () => {
  const root = host(), input = spec(); input.distribution = { channel: 'apple-app-store', nftUnlocksGameplay: true };
  fs.writeFileSync(path.join(root, 'reviewed.json'), JSON.stringify(input));
  policy.initialize({ root, spec: 'reviewed.json' });
  const result = cli(['doctor', '--root', root]); assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout); assert.equal(output.distribution.status, 'blocked');
  assert.equal(output.prerequisites.wallet, 'not-connected'); assert.equal(output.prerequisites.sdk, 'not-inspected');
  assert.equal(output.networkContacted, false); assert.equal(output.readiness, 'unverified');
  input.distribution.channel = 'steam'; fs.writeFileSync(path.join(root, 'web3-game.json'), JSON.stringify(input));
  assert.equal(policy.inspect({ root }).distribution.status, 'blocked');
  assert.notEqual(cli(['inspect', '--root', root, '--root', root]).status, 0);
  assert.notEqual(cli(['broadcast', '--root', root]).status, 0);
});

test('incomplete or changed authority cannot turn local JSON into active policy', () => {
  const root = host(); fs.writeFileSync(path.join(root, 'web3-game.json'), JSON.stringify(spec()));
  assert.throws(() => policy.inspect({ root }), /no WEB3.md authority/);
  fs.writeFileSync(path.join(root, 'WEB3.md'), '# WEB3.md\nRead `other.md` instructions\n');
  assert.throws(() => policy.inspect({ root }), /exact current shared authority/);
});

test('programmatic changing array accessors and executable overrides never run', () => {
  for (const field of ['chains', 'walletKinds', 'collections', 'services']) {
    const input = spec(); let reads = 0;
    Object.defineProperty(input[field], '0', { enumerable: true, configurable: true, get() { reads++; return reads <= 3 ? 'ETHEREUM' : 'UNREVIEWED'; } });
    assert.throws(() => policy.validateSpec(input), /accessors|data array/); assert.equal(reads, 0);
  }
  for (const mutate of [a => { a.some = () => false; }, a => { a[Symbol.iterator] = function* () { yield 'ETHEREUM'; }; },
    a => { Object.setPrototypeOf(a, Object.create(Array.prototype)); }, a => { a.extra = 'unreviewed'; }, a => { delete a[0]; }]) {
    const input = spec(); mutate(input.chains); assert.throws(() => policy.validateSpec(input));
  }
});

test('inspection identities hash the exact parsed byte snapshots', () => {
  const crypto = require('node:crypto');
  const root = host(); fs.writeFileSync(path.join(root, 'reviewed.json'), JSON.stringify(spec()));
  policy.initialize({ root, spec: 'reviewed.json' });
  const originalRead = fs.readSync, file = path.join(root, 'web3-game.json');
  const before = fs.readFileSync(file), expected = crypto.createHash('sha256').update(before).digest('hex');
  const replacement = spec(); replacement.matchPolicy = 'strict-lock';
  let replaced = false;
  fs.readSync = function(fd, buffer, ...args) {
    const count = originalRead.call(this, fd, buffer, ...args);
    if (!replaced && count > 0 && buffer.subarray(0, count).toString().includes('"matchPolicy"')) {
      replaced = true; fs.writeFileSync(file, JSON.stringify(replacement));
    }
    return count;
  };
  try { assert.throws(() => policy.inspect({ root }), /changed while reading/); }
  finally { fs.readSync = originalRead; fs.writeFileSync(file, before); }
  assert.equal(replaced, true);
  const result = policy.inspect({ root }); assert.equal(result.configurationSha256, expected);
  assert.equal(result.registrySha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(base, '.web3/chains.json'))).digest('hex'));
});
