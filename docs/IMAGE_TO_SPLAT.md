# Image to splat

Image to splat creates a static Gaussian object from one rights-cleared image. Use it when a view-dependent, static visual asset is appropriate and you can review the complete object. Hidden surfaces are generated guesses. A convincing input view does not establish accurate dimensions, an opening's geometry or a useful back view.

This is an optional workflow under `LOCAL`, not another primary visual pipeline. It preserves the project's STYLE primary, existing mesh workflows, engine, particle/postprocessing selection and independent AUDIO/MUSIC/VOICE domains. It uses direct local Bubo execution with no hosted inference service or ComfyUI dependency.

## Choose the right output

| Need | Workflow boundary |
| --- | --- |
| A static object reconstructed as Gaussians from one image | Image to splat |
| A mesh from an approved consistent six-view set | PROOF_TO_MODEL |
| Dimensioned unfurnished building architecture | FLOOR_PLAN_TO_MODEL |
| Engineered components that remain independently addressable | SCHEMATIC_TO_MODEL |
| Capture reconstruction from photographs or video | Separate future extension |

The canonical source here is the Gaussian scene with its original input and configuration. This workflow does not create a finished Blender mesh, calibrated CAD model, collision proxy, rig or animation. Derived meshes and runtime representations require their own reviewed operations.

## Owners and prerequisites

Hephaera owns explicit selection, source rights, licence/access records, budgets, approvals, immutable asset versions, provenance, review and continuation. The exact pinned Bubo dependency owns native schemas, model/tool identities, isolated installation verification, image preparation, inference, density decoding, Gaussian parsing, package verification and shared GPU/process ownership. A game adapter owns later rendering and device behavior.

Install Hephaera at `<project-root>/.hephaera`. Initialize and build the recorded Bubo revision explicitly before native operations:

```bash
bash .hephaera/commands/initialize-bubo-runtime.sh
bash .hephaera/commands/build-bubo-runtime.sh
bash .hephaera/commands/resolve-skill.sh build-image-to-splat-assets
```

Require `compatible: true` for the skill. Admission verifies the actual gitlink/lock, clean source, API, build and audited resources. An advertised workflow is not proof of a complete installation or native readiness. Startup, policy selection and ordinary status must not acquire models or load the GPU.

Native schemas and exact dependency settings belong to the installed [Bubo image-to-splat contract](../runtime/bubo/docs/IMAGE_TO_SPLAT.md). Resolve a native audited resource through `commands/lib/bubo-runtime.cjs resource` when preparing requests. Hephaera maintains no parallel model catalogue. Production never runs source, builds implicitly or substitutes a sibling checkout.

## Select without changing defaults

Read the host's `STYLE.md` and active `MEDIA.md`. Keep the user's art style and explicitly select LOCAL for this task. When STYLE has another primary pipeline, record its current hash-bound prompt override:

```bash
bash .hephaera/commands/resolve-art-pipeline.sh \
  --override LOCAL --json \
  --evidence .hephaera/.cache/tasks/prop/splat-selection.json
```

Selection is not generation approval. It does not make image to splat the project's default or select an engine/renderer. It grants no model installation, licence acceptance, GPU access, asset promotion or media publication.

## Command ownership

Use `image-to-splat.sh` from the Hephaera installation. The host operations are:

| Operation | Purpose |
| --- | --- |
| `init` | Create one immutable host asset version from its exact native generation request and policy inputs |
| `doctor` | Report prerequisite/admission availability without loading a model |
| `validate` | Check current host inputs, identities and saved evidence; native technical checks keep their own scope |
| `setup`, `provision` | Pass explicit registration/acquisition requests through the verified native adapter, dry-run by default |
| `generate` | Dispatch the approved candidate or revision under the original shared attempt ownership |
| `verify-package` | Independently verify the exact staged package through Bubo |
| `review` | Bind a supplied local view/evidence packet to the verified package; it does not render views |
| `record` | Record separate `independent` or `human-backend` decisions against the exact current review subject |
| `status` | Inspect saved state, freshness, review decisions and continuation |

`init` identifies the host task, asset, version and creator. It takes `--request` for the prepared Bubo generation JSON and explicit `--media`, `--workspace` and `--media-state` inputs. Supply `--selection` for the task-local LOCAL override unless LOCAL is already the valid STYLE primary. Optional `--platform-modules` binds an exact reviewed platform-module manifest to the version. First-use `--ledger-registration` binds the reviewed history/decision receipt described below; it does not declare generation approval. A revision supplies its original `--parent-manifest`. Host version IDs do not replace the native task, source approval or shared ledger.

