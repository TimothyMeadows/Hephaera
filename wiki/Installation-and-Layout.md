# Installation and layout

Select security patch [`5.2.1`](https://github.com/TimothyMeadows/Hephaera/releases/tag/5.2.1) after confirming publication; it retains floor-plan-to-model, schematic-to-model and reusable VFX/MODEL_TO_ACTION v2 from `5.2.0`. Start with authenticated GitHub npm, then the GitHub NuGet .NET tool. Confirm the exact release and feed version are published before acquisition. The release page provides the setup ZIP and checksums; [release notes](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/RELEASE_5_2_1.md) describe its fixes and coverage limits. npmjs.com and NuGet.org publication is deferred. The [manual Git route](#advanced-manual-installation) remains last.

All modes place a real baseline at `<project-root>/.hephaera`. The [installer reference](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/INSTALLER.md), [README](https://github.com/TimothyMeadows/Hephaera/blob/main/README.md#install) and [layering contract](https://github.com/TimothyMeadows/Hephaera/blob/main/AGENTS.md#layering-contract) define ownership. An npm cache, NuGet tool cache, symlink or arbitrary directory name is not a host installation.

## Prerequisites and source transport

Package setup requires PATH to be the canonical root of an existing host Git repository. It refuses arbitrary children of an enclosing repository and does not initialize Git automatically. Inspect an existing `.hephaera` first; manual installations and legacy approvals are not adopted automatically.

| Tool or access | Required for |
| --- | --- |
| Node.js 24+ | Shared installer core, also embedded in the NuGet tool |
| npm | npm package acquisition/execution |
| .NET 10 SDK/tool runtime | NuGet tool acquisition/execution; not the npm installer |
| Git and existing Bash | Exact source transport and canonical scaffold; Git Bash is preferred on Windows |
| GitHub Packages read access | Authenticated npm and NuGet acquisition below |
| Network access | Thin packages fetch the recorded public baseline Git revision; no offline bundle is claimed |
| Python 3.9+ named `python3` | Existing task/issue/checkpoint helpers |
| Authenticated `gh` | CLI-backed GitHub issue/PR work, without bypassing readiness approval |

The installer reports unavailable prerequisites before project mutation and installs no SDK, provider, model or interpreter alias. A Python command available in PowerShell may have a different name/PATH in Git Bash or WSL. The existing [task wrapper](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/create-task-file.sh) and [task implementation](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/lib/task-execution.py) require Python as `python3`.

If Windows exposes only the intended Python 3.9+ as `python`, a separately chosen session-local executable launcher can bridge that command name; a shell alias alone does not satisfy `exec python3`:

```bash
python --version
hephaera_launcher_dir="$(mktemp -d)"
printf '%s\n' '#!/usr/bin/env bash' 'exec python "$@"' > "$hephaera_launcher_dir/python3"
chmod +x "$hephaera_launcher_dir/python3"
export PATH="$hephaera_launcher_dir:$PATH"
python3 --version
```

Create this only when a correct `python3` is absent. After dependent helpers stop, remove only the owned launcher with `rm -- "$hephaera_launcher_dir/python3"` and its empty directory with `rmdir -- "$hephaera_launcher_dir"`. This does not provision Python or modify system PATH.

## Registry selection and availability

| Registry | Package identity | Release selection |
| --- | --- | --- |
| GitHub npm | `@timothymeadows/hephaera` | `5.2.1`, authenticated read |
| GitHub NuGet | `Hephaera` | `5.2.1`, authenticated read |
| npmjs.com and NuGet.org | Public mirrors | Deferred; not part of this release |

GitHub Packages and public registry searches are separate destinations. GitHub's [release listing](https://github.com/TimothyMeadows/Hephaera/releases) records immutable versions; `5.1.0-rc.1` remains historical with its original contents. New source or a tooling update does not change an existing pinned host.

## npm setup

Select this token-free host `.npmrc` scope mapping, preserving unrelated settings:

```ini
@timothymeadows:registry=https://npm.pkg.github.com
```

Use your own GitHub identity and expiring PAT classic with `read:packages`. Enter it interactively and keep credentials outside the project:

```bash
npm login --scope=@timothymeadows --auth-type=legacy --registry=https://npm.pkg.github.com
npm exec --yes --registry=https://npm.pkg.github.com --package=@timothymeadows/hephaera@5.2.1 -- hephaera install --project .
```

[GitHub npm package](https://github.com/users/TimothyMeadows/packages/npm/package/hephaera). The explicit command runs setup even when dependency lifecycle hooks are disabled. A dev-dependency acquisition alone does not scaffold the host; record its exact version and separately invoke setup. No npmjs.com publisher account is required.

## NuGet setup

The `Hephaera` .NET tool retains the Node 24 requirement. From the [5.2.1 release](https://github.com/TimothyMeadows/Hephaera/releases/tag/5.2.1), download `hephaera-setup-5.2.1.zip`, verify it against `CHECKSUMS-5.2.1.txt`, extract it and keep every bundled file unchanged. The helper verifies `setup-release.json` file hashes, including the supplied GitHub config.

Use the [token-free GitHub configuration](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/INSTALLER.md#authenticate-for-nuget) at the host root, outside the bundle. It maps exact `Hephaera` to source key `HephaeraGitHub` at `https://nuget.pkg.github.com/TimothyMeadows/index.json`. Supply a supported credential provider or session-only `NuGetPackageSourceCredentials_HephaeraGitHub`, assembled using a hidden prompt. Its shape is `Username=YOUR_GITHUB_USERNAME;Password=YOUR_CLASSIC_PAT;ValidAuthenticationTypes=Basic`; match source-key case and never store a literal token in project files. No NuGet.org publisher account is required.

Point `SETUP_DIR` (Bash) or `SetupDir` (PowerShell) at the reviewed extracted directory:

```bash
bash "$SETUP_DIR/setup-nuget.sh" --version 5.2.1 --project . --configfile ./NuGet.Hephaera.config
```

```powershell
& "$SetupDir/setup-nuget.ps1" --version 5.2.1 --project . --configfile ./NuGet.Hephaera.config
```

[GitHub NuGet package](https://github.com/users/TimothyMeadows/packages/nuget/package/Hephaera). Acquisition uses the explicit root `.config/dotnet-tools.json`, preserves unrelated entries, verifies exact tool/core/manifest identity, then invokes setup. A conflicting version or command stops. An existing manifest restore can need mappings for its other tools; review those rather than silently broadening feeds. Cached packages may bypass lookup/mapping, so cold-cache origin verification remains separate; preserve the user's global cache. `--add-source` does not establish feed priority.

Raw `dotnet tool install` only acquires tooling. PowerShell 5.1 needs explicit exit-code checks for manual command sequences; the wrapper handles them. The wrapper forwards only explicit `-- --with-bubo-source`, not `--dry-run`. After acquisition, core `install/init --dry-run` and `update --dry-run` provide project-read-only previews without candidate staging/target admission. See [installer ownership/reference](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/INSTALLER.md).

## Public publishing reference

npmjs.com and NuGet.org publication is deferred. This release uses `publish_public=false` and does not launch the existing downstream public workflow. Account setup, selected destinations, exact source/release/run/signer admission and per-registry readback belong to a separately authorized future rollout. The [public registry reference](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/PUBLIC_REGISTRY_SETUP.md) retains that process and clearly labeled historical inputs. GitHub publication does not establish public availability.

## Layout and automatic scaffold

The package setup operation fetches the immutable recorded source commit into its own real Git checkout. It writes tracked host `hephaera.lock.json`, preserves other host files and adds an owned `/.hephaera/` ignore entry. It never stages or commits a nested repository as a host gitlink automatically.

```text
<project-root>/
  AGENTS.md                 managed bootstrap plus existing host instructions
  hephaera.lock.json        exact managed release/source identity
  .gitignore                owned /.hephaera/ exclusion, other entries retained
  ENGINE.md                 project choice, not generated by package setup
  ARCHITECTURE.md            project choice
  STYLE.md                  visual-work choice
  .hephaera/
    AGENTS.md
    commands/
    skills/
    runtime/
    .cache/                 durable private host context and operation receipts
```

Successful `install`/`init` always runs the [canonical scaffold](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/create-host-ai-scaffold.sh) at the final path. It verifies direct-parent root/cache resolution, one complete host bootstrap and required state. Existing AGENTS content outside the block is preserved. Declared missing-file creations and missing protected SYSTEM_MEMORY default appends preserve existing bytes; historical receipts, consent and consumed attempts are not rewritten. A partial failure remains nonzero with retained recovery evidence, not a cleaned-up success.

The first agent session reads `.hephaera/AGENTS.md` and project context; it is not the package scaffold trigger. Architecture, engine, style and optional media decisions stay separate. See [Project contracts](Project-Contracts) and [Memory and context](Memory-and-Context).

## Managed lifecycle and native readiness

Invoke lifecycle commands through the selected exact npm release or local NuGet tool. `doctor/status --project PATH` reports state; `restore --project PATH` uses the exact lock. A selected target release runs `update --project PATH --dry-run` before an explicit update. Repair/recover retains journals and refuses changed or foreign ownership. A stale owner or timed-out/interrupted child requires reviewing and stopping remaining owned work before explicit `recover --project PATH --confirm-quiescent`; an absent parent PID alone is not quiescence evidence. Active, unknown or malformed owners still refuse reconciliation. It does not auto-adopt manual clones/submodules or unsupported legacy state.

Supported production readers hold cooperative maintenance leases through queue/run/cancel/cleanup. Update needs exclusive ownership and does not change Bubo GPU scheduling. These are cooperative guards, not an OS sandbox against unmanaged processes. Existing history/cache remain at the same absolute path. Deactivation preserves source, exclusion, inactive ownership and cache; optional `--remove-bootstrap` selects only the unchanged managed bootstrap. Removing npm/NuGet tooling affects tooling alone. See [Maintenance](Maintenance-and-Troubleshooting).

Default setup leaves Bubo source uninitialized. Explicit `--with-bubo-source` initializes recorded source only; native build remains separate:

```bash
bash .hephaera/commands/initialize-bubo-runtime.sh
bash .hephaera/commands/build-bubo-runtime.sh
```

An existing .NET 10 SDK and actual workflow tools are required. Gitlink/revision/build/API/catalog checks remain mandatory. No model download, license acceptance, generation, native readiness or runtime promotion follows from installer success. See [Bubo runtime](Bubo-Runtime).

Read [state transition](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/STATE_TRANSITION.md) before carrying older context forward. Read-only `state-transition.sh inspect` preserves it; do not erase legacy markers, import a neighboring cache or relabel approvals as an installation repair.

## Advanced manual installation

Use this advanced route when deliberately managing the baseline through Git. Choose one form at the host root without overwriting an existing installation:

```bash
git submodule add https://github.com/TimothyMeadows/Hephaera.git .hephaera
git submodule update --init --recursive --checkout -- .hephaera
bash .hephaera/commands/create-host-ai-scaffold.sh
```

Or use an independent clone:

```bash
git clone --recurse-submodules https://github.com/TimothyMeadows/Hephaera.git .hephaera
bash .hephaera/commands/create-host-ai-scaffold.sh
```

Manual setup needs the explicit scaffold. Recursive checkout initializes recorded Bubo source without building it. Review host Git/index/exclusion ownership. For manual submodule updates, review `git submodule update --remote --checkout -- .hephaera`; clones use `git -C .hephaera pull --ff-only`. Then initialize only recorded Bubo with `git -C .hephaera submodule update --init --recursive --checkout -- runtime/bubo`. Never run `--remote` against Bubo or use package-owned lifecycle commands on a manual installation.

On Windows after checkout, inspect providers using `powershell -NoProfile -ExecutionPolicy Bypass -File ".\.hephaera\commands\install-windows-bash.ps1"`. Existing Git Bash can run the scaffold with `-Provider GitBash -RunScaffold -ProjectRoot .`. Git Bash or WSL installation is a separate explicit `-Install` operation; `-WhatIf` previews. Linux/macOS use existing Bash.

A fork is the final advanced option for teams maintaining baseline customizations. Substitute its reviewed URL and own its releases/update policy. Official package consumers do not need to fork first. Manual fallback does not authorize cache deletion, implicit tooling or migration of historical grants.
