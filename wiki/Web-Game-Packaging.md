# Web-game packaging

Selecting THREEJS, BABYLONJS or PHASERJS derives the MAUI packaging profile from `runtimeKind: web`. MAUI is a packaging capability, not another engine, architecture or art pipeline. It embeds a completed static HTML/JavaScript/CSS game in a .NET 10 `HybridWebView`; gameplay stays in the existing web engine.

Read the [packaging guide](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/WEB_GAME_PACKAGING.md), [native host contract](https://github.com/TimothyMeadows/Hephaera/blob/main/.packaging/maui/PACKAGING.md) and compatible `package-web-games` skill before creating a host. Selection does not scaffold native files, install workloads or accept licenses. Unity, Unreal and Godot retain their own exporters.

## Four supported targets

| Target | Native host | Build machine | Package formats |
| --- | --- | --- | --- |
| WINDOWS | WinUI / WebView2 | Windows | Application folder or MSIX |
| MACOS | Mac Catalyst / WKWebView | Mac with compatible Xcode | `.app` or signed `.pkg` |
| ANDROID | Android WebView | Windows or Mac with compatible SDK/JDK | APK or AAB |
| IOS | iOS / WKWebView | Mac with compatible Xcode/provisioning | Signed device IPA |

These are the four official MAUI platforms supported by this profile. Linux, TVs and Tizen are unsupported. Wine/Proton operation of Windows output is unverified; it is not another target. Package preparation does not promise every browser API works in every WebView.

## Inspect prerequisites before initialization

From the installed host root:

```bash
bash .hephaera/commands/resolve-engine.sh
bash .hephaera/commands/web-game-package.sh resolve
bash .hephaera/commands/web-game-package.sh doctor --target WINDOWS
```

`doctor` reads SDK/workload metadata and checks the build-machine OS. `buildEligible` permits an attempt; `nativeReadiness: unverified` remains until compilation. It does not certify signing, Xcode compatibility, Android completeness, device behavior or store access. Provision matching official tools separately when authorized.

Read-directive ENGINE contracts inherit the capability without regeneration. Stale inline definitions require explicit regeneration. Valid isolated engine overrides supply their `--engine-evidence` receipt and confine configuration, web output and native host to the recorded prototype scope.

## Create a new owned host

```bash
bash .hephaera/commands/web-game-package.sh init \
  --app-id com.example.mygame --title "My Game" \
  --web-root dist --output platforms/maui
```

`init` creates `web-game-package.json` and a new owned native-source directory. Existing output/configuration is refused. Commit reviewed native source and configuration, excluding build output, private signing files and durable cache state. The shipped MAUI Controls dependency is pinned to 10.0.20; servicing updates need reviewed baseline changes and fresh compatible builds.

Configuration records schema/profile, reverse-DNS `appId`, title, numeric `major.minor.patch` display version, monotonically increasing build number 1–65535, host directory, web root and entry. Entry defaults to `index.html`. Change title/version/entry explicitly and sync. Changing app identity requires a fresh configuration/host; do not relabel an ownership receipt. Keep native customizations separate from generated `HephaeraGame.props`.

## Stage an existing static distribution

Build the game first using its locked toolchain. The package workflow does not run npm builds or embed a Node server. Include scripts, chunks, textures, WASM, workers and audio required by the application.

```bash
bash .hephaera/commands/web-game-package.sh sync
bash .hephaera/commands/web-game-package.sh plan --target WINDOWS --format folder
bash .hephaera/commands/web-game-package.sh build --target WINDOWS --rid win-x64
bash .hephaera/commands/web-game-package.sh package --target WINDOWS --format folder --rid win-x64
```

`plan` performs no restore, compilation or installation. `build` invokes narrowed `dotnet build`; `package` invokes `dotnet publish`. Normal project restore can download NuGet dependencies, but these commands install no workloads, SDKs or drivers. `--timeout-seconds` bounds the native process tree: default 1200, permitted 1–3600.

`sync` stages exact bytes after checking portable paths and existing ownership. It rejects links/junctions, traversal, case collisions, unsafe Windows names, overlap, foreign directories and changed staged content. Source, config, engine, template or native-code changes stale the snapshot and require explicit review/resync. Removed source files leave the current app; prior versions and receipts remain in durable packaging state.

## Select platform format and identity

Default RIDs are Windows x64, Mac Catalyst arm64, Android arm64 and iOS arm64. Supported alternatives include `win-arm64`, `win-x86`, `maccatalyst-x64` and `android-x64`. Use a compatible machine for each target.

```bash
bash .hephaera/commands/web-game-package.sh package --target ANDROID --format apk
bash .hephaera/commands/web-game-package.sh package --target ANDROID --format aab --signing-properties release/android.private.props
bash .hephaera/commands/web-game-package.sh package --target MACOS --format app
bash .hephaera/commands/web-game-package.sh package --target IOS --format ipa --signing-properties release/apple.private.props
```

Windows MSIX uses `--format msix` and explicit matching publisher/signing settings; Mac installers use `--format pkg`. Private MSBuild properties are trusted executable inputs: keep them project-local, ignored and reviewed. Reference secrets through protected environment configuration rather than credential CLI values. Android development signing is QA output, not store release evidence. Commands do not enroll devices, change accounts or accept distribution agreements.

## Interpret output and failures

Use each successful result's actual `output` path and hashed inventory. Never reuse an old successful package after a failed/cancelled run. A compiler-success receipt reports compiled native readiness while signing remains unverified, device QA not-run, release readiness false and store submission false. Extension and compile success do not prove signature validity or game behavior.

Native stdout/stderr is not persisted to protect signing inputs; use the reviewed plan manually when compiler diagnostics are needed. Keep private properties out of reports/artifacts.

Init/sync use ownership journals and rollback ordinary failures. Interrupted pending transactions block later operations. Use `web-game-package.sh recover` with the same configuration; foreign or changed bytes stop recovery. Locks require inspection. Verify no operation remains active before removing only its empty stale lock directory; never delete locks or prior state blindly.

## Actual target and release evidence

Replace placeholder icon/splash assets and review identity, permissions, privacy, licensed content and media disclosure. Test the actual package on every release target: startup, frame pacing, memory/thermal behavior, resize/safe areas, touch/gamepad/keyboard, storage, offline assets, audio unlock and suspend/resume. Verify real WebGL2/WebGPU/WASM/worker requirements; threaded WASM and cross-origin isolation are not guaranteed.

The host emits `hephaera:lifecycle` resume/suspend events. The game must pause/resume simulation, presentation and audio and handle `visibilitychange`. Packaged-origin navigation is retained and popups blocked; no arbitrary native filesystem bridge is installed. Networking remains subject to CSP/platform policy.

Validate signatures, provisioning, entitlements, installation and relevant store/notarization/testing-track requirements for the chosen channel. Browser evidence cannot replace native WebView/device QA. CI uses compatible explicitly provisioned runners and protected signing environments. External upload, GitHub releases, store submission and publication require separate authorization; preparing packages grants none.
