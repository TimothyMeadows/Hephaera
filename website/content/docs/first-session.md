# Start your first session

Open your host project in your coding agent after [installing Hephaera](install.md). Begin with one small piece of work. A clear first task lets you check that the agent found the right repository, understood the project, and knows what evidence you expect.

If you have not created the scaffold, run this from the host project root in Bash:

```bash
bash .hephaera/commands/create-host-ai-scaffold.sh
```

Then ask the agent to read the installation:

```text
Read ./.hephaera/AGENTS.md and review this project's saved context. Tell me what you found, which project choices are already recorded, and what is missing. Do not change application code yet.
```

## Check what the agent found

A useful opening response identifies the host repository and relevant context. Hephaera starts with system memory, project rules, active work, and a repository map. It checks whether an earlier Brainstorm session is still active before starting a new delivery task.

Project choices live in host-level files such as `ARCHITECTURE.md`, `ENGINE.md`, and, for visual work, `STYLE.md`. The agent may ask which templates fit if required choices have not been recorded. You do not need to choose every optional media workflow during setup. See [project setup](project-setup.md) for these decisions.

If the agent seems to be working in the wrong folder, stop application edits and check the resolved paths:

```bash
bash .hephaera/commands/resolve-hephaera-paths.sh
```

The project cache should belong to this host repository. Do not substitute a neighboring project's memory to get past a path error.

## Give the agent an outcome and boundaries

Try a request with an observable result:

```text
The pause menu forgets the player's sound setting. Inspect how settings are loaded and saved, then propose the smallest fix. Preserve existing saves and controls. Show the plan before editing.
```

Tell the agent what must stay stable, what you have already tried, and how to reproduce the problem. A screenshot, failing test, or issue link can help when it is relevant. Avoid sending secrets or credentials as project context.

For nontrivial work, expect a plan that names the intended change and how it will be checked. Refine it in ordinary language:

```text
Keep the first change limited to settings persistence. Leave the menu layout alone. Implement that slice, run the relevant checks, and report any target-device testing you cannot perform.
```

## Read the result as evidence

The final report should explain what changed, what was checked, and what remains uncertain. A unit test can verify serialization; it cannot establish that the menu is usable on every controller or screen. If a required tool or device is unavailable, the report should say so.

Ordinary Task mode stops at the human PR readiness gate before publishing a branch or opening its PR. A working local change is something you can review, not automatic permission to merge or deploy it.

Once this first task feels understandable, continue with [everyday work](everyday-work.md). The wiki explains [roles and skills](https://github.com/TimothyMeadows/Hephaera/wiki/Roles-and-Skills) and [memory and context](https://github.com/TimothyMeadows/Hephaera/wiki/Memory-and-Context) when you want to inspect how the agent chooses and remembers its work.
