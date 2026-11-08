# Bounded game collection examples

These original resources demonstrate collection rules around imported standard token implementations. They are candidates for host adaptation and independent review. They are neither audited deployments nor a production trading system. See `.architecture/SOLIDITY.md` and `.web3/CONTRACT.md` before adapting them.

## Reproducible toolchain

The explicit local test fixture pins `solc` 0.8.28, `@openzeppelin/contracts` 5.6.1, `@foundry-rs/anvil` 1.7.1 and `viem` 2.57.16 in `tests/fixtures/web3/package-lock.json`. Compilation uses exact `pragma solidity 0.8.28`, optimizer enabled with 200 runs and `evmVersion: cancun`. Imports retain the installed OpenZeppelin MIT headers and licenses; this directory does not vendor or rewrite the library.

Under already applicable tool-installation authorization, install the fixture explicitly with `npm ci --ignore-scripts --prefix tests/fixtures/web3`. Run `node --test tests/test-web3-contracts.mjs` from the maintainer checkout. The fixture requires a supported platform binary; it reports unavailability instead of downloading a tool during tests. Ordinary Web3 inspection imports none of these tools.

For a host candidate, preserve the exact Standard JSON compiler input, complete resolved dependency sources and lock, compiler binary identity, warnings, ABI, creation/runtime bytecode and their hashes. Include constructor arguments, intended chain, registry/code identities and role addresses. A successful local compile does not establish that the selected public chain accepts or operates the candidate correctly. Recheck current chain compiler/EVM constraints before a separately authorized deployment.

## Rules and interfaces

Both constructors take distinct nonzero `admin` and `minter` addresses. The deployer has no automatic privilege unless explicitly selected. The initial admin can grant/revoke `MINTER_ROLE`; minters cannot administer roles. OpenZeppelin `AccessControlDefaultAdminRules` provides one default admin and a two-step, initially two-day delayed admin transfer. The admin can schedule a delay change through the inherited API. Role administration can later combine privileges; initial separation is not a permanent separation-of-duty guarantee. Production role ownership and key recovery are host decisions.

Metadata is fixed after construction: ERC721 stores a base URI and ERC1155 an `{id}` URI template. These references do not make externally hosted content immutable or trusted game rules. ERC-2981 receiver and basis points are set once. A 500-basis-point royalty reports 500 units for a sale price of 10000; transfers do not enforce that payment. No public royalty/URI setter, upgrade mechanism, pause, fee, paid mint, currency, reward claim or hidden game state is included.

| Resource | Issuance and destruction |
| --- | --- |
| `GameItems721.sol` | `mint(to)` requires `MINTER_ROLE`, returns a monotonically increasing ID starting at 1, and consumes immutable `lifetimeCap`. `totalMinted` never decreases; `circulatingSupply` tracks unburned identities. `burn(tokenId)` requires the current holder. Approved operators can transfer but cannot burn another holder's identity. Burns never permit remint or ID reuse. |
| `GameItems1155.sol` | Constructor fixes up to 128 distinct ID/cap definitions. `mint(to,id,quantity,data)` and `mintBatch(to,ids,quantities,data)` require `MINTER_ROLE`. `mintedEver(id)` consumes a lifetime cap, including repeated IDs within a batch. Quantity must be positive for minting. `burn(id,quantity)` burns the caller's units; a zero burn is the library's harmless zero-value event semantics. Per-ID `totalSupply(id)` tracks circulating units. Units of the same ID are interchangeable and have no serial identity. |

Both contracts reserve issuance before safe-mint callbacks and reject nested mint calls using the library's storage-based guard. Other ordinary holder operations may run during callbacks; a receiver may transfer or burn its own newly received asset. There is no post-callback assumption that the recipient still owns it. Rejected callbacks roll back issuance, balances and events. ERC1155 mint and transfer batches are capped at 128 entries; duplicate IDs are counted in order and consume the same cap. Smaller host budgets can be necessary for actual gas limits.

## Optional operator profile

Passing a zero registry selects the unrestricted standard profile. Passing a nonzero registry fixes its address for the life of the collection and requires deployed code plus ERC165 support for `isAllowlisted(address)`. This is an explicit constructor choice, never a fallback after an ecosystem restriction fails.

The interface-only profile is shaped for the documented Immutable operator registry ABI: contract approval participants and transfer caller/source/recipient must be allowed by the selected registry. A mediated transfer call from a contract under construction also requires registry permission. EOA allowances follow the documented profile; `tx.origin` only distinguishes mediated construction calls and never grants token authority. Deployed delegated-account code may therefore require registry approval. Rules also apply to contract mint/burn participants. Registry reverts fail the restricted operation. Approval clearing/revocation remains available even when an operator is delisted or the registry is unavailable; it does not make transfers from a restricted holder available.

The tests use `SyntheticOperatorRegistry` to exercise these API boundaries. They establish no actual Immutable managed registry address, code/proxy identity, live response, operator approval, collection eligibility, Passport compatibility or settlement compatibility. Immutable manages its ecosystem registry and operator additions. A host targeting that ecosystem must verify the actual registry, current policy and every wallet/escrow/settlement operator before claiming compatibility. The sample registry is not a replacement for the managed registry. Registry code or governance may change even though its address here is immutable; that trust remains external.

Primary references reviewed 2026-11-08: [Immutable operator policy](https://docs.immutable.com/docs/products/asset-contracts/operator-allowlist), [registry interface](https://github.com/immutable/contracts/blob/main/contracts/allowlist/IOperatorAllowlist.sol), [OpenZeppelin token APIs](https://docs.openzeppelin.com/contracts/5.x/api/token/erc721), [ERC-1155 APIs](https://docs.openzeppelin.com/contracts/5.x/api/token/erc1155), and [ERC-2981](https://eips.ethereum.org/EIPS/eip-2981). Moving reference URLs are research context, not pinned deployment dependencies or an approval receipt.

## Evidence and excluded authority

`tests/test-web3-contracts.mjs` compiles the resources and executes actual successful and reverting transactions on fresh loopback Anvil instances. It covers unauthorized mint/role changes, delayed admin succession, lifetime caps, ERC721 identity after burns, owner/approval checks, revocation, royalty information, ERC1155 duplicate quantities, callbacks/reentrancy, rejected receiver rollback and operator delisting/outage. `test/ContractProbe.sol` contains unrestricted synthetic controls intended only for those disposable tests; never copy or deploy that harness as game code.

Its `TestOnlyAtomicSale` transfers an NFT then pays a synthetic seller. A rejecting seller rolls back both effects; a later successful call transfers and pays; another purchase cannot reuse the sold asset. This illustrates single-transaction EVM rollback. The harness has no production listings, prices, order signatures/nonces, fees, cancellation, reentrancy defense or exchange authorization and must not be exposed to players or real value.

The suite is finite scenario coverage. It is not fuzzing, a security audit, live-chain verification or economic analysis. Crafting/upgrades need explicit rules and atomic burn/mint invariants; rewards need result authority, idempotent claim identity and replay protection. Strict match locks/escrow need a separately reviewed implementation and recovery policy. None is supplied by transfer approvals or these examples. Public deployment, player signing, funded transactions, admin changes and publication need their own applicable authorization.
