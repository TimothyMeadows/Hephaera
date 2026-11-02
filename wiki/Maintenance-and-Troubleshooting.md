# Maintenance and troubleshooting

Diagnose the failing layer before changing configuration. A missing tool, stale receipt, incompatible skill, invalid contract and rejected runtime destination have different remedies. Preserve the failed state, read the command's actual output and avoid changing engines, providers, renderers or pipelines merely to obtain a green result.

The primary sources are [AGENTS.md](https://github.com/TimothyMeadows/Hephaera/blob/main/AGENTS.md), the [installation/update instructions](https://github.com/TimothyMeadows/Hephaera/blob/main/README.md#install), [state transition](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/STATE_TRANSITION.md) and the selected production workflow. Run examples from the host root unless noted.

## Safe managed update sequence

The npm/NuGet installer is upcoming and not published yet. After release, invoke it through the selected exact package version or selected local tool. Inspect `doctor --project PATH` first. Restore uses the exact host lock; updating uses the target release's verified manifest/core, not an old launcher guessing a new baseline.

Review `update --project PATH --dry-run` before an explicit update. Dirty tracked source, unsafe ownership, path collisions, legacy state and active readers stop the operation. Supported production/dispatch entrypoints retain cooperative read leases through queue waits, execution, cancellation and cleanup; the updater needs exclusive baseline maintenance ownership through postconditions. This is separate from Bubo GPU scheduling and is not an operating-system sandbox against unmanaged processes.

Keep `.hephaera/.cache` at its absolute path. Existing history, approvals, consent and consumed attempts remain unchanged. Repair/update can create only declared missing scaffold files and append declared protected defaults while preserving existing bytes. Keep pending journals and reconcile interrupted operations with the matching `repair/recover --project PATH`; never delete the state root or remove a lock simply because an operation failed.

Deactivation preserves baseline, private cache, exclusion and inactive ownership. Explicit `--remove-bootstrap` may remove only the unchanged managed host block. Removing npm/NuGet tooling removes tooling alone. Manual clone/submodule installations are not silently adopted; their update procedure is at the end of this page.

A changed Bubo pin requires explicit recorded source initialization and build before native execution. Default package install is core-only; `--with-bubo-source` initializes source without building it. Do not use `--remote` on Bubo or relabel stale native receipts. Read-directive contracts inherit definitions; inline contracts need explicit regeneration when affected. Historical manifests and grants stay historical; changed runtime/policy inputs can require a new asset version and refreshed reviews.
## Startup and layout failures

| Symptom | Inspect | Correct response |
| --- | --- | --- |
| Root resolution fails | Exact `.hephaera/` location and selected root | Fix supported layout/root; do not search a broad workspace parent |
| Missing context files | Managed installer journal/status, resolver and scaffold output | Use verified managed repair/recovery; manual installs use canonical scaffold without importing another cache |
| Bash unavailable on Windows | PowerShell provider discovery | Select existing Git Bash/WSL; install only when explicitly requested |
| Legacy bootstrap found | Root managed block and transition guide | Review migration; do not append a second bootstrap |
| Historical state/fence blocks production | `state-transition.sh inspect` | Preserve source and persistent marker; prepare/migrate only through reviewed scope |
| Active Brainstorm blocks task creation | Brainstorm status and complete root state | Restore its team; require explicit exit and later planning request |

`state-transition.sh prepare` writes a persistent fence without moving old data. It has no force-clear/adopt shortcut. Deleting legacy files or malformed markers does not safely restore authority. New installations without legacy state remain on the normal path.

## Context and compatibility failures

```bash
bash .hephaera/commands/query-project-context.sh --list-tags
bash .hephaera/commands/repo-map-status.sh
bash .hephaera/commands/validate-memory.sh
bash .hephaera/commands/resolve-engine.sh
```

A missing/empty/stale map requires semantic maintenance before relying on it; stamping alone cannot update incorrect descriptions. Validate current memory formats and query relevant tags before broad searches. Debugging work reads existing DEBUG history; record only the verified reusable resolution afterward.

For an excluded skill, read the resolver's effective engine and exclusion reason. A request never changes its compatibility declaration. Missing browser/native/Editor prerequisites remain separate even for AGNOSTIC skills. Ambiguous role names require domain-qualified selection. Never create a fake role or alter the role map to hide the mismatch.

## Native runtime and generation failures

| Observation | Likely layer | Next action |
| --- | --- | --- |
| Bubo missing or wrong revision | Dependency admission | Initialize recorded gitlink; do not use a sibling checkout |
| Dirty source/resource mismatch | Integrity admission | Review/restore the pinned dependency before execution |
| Missing/stale build | Explicit build | Use existing .NET 10 SDK and build wrapper; production never builds implicitly |
| Model receipt exists but content unavailable | Installation verification | Inspect actual pinned content and reported prerequisite |
| Selected provider/tool unavailable | Capability/readiness | Stop selected path and request direction; no fallback |
| Exhausted candidate/revision allowance | Shared approval ledger | Preserve consumed history; require a separately bounded authorization |
| Changed source/consent/lyrics/policy | Evidence freshness | Create retained-ancestry evidence and refresh affected reviews |

Status and ordinary discovery do not load models. A zero-sample load diagnostic is separately selected. Setup is dry-run unless explicitly executed with applicable rights/license evidence. Do not install models during generation or claim source/fixture tests prove native inference quality.

For proof production, distinguish original classification, full six-view approval, preprocessing, actual MV execution, successful finishing and independent/runtime acceptance. For motion/actions, verify actual clips, rig/hierarchy, in-place requirements, anchors and complete ranges. A failed solver does not authorize a different finishing route or authoring backend.

## Interrupted writes and recovery

Packaging and media promotion retain ownership journals/claims, locks and intent/completion/failure evidence. A command can fail after exact bytes have been published. Inspect read-only status and actual current inventory rather than inferring that nonzero exit means no write.

Use the workflow's explicit `recover` with the same configuration/state and current exact authorization. Recovery cannot adopt foreign files, overwrite changed destinations or discard uncertain history. Packaging recovery can reconcile an already committed transaction or restore prior owned state. Remove an empty stale lock only after proving no operation remains active and following that workflow's instructions; never recursively delete locks or entire state roots.

Do not reuse older successful package paths after a failed/cancelled build. Read each successful operation's returned output path and current hashes. Keep signing files, private provenance, voice references and identifying hashes out of public diagnostics.

## Report useful evidence

Record the exact command and sanitized error, affected source/build/contract identities, expected versus observed behavior and the narrow reproduction. Retain logs privately where required. Distinguish declaration, metadata consistency, executable readiness, actual output review and target QA. If a browser, device, GPU or listening check was unavailable, say `not-run` or `blocked` and why.

After a verified fix, record stable tagged memory and debug patterns, update relevant map entries and preview context cleanup. Archive knowledge before compaction. [Memory and context](Memory-and-Context) explains those operations; [Commands and validation](Commands-and-Validation) identifies focused checks.

## Publication is a separate operation

A local documentation build, accepted asset or compiled native package does not deploy a website, initialize GitHub Wiki, submit a store package or open a PR automatically. Apply the selected delivery mode's readiness gate and exact release authorization. GitHub Wiki uses a separate repository and may require initial creation through GitHub's UI before Git access works; report that prerequisite rather than inventing a successful publish. Review the [documentation-site maintenance guide](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/DOCUMENTATION_SITE.md) for the repository's explicit website/Wiki procedure.

## Advanced manual baseline updates

This is the Git fallback for existing manual installations while package distribution remains unreleased. It is not the managed installer's update/recovery path. Review and stop active work first, preserve `.hephaera/.cache` and check local source changes.

For a manual submodule, explicitly select the baseline update and review the changed host gitlink:

```bash
git submodule update --remote --checkout -- .hephaera
git -C .hephaera submodule update --init --recursive --checkout -- runtime/bubo
```

For an independent manual clone:

```bash
git -C .hephaera pull --ff-only
git -C .hephaera submodule update --init --recursive --checkout -- runtime/bubo
```

Only the first command advances the baseline. The second checks out Bubo's recorded revision; never recursively update nested dependencies to their latest branches. Rebuild explicitly if its pin changes. A fork remains an advanced customization choice; official package users do not need one. See [Installation and layout](Installation-and-Layout) for first setup and manual scaffold commands.
For the upcoming managed installer, a crashed owner or interrupted process may leave descendants alive. Retain its receipts, stop remaining owned work and inspect ownership before `recover --project PATH --confirm-quiescent` through the exact package. The flag is an operator assertion, not an OS process scan; active/foreign/malformed owners remain blocked. Ordinary caught-failure recovery with released leases needs no assertion.
