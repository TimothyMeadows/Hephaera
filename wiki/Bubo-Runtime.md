# Bubo runtime

Bubo is Hephaera's pinned native execution dependency. Hephaera owns host policy, selection, rights, consent, task evidence and promotion rules. Bubo owns its execution algorithms, audited resources, model/tool identities, installation verification, bounded processes, GPU ownership and native attempt accounting. It is a production tool dependency, not a runtime dependency shipped automatically with the game.

The recorded identity lives in [runtime/bubo.lock.json](https://github.com/TimothyMeadows/Hephaera/blob/main/runtime/bubo.lock.json). The [admission implementation](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/lib/bubo-runtime.cjs) verifies it before execution. Use the current lock rather than copying a revision from documentation.

## Installation versus executable readiness

The dependency belongs at `.hephaera/runtime/bubo` in an installed host. Its parent gitlink records the required commit; the lock records repository, revision, API, resource-catalog hash and build-receipt location. A sibling checkout, current upstream branch or renamed directory is not a substitute.

Default package setup installs/scaffolds the core baseline and leaves Bubo source uninitialized. Its explicit `--with-bubo-source` option initializes recorded source only. Ordinary scaffold, memory, engine selection and policy startup work before Bubo is initialized or built. Native asset production and read-only Blender scene inspection require it. Explicit initialization and build use:

```bash
bash .hephaera/commands/initialize-bubo-runtime.sh
bash .hephaera/commands/build-bubo-runtime.sh
```

Initialization checks out the recorded recursive dependency. Build uses an existing .NET 10 SDK and the dependency's build script; the build wrapper accepts Release or Debug, with its source defining the default. Neither command installs the SDK, Blender, Python environments, models or packages, accepts licenses, generates media or grants runtime acceptance.

After an update changes the pin, rebuild explicitly before native work. Production uses the prebuilt CLI; it does not run source implicitly, invoke `dotnet run` as a fallback or build another checkout.

## What admission verifies

| Check | Purpose |
| --- | --- |
| Recorded Git dependency and exact revision | Prevent use of an unrelated checkout |
| Parent gitlink agrees with lock | Bind executable source to the baseline dependency |
| Tracked dependency source is clean | Reject modified pinned implementation |
| Audited resource catalog matches | Preserve recipes, schemas and fixed-script identities |
| Build receipt names the pinned clean source | Detect stale or dirty builds |
| API and build/capability identities agree | Reject incompatible executable contracts |
| Built assemblies, launch files and published resources hash correctly | Detect changed or unexpected runtime bytes |
| Live CLI capabilities match recorded build | Verify the launched apphost reports that build |

These are integrity and compatibility checks. They do not establish that a model is licensed, an installation is executable on the intended GPU, an image looks correct or a human has accepted an asset. Path/process guards remain cooperative safeguards rather than an operating-system sandbox.

## Resource ownership

Native schemas, recipes, audited scripts and tool/model pins live inside the recorded Bubo resources. Hephaera policy contracts link those resources rather than duplicating their version pins. Resolve a registered resource through the admission helper when a workflow requires its exact file:

```bash
node .hephaera/commands/lib/bubo-runtime.cjs resource proof-to-model/toolchain.json
```

The command checks the initialized dependency and catalog; it does not install the referenced toolchain. The helper's `verify` operation additionally checks the prebuilt executable. Read [asset arguments](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/BUBO_ARGUMENTS.md) for host-facing flags and each workflow's current help before supplying manifests.

## Native workflow entry points

| Command | Responsibility | Additional prerequisites |
| --- | --- | --- |
| `proof-to-model.sh` | Classification registration, proofs, preprocessing, reconstruction and finishing | Current style, sources/rights, set approvals, pinned tools/models and recipe |
| `floor-plan-to-model.sh` | Dimensioned architecture, approved construction, portable export and complete model review | Current STYLE/rights/budgets, whole-design approval, supported Windows enforcement and selected Blender 4.5 LTS for native modeling |
| `schematic-to-model.sh` | Complete mechanical schematics, independent parts, assembled articulation and portable export/review | Current STYLE/rights/budgets, approved v2 design, independently verified parts, supported Windows enforcement and selected Blender 4.5 LTS for native modeling |
| `model-to-animation.sh` | Model readiness, rigs/hierarchies, real clips and export | Reviewed GLB, selected profile, Blender and current motion evidence |
| `model-to-action.sh` | Compound timelines from actual reviewed clips | Compatible motion package, source-motion selection, recipe and anchors |
| `inspect-blender-scene.sh` | Read-only Blender scene reporting | Existing Blender 4.5.x and selected inspection profile |
| `bubo-media.sh` | Explicit LOCAL setup, inspection and generation | MEDIA policy, selected domain/style where applicable, verified installation and approval |

Proof, floor-plan, schematic, motion and action commands use task manifests and versioned non-runtime staging. Floor-plan/schematic planning works without Blender. Native modeling requires the complete respective architectural-export or portable-assembly-export capability and actual tool/platform/path readiness. Read [Floor plan to model](Floor-Plan-to-Model) and [Schematic to model](Schematic-to-Model) for independent import and human model review gates. Blender inspection needs no fabricated STYLE, ENGINE or MEDIA contract and grants no authoring or acceptance. Read its documented profiles before inspection.

## LOCAL media discovery and setup

`inspect-local-media-host.sh` provides read-only structured host discovery. Distinguish declared capability, receipt presence and verified installed content. Discovery never loads models or provisions software. `bubo-media.sh inspect --load true` is a separately selected zero-sample load/unload diagnostic; it is not ordinary discovery or generation.

Setup remains dry-run unless explicitly executed with applicable authorization and license evidence. Generation never installs dependencies, changes provider/device/precision or downloads missing model files. Bubo resources own exact profiles and platform locks. Do not reproduce a second installation inventory in Hephaera or treat a receipt alone as proof of usable content.

## Shared resources and immutable attempts

LOCAL image, SFX, music and voice share native GPU/process ownership and one physical acceptance-state root per media approval. Proof reconstruction also participates in native GPU exclusion, while retaining its own workflow approval/attempt records. Independent domain contexts do not grant concurrent inference.

Started attempts, cancellations, rejected outputs and candidate/revision consumption persist. New tasks, versions, registration or workspace moves do not replenish allowance. Preserve originals, exact source/tool/recipe identities and failed evidence. Changed runtime builds require fresh versioned ancestry and reviews affected by the change; never rewrite historical receipts to make them match.

## Diagnose the correct layer

Missing submodule, wrong revision, dirty source, stale build and altered resource errors belong to dependency admission. Missing SDK, Blender, GPU capability, model content or license evidence belong to the declared workflow prerequisite. A valid manifest is a structural result; actual execution, artistic/listening review and target QA are later evidence classes.

Use [Maintenance and troubleshooting](Maintenance-and-Troubleshooting) for recovery and [Commands and validation](Commands-and-Validation) for baseline checks. `test-bubo-runtime.sh` runs explicitly built upstream fixtures; fixture success must stay distinct from real reconstruction, synthesis, full-motion quality or actual device acceptance.
