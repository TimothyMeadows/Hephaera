# From a VFX brief to a reviewed model action

This walkthrough connects the existing data contracts using your reviewed model/clips, exact rights and actual captures. The original caster and beam [engineering images](../../docs/MODEL_TO_ACTION.md#engineering-examples) illustrate the result. They remain technical fixtures requiring separate artistic and human runtime acceptance for a production asset.

The workflow requires newer source containing the action-v2 integration merged as `6b8c8e6ad6080783763f8fe94e982e248af18807`, and its reviewed native pin. Published `5.1.0-rc.1` installers predate it. Follow the [installation guidance](../../docs/INSTALLER.md); a source merge does not update an installed package.

## 1. Agree on the actual action

Use this starting brief with your agent:

```text
Use my reviewed caster and clips. Put a charge on its real hand anchor, release on the existing source marker, travel toward an explicit fixed point and show the rehearsal impact. Keep targeting, hits and damage in gameplay. Show simple provisional effects first. Propose finite budgets, candidate/revision bounds and required captures before detailed work.
```

Resolve ENGINE, STYLE and compatible skills. V2 currently admits skinned, articulated or rigid reviewed motion packages through THREEJS. Mechanical-assembly actions remain unavailable. Author missing clips/anchors through their owning model/motion workflow first; do not substitute empty clips or guessed bones.

Inspect the [pinned native v2 example](../../runtime/bubo/resources/model-to-action/recipes/cast-vfx-v2.example.json) and [VFX contracts](../../runtime/bubo/docs/VFX_ASSETS.md). These define exact current fields; the example is structural guidance, not rights or acceptance for your inputs. Keep the current lock/gitlink/API/catalog and explicit prebuilt native build consistent.

## 2. Prepare a reusable effect version

Create an ordinary task and retain its brief, original rights evidence, input hashes and finite budgets. From the host root:

```bash
bash .hephaera/commands/vfx-assets.sh doctor
bash .hephaera/commands/vfx-assets.sh init \
  --task cast-effects --asset hand-charge --version v1 --creator artist \
  --brief inputs/vfx/brief.json --rights inputs/vfx/rights.json
```

Use the returned manifest. Stage provisional work with real captures and obtain a distinct independent review of the complete current phase. Then prepare owned/licensed PNG sheets, ordered sequences or typed masks, and stage detailed work with its exact native preparation receipt, composed package, production profile and visual packet. Follow [the lifecycle examples](../../docs/VFX_ASSETS.md), rather than copying placeholder paths into receipts.

Preparation reserves one phase candidate; finishing that reservation does not charge another. A failed attempt remains spent. Every new version retains parent ancestry and the original allowance. Video decoding, generated-receipt admission and software installation are not provided here.

## 3. Compose and export actual clips

Reference the reviewed effect package/profile/resources in the native v2 action recipe. Bind actual source package/model/rig/clip hashes, marker occurrences, local transforms and finite layer start/stop/retirement policies. Use the normal `model-to-action.sh` lifecycle and fixed audited Blender bundle to inspect, compose, export and review. `inspect-effects` reports facts with `accepted: false`; it grants no acceptance.

The export carries editable composition, real composite GLB clips, resolved cue timing and complete effect ancestry. Preserve all private source/preparation/review contexts. Moving a file to an action task does not reassign its approvals or reset its attempts.

## 4. Integrate one presentation owner

Use [source-export admission](../../docs/MODEL_TO_ACTION.md#admit-the-source-export) through the host helper. The trusted asset owner loads the exact returned GLB bytes and establishes decoded-resource correspondence. The helper admits the native source export, not a promoted/rebound destination bundle.

Create one action Scene borrowing the existing Quarks VFX service. Update movement and live endpoints first, advance that scheduler once, then render once through the existing composer. Keep other animation writers behind the synchronous rig lease. Do not separately update particles while the Scene owns the clock.

Choose rehearsal or host-outcomes explicitly. Rehearsal may display a planned impact; the real game supplies confirmed contact position/normal for host outcomes. A live beam requires bounded fresh generation-bound endpoints. Motion completion returns the rig before declared tails drain; cancel/restart/dispose retires the affected generation. Gameplay remains authoritative.

## 5. Collect evidence, then make the decisions

Review complete normal-speed actions and exact release/end boundaries, isolated and combined layers, contrasting backgrounds, two actors with ambient effects, tails and cleanup. Capture current model/effect/decoded resource, source module, library, driver, camera and settings identities. Measure loading/compile separately from steady/peak cost with five comparable baseline/candidate runs and investigate median regressions above 10%.

Author actual reduced-motion/reduced-flash and contrast/color-independent alternatives. Review essential cues and readability; emission scaling alone is insufficient. Label software/CPU results and leave physical GPU or packaged MAUI targets not-run until actually tested.

Bind real receiving artifacts using the documented host evidence helper for the existing native review path. Technical validation and independent review do not record human runtime acceptance. Obtain that decision separately for the exact current result, then perform explicit native action promotion if authorized. Standalone VFX staging does not promote anything.

Keep failed versions, spent attempts, original rights, captures and review history so the next session can explain what changed. See [the practical guide](../../website/content/docs/game-effects-and-actions.md) and [detailed wiki source](../../wiki/VFX-and-Action-v2.md).
