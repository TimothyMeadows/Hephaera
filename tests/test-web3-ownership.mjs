import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAsset, createOwnershipReader, createMemoryReservationManager, createTransferCheckpoint, projectTransferBatch } from '../.web3/runtime/ownership.mjs';
import { compile, withChain, viem } from './lib/web3-fixture.mjs';
const A = `0x${'1'.repeat(40)}`, B = `0x${'2'.repeat(40)}`, C = `0x${'3'.repeat(40)}`, ZERO = `0x${'0'.repeat(40)}`;
const H = digit => `0x${digit.repeat(64)}`;
const asset = { chainId: '31337', contractAddress: C, tokenId: ((1n << 256n) - 1n).toString(), standard: 'ERC1155', quantity: '3' };
function fixture(overrides = {}, options = {}) {
  let now = 1000;
  const client = { getChainId: async () => 31337, getBlock: async () => ({ number: 10n, hash: H('a'), timestamp: 1000n }), getCode: async () => '0x6000', readContract: async () => 5n, ...overrides };
  const reader = createOwnershipReader({ client, hashCode: () => H('c'), collections: [{ ...asset, runtimeCodeHash: H('c') }], policy: { blockTag: 'safe', maxAgeSeconds: 30 }, nowSeconds: () => now, ...options });
  return { reader, setNow: value => { now = value; }, client };
}

test('exact uint256 identities reject truncation, forged collection, wrong chain and unavailable RPC', async () => {
  assert.equal(normalizeAsset(asset).tokenId, ((1n << 256n) - 1n).toString());
  for (const invalid of [Number.MAX_SAFE_INTEGER, '01', '-1', (1n << 256n).toString()]) assert.throws(() => normalizeAsset({ ...asset, tokenId: invalid }));
  assert.throws(() => normalizeAsset({ ...asset, standard: 'ERC721' }));
  const { reader } = fixture();
  assert.equal((await reader.read({ asset, owner: A })).balance, '5');
  assert.equal((await reader.read({ asset: { ...asset, contractAddress: B }, owner: A })).reason, 'unregistered-collection');
  assert.equal((await fixture({ getChainId: async () => 1 }).reader.read({ asset, owner: A })).reason, 'wrong-chain');
  assert.equal((await fixture({ readContract: async () => { throw new Error('offline'); } }).reader.read({ asset, owner: A })).status, 'unavailable');
  assert.equal((await fixture({ readContract: async () => 0n }).reader.read({ asset, owner: A })).balance, '0');
  assert.equal((await fixture({ getCode: async () => '0x' }).reader.read({ asset, owner: A })).reason, 'missing-contract-code');
  assert.equal((await fixture({}, { hashCode: () => H('d') }).reader.read({ asset, owner: A })).reason, 'runtime-code-changed');
});

test('freshness, unsupported finality and reorgs never establish ownership', async () => {
  const f = fixture(); f.setNow(1031);
  assert.equal((await f.reader.read({ asset, owner: A })).status, 'stale');
  let count = 0;
  const reorg = fixture({ getBlock: async () => ({ number: 10n, hash: H(++count === 1 ? 'a' : 'b'), timestamp: 1000n }) });
  assert.equal((await reorg.reader.read({ asset, owner: A })).status, 'invalidated');
  assert.equal((await fixture({ getBlock: async () => { throw new Error('safe unsupported'); } }).reader.read({ asset, owner: A })).status, 'unavailable');
});

test('EIP1898 pins code and ERC721/ERC1155 state through A-to-B-to-A header changes', async () => {
  for (const standard of ['ERC721', 'ERC1155']) {
    const calls = [], input = { ...asset, standard, quantity: '1' };
    // Header reads both observe A. Number-bound state would briefly observe B,
    // where the requested owner owns the card, and falsely attribute it to A.
    const isA = args => args.blockHash === H('a') && args.requireCanonical === true && !('blockNumber' in args);
    const { reader } = fixture({
      getCode: async args => { calls.push(args); return '0x6000'; },
      readContract: async args => { calls.push(args); return standard === 'ERC721' ? (isA(args) ? B : A) : (isA(args) ? 0n : 5n); }
    }, { collections: [{ ...input, runtimeCodeHash: H('c') }] });
    const receipt = await reader.read({ asset: input, owner: A });
    assert.equal(receipt.status, 'verified'); assert.equal(receipt.balance, '0');
    assert.equal(receipt.eligibility, 'insufficient'); assert.equal(receipt.block.hash, H('a'));
    assert.equal(calls.length, 2); assert.ok(calls.every(isA));
  }
});

