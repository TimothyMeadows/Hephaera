/** Optional host integration. No SDK, network discovery, signatures or global fetch.
 * client is a trusted viem-compatible public client; hashCode is the host's pinned
 * keccak256 implementation. Receipts report RPC trust, never a storage proof.
 * All asynchronous injected ports (including reader.read/hashCode) need finite
 * host deadlines, bounded retries and cancellation. This module owns no timer,
 * cannot stop a stalled port and does not bound the host's incoming request queue.
 * The memory reservation manager is single-process only; production hosts need
 * a durable transactional authority and recovery policy before admitting players.
 */
const UINT256 = (1n << 256n) - 1n;
const ZERO = `0x${'0'.repeat(40)}`;
const OWNER_ABI = [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] }];
const BALANCE_ABI = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }, { name: 'id', type: 'uint256' }], outputs: [{ type: 'uint256' }] }];
const clone = value => structuredClone(value);
function uint(value, name, positive = false) {
  if (typeof value !== 'string' || value.length > 78 || !/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > UINT256 || (positive && value === '0')) throw new TypeError(`${name}: canonical uint256 decimal string required`);
  return value;
}
function address(value, name = 'address', allowZero = false) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value) || (!allowZero && value.toLowerCase() === ZERO)) throw new TypeError(`${name}: nonzero EVM address required`);
  return value.toLowerCase();
}
function hash(value, name = 'hash') {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new TypeError(`${name}: 32-byte hash required`);
  return value.toLowerCase();
}
function integer(value, name) {
  const result = typeof value === 'bigint' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : typeof value === 'string' && value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value) ? BigInt(value) : -1n;
  if (result < 0n || result > UINT256) throw new TypeError(`${name}: nonnegative integer required`);
  return result;
}
function seconds(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name}: safe integer seconds required`);
  return value;
}
function object(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name}: object required`); return value; }
function exact(value, keys, name) { object(value, name); if (Object.keys(value).some(key => !keys.includes(key))) throw new TypeError(`${name}: unknown field`); }
export function normalizeAsset(value) {
  exact(value, ['chainId', 'contractAddress', 'tokenId', 'standard', 'quantity'], 'asset');
  const result = { chainId: uint(value.chainId, 'chainId', true), contractAddress: address(value.contractAddress), tokenId: uint(value.tokenId, 'tokenId'), standard: value.standard, quantity: uint(value.quantity ?? '1', 'quantity', true) };
  if (!['ERC721', 'ERC1155'].includes(result.standard) || (result.standard === 'ERC721' && result.quantity !== '1')) throw new TypeError('asset: unsupported standard or ERC721 quantity');
  return result;
}
function assetKey(asset) { return `${asset.chainId}:${asset.contractAddress}:${asset.tokenId}`; }
function collectionKey(value) { return `${value.chainId}:${value.contractAddress}`; }
function normalizePolicy(value) {
  exact(value, ['blockTag', 'maxAgeSeconds'], 'ownership policy');
  if (!['latest', 'safe', 'finalized'].includes(value.blockTag)) throw new TypeError('explicit blockTag required');
  const maxAgeSeconds = seconds(value.maxAgeSeconds, 'maxAgeSeconds');
  if (maxAgeSeconds < 1 || maxAgeSeconds > 86400) throw new TypeError('maxAgeSeconds outside 1..86400');
  return { blockTag: value.blockTag, maxAgeSeconds };
}

