# Hephaera package release and GitHub setup

The stable release version is `5.2.0`; [release notes](RELEASE_5_2_0.md) describe the included workflows. This rollout targets GitHub Releases and both GitHub Packages feeds only. Dispatch with `publish_public=false`: npmjs.com and NuGet.org account setup and publication are deferred. Confirm exact source, artifacts and per-feed readback before announcing completion. Historical `5.1.0-rc.1` retains its original tag, source and package bytes; its GitHub promotion did not remove its SemVer prerelease suffix. This guide defines artifact admission and recovery. [Public registry setup](PUBLIC_REGISTRY_SETUP.md) is retained for a separately authorized future rollout.

Read the [consumer and ownership contract](INSTALLER.md) first. Hephaera's version authority is separate from the private documentation-site package. The two distributions carry the same generated release manifest and Node core; .NET is a launcher, not another installer implementation.

## One-time publisher setup

Use the `TimothyMeadows/Hephaera` repository and owner namespace. Keep npm ID `@timothymeadows/hephaera` and NuGet ID `Hephaera`; verify the publishing account and exact version at each selected destination. Lowercase npm scope is required. Do not reserve names by publishing dummy artifacts.

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

Before dispatch, the maintainer deliberately creates the matching unprefixed source tag and draft GitHub Release under the applicable review/authorization. The verifier checks version, tag, exact source identity and reviewed-main ancestry. A draft is not an announced completed paired release. A retry may select an already published release only when every expected asset is present with identical bytes; otherwise preflight refuses before registry writes. A published candidate promoted to a full GitHub release is admissible under the same pinned release ID, exact source and artifact checks. Draft classification must match the package version, classification must remain unchanged during an asset-publication attempt, and a stable package version cannot be marked as a GitHub prerelease. These helpers never promote or reclassify a release.

The manual `publish-packages.yml` workflow takes `version`, full `source_sha` and the exact approved draft's numeric `release_id`, uses the `package-release` environment and never releases from an arbitrary main push. Its `publish_public` boolean defaults to true in the existing workflow. For this GitHub-only `5.2.0` rollout, explicitly set `publish_public=false` so the deferred public workflow is not launched. Obtain that ID with authenticated `gh release view VERSION --json databaseId`. The tools pin and recheck that ID before asset operations and registry writes; a replacement draft requires explicit reconciliation. The workflow runner preserves separate source/tool identity; direct helper forms assume the matching verified source checkout and are not catch-up commands. Its GitHub publication helper consumes the frozen artifact directory:

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
## Public registries after GitHub publication

This section is a future optional reference. Public accounts are not ready for `5.2.0`; do not dispatch this phase or configure new publishing credentials as part of the GitHub-only release.

GitHub remains the first confirmed publication. The canonical standalone `.github/workflows/publish-public-packages.yml` handles both automatic delivery and manual catch-up without rebuilding the release. A separate post-GitHub-success dispatcher receives only the required `actions: write` authority and launches it through `workflow_dispatch`; a release-event recursion chain is not assumed. `publish_public=false` deliberately leaves this downstream phase unlaunched.

The public workflow selects `version`, `source_sha`, `release_id`, `upstream_tools_sha` and `upstream_run_id`. Its new tools revision is separate from the upstream signer/tools and original package source. Prepare requires the published upstream release, successful run, exact source/manifest/files and strict signer attestations before public credentials are available. The protected publisher retains the existing `package-release` owner review.

Select `registry_selection=npm`, `nuget` or `both` (default `both`). Automatic delivery uses `PUBLIC_PACKAGE_REGISTRIES` when separately enabled. Select only destinations whose accounts and trusted policies have been reviewed; neither public destination is selected for `5.2.0`. `npm_auth_mode=trusted` is the default; first npmjs publication explicitly selects `bootstrap` after account recovery. `PUBLIC_NPM_AUTH_MODE` sets the automated choice, and `NUGET_PUBLIC_USER=TimothyMeadows` identifies the NuGet.org policy creator. Only the owner enters `NPM_BOOTSTRAP_TOKEN` as a protected environment secret. The [account guide](PUBLIC_REGISTRY_SETUP.md) describes exact policies, first npm upload and transition to OIDC.

The public adapter in `installer/lib/public-publish.cjs` journals `public-publication.json` in the admitted candidate directory, preserving release identity and per-channel history. All selected destinations are read/reconciled before selected writes. Exact existing versions are skipped; mismatches and unknown states stop. A NuGet-only completion does not newly verify npm. Retain any earlier confirmed history; without it, npm stays pending and both public registries must not be reported ready. The GitHub package release remains independently available.

Public npm publication explicitly targets npmjs, public access and the appropriate `next`/`latest` tag while reusing the original `.tgz`; its embedded GitHub `publishConfig` is not rewritten. Isolated registry configuration prevents an old GitHub scope mapping from redirecting the mirror. NuGet.org receives the original unsigned `.nupkg`, then adds repository signing. Its served-file SHA is recorded separately: require a real trusted NuGet.org signature verification and identical names/uncompressed bytes for every original ZIP entry, allowing only the added root `.signature.p7s`. A signature file's presence, or a different archive hash alone, cannot establish equivalence. Do not run the unsigned timestamp normalizer on a signed download.

Validation/indexing may lag upload. Bound read-only polling and retain unresolved operations. After a write-intent/pending/uncertain result, a later 404 cannot authorize resubmission; there is no force/reset option. Reconcile service state rather than deleting the journal/lock or uploading again. Search results can omit prereleases; verify the exact version/download. An old release can be mirrored without a version bump or retag only after separately authorized exact selected-feed verification. Keep its original source and artifact identity; the new stable `5.2.0` release is a separate version.

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

1. Merge reviewed source through its normal gate. The owner configures the selected feeds/policies and the effective environment review controls.
2. Publish/read back both exact GitHub artifacts, attach their verified setup/manifest/checksums and publish the reviewed draft. Record the actual `5.2.0` run and readback before marking this phase complete; the older `5.1.0-rc.1` remains historical.
3. For this rollout, retain `publish_public=false` and leave public distribution deferred. A future separately authorized rollout may admit those frozen files into the standalone public workflow; review selected account readiness and the exact candidate before owner approval. Public credentials never belong to read-only prepare jobs.
4. For a separately selected future public rollout, verify each selected version, actual package bytes or NuGet signed-content equivalence, and indexing/status. Keep unselected or blocked destinations explicitly pending; do not describe one successful mirror as both.
5. Update README/Pages/wiki availability only after actual selected-feed verification. npm stays first, NuGet second, manual clone/submodule/fork last. GitHub promotion is a separate explicit release decision and preserves the existing package version. Publishing a stable SemVer package requires a separately reviewed new version; promoting `5.1.0-rc.1` does not produce `5.1.0` packages or include newer source features.
6. Use the clean-main, exact-blob [documentation maintenance procedure](DOCUMENTATION_SITE.md) for any separately authorized live website/wiki update. Local source changes do not deploy them.

A source PR, package build, earlier Goal approval or this guide does not grant registry publication, public visibility changes, main merge, live-site deployment or Wiki writes. The public workflow provides the downstream npmjs.com/NuGet.org path with its own account/policy setup and owner gate; a pending public mirror does not invalidate an already confirmed GitHub release.
