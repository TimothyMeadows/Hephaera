# Web3 game asset reference

Hephaera's Web3 capability is opt-in support for Ethereum mainnet, Base and current Immutable Chain. It provides original skills, a dated chain registry, strict local policy commands, optional integration helpers and tested contract examples. Host-owned contracts, signing, backend, indexer, engine code and production decisions stay in the game repository. No hosted wallet, marketplace or provider is selected automatically.

See the [practical guide](https://hephaera.com/docs/web3-game-assets/) for a short introduction and [the complete source guide](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/WEB3_GAME_SUPPORT.md) for interfaces, command examples and detailed boundaries. These source additions require an installation revision containing them; a previously published package does not change without an explicit reviewed update.

## Workflows

| Skill | Responsibility |
| --- | --- |
| `plan-web3-game-assets` | Asset lifecycle, source/license, supply, authority, chain trust and game eligibility |
| `build-evm-game-contracts` | Selected standards, reviewed libraries, explicit compiler/EVM and contract properties |
| `integrate-game-wallets` | Explicit provider, scoped authentication, account authority and selected native transport |
| `verify-onchain-game-assets` | Canonical ownership/code evidence, quantities, reservations and replay/reorg requirements |
| `integrate-game-asset-trading` | Exact unsigned terms, settlement adapter authority and truthful transaction recovery |
| `verify-web3-game-lifecycle` | Independent contract/backend/wallet/game/target evidence and release boundaries |

Shared skills declare AGNOSTIC. Resolve the selected engine's compatible implementation owners before calling APIs. Web3 does not replace ENGINE, ARCHITECTURE, STYLE, visual production, AUDIO/MUSIC/VOICE or Bubo. Art acceptance and token ownership remain different authorities.

## Contracts and commands

The host uses optional `WEB3.md` and canonical `web3-game.json`. The strict spec selects registered chains, an exact HTTPS origin, match policy, canonical block/freshness policy, RPC environment-variable names, supported wallet profiles, explicit collections, optional service names and distribution intent. Endpoint credentials and private keys never belong in these files.

Use `bash .hephaera/commands/web3-game.sh registry`, `inspect`, `validate`, `doctor` and explicit `init --spec approved-web3.json`. Initialization preserves existing files and refuses retained transition state. Incomplete initialization must be reconciled from exact reviewed source; orphan JSON cannot become active authority. `asset --input identity.json` validates lossless chain/address/token identity. These commands contact no network, inspect no wallet and sign or broadcast nothing.

The [shared contract](https://github.com/TimothyMeadows/Hephaera/blob/main/.web3/CONTRACT.md) and [policy example](https://github.com/TimothyMeadows/Hephaera/blob/main/.web3/examples/tcg-spec.json) define the maintained shape. Example collections are empty: no deployed collection is certified. A declaration or doctor result leaves native/runtime readiness unverified.

## Ownership and game rules

Authenticate account control, verify the exact chain/collection/token/quantity at a canonical block, then evaluate game eligibility. SIWE alone does not prove ownership; operator approval does not make the operator the owner. ERC721 distinguishes instances, while ERC1155 may hold interchangeable quantities. Preserve uint256 precision with integer strings.

Bind actual source/configuration/ABI/code, chain/account, block/hash, RPC/verifier trust and freshness. A hashed JSON receipt is not a self-contained storage proof. Failed or stale requests remain unavailable. Counterfeit collection names/art do not bypass the approved contract identity. Account/delegation, proxy/operator, policy and relevant chain changes require refreshed evidence.

Snapshot licensing and strict exclusive use differ. A server can reserve quantity within its own authority but cannot prevent an external transfer. Strict locks/escrow require actual reviewed contracts, compatible operators and recovery; the generic memory helper reports that profile unavailable. In-memory state is explicitly one-process coordination, not a durable distributed inventory service. Event projection needs authoritative host checkpoint/backfill/rollback and state reconciliation.

## Wallet and trading helpers

The optional [runtime modules](https://github.com/TimothyMeadows/Hephaera/tree/main/.web3/runtime) expose narrow explicit host ports, with no automatic SDK/network/provider discovery. Host callbacks are trusted application code, not executable recipe data. Session verification needs a durable atomic one-use nonce store and the actual selected account's signature semantics. Contract, counterfactual and EIP7702 delegated accounts require tested verification or an explicit unavailable result. Delegation can persist after failed execution; raw delegation authorization is not the default game flow.

The generic trade coordinator normalizes unsigned exact terms and reconciles the selected adapter's observed state. It is not Seaport, an implemented exchange or a contract audit. The actual protocol must enforce atomic asset/payment settlement, replay/consumption/cancellation, expiry, current balances/approvals and applicable fees. Independent payment/NFT transfers do not provide that guarantee. A local cancel, deleted listing or timeout does not necessarily cancel chain execution or an executable signature. Reconcile before retrying.

## Immutable and target differences

The [dated registry](https://github.com/TimothyMeadows/Hephaera/blob/main/.web3/chains.json) records Ethereum1, Base8453, Immutable13371 and explicit test networks. Refresh primary sources before production. Current Immutable's local sidechain confirmation is not its planned future Ethereum proof-backed settlement. Preserve the compiler/EVM, testnet deprecation, operator-policy and migration distinctions.

Managed operator compatibility can constrain custom wallets, crafting, escrow and marketplaces. Optional Passport, mint/index services, gas sponsorship and centralized orderbook have separate authority and availability. They are not an implicit part of direct RPC support. A self-hosted reader does not remove chain production/ingress dependencies; a mock registry is not real operator approval.

The existing MAUI host blocks popups/external navigation and supplies no arbitrary native bridge. Native-return validation is a protocol utility, not an installed wallet transport. Verify actual launch/return, cold/warm state, origin, identity, suspend and cleanup on every claimed target. Native engine SDK evidence does not transfer to another engine or MAUI.

Apple's NFT ownership/functionality rules and Steam's issuance/exchange restriction can block the chosen game design; Google Play has additional blockchain/payment/declaration requirements. Follow the [current distribution references](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/WEB3_GAME_SUPPORT.md#targets-and-release) and recheck actual region/channel policy before release.

## Evidence and operations

The explicit maintainer [tool fixture](https://github.com/TimothyMeadows/Hephaera/tree/main/tests/fixtures/web3) pins viem, solc0.8.28, OpenZeppelin and Anvil. The source guide shows the exact test command. Disposable loopback-EVM tests establish contract/helper behavior, not public-chain deployment, live-wallet/device support, managed services, a production audit or store acceptance. Do not advertise a local instance using a production chain ID as an actual mainnet test.

Use an eight-column evidence matrix for exact source/tool/configuration and outcomes, retaining failures and missing external prerequisites. Keep contract correctness, verified deployed source, chain assurance, backend reconciliation, gameplay, independent/human acceptance and publication distinct. Secrets, raw signing material and private player identity must stay out of public evidence and durable memory.

Public-chain deployment/signing/minting/admin/payment, service accounts, paid calls, bridges, generated assets/promotion, stores and package releases require their own applicable authorization. The Web3 contract grants none automatically. See [work modes and delivery](Work-Modes-and-Delivery) and [web-game packaging](Web-Game-Packaging) for the surrounding controls.
