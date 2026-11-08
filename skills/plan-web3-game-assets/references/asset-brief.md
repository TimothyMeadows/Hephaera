# Game asset and trust brief

Record decisions that affect the requested game; leave unresolved values explicit instead of inventing production settings.

| Area | Decisions |
| --- | --- |
| Purpose and content | Which game assets need tokens; approved definition/media versions, source rights and token-holder license |
| Identity and supply | Exact chain and collection, ERC721 serials versus ERC1155 quantities, lifetime caps, mint/burn/craft/upgrade rules |
| Authority | Player-controlled wallets, contract admin/minter/upgrade powers, recovery and incident limits |
| Gameplay | Allowed formats/quantities, canonical ownership freshness, reservations, snapshot overlap or reviewed strict locks |
| Trading | Exact-ID fixed-price or selected advanced profile, currencies/decimals, settlement, fees/royalties, cancellation and order consumption |
| Chain services | RPC trust and history, optional wallet/index/order/paymaster services, actual operator restrictions and availability |
| Confidentiality | Public token/transaction facts versus private player identity, hidden hands and authoritative match state |
| Targets and release | Effective engine, browser/native wallet transport, packaged-device evidence, selected store/region policy |
| Verification | Contract properties, adversarial asset/trade cases, reorg/retry recovery, actual target evidence and separate human acceptance |

Use lossless decimal strings for token IDs, quantities and payment units. Names/artwork do not identify a collection. Runtime code/ABI/proxy identities and chain-specific block evidence must accompany ownership; an RPC result does not become a cryptographic storage proof by hashing its JSON.

An approved generic integration does not decide an individual game's economy or authorize real-fund operations. Do not add betting, a fungible speculative currency, paid randomized packs, bridges or on-chain secret-hand gameplay as incidental defaults. A chosen game can commission those separately with its own threat model and requirements.
