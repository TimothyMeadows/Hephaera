# Reviewed setup entry points

Upcoming release files; no package availability is implied. Both wrappers use the adjacent `setup-local-tool.cjs`; keep those reviewed files together. They need Node.js 24+, .NET SDK 10+, Git and an existing Bash provider for the canonical scaffold.

After authenticating to the selected GitHub Packages feed, run from a trusted host repository:

```bash
bash /path/to/reviewed/installer/setup/setup-nuget.sh --version 5.1.0-rc.1 --project . --configfile ./NuGet.Hephaera.config
```

Windows PowerShell 5.1:

```powershell
& 'C:\path\to\reviewed\installer\setup\setup-nuget.ps1' --version 5.1.0-rc.1 --project . --configfile .\NuGet.Hephaera.config
```

Paths are examples, not download URLs. Use the exact reviewed release files and version. Both wrappers require every named option. `-- --with-bubo-source` explicitly requests only recorded Bubo source, never a native build or models. No token is accepted as a script argument.

The helper validates an explicit host Git root, owns only its `.config/dotnet-tools.json` update, preserves unrelated tool entries, and refuses a parent manifest, a conflicting command/version, links, or another setup lock. Existing root manifests must declare `isRoot: true`. Acquisition/restore uses the supplied feed configuration, then the exact local tool is verified before `install --project` runs. A setup failure leaves diagnostic/partial state for review; it is never reported as success. A restore can require other tools already declared in that local manifest to be available from the chosen sources.

The matching npm front door uses explicit execution with no lifecycle hook:

```bash
npm exec --yes --package=@timothymeadows/hephaera@5.1.0-rc.1 -- hephaera install --project .
```

`npmrc.example` contains only a scope mapping. `NuGet.Hephaera.config` contains no credentials and maps exactly `Hephaera` to `HephaeraGitHub`; other dependencies use nuget.org. Provide `NuGetPackageSourceCredentials_HephaeraGitHub` through session-local/user credential handling, not tracked cleartext. Real tokens must not be put in the command line, Git, generated packages, or logs.
