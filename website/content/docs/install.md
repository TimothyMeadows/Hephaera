# Install Hephaera in your project

Fork [Hephaera on GitHub](https://github.com/TimothyMeadows/Hephaera) before installing it into a team or production project. Your fork gives the team control over updates and custom instructions. Use your fork's URL in the examples below, replacing `<your-org>` with its owner.

Hephaera belongs at `<project-root>/.hephaera`. That name is the same for every coding agent. Keep your application files in the project root; do not rename the installation to match an editor or agent.

## Check the prerequisites

Make these tools available in the shell your agent will use:

- **Git** for cloning or adding the submodule.
- **Bash** for Hephaera's shell commands; see the Windows options below.
- **Node.js** for JavaScript command helpers and engine adapters.
- **Python 3.9 or later, available as `python3`**, for task, issue, and checkpoint helpers. Having only a `python` command does not satisfy those scripts.
- **GitHub CLI (`gh`), authenticated for your repository**, when creating issues or pull requests.

Ask your agent to check these before continuing. Bubo's .NET 10 SDK, workflow tools, and any selected models are separate requirements described below.

Run the following installation commands from your project's root. If `.hephaera` already exists, inspect the current installation before cloning or adding anything over it.

## Choose a submodule or clone

A submodule is recommended when the host repository should record exactly which reviewed Hephaera revision it uses:

```bash
git submodule add https://github.com/<your-org>/Hephaera .hephaera
git submodule update --init --recursive --checkout -- .hephaera
```

Review and commit the host repository's submodule changes through your normal process. Later updates can be reviewed as a change to the pinned revision.

A direct clone gives the installation its own Git repository and can suit an independently customized copy:

```bash
git clone --recurse-submodules https://github.com/<your-org>/Hephaera .hephaera
```

Agree with your team how that independent checkout is maintained. Use the submodule option when you want the host repository to pin the shared baseline explicitly.

Both examples initialize recorded nested dependencies, including Bubo's source. Recursive checkout does **not** build Bubo, install models, accept licenses, or generate assets.

## Make Bash available

Hephaera commands use Bash. Linux and macOS normally have it already. On Windows, Git Bash is the recommended provider. After mounting Hephaera, inspect available providers from PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\.hephaera\commands\install-windows-bash.ps1"
```

If you choose to install Git Bash, request it explicitly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\.hephaera\commands\install-windows-bash.ps1" -Provider GitBash -Install
```

An existing provider can run the scaffold through `-RunScaffold -ProjectRoot .`; the [installation wiki](https://github.com/TimothyMeadows/Hephaera/wiki/Installation-and-Layout) includes the complete Windows options. Ordinary setup does not install Bash for you.

## Create the project scaffold

With Bash available, run from the host project root:

```bash
bash .hephaera/commands/create-host-ai-scaffold.sh
```

This creates the repository-local context files and a managed block in the host root `AGENTS.md`. That block points the agent at `.hephaera/AGENTS.md`; existing host instructions outside the managed block are preserved. Re-running the scaffold preserves existing project content.

If your agent has not discovered the installation, start with:

```text
Read ./.hephaera/AGENTS.md, initialize any missing project scaffold, and tell me which repository and project context you found before changing application code.
```

Continue with [your first session](first-session.md).

## Build Bubo only when needed

Planning, memory, engine selection, and scaffold creation work without a built Bubo runtime. Before workflows that need its native execution, use an existing .NET 10 SDK to initialize and build the recorded version:

```bash
bash .hephaera/commands/initialize-bubo-runtime.sh
bash .hephaera/commands/build-bubo-runtime.sh
```

These are separate, explicit steps. They do not install Blender, Python environments, models, or platform SDKs. Media setup, licenses, generation budgets, and asset acceptance remain separate decisions. See [Bubo runtime](https://github.com/TimothyMeadows/Hephaera/wiki/Bubo-Runtime).

## Keep existing project state

The ignored `.hephaera/.cache` directory contains durable memory, tasks, reviews, and other project state. It is not disposable download data and must not be committed into the shared baseline.

If you are carrying an older installation forward, first run:

```bash
bash .hephaera/commands/state-transition.sh inspect
```

Inspect is read-only. Do not fix a transition warning by deleting the cache, moving private state, or renaming old approvals. Follow [maintenance and troubleshooting](https://github.com/TimothyMeadows/Hephaera/wiki/Maintenance-and-Troubleshooting) before continuing production work.
