# Proof to model

PROOF_TO_MODEL turns authorized original images into editable, measured 3D assets through source classification, six approved proofs, native multi-view reconstruction and Blender finishing. It is the default primary art pipeline, but selecting it does not generate views, provision models or approve runtime promotion.

Read the [pipeline contract](https://github.com/TimothyMeadows/Hephaera/blob/main/.styles/.pipelines/proof-to-model/PIPELINE.md), [coordinating skill](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/build-proof-to-model-assets/SKILL.md) and [command argument reference](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/BUBO_ARGUMENTS.md#proof-to-model) before production. Schemas, recipes and fixed execution resources belong to the pinned Bubo dependency.

## Prerequisites and state

Resolve STYLE and any task-local prompt selection, architecture, effective engine and compatible skills. Establish source rights, scale, intended format, geometry/texture/collision budgets and rig/animation applicability. If external libraries are configured, inspect them first and use only verified repository-local copies.

Initialize and build Bubo explicitly with an existing .NET 10 SDK before native operations. Setup is a separate dry-run-first operation requiring applicable license and pinned-file evidence before execution. Ordinary production does not download tools/models, install drivers or accept licenses.

Keep task state under `.hephaera/.cache/tasks/<task>/`, immutable originals and versioned attempts under `.art-staging/proof-to-model/<asset>/<version>/`, and audited dependencies under the declared ignored local-tool location. Reject linked escapes and runtime/staging overlap. These guards do not create an OS sandbox.

## Register and classify original sources

`init` requires task, asset, version and actor identity, exactly one original `--proof` or a `--sources` JSON set, plus `--rights`, `--recipe` and `--toolchain`. Use current schemas and real project-confined files. Multi-view is the default; explicit single-view diagnostic mode is a separate nonproduction path.

The assistant inspects and researches the registered originals. `classify --classification JSON` registers the resulting report; it does not run vision. Record distinct entities, living anatomy, equipment, nonliving assemblies, attachment ownership, materials, pose, occlusion and asymmetry. Distinguish observed, research-inferred, user-specified and unknown claims. General research can support plausibility, not unseen source-specific detail.

Generated proofs and model renders never become original-source classification evidence, even after copying or renaming. Resolve consequential unknowns and conflicting originals before dependent production. Keep a rider distinct from a mount and equipment distinct from anatomy; intentional fantasy features should not be “corrected” without evidence.

## Prepare exactly six consistent views

The ordered set is front, subject-right, back, subject-left, top and bottom. Freeze identity, pose, scale, assembly, materials and camera/frame convention. One usable canonical original can supply a slot and need five additional proofs; an oblique/cropped anchor may need all six canonical views. Multiple originals can reduce missing coverage.

`prepare-proofs --proof-set JSON` registers actual image/camera/provider artifacts. It does not generate images. Generated views need separately selected CLOUD or LOCAL production under MEDIA, explicit candidate/revision limits and provenance. Show originals and all six current views together, including inferred hidden surfaces, for human selection.

Use the current status `proofSet` fingerprint for the `proof-set` approval kind. A diagnostic single `proof` receipt cannot approve the set. Target revisions retain rejected candidates and unchanged approved bytes; any set revision invalidates whole-set approval.

## Camera and preprocessing contract

The canonical rig uses row-major Blender/NeRF camera-to-world matrices: world Z up, camera local -Z forward and +Y image up. Front faces -Y, subject-right is -X and subject-left is +X. Preserve these labels across prompts, attachment review and ordered inference frames. Record scale, distance, horizontal FOV and explicit top/bottom roll. Per-view FOV overrides the shared value.

Prescribed views derived from an illustration are `nominal-prescribed`; do not invent measured calibration. Inspect actual alpha per approved image. Preserve suitable mattes or explicitly use pinned BiRefNet through Pixal3D. Retain masks, cutouts, common-square padding transforms and adjusted FOV without stretching or independently tight-cropping views. Actual preprocessing needs review; placeholder threshold matting is not a substitute.

## Native reconstruction and finishing

Pinned Pixal3D MV inference must receive six separate verified prepared frames and camera JSON with the actual six-view request. A contact sheet, single-view donor or four-image subset cannot satisfy production. Retain submitted hashes, raw output, model/executable identities, logs and bounded GPU/process evidence. Upstream validation covers four views; accepting six inputs does not establish six-view quality. Separate bounded real acceptance is required.

Blender 4.5 LTS finishing uses only fixed audited hash-bound finish/review scripts on declared working copies. Preserve raw reconstruction and source high geometry. Apply a declared raw-engine frame correction once and record it.

| Finishing route | Required evidence | Prohibited shortcut |
| --- | --- | --- |
| Default QuadriFlow | Actual successful retopology before applicable baking | Claiming success from a requested operator or failed solver |
| Explicit voxel preparation | Separate low working copy and current finish settings | Altering the immutable high source |
| Explicit schemaVersion2 `rigid-parts` | Independently reviewed authored HIGH/LOW pairs, repair/part/pivot ancestry, budgets and native memory enforcement | Automatic route switch after solver failure or relabeling a proxy HIGH |

Preserve valid UVs or unwrap with the declared margin. Applicable real high-to-low/grouped baking retains cage/ray/tangent settings and material correspondence. Measure textures, LODs and per-part collision. Explicit conservative `kdop-26` collision needs containment, convexity, face and volume checks. Never loosen tolerances or expand budgets automatically.

## Command stages and review receipts

Every continuation uses the exact current `--manifest` path returned by initialization:

```bash
bash .hephaera/commands/proof-to-model.sh status --manifest PATH_TO_MANIFEST
bash .hephaera/commands/proof-to-model.sh validate --manifest PATH_TO_MANIFEST
```

| Operation | Purpose |
| --- | --- |
| `doctor`, `setup` | Inspect prerequisites; setup is dry-run without explicit execution |
| `classify`, `prepare-proofs` | Register actual reports and six-view artifacts |
| `preprocess`, `reconstruct`, `finish` | Run the current approved native stages |
| `review` | Produce measured comparison evidence |
| `record` | Consume an actual current receipt with kind, reviewer and evidence |
| `reuse` | Check donor ancestry after receiving-asset registration and review |
| `validate`, `status` | Inspect current contract/evidence state |
| `promote` | Copy exact accepted output to a declared fresh `assets/models/...` destination |

`finish --finish-settings JSON` and `--finish-budget JSON` require their explicit current evidence. An exhausted finish budget may receive one separately approved additional attempt bound to consumed history; never reset the ledger.

Save editable Blender sources and GLB, independently re-import the export and inspect transforms, hierarchy, materials, textures, dependencies and budgets. Compare originals, proofs, prepared inputs and six matching-camera GLB renders with honest nominal-fit labels. Schema checks cannot establish likeness or anatomy.

Current independent review and separate human runtime acceptance must bind exact artifacts before promotion. Rigging/animation need subject-specific readiness and motion evidence. Historical v1/single-view diagnostics remain historical, cannot fall back into six-view production and cannot promote. Changed inputs or runtime builds require retained-ancestry versions and refreshed affected reviews; simulated process fixtures never become live reconstruction claims.
