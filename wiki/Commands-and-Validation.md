# Commands and validation

Commands are deterministic execution steps underneath conversational workflows. Skills decide when a workflow applies; commands perform its repeatable operations. Read the command's current help or source before use, especially for installation, generation, review records, GitHub writes and runtime promotion.

The authoritative [command directory](https://github.com/TimothyMeadows/Hephaera/tree/main/commands), [command schema](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/SCHEMA.md) and [README command index](https://github.com/TimothyMeadows/Hephaera/blob/main/README.md#commands) define the available execution layer. Catalog presence is not proof that a prerequisite is installed.

## Location and interface conventions

Host-root examples use `bash .hephaera/commands/NAME.sh`. From inside the installation or a standalone maintainer source checkout, use `bash commands/NAME.sh`. Some catalog-oriented scripts, including role resolution, read paths relative to the baseline directory; the examples for those explicitly change into `.hephaera/`.

Bash commands use strict mode and fail on errors. The Windows Bash bootstrap is PowerShell because it may run before Bash exists. Commands should emit actionable output, avoid embedded secrets and hidden installs, and remain tool-agnostic. `--help` is a discovery interface where supported, not a universal flag to assume for every small wrapper; inspect the source usage when necessary.

Production manifests and receipts bind exact current input, policy and tool identities. Use returned paths rather than constructing hashed state directories. Placeholders in this Wiki are not valid evidence files. A command that records a receipt consumes an actual assertion; it cannot manufacture human acceptance.

## Versioned installer entry point

The published GitHub npm and NuGet packages expose the same Hephaera installer at `5.1.0-rc.1`; public-registry mirrors have separate availability. For a verified exact destination/version, explicit `install/init --project PATH` installs the pinned baseline and always completes the canonical scaffold; acquisition alone does not. `doctor/status` reports readiness. Exact locked restore, target-version update/dry-run, journal-aware repair/recover and non-destructive deactivation remain distinct operations. See [Installation and layout](Installation-and-Layout) for authentication, invocation and the usable manual fallback. Installer tooling does not replace the baseline's workflow commands or provision native tools/models.

## Resolution and contract families

| Family | Commands | Key boundary |
| --- | --- | --- |
| Host and Bash | `resolve-hephaera-paths.sh`, `create-host-ai-scaffold.sh`, `install-windows-bash.ps1` | Fixed installation and explicit software installation |
| Historical state | `state-transition.sh` | Read-only inspect; explicit persistent preparation fence |
| Engine/capabilities | `resolve-engine.sh`, `generate-engine.sh`, `validate-engine-contract.sh`, `resolve-skill.sh`, `resolve-role-capabilities.sh` | Compatibility before writes/launches; no implicit engine change |
| Role catalogs | `resolve-role.sh`, `generate-role-skill-map.sh` | Canonical identity and generated map; baseline ownership |
| Architecture/style | `generate-architecture.sh`, `generate-style.sh`, `resolve-art-pipeline.sh`, `validate-style-contract.sh` | User-selected contracts and task-local override evidence |
| Media policy | `generate-media-contract.sh`, `validate-media-contract.sh`, `generate-media-pipeline-contract.sh`, `validate-media-pipeline-contract.sh`, `resolve-media-pipeline.sh` | Provider policy and independent requested domains |
| External libraries | `list-external-asset-libraries.sh`, `inspect-external-asset-library.sh`, `copy-external-asset.sh` | Read-only sources, copy first and no overwrite |

See [Project contracts](Project-Contracts) for selection semantics. Generator success does not approve downstream execution.

## Work tracking and publication families

| Family | Commands | Key boundary |
| --- | --- | --- |
| Brainstorm | `brainstorm-mode.sh`, `show-brainstorm.sh`, `validate-brainstorm.sh` | Explicit sticky discovery; no delivery creation while active |
| Task/issue | `create-task-file.sh`, `create-task-issue.sh`, `import-task-from-issue.sh`, `sync-task-issues.sh`, `update-todo-checklist.sh` | Real scope and matching issue; GitHub writes are explicit |
| Checkpoints | `record-task-checkpoint.sh`, `validate-task-checkpoint.sh` | Canonical evidence for current files/results |
| Parallel lanes | `create-subagent-plan.sh`, `validate-subagent-plan.sh`, `record-subagent-result.sh` | Resolved roles, disjoint writes and main-lane integration |
| Goal | `create-goal-file.sh`, `create-goal-completion-report.sh` | Explicit ordered flow and post-PR QA |
| Gauntlet | `create-gauntlet-file.sh`, `validate-gauntlet.sh`, `record-gauntlet-round.sh`, `record-gauntlet-pr-event.sh`, `record-gauntlet-promotion-qa.sh`, `create-gauntlet-completion-report.sh` | Approved frozen contract, fresh critics and live hash-bound PR evidence |
| PR/QA | `pr-readiness-check.sh`, `link-pr-to-task-issue.sh`, `comment-pr-qa-results.sh`, `comment-issue-test-results.sh` | Mode-specific publication gate and actual post-PR evidence |

Read [Work modes and delivery](Work-Modes-and-Delivery). Automatic publication is limited to explicit Goal task PRs and approved Gauntlet progress PRs. It never grants merging, store distribution, asset promotion or unrelated external publication.

## Production and verification tooling

| Area | Commands | Detailed owner |
| --- | --- | --- |
| Gameplay brief/review | `print-gameplay-system-brief.sh`, `validate-gameplay-review.sh` | [Gameplay](Engines-and-Gameplay) |
| Native runtime | `initialize-bubo-runtime.sh`, `build-bubo-runtime.sh`, `test-bubo-runtime.sh` | [Bubo](Bubo-Runtime) |
| LOCAL media | `inspect-local-media-host.sh`, `install-bubo-media.sh`, `bubo-media.sh`, `validate-media-generation-manifest.sh` | [Media](Media-Pipelines) |
| Domain assets | `audio-pipeline.sh`, `music-pipeline.sh`, `voice-pipeline.sh` | Separate immutable domain lifecycles |
| Source-to-model | `proof-to-model.sh` | [Proof to model](Proof-to-Model) |
| Floor-plan buildings | `floor-plan-to-model.sh` | [Floor plan to model](Floor-Plan-to-Model) |
| Motion/actions | `model-to-animation.sh`, `model-to-action.sh` | [Animation and actions](Animation-and-Actions) |
| CODE models | `create-code-model-manifest.sh`, `validate-code-model-manifest.sh`, `next-code-model-pass.sh`, `record-code-model-review.sh` | THREEJS source-authoring contract |
| CODE characters | `create-code-character-profile.sh`, `validate-code-character-profile.sh`, `measure-code-character-evidence.sh`, `record-code-character-calibration.sh`, `record-code-character-gate.sh` | Ordered gates and independent calibrated evidence |
| Blender | `print-blender-production-brief.sh`, `inspect-blender-scene.sh`, `validate-blender-scene-report.sh`, `validate-blender-python.sh` | [Visual pipelines](Visual-Pipelines) |
| Three.js effects | `threejs-particles.sh`, `threejs-postprocessing.sh` | [Three.js extensions](Threejs-Extensions) |
| Native web packages | `web-game-package.sh` | [Packaging](Web-Game-Packaging) |

The [asset argument reference](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/BUBO_ARGUMENTS.md) covers proof, floor-plan, motion and action flags. Floor-plan initialization uses plan/rights/budget records and no actor, recipe or toolchain arguments. Their current native help and pinned schemas remain the exact interface authority.

## Supporting engineering families

| Area | Representative commands | Notes |
| --- | --- | --- |
| Memory/map | `append-system-memory.sh`, `append-project-memory.sh`, `query-project-context.sh`, `repo-map-status.sh`, `purge-project-memory.sh`, `migrate-memory-v2.sh`, `clean-context.sh` | Verified knowledge, tagged retrieval and archived cleanup |
| Task archives | `archive-task-note.sh`, `archive-task-context.sh` | Retain durable knowledge and history |
| .NET | `dotnet-restore.sh`, `dotnet-build.sh`, `dotnet-test.sh`, `dotnet-format.sh`, `dotnet-clean-rebuild.sh`, `dotnet-list-outdated-packages.sh`, `dotnet-upgrade-assistant.sh` | Existing host architecture and toolchain |
| Browser QA | `playwright-install.sh`, `playwright-test.sh`, `playwright-capture-page.sh`, `playwright-discovery-report.sh`, `playwright-report-summary.sh`, `playwright-evidence-report.sh`, `playwright-artifact-index.sh` | Explicit installation and actual browser prerequisites |
| Performance/demo | `web-performance-report.sh`, `render-browser-demo.sh` | Recorded workload/artifacts; no invented measurements |
| Security/dependencies | `security-scan.sh`, `dependency-check.sh`, `audit-agent-source.sh`, `snyk-scan.sh`, `stackhawk-scan.sh`, `veracode-scan.sh` | Tool/account availability and actual scope |
| Databases | `install-database-cli-tools.sh`, `database-cli-query.sh` | Explicit provider/client and reviewed queries |

## Focused and integrated validation

For shared-baseline maintenance, run checks from its source root. In an installed project, change into `.hephaera/` first for these catalog checks:

```bash
cd .hephaera
bash commands/validate-readme.sh
bash commands/validate-roles.sh
bash commands/validate-skills.sh
bash commands/validate-commands.sh
bash commands/validate-skill-safety.sh
bash commands/validate-role-skill-map.sh
```

Other focused families validate engines/language alignment, styles/art pipelines, media templates/contracts, memory, rigged actors, Blender reports, CODE profiles, Brainstorm and Gauntlet state. Choose checks that cover the changed contract. Baseline maintainers run `bash commands/validate-hephaera.sh` for the integrated suite, following its declared prerequisites. The suite includes structural and fixture coverage; do not describe it as executing every production tool, model or native target.

Host verification is proportional to risk: focused regressions first, broader tests when needed, and actual logs/browser/native/device evidence where unit tests cannot establish behavior. A passing link, schema, fixture or compiler checks only its scope. Record actual command/result, source/build identity and blocked checks, then apply the relevant human review and publication gates.
