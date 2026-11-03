# Floor-plan examples

Prepare and inspect a small complete building before designing a production asset. These examples use the pinned Bubo engineering sources and their source license. They are unfurnished architectural exercises; their materials, dimensions and process allowances need review for your project.

This workflow is on repository `main` after floor-plan integration. Published `5.1.0-rc.1` does not contain it. Follow the normal [installation instructions](../../README.md#install), using a source version containing this feature until a later package includes it. Run the commands below from an installed host project's root.

## Choose an exercise

| Case | Design | Model review views |
| --- | --- | ---: |
| `single-storey` | A 10 m by 8 m footprint, one empty studio, exterior entry and flat roof | 7 |
| `multi-storey` | Two 10 m by 8 m storeys with explicit stairs, landings and upper-floor void | 9 |
| `angled-courtyard` | An angled perimeter and courtyard void with roof planes around the open center | 7 |

The [brief](brief.md) shows how to request the two-storey design. The authoritative source examples remain in `.hephaera/runtime/bubo/resources/floor-plan-to-model/examples-v2/`; do not maintain a second geometry copy in this directory.

## Prepare exact inputs

Read `STYLE.md`, resolve the skill, and explicitly initialize/build the recorded Bubo source if it is unavailable. Existing tools are required; these commands install no SDK or Blender:

```bash
bash .hephaera/commands/initialize-bubo-runtime.sh
bash .hephaera/commands/build-bubo-runtime.sh
bash .hephaera/commands/resolve-skill.sh build-floor-plan-models
```

Create the ordinary task record for the work first. Use short task/asset/version IDs, especially on Windows. This preparation command selects the single-storey source and explicitly chooses its work/process limits **before** initialization or whole-design approval:

```bash
node .hephaera/examples/floor-plan-to-model/prepare-example.cjs \
  --root . --case single-storey --task fp --asset hall --version v1 \
  --geometry-checks 4000000 --timeout-seconds 600 \
  --max-log-bytes 16777216 --max-private-bytes 8589934592
```

The 4,000,000 comparison allowance, 600-second timeout, 16 MiB log and 8 GiB committed-memory cap are deliberate engineering-example choices. They are not universal building defaults or a way to widen a previously approved run. The original native examples reserve 1,000,000 geometry checks; complete portable export comparisons need their own adequate, finite allowance chosen in advance.

The preparer copies only the selected registered v2 source, binds the actual `STYLE.md` hash and sets the explicitly requested geometry allowance. Other design/material/dimension fields remain unchanged. It writes a fresh directory at:

```text
.hephaera/.cache/tasks/fp/example-inputs/hall/v1/
  plan.json
  rights.json
  budget.json
  selection.json
  BUBO-LICENSE.txt
  preparation.json
```

The rights record identifies the copied plan as licensed and hashes the preserved Bubo notice and original source. Selection is task-scoped and does not rewrite `STYLE.md` or its default pipeline. The preparation receipt lists exact sources and changed fields. No approval, model, native process or runtime asset is created. An existing destination is preserved; choose a new version instead of overwriting it.

Inspect the prepared plan and license. The example's diagnostic design/materials are a starting point for study, not an accepted interpretation of your art direction. For an original building, author its own v2 plan and accurate rights record. Choose its dimensions, materials and budgets before approval; source changes require current hashes and fresh applicable evidence.

## Initialize, validate and preview

```bash
bash .hephaera/commands/floor-plan-to-model.sh init \
  --task fp --asset hall --version v1 \
  --plan .hephaera/.cache/tasks/fp/example-inputs/hall/v1/plan.json \
  --rights .hephaera/.cache/tasks/fp/example-inputs/hall/v1/rights.json \
  --budget .hephaera/.cache/tasks/fp/example-inputs/hall/v1/budget.json \
  --selection .hephaera/.cache/tasks/fp/example-inputs/hall/v1/selection.json

manifest=.hephaera/.cache/tasks/fp/floor-plan-to-model/hall/v1/manifest.json
bash .hephaera/commands/floor-plan-to-model.sh validate --manifest "$manifest"
bash .hephaera/commands/floor-plan-to-model.sh preview --manifest "$manifest"
bash .hephaera/commands/floor-plan-to-model.sh status --manifest "$manifest"
```

Use the manifest returned by `init`; the variable above shows its expected path for these IDs. Read the returned drawing location and show every floor, roof, exterior elevation and section together. These steps work without Blender and provide no design approval.

## Approve the whole design, then model

The user reviews the complete package and makes an explicit decision. Preserve that actual decision in a task-local whole-building review record, bound to the current design fingerprint and every drawing hash. The [technical reference](../../docs/FLOOR_PLAN_TO_MODEL.md#approval-and-model-review) gives its fields. This example supplies no approved human receipt.

After the actual review record exists:

```bash
bash .hephaera/commands/floor-plan-to-model.sh record \
  --manifest "$manifest" --kind whole-building-design \
  --reviewer REVIEWER_ID --evidence .hephaera/.cache/tasks/fp/reviews/design-v1.json
```

On a supported 64-bit Windows host, select the existing Blender 4.5 LTS executable by its absolute path:

```bash
blender_executable='C:/path/to/Blender-4.5/blender.exe'
bash .hephaera/commands/floor-plan-to-model.sh doctor --manifest "$manifest" --blender "$blender_executable"
bash .hephaera/commands/floor-plan-to-model.sh build --manifest "$manifest" --blender "$blender_executable"
bash .hephaera/commands/floor-plan-to-model.sh export --manifest "$manifest" --blender "$blender_executable" --author MODEL_AUTHOR_ID
bash .hephaera/commands/floor-plan-to-model.sh review --manifest "$manifest" --blender "$blender_executable"
bash .hephaera/commands/floor-plan-to-model.sh status --manifest "$manifest"
```

Replace the executable placeholder with the selected Windows path, using forward slashes in Git Bash. Inspect `doctor` before modeling. Missing platform/tool enforcement or known Windows path constraints remain unavailable; no software installation, path-setting change or fallback occurs. A passed necessary path check still needs actual native execution evidence.

Review every delivered model view, both independent GLB imports, dimensions, openings, material assignments, door pivots and collision/clearance evidence. Record independent review and separate human model acceptance against the exact current package. Technical success does not grant either decision or game/runtime acceptance.

## Other cases and revisions

Repeat preparation with `--case multi-storey --asset stair` or `--case angled-courtyard --asset court`, using a fresh version and intentionally chosen budgets. Both cases use the same command sequence; complete views are 9 and 7 respectively.

For a revision of an existing asset, use a new prepared input/version and `init --parent-manifest` pointing to that asset's prior task-owned manifest. Preserve its originals, rights, review snapshots and failed attempts. The new complete design needs approval again. Do not edit saved expectations, reuse another asset's approval, delete cache, or copy outputs into a game as a shortcut.
