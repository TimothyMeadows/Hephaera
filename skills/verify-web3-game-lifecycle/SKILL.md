---
name: verify-web3-game-lifecycle
description: Verify a game's selected Web3 asset, wallet, ownership and trading lifecycle with contract properties, canonical recovery, actual target evidence and separate release readiness.
engines: [AGNOSTIC]
---

## When to use

Use when reviewing or preparing a Web3 game integration for a concrete host, target or release. A completed manifest, local EVM test or explorer badge does not establish a production audit or device acceptance.

## Workflow

Resolve the host Web3 policy and selected engine. Read `.web3/CONTRACT.md`, the exact host dependency/tool locks, deployed code/ABI identities and applicable source reviews. Use local `commands/web3-game.sh doctor` to expose declared/unverified prerequisites without connecting services or installing tools.

Select relevant claims from [the lifecycle evidence checklist](references/lifecycle-evidence.md). Test meaningful state sequences across multiple actors, including unauthorized changes, callbacks, transferred inventory, competing purchases, replay, cancellation, replacement, reorganization and interrupted reconciliation. Preserve counterexamples; a suite that only reverts or repeats getters does not prove supply/settlement invariants.

Use explicitly provisioned local compiler/EVM tools for reproducible algorithm tests, then the separately authorized selected chain/wallet/target. Local forks and supplied callbacks have limits; label them accurately. Verify signer/caller restrictions in actual code and refresh evidence after relevant proxy, account/delegation, operator, registry or configuration changes.

Review the full user flow with the selected engine owner: wallet choice, chain/account changes, exact intent, rejection/timeout, lifecycle and cleanup, truthful ownership, match eligibility and trade outcomes. Browser evidence cannot certify a packaged MAUI/native return flow. Check the actual distribution channel's current NFT/payment rules before release.

## Output

Return the exact source/configuration/tool/chain/target identities and an acceptance matrix with actual evidence, unknowns and independent findings. Keep contract correctness, bytecode correspondence, chain assurance, wallet/device QA, game quality, human acceptance and public release separate. Do not turn unavailable evidence into a simulated pass or inherit permission for signing, deployment, fees or publication.
