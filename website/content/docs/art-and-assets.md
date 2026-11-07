# Plan, make, and review art assets

Start by describing the asset's job: what it is, how it will be viewed, what needs to move, and where it will run. A small inventory icon, a close-up character, and a distant environment prop have different production and review needs.

Ask the agent to read `STYLE.md` and the selected engine before proposing tools. A useful starting request is:

```text
Plan a readable environment prop for this scene. Check the project's visual style, selected production pipeline, target budget, and any configured asset library. Show the proposed steps and review points. Do not generate, download, or promote an asset yet.
```

## Choose a style and a production method

`STYLE.md` combines one or more visual styles with exactly one primary art pipeline. The style describes appearance; the pipeline describes how the asset is produced. New style contracts default to `PROOF_TO_MODEL` unless another pipeline is explicitly selected.

| Pipeline | What it is for |
| --- | --- |
| `CLOUD` | Generated images through a compatible capability available in the session. |
| `LOCAL` | Direct Bubo generation using explicitly prepared local tools and models. |
| `PROOF_TO_MODEL` | Reviewed source images and a complete six-view set leading to native reconstruction and finishing. |
| `CODE` | Three.js models authored as JavaScript/TypeScript source; this path requires THREEJS. |
| `BLENDER` | Blender 4.5 LTS authoring, validation, renders, and exports under its working-copy controls. |
| `FLOOR_PLAN_TO_MODEL` | Dimensioned building plans, approval of the complete design, then detailed unfurnished models with separate visual/collision exports. |
| `SCHEMATIC_TO_MODEL` | Approved mechanical schematics, independent components, then an assembled model with separate rigid and flexible parts. |

Choose a pipeline because it suits the requested result and is available. If it fails or lacks prerequisites, the agent must explain that and request direction rather than silently switching methods. A task-specific pipeline override does not rewrite the project's primary choice.

For a newly agreed cloud illustration style, these host-root commands generate and validate the contract:

```bash
bash .hephaera/commands/generate-style.sh --pipeline CLOUD CEL_SHADED_COMIC
bash .hephaera/commands/validate-style-contract.sh
```

That records the choice. It does not authorize generation or install a provider. CLOUD and LOCAL execution also follow `MEDIA.md`, with explicit input rights, budgets, staging, and review.

## Design a building floor by floor

Use [floor plans to buildings](floor-plan-to-model.md) for dimension-driven architecture. Design each floor, then review all floor plans, the roof, elevations and stair sections as one complete package before modeling. The result includes editable source and separate visual/collision exports; rooms stay unfurnished and game integration comes later. Included in `5.2.0`; follow [installation and managed updates](install.md) and explicitly prepare the native runtime.

## Design an object with separate parts

Use [schematics to assembled models](schematic-to-model.md) for vehicles, devices, vessels and similar objects. Review dimensioned views, internal sections, the component list and connections as one complete design before construction. Build each part first, then assemble the instances and check their declared movement. Identical wheels can share geometry while remaining separately movable; wires and hoses keep their own deformation rigs.

The result includes editable source, a canonical rest GLB and separate diagnostic-motion evidence. Manufacturing/circuit simulation, finished animation and game integration remain separate. Included in `5.2.0`, with its reviewed native pin. Follow [installation and managed updates](install.md); native builds and model acceptance remain separate.

## Review the right thing at each step

For `PROOF_TO_MODEL`, original source images establish what is actually known about the subject. Generated views and model renders cannot become evidence of the original anatomy or structure. Review originals together with front, right, back, left, top, and bottom proofs, and approve the exact complete set before reconstruction. Revising one view invalidates that set's approval.

Creating missing proofs through CLOUD or LOCAL is a separate generation request with its own allowance. Reconstruction and finishing need the prepared native runtime and tools; choosing the pipeline does not prepare them automatically. See [proof to model](https://github.com/TimothyMeadows/Hephaera/wiki/Proof-to-Model).

Keep candidates outside runtime asset folders until review. Check silhouette, materials, topology, scale, performance limits, and the intended game camera. Approval of a picture is not approval of a rig, a motion range, or runtime behavior. Promotion into the project is a separate explicit step for the accepted version.

For a set of assets, say what each reference contributes and what must stay consistent. Review failures item by item, and repair only within the allowance already agreed. If it runs out, keep the findings and remaining work visible rather than retrying until something looks acceptable. These review practices work with existing local tools and do not need a hosted service.

For sprites, check the actual poses, frame order, feet or other contact points, transparency and complete playback. A correctly sized PNG can still contain clipped equipment or unusable motion. Review repeating textures and joined tiles together, and move layered backgrounds through the intended camera range to expose seams or missing scenery. Missing inspection or target evidence stays an open check; review does not authorize automatic cropping, alignment or other repairs.

## Reuse existing assets safely

External libraries are optional. If `STYLE.md` already configures one and the task needs a 3D asset, inspect it before making a replacement. The source library stays read-only. Copy a selected asset or complete bundle into the repository through the existing copy command before loading or editing it, then check its license and modification rights.

No configured library means no extra startup question. A library also does not bypass the selected pipeline's rules.

## Make effects that belong to the action

Use [game effects and model actions](game-effects-and-actions.md) for a charge at a real hand anchor, a traveling effect with a trail, an impact, or a beam with an explicit endpoint. Start with simple effects so timing and placement can be reviewed before detail. Reusable VFX packages keep their own rights, finite budgets and independent reviews; MODEL_TO_ACTION v2 connects them to actual exported clips through one shared Three.js/Quarks clock.

The current production bridge is Three.js. It preserves the project's visual pipeline and keeps gameplay hits and damage outside presentation. Other engines, packaged-device readiness and authored accessibility alternatives need their own evidence. These workflows are included in `5.2.0`; installed older hosts need an explicit managed update.

## Add motion as a later handoff

A static model is not automatically ready to animate. Inspect articulation, topology, scale, rights, and any existing rig first. Model-to-animation creates reviewed motion; model-to-action composes clips into sequences. Neither decides combat damage, targeting, or movement authority just because an animation played.

Before making motion, agree on a short brief: what each clip should communicate, where support or contact is intended, what must clear equipment, and which exaggerations are deliberate. Watch the full delivered motion at normal speed, then inspect awkward moments slowly. Compare source and export from similar views. Record what the tools measured separately from what a person saw; missing evidence is still missing, while a real measured zero can be valid. The [motion brief and review guidance](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/build-model-animations/references/motion-profiles.md#state-motion-intent-before-authoring) covers the details.

A reviewed schematic assembly uses the current preserve-only `mechanical-assembly` handoff. It carries the separate rigid components and flexible rigs forward; diagnostic readiness clips do not become approved production animations, and changed source state invalidates an old handoff.

Read [visual pipelines](https://github.com/TimothyMeadows/Hephaera/wiki/Visual-Pipelines) and [animation and actions](https://github.com/TimothyMeadows/Hephaera/wiki/Animation-and-Actions) for the detailed stages. If your task is about sound instead, use [audio, music, and voice](audio-music-voice.md).