```bash
bash .hephaera/commands/image-to-splat.sh init --root "$PWD" \
  --task prop --asset field-prop --version v1 --creator artist \
  --request .hephaera/.cache/tasks/prop/generation.json \
  --selection .hephaera/.cache/tasks/prop/splat-selection.json \
  --media MEDIA.md \
  --workspace .hephaera/.cache/splat-runtime \
  --media-state .hephaera/.cache/shared-media \
  --ledger-registration .hephaera/.cache/tasks/prop/ledger-registration.json
```

Use the returned manifest path for continuation; the examples below use `$MANIFEST` for that exact saved path:

```bash
bash .hephaera/commands/image-to-splat.sh doctor --root "$PWD" --manifest "$MANIFEST"
bash .hephaera/commands/image-to-splat.sh validate --root "$PWD" --manifest "$MANIFEST"
# Generate only after the actual source-bound approval and GPU readiness gates.
bash .hephaera/commands/image-to-splat.sh generate --root "$PWD" --manifest "$MANIFEST"
bash .hephaera/commands/image-to-splat.sh verify-package --root "$PWD" --manifest "$MANIFEST"
```

Continuation consumes the immutable saved request, settings and workspace; it cannot replace them through new flags. `setup` and `provision` instead take their own explicit native `--request` plus full host-context inputs, without an asset lifecycle manifest. Omit `--execute` for a dry-run; only separately authorized installation/registration selects it.

## Prepare one source and its scope

Use an exact project-local original image with its SHA-256, rights holder and owned/licensed permission evidence. Inspect configured external asset libraries before creating a replacement and follow their read-only/copy rules. Do not run directly from a library or external source root.

Define intended views, foreground, appearance, known openings/thin features and uncertainty before spending an attempt. Review input rights independently of model licences. Keep personal/private reference images local unless their actual disclosure is separately authorized.

References provide appearance evidence only. They do not automatically establish dimensions, calibrated front/up axes, mechanical relationships, independently movable parts or hidden surfaces. Unseen geometry must be labeled as inferred in review.

## Provisioning and registration are separate

`provision` prepares a pinned installation plan; an explicit authorized execution acquires the exact closure and creates an isolated environment. `setup` describes native capability or prepares registration; explicit authorized registration verifies existing bytes and writes a new immutable receipt. Neither imports models, performs inference or accepts licences automatically.

Use the native dry-run and records from the installed Bubo revision for:

- Complete source, weights, Python, wheel/native and notice identities.
- Disk/download estimates and disjoint project-local installation/download roots.
- Existing bootstrap/runtime sources explicitly placed in scope.
- Component licence/access and any disclosed provenance uncertainty.
- A fresh registration receipt bound to the actual complete installed inventory.

Original Hephaera/Bubo code remains MIT. Preserve each third-party component's own terms. TripoSplat MIT does not clear DINOv3's custom agreement, the FLUX autoencoder's Apache-2.0 obligations, BiRefNet or framework/native terms. The differently licensed FLUX generator is outside this profile. Record applicable user decisions; copying a licence identifier or setting a boolean does not constitute consent.

Installation failure preserves partial data for explicit reconciliation. Generation never repairs an installation, downloads missing files, accepts terms, upgrades a framework or changes drivers as a fallback. Existing unrelated media environments remain independent.

## Generation and attempt ownership

Prepare Bubo's typed technical request and generation request from its current contract. Bind exact source/style hashes, installation receipt, native catalogue/environment, seed, supported density order, settings and finite budgets. Keep integers in JavaScript's exact safe range; unsupported or rounded controls fail explicitly.

Source rights and the actual human generation approval are separate identities. The approval binds its original source, catalogue, STYLE and exact shared ledger root, with one candidate and at most one reviewed revision. Bubo supplies the fixed native attempt limits; a host version/run is not another allowance.

Use one canonical project-shared media-state root, bound independently of any individual approval, across tasks, versions and workspaces. Keep its per-approval bindings as well: minting a new approval cannot select another root to reset the source's physical allowance. A host revision preserves the original native task, approval, source and ledger identities. Candidate, failed, cancelled and uncertain claims remain retained. A new run ID, installation receipt or parent version cannot refund or reset a spent attempt. Density variants decoded from the same latent remain separate outputs, not additional stochastic candidates.

### Register the actual ledger history

