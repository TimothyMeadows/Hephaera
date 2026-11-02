# Hephaera package release and GitHub setup

This guide is for maintainers preparing the **upcoming, unpublished** npm and NuGet installer release. The proposed first candidate is `5.1.0-rc.1`. Names, visibility, account controls and real authenticated consumption must be verified before release. Local packing/tests do not mean either GitHub feed contains the package. No account linking to npmjs.com or nuget.org is required for the selected primary route.

Read the [consumer and ownership contract](INSTALLER.md) first. Hephaera's version authority is separate from the private documentation-site package. The two distributions carry the same generated release manifest and Node core; .NET is a launcher, not another installer implementation.

## One-time publisher setup

Use the `TimothyMeadows/Hephaera` repository and owner namespace. Confirm the proposed npm ID `@timothymeadows/hephaera` and NuGet ID `Hephaera` are available for the intended release. Lowercase npm scope is required. Do not reserve names by publishing dummy artifacts.

1. Review package metadata linking the canonical repository, license/readme notices and fixed registries. npm targets `https://npm.pkg.github.com`; NuGet targets `https://nuget.pkg.github.com/TimothyMeadows/index.json`. The public source repository and package visibility are separate settings.
2. In repository **Settings → Environments**, deliberately create and inspect the `package-release` environment before enabling publication. Configure allowed branches/tags and required reviewers where the account/plan supports them. Prevent self-review only when another eligible approver exists. A job naming an unprotected environment is not an enforced human review gate. Record actual effective controls and any procedural approval used when protection is unavailable.
3. Review the package publication workflow and its exact selected source/version inputs. Keep build/verification read-only. Only the gated publishing job receives `packages: write`; ordinary source reads use `contents: read`. A final job attaching verified artifacts and publishing the pre-existing draft GitHub Release needs narrowly scoped `contents: write`. Do not run publication on pull requests or arbitrary pushes to main. Use the repository's automatically issued `GITHUB_TOKEN`; a long-lived publisher PAT is not the normal Actions credential.
4. Pass npm authentication only to the publish operation through `NODE_AUTH_TOKEN`. NuGet may use runner-local temporary feed credentials or its documented environment mechanism. Never commit a generated credential file, print tokens or expose literal values in copied shell commands/screenshots. Keep package-write credentials out of untrusted PR execution.
5. After the first separately approved candidate publication, open each package's **Package settings**. Verify repository connection, access inheritance and Actions access. Personal-account packages may begin private. If public distribution is approved, deliberately change visibility and verify it; public package visibility cannot simply be reversed to private. Public npm/NuGet downloads through GitHub Packages still require authentication.
6. Grant other consuming repositories Actions access only when required, and give their own `GITHUB_TOKEN` `packages: read`. Review actual account storage/transfer limits and usage. Do not select paid service or assume unlimited allowance.

