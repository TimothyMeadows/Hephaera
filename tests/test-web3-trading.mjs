import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTradeIntent, createMemoryTradeCoordinator } from '../.web3/runtime/trading.mjs';
import { compile, withChain, viem } from './lib/web3-fixture.mjs';
const A = `0x${'1'.repeat(40)}`, B = `0x${'2'.repeat(40)}`, C = `0x${'3'.repeat(40)}`, S = `0x${'4'.repeat(40)}`, ZERO = `0x${'0'.repeat(40)}`;
const H = digit => `0x${digit.repeat(64)}`;
const terms = { chainId: '31337', settlement: { adapterId: 'reviewed-fixture', version: '1', address: S, runtimeCodeHash: H('c') }, maker: A, taker: B,
  asset: { chainId: '31337', contractAddress: C, tokenId: ((1n << 256n) - 1n).toString(), standard: 'ERC1155', quantity: '3' },
  payment: { tokenAddress: ZERO, amount: '1000000000000000001', decimals: 18 }, fees: [{ recipient: A, amount: '1' }], expiresAt: 1060, nonce: '7' };
function fixture(options = {}) {
  let now = 1000, status = 'executable', remaining = '3', canonical = H('a'), receiptStatus = 'success', unavailable = false, replacement = null;
  const request = { chainId: terms.chainId, to: S, data: '0x12345678', value: '1000000000000000002' };
  const client = {
    getChainId: async () => 31337,
    getCode: async args => { assert.equal(args.blockHash, H('a')); assert.equal(args.requireCanonical, true); assert.equal('blockNumber' in args, false); return '0x6000'; },
    getBlock: async () => ({ number: 10n, hash: canonical, timestamp: 1000n }),
    getTransaction: async ({ hash }) => ({ hash, from: B, to: S, input: request.data, value: BigInt(request.value), nonce: 2 }),
    getTransactionReceipt: async ({ hash }) => { if (unavailable) throw new Error('RPC timeout'); return { transactionHash: hash, blockNumber: 10n, blockHash: H('a'), status: receiptStatus }; }
  };
  const adapter = { id: 'reviewed-fixture', version: '1', prepare: async () => ({ orderKey: H('d'), request }),
    inspect: async ({ blockRef }) => { assert.deepEqual(blockRef, { blockHash: H('a'), requireCanonical: true }); return { status, remainingQuantity: remaining, checkedAt: now, block: { number: '10', hash: H('a') }, runtimeCodeHash: H('c') }; },
    interpretReceipt: async ({ blockRef }) => { assert.deepEqual(blockRef, { blockHash: H('a'), requireCanonical: true }); return { status: 'settled', quantity: '3' }; }, lookupSubmission: async () => replacement ? { transactionHash: replacement } : null };
  const coordinator = createMemoryTradeCoordinator({ adapter, client, hashCode: code => H(code === '0x6000' ? 'c' : 'd'), nowSeconds: () => now, blockTag: 'safe', ...options });
  return { coordinator, client, adapter, set: values => { if ('now' in values) now = values.now; if ('status' in values) status = values.status; if ('remaining' in values) remaining = values.remaining; if ('canonical' in values) canonical = values.canonical; if ('receiptStatus' in values) receiptStatus = values.receiptStatus; if ('unavailable' in values) unavailable = values.unavailable; if ('replacement' in values) replacement = values.replacement; } };
}
async function submitted(f, operationId = 'buy-one') {
  await f.coordinator.prepare({ operationId, intent: terms });
  assert.equal((await f.coordinator.beginSubmission(operationId)).allowed, true);
  return f.coordinator.recordSubmitted(operationId, { transactionHash: H('1'), sender: B, nonce: '2' });
}

test('exact unsigned terms reject floating values, cross-chain assets and hidden fields', () => {
  const intent = prepareTradeIntent(terms);
  assert.equal(intent.payment.amount, '1000000000000000001');
  assert.equal(intent.asset.tokenId, ((1n << 256n) - 1n).toString());
  assert.throws(() => prepareTradeIntent({ ...terms, payment: { ...terms.payment, amount: 1.01 } }));
  assert.throws(() => prepareTradeIntent({ ...terms, asset: { ...terms.asset, chainId: '1' } }));
  assert.throws(() => prepareTradeIntent({ ...terms, signature: 'not-a-login-signature' }));
  assert.throws(() => prepareTradeIntent({ ...terms, nonce: '01' }));
});

