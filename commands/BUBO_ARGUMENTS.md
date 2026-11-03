# Hephaera asset command arguments

These host commands use the Bubo execution API version recorded in [the runtime lock](../runtime/bubo.lock.json), currently v2. Run them from the project root through `./.hephaera/commands/`. Maintainer checkouts use `./commands/`. Initialize the recorded dependency and explicitly build with `initialize-bubo-runtime.sh` and `build-bubo-runtime.sh` before native work; production never builds or installs software.

The proof, animation and action commands accept `--root PROJECT` (otherwise the shell wrapper resolves the installed host). Every operation except `init` requires `--manifest FILE`. Their `init` requires `--task ID --asset ID --version ID --actor ID` and defaults to `.hephaera/.cache/tasks/<task>/<workflow>/<asset>/<version>/manifest.json`. Proof and motion may select another manifest beneath that active task cache; action init requires its exact canonical path. Inputs must be repository-local and rights, selection, review and tool identities must be current. Hephaera supplies protected execution context internally. The floor-plan command has its own smaller input contract below.

## Proof to model

Use `proof-to-model.sh OPERATION` with common arguments above.

| Operation | Additional arguments |
| --- | --- |
| `init` | Exactly one `--proof ORIGINAL_IMAGE` or `--sources SOURCE_SET_JSON`; required `--rights JSON --recipe JSON --toolchain JSON`; optional `--brief JSON --proof-metadata JSON --selection JSON --library-search JSON`. `--mode multi-view` is the default; explicit `single-view-diagnostic` is separate. |
| `classify` | `--classification JSON` binds actual original-source research and classification. |
| `prepare-proofs` | `--proof-set JSON` registers six actual images/cameras and applicable generation evidence. It does not generate them. |
| `record` | `--kind KIND --reviewer ID --evidence JSON`; optional `--artifact FILE --source FILE` where the receipt contract uses them. |
| `setup` | Omit `--execute` for dry-run. `--execute` or `--execute true` requests separately authorized provisioning; applicable licenses and complete pinned file evidence are still required. |
| `doctor`, `preprocess`, `reconstruct` | Optional `--timeout SECONDS --gpu ID --blender EXECUTABLE`, subject to toolchain bounds and operation applicability. |
| `finish` | Optional `--blender EXECUTABLE --timeout SECONDS --gpu ID --finish-settings JSON --finish-budget JSON`. Rigid-parts and extra-attempt selections require their explicit current evidence. |
| `review` | Optional `--blender EXECUTABLE --timeout SECONDS --gpu ID`. |
| `reuse` | `--reuse-manifest FILE`; register and review the receiving asset before reuse. Input ancestry and affected reviews remain enforced. |
| `validate`, `status` | No additional operation arguments. |
| `promote` | `--destination assets/models/NAME`; requires current independent and separate human runtime acceptance. |

Single-view diagnostic continuations require `--mode single-view-diagnostic` explicitly on applicable operations. They cannot complete six-view production or promote. Diagnostic `init --reuse-manifest FILE` remains subject to donor checks; multi-view init rejects that shortcut. Missing tools, models, rights, source evidence or selected-pipeline capability stop the operation.

Pinned resources are under `.hephaera/runtime/bubo/resources/proof-to-model/`, including `recipes/static-prop.json`, `toolchain.json`, schemas and technical contracts. `PIPELINE.md` remains Hephaera policy; Bubo resources do not grant generation or human approval.

## Model to animation

Use `model-to-animation.sh OPERATION` with common arguments.

| Operation | Additional arguments |
| --- | --- |
| `init` | `--model GLB --rights JSON --recipe JSON`; select the existing Blender with `--blender EXECUTABLE` (the default is `blender`). Optional `--editable-source BLEND --source-metadata JSON`. |
| `author` | Optional `--revision JSON` for an explicit targeted motion revision. |
| `retarget` | `--motion-source GLB --mapping JSON`, with explicit cleared source clips and mapping. |
| `record` | `--kind KIND --reviewer ID --evidence JSON`. |
| `doctor`, `inspect`, `prepare`, `rig`, `bake`, `export`, `review`, `validate`, `status` | No additional operation arguments; use the selected recipe, tool and current manifest. |
| `promote` | `--destination assets/models/NAME`; current rig, complete motion, independent and human runtime acceptance are required. |

Recipes, schemas, audited scripts and engine adapters live under `.hephaera/runtime/bubo/resources/model-to-animation/`. Read the Hephaera `MODEL_TO_ANIMATION` policy contract. No Adobe provider, implicit installation, skeleton substitution or automatic asset acceptance is permitted.

## Model to action

Use `model-to-action.sh OPERATION` with common arguments.

| Operation | Additional arguments |
| --- | --- |
| `init` | `--motion-package JSON --recipe JSON --source-review JSON`; select existing Blender with `--blender EXECUTABLE` (default `blender`). The source review binds actual model, rig and clip identities and rights. |
| `record` | `--kind KIND --reviewer ID --evidence JSON`. |
| `doctor`, `inspect`, `compose`, `export`, `review`, `validate`, `status` | No additional operation arguments. |
| `promote` | `--destination assets/models/NAME`; separate action, independent and human runtime acceptance must be current. |

