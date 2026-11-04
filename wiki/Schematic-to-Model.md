# Schematic to model

`SCHEMATIC_TO_MODEL` creates dimension-driven mechanical assets with independently constructed parts and separately addressable physical instances. Design and approve the complete object, build its part definitions, then assemble and verify its declared rigid and flexible movement. Vehicles, opening devices and curved-hull vessels are supported examples, not promises of complete commercial engineering.

Use the [practical guide source](https://github.com/TimothyMeadows/Hephaera/blob/main/website/content/docs/schematic-to-model.md), [technical host reference](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/SCHEMATIC_TO_MODEL.md), [command arguments](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/BUBO_ARGUMENTS.md#schematic-to-model) and [example walkthrough](https://github.com/TimothyMeadows/Hephaera/tree/main/examples/schematic-to-model). This page is reviewable wiki source; a source merge does not publish GitHub's separate wiki repository.

## Availability and selection

The feature was added to repository main after published `5.1.0-rc.1`. That package version does not supply these commands. A baseline version must include the workflow and its reviewed Bubo `7ab99a9f12761095e5a3ee5cfb37d2a679b026a7` pin, verified API/resource/build identity; a later package must explicitly contain those changes. Source merges do not publish a package or move an existing pinned installation. Preserve [package-first installation order](Installation-and-Layout) and the normal managed-update workflow. Do not replace a managed installation with an unrecorded checkout to obtain a new feature.

Read `STYLE.md`, resolve `build-schematic-models` and require compatibility. Select the primary pipeline through an agreed STYLE contract, or record a task-local prompt override without rewriting that contract:

```bash
bash .hephaera/commands/resolve-skill.sh build-schematic-models
bash .hephaera/commands/resolve-art-pipeline.sh --override SCHEMATIC_TO_MODEL --json \
  --evidence .hephaera/.cache/tasks/schematic/pipeline-selection.json
```

The task folder must already exist for its evidence. The coordinating skill is engine-agnostic; selection preserves `ENGINE.md`, the default PROOF_TO_MODEL pipeline and independent AUDIO/MUSIC/VOICE contexts. Pure procedural schematic work needs no MEDIA contract. Generated references follow their separately authorized media workflow. Configured external libraries retain their [read-only search/copy rules](Visual-Pipelines#optional-external-asset-libraries).

## Authority and actual prerequisites

Hephaera owns selection, exact source rights, budgets, approvals, provenance and continuation. Bubo owns dimensional/connectivity validation, drawings, geometry, assembly evaluation, motion proofs and export/re-import checks. The current [runtime lock](https://github.com/TimothyMeadows/Hephaera/blob/main/runtime/bubo.lock.json), actual gitlink, audited resources and explicit clean build must agree. Production never builds source, installs tools or falls back to another checkout implicitly.

```bash
bash .hephaera/commands/initialize-bubo-runtime.sh
bash .hephaera/commands/build-bubo-runtime.sh
```

These commands require existing Git and .NET 10 tools. Admission requires API2 and the complete eleven-operation `portable-assembly-export` capability, including independently constructed parts, assembly, motion, export and the mechanical handoff. A capability declaration is not executable readiness.

Initialization, validation and preview need no Blender. Native construction/export/review require an explicitly selected existing absolute Blender 4.5 LTS path and currently supported 64-bit Windows aggregate committed-memory enforcement. Known prototype, temporary, export/re-import and review paths must fit before authoring starts. Doctor can withhold a selected tool when those paths fail and report that it was not probed. These necessary path checks do not certify every SDK path or actual output quality. No SDK, Blender, model, driver, provider or license is installed/accepted automatically.

## Design contracts and construction limits

Use `bubo-assembly-design/v2` with the explicit assembly profile for current assembly/readiness/export. V1 supports design previews and independent part prototypes; its approval does not become v2 assembly approval. The local native authority is `.hephaera/runtime/bubo/resources/schematic-to-model/`:

| Authority | Purpose |
| --- | --- |
| `README.md`, `assembly-design.schema.json` | Closed design shape, coordinates, stable identities, parts/instances, joints, mechanisms, routes and connections |
| `PARTS.md` | Independently constructed parts and the bounded geometric subset |
| `ASSEMBLY.md` | Interfaces, sampled rigid/flexible motion, clearance/contact policy and limits |
| `EXPORT.md` | Portable package, actual re-import checks, complete views and current handoff |

The [reviewed native design](https://github.com/TimothyMeadows/Bubo/blob/7ab99a9f12761095e5a3ee5cfb37d2a679b026a7/resources/schematic-to-model/README.md), [parts](https://github.com/TimothyMeadows/Bubo/blob/7ab99a9f12761095e5a3ee5cfb37d2a679b026a7/resources/schematic-to-model/PARTS.md), [assembly](https://github.com/TimothyMeadows/Bubo/blob/7ab99a9f12761095e5a3ee5cfb37d2a679b026a7/resources/schematic-to-model/ASSEMBLY.md) and [export](https://github.com/TimothyMeadows/Bubo/blob/7ab99a9f12761095e5a3ee5cfb37d2a679b026a7/resources/schematic-to-model/EXPORT.md) links identify the integrated snapshot. Runtime admission always uses the installed lock; do not substitute the URL's revision for actual verification.

Capture purpose, size, appearance/materials, internal systems, moving parts, inspection needs, detail, tolerances and finite budgets. Separate observed reference facts, assumptions, unresolved details and simplifications before approval. References do not establish dimensions automatically. Automatic CAD/raster conversion and image-to-mesh reconstruction are outside this workflow.

Part definitions describe reusable geometry; physical instances describe each actual occurrence, transform, parent and identity. Identical bolts or wheels may share a definition, but every approved occurrence remains separately present and movable. Hardware/detail must be expressed by actual authored features; descriptive prose alone does not create threads or openings.

The fixed part bundle supports parameter-driven boxes/cylinders, convex-profile extrusions/revolves, circular-section sweeps, controlled profile lofts and ordered add/subtract openings. Unsupported, degenerate, self-intersecting or disconnected results fail. Current construction requires a connected closed boundary; fully sealed inner cavity shells require another explicitly authored design. It does not decimate, remesh, widen tolerances or replace missing geometry with a proxy after failure.

Coordinates use metres, right-handed XY and Z up, with explicit local frames and the documented Rz × Ry × Rx convention. Portable glTF uses the recorded Y-up conversion. Preserve approved local precision for small hardware inside large assemblies. Joint angles use degrees, sliders use metres and screw pitch uses signed metres per revolution.

## Rights, limits and immutable host policy

Initialization requires an exact design plus two project-local records:

| Record | Required content |
| --- | --- |
| `hephaera-schematic-rights/v1` | Exact `designSha256`, `owned`/`licensed` status, actual `rightsHolder`, `scope: schematic-to-model`, `evidence` and `referenceInputs` arrays |
| `hephaera-schematic-budget/v1` | Explicit finite safe-integer `timeoutSeconds`, `maxLogBytes`, `maxPrivateBytes` |

Evidence entries contain a local path and exact SHA-256. Reference inputs additionally identify their own rights status/holder/evidence. Licensed inputs require permission evidence; copying a native MIT example does not make it automatically user-owned. Preserve notices and exact source/modification ancestry.

Process limits are timeout 1–86400 seconds, logs 1024–1073741824 bytes and private memory 67108864–68719476736 bytes. They supplement the design's geometry/output/sampling limits; `assemblyProfile.maxGeometryChecks` is distinct from design `budgets.maxValidationChecks`. Choose suitable explicit limits before approval. Continuation does not silently increase them.

The immutable `hephaera-schematic-host-policy/v1` envelope binds design, rights/reference files, budget, STYLE/selection, engine/library and actual runtime/build identity. The native policy inventory permits at most 128 unique references including the envelope; exceeding it fails before that envelope is written. Current manifest/parts/assembly/export state stays writable, not reclassified as immutable input.

## Operations and paths

Run commands from the host root through `bash .hephaera/commands/schematic-to-model.sh`. The wrapper can resolve the installed host; `--root ABSOLUTE_PROJECT` is explicit when needed.

| Operation | Required inputs and meaning |
| --- | --- |
| `init` | `--task ID --asset ID --version ID --design JSON --rights JSON --budget JSON`; optional `--selection TASK_JSON --parent-manifest JSON` |
| `validate` | `--manifest JSON`; native dimensions, connectivity and design evidence |
| `preview` | `--manifest JSON`; complete dimensioned design/drawing/BOM package |
| `doctor` | `--manifest JSON`; optional existing `--blender ABSOLUTE_EXE`, reporting actual prerequisites |
| `record` | `--manifest JSON --kind whole-assembly-design\|independent-model\|human-model --reviewer ID --evidence TASK_JSON` |
| `build-parts` | `--manifest JSON --blender ABSOLUTE_EXE`; independently author/reopen verified part definitions |
| `assemble` | Same manifest/tool; approved v2 design and current verified parts |
| `prove-motion` | Same manifest/tool; current assembly and every declared diagnostic sample |
| `export` | Same manifest/tool plus `--author ID`; seal canonical rest and diagnostic packages after current readiness |
| `review` | Same manifest/tool; complete delivered-geometry and motion views |
| `status` | `--manifest JSON`; current design/parts/assembly/export freshness, including retained tool identity when applicable |

Schematic init takes no actor, arbitrary recipe, toolchain or output-root flag. Unknown/caller-supplied protected execution identities are rejected. There is no setup, arbitrary-script or promotion operation.

The canonical manifest is `.hephaera/.cache/tasks/<task>/schematic-to-model/<asset>/<version>/manifest.json`. The host envelope and native `parts.json`, `assembly.json`, `exports.json` are siblings. Immutable originals and attempted outputs stay in `.art-staging/tasks/<task>/schematic-to-model/<asset>/<version>/`. State/dispatch receipts and reviews remain under the task cache. No model is copied into a game.

## Whole-design approval and part-first assembly

Preview emits six dimensioned orthographic drawings, every declared internal section, independent part sheets, an exploded assembly, connections and hierarchical BOM. V2 adds `assembly-details.svg` and `flex-rigs.svg`. Review every artifact together, including dimensions, local frames, inventory, interfaces, materials/detail, tolerances, limits and simplifications.

Record actual human whole-package approval as `whole-assembly-design` using `bubo-schematic-review/v1`, the exact design/fingerprint and complete artifact mapping. Per-view approvals, a successful validator and synthetic fixture decisions do not grant real human whole-design acceptance. A revision changes the package identity and invalidates affected approval and dependent evidence.

Build each part definition before assembly. Independently reopened prototypes are checked for geometry, materials, dimensions, ownership and approved quantities. Later instances may share that verified geometry while retaining independent objects/transforms. Preserve approved part boundaries, openings, hardware and numerical policy; do not fuse components to pass a budget.

## Joints, mechanisms and flexible geometry

Fixed, hinge, rotary, slider and screw joints name actual parent/child interfaces, explicit axes and limits. Supported coupling families are spur gears, rack-and-pinion, pulley/belt, slider-crank and planar four-bar. Ratios, pitch geometry, linkage lengths and applicable open/crossed branches must be declared. Unsupported/singular closure, incompatible axes, conflicting ownership, broken coupling or invalid travel is rejected.

Each wire, hose, spring or belt occurrence owns actual skin geometry and its deformation rig. The current flexible subset retains the approved circular-sweep source rings; it does not invent extra subdivisions. Check real endpoints/terminal ownership, minimum bend radius, stretch/compression and travel against the design. Electrical support records named terminals, connectors, power/signal relationships and routing, not circuit behavior.

Diagnostic clips sample each independent driver with its coupled followers, endpoints, intermediate/rest poses and full cycles where permitted. Report coverage and measured clearance/contact/deformation evidence. They do not certify arbitrary simultaneous-driver combinations, continuous collision, friction/tension, manufacturing or physics. A rigid cycle need not close a belt's material phase. Diagnostic time is normalized and does not prescribe production speed.

## Portable package and complete model review

The sealed `bubo-schematic-export-package/v1` contains editable `assembly.blend`, animation-free `assembly.glb`, approved design/drawings, `assembly-metadata.json`, hierarchical `bom.json` and provenance. `diagnostic-motion/` separately contains diagnostic Blender, GLB and motion metadata. Every physical occurrence remains separately addressable; each flexible occurrence owns its rig/skin.

Native verification parses the actual portable bytes and independently imports rest and diagnostic GLBs in fresh processes. It compares evaluated positions/topology, part dimensions, quantities, local/world transforms, materials, interfaces, pivots, skin weights/bindings, animation channels and every sampled pose to current construction evidence. Metadata or node counts alone do not establish a geometric match.

Review views cover six orthographic directions, two exterior angles, every declared internal section, an exploded view and every diagnostic sample. If no section was authored, a central inspection cut is a diagnostic image, not an approved design section. Technical/view certificates remain separate from sealed payloads and human decisions.

`independent-model` uses `bubo-schematic-model-review/v1`, a reviewer distinct from the model author, `independent: true`, exact model/package/rest/diagnostic/views hashes and all current `reviewArtifacts`. Separate `human-model` evidence requires actual human judgment and the current independent-review identity. Technical success and synthetic fixtures never create that human decision or runtime acceptance.

## Preserve-only animation handoff

A current independent model decision can issue `bubo-mechanical-assembly-handoff/v1`. It binds package/model/design/metadata/provenance/technical/independent review, actual rest nodes/skins/components and current design/parts/assembly/export state hashes. Optional human-model evidence remains a separate fact.

For explicitly selected [MODEL_TO_ANIMATION](Animation-and-Actions), use recipe `profile: mechanical-assembly`, `rig.mode: preserve`, the exact canonical rest GLB and current `--handoff`. Receiving copies immutable ancestry and rechecks original sources. It preserves every rigid instance, local pivot and flexible rig; no new rig, missing component or retargeting is permitted. Existing skinned/articulated/rigid restrictions remain unchanged.

Relevant state or payload changes invalidate the descriptor; do not silently refresh it. Receiving does not inherit diagnostic clips as finished production animation or supply rig/motion/human runtime approval. Engine-specific playback/collision and asset promotion remain later selected operations; Phaser's 2D path needs an explicit compatible sprite/pre-rendered handoff.

## Revisions, failures and examples

Use a fresh version and `--parent-manifest` for changed design/style/rights/budgets/runtime or affected tool/construction identity. Preserve the exact parent snapshot and old attempts/reviews. Reuse parts only when their definitions and relevant construction inputs are identical and verified. A failed/interrupted latest attempt cannot silently select an older successful result; keep failures and ask status for the actual unavailable step.

Do not delete task cache, widen approved limits after failure, relabel old approvals or switch pipelines/backends silently. Cancellation and owned-child cleanup must be observed, not assumed from a stopped parent command. Cooperative path/file bounds are not an OS sandbox or disk quota.

The three prepared examples are an explicitly scoped wheeled platform, an opening electronic enclosure with separate hardware/wire, and a curved hull with rudder/bearing parts. Dedicated mechanism/flexible fixtures exercise additional families. Actual technical Blender/export evidence and automated synthetic review assertions remain distinct from real human production acceptance. These examples are not manufacturing designs, circuit simulations, finished animations or promoted game assets.
