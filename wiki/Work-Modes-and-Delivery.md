# Work modes and delivery

Hephaera separates optional idea discovery from planning and delivery. The hierarchy is `Brainstorm -> Plan -> Task | Goal | Gauntlet`. Task is the default for one assignment. Goal and Gauntlet require explicit activation. A heading named “Goal” inside an ordinary task describes intent and does not activate Goal flow.

Read the [work-mode source](https://github.com/TimothyMeadows/Hephaera/blob/main/README.md#brainstorm-task-goal-and-gauntlet) and [shared delivery rules](https://github.com/TimothyMeadows/Hephaera/blob/main/AGENTS.md#pr-readiness-gate-and-post-pr-qa) for the complete contract. Mode selection controls state and publication; it does not grant installation, spending, media disclosure or asset-promotion permission.

## Choose the delivery contract

| Stage or mode | Appropriate use | Durable record | Publication boundary |
| --- | --- | --- | --- |
| Brainstorm | Research and clarify ideas before planning | Root `BRAINSTORM.md`; exit summary | No delivery work or publication |
| Plan | Agree scope, dependencies, verification and decisions | Planning artifacts for the selected work | Does not itself publish |
| Task | One specific change or investigation | Task file and matching issue | Fresh human PR readiness approval |
| Goal | Explicitly ordered multi-task delivery | Goal plus task records | Validated task PRs may open automatically; post-PR QA before advancement |
| Gauntlet | One inspectable ambitious deliverable with adversarial iteration | Parent task, contract, rounds and PR/QA ledger | Approved contract permits progress PRs; every merge and final promotion remain human-controlled |

If the request selects conflicting stages or modes, clarify which governs before creating state. Brainstorm cannot remain active while a delivery mode creates work.

## Brainstorm is persistent and explicit

“Enter Brainstorm mode” activates it; ordinary use of the verb brainstorm does not. Once active, startup restores it across conversations. Inactivity, a complete idea or an implementation suggestion does not end it.

The team has exactly three participants: a main project-manager and two persistent read-only researchers. One lane investigates problem, audience and precedent; the other investigates feasibility, constraints, risks and completeness. If both researcher slots are unavailable, idea processing stops. Only the project-manager writes the durable synthesis.

```bash
bash .hephaera/commands/brainstorm-mode.sh start
bash .hephaera/commands/brainstorm-mode.sh status
bash .hephaera/commands/show-brainstorm.sh
bash .hephaera/commands/show-brainstorm.sh --markdown
bash .hephaera/commands/brainstorm-mode.sh stop
bash .hephaera/commands/validate-brainstorm.sh --phase inactive
```

Stable `BR-NNN` branches and `IDEA-NNN` elements retain their IDs. Elements record original ideas, established understanding, cited research, inference, disagreements, dependencies, risks, start conditions and a definition of complete. Valid statuses are `captured`, `clarifying`, `researching`, `plan-ready` and `parked`. Only complete cited elements become plan-ready.

Explicit exit preserves unfinished elements and generates a hash-bound `BRAINSTORM_SUMMARY.md`. It then waits for an explicit element-to-plan request. Creation commands fail closed on active or malformed Brainstorm state, or inactive state without a current exit summary. See the [Brainstorm skill source](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/brainstorm-flow/SKILL.md).

## Plan before substantial work

A useful plan fixes the outcome, current facts, assumptions, owned files, dependencies, verification and material decisions. Non-trivial work includes cross-cutting changes, architectural choices, ambiguity and complex verification. Revise the plan when evidence changes its assumptions.

Parallel lanes need resolved roles, disjoint writes, independently useful outputs and explicit integration order. Task-backed substantial parallel work records `SUBAGENTS.md`; Brainstorm uses its own fixed team instead. Main-lane responsibility includes critical-path decisions, integration, final verification and user communication. A high agent count never justifies overlapping writes or invented work.

## Task flow

A real task gets a detailed task file, concise TODO tracking and a matching GitHub issue. The task file holds instructions, assumptions, implementation notes and review evidence; the TODO is the ordered checklist. Open-issue tracking contains issue URLs, not copied private notes.

Implement the agreed scope, run proportionate verification and record expected versus observed outcomes. Use `record-task-checkpoint.sh` and its validator when creating a canonical completion checkpoint. A source report, browser result or log should identify the actual artifact and material limitations.

Before any PR-related push or PR creation, summarize the completed result and validation and run the readiness gate:

```bash
bash .hephaera/commands/pr-readiness-check.sh TASK_OR_ISSUE VALIDATION_SUMMARY
```

The normal Task gate requires fresh human confirmation. Completing local work, an old approval or permission to edit files does not satisfy that gate. See [pr-readiness-gate](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/pr-readiness-gate/SKILL.md).

## Goal flow

Goal flow begins only through explicit wording or its recognized enabled artifact marker. Each ordered task still receives planning, implementation and verification. After a validated task, its PR may open automatically; immediate post-PR QA must complete before the next task. Branch dependencies are recorded when later tasks build on earlier PR heads.

`create-goal-file.sh` creates the durable goal; `create-goal-completion-report.sh` reports ordered PRs, dependencies, evidence and conflict risk. `pr-readiness-check.sh --goal` records the scoped automatic-publication boundary. Failed verification, unresolved conflicts, unavailable roles or an uncovered product/security decision stops automation. Goal flow never approves reviews, merges or enables auto-merge.

## Gauntlet flow

Before building, the user approves an inspectable quality bar, constraints, exact delivery-base commit, `gauntlet/<name>` integration branch and automatic progress-PR contract. One parent task and issue cover independently judgeable work units. Each retained unit has a stable ID, title and frozen scope. Unit-manifest and quality changes need explicit approved revisions; old failures and supersession obligations remain in the history.

Progress branches use `gauntlet-work/<name>/<item-id>` and target the integration branch. Readiness records immutable publication checkpoints after observing real refs and authenticated GitHub state. Progress PR bodies begin with case-sensitive `Refs #<issue-number>` and include the exact emitted checkpoint marker. The final promotion PR uses `Closes #<issue-number>` and follows the approved delivery-base/current-default-branch contract.

A fresh critic inspects the real artifact at the exact head SHA without the builder's justification. Builder and critic identities remain disjoint. Critic reports include artifact, bar comparison, guardrails, verdict, largest gap and next strategy. Failure returns the unit to a changed builder strategy; subsequent QA must bind the new actual head. A critic pass alone does not integrate a unit: PR QA must pass and a human must merge the exact reviewed head.

After all active units integrate, a fresh integration critic reviews the whole result. Final promotion still needs human readiness approval. Promotion-QA failure is recorded before affected units reopen for remediation. Read the [Gauntlet skill](https://github.com/TimothyMeadows/Hephaera/blob/main/skills/gauntlet-flow/SKILL.md) before operating its append-only ledgers; do not fabricate historical PR events or simplify its identity checks.

## Post-PR QA and completion

Once an authorized PR exists, start QA immediately and post each pass/fail verdict as a new PR comment. Link or mirror relevant evidence to the issue. Gauntlet comments and event recorders require their exact semantic markers, current head and live same-PR evidence. Ordinary comments use `comment-pr-qa-results.sh`; issue evidence uses `comment-issue-test-results.sh`.

Keep unavailable browser, GPU, device, listening or native checks explicitly blocked or not-run. Preserve failed attempts and private evidence locally. A ready PR is a human review surface, not automatic merge approval, store submission, website deployment, Wiki publication or runtime asset acceptance.
