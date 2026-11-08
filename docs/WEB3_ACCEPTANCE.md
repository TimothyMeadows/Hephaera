# Web3 evidence coverage

This map separates executable local evidence from requirements that need an actual host, public network, wallet/device, service or release decision. It is not a production security audit or certification of every supported chain. The exact source/tool/OS/test result belongs in the task or CI receipt, not a permanent assertion about future versions.

The shared `tests/fixtures/web3/package-lock.json` pins the explicitly installed SDK/compiler/library/local-EVM toolchain. Tests import no user keys and connect only to disposable loopback instances. A local instance configured with chain ID1,8453 or13371 remains local, not public Ethereum/Base/Immutable evidence.

| Case | Local evidence owner | Remaining boundary |
| --- | --- | --- |
| TCG-001 counterfeit collection/chain | `test-web3-policy.cjs`, `test-web3-ownership.mjs` identity and registered-code refusals | Actual approved public deployments and code/proxy identities |
| TCG-002 login versus inventory | `test-web3-wallets.mjs`, `test-web3-ownership.mjs` separate auth, stale/unavailable ownership and quantities | Live RPC/indexer completeness and production admission authority |
| TCG-003 replayed authentication | Real SDK signatures, scoped nonce/origin/session/URI/chain/time tests | Durable multi-worker nonce store and selected wallet |
| TCG-004 smart/delegated authority | Real local deployed ERC1271, EOA signatures, authority-change tests; unsupported6492/7702 results | Selected counterfactual/delegated verifier implementation and target evidence |
| TCG-005 quantity/concurrent queues | Serialized single-process reservation and repeated match-ID tests | Durable distributed game authority and recovery |
| TCG-006 sale during a match | Snapshot seller/buyer rules and explicit strict-lock unavailability | Production lock/escrow/operator/custody design if exclusive use is selected |
| TCG-007 competing sales/atomicity | Actual test-only atomic sale/rollback plus selected-adapter refusal cases | Real reviewed marketplace consumption/order/overfill enforcement |
| TCG-008 stale approval/order | Actual collection approval revocation and selected-adapter expired/cancelled/filled refusals | Selected settlement protocol and live-chain fulfillment |
| TCG-009 order replay/domain | Exact unsigned chain/terms, order identity and coordinated replay guards | Actual selected EIP712 signer/verifier and on-chain order consumption; no generic exchange supplied |
| TCG-010 cancellation after submission | Coordinator retains uncertainty and observed effects rather than claiming chain reversal | Actual protocol hard/soft cancellation and wallet behavior |
| TCG-011 interruption/retry/replacement | Idempotent operation IDs, exact receipt checks, bounded validated replacement ancestry and retained uncertainty | Durable restart recovery, nonce authority and actual RPC/wallet replacement |
| TCG-012 reorganization/events | EIP1898 hash-bound reads, ABA/finality failures, local snapshot reverts and pure backfill/rollback projection | Actual target chain assurance and durable indexer infrastructure |
| TCG-013 integers/payment semantics | Full uint256 identity, quantity and exact integer/payment fields | Actual supported payment-token behavior and selected protocol validation |
| TCG-014 callbacks/reentry | Actual local mint callback, receiver refusal, role and rollback tests | Full host contract composition, selected exchange and independent production audit |
| TCG-015 malicious metadata | Skills preserve approved rules/media authority; local policy imports no remote metadata or code | Host's bounded isolated fetch/renderer and actual malicious-content tests; no general fetcher supplied |
| TCG-016 changed authority/code/policy | Root policy snapshot/array regressions, account changes and code/hash mismatch refusals | Exact host proxy/operator/admin migration and affected approval refresh |
| TCG-017 Immutable dependency unavailable | Synthetic operator rejection/outage, no silent provider fallback and explicit optional-service policy | Actual managed allowlist approval, SDK/service operation and migration qualification |
| TCG-018 wallet/package lifecycle | Provider deadline/late-result/disposal and exact native-return-state tests | Real native transport, OS callback ownership, devices and packaged-engine lifecycle |
| TCG-019 cross-chain duplicate/bridge | Chain-scoped identity and wrong-chain refusal; no implied shared supply | Separately selected bridge/messaging/canonical supply and replay design |
| TCG-020 hidden match information | Skills explicitly separate public contracts from private authoritative match state | Any separately selected fully on-chain secrecy/randomness design |
| TCG-021 reward/crafting claims | Actual role/cap/burn primitives and required authority/idempotence guidance | Host's result oracle, claim/craft/reward contracts and replay properties; not invented by templates |
| TCG-022 actual target/release | Local policy exposes current declared Apple/Steam conflicts; documentation distinguishes evidence layers | Actual chain/wallet/device QA, fresh distribution policy, audit and independent/human release acceptance |

`test-web3-integration.mjs` combines actual collection resources, wallet authentication, canonical ownership/admission, a clearly labeled test-only settlement and post-transfer/reorg reconciliation on three local chain-ID contexts. It strengthens integration evidence while retaining all public-network, managed-registry and production-marketplace limitations above.

Review contract warnings and library/compiler identities, and run useful stateful/property tests for a host's changed rules. The shipped finite scenarios are not exhaustive fuzzing or a formal proof. Source verification, dependency audit, unit/fixture tests, independent source review, actual execution and human acceptance remain distinct claims.
