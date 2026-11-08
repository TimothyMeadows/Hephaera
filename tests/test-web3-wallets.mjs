import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createWalletSession, createSiweAuthenticator, createNativeReturnGuard } from '../.web3/runtime/wallet-session.mjs';
import { compile, withChain } from './lib/web3-fixture.mjs';

const require = createRequire(new URL('./fixtures/web3/package.json', import.meta.url));
const { createSiweMessage, parseSiweMessage, generateSiweNonce } = require('viem/siwe');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { verifyMessage, keccak256 } = require('viem');
// Ephemeral development-only secrets stay in memory and never enter output/files.
const account = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const origin = 'https://game.example', uri = `${origin}/login`;
const sessionId = 'serverSessionValue0123456789';
const nowValue = Date.parse('2026-11-08T12:00:00Z');
const rejectCode = (code) => (error) => error?.code === code;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function authenticator(overrides = {}) {
  const records = new Map();
  let currentTime = nowValue;
  const auth = createSiweAuthenticator({ origin, uri, chainId: 1,
    generateNonce: () => generateSiweNonce(), createMessage: createSiweMessage, parseMessage: parseSiweMessage,
    now: () => currentTime,
    nonceStore: {
      put({ nonce, record }) { if (records.has(nonce)) return false; records.set(nonce, record); return true; },
      take({ nonce }) { const record = records.get(nonce); records.delete(nonce); return record; },
    },
    // Explicit fixture identity; this is not a production account classifier.
    resolveAccount: async () => ({ kind: 'eoa', authorityId: 'undelegated-test-authority-v1' }),
    verifiers: { eoa: ({ address, message, signature }) => verifyMessage({ address, message, signature }) },
    ...overrides,
  });
  const issue = (extra = {}) => auth.issueChallenge({ address: account.address, sessionId, requestOrigin: origin, ...extra });
  const verify = async (challenge, extra = {}) => auth.verifyChallenge({ message: challenge.message,
    signature: await account.signMessage({ message: challenge.message }), sessionId, requestOrigin: origin, ...extra });
  return { auth, issue, verify, records, setTime: (value) => { currentTime = value; } };
}

class Provider extends EventEmitter {
  constructor() { super(); this.account = account.address; this.chain = '0x1'; this.handlers = {}; this.calls = []; }
  async request(request) {
    this.calls.push(request);
    if (this.handlers[request.method]) return this.handlers[request.method](request);
    if (['eth_accounts', 'eth_requestAccounts'].includes(request.method)) return [this.account];
    if (request.method === 'eth_chainId') return this.chain;
    if (request.method === 'personal_sign') return account.signMessage({ message: { raw: request.params[0] } });
    if (request.method === 'wallet_getCapabilities') return { '0x1': { atomic: { status: 'supported' } } };
    throw new Error('Unexpected fixture request');
  }
}
function wallet(provider = new Provider(), overrides = {}) {
  return { provider, session: createWalletSession({ provider, chainId: 1, origin, uri,
    createMessage: createSiweMessage, parseMessage: parseSiweMessage, now: () => nowValue, ...overrides }) };
}

test('real viem canonical SIWE signature authenticates once; login has no ownership/access claim', async () => {
  const harness = authenticator();
  const challenge = await harness.issue();
  const parsed = parseSiweMessage(challenge.message);
  assert.equal(parsed.domain, 'game.example'); assert.equal(parsed.chainId, 1);
  const { session } = wallet();
  assert.equal((await session.connect()).status, 'connected');
  const signed = await session.signChallenge({ challenge });
  const result = await harness.auth.verifyChallenge({ message: challenge.message, signature: signed, sessionId, requestOrigin: origin });
  assert.equal(result.status, 'authenticated'); assert.equal(result.kind, 'eoa');
  assert.equal(result.address, account.address.toLowerCase());
  assert.equal('ownership' in result, false); assert.equal('gameAccess' in result, false);
  await assert.rejects(harness.verify(challenge), rejectCode('nonce-missing-or-used'));
  session.dispose();
});

