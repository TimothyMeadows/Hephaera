# Install Hephaera in your project

Select security patch [`5.2.1`](https://github.com/TimothyMeadows/Hephaera/releases/tag/5.2.1) after confirming its release and package versions are published. It retains floor plans, mechanical schematics and reusable effects tied to model actions from `5.2.0`. The published release page provides the setup ZIP, checksums and publication result. [Release notes](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/RELEASE_5_2_1.md) describe the fixes and remaining coverage limits.

Start with authenticated GitHub npm, or use the GitHub NuGet tool. Public npmjs.com and NuGet.org publication is deferred; you do not need accounts there. The [manual Git option](#advanced-manual-fallback) is last.

The installer puts a pinned Git checkout at `<project-root>/.hephaera` and creates the host `AGENTS.md` bootstrap and missing context automatically. Your engine, architecture, style and media choices stay with your project. Downloading a package alone does not finish setup.

## Check what you need

Start at the root of an existing host Git repository. Inspect an existing `.hephaera` first; setup does not adopt a manual clone/submodule or overwrite unknown state.

- **Node.js 24+** for either route, plus **npm** for npm acquisition.
- **Git and existing Bash** for source checkout and scaffolding. Git Bash is preferred on Windows.
- **.NET 10 SDK/tool runtime** for the NuGet route. The npm installer does not need it.
- Network access to the public Git source. These are thin installers, not offline baseline bundles.
- Your own GitHub package-read credentials for either package route.

Task/issue/checkpoint helpers also need Python 3.9+ as `python3` in Bash; issue/PR work needs authenticated `gh`. On Windows, Python installed as `python` may need an explicit session-local launcher. Setup does not install or alias it. Bubo builds, models and other workflow tools remain separate.

## npm setup

Select this scope mapping in the host `.npmrc`, preserving other settings:

```ini
@timothymeadows:registry=https://npm.pkg.github.com
```

Authenticate interactively with your GitHub username and expiring PAT **classic** with `read:packages`. Keep the credential in user-level storage outside the project. Then run from the host root:

```bash
npm login --scope=@timothymeadows --auth-type=legacy --registry=https://npm.pkg.github.com
npm exec --yes --registry=https://npm.pkg.github.com --package=@timothymeadows/hephaera@5.2.1 -- hephaera install --project .
```

This installs/scaffolds your host without a hidden dependency hook. The [GitHub npm package page](https://github.com/users/TimothyMeadows/packages/npm/package/hephaera) is separate from npmjs.com.

## NuGet setup

The package ID is `Hephaera`. It embeds the same Node core, so keep Node 24 available alongside .NET 10.

From the [5.2.1 release](https://github.com/TimothyMeadows/Hephaera/releases/tag/5.2.1), download `hephaera-setup-5.2.1.zip`, check `CHECKSUMS-5.2.1.txt`, and extract it. Keep the entire bundle unchanged. Its wrappers and helper check bundled file hashes before acquiring the exact local tool and running setup.

Follow the [GitHub NuGet configuration and authentication directions](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/INSTALLER.md#authenticate-for-nuget). Copy the token-free config to the host without modifying the bundle and keep credentials outside tracked files. Point `SETUP_DIR` (Bash) or `SetupDir` (PowerShell) at the reviewed extracted directory:

```bash
bash "$SETUP_DIR/setup-nuget.sh" --version 5.2.1 --project . --configfile ./NuGet.Hephaera.config
```

```powershell
& "$SetupDir/setup-nuget.ps1" --version 5.2.1 --project . --configfile ./NuGet.Hephaera.config
```

The wrapper preserves other local tools, verifies the acquired tool and immediately runs setup. Restoring other tools may need additional reviewed source mappings. Raw `dotnet tool install` only acquires tooling.

The [GitHub NuGet package](https://github.com/users/TimothyMeadows/packages/nuget/package/Hephaera) is separate from NuGet.org. The [installer reference](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/INSTALLER.md) covers source mappings, warm-cache limits and PowerShell exit handling.

## Check success and begin

Successful setup records `hephaera.lock.json`, creates the managed host bootstrap and adds an owned ignore entry for the nested checkout. Review these host changes; setup does not commit them. Run the selected exact tool's `doctor --project .`, or `dotnet tool run hephaera -- doctor --project .` for NuGet.

Keep a partial failure's journal and follow its repair/recover instructions. Never delete durable `.hephaera/.cache` to force a retry. See [maintenance](https://github.com/TimothyMeadows/Hephaera/wiki/Maintenance-and-Troubleshooting), then continue with [your first session](first-session.md).

Public npmjs.com and NuGet.org setup will be handled separately later. The existing [maintainer reference](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/PUBLIC_REGISTRY_SETUP.md) is for that future rollout; this release does not launch it.

## Add native execution only when needed

Default setup leaves Bubo source uninitialized. Explicit `install --project . --with-bubo-source` initializes recorded source only. A selected native workflow still needs its explicit build with an existing .NET 10 SDK:

```bash
bash .hephaera/commands/initialize-bubo-runtime.sh
bash .hephaera/commands/build-bubo-runtime.sh
```

This does not install models, accept licenses, generate assets or grant promotion. See [Bubo runtime](https://github.com/TimothyMeadows/Hephaera/wiki/Bubo-Runtime).

## Advanced manual fallback

Choose this when deliberately managing the baseline through Git. From the host root, use a submodule:

```bash
git submodule add https://github.com/TimothyMeadows/Hephaera.git .hephaera
git submodule update --init --recursive --checkout -- .hephaera
bash .hephaera/commands/create-host-ai-scaffold.sh
```

Or an independent clone:

```bash
git clone --recurse-submodules https://github.com/TimothyMeadows/Hephaera.git .hephaera
bash .hephaera/commands/create-host-ai-scaffold.sh
```

Both manual paths need the explicit scaffold and initialize Bubo source without building it. Preserve durable cache and review host Git ownership. Do not use package-managed updates on these installations. On Windows, inspect an existing Bash provider after checkout:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\.hephaera\commands\install-windows-bash.ps1"
```

Add `-Provider GitBash -RunScaffold -ProjectRoot .` to run the scaffold through existing Git Bash. Provider installation requires a separate explicit `-Install` choice. The [installation wiki](https://github.com/TimothyMeadows/Hephaera/wiki/Installation-and-Layout) has update/state-transition details. A fork is the final advanced option for teams customizing the baseline, not a package setup prerequisite.