export function createOwnershipReader({ client, hashCode, collections, policy, nowSeconds }) {
  if (!client || typeof hashCode !== 'function' || typeof nowSeconds !== 'function') throw new TypeError('trusted client, hashCode and nowSeconds ports required');
  const rules = normalizePolicy(policy);
  if (!Array.isArray(collections) || !collections.length || collections.length > 128) throw new TypeError('1..128 collections required');
  const registered = new Map();
  for (const collection of collections) {
    const normalized = normalizeAsset({ chainId: collection.chainId, contractAddress: collection.contractAddress, standard: collection.standard, tokenId: '0' });
    const key = collectionKey(normalized);
    if (registered.has(key)) throw new TypeError('duplicate collection');
    registered.set(key, { ...normalized, runtimeCodeHash: hash(collection.runtimeCodeHash, 'runtimeCodeHash') });
  }
  return Object.freeze({
    async read({ asset: input, owner: ownerInput }) {
      const asset = normalizeAsset(input), owner = address(ownerInput, 'owner');
      const base = { asset, owner, assurance: 'trusted-rpc', cryptographicStorageProof: false, policy: clone(rules) };
      const unavailable = reason => ({ ...base, status: 'unavailable', reason });
      const collection = registered.get(collectionKey(asset));
      if (!collection || collection.standard !== asset.standard) return unavailable('unregistered-collection');
      try {
        if (integer(await client.getChainId(), 'RPC chainId').toString() !== asset.chainId) return unavailable('wrong-chain');
        const block = await client.getBlock({ blockTag: rules.blockTag });
        const number = integer(block.number, 'block number'), blockHash = hash(block.hash, 'block hash');
        const timestamp = integer(block.timestamp, 'block timestamp'), now = BigInt(seconds(nowSeconds(), 'nowSeconds'));
        const evidence = { number: number.toString(), hash: blockHash, timestamp: timestamp.toString(), requestedTag: rules.blockTag };
        if (timestamp > now || now - timestamp > BigInt(rules.maxAgeSeconds)) return { ...base, status: 'stale', reason: 'block-outside-freshness-window', block: evidence };
        // EIP1898 binds state to this hash even through an A -> B -> A reorg.
        // Unsupported hash/canonical reads fail closed; never retry by number.
        const blockRef = { blockHash, requireCanonical: true };
        const code = await client.getCode({ address: asset.contractAddress, ...blockRef });
        if (!code || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) return unavailable('missing-contract-code');
        if (hash(await hashCode(code), 'code hash') !== collection.runtimeCodeHash) return unavailable('runtime-code-changed');
        let balance;
        if (asset.standard === 'ERC721') {
          const current = await client.readContract({ address: asset.contractAddress, abi: OWNER_ABI, functionName: 'ownerOf', args: [BigInt(asset.tokenId)], ...blockRef });
          balance = address(current, 'ownerOf result') === owner ? 1n : 0n;
        } else {
          balance = integer(await client.readContract({ address: asset.contractAddress, abi: BALANCE_ABI, functionName: 'balanceOf', args: [owner, BigInt(asset.tokenId)], ...blockRef }), 'balanceOf result');
        }
        const canonical = await client.getBlock({ blockNumber: number });
        if (hash(canonical.hash) !== blockHash) return { ...base, status: 'invalidated', reason: 'reorg-during-read', block: evidence };
        // Re-check the network after reads; an injected wallet/client can switch.
        if (integer(await client.getChainId(), 'RPC chainId').toString() !== asset.chainId) return unavailable('chain-changed-during-read');
        const checkedAt = seconds(nowSeconds(), 'nowSeconds');
        if (BigInt(checkedAt) < timestamp || BigInt(checkedAt) - timestamp > BigInt(rules.maxAgeSeconds)) return { ...base, status: 'stale', reason: 'read-expired', block: evidence };
        return { ...base, status: 'verified', eligibility: balance >= BigInt(asset.quantity) ? 'sufficient' : 'insufficient', balance: balance.toString(), runtimeCodeHash: collection.runtimeCodeHash, block: evidence, checkedAt, expiresAt: Number(timestamp) + rules.maxAgeSeconds };
      } catch {
        // Reverts (including absent ERC721 IDs), unsupported finality and transport
        // errors cannot safely be interpreted as a zero balance.
        return unavailable('rpc-or-contract-read-failed');
      }
    }
  });
}

/** Serialized, capacity-limited memory example. No per-call timer or durable,
 * multi-server authority; the host also owns incoming queue/concurrency limits. */