test('server origin/session/nonce/chain/URI/message/time integrity and one-use failures', async () => {
  const harness = authenticator();
  await assert.rejects(harness.issue({ requestOrigin: 'https://other.example' }), rejectCode('wrong-origin'));
  for (const mutate of [
    (message) => message.replace('https://game.example wants', 'https://evil.example wants'),
    (message) => message.replace('Chain ID: 1', 'Chain ID: 8453'),
    (message) => message.replace('URI: https://game.example/login', 'URI: https://game.example/other'),
    (message) => `${message}\nInjected: text`,
  ]) {
    const challenge = await harness.issue();
    await assert.rejects(harness.verify(challenge, { message: mutate(challenge.message) }), rejectCode('challenge-mismatch'));
    await assert.rejects(harness.verify(challenge), rejectCode('nonce-missing-or-used'));
  }
  let challenge = await harness.issue();
  await assert.rejects(harness.verify(challenge, { requestOrigin: 'https://evil.example' }), rejectCode('wrong-origin'));
  await assert.rejects(harness.verify(challenge, { sessionId: 'differentSessionValue0123' }), rejectCode('challenge-mismatch'));
  challenge = await harness.issue();
  await assert.rejects(harness.verify(challenge, { message: challenge.message.replace(challenge.nonce, 'anotherNonce0123456789') }), rejectCode('nonce-missing-or-used'));
  challenge = await harness.issue();
  harness.setTime(challenge.expiresAt);
  await assert.rejects(harness.verify(challenge), rejectCode('expired-challenge'));
  harness.setTime(nowValue);
  challenge = await harness.issue();
  harness.setTime(nowValue - 1);
  await assert.rejects(harness.verify(challenge), rejectCode('expired-challenge'));
});

