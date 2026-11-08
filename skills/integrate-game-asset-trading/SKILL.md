---
name: integrate-game-asset-trading
description: Integrate explicitly selected game asset settlement with exact unsigned intents, scoped approvals, idempotent operations and canonical receipt reconciliation. Use for NFT listing, buying, cancellation, retries or marketplace integration.
engines: [AGNOSTIC]
---

# Integrate Game Asset Trading

## When to use

- Preparing an explicitly selected marketplace or atomic settlement integration.
- Reviewing listing/payment/approval scope or handling stale fulfillment.
- Recovering uncertain, replaced, reverted, orphaned or locally cancelled operations.

## Workflow

1. Resolve skill/engine compatibility; read host Web3 policy, architecture, shared `.web3/CONTRACT.md`, dated registry and approved collection/operator definitions. Select a concrete reviewed protocol/SDK version, settlement chain/address/code/ABI, permitted payment semantics and optional services. Missing selection is unavailable. No universal exchange, Seaport, Immutable orderbook or Passport dependency is implied.
2. Review the actual protocol's replay protection: signing domain/chain/settlement/version, order nonce/counter, cancellation, consumption and atomic fill/overfill rules. EIP712 encodes typed data; it supplies neither one-use consumption nor an audited marketplace. Contract deployment, source verification and dependency audits do not constitute a production security audit.
3. Prepare exact unsigned terms using `.web3/runtime/trading.mjs`: exact asset identity/quantity, maker/taker, settlement, integer payment/token/decimals, explicit fees/recipients, expiry and nonce. `prepareTradeIntent` is a review description, not an executable order. Pin the selected trusted host adapter that creates exact calldata and order identity, checks real protocol signatures/domain/nonce/remaining quantity/ownership/approval/payment/operator state, and simulates settlement at a canonical fresh block. Unsupported token economics, royalties or wallet envelopes stay unavailable.
4. Present login, listing signature, token/operator approval, payment and broadcast as separate user decisions. Show actual broad ERC1155/ERC721 operator scope; disconnect does not revoke it. The helpers never request a signature or send. Only the selected host SDK may perform the exact authorized action after applicable authorization; no keys enter this baseline.
5. Persist an operation identity and exact input fingerprint transactionally before an external side effect. The bounded `createMemoryTradeCoordinator` demonstrates single-process idempotence and direct-transaction state transitions only. It reserves one selected order/taker identity for that coordinator's lifetime; repeated partial fills require a separately reviewed host design. `refresh` rechecks a prepared/blocked operation before any submission. It is not durable, distributed, a wallet, a relayer, a protocol implementation or production recovery service. A host must supply its transactional store/outbox and restart reconciliation. Do not generate a fresh operation ID to retry an uncertain purchase.
6. Recheck order state and approvals immediately before submission. Record sender/nonce/transaction hash when known. A timeout becomes unknown; reconcile the same operation/hash/nonce/order before considering a retry. A trusted adapter may discover a replacement only for that exact submission identity. The helper verifies actual transaction sender/recipient/calldata/value/nonce, canonical receipt/block and selected finality, then requires protocol-specific interpretation of matching fill/payment/asset events. Transaction success alone is not a trade. Smart-account user-operation envelopes need separately reviewed integration and are unsupported here.
7. Keep submitted, included, policy-confirmed, reverted, replaced, orphaned, unknown and local cancellation outcomes distinct. After submission local cancellation stops local work only. Orderbook deletion/soft cancellation may leave a signed fulfillment executable; obtain the protocol's hard-cancellation receipt when requested, and reconcile it. This helper provides no chain cancellation action. Reorgs remove settlement credit and trigger the declared inventory/admission recovery policy.
8. Test competing/duplicate orders, insufficient quantity, consumed/expired/wrong-domain orders, revoked approvals, transfer-away, insufficient payment, fee recipients, callback attacks, timeouts, replacements, interruptions and reorgs. Use actual selected-protocol settlement tests before claiming atomic purchase/overfill protection. Helper port tests do not establish marketplace security; local EVM receipts do not establish public-chain or wallet/device acceptance. Keep art/mint/publication permissions separate.

## Output

- Exact unsigned intent and selected protocol/SDK/code identity, with explicit capabilities and approval scope.
- Durable host operation/reconciliation design and actual test evidence, including unavailable profiles.
- Independent review and separate target/runtime/user acceptance requirements.

## Guardrails

No signing, payments, approvals, public-chain transactions, deployment, hosted service connection, installation, publication or fallback follows from selection. Separate asset/payment transfers cannot substitute for atomic settlement. No bridge, speculative economy, paid randomness, custody or financial automation is selected. Honor current Immutable operator requirements and selected store restrictions; compilation establishes neither eligibility nor wallet compatibility.
