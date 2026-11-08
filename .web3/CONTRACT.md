# Web3 game capability contract

Web3 is opt-in and independent of ENGINE, ARCHITECTURE, STYLE and visual/audio/media pipelines. It is never selected by choosing Three.js or another engine. Read the host WEB3.md and web3-game.json only for relevant work. An absent contract means unconfigured, not Ethereum by default.

## Policy shape

web3-game.json is strict JSON with schemaVersion hephaera-web3/v1. Unknown fields and credential values are not accepted.

| Field | Meaning |
| --- | --- |
| chains | One or more exact keys from the dated .web3/chains.json registry |
| origin | Exact HTTPS game authentication origin, without path or credentials |
| matchPolicy | snapshot-license or strict-lock; no implicit custody |
| ownership | maxAgeSeconds, blockTag latest/safe/finalized, and rpcEnvironment mapping selected chain names to environment variable names only |
| walletKinds | Explicit eoa, erc1271, erc6492 and/or eip7702 profiles; declaration is not readiness |
| collections | At most128 explicit keys, chains, nonzero addresses, ERC721/ERC1155 standard, decimal deploymentBlock, reviewed runtimeCodeHash and operatorPolicy |
| services | Explicit optional passport, immutable-orderbook, hosted-indexer, paymaster or wallet-relay; empty is supported |
| distribution | channel and nftUnlocksGameplay; current policy conflicts remain blocked/unverified |

Collections identify runtime code by nonzero 0x-prefixed32-byte keccak256. This declaration must be compared with actual canonical chain code by the host adapter; syntax validation alone proves no deployment. Proxy implementation/admin identities and changes need additional reviewed evidence. Collection addresses and token IDs on different chains never imply one asset.

## Commands

From the installed host root, use bash .hephaera/commands/web3-game.sh. registry reads the shared dated definitions. inspect and doctor inspect only local policy. validate rejects malformed/unconfigured policy. init --spec reviewed-spec.json creates WEB3.md and web3-game.json once without overwriting either. asset --input identity.json validates chainId/contractAddress/tokenId with lossless decimal strings. Explicit --root selects a confined test/host root; normal invocation resolves it canonically.

These commands import no SDK, inspect no wallet, read no credential environment values, contact no network, build/deploy no contract and submit no transaction. They do not create a server or custody account. Doctor distinguishes declarations from verified live prerequisites. Init is explicit and refuses retained legacy transition state. Preserve the original reviewed spec and its authorization separately from merely creating files.

## Runtime and tools

.web3/runtime contains narrow optional integration helpers. Import them explicitly into reviewed host code and supply trusted wallet/RPC/verification/persistence ports. No recipe may inject executable functions. A test callback is not a real-chain or real-wallet result. Bind the actual host dependency lock and SDK version, current policy, code/ABI and selected chain at execution.

Do not execute remote NFT metadata or download an SDK during a normal operation. Provision required tools separately under existing authorization. The baseline's tests/fixtures/web3 pins a local test toolchain and is not a runtime installation. Its Anvil instances bind loopback and contain disposable test accounts only. Never use development accounts/keys on a public chain.

## Authority and game state

Authenticate wallet control, establish chain ownership and evaluate gameplay entitlement separately. Read exact chain/address/token quantities at a canonical block under the declared freshness policy. Preserve unknown/unavailable/stale results. Reorg, account/delegation, code, configuration and rules changes invalidate affected evidence. Index events with backfill, deduplication, rollback and state reconciliation.

The game owns match state and any server reservation authority. A snapshot-license may permit the seller to finish an admitted match after sale, with explicitly disclosed buyer overlap/wait rules. A server reservation cannot prevent external transfer, especially for interchangeable ERC1155 units. Strict exclusive use needs a reviewed contract lock/escrow and recovery policy, including actual compatible operators; no helper converts a snapshot into that guarantee.

User signing, approvals, listings, payments and broadcasts are distinct authorizations. Prepare exact unsigned intent and state-bound simulation first. Typed EIP712 data is not replay protection. After submission, a timeout or local cancellation does not reverse chain effects. Reconcile prior hashes/order identity before retry. Disconnect does not revoke existing transfer authority.

## Chain and target differences

Honor the selected Ethereum L1, Base L2 or current Immutable network. Refresh the dated registry facts against primary sources before production; never substitute another provider/chain silently. Immutable X is retired. Current Immutable13371 has different present assurances from its planned OP migration, compiler/EVM limits and ecosystem operator requirements. Optional Passport and central orderbook are not universal wallet/market dependencies. Unsupported operators/services remain unavailable rather than bypassed.

Use selected-engine integration owners. Browser provider injection does not establish packaged MAUI/native support. Existing MAUI navigation/pop-up restrictions remain; use a reviewed narrow external handoff rather than an unrestricted native bridge. SDK/device prerequisites and actual return/suspend/identity behavior must be verified per target. Apple NFT unlock rules and Steam NFT exchange restrictions can block a selected distribution channel; recheck current regional policies rather than claiming eligibility from compilation.

## Evidence and publication

Bind exact spec, source, tool/SDK/dependency, chain, code/ABI, account, block/hash, input/output and operation identities. Keep technical, independent, human and actual runtime acceptance separate. Public identifiers may be sensitive when linked to player identities: minimize logs and keep secrets/signatures/private-session material out of task memory and public artifacts. Source verification, library audits and local tests are not a production contract audit.

Art/model/media licensing, output review and promotion retain their existing owners. A token grants no copyright automatically, metadata is not a trusted game ruleset, and minting is not asset promotion. Hosted services, license acceptance, public-chain signing/deployment/minting/admin/payment, bridge, store and package publication need their own applicable authorization. No Goal/Gauntlet or financial automation follows from Web3 selection.
