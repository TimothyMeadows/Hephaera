# Memory and context

Hephaera stores durable host knowledge inside the resolved project's `.hephaera/.cache/`. The directory is ignored by the shared baseline's Git history, but its contents are persistent project state. Preserve them through updates and back them up appropriately. A path containing “cache” does not make receipts, consent, task history or memory disposable.

Read the [memory source overview](https://github.com/TimothyMeadows/Hephaera/blob/main/README.md#memory-v2) and [startup contract](https://github.com/TimothyMeadows/Hephaera/blob/main/AGENTS.md#session-startup-review). Memory guides later decisions; it cannot outrank current system, developer or user instructions.

## Files and intended scope

| Artifact | Purpose | Retrieval behavior |
| --- | --- | --- |
| `SYSTEM_MEMORY.md` | Small, flat protected constraints and verified safe capabilities | Read in full at startup |
| `MEMORY.md` | Tagged project facts, patterns and workflows | Query by relevance |
| `REPO_MAP.md` | Tagged semantic repository structure | Query and check freshness |
| `RULES.md` | Project-specific preventive rules | Review at startup |
| `DEBUG.md` | Reusable debugging evidence and verified resolutions | Read for debugging work |
| `CONTEXT_SUMMARY.md` | High-signal active-state and tag inventory | Refreshed context index |
| `tasks/`, `goals/`, `gauntlets/` | Scope, progress and evidence for delivery | Review relevant active state |
| `archive/` and `reports/` | Retained history and maintenance reports | Consult for applicable ancestry |

Optional Brainstorm state is the exception to cache placement: `BRAINSTORM.md` and `BRAINSTORM_SUMMARY.md` live at the host root and are restored before planning. They do not replace the memory files.

## Startup sequence

Resolve paths using the installation's command. Do not infer a broader workspace root when resolution fails. On Windows without usable Bash, complete read-only provider discovery first; installation remains explicit.

```bash
bash .hephaera/commands/resolve-hephaera-paths.sh
bash .hephaera/commands/create-host-ai-scaffold.sh
```

Successful package setup already runs the canonical scaffold; the first agent read is not its setup trigger. Startup can repair missing scaffold files through the supported ownership/recovery path, and manual installations use the explicit scaffold command. Preserve existing memory bytes except the declared canonical missing-default appends; never recreate historical ledgers as defaults. Load all system memory, check Brainstorm status, and restore active discovery before planning or selecting Task, Goal or Gauntlet. Review project rules, engine, architecture, style, relevant active tasks and open issues. Read DEBUG for debugging and MEDIA only when applicable media work is in scope.

Validate current memory formats before relying on them. Never load an old installation's memory as an automatic fallback. Legacy state may contain historically important approvals while remaining unavailable as current execution authority; see [Maintenance and troubleshooting](Maintenance-and-Troubleshooting).

## Retrieve before broad searches

List known tags, infer the relevant ones from the request and active task, then query ranked context:

```bash
bash .hephaera/commands/query-project-context.sh --list-tags
bash .hephaera/commands/query-project-context.sh --tags "area:auth,tech:dotnet"
```

The [query implementation](https://github.com/TimothyMeadows/Hephaera/blob/main/commands/query-project-context.sh) searches tagged memory and map entries. The default mode is `ranked` with limit 25 for non-core results. Matching tags increase rank; `scope:core` entries are included independently. `--match any` and `--match all` provide explicit alternatives, and `--limit` takes a positive integer. Use actual relevant tags from the inventory rather than assuming the example tags exist.

After context retrieval, inspect current source to verify facts and investigate missing detail. Memory is a navigation aid and durable explanation, not a substitute for actual implementation or current runtime evidence.

## Tagged writes and replacement

Each project-memory entry has exactly one `kind:` tag and at least one relevance tag: `area:`, `tech:`, `env:`, `topic:` or `scope:core`. Tags use lowercase normalized values. Untagged project-memory writes are unsupported.

```bash
bash .hephaera/commands/append-project-memory.sh \
  --tags "kind:workflow,area:auth" \
  --entry "Run the focused authentication tests before the full suite."
```

The example demonstrates syntax; remember it only if it is a verified rule in that host. Before writing, query related entries and deduplicate equivalent facts. `--replace "old fact"` requires exactly one case-insensitive matching old fact and archives the prior memory file before removing the old entry.

Record stable discoveries that change future decisions, locate ownership or explain a reusable root cause. Keep guesses, raw logs, temporary status, copied instructions, secrets, identifying details and personal absolute paths out of memory. Task evidence can preserve detailed diagnostics privately; memory should preserve the useful conclusion with its applicable scope.

## Repository-map freshness

```bash
bash .hephaera/commands/repo-map-status.sh
```

Status reports `MISSING`, `EMPTY`, `STALE` or `CURRENT`, based on tagged entries and a Git-visible project-path fingerprint. Missing, empty or stale maps require the compatible `maintain-repository-map` workflow before relying on structure. Review and update semantic entries, then stamp the actual current fingerprint with `repo-map-status.sh --stamp`. Stamping an empty map is refused. A stamp alone does not make outdated descriptions true; content review comes first.

The map explains responsibility and relationships rather than dumping every file. Keep it focused enough to help future searches and broad enough to cover the project's actual structure.

## Cleanup, purge and history

After substantial verified work, use the compatible `clean-context` skill and preview its maintenance:

```bash
bash .hephaera/commands/clean-context.sh --dry-run
bash .hephaera/commands/clean-context.sh
```

Cleanup compacts completed tasks, merges memory and map entries, removes duplicate rules, compresses debug history and refreshes inventory. Archive durable knowledge before removal. It is not permission to delete staged assets, native attempt ledgers or historical acceptance records.

For a deliberately retired exact tag, `purge-project-memory.sh --tag "area:old-area" --target both --dry-run` previews matches; the command supports `memory`, `repo-map` and `both` targets. Review scope before the real operation. Migration and purge preserve history; they cannot reset generation allowance or turn relocated approvals into current ones.
