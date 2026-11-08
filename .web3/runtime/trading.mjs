/** Unsigned host integration only. No wallet, signing, send or HTTP APIs.
 * A selected, reviewed protocol adapter owns calldata/signature/order validation
 * and atomic settlement. EIP712 alone provides no replay/consumption protection.
 * This memory coordinator demonstrates transitions; a production host must
 * persist operation identity and submission intent atomically before side effects.
 * Every RPC/adapter port requires finite transport/execution deadlines, bounded
 * retries and host cancellation. This module owns no timer for stalled ports.
 * The host also owns incoming queue/concurrency limits.
 */
import { normalizeAsset } from './ownership.mjs';
const LIMIT = (1n << 256n) - 1n;
const ZERO = `0x${'0'.repeat(40)}`;
const copy = value => structuredClone(value);
function uint(value, name, positive = false) { if (typeof value !== 'string' || value.length > 78 || !/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > LIMIT || (positive && value === '0')) throw new TypeError(`${name}: canonical uint256 decimal string required`); return value; }
function address(value, name, allowZero = false) { if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value) || (!allowZero && value.toLowerCase() === ZERO)) throw new TypeError(`${name}: EVM address required`); return value.toLowerCase(); }
function hash(value, name) { if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new TypeError(`${name}: 32-byte hash required`); return value.toLowerCase(); }
function id(value, name) { if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(value)) throw new TypeError(`${name}: bounded identity required`); return value; }
function seconds(value, name) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name}: safe integer seconds required`); return value; }
function integer(value, name) { if (typeof value === 'bigint') return uint(value.toString(), name); if (typeof value === 'number' && Number.isSafeInteger(value)) return uint(String(value), name); return uint(value, name); }
function exact(value, keys, name) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new TypeError(`${name}: object with known fields required`); }

/** Description for review, not a signed order or executable exchange protocol. */
export function prepareTradeIntent(value) {
  exact(value, ['chainId', 'settlement', 'maker', 'taker', 'asset', 'payment', 'fees', 'expiresAt', 'nonce'], 'trade intent');
  const chainId = uint(value.chainId, 'chainId', true), asset = normalizeAsset(value.asset);
  if (asset.chainId !== chainId) throw new TypeError('asset and settlement chains differ');
  exact(value.settlement, ['adapterId', 'version', 'address', 'runtimeCodeHash'], 'settlement');
  const settlement = { adapterId: id(value.settlement.adapterId, 'adapterId'), version: id(value.settlement.version, 'adapter version'), address: address(value.settlement.address, 'settlement address'), runtimeCodeHash: hash(value.settlement.runtimeCodeHash, 'settlement code hash') };
  exact(value.payment, ['tokenAddress', 'amount', 'decimals'], 'payment');
  if (!Number.isSafeInteger(value.payment.decimals) || value.payment.decimals < 0 || value.payment.decimals > 255) throw new TypeError('payment decimals required');
  const payment = { tokenAddress: address(value.payment.tokenAddress, 'payment token', true), amount: uint(value.payment.amount, 'payment amount', true), decimals: value.payment.decimals };
  if (!Array.isArray(value.fees) || value.fees.length > 16) throw new TypeError('explicit bounded fees required');
  const fees = value.fees.map(item => { exact(item, ['recipient', 'amount'], 'fee'); return { recipient: address(item.recipient, 'fee recipient'), amount: uint(item.amount, 'fee amount', true) }; });
  if (fees.reduce((total, fee) => total + BigInt(fee.amount), BigInt(payment.amount)) > LIMIT) throw new TypeError('total payment exceeds uint256');
  return { chainId, settlement, maker: address(value.maker, 'maker'), taker: address(value.taker, 'taker'), asset, payment, fees, expiresAt: seconds(value.expiresAt, 'expiresAt'), nonce: uint(value.nonce, 'order nonce') };
}

/** adapter is executable trusted HOST code, never a function from a recipe.
 * prepare({intent}) => {orderKey, request:{chainId,to,data,value}}.
 * inspect({intent,orderKey,request,blockRef}) => {status,remainingQuantity,checkedAt,
 *   block:{number,hash},runtimeCodeHash}; it must verify actual protocol domain,
 *   signature/nonce/consumption, ownership/approval/payment/operator and simulate.
 *   Every state read/simulation must use the supplied EIP1898 blockRef
 *   {blockHash,requireCanonical:true}; unsupported providers fail unavailable,
 *   with no block-number/latest fallback. Return that same block's identity.
 * interpretReceipt({intent,orderKey,receipt,blockRef}) => {status:'settled',quantity}
 *   only after protocol-specific order + asset/payment event validation.
 *   Any supporting state reads must use that receipt-hash blockRef as well.
 * lookupSubmission is optional and must reconcile the same sender/nonce/order;
 * it returns {transactionHash}, or null. No host callback is a cryptographic proof.
 */
export function createMemoryTradeCoordinator({ adapter, client, hashCode, nowSeconds, maxStateAgeSeconds = 30, blockTag = 'safe', maxOperations = 1024, maxTransactionHashes = 16 }) {
  for (const method of ['prepare', 'inspect', 'interpretReceipt']) if (typeof adapter?.[method] !== 'function') throw new TypeError(`trusted selected adapter.${method} required`);
  if (!client || typeof hashCode !== 'function' || typeof nowSeconds !== 'function') throw new TypeError('trusted RPC client, hashCode and clock required');
  if (!['latest', 'safe', 'finalized'].includes(blockTag)) throw new TypeError('explicit supported blockTag required');
  seconds(maxStateAgeSeconds, 'maxStateAgeSeconds');
  if (!maxStateAgeSeconds || maxStateAgeSeconds > 3600 || !Number.isSafeInteger(maxOperations) || maxOperations < 1 || maxOperations > 100000) throw new TypeError('bounded operation policy required');
  if (!Number.isSafeInteger(maxTransactionHashes) || maxTransactionHashes < 1 || maxTransactionHashes > 128) throw new TypeError('bounded transaction ancestry required');
  const operations = new Map();
  const coordinatedOrders = new Map();
  let tail = Promise.resolve();
  const serialized = action => { const result = tail.then(action); tail = result.catch(() => {}); return result; };
  function get(operationId) { const operation = operations.get(id(operationId, 'operationId')); if (!operation) throw new Error('unknown operation'); return operation; }
  function snapshot(operation) { return copy(operation); }
  async function inspect(operation) {
    const now = seconds(nowSeconds(), 'nowSeconds');
    if (operation.intent.expiresAt <= now) return { status: 'expired' };
    if (integer(await client.getChainId(), 'RPC chainId') !== operation.intent.chainId) return { status: 'unavailable', reason: 'wrong-chain' };
    const captured = await client.getBlock({ blockTag });
    const capturedNumber = integer(captured.number, 'captured block number'), capturedHash = hash(captured.hash, 'captured block hash');
    const blockRef = { blockHash: capturedHash, requireCanonical: true };
    const state = await adapter.inspect({ intent: copy(operation.intent), orderKey: operation.orderKey, request: copy(operation.request), blockRef: copy(blockRef) });
    if (!['executable', 'filled', 'cancelled', 'expired', 'stale-approval', 'insufficient-balance', 'unavailable'].includes(state?.status)) return { status: 'unavailable', reason: 'unsupported-adapter-result' };
    if (state.status !== 'executable') return { status: state.status };
    const remaining = uint(state.remainingQuantity, 'remaining quantity'), checkedAt = seconds(state.checkedAt, 'checkedAt');
    const number = integer(state.block?.number, 'state block'), blockHash = hash(state.block?.hash, 'state block hash');
    if (number !== capturedNumber || blockHash !== capturedHash) return { status: 'unavailable', reason: 'adapter-block-mismatch' };
    if (hash(state.runtimeCodeHash, 'runtime code hash') !== operation.intent.settlement.runtimeCodeHash) return { status: 'unavailable', reason: 'settlement-code-changed' };
    if (remaining === '0' || BigInt(remaining) < BigInt(operation.intent.asset.quantity)) return { status: 'filled' };
    const current = seconds(nowSeconds(), 'nowSeconds');
    if (checkedAt > current || current - checkedAt > maxStateAgeSeconds) return { status: 'unavailable', reason: 'stale-simulation' };
    const canonical = await client.getBlock({ blockNumber: BigInt(number) });
    if (hash(canonical.hash, 'canonical state hash') !== blockHash) return { status: 'unavailable', reason: 'simulation-reorganized' };
    const timestamp = BigInt(integer(canonical.timestamp, 'simulation block timestamp'));
    if (timestamp > BigInt(current) || BigInt(current) - timestamp > BigInt(maxStateAgeSeconds)) return { status: 'unavailable', reason: 'stale-simulation-block' };
    const code = await client.getCode({ address: operation.intent.settlement.address, ...blockRef });
    if (!code || code === '0x' || hash(await hashCode(code), 'actual settlement code hash') !== operation.intent.settlement.runtimeCodeHash) return { status: 'unavailable', reason: 'settlement-code-changed' };
    const selected = await client.getBlock({ blockTag });
    if (BigInt(integer(selected.number, 'selected block number')) < BigInt(number)) return { status: 'unavailable', reason: 'simulation-not-policy-confirmed' };
    const stable = await client.getBlock({ blockNumber: BigInt(number) });
    if (hash(stable.hash, 'stable simulation block hash') !== blockHash) return { status: 'unavailable', reason: 'simulation-reorganized' };
    const after = seconds(nowSeconds(), 'nowSeconds');
    if (after < checkedAt || after - checkedAt > maxStateAgeSeconds || operation.intent.expiresAt <= after) return { status: 'unavailable', reason: 'preflight-expired' };
    if (integer(await client.getChainId(), 'RPC chainId') !== operation.intent.chainId) return { status: 'unavailable', reason: 'chain-changed' };
    return { status: 'executable', checkedAt, block: { number, hash: blockHash }, assurance: 'trusted-host-protocol-adapter-and-rpc' };
  }
  return Object.freeze({
    scope: 'single-process-memory-only',
    prepare({ operationId: operationIdInput, intent: input }) {
      const operationId = id(operationIdInput, 'operationId'), intent = prepareTradeIntent(input), fingerprint = JSON.stringify(intent);
      return serialized(async () => {
        const old = operations.get(operationId);
        if (old) { if (old.fingerprint !== fingerprint) throw new Error('operation-id-conflict'); return { duplicate: true, operation: snapshot(old) }; }
        if (operations.size >= maxOperations) throw new Error('operation-capacity; durable host cleanup required');
        if (intent.settlement.adapterId !== adapter.id || intent.settlement.version !== adapter.version) throw new Error('selected-adapter-mismatch');
        const operation = { operationId, fingerprint, intent, status: 'draft', transactionHashes: [], authority: 'single-process-memory-only' };
        // Record identity before even adapter work, preserving uncertain failures.
        operations.set(operationId, operation);
        try {
          const prepared = await adapter.prepare({ intent: copy(intent) });
          const request = prepared?.request;
          exact(request, ['chainId', 'to', 'data', 'value'], 'unsigned request');
          if (uint(request.chainId, 'request chainId', true) !== intent.chainId || address(request.to, 'request recipient') !== intent.settlement.address || typeof request.data !== 'string' || !/^0x(?:[0-9a-fA-F]{2}){4,65536}$/.test(request.data)) throw new TypeError('adapter request does not match selected settlement');
          const value = uint(request.value, 'request value');
          const total = intent.fees.reduce((sum, fee) => sum + BigInt(fee.amount), BigInt(intent.payment.amount));
          if (BigInt(value) !== (intent.payment.tokenAddress === ZERO ? total : 0n)) throw new TypeError('request value differs from reviewed payment plus fees');
          operation.orderKey = hash(prepared.orderKey, 'orderKey');
          const executionKey = `${intent.chainId}:${intent.settlement.address}:${operation.orderKey}:${intent.taker}`;
          if (coordinatedOrders.has(executionKey)) {
            operation.status = 'blocked'; operation.reason = 'order-already-coordinated';
            return { duplicate: false, operation: snapshot(operation) };
          }
          coordinatedOrders.set(executionKey, operationId);
          operation.request = { chainId: request.chainId, to: request.to.toLowerCase(), data: request.data.toLowerCase(), value };
          operation.preflight = await inspect(operation);
          operation.status = operation.preflight.status === 'executable' ? 'prepared' : 'blocked';
        } catch { operation.status = 'unavailable'; operation.reason = 'adapter-or-rpc-preparation-failed'; }
        return { duplicate: false, operation: snapshot(operation) };
      });
    },
    /** Host MUST durably commit the returned submitting state before wallet use. */
    refresh(operationId) { return serialized(async () => {
      const operation = get(operationId);
      if (!['prepared', 'blocked', 'unavailable'].includes(operation.status) || !operation.request || !operation.orderKey) return { refreshed: false, operation: snapshot(operation) };
      try { operation.preflight = await inspect(operation); } catch { operation.preflight = { status: 'unavailable', reason: 'adapter-or-rpc-preflight-failed' }; }
      operation.status = operation.preflight.status === 'executable' ? 'prepared' : 'blocked';
      return { refreshed: true, operation: snapshot(operation) };
    }); },
    /** Host MUST durably commit the returned submitting state before wallet use. */
    beginSubmission(operationId) { return serialized(async () => {
      const operation = get(operationId);
      if (operation.status !== 'prepared') return { allowed: false, reason: 'reconcile-before-resubmission', operation: snapshot(operation) };
      try { operation.preflight = await inspect(operation); } catch { operation.preflight = { status: 'unavailable', reason: 'adapter-or-rpc-preflight-failed' }; }
      if (operation.preflight.status !== 'executable') { operation.status = 'blocked'; return { allowed: false, reason: operation.preflight.status, operation: snapshot(operation) }; }
      operation.status = 'submitting';
      return { allowed: true, request: copy(operation.request), operation: snapshot(operation) };
    }); },
    /** Observes a host submission; never sends. Same hash is idempotent. */
    recordSubmitted(operationId, { transactionHash, sender, nonce }) {
      const observedHash = hash(transactionHash, 'transactionHash'), observedSender = address(sender, 'sender'), observedNonce = uint(nonce, 'transaction nonce');
      return serialized(() => {
        const operation = get(operationId);
        if (observedSender !== operation.intent.taker) throw new Error('submission-sender-mismatch');
        if (operation.transactionHashes.includes(observedHash)) {
          if (operation.transactionNonce !== observedNonce) throw new Error('duplicate-submission-nonce-conflict');
          return snapshot(operation);
        }
        if (!['submitting', 'unknown'].includes(operation.status) || operation.transactionHashes.length) throw new Error('submission requires reconciliation; replacement must be discovered by trusted adapter');
        operation.transactionHashes.push(observedHash); operation.sender = observedSender; operation.transactionNonce = observedNonce; operation.status = 'submitted';
        return snapshot(operation);
      });
    },
    timeout(operationId) { return serialized(() => { const operation = get(operationId); if (['submitting', 'submitted', 'replaced'].includes(operation.status)) operation.status = 'unknown'; return snapshot(operation); }); },
    cancelLocal(operationId) { return serialized(() => { const operation = get(operationId); operation.localWorkCancelled = true; if (['draft', 'prepared', 'blocked', 'unavailable'].includes(operation.status)) operation.status = 'cancelled-local'; return snapshot(operation); }); },
    reconcile(operationId) { return serialized(async () => {
      const operation = get(operationId);
      if (!['submitting', 'submitted', 'unknown', 'included', 'confirmed', 'orphaned', 'replaced', 'reverted'].includes(operation.status)) return snapshot(operation);
      try {
        if (integer(await client.getChainId(), 'RPC chainId') !== operation.intent.chainId) throw new Error('wrong-chain');
        if (!operation.pendingReplacementHash && typeof adapter.lookupSubmission === 'function' && ['submitting', 'unknown', 'replaced', 'orphaned'].includes(operation.status)) {
          const found = await adapter.lookupSubmission({ operation: snapshot(operation) });
          if (found) {
            const discovered = hash(found.transactionHash, 'discovered transactionHash');
            // Keep at most one unresolved candidate; do not grow ancestry from
            // unvalidated adapter observations or discard prior submissions.
            if (!operation.transactionHashes.includes(discovered)) operation.pendingReplacementHash = discovered;
          }
        }
        const transactionHash = operation.pendingReplacementHash ?? operation.transactionHashes.at(-1);
        if (!transactionHash) { operation.status = 'unknown'; return snapshot(operation); }
        // This coordinator supports direct transactions only. Smart-account/user
        // operation envelopes need a separately reviewed protocol adapter/owner.
        const transaction = await client.getTransaction({ hash: transactionHash });
        if (hash(transaction.hash, 'transaction hash') !== transactionHash || address(transaction.from, 'transaction sender') !== operation.intent.taker || address(transaction.to, 'transaction recipient') !== operation.request.to || transaction.input?.toLowerCase() !== operation.request.data || integer(transaction.value, 'transaction value') !== operation.request.value) throw new Error('transaction-does-not-match-intent');
        const actualNonce = integer(transaction.nonce, 'transaction nonce');
        if (operation.transactionNonce !== undefined && operation.transactionNonce !== actualNonce) throw new Error('replacement-nonce-mismatch');
        if (!operation.transactionHashes.includes(transactionHash)) {
          if (operation.transactionHashes.length >= maxTransactionHashes) {
            operation.status = 'unknown'; operation.reason = 'replacement-history-capacity'; delete operation.settlement;
            return snapshot(operation);
          }
          operation.transactionHashes.push(transactionHash); operation.status = 'replaced';
        }
        delete operation.pendingReplacementHash;
        operation.transactionNonce = actualNonce;
        operation.sender = operation.intent.taker;
        const receipt = await client.getTransactionReceipt({ hash: transactionHash });
        if (hash(receipt.transactionHash, 'receipt transactionHash') !== transactionHash) throw new Error('receipt-hash-mismatch');
        const number = integer(receipt.blockNumber, 'receipt block number'), blockHash = hash(receipt.blockHash, 'receipt block hash');
        const canonical = await client.getBlock({ blockNumber: BigInt(number) });
        if (hash(canonical.hash, 'canonical hash') !== blockHash) { operation.status = 'orphaned'; delete operation.settlement; return snapshot(operation); }
        if (receipt.status === 'reverted') { operation.status = 'reverted'; operation.inclusion = { number, hash: blockHash, transactionHash }; delete operation.settlement; return snapshot(operation); }
        if (receipt.status !== 'success') throw new Error('unsupported-receipt-status');
        const blockRef = { blockHash, requireCanonical: true };
        const code = await client.getCode({ address: operation.intent.settlement.address, ...blockRef });
        if (!code || code === '0x' || hash(await hashCode(code), 'included settlement code hash') !== operation.intent.settlement.runtimeCodeHash) throw new Error('included-settlement-code-changed');
        // A successful arbitrary transaction is not evidence of this trade.
        const outcome = await adapter.interpretReceipt({ intent: copy(operation.intent), orderKey: operation.orderKey, receipt, blockRef: copy(blockRef) });
        if (outcome?.status !== 'settled' || uint(outcome.quantity, 'settled quantity', true) !== operation.intent.asset.quantity) { operation.status = 'unknown'; operation.reason = 'trade-settlement-not-established'; delete operation.settlement; return snapshot(operation); }
        const finality = await client.getBlock({ blockTag });
        const finalityTime = BigInt(integer(finality.timestamp, 'finality block timestamp')), observedAt = BigInt(seconds(nowSeconds(), 'nowSeconds'));
        if (finalityTime > observedAt || observedAt - finalityTime > BigInt(maxStateAgeSeconds)) throw new Error('stale-finality-observation');
        const stable = await client.getBlock({ blockNumber: BigInt(number) });
        if (hash(stable.hash, 'stable block hash') !== blockHash) { operation.status = 'orphaned'; delete operation.settlement; return snapshot(operation); }
        if (integer(await client.getChainId(), 'RPC chainId') !== operation.intent.chainId) throw new Error('chain-changed');
        operation.inclusion = { number, hash: blockHash, transactionHash };
        operation.status = BigInt(integer(finality.number, 'finality block')) >= BigInt(number) ? 'confirmed' : 'included';
        operation.settlement = { quantity: outcome.quantity, assurance: 'trusted-host-protocol-adapter-and-rpc', finalityTag: blockTag, cryptographicStorageProof: false };
        delete operation.reason;
      } catch {
        if (['confirmed', 'included', 'reverted'].includes(operation.status)) operation.previousObservation = operation.status;
        operation.status = 'unknown'; operation.reason = 'rpc-or-adapter-reconciliation-unavailable'; delete operation.settlement;
      }
      return snapshot(operation);
    }); },
    inspect(operationId) { return serialized(() => snapshot(get(operationId))); }
  });
}
