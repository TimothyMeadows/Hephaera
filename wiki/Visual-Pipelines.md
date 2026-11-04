# Visual pipelines

`STYLE.md` selects the project's visual language and production method. Read it before visual, game-art, UI-art, code-model or asset-production work. Resolve the pipeline instead of inferring it from an available tool or an engine name. The [pipeline index](https://github.com/TimothyMeadows/Hephaera/blob/main/.styles/.pipelines/INDEX.md) and [art workflow contract](https://github.com/TimothyMeadows/Hephaera/blob/main/AGENTS.md#art-style-and-pipeline-workflow) are authoritative.

## Select style and method separately

Every generated style contract contains one or more styles, exactly one primary pipeline, allowed alternatives, prompt-override scope and an explicit no-silent-fallback rule. Missing style choices require the user's selection unless the prompt already names the style. The default primary is PROOF_TO_MODEL; CLOUD, LOCAL, FLOOR_PLAN_TO_MODEL, SCHEMATIC_TO_MODEL, CODE and BLENDER require explicit selection.

```bash
bash .hephaera/commands/generate-style.sh --pipeline BLENDER "CEL_SHADED_COMIC"
bash .hephaera/commands/validate-style-contract.sh
bash .hephaera/commands/resolve-art-pipeline.sh
```

The generator normally writes concise read directives. Use `--inline` only for an explicit request to embed the templates. A current-prompt pipeline override applies to that task, may select any registered pipeline, and does not rewrite `STYLE.md`. Retain its prompt-selection evidence and current contract hash below the active task state.

## Registered primary pipelines

| Pipeline | Primary implementation | Principal boundary |
| --- | --- | --- |
| CLOUD | Compatible session-provided image generation | Explicit capability, budget, provenance, staged candidates and human review |
| LOCAL | Direct offline Bubo generation | Verified pinned installation, bounded native execution and shared attempt/GPU ownership |
| PROOF_TO_MODEL | Approved six-view reconstruction and Blender finishing | Original-only classification, exact set approval, measured stages and separate promotion |
| FLOOR_PLAN_TO_MODEL | Dimension-driven architecture through pinned Bubo | Exact whole-building drawing approval, detailed empty-room models, independent imports and separate human model acceptance |
| SCHEMATIC_TO_MODEL | Dimensioned mechanical design and independent parts through pinned Bubo | Exact whole-design approval, separate physical occurrences, rigid/flexible readiness and independently verified exports |
| CODE | Authored Three.js TypeScript/JavaScript models | THREEJS required; source-native primary geometry |
| BLENDER | Blender 4.5 LTS authoring and export | Connected authoring, immutable source/working-copy separation and staged review |

CSS3 is retired as a registered pipeline. Ordinary CSS/SVG game-interface work remains supported outside that registry. AUDIO, MUSIC and VOICE are independent production domains, not extra visual primary choices.

## CLOUD and LOCAL generation

Both paths follow applicable `MEDIA.md` execution and provenance policy. Selection is not a generation allowance. Confirm input rights, identity/voice consent where applicable, exact candidate/revision bounds, provider capability, staging and review before production. A provider's undisclosed model, parameter or seed remains explicitly unavailable in the manifest; do not invent it.

CLOUD uses compatible generation actually exposed to the active session. LOCAL uses `use-bubo-local-generation`, `bubo-media.sh` and the pinned Bubo resources. Read-only discovery loads no model. Explicit setup is separate from generation and never silently installs drivers, downloads packages or accepts licenses. A selected-path failure stops for direction; another provider is not an automatic substitute.

Keep generated originals and manifests in non-runtime staging. Record exact output hashes and current human decisions. Retain started attempts and rejected candidates. New task registration, a new workspace or a revised asset cannot reset the same approval's shared allowance. See [Media pipelines](Media-Pipelines) and [Bubo runtime](Bubo-Runtime).

## PROOF_TO_MODEL

The default path begins by registering immutable authorized original images. Inspect those originals for entities, parts, materials, pose, occlusion and uncertainty. Generated proofs and reconstruction renders cannot establish facts about original anatomy or structure.

Prepare front, subject-right, back, subject-left, top and bottom as six consistent views. A usable canonical original can supply one view; an oblique or cropped source may remain only an anchor. Human approval binds the exact complete set, classification and cameras. `classify` and `prepare-proofs` register real reports and images; they do not perform vision or image generation.

After approved preprocessing, pinned native MV inference consumes six distinct frames and camera matrices. Blender finishing uses fixed audited batch scripts, preserves the high source, measures retopology/bakes/LODs/collision and independently re-imports the GLB. Actual likeness, anatomy, material fidelity and human runtime acceptance remain separate. Read [Proof to model](Proof-to-Model) before execution.