test('duplicate operations are idempotent; conflict and uncertain retry cannot submit twice', async () => {
  const f = fixture();
  const prepared = await Promise.all([f.coordinator.prepare({ operationId: 'buy-one', intent: terms }), f.coordinator.prepare({ operationId: 'buy-one', intent: terms })]);
  assert.deepEqual(prepared.map(item => item.duplicate), [false, true]);
  await assert.rejects(f.coordinator.prepare({ operationId: 'buy-one', intent: { ...terms, nonce: '8' } }), /conflict/);
  assert.equal((await f.coordinator.prepare({ operationId: 'fresh-id-same-order', intent: terms })).operation.reason, 'order-already-coordinated');
  assert.equal((await f.coordinator.beginSubmission('buy-one')).allowed, true);
  assert.equal((await f.coordinator.beginSubmission('buy-one')).allowed, false);
  await f.coordinator.recordSubmitted('buy-one', { transactionHash: H('1'), sender: B, nonce: '2' });
  assert.equal((await f.coordinator.recordSubmitted('buy-one', { transactionHash: H('1'), sender: B, nonce: '2' })).transactionHashes.length, 1);
  await assert.rejects(f.coordinator.recordSubmitted('buy-one', { transactionHash: H('1'), sender: B, nonce: '3' }), /nonce-conflict/);
  assert.equal((await f.coordinator.timeout('buy-one')).status, 'unknown');
  assert.equal((await f.coordinator.beginSubmission('buy-one')).allowed, false);
  assert.equal((await f.coordinator.cancelLocal('buy-one')).status, 'unknown');
  assert.equal((await f.coordinator.reconcile('buy-one')).status, 'confirmed', 'local cancellation cannot reverse submitted settlement');
});

test('protocol ports must reject consumed/cancelled/expired/stale approvals and overfill', async () => {
  for (const status of ['filled', 'cancelled', 'expired', 'stale-approval', 'insufficient-balance', 'unavailable']) {
    const f = fixture(); f.set({ status });
    const result = await f.coordinator.prepare({ operationId: `case-${status}`, intent: terms });
    assert.equal(result.operation.status, 'blocked'); assert.equal(result.operation.preflight.status, status);
  }
  const overfill = fixture(); overfill.set({ remaining: '2' });
  assert.equal((await overfill.coordinator.prepare({ operationId: 'overfill', intent: terms })).operation.preflight.status, 'filled');
  const stale = fixture(); stale.set({ now: 1031 });
  assert.equal((await stale.coordinator.prepare({ operationId: 'stale', intent: terms })).operation.preflight.reason, 'stale-simulation-block');
  const expiry = fixture(); await expiry.coordinator.prepare({ operationId: 'expires', intent: terms }); expiry.set({ now: 1060 });
  assert.equal((await expiry.coordinator.beginSubmission('expires')).allowed, false);
  const revoked = fixture(); await revoked.coordinator.prepare({ operationId: 'revoke', intent: terms }); revoked.set({ status: 'stale-approval' });
  assert.equal((await revoked.coordinator.beginSubmission('revoke')).reason, 'stale-approval');
  revoked.set({ status: 'executable' });
  assert.equal((await revoked.coordinator.refresh('revoke')).operation.status, 'prepared');
});

test('canonical reconciliation removes reorg credit and handles revert/replacement/unknown', async () => {
  const f = fixture(); await submitted(f);
  assert.equal((await f.coordinator.reconcile('buy-one')).status, 'confirmed');
  f.set({ canonical: H('b') });
  const orphan = await f.coordinator.reconcile('buy-one'); assert.equal(orphan.status, 'orphaned'); assert.equal(orphan.settlement, undefined);
  f.set({ canonical: H('a'), replacement: H('2') });
  const replaced = await f.coordinator.reconcile('buy-one'); assert.equal(replaced.status, 'confirmed'); assert.deepEqual(replaced.transactionHashes, [H('1'), H('2')]);
  f.set({ receiptStatus: 'reverted' }); assert.equal((await f.coordinator.reconcile('buy-one')).status, 'reverted');
  f.set({ unavailable: true }); assert.equal((await f.coordinator.reconcile('buy-one')).status, 'unknown');
  f.set({ unavailable: false, receiptStatus: 'success' });
  f.client.getTransaction = async ({ hash }) => ({ hash, from: B, to: C, input: '0x12345678', value: 0n, nonce: 2 });
  assert.equal((await f.coordinator.reconcile('buy-one')).status, 'unknown', 'a mismatching successful transaction grants no trade credit');
});

