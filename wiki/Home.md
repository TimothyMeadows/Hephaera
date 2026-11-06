# Hephaera reference

Hephaera is a shared AI production baseline for video game development. It gives a compatible coding agent project contracts, specialist workflows, repeatable commands, durable context and delivery rules. The game, its dependencies and its production decisions remain in the host project.

Use the [practical documentation](https://hephaera.com/docs/) for a guided first installation or an everyday task. This Wiki explains the contracts, command families, evidence requirements and failure boundaries behind those guides. The [repository README](https://github.com/TimothyMeadows/Hephaera/blob/main/README.md) is the source overview; [AGENTS.md](https://github.com/TimothyMeadows/Hephaera/blob/main/AGENTS.md) is the shared operating contract.

Select security patch `5.2.1` after confirming publication; it retains floor-plan, schematic and reusable VFX/action-v2 production from `5.2.0`. Follow [Installation and layout](Installation-and-Layout) for exact release/feed availability and authentication: GitHub npm first, GitHub NuGet second, deliberate manual Git setup last. Public npmjs.com and NuGet.org publication is deferred. Existing pinned projects need an explicit managed update; native builds, tools and asset acceptance remain separate.

## Start and configure

| Reference | What it answers |
| --- | --- |
| [Installation and layout](Installation-and-Layout) | Versioned npm/NuGet setup and auth, automatic scaffold, managed updates, then manual clone/submodule fallback |
| [Project contracts](Project-Contracts) | Which files select architecture, engine, visual style and media policy |
| [Work modes and delivery](Work-Modes-and-Delivery) | Brainstorm, planning, Task, Goal, Gauntlet, PR readiness and post-PR QA |
| [Roles and skills](Roles-and-Skills) | How to find a specialist, resolve aliases and filter workflows by engine |
| [Memory and context](Memory-and-Context) | Startup, tagged retrieval, the repository map and durable local state |

## Build a game and its assets

| Reference | What it answers |
| --- | --- |
| [Engines and gameplay](Engines-and-Gameplay) | Six-engine selection, runtime ownership, gameplay concepts and actual target evidence |
| [Visual pipelines](Visual-Pipelines) | STYLE, registered visual primaries and external libraries |
| [Media pipelines](Media-Pipelines) | Independent AUDIO, MUSIC and VOICE production, consent, review and promotion |
| [Bubo runtime](Bubo-Runtime) | The pinned native dependency, explicit build, verified resources and readiness limits |
| [Floor plan to model](Floor-Plan-to-Model) | Whole-building design approval, detailed empty-room construction and portable model review |
| [Schematic to model](Schematic-to-Model) | Complete mechanical schematics, independent components, assembled articulation and portable model review |
| [Proof to model](Proof-to-Model) | Source classification, six approved views, reconstruction and measured Blender finishing |
| [Animation and actions](Animation-and-Actions) | Model readiness, real clips, action composition and presentation ownership |
| [VFX and action v2](VFX-and-Action-v2) | Reusable layered effects, exact action timing, shared Scene ownership and receiving evidence |
| [Web-game packaging](Web-Game-Packaging) | MAUI hosts and explicit Windows, macOS, Android and iOS packages |
| [Three.js extensions](Threejs-Extensions) | Quarks particles and pmndrs postprocessing without changing the host renderer |

## Operate and maintain

| Reference | What it answers |
| --- | --- |
| [Commands and validation](Commands-and-Validation) | Command discovery, focused validators, baseline suites and evidence interpretation |
| [Maintenance and troubleshooting](Maintenance-and-Troubleshooting) | Safe updates, stale state, unavailable tools, interrupted operations and useful diagnostics |

## Read examples in the right location

Unless a page says otherwise, Bash examples run from an installed **host project's root** and use `bash .hephaera/commands/...`. Commands run from inside the installation use `commands/...`. A standalone maintainer checkout uses its root `commands/` directory and is for baseline development, not another supported host layout.

Replace placeholders with reviewed project values. A command shown in documentation is an interface example, not permission to install software, generate media, accept a license, consume an attempt allowance, publish a PR or promote assets. Read the selected workflow before operations that change state.

## Keep evidence honest

Configuration, source validation, fixture tests, native execution, visual/listening review and target-device QA establish different things. Report unavailable checks explicitly. Selection never proves installation; a compiled package never proves device behavior; a technical report never supplies human acceptance. Preserve original sources, failed attempts, rights, consent and review ancestry.

Wiki source is maintained in the repository's [wiki directory](https://github.com/TimothyMeadows/Hephaera/tree/main/wiki). Publishing it to GitHub's separate Wiki repository and deploying the website are explicit release operations; a local documentation build does not establish that either destination is live.
