# Install Hephaera in your project

**Package setup is upcoming.** The npm and NuGet installers are not published yet; `5.1.0-rc.1` is the proposed candidate. The package commands below are previews for a verified release. To install today, use the [manual fallback](#advanced-manual-fallback) at the end.

The package installer puts a pinned Git checkout at `<project-root>/.hephaera` and creates the host `AGENTS.md` bootstrap and missing context automatically. A successful setup does not need an agent's first AGENTS run to finish scaffolding. Your engine, architecture, style and media choices still belong to the project and are made separately.

## Check what you need

Start at the root of an existing host Git repository. Do not run setup inside a package cache or a child folder of a different repository. If `.hephaera` already exists, inspect it before continuing; the installer does not adopt a manual clone/submodule or overwrite unknown state.

- **Node.js 24 or later**, including for the NuGet tool, and **npm** for the npm route.
- **Git** and an existing **Bash** provider for pinned source and scaffolding. Git Bash is preferred on Windows. Setup does not install a provider for you.
- **.NET 10 SDK/tool runtime** for the NuGet route; the npm installer does not need it.
- **Your own authenticated GitHub Packages access** and network access to the public source repository. These thin packages are not offline baseline bundles.

For task/issue/checkpoint helpers, also provide Python 3.9+ specifically as `python3`. GitHub issue/PR work needs authenticated `gh`. Bubo builds, workflow tools, models and their licenses are separate. Ask your agent to check these before continuing.

## npm: authenticate once, then set up

GitHub Packages uses your GitHub credentials, not an npmjs.com login. Create an expiring personal access token **classic** with `read:packages` and package access. Keep the token out of project files and copied command examples.

Add the following token-free scope mapping to `.npmrc`, preserving other settings:

```ini
@timothymeadows:registry=https://npm.pkg.github.com
```

Log in interactively, using your GitHub username and the PAT at the password prompt. Store credentials at user level, outside the project:

```bash
npm login --scope=@timothymeadows --auth-type=legacy --registry=https://npm.pkg.github.com
```

Once a release is actually available, replace `<VERSION>` with its verified exact version:

```bash
npm exec --yes --package=@timothymeadows/hephaera@<VERSION> -- hephaera install --project .
```

This explicitly runs setup after acquiring tooling. A disabled dependency-script policy does not require a hidden postinstall hook. Successful setup includes the scaffold; installing a dev dependency alone does not.

## NuGet: authenticate, acquire, then invoke

The NuGet route uses `Hephaera` at `https://nuget.pkg.github.com/TimothyMeadows/index.json`. It embeds the same Node installer; keep Node 24 available alongside .NET 10.

Use a token-free feed config that maps the exact tool ID to GitHub and dependencies to nuget.org. Supply your classic PAT through a supported credential provider or a session-only secret populated from a hidden prompt. The [installation reference](https://github.com/TimothyMeadows/Hephaera/wiki/Installation-and-Layout) gives the config, source-key and credential details. Do not put a token in a command argument or tracked `ClearTextPassword` field.

After release, use its reviewed Bash or PowerShell acquisition-and-invoke wrapper for the exact version. It acquires the selected local tool, checks failure and runs the same install operation.

After publication, download the matching `hephaera-setup-<VERSION>.zip` from the verified release and check its recorded checksum. Extract it and keep the wrappers, adjacent helper and release identity together. Copy the supplied token-free config without overwriting existing settings. Point `SETUP_DIR` (Bash) or `SetupDir` (PowerShell) at that reviewed local directory:

```bash
bash "$SETUP_DIR/setup-nuget.sh" --version <VERSION> --project . --configfile ./NuGet.Hephaera.config
```

```powershell
& "$SetupDir/setup-nuget.ps1" --version <VERSION> --project . --configfile ./NuGet.Hephaera.config
```
The transparent Bash equivalent, with the host's `.config/dotnet-tools.json` explicitly created or validated, is:

```bash
dotnet tool install --local Hephaera --version <VERSION> --tool-manifest .config/dotnet-tools.json --configfile ./NuGet.Hephaera.config && dotnet tool run hephaera -- install --project .
```

Run from the host root, preserve other manifest tools and do not inherit a parent workspace's Hephaera tool. Windows PowerShell 5.1 requires explicit exit-code checks instead of this Bash `&&` expression; use the release's PowerShell wrapper. `dotnet tool install` by itself acquires tooling and does not scaffold a host.

## Check success and begin

The installer verifies its release/source identity and reports scaffold completion. It records `hephaera.lock.json`, creates the managed host bootstrap and adds an owned ignore entry for the nested `.hephaera` checkout. Review these host changes normally; setup does not commit them.

For npm, inspect the selected tool's result with:

```bash
npm exec --yes --package=@timothymeadows/hephaera@<VERSION> -- hephaera doctor --project .
```

Use `dotnet tool run hephaera -- doctor --project .` for the selected NuGet tool. A partial failure is not success: keep its journal and follow the reported `repair` or `recover` instructions. Never delete `.hephaera/.cache` to get a clean retry. Updates use the selected target version and a reviewed dry run; deactivation retains baseline, ignore/ownership and private state. See [maintenance](https://github.com/TimothyMeadows/Hephaera/wiki/Maintenance-and-Troubleshooting).

Continue with [your first session](first-session.md). The agent reads your saved context and asks for missing project choices; it does not install tools or select contracts merely because setup succeeded.

## Add native execution only when needed

Default package setup leaves Bubo source uninitialized. Explicit `install --project . --with-bubo-source` can initialize recorded source only. Native workflows still require an explicit build with an existing .NET 10 SDK:

```bash
bash .hephaera/commands/initialize-bubo-runtime.sh
bash .hephaera/commands/build-bubo-runtime.sh
```

Neither command installs models, accepts licenses, generates assets or grants promotion approval. A stale build must be reviewed/rebuilt after its pin changes. See [Bubo runtime](https://github.com/TimothyMeadows/Hephaera/wiki/Bubo-Runtime).

## Advanced manual fallback

These commands work while packages are unreleased. Choose a submodule when the host should record a reviewed baseline commit:

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

Unlike package setup, these manual paths need the explicit scaffold command. Both initialize recorded Bubo source without building it. Keep `.hephaera/.cache` as durable private memory/evidence, and review host submodule or ignore changes with your team. Do not use package-managed update commands on these installations.

On Windows, an existing provider can be discovered after checkout:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\.hephaera\commands\install-windows-bash.ps1"
```

The same command accepts `-Provider GitBash -RunScaffold -ProjectRoot .` to run the scaffold through existing Git Bash. Provider installation requires a separate explicit `-Install` choice. See the [wiki](https://github.com/TimothyMeadows/Hephaera/wiki/Installation-and-Layout) for all options and legacy-state inspection.

Forking is the final advanced choice for teams customizing the baseline. Substitute your reviewed fork URL in the manual examples and own its update policy. Official versioned package setup does not require a fork.