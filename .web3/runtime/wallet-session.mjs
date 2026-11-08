/**
 * Explicit optional wallet/authentication ports. No SDK, RPC, storage or provider
 * is discovered/imported here. Server ports are trusted application code; see
 * skills/integrate-game-wallets for their security and persistence contracts.
 * Authentication never establishes token ownership or game eligibility.
 */
export class WalletSessionError extends Error {
  constructor(code) { super(code); this.name = 'WalletSessionError'; this.code = code; }
}

const fail = (code) => { throw new WalletSessionError(code); };
const kinds = new Set(['eoa', 'erc1271', 'erc6492', 'eip7702']);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(value, max, code = 'invalid-input') {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) fail(code);
  return value;
}
function address(value) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(text(value, 42)) || /^0x0{40}$/i.test(value)) fail('invalid-account');
  return value.toLowerCase();
}
function chain(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('invalid-chain');
  return value;
}
function rpcChain(value) {
  if (!/^0x[0-9a-fA-F]{1,14}$/.test(text(value, 16))) fail('invalid-chain');
  return chain(Number(BigInt(value)));
}
function milliseconds(value, maximum, code = 'invalid-deadline') {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail(code);
  return value;
}
function scope(origin, uri) {
  text(origin, 2048); text(uri, 2048);
  let base, target;
  try { base = new URL(origin); target = new URL(uri); } catch { fail('invalid-origin'); }
  if (base.protocol !== 'https:' || base.origin !== origin || base.username || base.password ||
      target.origin !== origin || target.username || target.password || target.hash || target.href !== uri) fail('invalid-origin');
  return { origin, uri, domain: base.host };
}
function clock(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) fail('invalid-clock');
  return value;
}
function signature(value) {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(text(value, 131074))) fail('invalid-signature');
  return value;
}
function sessionId(value) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(text(value, 128))) fail('invalid-session');
  return value;
}
function nonce(value) {
  if (!/^[A-Za-z0-9]{16,128}$/.test(text(value, 128))) fail('invalid-nonce');
  return value;
}

// Deadlines discard late results. A provider prompt/remote effect may continue;
// abort is cooperative and is never represented as wallet-side cancellation.
async function bounded(work, timeoutMs, signals = []) {
  const controller = new AbortController();
  const cleanups = [];
  let timer;
  const interrupted = new Promise((_, reject) => {
    const stop = (code) => { controller.abort(); reject(new WalletSessionError(code)); };
    for (const external of signals.filter(Boolean)) {
      if (external.aborted) { stop('cancelled'); return; }
      const handler = () => stop('cancelled');
      external.addEventListener('abort', handler, { once: true });
      cleanups.push(() => external.removeEventListener('abort', handler));
    }
    timer = setTimeout(() => stop('deadline-exceeded'), timeoutMs);
  });
  try {
    return await Promise.race([interrupted, Promise.resolve().then(() => {
      if (controller.signal.aborted) fail('cancelled');
      return work(controller.signal);
    })]);
  } finally { clearTimeout(timer); for (const cleanup of cleanups) cleanup(); }
}

function checkMessage(parseMessage, message, expected) {
  text(message, 8192, 'invalid-message');
  const fields = parseMessage(message);
  if (!plain(fields) || fields.scheme !== 'https' || fields.domain !== expected.domain ||
      fields.uri !== expected.uri || fields.version !== '1' || fields.chainId !== expected.chainId ||
      address(fields.address) !== address(expected.address) || fields.nonce !== expected.nonce ||
      !(fields.issuedAt instanceof Date) || fields.issuedAt.getTime() !== expected.issuedAt ||
      !(fields.expirationTime instanceof Date) || fields.expirationTime.getTime() !== expected.expiresAt ||
      fields.notBefore !== undefined || fields.requestId !== undefined || fields.resources !== undefined ||
      fields.statement !== undefined) fail('challenge-mismatch');
}

