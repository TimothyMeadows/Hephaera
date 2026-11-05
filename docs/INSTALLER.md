# Versioned Hephaera installer

Select security patch [`5.2.1`](https://github.com/TimothyMeadows/Hephaera/releases/tag/5.2.1) after confirming the exact release/feed version is published. It retains the floor-plan-to-model, schematic-to-model and reusable VFX/MODEL_TO_ACTION v2 workflows introduced in `5.2.0`. The [release notes](RELEASE_5_2_1.md) describe fixes and limits. Historical `5.1.0-rc.1` remains unchanged and does not contain these later workflows.

| Destination | Package | Release selection |
| --- | --- | --- |
| GitHub npm | `@timothymeadows/hephaera` | `5.2.1`; authenticated read |
| GitHub NuGet | `Hephaera` | `5.2.1`; authenticated read |
| npmjs.com and NuGet.org | Public mirrors | Deferred; not part of this release |

The installer creates a version-pinned Git checkout at `<project-root>/.hephaera`, then runs the canonical scaffold before reporting success. It creates the host `AGENTS.md` bootstrap and missing durable context automatically. Package acquisition alone does not initialize a project. Use GitHub npm first or the GitHub NuGet tool below. Public-registry accounts are unnecessary for these routes.

## Prerequisites and boundaries

Start at the canonical root of an existing host Git repository. The installer refuses an arbitrary subdirectory, package cache or non-Git folder and does not run `git init`. Inspect an existing `.hephaera` first; manual clones/submodules and legacy state are not automatically adopted.

| Requirement | Purpose |
| --- | --- |
| Node.js 24 or later | Shared installer core, including the NuGet tool |
| npm | npm acquisition; not required by the NuGet launcher |
| .NET 10 SDK/tool runtime | NuGet acquisition and execution; not the npm route |
| Git and existing Bash | Pinned source checkout and scaffold; Git Bash is preferred on Windows |
| Network access to GitHub | Thin packages fetch their recorded public baseline revision |
| GitHub package-read credentials | Both package routes below use authenticated GitHub Packages |

Python 3.9+ exposed as `python3` is additionally required by task/issue/checkpoint helpers; authenticated `gh` is required for their GitHub operations. On Windows, an installed Python exposed only as `python` needs explicit session-local `python3` launcher configuration in the executing Bash session; setup does not install or alias it. See the [installation reference](https://github.com/TimothyMeadows/Hephaera/wiki/Installation-and-Layout#prerequisites-and-source-transport).

Doctor reports managed source/scaffold state and separate native source/build status. It does not build or load models. Setup installs no SDK, Bash provider, Python environment, model or engine/style contract; native workflow prerequisites remain separate.

## GitHub Packages setup

Use your own GitHub identity for both channels. GitHub credentials are separate from npmjs.com/NuGet.org publisher accounts. Package pages: [npm](https://github.com/users/TimothyMeadows/packages/npm/package/hephaera) and [NuGet](https://github.com/users/TimothyMeadows/packages/nuget/package/Hephaera).

### Authenticate for npm

Use your own expiring GitHub PAT **classic** with `read:packages` and package permission. Keep credentials in user-level storage outside the project. Preserve other `.npmrc` settings while selecting:

```ini
@timothymeadows:registry=https://npm.pkg.github.com
```

Authenticate interactively; enter the PAT at the password prompt:

```bash
npm login --scope=@timothymeadows --auth-type=legacy --registry=https://npm.pkg.github.com
```

### npm setup

Run at the host root:

```bash
npm exec --yes --registry=https://npm.pkg.github.com --package=@timothymeadows/hephaera@5.2.1 -- hephaera install --project .
```

The selected scoped mapping and explicit registry must agree. [GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).

### Authenticate for NuGet

Use the release bundle's token-free `NuGet.Hephaera.config`, copied to the host without changing the extracted bundle, or create its equivalent:

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

Supply GitHub credentials through a supported provider or session-only `NuGetPackageSourceCredentials_HephaeraGitHub`, assembled with a hidden prompt. Its shape is `Username=YOUR_GITHUB_USERNAME;Password=YOUR_CLASSIC_PAT;ValidAuthenticationTypes=Basic`. Match source-key case; never put a literal token in tracked config, arguments or examples. An expired environment credential can override a newer stored credential. [Authenticated feeds](https://learn.microsoft.com/en-us/nuget/consume-packages/consuming-packages-authenticated-feeds).

Exact-ID mapping selects GitHub for Hephaera. `--add-source` is not a source-priority rule; cached packages can bypass lookup/mapping. [Source mapping](https://learn.microsoft.com/en-us/nuget/consume-packages/package-source-mapping).

### NuGet setup

From the [5.2.1 release](https://github.com/TimothyMeadows/Hephaera/releases/tag/5.2.1), download `hephaera-setup-5.2.1.zip`, verify it against `CHECKSUMS-5.2.1.txt`, and extract it. Keep the wrappers, helper, `setup-release.json` and bundled config unchanged. Copy the token-free GitHub config to the host root without changing the bundle. Point `SETUP_DIR` (Bash) or `SetupDir` (PowerShell) at the reviewed extracted directory:

```bash
bash "$SETUP_DIR/setup-nuget.sh" --version 5.2.1 --project . --configfile ./NuGet.Hephaera.config
```

```powershell
& "$SetupDir/setup-nuget.ps1" --version 5.2.1 --project . --configfile ./NuGet.Hephaera.config
```

Only explicit `-- --with-bubo-source` is forwarded as an optional setup request. The acquisition wrapper does not forward `--dry-run`, because acquisition can write tooling/manifest/cache. After acquisition, the core's `install/init --dry-run` and `update --dry-run` are project-read-only previews; candidate staging and target admission are not run by them. `verify --json` reports packaged version/core identity. Dirty development previews cannot mutate a host.

## Public registries later

npmjs.com and NuGet.org publication is deferred. This release selects only GitHub Releases and GitHub Packages, with `publish_public=false`. Do not use a public search result or configure a public publisher to install from GitHub. The existing [public registry setup reference](PUBLIC_REGISTRY_SETUP.md) is retained for a separately authorized future rollout.

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

Use this advanced route when deliberately managing the baseline through Git. Run from the existing host Git root, choose one form, and do not write over `.hephaera`:

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
