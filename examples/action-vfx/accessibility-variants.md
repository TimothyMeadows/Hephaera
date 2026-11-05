# Original effect alternatives

These original engineering designs illustrate how to preserve an effect's meaning while changing its cost or motion. They are design examples for the [reviewed-action walkthrough](README.md), not accepted game assets or native approval records. Use current project-owned inputs, exact hashes and actual camera evidence when implementing them.

The caster uses original engineering charge, cast and recovery clips with a real hand anchor. Its source-selection protocol fixtures are explicitly synthetic and supply no human asset approval. Release is at 1.375 seconds; the planned target event is at 2.5 seconds and motion ends at 2.75 seconds. The rigid example uses its real exhaust anchor and an explicitly supplied live endpoint. Gameplay retains all target, movement and hit authority.

| Example | Authored change | Meaning to preserve |
| --- | --- | --- |
| Caster, lower cost | One source ring and sprite, one small traveling body, one stationary impact; no trail or multi-particle impact burst | Charge, exact release, direction and planned impact |
| Caster, steady shapes | Hollow source circle, fixed target diamond and stationary filled-square impact; no traveling body or trail | Source, intended destination and impact remain distinct without hue |
| Rigid, lower cost | Keep a beam, source ring and sprite; remove the other layer families | Source, endpoint and the explicit short beam interval |
| Rigid, steady shapes | Narrow steady beam with a neutral source ring/sprite; remove bursts and trails | Source and supplied endpoint remain readable while the game may move that endpoint |

“Lower cost” and “reduced motion” are different goals. A longer steady cue may cost more than a brief burst. Measure actual resource reservations and loading/compile/steady/peak work; a smaller particle count does not remove Quarks' minimum buffer allocations.

## Choose shape and plane together

The steady caster uses a newly authored opaque white fixed input, multiplied by linear RGBA `[0.18, 0.18, 0.18, 1]`. Reusing a red texture with a gray multiplier would leave it colored. The source circle uses a bounded ring; the target uses ring geometry with inner radius `0`, outer radius `0.5` and four segments, producing a filled diamond. The impact is a plane. Their sizes are explicit, and no pulse, additive flash, camera motion or global time change is introduced.

A target glyph and a ground indicator have different planes. The ground-indicator family rotates its geometry into the ground plane. At a low camera angle a valid diamond can collapse into a thin sliver. For a target-plane glyph, author the supported ring presentation or an explicit justified orientation. Review the actual combined camera view: pixel presence and framing checks cannot establish shape readability. Do not change the camera silently to rescue an unclear cue.

The diamond is a fixed target snapshot during the release-to-event window. It is not a homing projectile or a hit prediction. The filled square starts at the planned event; runtime gameplay instead supplies confirmed contact through the separate host-outcome policy. Keep its full duration and bounded tail inside the original action envelope.

## Hold a beam without inventing a target tracker

The steady rigid example holds the beam from 0.25 to 1.75 seconds with retirement bounded by 2 seconds. Its live endpoint requires current-generation, monotonic, non-future inputs, within the declared age, range and update-rate bounds. Invalid or stale input retires the affected presentation.

A second continuously tracking target glyph is not implied: the current contract admits live endpoints for the explicit beam placement. Keep that boundary instead of adding an unsupported target-following cue. A steady beam reduces effect motion; it does not eliminate endpoint movement supplied by gameplay or change the model's animation.

## Review actual outputs and their cost

Keep separate original versions for the normal reference and every alternative. Choose a finite candidate/revision allowance before work, retain failed candidates and do not reset existing generation or native attempt ledgers. The original engineering exercise used one candidate and at most one revision per alternative; that is not a generation allowance for another project.

Watch each complete normal-speed action. Inspect source, release, target and impact on neutral, dark and light backgrounds, with the real camera and two actors plus ambient effects at a declared representative peak. Check occlusion, shape, contrast, temporal evolution, tails and hard cancellation. Request a separate human readability judgment; technical metrics do not certify accessibility or photosensitivity safety.

For short effects, an interval-end resource count may be zero even though earlier frames had a peak. Retain initial and sampled owned-resource maxima separately from the endpoint snapshot. Keep resource-counter probes outside timed update/render spans, label instrumented loop overhead, and investigate every median stage increase above 10% across five comparable runs. Report CPU submission, synchronized wall time and owned-buffer estimates with their actual scope; they are not pure GPU memory/time or a whole-game frame-rate guarantee.

Current technical, independent and human runtime records remain separate. These examples grant no native action acceptance, asset promotion, software installation or packaged-device certification.
