# Publish the verified release to npmjs and NuGet.org

GitHub Packages remains the first publication. `5.1.0-rc.1` is already a [published GitHub prerelease](https://github.com/TimothyMeadows/Hephaera/releases/tag/5.1.0-rc.1), with both GitHub packages confirmed. Its npmjs.com and NuGet.org mirrors are **not published yet**. npm account recovery is pending, so configure NuGet-only delivery first; leave npm pending until the owner can sign in again.

This guide covers maintainer account setup. Consumers use [installation instructions](INSTALLER.md). The full source/artifact contract is in [release maintenance](INSTALLER_RELEASE.md).

## Configure the shared GitHub gate

Use the existing `package-release` environment. Confirm its allowed branch is `main` and its required reviewer is configured. The current owner gate allows self-review and administrator bypass; do not describe it as a second-person approval requirement. Public credentials and OIDC authority belong only to the protected publishing job.

In repository **Settings > Secrets and variables > Actions > Variables**, set:

| Variable | Value for this rollout | Purpose |
| --- | --- | --- |
| `PUBLIC_PACKAGE_REGISTRIES` | `nuget` | Automatic launches select `npm`, `nuget` or `both`; default is `both` |
| `PUBLIC_NPM_AUTH_MODE` | `trusted` | Default npm mode; select `bootstrap` for the first npmjs upload after account recovery |
| `NUGET_PUBLIC_USER` | `TimothyMeadows` | NuGet.org profile that creates the trusted-publishing policy |

Repository variables are visible to the separate dispatcher. Use an environment override only where the workflow job reads that environment. These values are not API keys. Do not create an npm bootstrap secret while the account is inaccessible.

## Set up NuGet.org

Sign in to the NuGet.org profile **TimothyMeadows**. Open **Trusted Publishing** and create a policy with:

| Policy field | Value |
| --- | --- |
| Package owner | The intended NuGet.org owner; use `TimothyMeadows` for individual ownership |
| Repository owner | `TimothyMeadows` |
| Repository | `Hephaera` |
| Workflow file | `publish-public-packages.yml`, without `.github/workflows/` |
| Environment | `package-release` |
| Package scope | Exact `Hephaera`; allow new packages and new versions |

`NuGet/login` uses the **policy creator's NuGet.org profile**, which can differ from an organization chosen as package owner. It is not an email address or a GitHub login inferred from repository ownership. If NuGet shows a seven-day temporary policy window, complete an authorized first publication within it or renew the policy in the account UI.

The protected job uses pinned `NuGet/login` commit `8d196754b4036150537f80ac539e15c2f1028841`. It obtains a short-lived key immediately before pushing and passes it only through process-local `NUGET_API_KEY`. No long-lived NuGet secret or credential file is required. Policy scopes support a first new package; a dummy/manual bootstrap upload is unnecessary. Public-name absence does not reserve `Hephaera`, so an ownership or name conflict stops publication rather than renaming it.

See [NuGet Trusted Publishing](https://learn.microsoft.com/en-us/nuget/nuget-org/trusted-publishing) and the [pinned official login action](https://github.com/NuGet/login/tree/8d196754b4036150537f80ac539e15c2f1028841).

## Set up npm after account recovery

The npm account is **timothymeadows** and the package is `@timothymeadows/hephaera`. Resolve the existing sign-in/2FA issue with npm support before continuing. Source changes do not restore account access.

1. After sign-in works, confirm ownership of the `@timothymeadows` scope. First publication requires explicitly selected `bootstrap` mode because the package must exist before its trusted publisher can be configured.
2. Create a short-lived granular token with package/scope publish permission and npm's **Bypass 2FA** automation option. Select the owned scope when available; review any broader permission the UI requests.
3. Enter the token directly in GitHub **Settings > Environments > package-release > Environment secrets** as `NPM_BOOTSTRAP_TOKEN`. Never send its value in chat, source, logs or a command example.
4. Run the reviewed public workflow with `registry_selection=npm` and `npm_auth_mode=bootstrap`, or explicitly select `both` if both services are ready. The selected npm tarball is the unchanged GitHub release artifact; the publisher explicitly selects npmjs and public access.
5. After the first npmjs version is verified, configure its **Trusted Publisher** on npm's website: GitHub owner `TimothyMeadows`, repository `Hephaera`, workflow filename `publish-public-packages.yml`, environment `package-release`. Enable **direct publish**, not staging-only permission, for this workflow's `npm publish` path.
6. Set `PUBLIC_NPM_AUTH_MODE=trusted`, verify an authorized OIDC publication, then revoke/remove the bootstrap token. Trusted mode does not fall back to a stored token.

The workflow uses its supported pinned npm CLI; do not run a global npm upgrade to obtain account-configuration commands. Use the npm website for this setup. See [trusted publishing](https://docs.npmjs.com/trusted-publishers/), [granular tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens/) and [publishing 2FA](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/).

## Run the current catch-up

After the reviewed workflow is merged and the selected service policy is configured, open `publish-public-packages.yml` in GitHub Actions, choose `main`, and enter:

| Input | Current first-release value |
| --- | --- |
| `version` | `5.1.0-rc.1` |
| `source_sha` | `f819d9a9c7d641d8c7e14b59560a4fd358ec4630` |
| `release_id` | `431847288` |
| `upstream_tools_sha` | `5d5d3eef94548f062e4ff41c79d4d16ffec4ee65` |
| `upstream_run_id` | `41520638394` |
| `registry_selection` | `nuget` while npm recovery is pending; otherwise explicitly `npm` or `both` |
| `npm_auth_mode` | `trusted`; ignored by a NuGet-only run |

The source SHA identifies the installed baseline. Upstream tools/run identify the successful GitHub publication and signer. The new public workflow's own reviewed revision identifies the current publishing tools; do not substitute it for either upstream input.

Prepare downloads the already published release files and verifies upstream success, source/receipt identities, hashes and strict signer attestations before publisher credentials are available. It does not rebuild, repack or retag them. Review that exact candidate, then approve the configured `package-release` job only when the selected registry setup is ready. A NuGet-only success says nothing about npm availability. Download the `public-registry-candidate` Actions artifact for that review. After execution, retain `public-registry-receipt-attempt-<attempt>`, including admission, plan, recovery and per-channel publication records.

## Automatic delivery and recovery

Future `publish-packages.yml` runs default `publish_public` to true. After GitHub publication succeeds, a separate narrow `actions: write` job dispatches the same standalone public workflow using the repository variables above. It does not depend on a release-event recursion chain. Manual catch-up uses that same canonical identity and gate.

All selected registries are reconciled before selected writes. Matching versions are skipped; collisions stop. Keep `public-publication.json` and its `public-publication.lock` evidence, including per-channel history. A later 404 after write intent, pending or uncertainty does not permit another upload: automatic resubmission stops, with no force/reset option. Reconcile service state before continuing; never delete history. Unselected historical confirmations are retained, but no fresh unselected check is claimed. The upstream GitHub release remains available if a public mirror is pending or fails.

NuGet.org repository-signs downloads, so its served `.nupkg` hash differs from the original unsigned GitHub file. Confirmation requires a real trusted NuGet.org signature check and identical names/bytes for every original ZIP entry, allowing only the added root `.signature.p7s`. Record unsigned-input and signed-download digests separately. npm readback must retain the exact tarball bytes/SRI. See [repository signing](https://devblogs.microsoft.com/dotnet/introducing-repository-signatures/).

NuGet validation/indexing can take time. The workflow polls read-only within its bound and preserves unresolved state instead of uploading again. NuGet clients/search may need **Include prerelease** for `5.1.0-rc.1`; GitHub's `releases/latest` still selects the latest full release. Mark a public destination available only after its exact selected version and download are verified. Public reads need no publisher token; installing from GitHub Packages remains the separate authenticated alternative.
