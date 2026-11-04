# Roles and skills

Roles provide a specialist perspective; skills provide reusable workflows; commands perform deterministic execution. Natural language remains the primary interface. You can request a gameplay fix or an asset review without memorizing catalog names, then use explicit names when you want tighter control.

The current catalogs are [roles](https://github.com/TimothyMeadows/Hephaera/blob/main/.roles/INDEX.md), [skills](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/INDEX.md) and the [canonical role-to-capability map](https://github.com/TimothyMeadows/Hephaera/blob/main/.roles/ROLE_SKILL_MAP.json). Browse those sources rather than assuming this page is a frozen copy of every available entry.

## Resolve a role identity first

Definitions live at `.roles/<domain>/<role>/ROLE.md`. Current domains include computer science and arts. A request may use an exact name, an indexed alias or a domain-qualified ID. Exact names take precedence over aliases. A unique unqualified match can resolve automatically; ambiguity requires a domain-qualified choice. Do not invent a missing role file.

For the role resolver, run from inside the installed baseline because it reads the local `.roles` catalog:

```bash
(cd .hephaera && bash commands/resolve-role.sh "gameplay-engineer")
```

Then resolve the selected role's effective capabilities from the host root:

```bash
bash .hephaera/commands/resolve-role-capabilities.sh computer-science/gameplay-engineer
```

The second resolver filters against the actual engine and returns compatible capabilities and exclusion reasons. Role identity alone does not authorize another engine's workflow or satisfy missing tools. Inspect the resolved `ROLE.md` and use its priorities within the task's existing contracts.

## Choose an owner by responsibility

| Need | Useful role family | Main responsibility |
| --- | --- | --- |
| Core loop, progression or balance | `computer-science/game-designer` | Player decisions, design hypotheses and playtests |
| Runtime systems and engine integration | `computer-science/gameplay-engineer` | State, lifecycle, implementation and performance |
| Planning and safe parallel delivery | `computer-science/project-manager` | Scope, dependencies, lane ownership and integration |
| Reproducible verification | `computer-science/qa-engineer` | Scenarios, artifacts, regression and target coverage |
| Architecture and services | `software-architect`, `backend-architect`, `sre` | Boundaries, persistence, reliability and operations |
| Security review | `computer-science/security-engineer` | Concrete threats, safe changes and verified evidence |
| Accurate reference material | `computer-science/technical-writer` | Commands, contracts, audience and source alignment |
| Visual direction | `arts/art-director` | Style, consistency, budgets and specialist routing |
| Blender production | `arts/blender-production-artist` | Immutable sources, staged authoring and exports |
| Runtime model/motion handoff | `arts/technical-3d-artist` | Topology, rigs, articulation, clips and integration |
| Generated media orchestration | `computer-science/generative-media-pipeline-engineer` | Pins, provenance, bounded execution and recovery |
| Specialist 2D, VFX or sound | Indexed arts roles | Domain-specific production and complete review |

Roles compose in requested order. The first is primary by default; later roles add review lenses and constraints. Conflicts use the stricter or safer interpretation unless the user sets a different priority. A role changes emphasis, not authorization or engine selection.

## Resolve every skill before activation

Each skill lives at `skills/<name>/SKILL.md` with matching `agents/openai.yaml` interface metadata. Frontmatter declares either `engines: [AGNOSTIC]` or exactly one registered engine. Engine-specific skills use canonical prefixes; the registry holds supported aliases.

```bash
bash .hephaera/commands/resolve-engine.sh
bash .hephaera/commands/resolve-skill.sh design-game-systems
bash .hephaera/commands/resolve-skill.sh threejs-build-scenes
```

Require `compatible: true` before activation or delegation. The Three.js example applies only in a compatible effective engine. Requesting a skill never switches the project engine. AGNOSTIC means shared policy, not universal platform support: browser evidence cannot certify native UI or physical haptics, and native production still needs its declared runtime and tools.

Read the resolved skill before work. Its inputs, output contract, notes and evidence requirements may be more specific than a catalog description. A compatible skill can still report unavailable execution when a browser, Editor, Blender connection, SDK or licensed model is missing.

## Find a workflow without copying the catalog

| Catalog area | Representative skills | Follow-up reference |
| --- | --- | --- |
| Design and runtime | `design-game-systems`, `design-action-gameplay`, `build-gameplay-runtime`, `build-game-ui` | [Engines and gameplay](Engines-and-Gameplay) |
| Selected-engine features | Engine-prefixed scene, controls, physics, material, UI and tooling skills | Engine registry and selected definition |
| Asset production | `build-proof-to-model-assets`, `build-floor-plan-models`, `build-schematic-models`, `direct-blender-production`, `prepare-game-art-handoff` | [Visual pipelines](Visual-Pipelines) |
| Motion | `build-model-animations`, `build-model-actions` | [Animation and actions](Animation-and-Actions) |
| Media | `use-bubo-local-generation`, `build-audio-assets`, `build-music-assets`, `build-voice-assets` | [Media pipelines](Media-Pipelines) |
| Delivery | `create-task-file`, `goal-flow`, `gauntlet-flow`, `pr-readiness-gate`, `post-pr-qa` | [Work modes and delivery](Work-Modes-and-Delivery) |
| Context | `maintain-memory`, `maintain-repository-map`, `clean-context` | [Memory and context](Memory-and-Context) |
| QA | `test-playable-games`, `profile-application-performance`, Playwright skills | [Commands and validation](Commands-and-Validation) |

The [skill schema](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/SCHEMA.md) defines metadata, naming, links and safety requirements. The [external-source ledger](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/EXTERNAL_SOURCES.md) records adapted capability boundaries; it does not make external prose executable authority.

## Maintain mappings and delegate safely

`.roles/ROLE_SKILL_MAP.json` is canonical. Its Markdown counterpart is generated, then checked for drift. Baseline maintainers use `generate-role-skill-map.sh` and `validate-role-skill-map.sh`; host tasks should not rewrite shared maps to bypass a filtered exclusion.

For substantial parallel work, resolve roles and skills before assigning lanes. Record scope, disjoint write sets, dependencies, outputs and verification in the task's `SUBAGENTS.md`. The main agent owns final integration and evidence. A subagent receives only the authority needed for its assignment; delegation does not remove publication, media review, rights or promotion gates.
