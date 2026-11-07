# Review complete motions and deliver current evidence

Review the real rig/hierarchy before motion authoring. Inspect fit, weighted joints, separate parts, attachment ownership and extreme poses. Record current human rig approval; automated inventories cannot manufacture it.

Every required clip needs actual meaningful channels, finite samples, intended timing/FPS, loop/root-motion policy and compatible exported bindings. Inspect contact/foot sliding, penetrations, equipment continuity, proportions and loop seams. Swimming animation does not establish buoyancy; a death clip does not supply a ragdoll or authoritative death rule.

Use full-range sampled frame playback plus relevant transition proofs and representative cameras. Record sampling, renderer and coverage. A still, midpoint render or passing manifest is insufficient for motion selection. Fast motion may need denser samples and actual target playback. Retargeted motion needs the same review as authored motion.

## Contact evidence and coverage

Keep three questions separate in the existing task notes or acceptance matrix:

| Question | What to record |
| --- | --- |
| What is intended? | Body/part, support or contact partner, interval and permitted style choices from the motion brief |
| How was it checked? | Actual numerical probe, manual/visual observation, heuristic inference or unavailable evidence, with the source artifact and current model/rig/clip identity |
| What does it establish? | Result against the stated criterion, covered interval/samples, limitations and any required evidence still missing |

For numerical results, retain units, threshold and coverage. Reuse the actual Bubo contact-drift, optional ground-penetration, joint-angle, loop, root and sample reports where available. Check the declared probe and `referenceVelocity` assumption when interpreting an in-place contact: a node/bone position is not a sole-volume, contact-force, balance or continuous-collision measurement. Never infer a missing measurement from an intended contact marker.

Read field roles from the current native contract: recipe contact `maxTravel` is a limit, while the contact report's `maxTravel` is measured drift; `penetration: null` means no ground measurement. Joint-angle maxima describe local bone rotations, and the loop-seam aggregate is not one universal physical unit. These reports support only their declared checks and sample coverage.

A genuine measured zero remains valid within its actual scope. Missing reports, insufficient samples and stale inputs do not become zero or a pass. Required defects remain visible even if an average looks acceptable; do not widen existing limits to accept them. A manual observation can support its scoped visual claim but does not establish physical contact or an unmeasured numerical criterion. Keep heuristic contact claims identified as inference.

Use the existing evidence/receipt vocabulary. In the canonical task matrix, supported observations use `verified` or `contradicted`, inference remains `inferred`, missing coverage is `unknown` and outdated evidence is `stale`. Explain an inapplicable check and its profile/task reason in the observation or limitations; do not add an N/A verdict or use applicability to remove a required gate. Every required claim still needs its required evidence before overall acceptance.

## Compare the complete delivered motion

Watch the whole delivered clip and relevant transitions at normal speed, then inspect difficult intervals, contact changes, loop seams, extremes and blend boundaries more slowly through available playback/frame controls. Review preparation, support/weight transfer, release/contact, follow-through and recovery where applicable. A slow inspection supplements full playback; record any unavailable view, interval or target rather than claiming it was reviewed.

Compare actual source, target and independently re-imported export with comparable camera, scale and orientation. Sequential comparable views are sufficient; no new viewer is required. Align corresponding phases and note coverage differences. After trims, rates, repetitions or blends, equal wall-clock times need not show the same phase: use existing resolved timing and the delivered clip, without independently rebuilding cue mapping or claiming preservation of every source subframe pose.

Inspect proportions, equipment clearance, visible support, pose readability and entry/exit continuity. Preserve deliberate stylized holds, impacts or abrupt motion from the brief; smoother is not automatically better. Balance and plausible weight shifts observed here are visual judgments, not physics certification. Small relevant scenario variations can expose a hidden defect using existing evidence; label illustrative cases and never invent executed measurements or generate new clips merely to fill a checklist.

For targeted revisions, retain unaffected clips and their `motionSha256` identities and preserve prior attempts. Bind revision to the source motion/rig/recipe identities; changed rig/source interpretation can require a new version. Re-bake/export/review affected outputs and stale prior set acceptance rather than reusing it automatically.

The native `author --revision JSON` record is `{ "schemaVersion": 1, "clip": "existing-ID", "replacement": { /* complete clip specification with the same ID */ }, "reason": "specific defect and intended correction" }`. Supply strict JSON, without the illustrative comment. It requires a complete prior motion stage and current rig approval. Only that existing clip is replaced in the effective recipe and actual previous motion source; profile, rig, budgets and state graph are not revision fields. Fresh motion/bake/export/review attempts replace downstream acceptance while preserving unchanged motion identities and the still-current rig approval. A motion hash records sampled output, not only a clip's label.

The runtime handoff must exercise real import/bindings, transitions, controller/root-motion ownership, pause/frame-rate variation, interruption, copies/pooling, stale callbacks, teardown and target resource budgets. Mechanical fixtures also need actual pivots/wheel response/anchors; ships need real phase-driven effects and cancellation. Simulated process/API fixtures remain labeled and cannot certify these visuals.

Separate motion selection, independent review and human runtime acceptance. Runtime acceptance binds effective engine, model/package hashes and hashed `runtime-test`, `runtime-capture` and `performance-profile` artifacts. CPU submission timings and renderer counters are not GPU timings or target hardware certification. CLI receipts record caller assertions and cannot authenticate a person's identity.

Use `status` for current fingerprints and `validate` before explicit promotion. Preserve failed or interrupted attempts, source/clip provenance and rejection reasons. Any source, rig, clip, mapping, tool, recipe or engine change invalidates the dependent evidence. Missing prerequisites and coverage remain pending/blocked; no fallback, automatic approval or unreviewed runtime promotion is allowed.
