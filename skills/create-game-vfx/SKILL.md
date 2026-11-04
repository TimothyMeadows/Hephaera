---
name: create-game-vfx
description: Design reusable game effects, stage versioned VFX packages, and review their timing, readability, rights, budgets and accessibility. Use for individual effects or effects coordinated with model actions.
engines: [AGNOSTIC]
---

# Create Game Vfx

## When to use

- Adding feedback for a gameplay event or state.
- Building sprite, particle, shader, mesh, trail, or screen-space effects.
- Reviewing VFX for readability, timing, accessibility, or runtime cost.

## Workflow

For reusable assets, read [versioned-vfx-assets.md](references/versioned-vfx-assets.md) and use `./commands/vfx-assets.sh`. Start with a task-bound brief and rights evidence, inspect prerequisites, stage inexpensive provisional work, and obtain a current independent complete-phase review before detailed work. Preserve immutable inputs, rejected attempts and version ancestry. The command validates packages through Bubo; it does not create a STYLE primary, select another engine, install dependencies or grant generation or asset promotion.

Check the command's actual capabilities before promising production. The initial lifecycle admits owned/licensed fixed inputs and native contract/dependency inspection. Use native bounded preparation for owned/licensed PNG sheets, ordered sequences and typed masks. The selected THREEJS production bridge supplies bounded layered effects and a review-scene attachment; it needs exact host-admitted libraries, decoded resource correspondence and actual target captures. Generated-receipt admission, reusable-package action playback and promotion remain unavailable at this delivery. Existing MODEL_TO_ACTION v1 keeps its original cues. A JSON package or review verdict does not establish rendered quality or human runtime acceptance.

For effects timed across a dance, combination or charge/cast sequence, coordinate with `build-model-actions`. Bind cues to real reviewed step/clip markers and anchors, capture fixed target points explicitly, and keep cancellation/resource cleanup separate from gameplay hit and projectile decisions.

For THREEJS, particle production uses the engine-selected `threejs-build-particles` Quarks owner and host-locked compatible packages. Missing dependencies or an unsupported renderer require direction; do not silently substitute native point primitives or install another backend. Other engine owners remain unchanged.

1. Define the gameplay event, audience, visibility distance, camera, duration, priority, and success signal.
2. Break the effect into anticipation, activation, impact, sustain, and release as applicable.
3. Assign shape, color, motion, scale, depth, audio, camera, and UI layers without duplicating feedback.
4. Resolve the active engine and compatible material/animation feature skills through `resolve-skill.sh`; define pool, allocation, overdraw, light, particle, and texture budgets. This agnostic VFX workflow does not authorize another engine's APIs or select a different art pipeline.
5. Provide reduced-flash, reduced-motion, contrast, and color-independent cues.
6. Validate timing against authoritative gameplay events and test cleanup under repeated activation.
7. Define the effect's clock, cancellation owner, overlap/intensity cap, and expiration under pause, focus loss, scene exit, and prediction correction. Coordinate its layer with camera, sound, HUD, and optional haptics through the gameplay-feedback owner; a visual impact is not a tactile effect.

When a staged effect is authored or simulated in Blender, use `simulate-blender-effects` for deterministic solver and cache ownership before this skill defines runtime timing, pooling, and gameplay validation.

Read [vehicle-speed-and-warp.md](references/vehicle-speed-and-warp.md) for motion-package anchors, continuous travel effects, warp phases and cancellation. Use `build-model-animations` for the model/motion package; this skill owns the selected-engine effects and their runtime evidence.

## Output

- A VFX timing and layer brief.
- Runtime asset, budget, pooling, accessibility, and fallback requirements.
- Representative gameplay and stress-test acceptance criteria.

## Guardrails

- Do not let VFX timing decide authoritative hits or state.
- Do not obscure hazards, targets, UI, or player silhouettes.
- Do not create unbounded particles, lights, allocations, or screen flashes.