export function createMemoryReservationManager({ reader, policy, buyerOverlap, maxMatchSeconds, nowSeconds, maxReservations = 1024 }) {
  if (!reader || typeof reader.read !== 'function' || typeof nowSeconds !== 'function') throw new TypeError('trusted reader and clock required');
  if (!['snapshot-license', 'strict-lock'].includes(policy)) throw new TypeError('explicit match policy required');
  if (policy === 'snapshot-license' && !['allowed', 'wait-until-release'].includes(buyerOverlap)) throw new TypeError('explicit buyer overlap policy required');
  seconds(maxMatchSeconds, 'maxMatchSeconds');
  if (!maxMatchSeconds || maxMatchSeconds > 86400 || !Number.isSafeInteger(maxReservations) || maxReservations < 1 || maxReservations > 100000) throw new TypeError('reservation bounds required');
  const reservations = new Map();
  let tail = Promise.resolve();
  const serialized = action => { const current = tail.then(action); tail = current.catch(() => {}); return current; };
  function purge(now) { for (const [id, item] of reservations) if (item.expiresAt <= now) reservations.delete(id); }
  function matchId(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(value)) throw new TypeError('bounded matchId required'); return value; }
  return Object.freeze({
    scope: 'single-process-memory-only',
    admit({ matchId: idInput, owner: ownerInput, assets: inputs, expiresAt }) {
      const id = matchId(idInput), owner = address(ownerInput, 'owner');
      if (!Array.isArray(inputs) || !inputs.length || inputs.length > 64) throw new TypeError('1..64 deck assets required');
      const assets = inputs.map(normalizeAsset).sort((a, b) => assetKey(a).localeCompare(assetKey(b)));
      if (new Set(assets.map(assetKey)).size !== assets.length) throw new TypeError('aggregate duplicate asset quantities before admission');
      seconds(expiresAt, 'expiresAt');
      const identity = JSON.stringify({ owner, assets, expiresAt });
      return serialized(async () => {
        const now = seconds(nowSeconds(), 'nowSeconds'); purge(now);
        if (policy === 'strict-lock') return { status: 'unavailable', reason: 'reviewed-contract-lock-integration-required' };
        if (expiresAt <= now || expiresAt > now + maxMatchSeconds) return { status: 'rejected', reason: 'match-expiry-out-of-bounds' };
        if (reservations.has(id)) return reservations.get(id).identity === identity ? { status: 'admitted', duplicate: true, reservation: clone(reservations.get(id)) } : { status: 'rejected', reason: 'match-id-conflict' };
        if (reservations.size >= maxReservations) return { status: 'unavailable', reason: 'reservation-capacity' };
        const evidence = [];
        for (const asset of assets) {
          const receipt = await reader.read({ asset, owner });
          if (receipt.status !== 'verified' || receipt.owner !== owner || JSON.stringify(receipt.asset) !== JSON.stringify(asset) || receipt.expiresAt <= seconds(nowSeconds(), 'nowSeconds')) return { status: 'rejected', reason: 'ownership-not-current', evidence: clone(receipt) };
          let reserved = 0n;
          for (const existing of reservations.values()) if (buyerOverlap === 'wait-until-release' || existing.owner === owner) for (const held of existing.assets) if (assetKey(held) === assetKey(asset)) reserved += BigInt(held.quantity);
          if (integer(receipt.balance, 'receipt balance') < reserved + BigInt(asset.quantity)) return { status: 'rejected', reason: 'insufficient-unreserved-quantity' };
          evidence.push(clone(receipt));
        }
        // All reads may take time; refuse an expired snapshot/deck at commit.
        const committedAt = seconds(nowSeconds(), 'nowSeconds');
        if (expiresAt <= committedAt || evidence.some(item => item.expiresAt <= committedAt)) return { status: 'rejected', reason: 'ownership-not-current' };
        const chainBlocks = new Map();
        for (const item of evidence) {
          const prior = chainBlocks.get(item.asset.chainId);
          if (prior && prior !== item.block.hash) return { status: 'rejected', reason: 'deck-requires-one-canonical-block-per-chain' };
          chainBlocks.set(item.asset.chainId, item.block.hash);
        }
        const reservation = { identity, matchId: id, owner, assets, expiresAt, admittedAt: committedAt, policy, buyerOverlap, evidence, authority: 'single-process-memory-only' };
        reservations.set(id, reservation);
        return { status: 'admitted', duplicate: false, reservation: clone(reservation) };
      });
    },
    release(id) { matchId(id); return serialized(() => ({ released: reservations.delete(id) })); },
    inspect() { return serialized(() => { purge(seconds(nowSeconds(), 'nowSeconds')); return clone([...reservations.values()]); }); }
  });
}

