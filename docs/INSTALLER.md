# Versioned Hephaera installer

**Upcoming release:** the npm and NuGet packages described here are not published. `5.1.0-rc.1` is the proposed first candidate, not a downloadable stable version. Package examples become usable only after both exact artifacts and their authenticated downloads are verified. Until then, use the [manual fallback](#advanced-manual-installation) last in this guide.

The installer creates a real, version-pinned Git checkout at `<project-root>/.hephaera`, then runs the canonical scaffold before reporting success. It creates the managed host `AGENTS.md` bootstrap and missing durable context automatically. Reading AGENTS for the first time is no longer the package setup step. Package acquisition alone does not initialize a project.

## Prerequisites and boundaries

Run setup against the canonical root of an existing host Git repository. An arbitrary subdirectory, package cache or non-Git folder is refused; the installer does not run `git init` for you. Inspect an existing `.hephaera` before attempting installation. Manual clones/submodules and legacy state are not automatically adopted.

| Requirement | Purpose |
| --- | --- |
| Node.js 24 or later | Shared installer core, including the NuGet tool |
| npm | Acquiring the npm entry point; not required by the NuGet launcher |
| .NET 10 SDK/tool runtime | Acquiring/running the NuGet tool; not needed by the npm installer |
| Git and an existing Bash provider | Exact source checkout and canonical scaffold; Git Bash is preferred on Windows |
| GitHub credentials with package read access | Both selected GitHub Packages feeds require authentication, including public packages |
| Network access to GitHub | The thin packages fetch the recorded public baseline Git revision; this is not an offline source bundle |

Python 3.9+ exposed as `python3` is additionally required by task/issue/checkpoint helpers. Authenticated `gh` is required for their GitHub operations. Doctor reports managed source/scaffold state and separate native source/build statuses. A runtime-verified status checks existing pinned source/build/resource admission; generation readiness remains unverified. Check Python, SDKs and selected workflow prerequisites separately; doctor never builds or loads a model. No SDK, Bash provider, Python environment, model, engine/style contract or native build is installed automatically.

## Authenticate for npm

Use your own GitHub identity and an expiring personal access token **classic** with `read:packages` and package read permission. npmjs.com credentials are separate and do not authenticate GitHub Packages. Do not put tokens in Git, examples, project files, receipts or screenshots.

Add this nonsecret scope mapping to the host's `.npmrc`, preserving other settings:

```ini
@timothymeadows:registry=https://npm.pkg.github.com
```

Authenticate interactively; enter the classic PAT at the password prompt:

```bash
npm login --scope=@timothymeadows --auth-type=legacy --registry=https://npm.pkg.github.com
```

Keep resulting credentials in user-level authentication storage outside the project. Do not replace the default registry for unrelated npm packages. [GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).

## npm setup

After the release is available, replace `<VERSION>` with its verified exact version and run from the host root:

```bash
npm exec --yes --package=@timothymeadows/hephaera@<VERSION> -- hephaera install --project .
```

This explicit command runs even when dependency lifecycle scripts are disabled; no `postinstall` hook performs host setup. `init` is an alias for install. The ordinary result includes source installation and scaffold completion. Use the selected package's `doctor --project .` afterward, for example:

```bash
npm exec --yes --package=@timothymeadows/hephaera@<VERSION> -- hephaera doctor --project .
```

A project may instead record the exact installer as a dev dependency and review its package/lockfile changes. Acquiring it does not scaffold the host until its explicit install command runs. Keep package-manager cache contents separate from `.hephaera/.cache`.

## Authenticate for NuGet

The NuGet package ID is `Hephaera`, hosted at `https://nuget.pkg.github.com/TimothyMeadows/index.json`. It embeds the same Node core as npm; it does not fetch npm or remove the Node requirement. Use a token-free `NuGet.Hephaera.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="HephaeraGitHub" value="https://nuget.pkg.github.com/TimothyMeadows/index.json" />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
  <packageSourceMapping>
    <packageSource key="HephaeraGitHub"><package pattern="Hephaera" /></packageSource>
    <packageSource key="nuget.org"><package pattern="*" /></packageSource>
  </packageSourceMapping>
</configuration>
```

Supply your GitHub username and classic PAT through a supported credential provider or the session-only variable `NuGetPackageSourceCredentials_HephaeraGitHub`. Its value has the documented shape `Username=YOUR_GITHUB_USERNAME;Password=YOUR_CLASSIC_PAT;ValidAuthenticationTypes=Basic`; assemble it through a hidden prompt, never a literal token in a shell command or tracked file. Match the source-key case. Remove session credentials after use. An expired environment credential can override other credentials. [Authenticated feeds](https://learn.microsoft.com/en-us/nuget/consume-packages/consuming-packages-authenticated-feeds).

Exact-ID mapping sends the tool to GitHub and dependencies to nuget.org. `--add-source` is not a precedence rule. An already cached package can bypass lookup/mapping, so feed validation also needs isolated-cache acquisition and actual artifact/core/manifest identity checks. Do not delete the user's global cache. [Source mapping](https://learn.microsoft.com/en-us/nuget/consume-packages/package-source-mapping).

## NuGet setup

Use the reviewed, versioned acquisition-and-invoke wrapper supplied with the release; it installs the exact local tool and invokes setup only after successful acquisition. Obtain its release-specific file through the verified release instructions, not an unpinned remote script.

After publication, obtain the matching `hephaera-setup-<VERSION>.zip` from the verified release, check its recorded checksum and extract it. Keep its `setup-nuget.sh`, `setup-nuget.ps1`, `setup-local-tool.cjs` and `setup-release.json` together. The helper checks bundle files, selected version and acquired core/manifest identity before setup. The complete reviewed `installer/setup/` source directory is an alternative for maintainers who verify that exact source revision. Copy its token-free `NuGet.Hephaera.config` to the host without overwriting existing configuration. These files are not obtained by running an unpinned remote script. Set `SETUP_DIR` (Bash) or `SetupDir` (PowerShell) to that reviewed local directory. After release, one explicit command acquires, verifies and invokes setup:

```bash
bash "$SETUP_DIR/setup-nuget.sh" --version <VERSION> --project . --configfile ./NuGet.Hephaera.config
```

```powershell
& "$SetupDir/setup-nuget.ps1" --version <VERSION> --project . --configfile ./NuGet.Hephaera.config
```

The wrapper verifies the selected local tool/core/manifest, stops on acquisition failure and forwards only the explicit optional `-- --with-bubo-source` request. The acquisition wrapper does not forward `--dry-run`: acquiring a local tool can write its manifest/cache. After acquisition, the selected core supports `install/init --dry-run` and `update --dry-run` as project-read-only preflight. Candidate staging and target admission are explicitly not run by that preview.
The transparent equivalent, after explicitly creating or validating the host `.config/dotnet-tools.json`, is:

```bash
dotnet tool install --local Hephaera --version <VERSION> --tool-manifest .config/dotnet-tools.json --configfile ./NuGet.Hephaera.config && dotnet tool run hephaera -- install --project .
```

Run from the host root so local-tool resolution selects that manifest. Preserve its other tools. If Hephaera is already declared, restore the selected exact entry or make an explicit version update instead of overwriting it. Restoring an existing manifest can also restore its other tools; review their allowed feeds/mappings explicitly rather than silently broadening sources or rewriting their entries. Windows PowerShell 5.1 needs separate commands and an explicit `$LASTEXITCODE` check after acquisition; Bash's `&&` syntax is not portable to it. The release wrapper handles the supported platform path. `dotnet tool install` alone downloads tooling; it does not scaffold the project.

Read-only `verify --json` reports the packaged version and manifest/core identity. Raw source CLI files need a generated adjacent release manifest; dirty development-preview packages can be inspected but cannot mutate a host. They are not substitute published installers.

## Success, ownership and recovery

A successful install verifies the immutable release manifest, exact baseline commit/tree and recorded Bubo identity, then checks root/cache resolution and one complete managed bootstrap. Keep `hephaera.lock.json` and host bootstrap changes under normal host review. The installer adds a marked `/.hephaera/` exclusion so the nested checkout is not accidentally staged as an embedded repository. It never commits host changes.

The ignored `.hephaera/.cache` is durable host memory, tasks, approvals and evidence. Installation/repair may create declared missing scaffold files and append missing protected system defaults while preserving existing bytes. Historical ledgers, consent and consumed attempts are not replaced or reset. A nonzero partial install is not success; retain its journal and follow the specific repair/recovery instructions. Never delete the cache or unknown transaction state to retry.

Invoke lifecycle commands through the selected exact npm package or local NuGet tool:

| Operation | Interface and boundary |
| --- | --- |
| Inspect | `doctor --project PATH` or `status --project PATH`; report readiness without installing prerequisites |
| Restore | `restore --project PATH`; use the exact locked package/manifest, not latest |
| Update | Target-version tool: `update --project PATH --dry-run`, then explicit `update --project PATH`; review owned changes first |
| Repair/recover | `repair --project PATH` / `recover --project PATH`; preserve failed-operation evidence and refuse changed/foreign state |
| Deactivate | `deactivate --project PATH`; optional `--remove-bootstrap` selects managed bootstrap removal; retain source, exclusion, inactive ownership and cache |

The Hephaera `uninstall` command aliases deactivation; it does not delete the baseline. Removing npm/NuGet tooling does not remove the baseline. Updates refuse unsafe ownership, dirty source/collisions and active work. Cooperative maintenance leases protect supported baseline readers through queue/run/cancel/cleanup while the updater holds exclusive ownership; this is not an operating-system sandbox against unmanaged processes. No operation silently migrates a manual installation or historical approvals.

## Native execution remains separate

Default setup leaves Bubo source uninitialized. Explicit `install --project PATH --with-bubo-source` may initialize only its recorded source. Neither form builds it or installs models. When the selected workflow needs native execution, explicitly use an existing .NET 10 SDK:

```bash
bash .hephaera/commands/initialize-bubo-runtime.sh
bash .hephaera/commands/build-bubo-runtime.sh
```

Real parent Git/gitlink, exact revision, build receipt, API and audited-resource checks remain in force. A changed pin can make an existing build stale. Tool/model licenses, rights, budgets, generation, review, human asset acceptance and runtime promotion remain separate.

### Interrupted owners and quiescence

A dead installer/dispatch PID does not prove its Git or native descendants have stopped. If recovery reports stale ownership or an interrupted process timeout/signal, stop the remaining owned workers and review the retained owner/operation evidence first. Then use the exact selected tool's `recover --project PATH --confirm-quiescent`. This explicit operator assertion permits reconciliation of validated dead owners; it does not clear active, foreign or malformed records, scan all OS processes, or grant generation permission. Normal caught-failure recovery with released owners needs no flag. Standalone stale-lease cleanup can return doctor status without changing source/scaffold.

## Advanced manual installation

This is the usable fallback while packages are unreleased. Run from the existing host Git root, choose one form, and do not write over `.hephaera`:

```bash
git submodule add https://github.com/TimothyMeadows/Hephaera.git .hephaera
git submodule update --init --recursive --checkout -- .hephaera
bash .hephaera/commands/create-host-ai-scaffold.sh
```

Or use an independent checkout:

```bash
git clone --recurse-submodules https://github.com/TimothyMeadows/Hephaera.git .hephaera
bash .hephaera/commands/create-host-ai-scaffold.sh
```

These manual forms require their explicit scaffold command and initialize recorded Bubo source without building it. Review submodule/index/ignore ownership with the host team; do not apply package-managed update commands to them. Forking is an advanced option for teams maintaining baseline customizations: substitute the reviewed fork URL and own its update/release policy. The official package path does not require a fork.

See [README installation](../README.md#install), [installation wiki](https://github.com/TimothyMeadows/Hephaera/wiki/Installation-and-Layout) and [publisher instructions](INSTALLER_RELEASE.md). The first agent session still reads AGENTS and resolves project choices; package setup does not select architecture, engine, style or media policy.
