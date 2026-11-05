# Hephaera .NET tool

Install the exact Hephaera baseline recorded in this package and automatically create the project scaffold. Select a verified version from the GitHub release and package listing. This .NET 10 tool embeds the same Node.js installer core and release manifest as the matching npm package. It requires an existing Node.js 24+, Git, and Bash provider. It does not download npm or install prerequisites.

Use your own GitHub classic PAT with `read:packages`, supplied through a supported user/session credential mechanism. The reviewed `installer/setup/NuGet.Hephaera.config` example routes exactly `Hephaera` to GitHub Packages and other dependencies to nuget.org. Do not commit credentials or use `--add-source` as a source-priority mechanism.

The versioned Bash and Windows PowerShell 5.1 setup wrappers in `installer/setup/` acquire the exact tool into an explicit project-local manifest, verify its bundled identity, then invoke `install --project` immediately. They do not search parent tool manifests or a global executable. Raw `dotnet tool install` only acquires the tool and does not scaffold a project.

Both channels install the recorded Git baseline at `.hephaera` and automatically run the canonical scaffold. They require an existing host Git root, preserve durable ignored cache, and refuse implicit adoption of a manual/legacy installation. Node launch uses separate argument values and propagates exit status; cancellation terminates its owned process tree and leaves installer recovery evidence intact.

`--with-bubo-source` initializes only recorded source. Native builds, models, software installation, licenses, generation, promotion, publication, and engine/media choices remain separate. This is not an offline source bundle.
