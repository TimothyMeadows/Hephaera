# Floor plan to model

`FLOOR_PLAN_TO_MODEL` turns one approved, dimensioned architectural design into detailed unfurnished building models. It supports straight and angled walls, multiple storeys, courtyards, explicit openings and vertical connections. It produces game/environment assets with editable source and portable exports.

Use the [practical guide](https://hephaera.com/docs/floor-plan-to-model/) for the everyday workflow, the [technical reference](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/FLOOR_PLAN_TO_MODEL.md) for flags/records, and the [example walkthrough](https://github.com/TimothyMeadows/Hephaera/blob/main/examples/floor-plan-to-model/README.md) for reproducible prepared inputs. The feature is available on repository main; published `5.1.0-rc.1` predates it. A later reviewed package must include the feature before its installer version can supply these commands. Preserve the normal [package-first installation order](Installation-and-Layout).

## Select the production method

Read `STYLE.md`, resolve `build-floor-plan-models` and require compatibility. Resolve `FLOOR_PLAN_TO_MODEL` as the primary or as a current task's explicit override. Task selection binds the current STYLE hash and does not rewrite the project contract. `PROOF_TO_MODEL` remains the default.

```bash
bash .hephaera/commands/resolve-skill.sh build-floor-plan-models
bash .hephaera/commands/resolve-art-pipeline.sh --override FLOOR_PLAN_TO_MODEL --json \
  --evidence .hephaera/.cache/tasks/fp/floor-selection.json
```

The pipeline is engine-agnostic and preserves `ENGINE.md`. All-procedural plans need no media provider or `MEDIA.md`. Generated inspiration follows its separately authorized media workflow. Reference pictures do not establish trustworthy dimensions automatically. Configured external asset libraries retain their [read-only search/copy rules](Visual-Pipelines#optional-external-asset-libraries).

## Execution authority and prerequisites

Hephaera owns policy, rights, selection, approvals and provenance. Bubo owns native contracts, dimensional validation, drawings, geometry, audited scripts, export and re-import verification. Use the current [Bubo lock](https://github.com/TimothyMeadows/Hephaera/blob/main/runtime/bubo.lock.json), its actual gitlink and an explicit clean build. Admission requires API 2, matching resources/build, and the complete nine-operation `architectural-export` capability with modeling/export available. A declared workflow or an initialized source checkout alone is not executable readiness.

```bash
bash .hephaera/commands/initialize-bubo-runtime.sh
bash .hephaera/commands/build-bubo-runtime.sh
```

These commands require existing source-transport tools and the .NET 10 SDK. Modeling currently requires supported 64-bit Windows committed-memory enforcement and an explicitly selected existing Blender 4.5 LTS executable. Pure initialization, validation and preview work without Blender. No SDK, Blender, model, driver, provider, license acceptance or engine host is installed automatically.

Keep project/task/asset/version paths short on Windows. Known fixed source, output, partial-report and temporary paths must fit Blender's Windows file/directory limits before native modeling starts. `doctor` reports path prerequisites as unavailable and can withhold a selected tool without claiming it was probed. Raw native dispatch evidence and the host diagnostic remain separate. A necessary fixed-path pass does not certify every Blender/SDK internal path; actual execution and output checks remain required.

## Author the complete dimensional source

Use construction-capable `bubo-building-plan/v2`; v1 remains design-only. The installed resource directory is `.hephaera/runtime/bubo/resources/floor-plan-to-model/`. Its v2 schema, `CONSTRUCTION.md` and `EXPORT.md` are authoritative. The [technical reference](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/FLOOR_PLAN_TO_MODEL.md#design-source) links the reviewed native snapshot; runtime admission always uses the current local lock.

Before drawing approval, capture:

- Purpose, floors, footprint, architectural style and materials.
- Stable floors/rooms/walls/openings/stair/roof identities and one shared datum.
- Explicit room adjacency, exterior entry, required room routes, stairs, landings and slab/courtyard voids.
- Player radius/height/step/landing envelope, clearances and numerical tolerances.
- Construction detail profile and finite work, mesh/triangle, output, time, log and memory allowances.

All source positions use XY metres and absolute Z up. Floor elevation is the finished-floor top; slabs extend downward. Rooms describe clear finished-face space. Wall centerlines/thicknesses and opening offsets/sills/heads are explicit. An opening remains its reviewed size after frames and trim. A courtyard label does not cut a slab or roof; the actual voids/planes must be declared.

Stairs connect consecutive storeys through explicit rooms, landings and the required slab opening. Native validation checks actual dimensions, overlapping solids, headroom, support heights and the complete player body across transitions. Materials and profile dimensions cannot be guessed, clipped or changed to hide a conflict. JSON shape conformance and graph connectivity alone cannot establish built geometry or clearance.

## Bind source rights and budgets

`init` needs an exact plan plus two explicit host records:

| Record | Required content |
| --- | --- |
| `hephaera-floor-plan-rights/v1` | Exact `planSha256`, `owned`/`licensed` status, actual `rightsHolder`, `scope: floor-plan-to-model`, `evidence` and `referenceInputs` arrays |
| `hephaera-floor-plan-budget/v1` | Explicit safe-integer `timeoutSeconds`, `maxLogBytes` and `maxPrivateBytes` |

Permission evidence entries have local `path` and exact `sha256`. Each optional reference input has its own path/hash/status/holder/evidence. Licensed plans and references require permission/license evidence; a copied source is not automatically owned. Keep source notices. The example preparer preserves the Bubo license and records its copied engineering plan as licensed.

Hephaera captures exact rights, references, budget, style/selection and runtime identities in immutable per-version policy. It does not adopt a changed file's hash automatically. Process ceilings supplement the source's dimensional/geometry/export allowances. Select adequate finite values before approval; a later operation cannot silently widen them or replenish a prior allowance.

## Commands and state

Run the public wrapper from the host root. `--root PROJECT` explicitly selects that same host when needed. Returned paths are authoritative.

| Operation | Arguments beyond the root | Result or gate |
| --- | --- | --- |
| `init` | `--task --asset --version --plan --rights --budget`; optional `--selection --parent-manifest` | Preserves exact input/version ancestry and returns the manifest |
| `validate` | `--manifest` | Current structural and dimensional validation |
| `preview` | `--manifest` | Complete labeled, dimensioned SVG package |
| `doctor` | `--manifest`; optional `--blender` | Tool/platform/path inspection with explicit unavailable scopes |
| `record` | `--manifest --kind --reviewer --evidence` | Records an actual current whole-design, independent-model or human-model decision |
| `build` | `--manifest --blender` | Detailed source and collision construction from an approved v2 design |
| `export` | `--manifest --blender --author` | Sealed portable package and independent visual/collision imports |
| `review` | `--manifest --blender` | Complete delivered-model view set |
| `status` | `--manifest` | Current state, failures and separate acceptance gates |

There are no actor/recipe/toolchain, setup, generation, promotion or engine-integration operations. Runtime IDs, execution context and output roots are protected host fields. Explicit Blender paths are absolute and cannot overlap source/state/staging. Model-consuming continuation retains the current construction's exact tool; pure design does not require an old tool that is no longer available.

The canonical manifest is `.hephaera/.cache/tasks/<task>/floor-plan-to-model/<asset>/<version>/manifest.json`. The example helper keeps prepared sources in a separate task-local `example-inputs/` directory. Immutable native attempts stay under task-scoped `.art-staging/`. These are durable/versioned inputs and evidence, not disposable downloads. No command copies an output into a game.

## Approve every drawing together

Design floors separately, then review one exact package containing:

1. Every dimensioned floor plan in elevation order.
2. The complete roof plan and all four exterior elevations.
3. A principal vertical section, plus the section through every stair/connector.
4. Room/wall/opening/stair schedules, labels, clearances, construction details and their shared levels/dimensions.

Bind actual human approval to the plan SHA, complete drawing-hash dictionary and current design fingerprint. A single floor, image or metadata receipt cannot approve the building. Any source/detail revision invalidates whole-design approval and dependent models.

Whole-design evidence uses `bubo-floor-plan-review/v1` and includes kind/decision/human/reviewer/reason, asset/version, plan SHA, design fingerprint and `reviewedArtifacts`. A command records submitted evidence; a successful technical check cannot supply a person's acceptance. The documented examples create no approved human record.

## Review the delivered building

Construction preserves per-floor hierarchy, semantic identities, explicit pivots and separate visual/collision geometry. Native build produces actual floors, ceilings, shared walls, doors/windows, stairs/landings/railings, roofs, facades, trim and materials according to the approved profile. Rooms remain empty.

Export retains editable source and independently imports both delivered GLBs in clean Blender processes. Verification compares actual world-space triangles, winding, material assignments, hierarchy, openings and pivots against the immutable native scene within the approved tolerances. Matching object counts or bounds alone is insufficient. No tolerance increase or ideal-geometry repair hides a mismatch.

Render the imported delivered visual GLB for all required views: every floor, four cardinal exteriors, roof, principal section and each stair section. The required count is `storeys + stairs + 6`, giving 7/9/7 views for the three documented engineering cases. Source `.blend` screenshots cannot substitute for delivered-model evidence.

Independent and human model decisions bind the raw package SHA, both verification SHAs, complete view-index SHA and exact artifact inventory. `independent-model` uses `human:false` and a reviewer distinct from the sealed author. `human-model` uses `human:true` and the current approved independent-review hash. Preserve rejections; a stale or rejected decision cannot authorize acceptance.

## Package and later engine work

The sealed package contains editable `building.blend`, separate `visual.glb`/`collision.glb`, the v2 plan, semantic metadata, approved drawings and provenance. `package.json` inventories the payload except itself; its raw hash identifies the package externally. Producer/verification/view reports and submitted decisions remain outside that sealed inventory.

Source uses Z-up metres; GLB uses Y-up metres with the declared exact conversion. Semantic metadata preserves the source plan, floor elevations, material IDs, hierarchy, openings and anchors. Door geometry is closed at zero; dynamic leaf collision and explicitly final-open route evidence remain distinguishable. Collision proxies preserve rooms, entrances and stairwells rather than replacing the building with one convex hull.

Clearance evidence describes measured constructed geometry and its verified export preservation. Actual engine walking, physics, navigation, interaction and asset promotion require later target integration. No portable GLB supplies a gameplay system or runtime acceptance. Curves, automatic CAD/raster conversion and furnishings remain outside this release.

## Revise and recover

Use a new version with `--parent-manifest` for another version of the same task-owned asset. The native initializer checks the preserved parent original-plan hash and snapshots its manifest, without inheriting approval. The new source binds current style/runtime/policy and receives new applicable reviews.

| Observation | Action |
| --- | --- |
| Source, rights, style, budget or runtime changed | Preserve history; prepare current inputs in a new version with explicit ancestry and fresh approval |
| Doctor reports missing tool/platform or long Windows paths | Correct the selected prerequisite or use shorter project/task/asset/version paths; retain the unavailable result |
| Geometry, clearance or export comparison fails | Inspect the declared design/profile and measured failure; revise rather than clip, simplify or widen tolerances silently |
| Canceled, interrupted, oversized or failed attempt | Keep its files/state/logs; current status must not select an older success |
| Review/view/package bytes changed or latest decision rejected | Obtain fresh applicable verification and complete review; never rewrite expected hashes or transfer approval |

`status` and retained logs identify the current layer. Do not delete task cache, reset attempts, select a different pipeline or install missing software as recovery. See [maintenance and troubleshooting](Maintenance-and-Troubleshooting) for shared dependency/state diagnostics.