/** Pure event projection, not an indexer or RPC proof. Host must decode and
 * validate canonical logs, atomically persist returned checkpoints and reconcile
 * against canonical ownership reads. Balances at startBlock are trusted seeds.
 */
export function createTransferCheckpoint({ chainId, collections, startBlock, parentHash, balances = {} }) {
  uint(chainId, 'chainId', true); uint(startBlock, 'startBlock'); hash(parentHash);
  if (!Array.isArray(collections) || !collections.length || collections.length > 128) throw new TypeError('bounded collections required');
  const allowed = collections.map(item => { const value = normalizeAsset({ ...item, chainId, tokenId: '0', quantity: '1' }); return { contractAddress: value.contractAddress, standard: value.standard }; });
  if (new Set(allowed.map(item => item.contractAddress)).size !== allowed.length) throw new TypeError('duplicate collection');
  object(balances, 'seed balances');
  if (Object.keys(balances).length > 10000) throw new TypeError('seed too large');
  const seed = {};
  for (const [key, value] of Object.entries(balances)) {
    const parts = key.split('/');
    if (parts.length !== 3 || !allowed.some(item => item.contractAddress === address(parts[0]))) throw new TypeError('invalid seed key');
    const normalized = `${address(parts[0])}/${uint(parts[1], 'seed tokenId')}/${address(parts[2])}`;
    if (normalized in seed) throw new TypeError('duplicate normalized seed key');
    seed[normalized] = uint(value, 'seed balance');
  }
  return { schemaVersion: 'hephaera-transfer-checkpoint/v1', chainId, collections: allowed, anchor: { number: (BigInt(startBlock) - 1n).toString(), hash: hash(parentHash) }, tip: { number: (BigInt(startBlock) - 1n).toString(), hash: hash(parentHash) }, balances: seed, journal: [] };
}
export function projectTransferBatch(checkpoint, { ancestorNumber, ancestorHash, blocks }, { reorgWindow = 128, maxBlocks = 256, maxLogs = 4096 } = {}) {
  if (checkpoint?.schemaVersion !== 'hephaera-transfer-checkpoint/v1') throw new TypeError('checkpoint schema required');
  for (const [name, value, ceiling] of [['reorgWindow', reorgWindow, 512], ['maxBlocks', maxBlocks, 1024], ['maxLogs', maxLogs, 16384]]) if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new TypeError(`${name}: invalid bound`);
  if (!Array.isArray(blocks) || blocks.length > maxBlocks) throw new TypeError('block batch exceeds bound');
  if (typeof ancestorNumber !== 'string' || !/^-?(0|[1-9][0-9]*)$/.test(ancestorNumber) || BigInt(ancestorNumber) < -1n) throw new TypeError('ancestor number required');
  const state = clone(checkpoint), ancestor = hash(ancestorHash);
  const known = [state.anchor, ...state.journal.map(item => ({ number: item.number, hash: item.hash }))].find(item => item.number === ancestorNumber && item.hash === ancestor);
  if (!known) throw new Error('ancestor outside retained canonical window; canonical rescan required');
  while (BigInt(state.tip.number) > BigInt(ancestorNumber)) {
    const removed = state.journal.pop();
    for (const [key, old] of Object.entries(removed.before)) { if (old === null) delete state.balances[key]; else state.balances[key] = old; }
    state.tip = { number: (BigInt(removed.number) - 1n).toString(), hash: removed.parentHash };
  }
  if (state.tip.hash !== ancestor) throw new Error('ancestor hash mismatch');
  let logCount = 0;
  for (const block of blocks) {
    uint(block.number, 'block number');
    if (BigInt(block.number) !== BigInt(state.tip.number) + 1n || hash(block.parentHash) !== state.tip.hash) throw new Error('noncontiguous canonical batch');
    const blockHash = hash(block.hash), before = {}, seen = new Map(), groups = new Map();
    if (!Array.isArray(block.logs)) throw new TypeError('block logs required');
    // Bound raw input before spreading/sorting or invoking any log properties.
    if (block.logs.length > maxLogs - logCount) throw new TypeError('log batch exceeds bound');
    const ordered = [...block.logs].sort((a, b) => Number(integer(a.logIndex, 'logIndex') - integer(b.logIndex, 'logIndex')) || Number(integer(a.itemIndex ?? '0', 'itemIndex') - integer(b.itemIndex ?? '0', 'itemIndex')));
    for (const log of ordered) {
      if (++logCount > maxLogs) throw new TypeError('log batch exceeds bound');
      if (log.removed) throw new Error('removed log requires explicit canonical rollback batch');
      const contract = address(log.contractAddress), standard = state.collections.find(item => item.contractAddress === contract)?.standard;
      if (!standard) throw new Error('unregistered log collection');
      const tokenId = uint(log.tokenId, 'log tokenId'), quantity = uint(log.quantity, 'log quantity', true);
      if (standard === 'ERC721' && quantity !== '1') throw new TypeError('ERC721 transfer quantity');
      const from = address(log.from, 'from', true), to = address(log.to, 'to', true), index = uint(log.logIndex, 'logIndex');
      const itemIndex = uint(log.itemIndex ?? '0', 'itemIndex');
      if (BigInt(itemIndex) >= BigInt(maxLogs) || (standard === 'ERC721' && itemIndex !== '0')) throw new TypeError('invalid batch item index');
      if (from === ZERO && to === ZERO) throw new TypeError('zero-to-zero transfer');
      const transactionHash = hash(log.transactionHash, 'transactionHash');
      const identity = `${transactionHash}:${index}:${itemIndex}`, fingerprint = JSON.stringify({ contract, tokenId, quantity, from, to });
      if (seen.has(identity)) { if (seen.get(identity) !== fingerprint) throw new Error('conflicting duplicate log'); continue; }
      // TransferBatch is expanded by the trusted decoder with contiguous itemIndex.
      const groupFingerprint = JSON.stringify({ transactionHash, contract, from, to });
      const group = groups.get(index);
      if ((group && (group.fingerprint !== groupFingerprint || BigInt(itemIndex) !== group.count)) || (!group && itemIndex !== '0')) throw new Error('conflicting log index or incomplete decoded batch');
      groups.set(index, { fingerprint: groupFingerprint, count: (group?.count ?? 0n) + 1n });
      seen.set(identity, fingerprint);
      for (const [owner, direction] of [[from, -1n], [to, 1n]]) if (owner !== ZERO) {
        const key = `${contract}/${tokenId}/${owner}`, prior = state.balances[key] ?? '0';
        if (!(key in before)) before[key] = state.balances[key] ?? null;
        const next = BigInt(prior) + direction * BigInt(quantity);
        if (next < 0n || next > UINT256 || (standard === 'ERC721' && next > 1n)) throw new Error('projection balance invalid; canonical rescan required');
        state.balances[key] = next.toString();
      }
    }
    if (Object.keys(state.balances).length > 10000) throw new Error('projection capacity; persist/rescan using host indexer');
    state.journal.push({ number: block.number, hash: blockHash, parentHash: state.tip.hash, before });
    state.tip = { number: block.number, hash: blockHash };
    while (state.journal.length > reorgWindow) { const pruned = state.journal.shift(); state.anchor = { number: pruned.number, hash: pruned.hash }; }
  }
  return state;
}
