# Versioned Hephaera installer

The current [full GitHub release is `5.1.0-rc.1`](https://github.com/TimothyMeadows/Hephaera/releases/tag/5.1.0-rc.1), also selected by [GitHub's latest-release link](https://github.com/TimothyMeadows/Hephaera/releases/latest). Both GitHub Packages installers are published. Promotion changed the GitHub classification while preserving the exact tag, package version and artifact bytes. Package clients still treat `-rc.1` as a SemVer prerelease; keep the explicit version below. The **npmjs.com and NuGet.org mirrors are not published yet**. The public commands below apply only after that destination's exact version is verified; the authenticated GitHub routes are available now.

| Destination | Package | Current availability |
| --- | --- | --- |
| GitHub npm | `@timothymeadows/hephaera` | Published `5.1.0-rc.1`; authenticated read |
| GitHub NuGet | `Hephaera` | Published `5.1.0-rc.1`; authenticated read |
| npmjs.com | `@timothymeadows/hephaera` | Pending public publication |
| NuGet.org | `Hephaera` | Pending public publication |

The installer creates a version-pinned Git checkout at `<project-root>/.hephaera`, then runs the canonical scaffold before reporting success. It creates the host `AGENTS.md` bootstrap and missing durable context automatically. Package acquisition alone does not initialize a project. Maintainers configure the public publishing path with [Public registry setup](PUBLIC_REGISTRY_SETUP.md).

## Prerequisites and boundaries

Start at the canonical root of an existing host Git repository. The installer refuses an arbitrary subdirectory, package cache or non-Git folder and does not run `git init`. Inspect an existing `.hephaera` first; manual clones/submodules and legacy state are not automatically adopted.

| Requirement | Purpose |
| --- | --- |
| Node.js 24 or later | Shared installer core, including the NuGet tool |
| npm | npm acquisition; not required by the NuGet launcher |
| .NET 10 SDK/tool runtime | NuGet acquisition and execution; not the npm route |
| Git and existing Bash | Pinned source checkout and scaffold; Git Bash is preferred on Windows |
| Network access to GitHub | Thin packages fetch their recorded public baseline revision |
| GitHub package-read credentials | Only for the GitHub Packages alternative; public registry reads need no login |

Python 3.9+ exposed as `python3` is additionally required by task/issue/checkpoint helpers; authenticated `gh` is required for their GitHub operations. On Windows, an installed Python exposed only as `python` needs explicit session-local `python3` launcher configuration in the executing Bash session; setup does not install or alias it. See the [installation reference](https://github.com/TimothyMeadows/Hephaera/wiki/Installation-and-Layout#prerequisites-and-source-transport).

Doctor reports managed source/scaffold state and separate native source/build status. It does not build or load models. Setup installs no SDK, Bash provider, Python environment, model or engine/style contract; native workflow prerequisites remain separate.

## npmjs setup after publication

**Pending:** run this route only after the chosen exact npmjs version is confirmed. Public reads do not need an npm publishing token.

Add or explicitly replace this one scoped mapping in the host `.npmrc`, preserving other settings:

```ini
@timothymeadows:registry=https://registry.npmjs.org
```

An old `@timothymeadows` mapping to GitHub must be changed deliberately; changing only the default registry does not replace a scoped mapping. Then acquire and run the exact installer:

```bash
npm exec --yes --registry=https://registry.npmjs.org --package=@timothymeadows/hephaera@5.1.0-rc.1 -- hephaera install --project .
```

This explicit command works without a `postinstall` hook and includes scaffold completion. `init` aliases install. After setup, run the same selected package with `doctor --project .`. A reviewed dev-dependency/lockfile can also record the exact installer, but acquisition alone does not scaffold the host. Package caches remain separate from durable `.hephaera/.cache`.

## NuGet.org setup after publication

**Pending:** use this route only after `Hephaera` `5.1.0-rc.1` is confirmed on NuGet.org. The .NET tool embeds the same Node core and still needs Node 24. Public package reads require no publisher credential.

Create a separate, token-free `NuGet.Hephaera.Public.config` at the host root:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
  <packageSourceMapping>
    <packageSource key="nuget.org"><package pattern="Hephaera" /></packageSource>
  </packageSourceMapping>
</configuration>
```

Download the published [setup ZIP](https://github.com/TimothyMeadows/Hephaera/releases/download/5.1.0-rc.1/hephaera-setup-5.1.0-rc.1.zip), verify it against the release [checksums](https://github.com/TimothyMeadows/Hephaera/releases/download/5.1.0-rc.1/CHECKSUMS-5.1.0-rc.1.txt), and extract it. Keep the bundle unchanged: its wrappers, Node helper, `setup-release.json` and original GitHub config are hash-bound. Put the new public config outside that directory; do not replace the bundle's `NuGet.Hephaera.config`.

Point `SETUP_DIR` (Bash) or `SetupDir` (PowerShell) at the reviewed extracted directory. The existing wrapper accepts the separate regular config path:

```bash
bash "$SETUP_DIR/setup-nuget.sh" --version 5.1.0-rc.1 --project . --configfile ./NuGet.Hephaera.Public.config
```

```powershell
& "$SetupDir/setup-nuget.ps1" --version 5.1.0-rc.1 --project . --configfile ./NuGet.Hephaera.Public.config
```

The wrapper acquires/restores the exact local tool, verifies its core/manifest, and invokes setup only after success. It preserves unrelated `.config/dotnet-tools.json` entries and refuses a conflicting version/command. If that manifest contains other tools, review their needed mappings before restore; the example intentionally maps only `Hephaera`. Do not broaden feeds silently.

The transparent Bash equivalent, after explicitly creating/validating the root local-tool manifest, is:

```bash
dotnet tool install --local Hephaera --version 5.1.0-rc.1 --tool-manifest .config/dotnet-tools.json --configfile ./NuGet.Hephaera.Public.config && dotnet tool run hephaera -- install --project .
```

PowerShell 5.1 needs separate commands and `$LASTEXITCODE` checks; use its wrapper. Raw `dotnet tool install` acquires tooling but does not scaffold. A warm cache can avoid feed lookup, so source mapping alone does not prove fresh acquisition; use an isolated cache when verifying registry origin, preserving the user's global cache.

NuGet.org adds repository signing. Its downloaded archive hash can differ from the unsigned GitHub `.nupkg` while the original payload remains identical. Maintainer verification requires both exact original entry contents and a valid trusted NuGet.org signature; see [public registry setup](PUBLIC_REGISTRY_SETUP.md#automatic-delivery-and-recovery). NuGet search may need **Include prerelease**, and validation/indexing can lag upload.

## GitHub Packages alternative

Both GitHub package versions are already published. Use this authenticated route until a public mirror is verified, or when deliberately selecting GitHub as the source. GitHub credentials are separate from npmjs/NuGet.org publisher accounts. Package pages: [npm](https://github.com/users/TimothyMeadows/packages/npm/package/hephaera), [NuGet](https://github.com/users/TimothyMeadows/packages/nuget/package/Hephaera).

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
npm exec --yes --registry=https://npm.pkg.github.com --package=@timothymeadows/hephaera@5.1.0-rc.1 -- hephaera install --project .
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

Use the same unchanged setup bundle with the GitHub config at the host root:

```bash
bash "$SETUP_DIR/setup-nuget.sh" --version 5.1.0-rc.1 --project . --configfile ./NuGet.Hephaera.config
```

```powershell
& "$SetupDir/setup-nuget.ps1" --version 5.1.0-rc.1 --project . --configfile ./NuGet.Hephaera.config
```

Only explicit `-- --with-bubo-source` is forwarded as an optional setup request. The acquisition wrapper does not forward `--dry-run`, because acquisition can write tooling/manifest/cache. After acquisition, the core's `install/init --dry-run` and `update --dry-run` are project-read-only previews; candidate staging and target admission are not run by them. `verify --json` reports packaged version/core identity. Dirty development previews cannot mutate a host.

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
