# Reusable VFX assets

Use this workflow when an effect needs its own brief, source files and review history: a charge, impact, trail, beam or another piece of game feedback. It also prepares effect assets for later model-action integration.

Start with inexpensive provisional work. Review its placement, timing and readability before spending time on detail. Keep the complete effect together so a change to one input cannot leave an old review looking current.

## What is available

`vfx-assets.sh` manages briefs, rights, immutable versions, staging and independent reviews. Bubo validates data-only effect packages and their exact PNG/GLB dependency inventory. The host and native runtime remain separate: Hephaera owns production policy and reviews; Bubo owns package/resource validation.

This delivery admits **owned or licensed fixed inputs**. It does not prepare atlases, render effects, integrate reusable packages into actions or promote assets. Generated-receipt admission is explicitly unavailable. Existing image generation remains governed by STYLE, MEDIA, its provider permissions and shared attempt ledger. A new VFX version grants no generation allowance.

Run the prerequisite check first:

```bash
./.hephaera/commands/vfx-assets.sh doctor
```

The check reports actual availability. STYLE and an explicit ENGINE contract are needed for package admission. It never creates contracts, installs tools or selects another engine or primary visual pipeline. Rendering readiness remains unverified for every engine in this delivery. Existing MODEL_TO_ACTION v1 continues using its original cues.

## Start an asset

Use an existing task. Ask your agent to prepare a brief and rights record from your requirements and source evidence, then initialize a new version:

```bash
./.hephaera/commands/vfx-assets.sh init \
  --task cast-effects --asset hand-charge --version v1 --creator artist \
  --brief .art-staging/vfx-inputs/brief.json \
  --rights .art-staging/vfx-inputs/rights.json
```

State lives under `.hephaera/.cache/tasks/cast-effects/vfx/hand-charge/v1/`. Original snapshots and attempts stay outside the game in versioned `.art-staging/tasks/.../vfx/...` directories. Preserve both locations.

The brief records intent; camera, distance and relative size; attachments and major events; occupied and clear screen regions; blending; finite budgets; accessibility/quality requirements; declared targets; required capture coverage; and optional exact model/rig/clip/marker/transform bindings. Requirements and declared budgets do not establish measured performance or actual target support.

The asset budget is retained across versions. Started staging attempts, including failures, count against `maxCandidates`; new versions count against `maxRevisions`. Neither a sibling version nor another initial version can reset those limits. These are VFX staging limits, separate from the existing generation ledger.

## Stage and review provisional work

Supply a native-compatible package and, when available, its visual evidence packet:

```bash
./.hephaera/commands/vfx-assets.sh stage \
  --manifest .hephaera/.cache/tasks/cast-effects/vfx/hand-charge/v1/manifest.json \
  --phase provisional --package .art-staging/vfx-inputs/package.json \
  --visual .art-staging/vfx-inputs/visual.json
```

Bubo inspects the original package first. Hephaera copies only its verified dependency closure into a fresh attempt, then Bubo inspects that copy. A failed or interrupted attempt remains recorded and cannot become a completed stage. A completed phase is immutable.

The result identifies the exact review packet and its digest. A visual packet binds backend, driver and renderer identities and source dependencies, scene, camera, settings, captures and complete requested coverage. Missing visual evidence is reported unavailable; it cannot satisfy an accepted visual review.

A different reviewer inspects the actual evidence and records an exact, separately evidenced decision:

```bash
./.hephaera/commands/vfx-assets.sh record \
  --manifest .hephaera/.cache/tasks/cast-effects/vfx/hand-charge/v1/manifest.json \
  --phase provisional --reviewer independent-reviewer \
  --evidence .art-staging/vfx-inputs/provisional-review.json
```

A reviewer name or verdict alone is insufficient. The record must bind the current packet hash, confirm independence and reference separately hashed source evidence. Accepted technical/independent review does not grant human runtime acceptance or promotion.

## Detail, revisions and status

Stage the `detailed` phase only after current provisional acceptance. Use the same `stage` and `record` operations with `--phase detailed`.

For a correction, initialize a new version with `--parent-manifest` pointing to the retained version. Preserve its immutable ancestry and budget. The new version binds current inputs and policy and receives no inherited phase acceptance. A stale parent can identify the history of a correction; it cannot make its old evidence current.