test('successful receipt without protocol-specific settlement is unknown; local pre-submit cancel is final locally', async () => {
  const f = fixture(); await submitted(f); f.adapter.interpretReceipt = async () => ({ status: 'unrelated' });
  assert.equal((await f.coordinator.reconcile('buy-one')).reason, 'trade-settlement-not-established');
  const cancelled = fixture(); await cancelled.coordinator.prepare({ operationId: 'cancel', intent: terms });
  assert.equal((await cancelled.coordinator.cancelLocal('cancel')).status, 'cancelled-local');
  assert.equal((await cancelled.coordinator.beginSubmission('cancel')).allowed, false);
});

test('trading state/code reads cannot attribute temporary fork B code to header A', async () => {
  const codeCalls = [];
  const forkCode = async args => {
    codeCalls.push(args);
    // The reviewed code exists on temporary B, while captured A has changed code.
    return args.blockHash === H('a') && args.requireCanonical === true ? '0x6001' : '0x6000';
  };
  const before = fixture(); before.client.getCode = forkCode;
  const prepared = await before.coordinator.prepare({ operationId: 'aba-preflight', intent: terms });
  assert.equal(prepared.operation.status, 'blocked'); assert.equal(prepared.operation.preflight.reason, 'settlement-code-changed');
  const after = fixture(); await submitted(after); after.client.getCode = forkCode;
  let interpreted = 0; after.adapter.interpretReceipt = async () => { interpreted++; return { status: 'settled', quantity: '3' }; };
  const result = await after.coordinator.reconcile('buy-one');
  assert.equal(result.status, 'unknown'); assert.equal(result.settlement, undefined); assert.equal(interpreted, 0);
  assert.equal(codeCalls.length, 2);
  assert.ok(codeCalls.every(args => args.blockHash === H('a') && args.requireCanonical === true && !('blockNumber' in args)));
});

test('unsupported canonical hash reads cannot fall back for preparation or settlement', async () => {
  const calls = [];
  const unsupported = async args => { calls.push(args); throw new Error('EIP1898 unsupported'); };
  const before = fixture(); before.client.getCode = unsupported;
  assert.equal((await before.coordinator.prepare({ operationId: 'unsupported', intent: terms })).operation.status, 'unavailable');
  const after = fixture(); await submitted(after); after.client.getCode = unsupported;
  const result = await after.coordinator.reconcile('buy-one');
  assert.equal(result.status, 'unknown'); assert.equal(result.settlement, undefined);
  assert.equal(calls.length, 2, 'no weaker retry after either unsupported hash read');
  assert.ok(calls.every(args => args.blockHash === H('a') && args.requireCanonical === true && !('blockNumber' in args)));
  const mismatch = fixture(); mismatch.adapter.inspect = async () => ({ status: 'executable', remainingQuantity: '3', checkedAt: 1000, block: { number: '10', hash: H('b') }, runtimeCodeHash: H('c') });
  assert.equal((await mismatch.coordinator.prepare({ operationId: 'different-adapter-block', intent: terms })).operation.preflight.reason, 'adapter-block-mismatch');
});

test('replacement ancestry preserves submitted hashes and bounds unresolved adapter candidates', async () => {
  const unresolved = fixture({ maxOperations: 1, maxTransactionHashes: 2 }); await submitted(unresolved);
  unresolved.client.getTransaction = async () => { throw new Error('transaction lookup unavailable'); };
  let discoveries = 0;
  const lookup = unresolved.adapter.lookupSubmission;
  unresolved.adapter.lookupSubmission = args => { discoveries++; return lookup(args); };
  await unresolved.coordinator.timeout('buy-one');
  for (let i = 2; i <= 9; i++) {
    unresolved.set({ replacement: H(String(i)) });
    const result = await unresolved.coordinator.reconcile('buy-one');
    assert.deepEqual(result.transactionHashes, [H('1')]); assert.equal(result.pendingReplacementHash, H('2')); assert.equal(result.status, 'unknown');
  }
  assert.equal(discoveries, 1, 'resolve one candidate before accepting more observations');
  const capacity = fixture({ maxOperations: 1, maxTransactionHashes: 2 }); await submitted(capacity);
  await capacity.coordinator.timeout('buy-one'); capacity.set({ replacement: H('2') });
  assert.deepEqual((await capacity.coordinator.reconcile('buy-one')).transactionHashes, [H('1'), H('2')]);
  capacity.set({ unavailable: true }); await capacity.coordinator.reconcile('buy-one');
  capacity.set({ unavailable: false, replacement: H('3') });
  const full = await capacity.coordinator.reconcile('buy-one');
  assert.equal(full.status, 'unknown'); assert.equal(full.reason, 'replacement-history-capacity');
  assert.deepEqual(full.transactionHashes, [H('1'), H('2')]); assert.equal(full.pendingReplacementHash, H('3'));
  assert.equal(full.settlement, undefined);
});

