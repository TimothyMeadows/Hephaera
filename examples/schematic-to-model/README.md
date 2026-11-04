# Schematic examples

Start with a small mechanical exercise before designing a production asset. These three examples come from the exact pinned Bubo source and retain its MIT notice. They are deliberately simplified engineering fixtures, not complete commercial vehicles, electronics or vessels.

Use an installed source version that contains `schematic-to-model.sh`; check the [installation instructions](../../README.md#install) for version availability. A package download or an older installed version does not automatically contain this feature. Run the commands below from your host project's root, with Hephaera at `.hephaera/`.

| Case | What you can inspect | Important limit |
| --- | --- | --- |
| `vehicle` | A chassis and four separately addressable wheel occurrences, sharing their wheel definition | Unmarked symmetric wheels make rotation hard to see in still images; approved explode offsets are zero. |
| `device` | An opening enclosure, battery, motor, two threaded fasteners, wire and named electrical connections | Closed exterior views hide fastener travel; inspect the bound diagnostic source or GLB with appropriate isolated views. |
| `vessel` | A curved hull, separate deck, shaft, rudder and bearing/bracket parts | This is an idealized hull/mechanism exercise, not seaworthiness or manufacturing certification. |

The [briefs](brief.md) describe the intent. Authoritative structured geometry stays in `.hephaera/runtime/bubo/resources/schematic-to-model/examples-v2/`; this directory does not maintain a second geometry copy.

## Prepare licensed inputs

Read the project's `STYLE.md` and resolve the coordinator before using it:

```bash
bash .hephaera/commands/resolve-skill.sh build-schematic-models
```

The source dependency must already be initialized. Native production later requires its explicitly built matching CLI, existing Blender 4.5 LTS and supported Windows memory enforcement. Follow the [technical reference](../../docs/SCHEMATIC_TO_MODEL.md) for those separate prerequisites; preparation installs and builds nothing.

Create an ordinary task first. Use short task, asset and version IDs on Windows. All preparation flags below are required:

```bash
node .hephaera/examples/schematic-to-model/prepare-example.cjs \
  --root . --case device --task sm --asset box --version v1 \
  --geometry-checks 50000000 --timeout-seconds 900 \
  --max-log-bytes 16777216 --max-private-bytes 8589934592
```

This explicitly chooses a 50,000,000 assembly geometry-check allowance, 900-second process timeout, 16 MiB log allowance and 8 GiB committed-memory cap for this exercise. They are example choices, not universal defaults. `--geometry-checks` accepts 1 through 50,000,000 and changes only `assemblyProfile.maxGeometryChecks`. Separate source validation, export-byte, triangle, drawing and sampling budgets remain unchanged and are listed in the preparation receipt. Inspect all of them before approving the complete design; do not increase a budget on an already approved run.

The fresh destination contains:

```text
.hephaera/.cache/tasks/sm/example-inputs/box/v1/
  design.json
  rights.json
  budget.json
  selection.json
  BUBO-LICENSE.txt
  preparation.json
```

The helper binds the actual STYLE hash, records the explicit geometry allowance, preserves the native source license and records the original source path, hash and Bubo revision. Its rights record says **licensed**, not user-owned. The task-local selection chooses `SCHEMATIC_TO_MODEL` without rewriting STYLE or its default. The receipt distinguishes changed fields from explicit bindings whose values already matched. Original source and license bytes remain untouched.

Preparation creates no approval, generated model, native process or runtime asset. It refuses an existing destination, unsafe paths, symlinks, read-only library overlap, transition fences or a conflicting managed-installation lease. Preserve failed or partial folders and choose a new version rather than overwriting them.

## Validate and preview the complete design

```bash
bash .hephaera/commands/schematic-to-model.sh init \
  --task sm --asset box --version v1 \
  --design .hephaera/.cache/tasks/sm/example-inputs/box/v1/design.json \
  --rights .hephaera/.cache/tasks/sm/example-inputs/box/v1/rights.json \
  --budget .hephaera/.cache/tasks/sm/example-inputs/box/v1/budget.json \
  --selection .hephaera/.cache/tasks/sm/example-inputs/box/v1/selection.json

manifest=.hephaera/.cache/tasks/sm/schematic-to-model/box/v1/manifest.json
bash .hephaera/commands/schematic-to-model.sh validate --manifest "$manifest"
bash .hephaera/commands/schematic-to-model.sh preview --manifest "$manifest"
bash .hephaera/commands/schematic-to-model.sh status --manifest "$manifest"
```

Use the manifest returned by `init`; the variable shows the expected path for these IDs. Review the dimensioned orthographic drawings, all declared sections, exploded assembly, BOM, connection diagrams, component detail and rig-policy sheets together. Inspect assumptions, simplifications, interfaces, moving ranges, clearances, materials and separate output budgets. Reference pictures do not supply dimensions automatically. These design steps need no Blender and grant no design approval.

For an original object, author its own complete design and accurate rights record. The fixtures' materials are diagnostic engineering choices, not an accepted interpretation of your project's style.

## Approve, build and inspect

After the user reviews the exact complete package, record their real decision using the schema in the [technical reference](../../docs/SCHEMATIC_TO_MODEL.md). This directory intentionally provides no pre-approved human receipt.

```bash
bash .hephaera/commands/schematic-to-model.sh record \
  --manifest "$manifest" --kind whole-assembly-design \
  --reviewer REVIEWER_ID --evidence .hephaera/.cache/tasks/sm/reviews/design-v1.json

blender_executable='C:/path/to/Blender-4.5/blender.exe'
bash .hephaera/commands/schematic-to-model.sh doctor --manifest "$manifest" --blender "$blender_executable"
bash .hephaera/commands/schematic-to-model.sh build-parts --manifest "$manifest" --blender "$blender_executable"
bash .hephaera/commands/schematic-to-model.sh assemble --manifest "$manifest" --blender "$blender_executable"
bash .hephaera/commands/schematic-to-model.sh prove-motion --manifest "$manifest" --blender "$blender_executable"
bash .hephaera/commands/schematic-to-model.sh export --manifest "$manifest" --blender "$blender_executable" --author MODEL_AUTHOR_ID
bash .hephaera/commands/schematic-to-model.sh review --manifest "$manifest" --blender "$blender_executable"
bash .hephaera/commands/schematic-to-model.sh status --manifest "$manifest"
```

Replace the executable placeholder with the selected existing absolute Windows path. Inspect `doctor`; a missing tool, unsupported enforcement or necessary path failure remains unavailable. A capability declaration or successful path check does not establish actual native readiness.

Review the editable assembly, canonical rest GLB, independent raw/re-import certificates, component inventory, pivots, owned skins and complete diagnostic motion. The review package includes six orthographic views, two exterior angles, every declared section, an exploded view and every diagnostic sample. Some tiny or occluded parts still need close or isolated inspection in the exact bound source/model; an exterior screenshot does not certify hidden motion. Sampled articulation does not prove continuous collision, arbitrary combined-driver behavior, circuit simulation, finished animation or game behavior.

Independent model review can issue a current preserve-only `mechanical-assembly` handoff. Human model acceptance remains a separate decision. MODEL_TO_ANIMATION requires its own rig/motion reviews and later human runtime acceptance. Export and preparation copy no assets into a game and offer no promotion operation.

## Other cases and revisions

Use `--case vehicle --asset cart` or `--case vessel --asset hull` with intentionally chosen budgets and a fresh destination. They use the same sequence and retain their own complete package identities.

For a revised design, prepare a new version and initialize it with `--parent-manifest` pointing to the same asset's prior task-owned manifest. Keep originals, failed attempts, licensed sources and historical reviews. Approval and dependent model evidence must be refreshed for the exact revision. Never edit saved expected hashes, rebind an old handoff or treat synthetic backend QA decisions as the user's acceptance.