test('actual invalid signature, simultaneous replay and nonce collision reject', async () => {
  const harness = authenticator();
  let challenge = await harness.issue();
  const invalid = await other.signMessage({ message: challenge.message });
  assert.deepEqual(await harness.verify(challenge, { signature: invalid }), { status: 'rejected', reason: 'invalid-signature' });
  challenge = await harness.issue();
  const results = await Promise.allSettled([harness.verify(challenge), harness.verify(challenge)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'nonce-missing-or-used');
  const collision = authenticator({ generateNonce: () => 'constantNonce0123456789' });
  await collision.issue(); await assert.rejects(collision.issue(), rejectCode('nonce-collision'));
});

test('unsupported counterfactual/delegated/unknown accounts are unavailable; no code heuristic', async () => {
  for (const kind of ['erc1271', 'erc6492', 'eip7702', 'unknown']) {
    let calls = 0;
    const harness = authenticator({ resolveAccount: () => ({ kind, authorityId: 'explicit-fixture' }),
      verifiers: { eoa: () => { calls++; return true; } } });
    const result = await harness.verify(await harness.issue());
    assert.equal(result.status, 'unavailable'); assert.equal(calls, 0);
  }
});

test('server delegation/authority rotation during verification invalidates late valid signature', async () => {
  let reads = 0;
  const harness = authenticator({ resolveAccount: () => ({ kind: 'eoa', authorityId: `version-${reads++}` }) });
  await assert.rejects(harness.verify(await harness.issue()), rejectCode('authority-changed'));
});

test('actual deployed ERC1271 wallet and chain-aware viem verification', async () => {
  const contract = compile({ 'Wallet.sol': `// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
contract TestSignatureWallet {
  address public immutable owner;
  constructor(address signer) { owner = signer; }
  function isValidSignature(bytes32 digest, bytes calldata proof) external view returns (bytes4) {
    return ECDSA.recover(digest, proof) == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
  }
}` })['Wallet.sol'].TestSignatureWallet;
  await withChain(async ({ publicClient, wallets, chain }) => {
    const hash = await wallets[0].deployContract({ ...contract, args: [account.address] });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success');
    const deployed = receipt.contractAddress;
    const code = await publicClient.getCode({ address: deployed });
    assert.ok(code && code !== '0x');
    const harness = authenticator({ chainId: chain.id,
      resolveAccount: ({ address, chainId }) => {
        assert.equal(chainId, chain.id); assert.equal(address, deployed.toLowerCase());
        // This fixture knows what it deployed; production must inspect authority.
        return { kind: 'erc1271', authorityId: keccak256(code) };
      },
      verifiers: { erc1271: ({ address, message, signature, chainId }) => {
        assert.equal(chainId, chain.id);
        return publicClient.verifyMessage({ address, message, signature });
      } },
    });
    const result = await harness.verify(await harness.issue({ address: deployed }));
    assert.equal(result.status, 'authenticated'); assert.equal(result.kind, 'erc1271');
    const challenge = await harness.issue({ address: deployed });
    const wrong = await other.signMessage({ message: challenge.message });
    assert.equal((await harness.verify(challenge, { signature: wrong })).status, 'rejected');
  });
});

test('provider change/disconnect/delegation/dispose invalidates pending requests and removes listeners', async () => {
  for (const change of ['accountsChanged', 'chainChanged', 'disconnect', 'delegation', 'dispose']) {
    const { session, provider } = wallet();
    await session.connect();
    const pending = deferred();
    provider.handlers.personal_sign = () => pending.promise;
    const signing = session.signChallenge({ challenge: await authenticator().issue() });
    while (!provider.calls.some((call) => call.method === 'personal_sign')) await tick();
    if (change === 'delegation') session.invalidateAuthority();
    else if (change === 'dispose') session.dispose();
    else provider.emit(change, []);
    await assert.rejects(signing, rejectCode('cancelled'));
    pending.resolve('0x1234'); await tick();
    assert.notEqual(session.snapshot().status, 'connected');
    session.dispose(); session.dispose();
    assert.equal(provider.eventNames().length, 0);
    await assert.rejects(session.connect(), rejectCode('disposed'));
  }
});

test('late connection/identity probes cannot restore state or start a stale signing prompt', async () => {
  let fixture = wallet();
  let pending = deferred();
  fixture.provider.handlers.eth_requestAccounts = () => pending.promise;
  let result = fixture.session.connect();
  await tick(); fixture.provider.emit('accountsChanged', [other.address]);
  await assert.rejects(result, rejectCode('cancelled'));
  pending.resolve([account.address]); await tick();
  assert.equal(fixture.session.snapshot().status, 'disconnected');
  assert.equal(fixture.provider.calls.length, 1); fixture.session.dispose();
  fixture = wallet(); await fixture.session.connect();
  pending = deferred(); fixture.provider.handlers.eth_accounts = () => pending.promise;
  result = fixture.session.signChallenge({ challenge: await authenticator().issue() });
  await tick(); fixture.session.invalidateAuthority();
  await assert.rejects(result, rejectCode('cancelled'));
  pending.resolve([account.address]); await tick();
  assert.equal(fixture.provider.calls.some((call) => call.method === 'personal_sign'), false);
  fixture.session.dispose();
});

test('silent account/chain changes, wallet rejection, deadline, abort and input bounds', async () => {
  const { session, provider } = wallet(undefined, { requestTimeoutMs: 20 });
  await session.connect();
  provider.account = other.address;
  await assert.rejects(session.signChallenge({ challenge: await authenticator().issue() }), rejectCode('stale-session'));
  assert.equal(session.snapshot().status, 'disconnected');
  provider.account = account.address; await session.connect(); provider.chain = '0x2105';
  await assert.rejects(session.capabilities(), rejectCode('wrong-chain'));
  provider.chain = '0x1'; await session.connect();
  provider.handlers.personal_sign = () => { throw Object.assign(new Error('Rejected'), { code: 4001 }); };
  await assert.rejects(session.signChallenge({ challenge: await authenticator().issue() }), rejectCode(4001));
  const outstanding = deferred();
  provider.handlers.personal_sign = () => outstanding.promise;
  await assert.rejects(session.signChallenge({ challenge: await authenticator().issue() }), rejectCode('deadline-exceeded'));
  await assert.rejects(session.signChallenge({ challenge: await authenticator().issue() }), rejectCode('provider-request-pending'));
  const abort = new AbortController(); abort.abort();
  await assert.rejects(session.signChallenge({ challenge: await authenticator().issue(), signal: abort.signal }), rejectCode('cancelled'));
  const challenge = await authenticator().issue();
  await assert.rejects(session.signChallenge({ challenge: { ...challenge, message: 'x'.repeat(8193) } }), rejectCode('invalid-message'));
  await assert.rejects(session.signChallenge({ challenge: { ...challenge, message: `${challenge.message}\nExtra signed text` } }), rejectCode('challenge-mismatch'));
  // A caller-supplied domain field cannot override the configured signing origin.
  await assert.rejects(session.signChallenge({ challenge: { ...challenge, domain: 'evil.example',
    message: challenge.message.replace('game.example wants', 'evil.example wants') } }), rejectCode('challenge-mismatch'));
  outstanding.resolve('0x1234'); await tick();
  session.dispose();
});

test('a challenge expiring during deferred account/chain probes opens no signing prompt', async () => {
  for (const method of ['eth_accounts', 'eth_chainId']) {
    let currentTime = nowValue, entered = false;
    const { session, provider } = wallet(undefined, { now: () => currentTime });
    await session.connect();
    const challenge = await authenticator().issue();
    const pending = deferred();
    provider.handlers[method] = () => { entered = true; return pending.promise; };
    const signing = session.signChallenge({ challenge });
    while (!entered) await tick();
    currentTime = challenge.expiresAt;
    pending.resolve(method === 'eth_accounts' ? [account.address] : '0x1');
    await assert.rejects(signing, rejectCode('expired-challenge'));
    assert.equal(provider.calls.filter((call) => call.method === 'personal_sign').length, 0);
    const checkedCalls = provider.calls.length;
    await assert.rejects(session.signChallenge({ challenge }), rejectCode('expired-challenge'));
    assert.equal(provider.calls.length, checkedCalls, 'an already expired canonical challenge requests no provider work');
    session.dispose();
    assert.equal(provider.eventNames().length, 0);
    assert.equal(session.snapshot().status, 'disposed');
  }
});

test('atomic batching capability is scoped, explicit and preserves ready upgrade state', async () => {
  const { session, provider } = wallet(); await session.connect();
  for (const status of ['supported', 'ready', 'unsupported']) {
    provider.handlers.wallet_getCapabilities = () => ({ '0x1': { atomic: { status } } });
    assert.equal((await session.capabilities()).atomicBatch, status);
  }
  provider.handlers.wallet_getCapabilities = () => ({ '0x2105': { atomic: { status: 'supported' } } });
  assert.equal((await session.capabilities()).atomicBatch, 'unsupported');
  provider.handlers.wallet_getCapabilities = () => ({ '0x0': { atomic: { status: 'supported' } } });
  assert.equal((await session.capabilities()).atomicBatch, 'supported');
  provider.handlers.wallet_getCapabilities = () => { throw Object.assign(new Error('Unsupported'), { code: 4200 }); };
  assert.equal((await session.capabilities()).status, 'unavailable');
  assert.equal(provider.calls.some((call) => /send|signAuthorization/.test(call.method)), false);
  session.dispose();
});

test('mutating a challenge during an identity probe cannot replace the reviewed message', async () => {
  const { session, provider } = wallet(); await session.connect();
  const probe = deferred(); let probes = 0;
  provider.handlers.eth_accounts = () => probes++ === 0 ? probe.promise : [account.address];
  const challenge = { ...await authenticator().issue() }, reviewed = challenge.message;
  const result = session.signChallenge({ challenge });
  await tick(); challenge.message = 'unrelated raw authorization';
  probe.resolve([account.address]); const proof = await result;
  assert.equal(await verifyMessage({ address: account.address, message: reviewed, signature: proof }), true);
  session.dispose();
});

test('server verifier deadlines/cancellation discard late proof and future login needs new nonce', async () => {
  const pending = deferred();
  const harness = authenticator({ requestTimeoutMs: 20, verifiers: { eoa: () => pending.promise } });
  const challenge = await harness.issue();
  await assert.rejects(harness.verify(challenge), rejectCode('deadline-exceeded'));
  pending.resolve(true); await tick();
  await assert.rejects(harness.verify(challenge), rejectCode('nonce-missing-or-used'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(harness.issue({ signal: controller.signal }), rejectCode('cancelled'));
});

const verifier = 'v'.repeat(64);
const challengeS256 = createHash('sha256').update(verifier).digest('base64url');
const derivePkceChallenge = (value) => createHash('sha256').update(value).digest('base64url');
function native(overrides = {}) {
  return createNativeReturnGuard({ callbackUrl: 'gamewallet://auth/return', state: sessionId,
    pkceChallenge: challengeS256, derivePkceChallenge, now: () => nowValue, ...overrides });
}
const callback = `gamewallet://auth/return?state=${sessionId}&code=ephemeral-code`;

test('native callback guard verifies exact return/state/S256 and rejects duplicates and spoofed returns', async () => {
  const guard = native();
  for (const url of [callback.replace('gamewallet:', 'evil:'), callback.replace('//auth/', '//evil/'),
    callback.replace('/return?', '/different?'), callback.replace(sessionId, 'differentState0123456789'),
    `${callback}&state=${sessionId}`, `${callback}&code=second`, `${callback}&admin=true`, `${callback}#fragment`,
    callback.replace('//auth/', '//user@auth/'), callback.replace('//auth/', '//auth:123/')]) {
    await assert.rejects(guard.consume({ url, codeVerifier: verifier }), rejectCode('callback-mismatch'));
  }
  assert.equal((await guard.consume({ url: callback, codeVerifier: verifier })).code, 'ephemeral-code');
  await assert.rejects(guard.consume({ url: callback, codeVerifier: verifier }), rejectCode('callback-used'));
  const wrongPkce = native();
  await assert.rejects(wrongPkce.consume({ url: callback, codeVerifier: 'x'.repeat(64) }), rejectCode('pkce-mismatch'));
  await assert.rejects(wrongPkce.consume({ url: callback, codeVerifier: verifier }), rejectCode('callback-used'));
});

test('native callback expiry, disposal and concurrent duplicate guard; no transport is launched', async () => {
  let current = nowValue;
  const expired = native({ now: () => current, ttlMs: 1 }); current++;
  await assert.rejects(expired.consume({ url: callback, codeVerifier: verifier }), rejectCode('callback-expired'));
  const disposed = native(); disposed.dispose();
  await assert.rejects(disposed.consume({ url: callback, codeVerifier: verifier }), rejectCode('callback-used'));
  const pending = deferred(), guard = native({ derivePkceChallenge: () => pending.promise });
  const first = guard.consume({ url: callback, codeVerifier: verifier });
  await assert.rejects(guard.consume({ url: callback, codeVerifier: verifier }), rejectCode('callback-used'));
  pending.resolve(challengeS256); assert.equal((await first).code, 'ephemeral-code');
  const finishing = deferred(), closing = native({ derivePkceChallenge: () => finishing.promise });
  const late = closing.consume({ url: callback, codeVerifier: verifier });
  await tick(); closing.dispose();
  await assert.rejects(late, rejectCode('cancelled'));
  finishing.resolve(challengeS256); await tick();
});
