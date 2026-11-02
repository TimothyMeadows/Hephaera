# Installation and layout

Install Hephaera directly at `<project-root>/.hephaera/`. This directory is required for every supported agent. A standalone Hephaera source checkout is a baseline-maintenance workspace; it is not an alternative installation folder for a game project.

The [installation source](https://github.com/TimothyMeadows/Hephaera/blob/main/README.md#install) and [layering contract](https://github.com/TimothyMeadows/Hephaera/blob/main/AGENTS.md#layering-contract) define the supported layout. Start with an existing host repository and a usable Git client. Bash runs the portable commands. Native production has additional prerequisites described in [Bubo runtime](Bubo-Runtime); ordinary setup does not require those tools.

## Check prerequisites for the intended work

Check tools in the shell that will execute Hephaera commands. An interpreter available in PowerShell may have a different command name or PATH in Git Bash or WSL. Scaffold creation does not install tools or create interpreter aliases automatically.

| Tool | Required for | Check or boundary |
| --- | --- | --- |
| Git | Clone/submodule installation, recorded dependency checkout and repository operations | `git --version` |
| Bash | Portable `.sh` commands | `bash --version`; Windows discovery is described below |
| Node.js | JavaScript adapters, engine/capability commands and other Node-backed workflows | `node --version`; inspect the workflow's requirements rather than assuming a minimum version |
| Python 3.9+ exposed as `python3` | Task creation, task-issue and checkpoint helpers | `python3 --version` in the executing Bash session |
| Authenticated GitHub CLI, `gh` | CLI-backed issue and PR operations | `gh auth status`; authentication does not bypass publication approval |
| .NET 10 SDK | Explicitly building the pinned Bubo runtime | `dotnet --list-sdks`; ordinary scaffold/memory work does not require a Bubo build |

The [engine launcher](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/lib/engine-common.sh) checks Node availability. The [task wrapper](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/create-task-file.sh), [issue wrapper](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/create-task-issue.sh) and [checkpoint wrapper](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/record-task-checkpoint.sh) explicitly invoke `python3`; their [implementation](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/lib/task-execution.py) enforces Python 3.9+ and uses `gh` for GitHub API operations. The [Bubo build wrapper](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/build-bubo-runtime.sh) requires an existing SDK rather than installing one.

On Windows, an existing installation may expose `python` while `python3` is absent. These helpers still require an executable named `python3` in their Bash session. A shell alias alone is insufficient for wrappers that use `exec python3`. After verifying that the executable `python` starts the intended Python 3.9+ interpreter, explicitly create a temporary launcher and add it to this session's PATH:

```bash
python --version
hephaera_launcher_dir="$(mktemp -d)"
printf '%s\n' '#!/usr/bin/env bash' 'exec python "$@"' > "$hephaera_launcher_dir/python3"
chmod +x "$hephaera_launcher_dir/python3"
export PATH="$hephaera_launcher_dir:$PATH"
python3 --version
bash .hephaera/commands/create-task-file.sh --help
```

This uses the already selected interpreter and writes no machine-specific executable path. The PATH change applies to this shell and its children; it is not a system configuration change. When no helper is running, remove the temporary launcher with `rm -- "$hephaera_launcher_dir/python3"` and its empty directory with `rmdir -- "$hephaera_launcher_dir"`. Do not create this launcher when a correct `python3` is already available. If Python or another prerequisite is missing, report it and choose installation explicitly before dependent work.

## Choose how the host receives updates

Fork Hephaera before using it in production or team projects. The fork lets the team review baseline updates, control customizations and pin the consumed revision. Substitute the fork URL in these examples.

A submodule is useful when the host should track one reviewed shared-baseline commit:

```bash
git submodule add https://github.com/<your-org>/Hephaera .hephaera
git submodule update --init --recursive --checkout -- .hephaera
```

A direct clone gives the project an independent baseline checkout:

```bash
git clone --recurse-submodules https://github.com/<your-org>/Hephaera .hephaera
```

Both forms contain the recorded Bubo dependency at `.hephaera/runtime/bubo`. Recursive initialization checks out recorded dependency revisions; it does not build Bubo, install model packs or approve generation. Review the baseline revision and host Git changes before committing them.

## Understand the two layers

```text
<project-root>/
  AGENTS.md
  ENGINE.md
  ARCHITECTURE.md
  STYLE.md
  MEDIA.md                 optional generated-media policy
  AUDIO.md                 optional SFX/ambience contract
  MUSIC.md                 optional music contract
  VOICE.md                 optional speech contract
  BRAINSTORM.md            optional persistent discovery
  BRAINSTORM_SUMMARY.md    generated on explicit exit
  .hephaera/
    AGENTS.md
    commands/
    skills/
    .engine/
    .architecture/
    .styles/
    .media/
    runtime/
    .cache/                durable host state, ignored by baseline Git
```

The tracked installation contains reusable shared configuration. The ignored `.cache/` child contains the host's memory, rules, tasks, goals, Gauntlets and evidence. Preserve it as durable project state. Do not commit it into the shared baseline, delete it as download data or import another installation's memory as a fallback.

The host root `AGENTS.md` receives a managed bootstrap that reads only `./.hephaera/AGENTS.md`. The scaffold preserves host content outside that block. Engine, architecture, style and optional media contracts remain at the host root. See [Project contracts](Project-Contracts) for their responsibilities.

## Make Bash available on Windows

Linux and macOS use their existing Bash runtime. On Windows, prefer existing Git Bash. From PowerShell at the host root, inspect available providers:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\.hephaera\commands\install-windows-bash.ps1"
```

If installation is explicitly selected, the bootstrap supports:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\.hephaera\commands\install-windows-bash.ps1" -Provider GitBash -Install
powershell -NoProfile -ExecutionPolicy Bypass -File ".\.hephaera\commands\install-windows-bash.ps1" -Provider WSL -Install
```

`-WhatIf` previews installation or scaffold execution. Software installation never happens during ordinary scaffold creation. To invoke the canonical scaffold through an existing selected provider:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\.hephaera\commands\install-windows-bash.ps1" -Provider GitBash -RunScaffold -ProjectRoot .
```

Git Bash is the recommended native Windows provider. WSL is available when Linux tooling compatibility is the intended choice. The [bootstrap implementation](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/install-windows-bash.ps1) owns provider discovery and failure messages.

## Resolve and scaffold

From the host root with Bash available:

```bash
bash .hephaera/commands/resolve-hephaera-paths.sh
bash .hephaera/commands/create-host-ai-scaffold.sh
```

Resolution must identify the direct parent of `.hephaera/` as the host. Invalid installation names or conflicting roots fail rather than searching a broad workspace parent. The scaffold is idempotent: it creates missing durable context and the managed bootstrap while preserving existing project content. It does not discover or import old install locations.

A compatible agent then reads the baseline and follows its memory-first startup. A useful first request is: “Read `.hephaera/AGENTS.md`, inspect the project contracts and available context, then help me plan the first task.” Missing architecture or style choices are resolved when relevant; startup is not permission to generate media or install a toolchain.

## Update deliberately

For a submodule installation:

```bash
git submodule update --remote --checkout -- .hephaera
git -C .hephaera submodule update --init --recursive --checkout -- runtime/bubo
```

Review and commit the changed `.hephaera` gitlink in the host. For a direct clone:

```bash
git -C .hephaera pull --ff-only
git -C .hephaera submodule update --init --recursive --checkout -- runtime/bubo
```

The second step restores Bubo at the new baseline's recorded revision. Do not use `--remote` against Bubo or recursively update nested dependencies to their latest branches. If the Bubo pin changes, explicitly rebuild before native work. Read-directive contracts pick up shared definitions; stale inline contracts require explicit regeneration and review.

## Existing historical state

Read the [state-transition guide](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/STATE_TRANSITION.md) before carrying forward legacy context:

```bash
bash .hephaera/commands/state-transition.sh inspect
```

Inspection is read-only. Explicit `prepare` records a persistent fence when legacy state is found; it neither copies that state nor relabels approvals. Preserve historical receipts, consent, journals and attempt budgets. A fresh installation without legacy state follows normal setup. If a prior managed bootstrap is detected, review and migrate it explicitly instead of appending a second bootstrap or deleting the evidence.

Use [Maintenance and troubleshooting](Maintenance-and-Troubleshooting) when resolution, bootstrap or dependency readiness fails. Report the exact operation and sanitized error; do not broaden the project boundary to make setup pass.