test('unsupported or temporarily noncanonical EIP1898 reads fail unavailable without fallback', async () => {
  for (const method of ['getCode', 'readContract']) {
    let calls = 0, observed;
    const { reader } = fixture({ [method]: async args => {
      calls++; observed = args;
      throw new Error('EIP1898 unsupported or A temporarily noncanonical');
    } });
    const result = await reader.read({ asset, owner: A });
    assert.equal(result.status, 'unavailable'); assert.equal('balance' in result, false);
    assert.equal(calls, 1, 'no numeric/latest retry may bypass canonical hash binding');
    assert.equal(observed.blockHash, H('a')); assert.equal(observed.requireCanonical, true);
    assert.equal('blockNumber' in observed, false);
  }
});

test('quantity admissions serialize duplicate queues, disclose buyer overlap and preserve seller snapshot', async () => {
  let holder = A;
  const { reader } = fixture({ readContract: async ({ args }) => args[0] === holder ? 5n : 0n });
  const manager = createMemoryReservationManager({ reader, policy: 'snapshot-license', buyerOverlap: 'allowed', maxMatchSeconds: 60, nowSeconds: () => 1000 });
  const request = { matchId: 'one', owner: A, assets: [asset], expiresAt: 1050 };
  const outcomes = await Promise.all([manager.admit(request), manager.admit({ ...request, matchId: 'two' })]);
  assert.deepEqual(outcomes.map(item => item.status), ['admitted', 'rejected']);
  assert.equal(outcomes[1].reason, 'insufficient-unreserved-quantity');
  assert.equal((await manager.admit(request)).duplicate, true);
  assert.equal((await manager.admit({ ...request, expiresAt: 1040 })).reason, 'match-id-conflict');
  holder = B;
  assert.equal((await manager.admit({ ...request, owner: B, matchId: 'buyer' })).status, 'admitted');
  assert.equal((await manager.inspect()).length, 2, 'seller retains bounded admitted snapshot after transfer');
  const wait = createMemoryReservationManager({ reader, policy: 'snapshot-license', buyerOverlap: 'wait-until-release', maxMatchSeconds: 60, nowSeconds: () => 1000 });
  holder = A; await wait.admit(request); holder = B;
  assert.equal((await wait.admit({ ...request, owner: B, matchId: 'buyer' })).status, 'rejected');
  const strict = createMemoryReservationManager({ reader, policy: 'strict-lock', maxMatchSeconds: 60, nowSeconds: () => 1000 });
  assert.equal((await strict.admit(request)).reason, 'reviewed-contract-lock-integration-required');
});

test('bounded pure projection deduplicates, backfills and rolls back canonical branches', () => {
  const seed = createTransferCheckpoint({ chainId: asset.chainId, collections: [{ contractAddress: C, standard: 'ERC1155' }], startBlock: '1', parentHash: H('0') });
  const log = { contractAddress: C, tokenId: asset.tokenId, quantity: '5', from: ZERO, to: A, transactionHash: H('1'), logIndex: '0' };
  const one = projectTransferBatch(seed, { ancestorNumber: '0', ancestorHash: H('0'), blocks: [{ number: '1', parentHash: H('0'), hash: H('a'), logs: [log, log] }] });
  const keyA = `${C}/${asset.tokenId}/${A}`, keyB = `${C}/${asset.tokenId}/${B}`;
  assert.equal(one.balances[keyA], '5'); assert.deepEqual(seed.balances, {});
  const two = projectTransferBatch(one, { ancestorNumber: '1', ancestorHash: H('a'), blocks: [{ number: '2', parentHash: H('a'), hash: H('b'), logs: [{ ...log, from: A, to: B, quantity: '3', transactionHash: H('2') }] }] });
  assert.equal(two.balances[keyA], '2'); assert.equal(two.balances[keyB], '3');
  const replacement = projectTransferBatch(two, { ancestorNumber: '1', ancestorHash: H('a'), blocks: [{ number: '2', parentHash: H('a'), hash: H('c'), logs: [] }] });
  assert.equal(replacement.balances[keyA], '5'); assert.equal(replacement.balances[keyB], undefined);
  assert.deepEqual(projectTransferBatch(two, { ancestorNumber: '1', ancestorHash: H('a'), blocks: [{ number: '2', parentHash: H('a'), hash: H('b'), logs: [{ ...log, from: A, to: B, quantity: '3', transactionHash: H('2') }] }] }), two, 'restart with persisted checkpoint converges');
  assert.throws(() => projectTransferBatch(one, { ancestorNumber: '1', ancestorHash: H('a'), blocks: [{ number: '2', parentHash: H('a'), hash: H('b'), logs: [{ ...log, removed: true }] }] }), /rollback/);
  assert.throws(() => projectTransferBatch(one, { ancestorNumber: '0', ancestorHash: H('9'), blocks: [] }), /rescan/);
  assert.throws(() => projectTransferBatch(seed, { ancestorNumber: '0', ancestorHash: H('0'), blocks: [{ number: '1', parentHash: H('0'), hash: H('a'), logs: [log, { ...log, quantity: '6' }] }] }), /duplicate/);
  const batch = projectTransferBatch(seed, { ancestorNumber: '0', ancestorHash: H('0'), blocks: [{ number: '1', parentHash: H('0'), hash: H('a'), logs: [{ ...log, itemIndex: '0' }, { ...log, tokenId: '42', itemIndex: '1' }] }] });
  assert.equal(batch.balances[`${C}/42/${A}`], '5');
  let accessed = false;
  const oversized = new Array(2);
  Object.defineProperty(oversized, 0, { get() { accessed = true; throw new Error('oversized logs were copied'); } });
  assert.throws(() => projectTransferBatch(seed, { ancestorNumber: '0', ancestorHash: H('0'), blocks: [{ number: '1', parentHash: H('0'), hash: H('a'), logs: oversized }] }, { maxLogs: 1 }), /log batch exceeds bound/);
  assert.equal(accessed, false, 'raw log budget is checked before copy/sort');
});