Official references: [GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry), [GitHub NuGet registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-nuget-registry), [package permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages), [environment controls](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [visibility controls](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

## Source and artifact identity

Update `installer/version.json` through reviewed source changes; packing generates both channel versions from that authority rather than treating the private website version as a baseline release. Use a SemVer form that normalizes identically in npm and NuGet. Follow the existing unprefixed source-tag convention; do not move an old tag or reuse an existing version. A prerelease/stable publication must bind its exact source tag, full commit/tree, manifest schema, core-file hashes and recorded Bubo lock/gitlink/API/catalog.

Generate revision/tree fields during packing from the verified source checkout. Do not check a commit's own future SHA into itself. Verify the selected source belongs to the reviewed main history and its version matches the intended release before obtaining publishing authority. An installer package always selects its embedded immutable revision; consumers do not install through moving `main`, `latest` or an unchecked tag.

The workflow pins publication tools to its own reviewed commit separately from the selected package source. This lets a reviewed tooling correction publish an already tagged candidate without moving its tag or changing its payload. The tools verify the original clean source/tag and pass that source's manifest explicitly; `release-orchestration.json` records both revisions. The workflow attestation identifies the workflow/tools commit, while the embedded release manifest identifies the package source. Neither identity substitutes for the other.

Pack npm and NuGet from the same staged core/manifest. Inspect actual tarball/nupkg inventories, including hidden files and executable/line-ending behavior. Allow only the launcher/core, generated manifest, package metadata/readme and required notices. Exclude host `.cache`, recordings, credentials, local Git configuration, model weights, native binaries, `node_modules` and build/test output not needed by the tool. Neither root MIT metadata nor a successful archive build grants redistribution rights for third-party components.

Keep the exact packed artifacts, checksums and build provenance for the release. Unsigned NuGet container timestamps are normalized without changing entry bytes, and a two-pack test checks same-source/same-SDK byte identity for npm, NuGet and the setup ZIP. Signed packages refuse normalization. This does not claim compiler equivalence across different SDK versions or operating systems. Pin Actions to verified official commit identities. Use artifact attestations where supported; npmjs provenance flags are not proof of GitHub npm-registry provenance. Both artifacts must be demonstrably linked to the same reviewed manifest/core before either is announced.

## Local packing and gated workflow

The implemented pack entry point writes only a new output directory beneath repository `.local/`:

```bash
node installer/scripts/pack.cjs --output .local/package-review-01 --allow-dirty
```

Choose a fresh directory rather than replacing prior evidence. `--allow-dirty` is for development inspection only: its manifest records dirty source, and the resulting preview tooling cannot mutate a host. It is not release or install-readiness evidence. Real release packing requires reviewed clean committed source and omits that flag:

```bash
node installer/lib/release.cjs --verify <VERSION>
node installer/scripts/pack.cjs --output .local/package-release-01
```

Before dispatch, the maintainer deliberately creates the matching unprefixed source tag and draft GitHub Release under the applicable review/authorization. The verifier checks version, tag, exact source identity and reviewed-main ancestry. A draft is not an announced completed paired release. A retry may select an already published release only when every expected asset is present with identical bytes; otherwise preflight refuses before registry writes.

The manual `publish-packages.yml` workflow takes `version`, full `source_sha` and the exact approved draft's numeric `release_id`, uses the `package-release` environment and never releases from an arbitrary main push. Obtain that ID with authenticated `gh release view VERSION --json databaseId`. The tools pin and recheck that ID before asset operations and registry writes; a replacement draft requires explicit reconciliation. Its publication helper consumes the frozen artifact directory:

```bash
node installer/lib/publish.cjs ARTIFACT_DIRECTORY --execute
```

Before either feed is written, the workflow compares the downloaded receipt and the actual embedded package manifests/core against the freshly verified clean checkout. It also checks existing release assets without clobbering them:

```bash
node installer/lib/release-assets.cjs ARTIFACT_DIRECTORY --check
```

GitHub's REST lookup by tag returns published releases. Draft discovery therefore runs inside the protected publishing job, which has the required contents permission, and pins the authenticated release ID before checking assets. This check still precedes attestation and every registry write; read-only build/test jobs do not receive broader permissions to discover drafts. The workflow uses its pinned tools runner for this check and both publication steps, preserving the selected source identity even when the tools are newer.

This stages local checksum/manifest files and reads GitHub release metadata; it does not publish. After both registry digests are confirmed, `release-assets.cjs ... --execute` uploads only missing matching assets and publishes the draft, with a separate recoverable journal.

This is a separately authorized external-write command, not a normal local validation step. The helper journals/reconciles exact versions and digests in both GitHub feeds. Packing also emits `artifacts/hephaera-setup-<VERSION>.zip`, with the wrappers, adjacent helper, token-free configs, setup release identity and checksums. The build receipt binds its digest. The workflow attaches verified packages/setup/checksums, then publishes the reviewed draft only after both feed identities are confirmed. Do not invent a public download URL before release. Consumers retain the bundle identity beside the wrappers so setup can verify the acquired tool version/core/manifest.
## Required local and registry evidence

Local tests cover actual packed npm and NuGet consumers with dependency hooks disabled, automatic canonical scaffold, exact source/Bubo identity and preserved host state. Include Windows/Git Bash, Linux and macOS where claimed; unavailable hosts remain not-run. The .NET tool must report the same version/manifest/core as npm, forward argument arrays and preserve cancellation/exit status. Its Node requirement remains visible.

Real GitHub Packages testing is a separate release step. Obtain separately approved publication authority, then verify:

- Both exact candidate versions upload and can be read back with matching digests and repository association.
- A non-owner consumer can authenticate and acquire them with its own classic PAT/read permission, or appropriately granted CI token.
- Scoped npm mapping and explicit NuGet source mapping select the intended feeds; no fallback to a similarly named public package occurs.
- A cold isolated NuGet package-cache context proves actual acquisition. Warm-cache tests validate package/version/core/manifest identity; mapping alone does not establish cached provenance. Do not wipe a user's global cache.
- The documented one-command setup acquires the selected tool and automatically installs/scaffolds an existing host Git root. Merely downloading a tarball or installing a .NET tool is not a pass.
- Wrong/expired/revoked credentials, access/SSO restrictions, missing Node/Git/Bash/.NET, existing tool-manifest entries, interrupted acquisition and partial scaffold all fail with useful, sanitized diagnostics.

A green local feed test does not verify real account permissions, remote package availability or production/GPU/device readiness. Retain each failed attempt and unavailable check honestly.

## Partial publication and retries

The registries do not form one atomic transaction. Journal npm and NuGet upload intent/results independently. If an upload fails or times out, query the exact version before retrying: the server may already have committed it. Compare existing digest/manifest to the frozen artifact.

Prefer rerunning the failed publish job with the preserved original artifacts. A new dispatch must recreate identical bytes and pass existing-release preflight; never assume that an arbitrary rebuild is interchangeable. Registry state, `publication.json`, `release-assets.json` and any interrupted local journal temporary file must be reconciled before another write. Do not delete uncertain evidence to force a retry.

Publish only the missing matching artifact. Never overwrite or delete/reuse a version, substitute a newly rebuilt archive under an already published identity, or claim the paired release is complete after only one channel succeeds. If published bytes are wrong, select a new version through normal review. Receipt and registry readback should name both package pages, exact versions, digests, source and effective release controls without credentials.

## Release and documentation rollout

1. Merge the reviewed installer/release implementation through its normal source gate. The owner completes feed/environment setup and separately authorizes a candidate release.
2. Publish and test the candidate in both actual GitHub feeds. Keep all public install examples explicitly upcoming until their exact artifacts are available and authenticated setup is verified.
3. Prepare README, Pages, Wiki and package READMEs against the selected stable version. npm comes first, NuGet second, and manual clone/submodule/fork is the final advanced option. Use the same version, auth guidance, automatic-scaffold outcome and optional-native boundaries everywhere.
4. After explicit stable-release approval, publish and read back both exact stable artifacts. Merge the prepared public documentation rollout only after those versions are installable. It is valid for documentation main to advance after the package's already frozen source; a later patch package can incorporate that documentation.
5. Check the deployed Pages instructions and copyable snippets. Publish reviewed Wiki Markdown only through the existing clean-main, exact-blob [documentation maintenance procedure](DOCUMENTATION_SITE.md). Record live URLs separately from local build results.

A source PR, package build, earlier Goal approval or this guide does not grant registry publication, public visibility changes, main merge, live-site deployment or Wiki writes. npmjs.com/nuget.org mirrors are optional future work with their own owner/auth/trusted-publisher setup; they are not prerequisites for the selected GitHub Packages release.
