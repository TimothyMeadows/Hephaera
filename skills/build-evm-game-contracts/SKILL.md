---
name: build-evm-game-contracts
description: Author and verify host-owned EVM game collections and explicit mint, burn, craft or admin rules with pinned Solidity tooling. Use for contract source and deployment candidates; deployment and player signing require separate authorization.
engines: [AGNOSTIC]
---

# Build EVM Game Contracts

## When to use

Use for ERC721/ERC1155 game collections and contract-owned supply, identity, permissions or asset transformations. Wallet login, inventory admission and order submission have separate owners. A collection request does not select an economy, paid packs, upgrade proxies or a marketplace.

## Workflow

1. Resolve engine/skill compatibility and the host architecture. Read the host `WEB3.md`, `web3-game.json` and `.web3/CONTRACT.md`; absent or unresolved chain policy remains unconfigured. Solidity source needs `.architecture/SOLIDITY.md` support even when host services use .NET or Node. Preserve engine and media selections.
2. State the proposed invariants before authoring: standard and exact asset identities; lifetime versus circulating supply; ID reuse; ERC1155 interchangeable quantities; mint/result authority; holder versus operator burns; metadata rights/mutation; royalties; admin succession and recovery. For crafting/upgrades, define each atomic input/output and replay/claim identity. Missing authority is a design gap, never a guessed reward oracle.
3. Read `.web3/contracts/README.md` when using the original bounded examples in `.web3/contracts/`. Adapt them into a reviewed host-owned source directory. Keep imported reviewed libraries and licenses intact. Record exact dependency/compiler/settings identities; the tested baseline is OpenZeppelin 5.6.1 with Solidity 0.8.28, optimizer 200 and Cancun. Revalidate these pins against the selected chain rather than silently upgrading.
4. Select transfer policy explicitly. Unrestricted standard tokens and the optional registry profile have different compatibility. For Immutable, verify the actual managed allowlist/code identity, current policy and every wallet/settlement/escrow operator. A synthetic registry, ABI compatibility or registry declaration cannot prove approval. A blocked operator requires direction or a reviewed compatible design.
5. Compile actual source and execute disposable local-EVM transactions for each changed invariant. Cover unauthorized mint/admin/burn, cap exhaustion through burns, repeated identity, quantity/duplicate batches, approvals/revocation, callback reentry and rollback, and the selected operator rejection paths. Review warnings and bound callbacks/loops. The baseline test is `node --test tests/test-web3-contracts.mjs`; provision tools explicitly under existing authorization before running it. Do not install tooling or contact a chain during policy inspection.
6. Prepare a candidate with exact source/dependency/compiler input, ABI and bytecode identities, constructor/role/registry configuration and test results. Obtain independent review of source and deployment assumptions. Report public-chain, registry, wallet/device, audit and target evidence separately. Broadcast only when separately authorized for the exact chain and operation.

## Output

- Host-owned source and explicit invariants, authority and unsupported behavior.
- Reproducible pinned compilation, local successful/reverting transaction evidence and resolved review findings.
- An identified deployment candidate and target-specific prerequisites; local readiness does not imply a deployed or audited collection.

## Boundaries

ERC-2981 reports royalties without universally enforcing them. Metadata grants no copyright or gameplay trust automatically. Token approvals are durable transfer authority, not login or burn permission. Ordinary public contract state cannot hide hands, decks or secrets.

The example sale/receiver/registry harness under `.web3/contracts/test/` is unrestricted test code. Never promote it as production settlement or deploy it with real value. A single atomic rollback test certifies no protocol, order replay policy, custom exchange or cross-chain trade. Escrow/strict locks, proxies, economics and externally authorized crafting/rewards require their own reviewed designs. No live deployment, player key, hosted service, license acceptance or paid action follows from selecting this skill.
