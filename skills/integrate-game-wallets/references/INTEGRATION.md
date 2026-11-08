# Wallet authentication integration contract

The optional module `.web3/runtime/wallet-session.mjs` has no imports, implicit SDK discovery, provider discovery, network connection, filesystem access or global registration. Import it explicitly into reviewed host source. It accepts trusted function ports from application code; never deserialize executable callbacks from policy, messages or NFT metadata. It is neither an authentication server nor a native wallet transport. The host owns HTTP/session security, durable persistence, client/chain identity, rate limits and actual target support.

## Client provider owner

`createWalletSession({provider, chainId, origin, uri, createMessage, parseMessage, now?, requestTimeoutMs?})` requires an explicitly selected EIP1193 provider with `request`, `on` and `removeListener`. `createMessage` and `parseMessage` are the host's locked synchronous SIWE SDK constructor/parser. An SDK roundtrip rejects trailing or ambiguous text before prompting. `origin` is an exact HTTPS origin; `uri` is an exact HTTPS URL under that origin. Chain IDs are positive safe integers; asset identities elsewhere keep large quantities/IDs as decimal strings. Defaults are a 15-second request deadline and the current clock; deadlines may be at most 120 seconds.

| Method | Result and boundary |
| --- | --- |
| `snapshot()` | Immutable status, address, configured chainId and authority epoch. It contains no authenticated session or ownership claim. |
| `connect({signal?})` | Explicit account permission request, then account/chain checks; no automatic switch/add-chain operation. |
| `signChallenge({challenge,signal?})` | Validates the canonical challenge scope/time, copies primitive fields before yielding, probes identity, requests only personal_sign, then probes identity again. Returns the signature privately to the host authentication request. |
| `capabilities({signal?})` | Reads wallet_getCapabilities for the exact account/chain; preserves atomic status supported/ready/unsupported/unknown. It never upgrades a wallet or sends calls. |
| `invalidateAuthority()` | Drops connected state and aborts pending local work. Call on relevant delegation, signer, proxy or authority changes. |
| `disconnect()` | Drops local state; revokes no wallet permission or existing approval. |
| `dispose()` | Idempotently invalidates state and removes the listeners it registered. |

Only one local provider operation runs at a time. EIP1193 account/chain/disconnect events invalidate the epoch and connected state; reconnect explicitly. The provider API cannot guarantee that an already displayed prompt stops when the local operation times out or aborts. While an old provider request remains unresolved, new operations fail with provider-request-pending instead of starting duplicate prompts. Late results cannot restore the helper's state or start a subsequent signing step. A malicious wallet/provider cannot be made trustworthy by this wrapper.

Authentication belongs to the server. Bind any client presentation of that authentication to the observed epoch, and reauthenticate after changes. Provider events do not reliably expose all contract/delegation changes: a reviewed chain/account-authority watcher is mandatory for those profiles. Server sessions need their own revocation/freshness checks; a client-side epoch cannot revoke a server cookie.

## Server challenge and signature ports

`createSiweAuthenticator` requires origin, uri, chainId, generateNonce, createMessage, parseMessage, nonceStore, resolveAccount and an explicit verifiers map. Optional now, ttlMs and requestTimeoutMs provide clock/test injection and finite budgets. Default challenge lifetime is 120 seconds, maximum 300 seconds. Input messages are at most 8192 characters, nonce/session identifiers at most 128 characters and signatures at most 65536 bytes. Oversized contract signatures require a separately reviewed profile rather than removing bounds.

`issueChallenge({address,sessionId,requestOrigin,signal?})` returns the exact message plus address, origin, uri, chainId, nonce and issuedAt/expiresAt epoch milliseconds. The canonical SDK message includes HTTPS scheme, domain, URI, version 1, chain, address, nonce, issue time and expiration. This initial narrow profile accepts no arbitrary statement, resources, request ID or not-before fields. Use the actual SDK constructor/parser; do not hand-assemble or recover signatures with custom cryptography.

`verifyChallenge({message,signature,sessionId,requestOrigin,signal?})` consumes the nonce once before asynchronous signature verification. It requires exact stored message/session/scope/time integrity, resolves current account authority, verifies with the selected profile, then resolves authority again and rejects a changed authority. It returns an authenticated control receipt, rejected invalid-signature result or unavailable unsupported-profile result. Integrity/lifecycle errors throw WalletSessionError with a stable code. A rejected/unsupported/timed-out attempt consumes its challenge; obtain a new one for retry. It issues no cookie, token or card entitlement.

`requestOrigin` and `sessionId` must be derived by the trusted HTTP server from validated request/browser-session context. Never accept these values merely because the client copied them into JSON. Enforce HTTPS, CSRF protection, exact allowed origins, appropriate HttpOnly/SameSite cookies and authentication rate limits at the host boundary. Do not trust arbitrary forwarded headers. A signed message's claimed origin alone is not an HTTP-origin check.

| Trusted port | Required host behavior |
| --- | --- |
| `generateNonce({signal})` | Use the pinned SDK's cryptographically secure generator. Strong random values, no predictable sequence; the helper enforces 16–128 alphanumeric characters but cannot measure entropy. |
| `createMessage(fields)` / `parseMessage(message)` | Actual compatible SIWE SDK canonical constructor/parser. No SDK import or installation during ordinary baseline startup. |
| `nonceStore.put({nonce,record,expiresAt,signal})` | Atomically insert-if-absent, return true only for the new record, enforce TTL and bounded storage. Include an application namespace. |
| `nonceStore.take({nonce,signal})` | Atomically read-and-delete once across all server workers/restarts; return the complete stored record or missing. No separate get/delete race. |
| `resolveAccount({address,chainId,signal})` | Use the exact selected chain and declared canonical/freshness policy. Return `{kind,authorityId}` only for a supported classified account; unknown classification stays unavailable. |
| `verifiers[kind]({address,chainId,message,signature,authorityId,signal})` | Use the selected chain-aware SDK verifier for that profile; return true only for actual validity. Unsupported RPC/simulation paths stay unavailable/fail, without a fallback that broadens authority. Honor abort/deadline and bound internal retries/gas/calls. |