## FLOOR_PLAN_TO_MODEL

Use dimensioned structured plans to create detailed unfurnished architecture. Design each floor, then approve every floor, roof, exterior elevation and vertical section as one exact package before modeling. Bubo validates dimensions/connectivity/clearances, constructs the approved architecture and exports editable Blender source, separate visual/collision GLBs, semantics and drawings. Independent imports, complete delivered-model views and separate human model acceptance follow.

The engine-agnostic `build-floor-plan-models` skill and `floor-plan-to-model.sh` coordinate this path. Pure design works without Blender; native construction/export/review currently require supported 64-bit Windows ownership and an explicitly selected existing Blender 4.5 LTS. No MEDIA contract, engine adapter, installation or promotion is selected implicitly. Read [Floor plan to model](Floor-Plan-to-Model) for source/version/rights/budget and review details.

## SCHEMATIC_TO_MODEL

Design the complete mechanical object before construction. Approve dimensioned orthographic/internal/exploded drawings, a hierarchical BOM, connections, motion limits, materials, detail and simplifications as one exact package. Construct part definitions independently, then assemble each separately identified physical occurrence and verify its declared joints, mechanisms and owned flexible rigs.

Use `build-schematic-models` and `schematic-to-model.sh`. Pure design needs no Blender or MEDIA contract; current native production requires explicit existing Blender 4.5 LTS and supported Windows memory enforcement. Export editable source, canonical rest GLB, schematics/metadata and separate diagnostic motion. Complete independent import/view review and separate human model acceptance remain required. A current preserve-only mechanical handoff can feed later animation, with its own reviews. Read [Schematic to model](Schematic-to-Model); no manufacturing, circuit/physics certification, finished animation or runtime promotion is implied.

## CODE models and characters

The [CODE contract](https://github.com/TimothyMeadows/Hephaera/blob/main/.styles/.pipelines/code/PIPELINE.md) requires THREEJS. Author primary runtime geometry in host-native source; do not replace it with a downloaded/generated mesh or model library. A copied external model may serve as a template or reference, subject to rights, rather than becoming the primary CODE mesh.

Model commands create and validate manifests, advance ordered passes and record actual reviews. Character and creature workflows add linked profiles, six ordered gates, independent visual review, calibrated machine evidence and lifecycle ownership. Read `threejs-build-code-characters` and its reviewer counterpart before using gate/evidence commands. A measured report or generated review packet cannot supply independent artistic judgment or human runtime acceptance.

CODE does not reinterpret itself for Unity or another engine. Choose a compatible workflow explicitly when the selected engine cannot consume the requested source-authoring method.

## BLENDER authoring

The [BLENDER contract](https://github.com/TimothyMeadows/Hephaera/blob/main/.styles/.pipelines/blender/PIPELINE.md) targets Blender 4.5 LTS. Preserve immutable `.blend` sources, author in declared repository-local working copies and checkpoint before destructive operations. Stage renders and exports for technical, visual and intended-runtime review.

Use `direct-blender-production` and the applicable modeling, UV, material, procedural, rigging, simulation, camera, rendering, export and review skills. Live authoring requires a compatible connected Blender tool and prefers typed operations. Exact-content validated `bpy` is an explicit route when typed tools are insufficient; the local CLI remains inspection/validation only. Do not turn CLI inspection into silent standalone authoring.

Proof, floor-plan construction/export, schematic parts/assembly/export, animation and action workflows have narrow fixed-script batch exceptions. Those exceptions do not authorize arbitrary Python, imported handlers, add-ons or a different authoring backend.

## Optional external asset libraries

Configured libraries are read-only source locations, not pipelines. Do not prompt for or probe them during ordinary startup. When at least one is configured and the task needs a 3D asset, inspect relevant libraries before creating or downloading a replacement:

```bash
bash .hephaera/commands/list-external-asset-libraries.sh
bash .hephaera/commands/inspect-external-asset-library.sh studio
bash .hephaera/commands/copy-external-asset.sh studio characters/hero
```

Use the selected project-local copy at `assets/models/<library-id>/<source-relative-path>`. Never open or execute directly from the library, write under its root, follow links, overwrite a project asset or allow source/destination overlap. Preserve provenance and modification/redistribution rights. An unavailable configured library stops the required search for direction.

## Review and downstream work

Validate budgets, transforms, dependencies, materials, topology and exports appropriate to the pipeline. Review actual views or complete motion ranges, then obtain independent and separate human acceptance where required. Runtime promotion remains an explicit operation on exact accepted bytes. [Animation and actions](Animation-and-Actions) are downstream workflows; they preserve the selected primary pipeline, engine and source ancestry.
