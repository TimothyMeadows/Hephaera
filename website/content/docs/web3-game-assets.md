# Add chain-owned game assets

Use Web3 support when players should own and trade game assets on Ethereum, Base or Immutable. Start with the game rule you want. A trading card game might need players to prove they own enough copies before entering a match, then buy or sell those cards later.

Try a request like:

```text
Plan Ethereum, Base and Immutable support for our card game. Separate wallet login, actual card ownership and deck eligibility. Explain what happens when a card is sold during a match. Keep signing and deployment out of this first step.
```

Hephaera has six focused skills for asset planning, contract authoring, wallets, ownership checks, trading and lifecycle verification. They are independent of your engine and art pipeline. Selecting Three.js or another engine does not turn Web3 on.

## Make the choices first

Choose the chain, individually numbered cards or interchangeable quantities, supply and admin rules, wallet types and the trading method. Decide what a mid-match sale means. Letting an admitted player finish a match is different from locking their cards on-chain. A game-server reservation cannot stop someone selling through another marketplace.

The optional `WEB3.md` and `web3-game.json` record those choices. The local `web3-game.sh` command can inspect and validate them and initialize fresh files from your reviewed spec. It does not install an SDK, connect a wallet or submit anything to a chain.

## Keep three checks separate

1. **Wallet control:** the player proves they control the selected account.
2. **Card ownership:** the backend checks the approved collection and exact quantities at a fresh canonical block.
3. **Permission to play:** the game checks its current deck rules, reservations and match policy.

A login does not prove card ownership. Matching artwork does not make a counterfeit collection valid. A failed chain request should say the check is unavailable, rather than quietly granting access.

For trading, use a reviewed settlement method that exchanges payment and cards together. A local timeout or cancelled screen does not undo a submitted transaction. The workflow must reconcile what happened before trying again.

## Know the limits before release

Immutable support targets the current EVM chain, not retired Immutable X. Its operator policies and optional managed products need separate checks; Passport is not a wallet that works on every chain. Ethereum, Base and Immutable also have different confirmation and migration concerns.

Browser-wallet behavior does not prove that a packaged MAUI game can hand off to a native wallet. That needs explicit integration and real-device tests. Store rules can also conflict with playable NFTs: Apple's current NFT-functionality restriction and Steam's NFT exchange restriction matter before you promise those release channels.

The included examples and local EVM tests help verify implementation. They do not certify a live deployment, a production contract audit or store approval. An older installed package needs a reviewed update containing these source changes; nothing updates itself.

Read the [Web3 reference wiki](https://github.com/TimothyMeadows/Hephaera/wiki/Web3-Game-Assets) for the policy fields, helper boundaries, tools and detailed acceptance requirements. Art still follows [your asset workflow](art-and-assets.md), and packaging follows [the native release workflow](delivery-and-troubleshooting.md).