test('actual local EVM receipt path verifies exact transaction and detects an orphaned inclusion (not a marketplace audit)', async () => {
  // Purpose-built diagnostic only: no NFT or sale semantics are claimed here.
  const compiled = compile({ 'ReceiptFixture.sol': 'pragma solidity 0.8.28; contract ReceiptFixture { event Observed(address buyer,uint quantity,uint value); function execute(uint q) external payable {emit Observed(msg.sender,q,msg.value);} }' })['ReceiptFixture.sol'].ReceiptFixture;
  await withChain(async ({ publicClient, wallets, accounts }) => {
    const address = (await publicClient.waitForTransactionReceipt({ hash: await wallets[0].deployContract(compiled) })).contractAddress;
    const codeHash = viem.keccak256(await publicClient.getCode({ address }));
    const now = () => Math.floor(Date.now() / 1000);
    const intent = { ...terms, settlement: { ...terms.settlement, address, runtimeCodeHash: codeHash }, maker: accounts[0], taker: accounts[1], expiresAt: now() + 120 };
    const data = viem.encodeFunctionData({ abi: compiled.abi, functionName: 'execute', args: [3n] });
    const request = { chainId: '31337', to: address, data, value: '1000000000000000002' };
    const adapter = { id: 'reviewed-fixture', version: '1', prepare: async () => ({ orderKey: H('e'), request }),
      inspect: async ({ blockRef }) => {
        assert.equal(blockRef.requireCanonical, true);
        const block = await publicClient.getBlock({ blockHash: blockRef.blockHash });
        // Actual SDK simulation on the exact captured hash, with no fallback.
        await publicClient.call({ account: accounts[1], to: address, data, value: BigInt(request.value), ...blockRef });
        return { status: 'executable', remainingQuantity: '3', checkedAt: now(), block: { number: block.number.toString(), hash: block.hash }, runtimeCodeHash: codeHash };
      },
      interpretReceipt: async ({ receipt, blockRef }) => { assert.deepEqual(blockRef, { blockHash: receipt.blockHash, requireCanonical: true }); const events = viem.parseEventLogs({ abi: compiled.abi, logs: receipt.logs, eventName: 'Observed' }); return events.length === 1 && events[0].args.buyer.toLowerCase() === accounts[1].toLowerCase() && events[0].args.quantity === 3n && events[0].args.value === BigInt(request.value) ? { status: 'settled', quantity: '3' } : { status: 'unrelated' }; }
    };
    const coordinator = createMemoryTradeCoordinator({ client: publicClient, adapter, hashCode: viem.keccak256, nowSeconds: now, blockTag: 'latest', maxStateAgeSeconds: 120 });
    assert.equal((await coordinator.prepare({ operationId: 'local-receipt', intent })).operation.status, 'prepared');
    assert.equal((await coordinator.beginSubmission('local-receipt')).allowed, true);
    const checkpoint = await publicClient.request({ method: 'evm_snapshot' });
    const nonce = await publicClient.getTransactionCount({ address: accounts[1] });
    const transactionHash = await wallets[1].sendTransaction({ to: address, data, value: BigInt(request.value) });
    await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    await coordinator.recordSubmitted('local-receipt', { transactionHash, sender: accounts[1], nonce: String(nonce) });
    assert.equal((await coordinator.reconcile('local-receipt')).status, 'confirmed');
    await publicClient.request({ method: 'evm_revert', params: [checkpoint] });
    const orphaned = await coordinator.reconcile('local-receipt');
    assert.ok(['unknown', 'orphaned'].includes(orphaned.status));
    assert.equal(orphaned.settlement, undefined);
  });
});