Before the first host-dispatched generation, when the project has no registered image-to-splat shared-root binding, supply an explicitly reviewed `hephaera-splat-ledger-registration/v1` receipt. `init --ledger-registration` freezes its identity with the version; later generation uses that saved input. The receipt contains exactly these fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `hephaera-splat-ledger-registration/v1` |
| `mediaState` | The exact selected canonical project-shared media-state root |
| `history` | `fresh-project` or `existing-ledger` |
| `priorMediaStateRoots` | `[]` for attested fresh history; exactly one existing root equal to `mediaState` for existing history |
| `approvedBy` | The actual operator who reviewed the history |
| `decisionEvidence` | A project-local `{path, sha256}` identity for that operator's real decision |

`fresh-project` requires the operator's actual attestation that this workflow has no prior claims. A missing file, empty directory, new task or unregistered root is not evidence of fresh history. For `existing-ledger`, keep the single original root exactly; do not select a new location, copy its allowance or relabel old claims. Unknown history, differing roots, multiple previous roots or migration need explicit separate review and stop ordinary generation.

The project binding retains both the registration receipt and its decision-evidence identity. They must remain unchanged for later generation even when a later version omits `--ledger-registration` because the root is already bound. Do not upgrade an older unregistered binding implicitly. Replacing the receipt or its evidence cannot turn an existing project into a fresh one. `setup` and `provision` reject this flag; installation work cannot establish ledger history.

This receipt records an operator decision; its fields cannot authenticate a human or replace source rights, generation approval, remaining native allowance or current GPU availability. CPU fixtures use synthetic receipts only and establish none of those permissions.

Coordinate GPU availability before any probe, model load, inference, GPU render or benchmark when the user's session requires it. The shared Bubo GPU lease coordinates participating Bubo work; it cannot exclude games or unrelated applications. An older readiness reply is not proof that the GPU is available now.

Finite limits cover image/decoded bytes and pixels, process time, logs, aggregate committed job memory, output bytes, Gaussian count, Torch allocation and sampled free GPU headroom. A declared bound is not observed availability. Process commitment, resident memory, Torch allocation and driver/device memory measure different scopes. Cooperative Python/path/module checks are not an OS sandbox or continuous native egress monitoring.

No automatic retry, device/precision/offload change, alternative backend, mesh conversion or CLOUD fallback is permitted after failure. Retain the actual failure and request direction without resetting its claim.

## Verify the package, then review the object

A successful native package contains the original image, request, measured worker report, per-density PLY/artifact descriptors and a typed package manifest. Native state retains the source-bound claim and completion/failure history. Package staging grants no runtime copy or acceptance.

Keep these evidence levels distinct:

| Evidence | What it establishes |
| --- | --- |
| Request/artifact validation | Supported schema, exact current inputs and technical invariants |
| PLY inspection | Bounded finite numeric payload, actual count/profile and encoded facts |
| Generated-package verification | Exact package inventory/data with the producer's construction identities and source-bound records |
| Independent review | A separate reviewer inspected the current complete package/evidence |
| Human backend acceptance | The user accepted the exact current object for backend QA with stated caveats |
| Game/device acceptance and promotion | Separate receiving/rendering/performance and explicit runtime-publication work |

Artifact ancestry declarations alone do not authenticate a real generation. A package verification result does not establish visual quality or physical calibration. Do not convert technical success into human acceptance.

`review` accepts existing project-local view evidence. Obtain those views through a separately admitted rendering/inspection workflow; this command does not render the package or generate missing views. A reference-render packet does not certify the selected game renderer.

Review the original beside every declared density and a complete canonical/orbit view set. Include non-input views, transparent/neutral/light/dark backgrounds when relevant, thin features, holes, floaters, silhouette and invented hidden surfaces. Record camera/frame facts and whether any display transform changes the actual asset. A viewer-only roll does not calibrate front/up or physical units.

Bind review decisions to the exact current source, settings, package/output hashes, complete view evidence and technical verification. Keep independent review and actual human acceptance separate. Document whether the result is useful only from the input view or across its intended views, and record unresolved misses explicitly.

### View packet and decision records

The supplied `hephaera-splat-review-packet/v1` identifies the exact verified `package`, its `original` image, complete ordered native `variants`, a `coverage` description and explicit `caveats`. The original must equal the package source. Each variant binds its `artifact`, `payload` and `views`; every view carries its `id`, `kind`, `angle`, image identity and camera identity. Canonical angles use their names; orbit angles are numeric yaws in `[0, 360)`. The packet declares `calibratedFrame: false` and `displayRollDegrees: 0` or `180`; a display-only correction never changes source geometry or calibration claims.

