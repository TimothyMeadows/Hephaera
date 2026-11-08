# Web3 game assets

Hephaera supplies six original workflows, strict local policy inspection, reusable integration helpers and tested contract examples for games using Ethereum mainnet, Base or current Immutable Chain. The game owns its contracts, backend, wallet transport, engine code and production decisions. This is opt-in support, not a hosted wallet, marketplace subscription or a new visual pipeline.

These source changes require an installation pin containing them. A previously published package does not gain them without a reviewed version update. No new package release is implied by this feature.

## Choose the work

| Skill | Outcome |
| --- | --- |
| `plan-web3-game-assets` | Define asset identity, supply, rights, chain/service trust and game eligibility |
| `build-evm-game-contracts` | Author selected ERC721/ERC1155 contracts with reviewed libraries and explicit authority |
| `integrate-game-wallets` | Connect/authenticate selected wallets, handle changing authority and native handoff constraints |
| `verify-onchain-game-assets` | Verify exact canonical ownership and quantity, then evaluate game admission |
| `integrate-game-asset-trading` | Prepare exact unsigned trade intent and reconcile the selected settlement lifecycle |
| `verify-web3-game-lifecycle` | Collect contract, backend, wallet, game and actual target evidence without merging their claims |

Shared skills are engine agnostic. Resolve the current engine and compatible implementation owner before using engine APIs. Choosing Three.js, Phaser, Babylon.js or a native engine never selects Web3 automatically. ENGINE, ARCHITECTURE, STYLE, AUDIO/MUSIC/VOICE and Bubo retain their existing responsibilities.

## Configure a host deliberately

Read the shared [capability contract](../.web3/CONTRACT.md). Start from [the TCG policy example](../.web3/examples/tcg-spec.json), author a project-local `approved-web3.json`, and review the actual values. It contains no deployed collection and no endpoint or credential values. The declared wallet kinds are profiles to verify, not evidence that a wallet is connected or compatible.

From an installed host root:

```bash
bash .hephaera/commands/web3-game.sh registry
bash .hephaera/commands/web3-game.sh inspect
bash .hephaera/commands/web3-game.sh init --spec approved-web3.json
bash .hephaera/commands/web3-game.sh validate
bash .hephaera/commands/web3-game.sh doctor
```

`init` creates canonical `WEB3.md` and `web3-game.json` only when both are absent and the spec is structurally valid. It does not establish human design approval, connect a wallet, read credential values, install an SDK or contact a chain. Existing files and retained state-transition fences stop initialization. After an interrupted two-file initialization, inspect the original spec and exact files before reconciling them; an orphan JSON file is not active Web3 authority. Do not delete historical approvals or relabel another configuration to resume.

Use decimal strings for chain IDs, token IDs, quantities, blocks and payment units. The `asset` operation validates a file containing `chainId`, `contractAddress` and `tokenId` without number truncation. Policy collections name the registered chain, nonzero address, ERC721/ERC1155 standard, deployment block, exact reviewed runtime code hash and applicable operator policy. Confirm those declarations against actual chain code before using them. Empty collections allow planning, not admission of arbitrary assets.

