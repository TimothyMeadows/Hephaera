# Sequence and ancestry contract

Read the actual native command help and workflow schemas before writing recipe data. Bind the human-reviewed source motion package, model hash, rig identity and every used clip's sampled motion hash. A staged source review is distinct from runtime acceptance; the CLI records cooperative assertions and does not authenticate a person.

The source-motion review includes `rights: {"authorized": true, "license": "applicable model and clip terms"}`. Record actual rights to use/modify the model and selected motions. A file copy, tool license or workflow selection does not establish asset rights or accept legal terms for someone else.

## State action intent before composition

In existing task notes, describe the action's purpose, intended camera/scale and preparation, weight transfer, release/contact, follow-through and recovery where applicable. Reference the actual source clips, occurrence IDs, entry/exit expectations, intended support partners and presentation markers. Record equipment clearance, important silhouettes, supported limits, manual review criteria and intentional style choices before evaluating the result. Share the [motion brief](../../build-model-animations/references/motion-profiles.md#state-motion-intent-before-authoring) rather than duplicating it per step or adding recipe fields.

Trimming, accelerating, repeating or blending accepted clips can change support intervals and recovery. Compare source/action phases through the existing compiler's resolved occurrence/marker timing and inspect the actual composite. Source and action seconds are distinct; do not rebuild that mapping in review notes or treat a source contact label as proof of contact after composition. Use the [evidence rules](../../build-model-animations/references/review-and-delivery.md#contact-evidence-and-coverage) for measured, visual, inferred and unavailable claims.

Existing in-place and profile restrictions govern this brief. A requested root policy cannot override them, and the preserve-only `mechanical-assembly` animation handoff does not become an action input.

## Compile the declared sequence

Each source step has a stable ID and explicit source trim, rate, repetition count and incoming blend. Expanded occurrences retain source clip ID/hash and exact source/action times. Bake timing must fit the chosen FPS. Keep overlap within adjacent steps without triple overlap. Empty spans, missing source channels and silently repeated source loops fail.

Cue addresses identify a step occurrence and either an action-clock offset after that occurrence starts or an actual unique source marker. Marker mapping accounts for the trim and rate. Reject absent, duplicated or clipped markers. Fixed target bindings name a world-point input and a distance limit. They do not describe a gameplay target entity or grant targeting authority.

Keep source and composite motion hashes distinct. Changing source, recipe, trim, rate, blend, cue, target policy, script, tool or engine invalidates dependent evidence. Retain complete previous attempts. Initial shared composition uses in-place clips; a rigid vehicle needs no fake skeleton or combat clip set.

Export must contain real composite clips with the declared IDs and actual duration/channels. Preserve an editable source and independently re-import the GLB. Sequence graphs and effects remain separate engine data; an animation file cannot instantiate a portable particle or ability system.

## Versioned effects

V1 retains its `orb`, `particles` and `projectile` recipe/package contract and unchanged native sample player. It is not upgraded by changing a schema label or by selecting Quarks. Preserve historical evidence and refresh affected checks when actual inputs/driver identities change.

Select `schemaVersion: 2` for reusable effect sources. Follow the pinned native v2 schemas; references bind exact package/profile/resource/canonical correspondence bytes and private rights/production-review/preparation ancestry. Keep the native preparation seal and original same-project task/context when reusing prepared resources. Do not relabel that original task, reset attempts or copy private payloads into portable runtime dependencies.

Use native `inspect-effects` to inspect current source subjects, allocations and the complete closure before composition. Its `accepted: false` subject is technical input, not an approval. Native compilation resolves the exact layer `start`, `stopAt` and `retireAt`; the receiving driver consumes those values without rebuilding marker/trim/rate mapping or native fingerprints.

V2 explicitly declares anchor-local offset, normalized xyzw orientation, positive uniform scale and right-handed meters/+Y-up/+Z-forward runtime basis. Placements are `anchor-follow`, `captured-world`, `fixed-target-projectile`, `fixed-target` and `beam`. Fixed targets are copied at action start; continuous world-point input is available only for an explicitly declared beam. Trails require bounded samples and teleport/discontinuity resets. Cue overrides only reduce admitted size/color/emission.

The actual exported composite is the playback source of truth. An off-grid cue samples that delivered clip at the boundary; it does not preserve an original source subframe shape that baking changed. Do not apply a second source-basis conversion or guess a missing anchor/marker. Existing profile/root-motion restrictions remain in force; a v2 effect cannot admit mechanical-assembly actions or another unsupported motion source.

Stopping emission and retiring presentation are separate. Declare bounded tails, action-versus-Scene pause ownership and captured-versus-attached stop transforms. The compiled action retirement envelope bounds later host outcome presentation too: the full reviewed effect duration/offsets/tail must fit, without truncation or stretching. Include explicit action recovery slack when later authoritative contacts need an impact display.