Supply front/right/back/left/top/bottom canonical views and at least eight orbit yaws per variant, with no orbit gap above 45 degrees. Comparable density views may share exact camera records. Every referenced image/camera is a project-local hash-bound file; the packet cannot substitute a density or omit its original.

```bash
bash .hephaera/commands/image-to-splat.sh review --root "$PWD" \
  --manifest "$MANIFEST" --packet .hephaera/.cache/tasks/prop/review-packet.json
bash .hephaera/commands/image-to-splat.sh record --root "$PWD" \
  --manifest "$MANIFEST" --evidence .hephaera/.cache/tasks/prop/independent-decision.json
bash .hephaera/commands/image-to-splat.sh record --root "$PWD" \
  --manifest "$MANIFEST" --evidence .hephaera/.cache/tasks/prop/human-backend-decision.json
bash .hephaera/commands/image-to-splat.sh status --root "$PWD" --manifest "$MANIFEST"
```

`review` supplies the exact current subject hash. A `hephaera-splat-review/v1` decision contains `kind` (`independent` or `human-backend`), that `subjectSha256`, boolean `accepted`, `reviewer`, `decisionEvidence: {path, sha256}` and explanatory `notes`. The independent reviewer must differ from the version's creator. Keep rejection evidence and explanatory caveats as well as accepted decisions.

Only an actual user decision supports human-backend acceptance. JSON values and a reviewer name cannot authenticate a human or manufacture approval. The host records supplied evidence against the current subject; keep the real decision's exact local source. Neither review kind grants game acceptance, public disclosure or promotion.

## Revisions, historical outputs and continuation

Create a new immutable version with its parent ancestry when source, settings, model/environment, STYLE or payload changes. Such changes invalidate affected current verification and review. Never overwrite an earlier candidate or copy its approval onto new bytes. A reused unchanged artifact still needs valid current receiving evidence; version creation does not create new generation allowance.

After a failure, stop for actual user direction. If a parent has no successful returned generation, an explicitly requested new parented candidate may use a fresh version and native run ID while preserving the original native task, source, approval and ledger. It is not a same-version retry or an assertion that no claim was spent: Bubo's original ledger remains the allowance arbiter and may reject it. After a successful same-source result, the next generative attempt is the remaining reviewed revision, if available. A genuinely different source needs its own explicit source-bound authorization; parent ancestry grants none.

Generated-package verification is bound to the producer build/resource identity. Retain the exact prebuilt producer and receipt for historical checks, or perform an explicitly reviewed receiving/version transition. A new Bubo commit cannot relabel an old artifact as its own output. Preserve original claim/context and failed outcomes, including cases where a worker finished but host admission failed.

Reconciliation after a failed/interrupted run is explicit reviewed work. Keep unchanged original data and failed state, use separate staging/evidence, then run canonical package verification. A separate receipt must bind original context, started record, claim, job and successfully retired native owner; package verification alone does not reopen all historical execution records. Retrospective platform-module hashes establish current file review, not historical loaded bytes, and cannot restore an attempt.

Use `status` to continue from actual saved identities and failures. Do not rediscover an old output as a new generation, infer acceptance from a successful command or use a different state directory as recovery.

## Verified scope and handoff

The native pilot used supplied-alpha 1024-square RGBA inputs on Windows x64 with an RTX 5080 Laptop GPU. Each accepted case produced 32,768/131,072-density variants, independently verified finite packages, measured cleanup and full-orbit backend QA with documented quality misses. The exported frame remains source-local and uncalibrated.

Those results do not qualify real RGB/BiRefNet segmentation, other native hosts/settings or universal readiness. Five warm CPU reference-render repeats were distinct from the single sampled native inference per claimed attempt; they establish no five-run inference benchmark or actual engine/device frame budget.

Deliver the Gaussian source/configuration package with technical and current review evidence in non-runtime staging. Three.js/Spark loading, mixed mesh/Quarks/postprocessing rendering, local workers/decoders, MAUI device behavior, collision/traversal, animation, game acceptance, promotion and release/disclosure are separate boundaries. No command in this workflow copies the result into a game.

The review subject reports `duplicateImageGroups` with `encodedImageSha256` and warnings when distinct camera/view records produce byte-identical render files. These are encoded-file identities, not decoded-pixel measurements. Declared view coverage is checked; actual rendering and source-versus-render fidelity still require independent and human review.