The registry is a dated primary-source snapshot. It registers Ethereum1, Base8453 and Immutable13371 plus explicit development networks. It is not a live network probe. Refresh its compiler/EVM/operator/finality constraints before production; do not substitute another chain/provider after a failure. The current Immutable testnet is being deprecated for game use by end2026, and the future OP migration changes must be qualified when delivered. [Immutable current configuration](https://docs.immutable.com/docs/products/immutable-chain/overview), [migration](https://docs.immutable.com/docs/products/immutable-chain/op-stack-migration).

## Integrate through explicit host ports

Optional `.web3/runtime/` modules are plain JavaScript without automatic SDK import, provider discovery, global network request or server startup. Import them explicitly into reviewed host code. Trusted verifier/RPC/settlement/storage callbacks belong to the application, never an untrusted recipe or NFT metadata.

| Module | Boundary |
| --- | --- |
| `wallet-session.mjs` | Explicit provider lifecycle, scoped authentication ports and fixed native-return validation; signing is a distinct selected operation |
| `ownership.mjs` | Canonical chain/code/owner checks, lossless asset identity and explicitly scoped reservation/projection utilities |
| `trading.mjs` | Exact unsigned terms and a selected settlement adapter's lifecycle/reconciliation; no generic exchange implementation |

Use the individual skills' references for exact exported APIs and caller obligations. Browser helpers can support Three.js/Babylon.js/Phaser applications without requiring React or another UI framework. Unity/Unreal/Godot need their selected native/backend transport and SDK evidence; do not import browser globals into them. In-memory coordination is limited to one process and does not replace durable authoritative host storage or distributed locking. Pure event projection is not a running durable indexer.

The optional verifier ports must use the selected account's real signature semantics. SIWE is session authentication; it is not proof of token ownership. EIP1271, counterfactual EIP6492 and delegated EIP7702 accounts need tested support or explicit unavailable results. Do not assume code presence proves a conventional contract wallet, or that an EIP7702 account necessarily supports EIP1271. No raw delegation authorization is part of the game-facing default. [SIWE](https://eips.ethereum.org/EIPS/eip-4361), [account delegation](https://eips.ethereum.org/EIPS/eip-7702).

## A trading card example

A card definition holds approved art and versioned game rules. An ERC721 token represents one individually identifiable card; ERC1155 can represent quantities of an interchangeable edition. Identify each asset by chain, collection and token ID, with an explicit quantity. An approved operator is not automatically its owner, and token ownership does not transfer copyright.

The player authenticates wallet control. The backend reads the approved collection at a canonical block, checks ownership and fresh quantities, then applies the current deck rules and reservation policy. Counterfeit collections with matching names/art are rejected. Chain reads that fail or are stale remain unavailable, rather than becoming a zero balance or a pass.

Choose what happens after a mid-match sale. A bounded snapshot license may let the seller finish an admitted match; disclose whether the buyer waits or may overlap. A server reservation cannot prevent external transfers. Strict exclusive use requires actual reviewed contract locks/escrow, compatible operators and safe recovery; the memory reservation helper reports that profile unavailable. It does not silently take custody.

For a sale, the chosen protocol must atomically exchange the exact assets/payment, enforce current balances/approvals, consume or cancel order identities and handle expiry. A typed EIP712 signature alone does not prevent replay. The generic coordinator prepares and reconciles a trusted selected adapter; it is not Seaport or an audited marketplace. Choose and verify the actual settlement implementation separately. Do not replace it with two independent payment/NFT transfers. [EIP712](https://eips.ethereum.org/EIPS/eip-712), [Seaport source](https://github.com/ProjectOpenSea/seaport).

Preserve intent and operation identity before external effects. A timeout, lost response or local cancellation after submission does not reverse a transaction or signed order. Reconcile exact hashes, canonical receipts, replacement and fill/cancel state before retry. Replay missed events, undo orphaned history and reconcile against current contract state before granting new admission. Keep private hands and authoritative match state off-chain unless a separate hidden-information design is explicitly selected.

Art/model/audio production still follows its existing pipelines and review controls. Remote metadata needs bounded isolated fetching and safe rendering; a URI is not permission to execute code, change the rules catalog or promote an unreviewed asset. Content hashes also need an availability/retention plan.

## Immutable and optional services

Current Immutable Chain has different present assurances from its planned Ethereum rollup migration. Its documented ecosystem requires compatible operator restrictions for collections. Custom crafting/escrow/marketplace/wallet operators may need managed allowlist approval; a mock registry or local test is not that approval. These are documented ecosystem and contract requirements, not proof that every nonconforming contract is rejected by consensus. [Operator policy](https://docs.immutable.com/docs/products/asset-contracts/operator-allowlist).

Passport, managed minting/indexing, sponsored gas and the centralized Immutable orderbook are optional products with separate accounts, authority and availability. Direct chain reads do not require adopting those services, but self-hosted reads do not eliminate Immutable's documented submission/production dependencies. Passport is not a universal Base/Ethereum wallet. Its orderbook's soft cancellation can leave issued fulfillment pending; use its actual on-chain cancellation semantics when needed. [Passport](https://docs.immutable.com/docs/products/passport/architecture), [order cancellation](https://docs.immutable.com/docs/products/orderbook/cancel-orders).

## Targets and release

The current MAUI host blocks popups/external navigation and provides no arbitrary JavaScript-to-native bridge. A return-state helper alone does not launch a wallet or certify a package. Implement a constrained explicit transport, validate origin/redirect/state and test actual cold/warm return, account changes, suspend and duplicate callbacks on each claimed device. Preserve normal packaging ownership and signing gates.

Distribution can conflict with the game's design. Apple's current rules restrict NFT ownership from unlocking app functionality; Steam excludes NFT issuance/exchange applications; Google Play has NFT/payment/declaration and gamification rules. Recheck the actual region/channel, and report conflicts instead of claiming a compiled package is release-ready. [Apple](https://developer.apple.com/app-store/review/guidelines/), [Steam](https://partner.steamgames.com/doc/gettingstarted/onboarding), [Google Play](https://support.google.com/googleplay/android-developer/answer/13607354?hl=en).

## Reproduce the local source checks

Maintainer commands from the baseline root, after explicit tool installation authorization:

```bash
npm ci --ignore-scripts --no-audit --no-fund --prefix tests/fixtures/web3
node --test tests/test-web3-policy.cjs tests/test-web3-contracts.mjs tests/test-web3-wallets.mjs tests/test-web3-ownership.mjs tests/test-web3-trading.mjs tests/test-web3-integration.mjs
```

The lock pins the SDK/compiler/library/Anvil fixture. The tmp override retains compatible solc0.8.28 while using the patched transitive helper; refresh audit evidence when dependencies change. Tests bind disposable EVMs to loopback, use no real-fund accounts and confirm process cleanup. They test the exact compiled examples, account verification and host helpers, not actual public Ethereum/Base/Immutable deployment, native wallets, managed operator approval, production security audits or store acceptance. Source verification and dependency audits establish different claims from contract correctness.

Public-chain signing, deployment, minting, administration, approvals/payments, paid/hosted services, bridges, asset promotion and release/publication remain separate authorized host operations. Web3 setup grants none automatically.

The [acceptance coverage map](WEB3_ACCEPTANCE.md) connects the22 TCG cases to actual local checks and required external host/target evidence.
