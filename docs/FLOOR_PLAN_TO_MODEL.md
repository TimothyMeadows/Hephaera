# Floor plan to model

`FLOOR_PLAN_TO_MODEL` produces detailed, unfurnished building architecture from an explicitly dimensioned design. Design floors individually, review the whole architectural package, then construct and verify editable Blender source and portable visual/collision models.

The feature is available on repository `main` after the floor-plan integration. Published `5.1.0-rc.1` predates it. Use a source version containing this feature until a later reviewed package includes it; the normal [installation order](../README.md#install) remains unchanged. This feature does not publish a new installer release.

For a practical start, use the [example walkthrough](../examples/floor-plan-to-model/README.md). The [wiki reference](../wiki/Floor-Plan-to-Model.md) explains design and review decisions, and the [command argument reference](../commands/BUBO_ARGUMENTS.md#floor-plan-to-model) is the host interface authority.

## Scope and ownership

Supported designs include straight and angled walls, single/multiple storeys, courtyards, openings, stairs and landings, railings, roofs, facade details and materials. Rooms remain empty. Curved forms, automatic CAD/raster conversion, furniture, interaction systems, gameplay and engine adapters are deferred.

Hephaera owns selection, host policy, source rights, approvals and provenance. The pinned Bubo dependency owns dimensional validation, vector drawings, geometry, fixed audited Blender scripts, export and independent re-import verification. The pipeline is engine-agnostic; it preserves `ENGINE.md` and the `PROOF_TO_MODEL` default. Pure procedural architecture needs no `MEDIA.md` or generation provider. Generated reference images follow their separately selected media workflow.

## Prerequisites and selection

Use an installed host at `<project-root>/.hephaera`. Source transport, Node.js/Bash and the existing .NET 10 SDK must satisfy the [runtime prerequisites](../wiki/Bubo-Runtime.md). Initialize and explicitly build the exact recorded dependency:

```bash
bash .hephaera/commands/initialize-bubo-runtime.sh
bash .hephaera/commands/build-bubo-runtime.sh
bash .hephaera/commands/resolve-skill.sh build-floor-plan-models
```

Require a compatible skill result. Admission verifies the current gitlink, lock, clean dependency, API, build and resources. This workflow requires Bubo's complete `architectural-export` capability with all nine operations and modeling/export available. A workflow name alone is insufficient. Initialization/build never installs a missing SDK or Blender.

Keep the project's existing style and choose the pipeline for the task:

```bash
bash .hephaera/commands/resolve-art-pipeline.sh \
  --override FLOOR_PLAN_TO_MODEL --json \
  --evidence .hephaera/.cache/tasks/fp/floor-selection.json
```

The receipt binds the actual `STYLE.md` hash and remains task-scoped. Supply it to `init --selection`. To make the pipeline the project's primary instead, explicitly regenerate the style contract with the user's selected styles; see [visual pipelines](../wiki/Visual-Pipelines.md). Selection does not install tools or grant model acceptance.

Native construction/export/review currently require supported 64-bit Windows committed-memory enforcement and an existing selected Blender 4.5 LTS executable. Design initialization, validation and preview work without Blender. `doctor` reports missing prerequisites. Use short project/task/asset/version paths on Windows: the host checks known bundle, output and temporary paths against Blender's file/directory limits. These necessary checks do not certify every Blender/SDK internal path or actual execution readiness. No path failure selects another backend or changes Windows settings.

## Design source

`bubo-building-plan/v2` is the construction-capable source. Its complete dimensional source, construction profile, materials, tolerances and budgets participate in approval. `v1` remains design-only; there is no silent upgrade.

The native contracts at the reviewed implementation snapshot are:

- [v2 plan schema](https://github.com/TimothyMeadows/Bubo/blob/653271aacbb2ff15c20b56d917aa9df5834cfdea/resources/floor-plan-to-model/building-plan-v2.schema.json) and [construction contract](https://github.com/TimothyMeadows/Bubo/blob/653271aacbb2ff15c20b56d917aa9df5834cfdea/resources/floor-plan-to-model/CONSTRUCTION.md).
- [export/review contract](https://github.com/TimothyMeadows/Bubo/blob/653271aacbb2ff15c20b56d917aa9df5834cfdea/resources/floor-plan-to-model/EXPORT.md), [package/review schema](https://github.com/TimothyMeadows/Bubo/blob/653271aacbb2ff15c20b56d917aa9df5834cfdea/resources/floor-plan-to-model/export-package.schema.json) and [semantic schema](https://github.com/TimothyMeadows/Bubo/blob/653271aacbb2ff15c20b56d917aa9df5834cfdea/resources/floor-plan-to-model/semantics.schema.json).

Those links identify documentation provenance. Execution always uses the current [lock](../runtime/bubo.lock.json) and verified installed resources. Resolve an exact local schema without building or installing anything:

```bash
node .hephaera/commands/lib/bubo-runtime.cjs resource floor-plan-to-model/building-plan-v2.schema.json
```

Source coordinates are XY metres with absolute Z up and one shared origin/datum. Finished-floor elevation is the slab top; slabs extend down. Room boundaries describe finished clear space, walls have explicit centerlines/thicknesses, and openings preserve their declared apertures. Courtyards and stairwells require actual declared voids. Preserve stable IDs and explicit room/vertical connectivity. Reference pictures guide design; they do not determine authoritative dimensions automatically.

Native relational validation checks the full design rather than only JSON shape: conflicting/overlapping geometry, required-room reachability, opening intervals, floor alignment, roof coverage, stairs, slab connections and declared clearances. Choose finite detail, geometry, output and process allowances before whole-design approval. Exceeding an allowance fails rather than simplifying or widening it automatically.

## Host input records

`init` requires the plan plus two explicit project-local JSON records. Their exact bytes, STYLE/selection and referenced permissions become immutable per-version policy inputs. Unknown fields, malformed JSON, duplicate properties and stale source hashes are rejected.

### Rights

The rights record has these fields:

| Field | Required value |
| --- | --- |
| `schemaVersion` | `hephaera-floor-plan-rights/v1` |
| `planSha256` | SHA-256 of the exact prepared plan bytes |
| `status`, `rightsHolder` | `owned` or `licensed`, and the actual nonblank rights holder |
| `scope` | `floor-plan-to-model` |
| `evidence` | Array of local `{ "path": "...", "sha256": "..." }` permission/license records |
| `referenceInputs` | Array of explicit reference records, or `[]` |

Each reference record contains `path`, `sha256`, `status`, `rightsHolder` and its own `evidence` array. Licensed plans/references require evidence. Owned plans still declare both arrays explicitly. Keep the permission evidence and source notices. A copied example uses licensed-source evidence; copying it does not make the source user-owned.

### Process budget

```json
{
  "schemaVersion": "hephaera-floor-plan-budget/v1",
  "timeoutSeconds": 600,
  "maxLogBytes": 16777216,
  "maxPrivateBytes": 8589934592
}
```

This is an explicit engineering-example allowance, not a general building default. Values are safe integers: timeout 1..86400 seconds, log 1024..1073741824 bytes, committed memory 67108864..68719476736 bytes. They supplement the approved plan's own work/output limits. A configured memory cap is not an observed resident/GPU peak. Continuation cannot replace or widen the saved budget.

## Command reference

Run from the host root as `bash .hephaera/commands/floor-plan-to-model.sh OPERATION`. `--root PROJECT` may explicitly select the same host; otherwise the installed wrapper resolves it. Use the manifest path returned by `init`.

| Operation | Inputs and result |
| --- | --- |
| `init` | `--task ID --asset ID --version ID --plan JSON --rights JSON --budget JSON`; optional `--selection JSON --parent-manifest JSON`. Preserves originals and returns a canonical manifest. |
| `validate` | `--manifest JSON`. Validates the current exact source and dimensions. |
| `preview` | `--manifest JSON`. Produces the complete dimensioned SVG design package without approving it. |
| `doctor` | `--manifest JSON`; optional `--blender ABSOLUTE_EXECUTABLE`. Reports tool/platform/path prerequisites and their readiness scope. |
| `record` | `--manifest JSON --kind whole-building-design\|independent-model\|human-model --reviewer ID --evidence JSON`. Consumes an actual current decision. |
| `build` | `--manifest JSON --blender ABSOLUTE_EXECUTABLE`. Requires the approved v2 design and constructs detailed source/collision geometry. |
| `export` | `--manifest JSON --blender ABSOLUTE_EXECUTABLE --author ID`. Seals source and portable outputs, then verifies separate visual/collision imports. |
| `review` | `--manifest JSON --blender ABSOLUTE_EXECUTABLE`. Renders complete review views from the imported delivered visual GLB. |
| `status` | `--manifest JSON`. Reports current successful/failed evidence and separate approval states. |

The command has no actor/recipe/toolchain flags, setup, generation, promotion or engine-integration operation. Host execution context, runtime identities and output roots are protected. Model-consuming continuation retains the exact construction tool identity; pure design operations do not require an unavailable historical Blender installation.

## Approval and model review

Whole-building approval covers every dimensioned floor, roof, all four elevations, the principal section and sections through vertical connections. Review room sizes, wall thicknesses, openings, floor elevations, roof geometry, stairs and their relation across storeys. Acceptance of one floor or screenshot cannot approve the complete building.

Whole-design evidence uses `bubo-floor-plan-review/v1`: `kind`, `decision`, `human`, `reviewer`, `reason`, `asset`, `version`, `planSha256`, `designFingerprint` and `reviewedArtifacts`. Bind the actual user decision to the current fingerprint and complete drawing-hash dictionary. The command records supplied evidence; it does not authenticate a human or create their approval.

After construction/export, inspect the delivered package and independent import reports. Required rendered model views are `storeys + stairs + 6`: every floor, four cardinal exteriors, roof, principal section and every stair section. A source `.blend` render does not demonstrate the delivered GLB.

Model-review fields and exact artifact binding are defined in the package schema's `modelReview` definition. They include package SHA, both verification SHAs, complete view-index SHA, reviewer/role/reason and all reviewed artifact hashes. The two decisions are separate:

- `independent-model` uses `human:false`, a reviewer distinct from the sealed model author and no inherited human decision.
- `human-model` uses `human:true` and the current approved independent-review hash. A rejection or stale independent decision cannot authorize it.

Technical verification, independent review, human model acceptance and game/runtime acceptance are separate. Engineering fixtures may exercise these protocols with explicitly synthetic assertions; those are not human approval of a production building.

## Outputs and measured traversal

The sealed payload contains `package.json`, `building.blend`, `visual.glb`, `collision.glb`, `building-plan.json`, `semantics.json`, approved SVG drawings and construction/design provenance. The inventory excludes its own manifest; the raw package hash identifies it externally. Producer/import/view reports and submitted decisions stay outside the sealed payload and bind that hash.

Semantics preserve floors, materials, openings, source IDs, hierarchy, anchors and door pivots. Visual and collision geometry remain separate. Doors retain dynamic collision and closed-at-zero pivots; measured routes explicitly state the final-open pose. Whole-building convex colliders and remeshing that changes openings are not substitutes for these representations.

Native clearance evidence uses the declared player envelope and constructed geometry. Export verifies geometric preservation in actual visual/collision imports. It does not perform target-engine walking, navigation or physics testing. Engine import, movement/collision behavior, interaction and explicit asset promotion remain later integration work.

## Revisions and recovery

The manifest lives at `.hephaera/.cache/tasks/<task>/floor-plan-to-model/<asset>/<version>/manifest.json`. Policy/input snapshots, dispatch receipts and review history are durable task state. Native attempts remain under task-scoped `.art-staging/`; nothing here copies an asset into a game.

Use a new version and explicit `--parent-manifest` for another version of the same task-owned asset. Parent ancestry preserves the prior manifest/original-plan identity without transferring approval. Rebind the new source to current style/runtime and refresh affected rights, budgets, drawings and decisions. Do not overwrite immutable originals, replace expected hashes or edit older records to match a revision.

Keep failed, interrupted, rejected and oversized attempts. A latest failure or rejection cannot fall back to an older success. Inspect `status` and the retained operation log, correct the actual prerequisite or design, and continue through the appropriate new attempt/version. Never delete `.cache`, silently increase limits, install tools, switch pipelines or promote a model to make a check pass.
