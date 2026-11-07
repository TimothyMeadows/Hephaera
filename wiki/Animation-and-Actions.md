# Animation and actions

MODEL_TO_ANIMATION produces reviewed individual motions from a reviewed model. MODEL_TO_ACTION composes actual reviewed clips into an ordered action. They are downstream production workflows: neither is another primary STYLE pipeline, neither selects an engine, and neither gives presentation authority over gameplay.

The authoritative contracts are [MODEL_TO_ANIMATION](https://github.com/TimothyMeadows/Hephaera/blob/main/.styles/.workflows/model-to-animation/WORKFLOW.md) and [MODEL_TO_ACTION](https://github.com/TimothyMeadows/Hephaera/blob/main/.styles/.workflows/model-to-action/WORKFLOW.md). Use `build-model-animations` or `build-model-actions` after resolving compatibility, then resolve the engine-specific integration owners.

## Inputs and subject readiness

Use a repository-local reviewed GLB from PROOF_TO_MODEL, BLENDER, a copied licensed asset bundle or an explicitly compatible CODE handoff. A [schematic assembly](Schematic-to-Model) requires its explicit current mechanical handoff. Preserve immutable model, editable-source and rights ancestry. Inspect configured libraries before authoring replacements; never open directly from a read-only library.

Readiness checks include scale, topology, pose, missing hidden parts, fused equipment, independent articulation, materials and attachments. A static display model may need modeling repair before deformation. Record that repair explicitly instead of relabeling the model animation-ready.

| Profile | Real structure | Avoid inventing |
| --- | --- | --- |
| `skinned` | Actual skeleton, weights and deforming surfaces | Generic humanoid bones for incompatible anatomy |
| `articulated` | Independent parts, hierarchy and measured pivots | Deformation assumptions for rigid mechanics |
| `rigid` | Hull/whole-object motion and real anchors | Skeletons, attacks or combat colliders for noncombatants |
| `mechanical-assembly` | Preserve-only reviewed rigid occurrences plus separately owned flexible rigs | New rigs, retargeting, missing/fused components or inherited human motion acceptance |

Existing rigged-actor/v1 remains valid for its actual character/monster consumers. It is not a universal vehicle or prop schema. CODE remains source-authored and THREEJS-specific; downstream motion cannot replace its primary implementation with an unrelated generated mesh.

For MODEL_TO_ANIMATION's `mechanical-assembly` profile, use `rig.mode: preserve`, the exact canonical rest GLB and current `--handoff`. MODEL_TO_ACTION, including v2, still rejects this mixed profile; the animation handoff does not grant action support. The descriptor binds the real node/skin graph, component inventory, numerical policy, complete package/reviews and current source states. Receiving preserves local pivots and per-rig ownership. Changes to design/parts/assembly/export state or payloads invalidate it; do not silently refresh expected hashes. Diagnostic readiness clips remain separate from finished production motion, and this profile does not relax existing profiles or later rig/motion/independent/human runtime reviews.

## Native preparation and limits

Both workflows use the explicitly built pinned Bubo runtime and existing Blender 4.5 LTS. They install/download nothing. Native motion containment currently supports Windows job objects and Linux with `/usr/bin/setsid`; unsupported hosts, including macOS for the documented motion runner, stop rather than launching unbounded processes.

State, reviews and manifests remain under the active task cache. Immutable originals, working copies, revisions, failed attempts and review exports remain under versioned `.art-staging/model-to-animation/` or `.art-staging/model-to-action/`. Runtime destinations are separate fresh `assets/models/...` directories.

Authoring uses only each workflow's fixed audited hash-bound Blender bundle, factory startup, disabled autoexec and declared repository-local working copies. Bound time, logs, samples, files and render pixels; cancel owned process trees and retain failure evidence. Recipe data cannot contain executable Python, providers or shell commands. This exception does not relax standalone BLENDER connected-authoring policy or permit imported scripts, handlers, drivers or add-ons.

## Produce real individual motions

`model-to-animation.sh init` requires `--task`, `--asset`, `--version`, `--actor`, `--model`, `--rights` and `--recipe`; select an existing Blender with `--blender` when needed. Continuations require the returned `--manifest`.

| Stage | Required result |
| --- | --- |
| `doctor`, `inspect` | Actual prerequisites and model readiness findings |
| `prepare`, `rig` | Declared transforms, hierarchy, anchors and actual rig/parts |
| `record` | Current rig/hierarchy selection before motion production |
| `author` | Real motion channels under the selected recipe |
| `retarget` | Actual cleared source GLB plus explicit bone/clip/rest-axis/root mapping |
| `bake`, `export` | Required clips, editable source and independently re-imported GLB |
| `review`, `validate`, `status` | Full-range evidence and current contract state |
| `promote` | Current selections, independent review and separate human runtime acceptance |

`author` and `retarget` are explicit alternatives. Do not silently substitute a solver or skeleton after failure. Targeted `author --revision JSON` changes supported clips while preserving unaffected motions and earlier attempts. Changed clip hashes invalidate downstream bake/export/review evidence.

The output `hephaera-motion-package/v1` binds source/model, rig or hierarchy, actual exported clips and `motionSha256` values, loops, contacts, root policy, anchors, parameters, states/transitions, effects, provenance and budgets. A named empty action or midpoint render is not a motion package.

## Review complete motion

Record a short [motion-intent brief](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/build-model-animations/references/motion-profiles.md#state-motion-intent-before-authoring) before authoring or retargeting. Describe intended support/contact phases, partners, clearance, entry/exit poses and style choices using existing task notes. Before action composition, add [phase and timing intent](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/build-model-actions/references/sequence-contract.md#state-action-intent-before-composition) tied to the actual clips and occurrences.

Separate intent, evidence method and verdict. Existing contact reports measure declared sampled points; they do not prove sole-volume collision, forces or balance. Preserve units and coverage where applicable: genuine measured zero differs from an absent, null, insufficient or stale measurement. A visual observation supports its scoped visual claim. Keep the existing canonical verdicts; explain inapplicability in the observation/limitations rather than adding an N/A status or dropping a required gate. The [evidence and comparison reference](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/build-model-animations/references/review-and-delivery.md#contact-evidence-and-coverage) is authoritative for this review guidance.

Watch the complete delivered timeline at normal speed, with slower inspection of difficult windows. Compare similar views and corresponding phases, accounting for resolved trim/rate/repetition/blend timing. Inspect casting motion with effects off and on where supported; missing views remain gaps. See the [whole-action and equipment example](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/build-model-actions/references/presentation-and-review.md#review-action-phases-and-boundaries). Keep style choices and non-humanoid profile needs explicit; a mechanical assembly retains its existing preserve-only animation scope.

Review full sampled clips and relevant transitions: extremes, contacts, loop seams, equipment, root displacement and part ownership. Test the requested motion set rather than manufacturing combat requirements. Run/jump/swim/death, mechanical rotation or warp phases need their actual subject-specific evidence when requested.

Blender playback and technical reports do not certify selected-engine import, player feel, target performance or collisions. Runtime acceptance must bind actual tests, captures and profiles to current model/package/engine identities. Preserve unavailable evidence as pending, blocked or not-run.

## Compose reviewed clips into an action

`model-to-action.sh init` consumes `--motion-package`, `--recipe` and `--source-review` with the common task/asset/version/actor arguments. Source-motion selection binds actual package, model, rig and every used clip plus explicit rights. Missing source clips, anchors or markers stop composition.

Declare ordered source trims in seconds, playback rates, finite repetitions with occurrence IDs, incoming blends, bake FPS and bounded effect cues. Blends overlap adjacent spans without gaps or triple overlap. Cues resolve against the exact step occurrence and source trim/rate; ambiguous or out-of-trim markers fail.

Initial shared composition requires in-place clips. Inspect original root and ancestor samplers, including subframes. Moving/compensating ancestors need a reviewed in-place bake; used clips require LINEAR/STEP interpolation for this importer. Unsupported extracted-root clips are rejected rather than silently suppressing motion. Individual animation production retains its separately supported extraction contract.

`inspect`, `compose`, `export`, `review`, `record`, `validate`, `status` and `promote` retain their stage boundaries. Export actual baked composite GLB clips and editable timelines, then independently re-import. Full-frame bounded geometry verification retains hash-bound artifacts outside the runtime package; technical verification is separate from visual acceptance.

The `hephaera-action-package/v1` records expanded steps, resolved cues, source clip ancestry, composite motion identity, anchors, fixed-target policies and engine/tool/recipe budgets. Its original `orb`, `particles` and `projectile` cues retain their historical primitive backend and semantics. `hephaera-action-package/v2` adds exact reusable VFX/profile/resource references, typed transforms and finite lifetime/target policies. GLB contains clips, not a portable engine state machine or native particle system. Read [VFX and action v2](VFX-and-Action-v2) for the current Three.js bridge, rights/phase reviews, source-export admission, shared Scene clock, receiving evidence and explicit limitations.

## Selected-engine presentation

The Three.js adapter uses the host's locked APIs and actual GLB, with a visual child beneath a separate authoritative movement root. Other engines use compatible animation, material, movement, VFX, camera and audio owners. Phaser requires an explicit sprite/pre-rendered handoff for 3D source material. Missing Editors, SDKs or browsers remain explicit gaps.

Only one full-body presentation owner writes a rig at a time. Arbitrate locomotion and action mixers; no implicit masking, IK, aiming or combat controller is supplied. Effects use real anchors. Fixed target points are copied at action start; release detaches visual projectiles from the sampled pose. Pause freezes presentation time. Cancel, restart, replacement and disposal retire callbacks and release owned attachments, particles and projectiles, including reentrant interruption.

V2 uses one Scene scheduler borrowing the selected Quarks service across actors, ambient effects and bounded tails. Motion completion releases rig ownership before normal tails finish. Live beam endpoints require explicit fresh game inputs; host-outcomes mode suppresses automatic rehearsal impacts and accepts only a current reviewed impact request within its declared window. Gameplay owns movement, targeting, collisions, damage, costs, cooldowns and actual projectile outcomes. Animation markers and GPU effect replay cannot grant those outcomes. Legacy point-based v1 adapters retain historical ancestry and require explicit reviewed integration; they are not relabeled Quarks.

## Rights and acceptance

Native authoring and explicitly owned/licensed retargeted clips are the baseline. Adobe products/services/adapters, Mixamo and Adobe-dependent presets are excluded. Optional AI models, hosted services, paid libraries, uploads, installations and license acceptance require separate selection and authorization.

Require current rig/motion or action selection, a different independent reviewer and separate human runtime acceptance before explicit promotion. Changed input invalidates affected evidence. Cooperative receipt identities are assertions, not authenticated proof of a human judgment. Preserve full failure, revision and promotion history.
