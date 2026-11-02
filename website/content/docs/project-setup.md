# Record the choices your project depends on

Hephaera works best when the agent can read your project's important decisions instead of guessing them again. The main choices are software architecture, game engine where relevant, visual style, and any media workflows you actually use.

Package setup creates the bootstrap and missing context, not these choices. It does not automatically create engine, architecture, style or media contracts. Keep these contracts in the host project root, beside its `AGENTS.md`. The shared templates and commands live inside `.hephaera`. Project-specific learned state stays in `.hephaera/.cache`; changing a host project's preferences does not require changing the shared baseline.

## Describe the software first

`ARCHITECTURE.md` explains your stack and boundaries: languages, frameworks, data stores, services, and engineering conventions. Hephaera supports combining templates, so a web application with a service and database does not have to pretend it has one architecture.

Ask the agent to inspect the repository before choosing:

```text
Identify the stack and current boundaries. Show me which architecture templates fit, including any choices that are still uncertain. Generate the host contract only after we agree on that selection.
```

For an agreed .NET/PostgreSQL selection, the existing generator can be run from the host root:

```bash
bash .hephaera/commands/generate-architecture.sh DOTNET POSTGRESDB
```

This example is a choice, not a default for every project. Generated contracts normally contain short read directives pointing at shared templates. Fully embedded template text is an explicit option.

## Choose the game engine deliberately

`ENGINE.md` selects one of Three.js, Babylon.js, Phaser, Unity, Unreal, or Godot. An unconfigured project defaults to Three.js; existing evidence for another engine or a conflicting contract requires an explicit decision, not a silent conversion.

For a new project you have chosen to build in Unity:

```bash
bash .hephaera/commands/generate-engine.sh UNITY
bash .hephaera/commands/validate-engine-contract.sh
bash .hephaera/commands/resolve-engine.sh
```

Do not use engine regeneration as a shortcut for migrating an existing game. Ask the agent to describe the migration and compatibility risks first. Architecture, game engine, Blender authoring, and art production are separate choices; selecting one does not install the others.

The agent resolves compatible feature skills before engine API work. A Three.js example is not automatically a Unity or Godot implementation. Hephaera can also help with services and tools; their architecture remains relevant independently of game-engine capabilities.

## Add visual and media choices when needed

`STYLE.md` records visual direction and one primary art pipeline, with allowed alternatives. New style contracts default to `PROOF_TO_MODEL` unless you choose another registered pipeline. You can combine styles without combining several primary pipelines. Follow [art and assets](art-and-assets.md) before setting this up for production.

`MEDIA.md` governs CLOUD/LOCAL media execution, budgets, rights, staging, and review. `AUDIO.md`, `MUSIC.md`, and `VOICE.md` are optional, independent domain contracts. You do not need to create them for a code-only feature. [Audio, music, and voice](audio-music-voice.md) explains when each fits.

## Keep capabilities separate from readiness

Web engines select MAUI packaging as a capability; initialization, platform SDKs, builds, signing, and device QA are still separate. Three.js selects Quarks for new particles and pmndrs postprocessing for screen effects; selection alone does not install packages, replace a renderer, or prove GPU behavior.

Ask for a concise readiness report that names selected choices, missing prerequisites, and checks still needed. The wiki covers [project contracts](https://github.com/TimothyMeadows/Hephaera/wiki/Project-Contracts), [engines and gameplay](https://github.com/TimothyMeadows/Hephaera/wiki/Engines-and-Gameplay), [web-game packaging](https://github.com/TimothyMeadows/Hephaera/wiki/Web-Game-Packaging), and [Three.js extensions](https://github.com/TimothyMeadows/Hephaera/wiki/Threejs-Extensions) in detail.
