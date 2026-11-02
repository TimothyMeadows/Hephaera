# Engines and gameplay

`ENGINE.md` selects one game engine. The [engine registry](https://github.com/TimothyMeadows/Hephaera/blob/main/.engine/registry.json) defines supported identities, languages, feature skills and derived capabilities. Resolve it before engine-owned work, then use compatible owners and the host's actual locked versions. An engine-neutral design contract does not supply portable engine APIs.

## Supported selections

| Engine | Engine-owned languages | Runtime kind | Example feature owners |
| --- | --- | --- | --- |
| THREEJS | TypeScript, JavaScript, GLSL, WGSL | Web | Scenes, controls, actors, materials, UI, CODE models, particles, postprocessing |
| BABYLONJS | TypeScript, JavaScript, GLSL, WGSL | Web | Scenes, controls, physics integration, actors, materials, UI, audio |
| PHASERJS | TypeScript, JavaScript | Web | Scenes, controls, physics, tilemaps, sprites, UI, audio |
| UNITY | C#, HLSL, ShaderLab | Native | Scenes, physics, animation, UI, rendering, Editor tooling and selected services |
| UNREAL | C++, Blueprint, HLSL | Native | Gameplay framework, abilities, movement, AI, worlds, multiplayer and tooling |
| GODOT | GDScript, C#, Godot shader language | Native | Scenes, controls, physics, actors, shaders, UI, multiplayer and tooling |

The table identifies catalog coverage, not equal depth, installed dependencies or a promise that a host game implements every feature. Browse the selected definition in the [engine index](https://github.com/TimothyMeadows/Hephaera/blob/main/.engine/INDEX.md) and resolve individual skills.

## Resolution and migration

```bash
bash .hephaera/commands/resolve-engine.sh
bash .hephaera/commands/validate-engine-contract.sh
bash .hephaera/commands/resolve-skill.sh build-gameplay-runtime
```

Require `compatible: true` for every activated skill. An unconfigured project defaults to THREEJS only when existing game evidence does not conflict. Invalid contracts, unknown selections or conflicting evidence require explicit migration; there is no silent fallback or automatic package installation.

`generate-engine.sh [--inline] [ENGINE]` creates a selected contract, preserving text outside its managed block. Read directives follow shared definitions. Stale embedded definitions need explicit regeneration. Standalone services and tools retain their own architecture; selecting Unity does not force a supporting Python tool to become C#.

Three.js supplies rendering, not a complete physics, networking, navigation or AI system. Choose those dependencies and ownership explicitly. Similarly, engine service skills do not activate accounts, accept agreements or install SDKs merely because they appear in a role map.

## Isolated prototype overrides

A current prompt can select another engine only for an isolated prototype. The task must exist and the output scope must be absent or empty:

```bash
bash .hephaera/commands/resolve-engine.sh \
  --override GODOT --task prototype-task \
  --scope prototypes/experiment --record-override
```

This is a bounded example, not a migration instruction. Consumers revalidate the task-local receipt with `--evidence` and the exact `--output` before writes or tool launches. The receipt binds project/effective engine, contract, definition, registry and task hashes plus output scope. Do not write incompatible code into the existing game, reuse stale evidence or rewrite `ENGINE.md` to disguise an override.

## Define authoritative ownership

Use [build-gameplay-runtime](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/build-gameplay-runtime/SKILL.md), action design and compatible engine feature owners to separate simulation from presentation.

| Concern | Required decision | Representative checks |
| --- | --- | --- |
| Clocks | Units, fixed/variable stepping, catch-up cap and presentation interpolation | Stalls, pause, dropped time and frame-rate variation |
| Input | Edge identity, buffering, expiry, focus and ownership | Single consumption, modal close, device change and cancellation |
| Movement | One collision-aware writer, speed/acceleration and support history | Stop/reverse, slopes, teleports and stale contacts |
| Damage | Execution/strike/recipient identity and active intervals | Deduplication, intentional multi-hit, immunity and interruption |
| Actor state | Legal transitions, entry/exit and terminal states | Reentry, pooling, death, respawn and stale callbacks |
| Feedback | Bounded camera, audio, effects and haptic requests | Overlap, accessibility, cleanup and actual hardware |

Animation markers, particle completion, audio playback and visual projectile arrival cannot decide targeting, damage, movement, costs or rewards. Presentation responds to truthful gameplay events and may submit explicitly validated intent to the controller.

## Use the gameplay concept index

The [gameplay concepts guide](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/GAMEPLAY_CONCEPTS.md) maps common terms to current owners and future checks. It covers coyote time, input buffering, hit stop, hitboxes, camera deadzones, raycasting, pathfinding, steering, seeded generation, spatial queries, time slicing, streaming, normals, LOD, culling, shaders, quaternions, pooling and render budgets.

Those links identify available guidance and focused gaps. They do not prove a portable implementation or require every game to use every technique. A small turn-based game may need neither streaming nor fixed physics stepping. Add indexing, pooling or scheduling when a measured workload justifies it, and compare final behavior against an appropriate oracle.

Raycasting for finite geometric queries is separate from ray-traced rendering. Ray/path tracing remains deferred in the current Three.js rendering scope.

## Derived production capabilities

All web-engine selections derive MAUI packaging for Windows, macOS through Mac Catalyst, Android and iOS. Native engines retain their exporters. Selection creates no native host or workload; read [Web-game packaging](Web-Game-Packaging).

THREEJS selects Quarks for new particle work and pmndrs postprocessing for new screen effects. This preserves the host renderer and package locks, installs nothing and requires actual rendering evidence. CODE art remains Three.js-specific. Other engines do not reinterpret CODE or acquire these libraries automatically.

## Verify the actual game

Record source/build identity, engine and dependencies, physics/render backend, target and settings. Unit tests can prove exercised math or lifecycle cases; fixtures cannot establish player comprehension, art quality or device performance. Actual selected-engine scenarios should cover boundaries, interruption, repeated entry/exit, ownership cleanup and representative workloads.

Use recorded CPU/GPU/memory measurements and observed playtests for budgets. Avoid universal frame-rate claims detached from device and build conditions. Browser tests cover browser surfaces; native UI, packaged WebViews and physical haptics need their actual targets. Mark unavailable checks `blocked` or `not-run`, preserve contradictory results, and keep technical readiness distinct from human acceptance.
