# Hephaera npm installer

Install the exact Hephaera baseline recorded in this package and automatically create the project scaffold. Select a verified version from the GitHub release and package listing.

Node.js 24+, Git and an existing Bash provider are required. Authenticate to GitHub Packages with your own classic PAT (`read:packages`), stored in user-local credentials:

```bash
npm login --scope=@timothymeadows --auth-type=legacy --registry=https://npm.pkg.github.com
```

Use a token-free scoped mapping: `@timothymeadows:registry=https://npm.pkg.github.com`. Then, after the chosen exact version is available:

```bash
npm exec --yes --registry=https://npm.pkg.github.com --package=@timothymeadows/hephaera@<VERSION> -- hephaera install --project .
```

The explicit command installs the recorded Git revision at `.hephaera` in an existing host Git root and runs the canonical scaffold automatically. Raw package installation has no lifecycle hook and changes no inferred host project. A dev-dependency installation can use the exact package version and its local `hephaera` executable instead.

Run `hephaera verify --json` to inspect the bundled release identity, and `hephaera doctor --project .` to inspect an installed host. The installer needs Git network access; it is not an offline baseline archive. `--with-bubo-source` explicitly initializes the recorded Bubo source only. No SDK, Bash provider, model, native build, license, generation or asset promotion is installed or authorized implicitly.

Keep the project's ignored `.hephaera/.cache` intact. Manual installations and legacy state require an explicit migration decision. Updates and recovery use the selected exact installer version; upgrading this tooling alone does not update an existing project.
