# Install Hephaera in your project

The [`5.1.0-rc.1` GitHub prerelease](https://github.com/TimothyMeadows/Hephaera/releases/tag/5.1.0-rc.1) is published, including the npm installer, NuGet tool and setup ZIP. **npmjs.com and NuGet.org publication is still pending.** Use the GitHub alternative now; use a public route only after its exact version is confirmed.

| Where you look | Current version |
| --- | --- |
| GitHub Packages | `5.1.0-rc.1`, with authenticated package reads |
| npmjs.com / NuGet.org | Not yet published |

The installer puts a pinned Git checkout at `<project-root>/.hephaera` and creates the host `AGENTS.md` bootstrap and missing context automatically. Your engine, architecture, style and media choices stay with your project. Downloading a package alone does not finish setup.

## Check what you need

Start at the root of an existing host Git repository. Inspect an existing `.hephaera` first; setup does not adopt a manual clone/submodule or overwrite unknown state.

- **Node.js 24+** for either route, plus **npm** for npm acquisition.
- **Git and existing Bash** for source checkout and scaffolding. Git Bash is preferred on Windows.
- **.NET 10 SDK/tool runtime** for the NuGet route. The npm installer does not need it.
- Network access to the public Git source. These are thin installers, not offline baseline bundles.
- Your own GitHub package-read credentials if using the GitHub alternative. Public registry reads need no publishing token.

Task/issue/checkpoint helpers also need Python 3.9+ as `python3` in Bash; issue/PR work needs authenticated `gh`. On Windows, Python installed as `python` may need an explicit session-local launcher. Setup does not install or alias it. Bubo builds, models and other workflow tools remain separate.

## npm setup

### npmjs.com: after public publication

This route is pending. Once the exact public version is verified, add or replace only this scope mapping in the host `.npmrc`, keeping your other settings:

```ini
@timothymeadows:registry=https://registry.npmjs.org
```

An older scoped GitHub mapping must be changed explicitly. Then run from the host root:

```bash
npm exec --yes --registry=https://registry.npmjs.org --package=@timothymeadows/hephaera@5.1.0-rc.1 -- hephaera install --project .
```

Public acquisition does not need a login. The explicit command installs/scaffolds your host without a hidden dependency hook.

### GitHub npm: published now

Select `@timothymeadows:registry=https://npm.pkg.github.com` in `.npmrc` instead. Authenticate interactively using your GitHub username and an expiring PAT **classic** with `read:packages`; keep its value in user-level storage outside the project:

```bash
npm login --scope=@timothymeadows --auth-type=legacy --registry=https://npm.pkg.github.com
npm exec --yes --registry=https://npm.pkg.github.com --package=@timothymeadows/hephaera@5.1.0-rc.1 -- hephaera install --project .
```

Your npmjs.com login does not authenticate GitHub Packages. The [GitHub npm package page](https://github.com/users/TimothyMeadows/packages/npm/package/hephaera) is separate from npmjs.com.

## NuGet setup

The package ID is `Hephaera`. It embeds the same Node core, so keep Node 24 available alongside .NET 10.

Download the published [setup ZIP](https://github.com/TimothyMeadows/Hephaera/releases/download/5.1.0-rc.1/hephaera-setup-5.1.0-rc.1.zip), check the release [checksums](https://github.com/TimothyMeadows/Hephaera/releases/download/5.1.0-rc.1/CHECKSUMS-5.1.0-rc.1.txt), and extract it. Keep the entire bundle unchanged. Its wrappers and helper check the bundled file hashes before acquiring the exact local tool and running setup.

### NuGet.org: after public publication

This route is pending. After the exact public version is confirmed, create `NuGet.Hephaera.Public.config` at the host root, outside the extracted bundle:

```xml
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

No credential goes in this file. Do not replace the bundle's original GitHub config; pass your separate config explicitly. Point `SETUP_DIR` (Bash) or `SetupDir` (PowerShell) at the reviewed extracted directory:

```bash
bash "$SETUP_DIR/setup-nuget.sh" --version 5.1.0-rc.1 --project . --configfile ./NuGet.Hephaera.Public.config
```

```powershell
& "$SetupDir/setup-nuget.ps1" --version 5.1.0-rc.1 --project . --configfile ./NuGet.Hephaera.Public.config
```

The existing wrapper supports this config path; you do not need a new setup ZIP. It preserves other local tools, but restoring them may need additional reviewed mappings. Raw `dotnet tool install` only acquires tooling; the wrapper also verifies and invokes setup.

NuGet.org signs served downloads, so their archive hash can differ from the original unsigned GitHub file. The publication workflow checks the signature and unchanged payload separately. Search may need **Include prerelease**, and indexing can lag upload.

### GitHub NuGet: published now

Use the [GitHub NuGet configuration and authentication directions](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/INSTALLER.md#authenticate-for-nuget). It maps exact `Hephaera` to the GitHub feed and keeps credentials outside tracked files. Copy its token-free config to the host without modifying the bundle, then use the same wrapper with `--configfile ./NuGet.Hephaera.config`.

The [GitHub NuGet package](https://github.com/users/TimothyMeadows/packages/nuget/package/Hephaera) is not a NuGet.org listing. The [installer reference](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/INSTALLER.md) covers source mappings, warm-cache limits and PowerShell exit handling.

## Check success and begin

Successful setup records `hephaera.lock.json`, creates the managed host bootstrap and adds an owned ignore entry for the nested checkout. Review these host changes; setup does not commit them. Run the selected exact tool's `doctor --project .`, or `dotnet tool run hephaera -- doctor --project .` for NuGet.

Keep a partial failure's journal and follow its repair/recover instructions. Never delete durable `.hephaera/.cache` to force a retry. See [maintenance](https://github.com/TimothyMeadows/Hephaera/wiki/Maintenance-and-Troubleshooting), then continue with [your first session](first-session.md).

Maintainers configure the automatic post-GitHub publication and manual catch-up in [Public registry setup](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/PUBLIC_REGISTRY_SETUP.md). A NuGet-only publication does not mark npm ready.

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
