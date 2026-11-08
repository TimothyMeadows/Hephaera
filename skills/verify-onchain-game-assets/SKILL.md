---
name: verify-onchain-game-assets
description: Verify exact on-chain game collection ownership and quantities at canonical blocks, reconcile inventory events, and design honest match admission. Use for ERC721/ERC1155 inventory, reorg recovery, reservations, or transfer-during-match rules.
engines: [AGNOSTIC]
---

# Verify On-chain Game Assets

## When to use

- Establishing inventory or deck eligibility from explicitly registered EVM collections.
- Handling stale RPC data, counterfeits, quantities, missed/duplicate logs or reorganizations.
- Reserving game admission while distinguishing snapshot licenses from contract locks.

## Workflow

1. Resolve this skill and the effective engine with the canonical commands. Read host `WEB3.md`, `web3-game.json`, shared `.web3/CONTRACT.md`, architecture and current rules. Missing selection is unconfigured. Read registry facts and refresh primary-source chain/finality/operator facts before production. Do not install, connect or select a chain during inspection.
2. Bind exact chain ID, collection address, standard, runtime code hash, deployment block, ABI and configuration/rules versions. Review proxy implementation/admin identities separately. Match the token to a reviewed game definition; art, names, login, metadata and another chain's same address grant no entitlement.
3. Use the host's explicitly pinned trusted public client and keccak implementation with `.web3/runtime/ownership.mjs`. `createOwnershipReader` performs actual `getChainId`, policy-tagged `getBlock`, `getCode`, block-bound `ownerOf`/`balanceOf`, and canonical/freshness rechecks. Unsupported tags, missing IDs/reverts, unavailable RPC and changed code remain unavailable; never turn them into zero. Receipts declare trusted RPC assurance, not an independently checked storage proof. Record only minimized nonsecret evidence.
4. Use canonical ownership reads as admission authority. Index events for discovery, with bounded backfill, deduplication, explicit ancestor rollback and reconciliation. `createTransferCheckpoint` and `projectTransferBatch` transform host-validated decoded canonical logs only; seed balances and supplied blocks remain host trust. A host `TransferBatch` decoder expands the complete event with contiguous `itemIndex` values from zero while preserving its transaction hash and log index. Persist the complete new checkpoint atomically. The retained window is bounded; a deeper reorg requires a canonical rescan. Removed logs require a replacement canonical batch. This helper is not a durable indexer or ABI decoder; implement and review actual log acquisition/decoding before claiming inventory discovery.
5. Aggregate deck quantities, use lossless decimal uint256 strings, and read every asset on one canonical block per chain. Disclose the cross-chain admission window; no atomic multi-chain snapshot is implied. Revalidate ownership/account/code/configuration/rules after affected changes. Maintain game legality separately from balance.
6. Select and disclose the exact match policy. `snapshot-license` may let an admitted seller finish after sale; choose whether the buyer can overlap or waits. The bounded `createMemoryReservationManager` serializes concurrent admissions and rejects duplicate match conflicts/over-reservation only in that process. It has no persistence, restart recovery or distributed authority; production admission requires a host transactional durable store, deadlines, recovery and idempotency. Do not deploy this memory example as a multiplayer backend.
7. `strict-lock` requires reviewed contract escrow/transfer locking, operator compatibility, depositor attribution, quantity ownership, expiry and safe recovery. The supplied reservation helper returns unavailable for that profile. A server flag, snapshot receipt or boolean cannot prevent outside transfer or establish cryptographic proof. Do not take custody on Play.
8. Test counterfeit collections/chains, large IDs, zero versus unknown, ERC1155 quantities, concurrent/duplicate queues, sale during a match, reorgs, replay/backfill, authority/code changes and restart recovery. Actual local-EVM tests and pure-port tests have distinct evidence. Obtain independent review and actual host/runtime acceptance before claiming production readiness.

## Output

- Exact collection and ownership evidence with block number/hash, selected finality, freshness and trust limitations.
- Inventory checkpoint/recovery policy and atomic quantity admission design with disclosed buyer behavior.
- Test outcomes and explicit unavailable profiles, including strict-lock and unverified target/provider/device prerequisites.

## Guardrails

No implicit RPC/provider/service fallback, secret logging, remote metadata execution, bridge identity merge, copyright grant, custody, signing, broadcasting or asset promotion. Optional hosted indexers supply discovery unless explicitly reviewed for another role. Authentication, chain ownership, game entitlement, art rights and runtime acceptance retain separate authority.