test('actual disposable local EVM: canonical ERC721/ERC1155 reads, transfer and reorg', async () => {
  const source = 'pragma solidity 0.8.28; contract InventoryFixture { mapping(uint=>address) public ownerOf; mapping(address=>mapping(uint=>uint)) private balances; function setOwner(uint id,address a) external {ownerOf[id]=a;} function setBalance(address a,uint id,uint q) external {balances[a][id]=q;} function balanceOf(address a,uint id) external view returns(uint){return balances[a][id];} }';
  const compiled = compile({ 'InventoryFixture.sol': source })['InventoryFixture.sol'].InventoryFixture;
  await withChain(async ({ publicClient, wallets, accounts }) => {
    const deployed = await wallets[0].deployContract(compiled);
    const address = (await publicClient.waitForTransactionReceipt({ hash: deployed })).contractAddress;
    const codeHash = viem.keccak256(await publicClient.getCode({ address }));
    const write = async (functionName, args) => publicClient.waitForTransactionReceipt({ hash: await wallets[0].writeContract({ address, abi: compiled.abi, functionName, args }) });
    const id = BigInt(asset.tokenId);
    await write('setBalance', [accounts[0], id, 5n]);
    const stateCalls = [];
    const client = { ...publicClient,
      getCode: args => { stateCalls.push(args); return publicClient.getCode(args); },
      readContract: args => { stateCalls.push(args); return publicClient.readContract(args); }
    };
    const reader = createOwnershipReader({ client, hashCode: viem.keccak256, collections: [{ chainId: '31337', contractAddress: address, standard: 'ERC1155', runtimeCodeHash: codeHash }], policy: { blockTag: 'latest', maxAgeSeconds: 120 }, nowSeconds: () => Math.floor(Date.now() / 1000) });
    const actualAsset = { ...asset, contractAddress: address };
    const before = await reader.read({ asset: actualAsset, owner: accounts[0] });
    assert.equal(before.status, 'verified'); assert.equal(before.balance, '5'); assert.equal(before.cryptographicStorageProof, false);
    const snapshot = await publicClient.request({ method: 'evm_snapshot' });
    await write('setBalance', [accounts[0], id, 0n]);
    assert.equal((await reader.read({ asset: actualAsset, owner: accounts[0] })).balance, '0');
    await publicClient.request({ method: 'evm_revert', params: [snapshot] });
    assert.equal((await reader.read({ asset: actualAsset, owner: accounts[0] })).balance, '5');
    await write('setOwner', [id, accounts[0]]);
    const unique = { ...actualAsset, standard: 'ERC721', quantity: '1' };
    const uniqueReader = createOwnershipReader({ client, hashCode: viem.keccak256, collections: [{ ...unique, runtimeCodeHash: codeHash }], policy: { blockTag: 'latest', maxAgeSeconds: 120 }, nowSeconds: () => Math.floor(Date.now() / 1000) });
    assert.equal((await uniqueReader.read({ asset: unique, owner: accounts[0] })).balance, '1');
    await write('setOwner', [id, accounts[1]]);
    assert.equal((await uniqueReader.read({ asset: unique, owner: accounts[0] })).balance, '0');
    assert.equal((await uniqueReader.read({ asset: unique, owner: accounts[1] })).balance, '1');
    assert.ok(stateCalls.length >= 12);
    assert.ok(stateCalls.every(args => /^0x[0-9a-f]{64}$/i.test(args.blockHash) && args.requireCanonical === true && !('blockNumber' in args)));
  });
});