```bash
./.hephaera/commands/vfx-assets.sh status --manifest PATH_TO_MANIFEST
./.hephaera/commands/vfx-assets.sh validate --manifest PATH_TO_MANIFEST
./.hephaera/commands/vfx-assets.sh inspect --manifest PATH_TO_MANIFEST
```

Relevant brief, rights, source, policy, native build, host tool, model/clip/marker/transform, backend, driver, scene, camera, settings or capture changes invalidate affected evidence. Correct the source and create an authorized revision; do not rewrite expected hashes or old reviews.

`status` and `doctor` inspect metadata. Native `validate`/`inspect` keep execution-context/result audit records under the task. None of these operations installs software, generates media, certifies gameplay or copies an asset into a game.

If the client stops during staging, inspect `status` first. Started attempts and partial files remain recorded. When its exact writer is confirmed dead, recover the retained ownership record:

```bash
./.hephaera/commands/vfx-assets.sh recover --manifest PATH_TO_MANIFEST
```

Recovery archives the old lock and records interruption without resetting budgets, reusing partial attempts or accepting a phase. It refuses a live, unknown or malformed owner and never kills a process. Host ownership recovery does not certify cleanup of untracked native children. Preserve the reported evidence and use the actual execution owner's cancellation controls for any work still running.

Recovery has its own immutable ownership claims. If that client also stops, the next recovery can continue a verified abandoned claim and its prepared archive. A partial recovery cannot masquerade as a completed one or reset the asset's budget.

## Data contracts

JSON uses exact fields and canonical project-relative forward-slash paths. Unknown/duplicate properties, unsafe aliases, links and stale hashes fail. The coordinating skill supplies the records; native package/resource schemas belong to [Bubo's VFX contract guide](../runtime/bubo/docs/VFX_ASSETS.md).

| Record | Required fields |
| --- | --- |
| Brief | `schemaVersion: hephaera-vfx-brief/v1`, `intent`, `coverage`, `bindings`, `presentation`, `budgets`, `accessibility`, `targets` |
| Rights | `schemaVersion: hephaera-vfx-rights/v1`, `origin: owned` or `licensed`, `holder`, hash-bound `permission`, exact source `inputs`, `media: null` |
| Provenance, optional | `schemaVersion: hephaera-vfx-provenance/v1`, hash-bound `sources`, `notes` |
| Visual packet | `schemaVersion: hephaera-vfx-visual/v1`, `environment`, hash-bound `artifacts` with coverage |
| Independent review | `schemaVersion: hephaera-vfx-review/v1`, `phase`, `reviewPacketSha256`, `reviewer`, `verdict`, `independenceConfirmed`, separate hash-bound `sourceEvidence`, `findings` |

Brief presentation fields are `camera`, `viewDistanceMetres`, `modelRelativeSize`, `attachments`, `events`, `occupiedRegions`, `clearRegions` and `blendingRequirements`. Budgets declare `maxParticles`, `maxSystems`, `maxTrailPoints`, `maxVertices`, `maxDrawCalls`, `maxLights`, `maxTextureBytes`, `maxOutputBytes`, `maxDurationSeconds`, `maxConcurrency`, `maxProcessingSeconds`, `maxCandidates` and `maxRevisions`. Accessibility declares `qualityVariants`, `reducedMotion`, `reducedFlash`, `contrast` and `colorIndependent`; targets declare `id`, `description`, `frameBudgetMs` and `memoryBudgetBytes`.

Bindings use `{kind, path, sha256}` for `model`, `rig`, `clip`, `marker` or `transform`. File references use `{path, sha256}`. Visual environment contains `backend`, `driver`, `renderer`, hash-bound `scene`, `camera`, `settings` and `dependencies: [{role, path, sha256}]` covering backend, driver and renderer source identities. Visual artifacts use `{path, sha256, coverage}`; their union must cover the brief's requested coverage.

Capture files stay local unless publication is separately authorized. Never upload game captures to an image service as part of asking for review. Container checks, file hashes and synthetic test packets establish no artistic quality, decoded-content validity, browser/MAUI performance or human acceptance.
