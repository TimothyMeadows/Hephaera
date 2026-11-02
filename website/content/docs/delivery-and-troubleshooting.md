# Review, deliver, and recover when something is missing

A finished local change should be easy to review. Ask the agent to explain what changed, how it was checked, and what still needs a person, device, service, or tool. A green source check is useful evidence; it is not proof that every target or player experience works.

## Know which review gate applies

For an ordinary Task, Hephaera prepares a readiness report and asks before publishing the branch and opening its PR. After publication, it starts post-PR QA and records the result on the PR. Merging and deployment remain separate decisions.

Goal flow is an explicit choice for ordered tasks. It can open each completed task's PR after its checks, then must finish post-PR QA before moving on. It does not merge, approve, or enable auto-merge.

Gauntlet flow uses an approved quality bar and independent critics on work-unit PRs. Every merge remains human-controlled, and final promotion retains its human publication gate. Do not assume that permission from a completed Goal applies to a later ordinary task.

For the complete rules, see [work modes and delivery](https://github.com/TimothyMeadows/Hephaera/wiki/Work-Modes-and-Delivery).

## Ask for evidence you can assess

```text
Prepare the local result for review. List the changed behavior, tests and build results, remaining risks, and any checks you could not run. Keep source checks separate from actual target-device or player evidence. Wait at the normal publication gate.
```

Useful evidence names the tested revision/build, environment, expected behavior, observed result, and relevant artifacts. For a game, that may include a real playthrough or capture. For generated media, it includes the exact reviewed asset version and complete listening or visual review. Missing prerequisites should remain `not-run` or `blocked` with a reason.

Run the host project's own focused tests and build for application changes. Hephaera's baseline validators check the baseline itself; they do not replace your game's or application's tests. Maintainers can find focused and integrated commands in [commands and validation](https://github.com/TimothyMeadows/Hephaera/wiki/Commands-and-Validation). The integrated suite has its own native/runtime prerequisites.

## Investigate the missing piece

| Symptom | Useful next step |
| --- | --- |
| The agent ignores Hephaera. | Confirm `.hephaera/AGENTS.md` exists and the host `AGENTS.md` has its managed bootstrap; explicitly ask the agent to read it. |
| Project paths or memory look wrong. | Resolve paths from the host root; do not borrow a neighboring cache. |
| A command cannot find Bash. | Inspect Windows providers, then explicitly choose an existing provider or installation. |
| Engine or skill compatibility fails. | Inspect `ENGINE.md` and the requested skill; make a migration/selection decision instead of forcing incompatible APIs. |
| A native asset workflow cannot run. | Check the recorded Bubo source/build and the workflow's actual tools/models; selection is not installation. |
| A media pipeline is unavailable. | Report the selected pipeline and missing prerequisites; do not silently switch providers. |

These read-only checks run from the host project root:

```bash
bash .hephaera/commands/resolve-hephaera-paths.sh
bash .hephaera/commands/resolve-engine.sh
bash .hephaera/commands/state-transition.sh inspect
```

State inspection does not clear a transition fence, migrate state, or renew an approval. Follow the reported limitation rather than deleting evidence to make the command pass.

## Preserve work while fixing setup

The ignored `.hephaera/.cache` holds durable project memory, tasks, reviews, receipts, and other workflow state. Do not remove it as a generic cleanup step or commit it into the shared baseline. Keep old generation attempts and rejected candidates accounted for; a retry is not a fresh allowance automatically.

Review Hephaera updates intentionally through your fork and chosen installation method. If an update changes the recorded Bubo revision, explicitly initialize and rebuild it before using native workflows. Existing assets and reviews may need a new version or refreshed evidence; old receipts should not be rewritten to imply a new approval.

Use [installation](install.md) for the setup commands, [memory and context](https://github.com/TimothyMeadows/Hephaera/wiki/Memory-and-Context) for durable context, and [maintenance and troubleshooting](https://github.com/TimothyMeadows/Hephaera/wiki/Maintenance-and-Troubleshooting) for deeper recovery guidance.
