# Art Pipelines

Hephaera separates visual language from the method used to produce it. Every generated `STYLE.md` selects one or more art style templates and exactly one primary art pipeline.

Primary art pipelines selectable in `STYLE.md`:

- `CLOUD` - session-provided image generation with explicit cost, provenance, staging, and review controls.
- `LOCAL` - direct offline Bubo image, SFX, music, preset speech and consented cloning with explicit setup, verified installations and shared GPU ownership.
- `PROOF_TO_MODEL` - original-only anatomy/structure classification, reviewed six-view proofs, pinned native multi-view reconstruction, Blender finishing and reviewed runtime packages.
- `CODE` - authored procedural Three.js models, with linked character profiles, isolated visual review, and calibrated runtime evidence for characters and creatures.
- `BLENDER` - authored Blender 4.5 LTS scenes, assets, renders, and exports with immutable-source and review controls.
- `FLOOR_PLAN_TO_MODEL` - dimensioned building plans, one complete architectural-package approval, detailed unfurnished construction and independently verified portable model exports.
- `SCHEMATIC_TO_MODEL` - complete dimensioned mechanical schematics, independently constructed components, assembled rigid/flexible articulation and independently verified portable packages.

Pipeline contracts:

- `cloud/PIPELINE.md`
- `local/PIPELINE.md`
- `proof-to-model/PIPELINE.md`
- `code/PIPELINE.md`
- `blender/PIPELINE.md`
- `floor-plan-to-model/PIPELINE.md`
- `schematic-to-model/PIPELINE.md`

Shared generated-media provenance lives under `_shared/`. LOCAL host policy remains under `local/`; exact model/tool pins, platform locks and execution resources belong only to the pinned `runtime/bubo` dependency. Other pipeline-specific schemas, manifests and reusable assets remain beside their owner.

`PROOF_TO_MODEL` is the default when style generation does not name a pipeline. A current user prompt may explicitly select any registered pipeline for one task without rewriting `STYLE.md`. Never switch pipelines silently after work begins.

## Downstream production pipelines

- [`MODEL_TO_ANIMATION`](../.workflows/model-to-animation/WORKFLOW.md) - turn a reviewed model into a skinned, articulated, rigid or preserve-only mechanical assembly motion package: prepare its rig/hierarchy, author compatible clips or retarget where supported, bake/export, review full motions and verify selected-engine playback and effects before separate human runtime acceptance.
- [`MODEL_TO_ACTION`](../.workflows/model-to-action/WORKFLOW.md) - compose reviewed clips into ordered dance patterns, combinations or charge/cast actions, with explicit trims, rates, blends, timed model-attached effects and fixed-target presentation.

`MODEL_TO_ANIMATION` follows model production through `PROOF_TO_MODEL`, `BLENDER`, a copied asset library or an explicitly compatible `CODE` handoff. A current reviewed `SCHEMATIC_TO_MODEL` package uses its explicit preserve-only `mechanical-assembly` handoff, retaining separate rigid instances and owned flexible rigs. It composes with the selected primary art pipeline and preserves `STYLE.md` and `ENGINE.md`; it is not a primary choice for `generate-style.sh` or `resolve-art-pipeline.sh`.

Use [`build-model-animations`](../../skills/build-model-animations/SKILL.md) and [`model-to-animation.sh`](../../commands/model-to-animation.sh). Host policy lives under `.styles/.workflows/model-to-animation/`; technical schemas, recipes, audited Blender scripts and the engine adapter live under the pinned `runtime/bubo/resources/model-to-animation/`.

Use [`build-model-actions`](../../skills/build-model-actions/SKILL.md) and [`model-to-action.sh`](../../commands/model-to-action.sh) for composed sequences. Host policy lives under `.styles/.workflows/model-to-action/`; technical assets live under the pinned `runtime/bubo/resources/model-to-action/`. Individual clip creation stays with MODEL_TO_ANIMATION; gameplay retains movement, targeting, collision, damage and projectile-outcome authority. Neither downstream pipeline replaces the primary STYLE selection or grants runtime acceptance.