The nonce store is a production prerequisite. The tests' Map is an atomic single-process fixture and supplies no persistence, multi-worker or crash-recovery evidence. Ports must preserve their bound inputs and avoid logging challenges/signatures, sessions or linked player identifiers. Timeout may leave a nonce inserted or consumed; that is safe failed progress, not permission to reuse it. Storage failures fail authentication closed.

An authorityId binds relevant code/delegation/implementation, signer/owner and policy state, rather than just the address or a block number that changes on every read. Independent snapshots must use a coherent chain view and a reviewed freshness policy. The before/after check detects an observed change during verification; it cannot promise continuous future authority. Revalidate or revoke server sessions on relevant changes before privileged use.

| Wallet profile | Evidence in baseline tests | Production boundary |
| --- | --- | --- |
| `eoa` | Actual ephemeral EOA canonical SIWE signing and SDK signature verification. | Chain classification must establish undelegated authority; offline key recovery alone cannot prove current chain/delegation state. |
| `erc1271` | Actual locally compiled/deployed contract wallet verifies ECDSA via ERC1271; actual viem public client accepts valid and rejects other signer. | Exact chain, deployed code, owner/proxy changes, canonical reads and selected wallet implementation still need target evidence. |
| `erc6492` | Explicit unsupported-profile failure fixture. | No counterfactual reconstruction, factory simulation or deployment path is selected. Supply a bounded reviewed verifier and actual evidence before enabling. |
| `eip7702` | Explicit unsupported-profile failure and authority-rotation fixtures. | No raw delegation signing or automatic ERC1271 assumption. Require chain/wallet-specific delegation detection and verified authority semantics. |

Nonempty account code can be EIP7702 delegated code, conventional contract code or an unsupported case. It must never be the sole classifier. A manifest's walletKinds declaration is not verified readiness. No helper automatically enables hosted Passport, a paymaster, session keys or a wallet service.

## Atomic calls

EIP5792 capabilities are account/chain scoped. The helper reads that chain, with the standard 0x0 global-capability fallback. An absent atomic capability is unsupported; a malformed status is unknown. `supported` promises atomic/contiguous execution; `ready` requires a wallet upgrade and actual user approval. A caller must set `atomicRequired: true` in a separately reviewed wallet_sendCalls integration whenever the operation needs atomicity, and then reconcile actual status. A capability observation is neither permission to submit nor proof of settlement.

## Narrow native return guard

`createNativeReturnGuard({callbackUrl,state,pkceChallenge,derivePkceChallenge,now?,ttlMs?,requestTimeoutMs?})` records a trusted exact callback URL, strong random one-use state, S256 PKCE challenge and bounded expiry. The callback URL has a host/path, no credentials, query or fragment. The host supplies the actual S256 SDK/Web Crypto implementation and keeps the 43–128-character PKCE verifier off URLs and public logs. `consume({url,codeVerifier,signal?})` checks exact scheme, host, port, path, one state and code parameter, no extra parameters, matching state, actual S256 derivation and expiry. It reserves the callback before asynchronous validation, rejecting concurrent/duplicate returns; failed PKCE attempts require a new handoff. `dispose()` aborts pending validation and permanently closes it.

The result is a privately held authorization code for the selected backend exchange; it confers no identity or wallet privilege. The transport/backend must bind state/challenge, exchange the code exactly once with the same verifier, validate issuer/audience/identity and prevent code substitution. This guard does not validate OS link ownership, securely persist cold-start state, launch the wallet, trust arbitrary WebView messages, exchange tokens or grant general native access.

The existing MAUI host blocks arbitrary navigation/popups. Do not bypass that boundary or add an unrestricted native bridge. A separately reviewed explicit transport must own app/universal-link registration, platform callbacks, secure handoff state, rejection, timeout, suspend/resume, cold return and account changes. Those real-device checks remain not-run in the baseline.

## Verification and primary references

Run `node --test tests/test-web3-wallets.mjs` after explicit provisioning of tests/fixtures/web3's exact lock. The suite uses actual viem2.57.16, solc0.8.28/Cancun, a disposable loopback Anvil and ephemeral test signing keys; it logs/stores no keys. Provider/native/nonce-store fixtures are deterministic boundary tests. They certify no public-chain deployment, browser wallet, native transport, device, production multi-worker session server or store eligibility.

Primary protocol references: [SIWE](https://eips.ethereum.org/EIPS/eip-4361), [provider events](https://eips.ethereum.org/EIPS/eip-1193), [ERC1271](https://eips.ethereum.org/EIPS/eip-1271), [ERC6492](https://eips.ethereum.org/EIPS/eip-6492), [EIP7702](https://eips.ethereum.org/EIPS/eip-7702), [wallet calls/atomic capability](https://eips.ethereum.org/EIPS/eip-5792), [PKCE](https://www.rfc-editor.org/rfc/rfc7636). Confirm current host SDK and chain behavior before production; protocol citations confer no audit or target acceptance.
