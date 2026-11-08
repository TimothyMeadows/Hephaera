# SOLIDITY.md

Use Solidity for EVM contract state and execution. C# and Node.js own host services, clients and test orchestration; neither replaces contract source. This template does not select a chain, wallet, engine or economic model.

## Contract boundary

- Pin the exact compiler, optimizer settings, EVM target and dependency lock together. The bounded Web3 examples use Solidity 0.8.28, Cancun and OpenZeppelin Contracts 5.6.1; do not silently upgrade for a target chain.
- Prefer reviewed standard implementations through ordinary imports. Preserve dependency licenses and exact source identities. Author application rules separately from standard token machinery.
- Declare mint authority, admin succession, lifetime and circulating supply, token identity reuse, burns, transfer restrictions and metadata mutation explicitly. Separate privileged actors; a minter does not gain role administration.
- Use checks and effects before external interactions, including token receiver callbacks. Bound arrays and account for duplicate IDs. Make callback failure roll back the entire operation.
- Royalties communicate payment information. ERC-2981 does not enforce payment on every transfer. Approvals grant transfer authority and can outlive a wallet session.
- No upgrade proxy, paid mint, reward oracle, crafting authority, escrow, trading settlement or delegation is implied by a collection template. Each addition needs its own invariants, permissions and review.

## Verification and release

Compile actual source and run adversarial transactions on a disposable local EVM. Cover access denial, callbacks/reentrancy, caps through burns, approvals/revocation, quantities and operator failures. Keep deterministic compiler input and ABI/bytecode hashes with the host's reviewed candidate.

Local execution does not verify a deployed registry, hosted service, public chain, native wallet or production security. Bind selected-chain code and proxy identities and obtain independent review before a separately authorized deployment. Do not broadcast, sign with player keys or install dependencies during ordinary inspection.
