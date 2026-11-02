# Installation and layout

Hephaera's versioned installer is the primary setup interface: npm first, then the NuGet .NET tool. **Both packages are upcoming and not yet published.** `5.1.0-rc.1` is a proposed candidate, not an available stable version. Use package commands only after the exact release and authenticated downloads are verified. The [manual fallback](#advanced-manual-installation) remains usable at the end of this page.

All modes place a real baseline at `<project-root>/.hephaera`. The [installer reference](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/INSTALLER.md), [README](https://github.com/TimothyMeadows/Hephaera/blob/main/README.md#install) and [layering contract](https://github.com/TimothyMeadows/Hephaera/blob/main/AGENTS.md#layering-contract) define ownership. An npm cache, NuGet tool cache, symlink or arbitrary directory name is not a host installation.

## Prerequisites and source transport

Package setup requires PATH to be the canonical root of an existing host Git repository. It refuses arbitrary children of an enclosing repository and does not initialize Git automatically. Inspect an existing `.hephaera` first; manual installations and legacy approvals are not adopted automatically.

| Tool or access | Required for |
| --- | --- |
| Node.js 24+ | Shared installer core, also embedded in the NuGet tool |
| npm | npm package acquisition/execution |
| .NET 10 SDK/tool runtime | NuGet tool acquisition/execution; not the npm installer |
| Git and existing Bash | Exact source transport and canonical scaffold; Git Bash is preferred on Windows |
| GitHub Packages read access | Authenticated acquisition from both selected feeds, even for public packages |
| Network access | Thin packages fetch the recorded public baseline Git revision; no offline bundle is claimed |
| Python 3.9+ named `python3` | Existing task/issue/checkpoint helpers |
| Authenticated `gh` | CLI-backed GitHub issue/PR work, without bypassing readiness approval |

The installer reports unavailable prerequisites before project mutation and installs no SDK, provider, model or interpreter alias. A usable PowerShell interpreter may have a different name/PATH in Git Bash or WSL. The existing [task wrapper](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/create-task-file.sh) and [task implementation](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/lib/task-execution.py) require Python as `python3`.

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

## npm authentication and setup

GitHub Packages is independent of npmjs.com and nuget.org accounts. Use the consumer's GitHub identity and an expiring PAT **classic** with `read:packages` and package read access. Enter the token through an interactive prompt; do not copy it into Git, command arguments, receipts or screenshots.

Add this token-free project `.npmrc` scope mapping while preserving unrelated settings:

```ini
@timothymeadows:registry=https://npm.pkg.github.com
```

Authenticate, storing credentials at user level outside the project:

```bash
npm login --scope=@timothymeadows --auth-type=legacy --registry=https://npm.pkg.github.com
```

After an actual release, substitute its verified exact `<VERSION>`:

```bash
npm exec --yes --package=@timothymeadows/hephaera@<VERSION> -- hephaera install --project .
```

The explicit installer runs even when dependency lifecycle scripts are disabled. It installs/scaffolds the host; raw npm acquisition or adding a dev dependency alone does not. An exact dev-dependency path can be recorded in host package manifests, but still needs explicit setup. The selected installer/core/manifest identity must match the requested release.

## NuGet authentication and setup

`Hephaera` uses `https://nuget.pkg.github.com/TimothyMeadows/index.json`. It embeds the same Node core and does not fetch npm or eliminate Node 24. Use an explicit, credential-free `NuGet.Hephaera.config` with `<clear />`, the GitHub feed under source key `HephaeraGitHub`, and nuget.org for public dependencies. Map exact `Hephaera` to GitHub and `*` to nuget.org. See the [complete configuration](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/INSTALLER.md#authenticate-for-nuget).

Supply credentials via a supported provider or session-only `NuGetPackageSourceCredentials_HephaeraGitHub`, assembled with a hidden prompt. Its documented value shape is `Username=YOUR_GITHUB_USERNAME;Password=YOUR_CLASSIC_PAT;ValidAuthenticationTypes=Basic`. Match source-key case, do not echo credentials, and clear the session value afterward. Expired environment credentials can override newer stored ones. `--add-source` does not establish feed priority; package queries can run concurrently. Cached global packages can bypass source mapping, so cold-cache acquisition and actual package/core/manifest verification remain separate evidence.

After publication, use the release's reviewed, versioned acquisition-and-invoke wrapper. It must not run setup after failed acquisition.

After publication, obtain the matching `hephaera-setup-<VERSION>.zip` from the verified release, check its recorded checksum and extract it. Keep its `setup-nuget.sh`, `setup-nuget.ps1`, `setup-local-tool.cjs` and `setup-release.json` together. The helper checks bundle files, selected version and acquired core/manifest identity before setup. The complete reviewed `installer/setup/` source directory is an alternative for maintainers who verify that exact source revision. Copy its token-free `NuGet.Hephaera.config` to the host without overwriting existing configuration. These files are not obtained by running an unpinned remote script. Set `SETUP_DIR` (Bash) or `SetupDir` (PowerShell) to that reviewed local directory. After release, one explicit command acquires, verifies and invokes setup:

```bash
bash "$SETUP_DIR/setup-nuget.sh" --version <VERSION> --project . --configfile ./NuGet.Hephaera.config
```

```powershell
& "$SetupDir/setup-nuget.ps1" --version <VERSION> --project . --configfile ./NuGet.Hephaera.config
```

The wrapper verifies the selected local tool/core/manifest, stops on acquisition failure and forwards only the explicit optional `-- --with-bubo-source` request. The acquisition wrapper does not forward `--dry-run`, because tool acquisition can write its manifest/cache. After acquisition, core `install/init --dry-run` and `update --dry-run` provide project-read-only preflight; target staging is not run.
With the host `.config/dotnet-tools.json` explicitly created/validated, the transparent Bash equivalent is:

```bash
dotnet tool install --local Hephaera --version <VERSION> --tool-manifest .config/dotnet-tools.json --configfile ./NuGet.Hephaera.config && dotnet tool run hephaera -- install --project .
```

Run from the host root, preserve other tool entries and verify local manifest/version resolution. Restore an existing matching declaration or explicitly select its update instead of overwriting it. PowerShell 5.1 requires separate commands and `$LASTEXITCODE` checks; use the release's PowerShell wrapper. Raw `dotnet tool install` acquires a tool, not a project scaffold. [Publisher/account controls](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/INSTALLER_RELEASE.md) distinguish Actions tokens, account visibility and consumer access.

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

This is the working fallback while packages are unreleased. Choose one form at the host root without overwriting an existing installation:

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