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

Choose a pipeline because it suits the requested result and is available. If it fails or lacks prerequisites, the agent must explain that and request direction rather than silently switching methods. A task-specific pipeline override does not rewrite the project's primary choice.

For a newly agreed cloud illustration style, these host-root commands generate and validate the contract:

```bash
bash .hephaera/commands/generate-style.sh --pipeline CLOUD CEL_SHADED_COMIC
bash .hephaera/commands/validate-style-contract.sh
```

That records the choice. It does not authorize generation or install a provider. CLOUD and LOCAL execution also follow `MEDIA.md`, with explicit input rights, budgets, staging, and review.

## Design a building floor by floor

Use [floor plans to buildings](floor-plan-to-model.md) for dimension-driven architecture. Design each floor, then review all floor plans, the roof, elevations and stair sections as one complete package before modeling. The result includes editable source and separate visual/collision exports; rooms stay unfurnished and game integration comes later. This pipeline is in newer `main` source; the published `5.1.0-rc.1` packages predate it.

## Review the right thing at each step

For `PROOF_TO_MODEL`, original source images establish what is actually known about the subject. Generated views and model renders cannot become evidence of the original anatomy or structure. Review originals together with front, right, back, left, top, and bottom proofs, and approve the exact complete set before reconstruction. Revising one view invalidates that set's approval.

Creating missing proofs through CLOUD or LOCAL is a separate generation request with its own allowance. Reconstruction and finishing need the prepared native runtime and tools; choosing the pipeline does not prepare them automatically. See [proof to model](https://github.com/TimothyMeadows/Hephaera/wiki/Proof-to-Model).

Keep candidates outside runtime asset folders until review. Check silhouette, materials, topology, scale, performance limits, and the intended game camera. Approval of a picture is not approval of a rig, a motion range, or runtime behavior. Promotion into the project is a separate explicit step for the accepted version.

## Reuse existing assets safely

External libraries are optional. If `STYLE.md` already configures one and the task needs a 3D asset, inspect it before making a replacement. The source library stays read-only. Copy a selected asset or complete bundle into the repository through the existing copy command before loading or editing it, then check its license and modification rights.

No configured library means no extra startup question. A library also does not bypass the selected pipeline's rules.

## Add motion as a later handoff

A static model is not automatically ready to animate. Inspect articulation, topology, scale, rights, and any existing rig first. Model-to-animation creates reviewed motion; model-to-action composes clips into sequences. Neither decides combat damage, targeting, or movement authority just because an animation played.

Read [visual pipelines](https://github.com/TimothyMeadows/Hephaera/wiki/Visual-Pipelines) and [animation and actions](https://github.com/TimothyMeadows/Hephaera/wiki/Animation-and-Actions) for the detailed stages. If your task is about sound instead, use [audio, music, and voice](audio-music-voice.md).