Action resources live under `.hephaera/runtime/bubo/resources/model-to-action/`. Initial composition requires in-place clips; missing clips/anchors or unsupported root extraction stop execution. Presentation cues never own authoritative targeting, movement or damage.

## Floor plan to model

Use `floor-plan-to-model.sh OPERATION [--root PROJECT]`. The wrapper resolves the installed host when `--root` is omitted. Resolve `FLOOR_PLAN_TO_MODEL` through the active `STYLE.md` or supply exact task-scoped prompt selection evidence. This leaves the default pipeline and engine selection unchanged.

| Operation | Arguments |
| --- | --- |
| `init` | Required `--task ID --asset ID --version ID --plan JSON --rights JSON --budget JSON`; optional `--selection JSON --parent-manifest JSON`. No actor, recipe or toolchain flag. |
| `preview`, `validate`, `status` | `--manifest JSON`. These operations do not discover or install Blender. |
| `doctor` | `--manifest JSON`; optional `--blender EXECUTABLE` selects an existing tool for prerequisite inspection. Declared capability does not prove readiness. |
| `build` | `--manifest JSON --blender EXECUTABLE`; requires the exact approved whole-building design and construction-capable v2 plan. |
| `export` | `--manifest JSON --blender EXECUTABLE --author ID`; requires the current successful construction and seals the model author's identity. |
| `review` | `--manifest JSON --blender EXECUTABLE`; renders complete views of the current independently verified package. |
| `record` | `--manifest JSON --kind whole-building-design\|independent-model\|human-model --reviewer ID --evidence JSON`; consumes an actual current review receipt. |

The canonical manifest is `.hephaera/.cache/tasks/<task>/floor-plan-to-model/<asset>/<version>/manifest.json`. Native outputs stay in task-scoped non-runtime `.art-staging/`; state, policy and dispatch evidence stay in the canonical task cache. There is no setup, generation, engine-integration or promotion operation. Caller-provided execution context, runtime identities, output roots and unknown flags are rejected.

`--rights` is a bounded project-local JSON document with schema `hephaera-floor-plan-rights/v1`. Required fields are `planSha256` (the exact original plan hash), `status` (`owned` or `licensed`), nonblank `rightsHolder`, `scope: "floor-plan-to-model"`, `evidence` and `referenceInputs`. Each evidence entry contains a local `path` and exact `sha256`. Each optional inspiration reference is explicitly listed in `referenceInputs` with its `path`, `sha256`, `status`, `rightsHolder` and evidence array. Both arrays are required; use `[]` for an owned procedural plan without external references. A licensed plan or reference requires local license/permission evidence. Declaring inspiration inputs never performs automatic dimension extraction.

`--budget` is a separate bounded JSON document with exactly `schemaVersion: "hephaera-floor-plan-budget/v1"`, `timeoutSeconds` (1–86400), `maxLogBytes` (1024–1073741824) and `maxPrivateBytes` (67108864–68719476736). Values must be finite safe integers. These explicit process ceilings supplement the approved plan's dimensional/geometry/output budgets. They are retained per version; continuation cannot widen or silently replace them. Current native committed-memory enforcement requires supported 64-bit Windows; other native hosts remain unavailable rather than running unbounded.

Hephaera snapshots the exact rights, references, budget, STYLE and selection identities into an immutable policy envelope before native initialization. Continuation checks those retained hashes instead of adopting changed files. New plan/style/rights/budget or runtime identity requires a fresh version with retained ancestry and refreshed affected approval. Preserve previous failures and source/review evidence.

The plan schemas, owned examples and fixed audited Blender bundle live in `.hephaera/runtime/bubo/resources/floor-plan-to-model/`. Read `CONSTRUCTION.md` and `EXPORT.md` there for modeling and package/review details. The export package contains editable Blender source, separate visual/collision GLBs, semantic metadata, the plan, approved drawings and provenance. Independent re-import checks and complete views precede independent review and separate human model acceptance. These gates grant no runtime acceptance or asset promotion; actual engine collision/movement testing belongs to later integration.

## Review receipts and continuation

`record` consumes an actual receipt, rather than treating the command as approval. Supply the workflow's current kind/fingerprint, reviewer, decision and reason, plus human/runtime evidence where applicable. Use `status` for current approval fingerprints and read the pinned manifest/package schemas. Hashes, a successful technical check or a fixture receipt cannot manufacture human approval.

Execution state and receipts stay under the canonical task cache, with immutable sources and failed/versioned attempts in `.art-staging/`. A changed runtime build or host selection requires a fresh asset version with retained source ancestry and refreshed affected reviews. Historical manifests and approvals remain unchanged. Generation, installation, license acceptance, voice consent and runtime promotion require their own applicable authorization and evidence.

## Read-only Blender inspection

`inspect-blender-scene.sh SCENE.blend --root PROJECT --profile PROFILE [--blender EXECUTABLE] [--output REPORT] [--replace] [--dry-run]`

Profiles: `static-asset`, `rigged-actor`, `procedural-scene`, `render-scene`, `simulation`. Existing Blender 4.5.x is required. Dry-run queries prerequisites and creates no output. Without `--output`, stdout contains the validated v1 JSON report; otherwise it contains the report path. Existing reports require `--replace`. Sources, selected tools, Bubo dependency files and execution receipts remain read-only. Inspection requires no STYLE.md, ENGINE.md or MEDIA.md and grants no authoring or asset acceptance.