/** Browser/provider lifecycle, independent of server authentication. */
export function createWalletSession({ provider, chainId, origin, uri, createMessage, parseMessage,
  now = Date.now, requestTimeoutMs = 15000 } = {}) {
  chain(chainId);
  const selected = scope(origin, uri);
  milliseconds(requestTimeoutMs, 120000);
  if (!provider || typeof provider.request !== 'function' || typeof provider.on !== 'function' ||
      typeof provider.removeListener !== 'function' || typeof parseMessage !== 'function' || typeof createMessage !== 'function') fail('invalid-provider');
  let currentAddress = null, epoch = 0, disposed = false, busy = false, outstandingRequests = 0;
  let lifecycle = new AbortController();
  const listeners = [];
  function invalidate() {
    currentAddress = null; epoch++; lifecycle.abort(); lifecycle = new AbortController();
  }
  // EIP-1193 has no universal delegation event. The host must also call
  // invalidateAuthority after its chain/account-authority watcher changes.
  for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) {
    const listener = () => invalidate();
    provider.on(event, listener); listeners.push([event, listener]);
  }
  const snapshot = () => Object.freeze({ status: disposed ? 'disposed' : currentAddress ? 'connected' : 'disconnected',
    address: currentAddress, chainId, epoch });
  async function request(method, params, signal) {
    if (signal.aborted) fail('cancelled');
    outstandingRequests++;
    let result;
    try { result = await provider.request({ method, params }); }
    finally { outstandingRequests--; }
    if (signal.aborted) fail('cancelled');
    return result;
  }
  async function observedAccount(signal) {
    const accounts = await request('eth_accounts', [], signal);
    if (!Array.isArray(accounts) || accounts.length < 1 || accounts.length > 100) fail('invalid-account');
    const selectedAddress = address(accounts[0]);
    if (rpcChain(await request('eth_chainId', [], signal)) !== chainId) fail('wrong-chain');
    return selectedAddress;
  }
  async function operation(work, signal, commit = (result) => result) {
    if (disposed) fail('disposed');
    if (signal?.aborted) fail('cancelled');
    if (busy) fail('request-in-progress');
    // A deadline cannot dismiss an external wallet prompt. Refuse a second
    // provider operation until that request settles, even after local timeout.
    if (outstandingRequests) fail('provider-request-pending');
    busy = true;
    const started = epoch;
    try {
      const result = await bounded(work, requestTimeoutMs, [signal, lifecycle.signal]);
      if (disposed || epoch !== started) fail('stale-session');
      return commit(result);
    } catch (error) {
      // Failed identity probes cannot leave a formerly connected account usable.
      if (error.code === 'wrong-chain' || error.code === 'invalid-account' || error.code === 'stale-session') invalidate();
      throw error;
    } finally { busy = false; }
  }
  return Object.freeze({
    snapshot,
    async connect({ signal } = {}) {
      return operation(async (portSignal) => {
        const accounts = await request('eth_requestAccounts', [], portSignal);
        if (!Array.isArray(accounts) || accounts.length < 1 || accounts.length > 100) fail('invalid-account');
        const first = address(accounts[0]);
        if (await observedAccount(portSignal) !== first) fail('stale-session');
        // Commit only after bounded operation has accepted this result.
        return first;
      }, signal, (connected) => { currentAddress = connected; return snapshot(); });
    },
    async signChallenge({ challenge, signal } = {}) {
      if (!currentAddress) fail(disposed ? 'disposed' : 'not-connected');
      // Copy primitive fields before yielding; caller mutation cannot change the
      // message after scope validation but before the provider prompt.
      if (plain(challenge)) challenge = Object.freeze({ message: challenge.message, origin: challenge.origin,
        uri: challenge.uri, address: challenge.address, chainId: challenge.chainId,
        nonce: challenge.nonce, issuedAt: challenge.issuedAt, expiresAt: challenge.expiresAt });
      if (!plain(challenge) || challenge.origin !== origin || challenge.uri !== uri || challenge.chainId !== chainId ||
          address(challenge.address) !== currentAddress) fail('challenge-mismatch');
      nonce(challenge.nonce);
      checkMessage(parseMessage, challenge.message, { ...challenge, ...selected });
      const at = clock(now);
      if (!Number.isSafeInteger(challenge.issuedAt) || !Number.isSafeInteger(challenge.expiresAt) ||
          challenge.issuedAt > at || challenge.expiresAt <= at || challenge.expiresAt - challenge.issuedAt > 300000) fail('expired-challenge');
      // Some parsers accept a valid prefix/suffix inside additional text. Ask
      // the actual SDK for the one exact canonical message before prompting.
      if (createMessage({ scheme: 'https', domain: selected.domain, uri, version: '1', chainId,
        address: currentAddress, nonce: challenge.nonce, issuedAt: new Date(challenge.issuedAt),
        expirationTime: new Date(challenge.expiresAt) }) !== challenge.message) fail('challenge-mismatch');
      const expectedAddress = currentAddress;
      return operation(async (portSignal) => {
        if (await observedAccount(portSignal) !== expectedAddress) fail('stale-session');
        const signingAt = clock(now);
        if (challenge.issuedAt > signingAt || challenge.expiresAt <= signingAt) fail('expired-challenge');
        const bytes = new TextEncoder().encode(challenge.message);
        const encoded = `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
        const signed = signature(await request('personal_sign', [encoded, expectedAddress], portSignal));
        if (await observedAccount(portSignal) !== expectedAddress) fail('stale-session');
        if (clock(now) >= challenge.expiresAt) fail('expired-challenge');
        return signed;
      }, signal);
    },
    async capabilities({ signal } = {}) {
      if (!currentAddress) fail(disposed ? 'disposed' : 'not-connected');
      const expectedAddress = currentAddress;
      return operation(async (portSignal) => {
        if (await observedAccount(portSignal) !== expectedAddress) fail('stale-session');
        let capabilities;
        try { capabilities = await request('wallet_getCapabilities', [expectedAddress, [`0x${chainId.toString(16)}`]], portSignal); }
        catch (error) {
          if (error.code === 4200 || error.code === -32601) return Object.freeze({ status: 'unavailable', atomicBatch: 'unknown' });
          throw error;
        }
        if (await observedAccount(portSignal) !== expectedAddress) fail('stale-session');
        const atomic = capabilities?.[`0x${chainId.toString(16)}`]?.atomic ?? capabilities?.['0x0']?.atomic;
        const state = atomic === undefined ? 'unsupported' : plain(atomic) && ['supported', 'ready', 'unsupported'].includes(atomic.status) ? atomic.status : 'unknown';
        // "ready" needs an upgrade and real user approval; "supported" is usable.
        // The actual sendCalls request must still explicitly require atomicity.
        return Object.freeze({ status: 'observed', atomicBatch: state, observedEpoch: epoch });
      }, signal);
    },
    invalidateAuthority() { if (disposed) fail('disposed'); invalidate(); },
    disconnect() { if (!disposed) invalidate(); },
    dispose() {
      if (disposed) return;
      disposed = true; invalidate();
      for (const [event, listener] of listeners) provider.removeListener(event, listener);
    },
  });
}

/**
 * SERVER ONLY. generateNonce/createMessage/parseMessage use the host's locked
 * SIWE SDK. nonceStore.put must atomically insert-if-absent with TTL; take must
 * atomically consume exactly once, shared across workers/restarts. All account
 * resolvers/verifiers use the exact chain and bounded trusted chain client.
 */
export function createSiweAuthenticator({ origin, uri, chainId, generateNonce, createMessage, parseMessage,
  nonceStore, resolveAccount, verifiers = {}, now = Date.now, ttlMs = 120000, requestTimeoutMs = 15000 } = {}) {
  const selected = scope(origin, uri);
  chain(chainId); milliseconds(ttlMs, 300000); milliseconds(requestTimeoutMs, 120000);
  if (![generateNonce, createMessage, parseMessage, resolveAccount, nonceStore?.put, nonceStore?.take].every((value) => typeof value === 'function') ||
      !plain(verifiers) || Object.entries(verifiers).some(([kind, verify]) => !kinds.has(kind) || typeof verify !== 'function')) fail('invalid-authenticator');
  function authority(value) {
    if (!plain(value) || !kinds.has(value.kind)) return null;
    text(value.authorityId, 512, 'invalid-authority');
    return { kind: value.kind, authorityId: value.authorityId };
  }
  return Object.freeze({
    async issueChallenge({ address: requestedAddress, sessionId: requestedSession, requestOrigin, signal } = {}) {
      const account = address(requestedAddress), boundSession = sessionId(requestedSession);
      if (requestOrigin !== origin) fail('wrong-origin');
      return bounded(async (portSignal) => {
        const issuedAt = clock(now), expiresAt = issuedAt + ttlMs;
        const challengeNonce = nonce(await generateNonce({ signal: portSignal }));
        const message = await createMessage({ scheme: 'https', domain: selected.domain, uri, chainId,
          version: '1', address: account, nonce: challengeNonce,
          issuedAt: new Date(issuedAt), expirationTime: new Date(expiresAt) });
        const challenge = Object.freeze({ message, origin, uri, address: account, chainId,
          nonce: challengeNonce, issuedAt, expiresAt });
        checkMessage(parseMessage, message, { ...selected, ...challenge });
        if (await nonceStore.put({ nonce: challengeNonce,
          record: { ...challenge, sessionId: boundSession }, expiresAt, signal: portSignal }) !== true) fail('nonce-collision');
        return challenge;
      }, requestTimeoutMs, [signal]);
    },
    async verifyChallenge({ message, signature: suppliedSignature, sessionId: requestedSession, requestOrigin, signal } = {}) {
      text(message, 8192, 'invalid-message'); signature(suppliedSignature); sessionId(requestedSession);
      if (requestOrigin !== origin) fail('wrong-origin');
      const parsed = parseMessage(message);
      const challengeNonce = nonce(parsed?.nonce);
      return bounded(async (portSignal) => {
        const record = await nonceStore.take({ nonce: challengeNonce, signal: portSignal });
        if (!plain(record)) fail('nonce-missing-or-used');
        if (record.sessionId !== requestedSession || record.message !== message || record.origin !== origin ||
            record.uri !== uri || record.chainId !== chainId) fail('challenge-mismatch');
        checkMessage(parseMessage, message, { ...selected, ...record });
        const at = clock(now);
        if (!Number.isSafeInteger(record.issuedAt) || !Number.isSafeInteger(record.expiresAt) ||
            record.issuedAt > at || record.expiresAt <= at || record.expiresAt - record.issuedAt !== ttlMs) fail('expired-challenge');
        const account = address(record.address);
        const before = authority(await resolveAccount({ address: account, chainId, signal: portSignal }));
        if (!before || !verifiers[before.kind]) return Object.freeze({ status: 'unavailable', reason: 'wallet-kind-unsupported', kind: before?.kind ?? 'unknown' });
        const valid = await verifiers[before.kind]({ address: account, chainId, message, signature: suppliedSignature,
          authorityId: before.authorityId, signal: portSignal });
        if (valid !== true) return Object.freeze({ status: 'rejected', reason: 'invalid-signature' });
        const after = authority(await resolveAccount({ address: account, chainId, signal: portSignal }));
        if (!after || after.kind !== before.kind || after.authorityId !== before.authorityId) fail('authority-changed');
        if (clock(now) >= record.expiresAt) fail('expired-challenge');
        return Object.freeze({ status: 'authenticated', address: account, chainId, kind: before.kind,
          authorityId: before.authorityId, authenticatedAt: clock(now), expiresAt: record.expiresAt });
      }, requestTimeoutMs, [signal]);
    },
  });
}

/**
 * Transport-independent, one-use native callback guard. No launch, navigation,
 * token exchange or native bridge. derivePkceChallenge is a trusted S256 SDK
 * port. The host supplies strong random state and a verifier kept off the URL.
 */
export function createNativeReturnGuard({ callbackUrl, state, pkceChallenge, derivePkceChallenge,
  now = Date.now, ttlMs = 120000, requestTimeoutMs = 15000 } = {}) {
  text(callbackUrl, 2048); sessionId(state);
  if (!/^[A-Za-z0-9_-]{43}$/.test(text(pkceChallenge, 43)) || typeof derivePkceChallenge !== 'function') fail('invalid-pkce');
  milliseconds(ttlMs, 300000); milliseconds(requestTimeoutMs, 120000);
  let expected;
  try { expected = new URL(callbackUrl); } catch { fail('invalid-callback'); }
  if (['http:', 'file:', 'data:', 'javascript:', 'about:', 'blob:'].includes(expected.protocol) ||
      !expected.hostname || expected.username || expected.password || expected.search || expected.hash || expected.href !== callbackUrl) fail('invalid-callback');
  const expiresAt = clock(now) + ttlMs;
  const lifecycle = new AbortController();
  let used = false;
  return Object.freeze({
    async consume({ url, codeVerifier, signal } = {}) {
      if (used) fail('callback-used');
      if (clock(now) >= expiresAt) fail('callback-expired');
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(text(codeVerifier, 128))) fail('invalid-pkce');
      text(url, 4096);
      let received;
      try { received = new URL(url); } catch { fail('invalid-callback'); }
      if (received.protocol !== expected.protocol || received.hostname !== expected.hostname || received.port !== expected.port ||
          received.pathname !== expected.pathname || received.username || received.password || received.hash ||
          received.searchParams.getAll('state').length !== 1 || received.searchParams.getAll('code').length !== 1 ||
          [...received.searchParams.keys()].some((key) => !['state', 'code'].includes(key)) ||
          received.searchParams.get('state') !== state) fail('callback-mismatch');
      const code = text(received.searchParams.get('code'), 2048, 'invalid-callback');
      used = true; // Reserve before awaiting the cryptographic PKCE port.
      return bounded(async (portSignal) => {
        if (await derivePkceChallenge(codeVerifier, { signal: portSignal }) !== pkceChallenge) fail('pkce-mismatch');
        if (clock(now) >= expiresAt) fail('callback-expired');
        return Object.freeze({ code, expiresAt });
      }, requestTimeoutMs, [signal, lifecycle.signal]);
    },
    dispose() { used = true; lifecycle.abort(); },
  });
}
