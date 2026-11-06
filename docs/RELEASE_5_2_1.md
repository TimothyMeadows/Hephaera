# Hephaera 5.2.1

This security patch retains the building, mechanical-model and reusable VFX/action workflows introduced in [5.2.0](RELEASE_5_2_0.md). It updates Hephaera's local tooling and installer version; it does not change the pinned Bubo revision or install additional software.

## Security fixes

- Update the documentation Markdown parser to `markdown-it` 15.0.3.
- Serve local website previews and browser evidence through verified HTTPS. Preserve the admitted file inventory, private-path exclusions, request limits and cleanup rules. The [local preview TLS guide](LOCAL_PREVIEW_TLS.md) explains the existing OpenSSL prerequisite and exact certificate or browser-pin setup.
- Match model factory identifiers literally with bounded validation, and tighten file and process admission at the native execution boundary.
- Separate media lifecycle ownership from generation request data. Bound journal enumeration and use abortable process deadlines while waiting for owned workers to retire before returning.

No Snyk ignore, severity filter or suppression was added. A fresh scoped Code scan of the reviewed Hephaera remediation candidate reported no High or Medium findings, and the checked npm dependency graphs reported no vulnerabilities. Low findings remain deferred. Hephaera Code reported three header parsing failures, and these scans do not cover every custom Python, model, tool or framework dependency. This is scoped verification, not a claim that all source and dependencies are vulnerability-free.

## Installation and updates

Confirm that the exact release and both selected package versions are published before using these instructions. GitHub Packages remains the primary distribution:

- npm: `@timothymeadows/hephaera@5.2.1` at `https://npm.pkg.github.com`.
- NuGet tool: `Hephaera` version `5.2.1` at `https://nuget.pkg.github.com/TimothyMeadows/index.json`.

Both feeds require GitHub authentication. The matching GitHub release provides `hephaera-setup-5.2.1.zip`, `release-manifest-5.2.1.json` and `CHECKSUMS-5.2.1.txt`. Follow the [installation guide](INSTALLER.md) for setup and explicit managed updates. Acquiring newer installer tooling does not move an existing project's pinned baseline; review `update --dry-run` before updating and preserve `.hephaera/.cache`, approvals and recovery journals.

npmjs.com and NuGet.org publication remains deferred. The GitHub release workflow must select `publish_public=false`. Manual clone/submodule installation stays the advanced last option.

## Compatibility and verification

The native dependency remains Bubo `a47896d730b32d00b165e61820060e7c73d1ec4a` (API 2), the same reviewed revision used by 5.2.0. The installed gitlink, lock and verified build must still agree. Separate experimental Low-remediation work is not included.

Verification covered parser and site/Wiki checks, verified TLS peers and real sandboxed browser imports, bounded model-name matching, media ownership and real child-process cancellation/retirement. Both clone and submodule installation forms were exercised. Local Windows evidence does not substitute for the release workflow's Linux, macOS and Windows artifact checks or actual target-device acceptance.

Existing STYLE/ENGINE selections, AUDIO/MUSIC/VOICE domains and human review/promotion boundaries remain intact. The patch grants no model installation, media generation, consent, asset promotion, gameplay authority or runtime acceptance. Previous tags, release files and package versions remain unchanged.
