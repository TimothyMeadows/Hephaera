# Project contracts

Host contracts record decisions that should remain consistent across tasks and sessions. Successful package setup creates the bootstrap and missing durable context; it does not select or generate these architecture, engine, style or media choices. They live at the game project's root, above `.hephaera/`. Shared templates live inside the installation. These contracts cooperate: selecting a game engine does not choose an art pipeline, and configuring a media domain does not replace software architecture.

The authoritative policy is [AGENTS.md](https://github.com/TimothyMeadows/Hephaera/blob/main/AGENTS.md); the [README contract table](https://github.com/TimothyMeadows/Hephaera/blob/main/README.md#engine-architecture-style-and-media-contracts) provides the source overview.

## Contract responsibilities

| Host artifact | Decision | Shared source |
| --- | --- | --- |
| `AGENTS.md` | Host instructions and managed baseline bootstrap | Shared `AGENTS.md` |
| `ENGINE.md` | Exactly one engine, languages and selected capabilities | `.engine/` |
| `ARCHITECTURE.md` | Frameworks, boundaries, data and engineering conventions | `.architecture/` |
| `STYLE.md` | Visual styles, one primary art pipeline and allowed alternatives | `.styles/` |
| Optional `MEDIA.md` | CLOUD/LOCAL execution, rights, budgets, provenance and promotion | `.styles/.pipelines/cloud/` and `local/` |
| Optional `AUDIO.md` | SFX and ambience production | `.media/pipelines/audio/` |
| Optional `MUSIC.md` | Instrumental and supplied-lyric music | `.media/pipelines/music/` |
| Optional `VOICE.md` | Preset speech and consented cloning | `.media/pipelines/voice/` |
| `web-game-package.json` after explicit initialization | Native host identity and static-web staging | `.packaging/maui/` |

`BRAINSTORM.md` and its exit summary hold discovery state, not engine or implementation settings. Durable learned rules and evidence belong under `.hephaera/.cache/`; they are not shared template edits.

## Architecture selection

Read an existing `ARCHITECTURE.md` before implementation. When it is missing, ask which templates apply. Multiple templates can describe a service, UI, data store and delivery stack together. Browse the [architecture catalog](https://github.com/TimothyMeadows/Hephaera/tree/main/.architecture) and [language/tool alignment](https://github.com/TimothyMeadows/Hephaera/blob/main/.architecture/LANGUAGE_SUPPORT.md).

For a user-selected .NET/PostgreSQL combination:

```bash
bash .hephaera/commands/generate-architecture.sh "DOTNET" "POSTGRESDB"
```

Default generation writes concise read directives. `--inline` embeds template contents only when explicitly requested. Regeneration requires the user to select templates again; do not infer that the previous combination still describes the intended change. An architecture template for a browser engine is a compatibility redirect, not an independent way to select that engine.

## Engine selection

Resolve before engine-owned work:

```bash
bash .hephaera/commands/resolve-engine.sh
bash .hephaera/commands/validate-engine-contract.sh
```

Supported selections are THREEJS, BABYLONJS, PHASERJS, UNITY, UNREAL and GODOT. An unconfigured project defaults to THREEJS only when existing evidence does not conflict. Unknown engines, invalid contracts or contrary game evidence require an explicit migration decision. Do not install packages or reinterpret code to force a default.

Generate a selected contract with `generate-engine.sh [--inline] [ENGINE]`. The generator preserves content outside its managed block. Read-directive contracts follow shared definitions; embedded definitions can become stale and need explicit regeneration. A skill request does not select its engine. Before activating a skill, resolve it and require `compatible: true`.

Web selections derive MAUI packaging; THREEJS also derives Quarks and pmndrs postprocessing capabilities. These are declarations, not installations. See [Engines and gameplay](Engines-and-Gameplay), [Web-game packaging](Web-Game-Packaging) and [Three.js extensions](Threejs-Extensions).

## Style and visual production

`STYLE.md` contains at least one style, exactly one primary pipeline, allowed alternatives, prompt-override scope and a no-silent-fallback rule. Select styles with the user when the contract is absent, unless the prompt already names them. Multiple styles are supported. Default the primary pipeline to PROOF_TO_MODEL unless another registered pipeline is explicitly selected.

```bash
bash .hephaera/commands/generate-style.sh "TACTICAL_UI_HUD"
bash .hephaera/commands/validate-style-contract.sh
bash .hephaera/commands/resolve-art-pipeline.sh
```

Explicit alternatives use the documented generator interface:

```bash
bash .hephaera/commands/generate-style.sh --pipeline BLENDER --allow-pipeline PROOF_TO_MODEL "CEL_SHADED_COMIC"
```

`FLOOR_PLAN_TO_MODEL` is the dimension-driven building option; it preserves the default PROOF_TO_MODEL and engine selection. All-procedural floor-plan work needs no MEDIA contract. Its exact complete drawing package must be approved before native modeling; see [Floor plan to model](Floor-Plan-to-Model).

A current-prompt pipeline selection applies only to the task and may select any registered pipeline. Record prompt-selection evidence with the current style-contract hash; do not rewrite the host contract implicitly. Regeneration preserves configured external libraries unless the user replaces or clears them. Inspect [Visual pipelines](Visual-Pipelines) before producing assets.

## Media execution and independent domains

Read `MEDIA.md` when image, music, SFX or voice generation or promotion is in scope. Do not create it during unrelated setup. It governs provider availability, staging, candidate/revision budgets, rights, consent and review. Inspect applicable CLOUD/session and LOCAL capabilities separately. If both are viable and no provider was selected, ask which to use before generation.

After that selection, `generate-media-contract.sh CLOUD [LOCAL]` creates the policy and `validate-media-contract.sh` validates it. A policy file does not establish executable readiness, authorize license acceptance or replenish an old allowance.

AUDIO, MUSIC and VOICE are independent domains, not primary STYLE choices. Configure only the requested domain:

```bash
bash .hephaera/commands/generate-media-pipeline-contract.sh AUDIO
bash .hephaera/commands/validate-media-pipeline-contract.sh AUDIO
bash .hephaera/commands/resolve-media-pipeline.sh --modality ambience
```

`--all --visual` resolves independent contexts alongside the existing visual selection. Missing unrelated optional contracts do not require new files. Generation planning does not need a fabricated engine; runtime handoff does need the actual engine and current target evidence. Read [Media pipelines](Media-Pipelines) for those distinctions.

## Contract freshness and changes

Resolvers and production receipts bind actual contract, definition, registry, source and tool hashes as applicable. A file name alone does not establish freshness. Changed policy or source bytes invalidate dependent evidence; a new version retains ancestry and receives the affected reviews again. Keep historical manifests unchanged.

Before a contract change, identify affected consumers: source implementation, staged assets, engine integration, target review, packaging snapshots and publication checkpoints. Validate the new contract and the relevant consumers. Technical validation verifies structure and identity; it cannot select artistic intent, approve rights, supply consent or stand in for human acceptance.

Do not silently swap providers, engines, renderers, authoring backends or pipelines after failure. Preserve the failed state and report the concrete unavailable prerequisite. The source contract remains the place to resolve a deliberate project decision; task evidence records a bounded exception where the workflow supports one.
