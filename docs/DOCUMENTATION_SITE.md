# Documentation site and wiki maintenance

Hephaera has three public documentation surfaces. The landing page explains the project and installation. Eight practical guides help someone use it with their coding agent. The GitHub Wiki carries the detailed reference. Shared instructions, commands and technical documents in the repository remain authoritative when behavior changes.

## Source layout

| Source | Responsibility |
| --- | --- |
| `website/scripts/build.mjs` | Safe Markdown rendering, templates and selected static output |
| `website/navigation.json` | Guide filenames, routes, titles and summaries |
| `website/content/docs/` | Approachable user guides |
| `website/assets/` | Shared responsive styles and optional search/copy behavior |
| `wiki/` | Reviewable Markdown for GitHub Wiki publication |
| `.github/workflows/pages.yml` | Pull-request validation and main-only Pages deployment |

Only `website/dist/` is uploaded to Pages. The build copies the existing shared owl, renders the explicitly listed guides and emits local assets/search data. It does not publish the repository, Bubo, task evidence, `.cache/`, dependencies or wiki checkout. Raw HTML in guide Markdown is escaped. No external fonts, analytics or accounts are used.

## Build and preview

From a maintainer checkout, with existing Node.js 24 or newer:

```bash
npm ci --prefix website --ignore-scripts --no-audit --no-fund
npm --prefix website test
npm --prefix website run wiki:check
npm --prefix website run build
npm --prefix website run check
npm --prefix website run preview
```

The preview binds only to `http://127.0.0.1:4319/Hephaera/`. Stop it with Ctrl+C. Generated files, dependencies and test output are ignored within `website/`. The tests also build at `/`, exercise safe rendering and path refusal, check all generated local links/anchors and confirm deterministic output contains only the selected files.

The default project path is `/Hephaera/`. To preview a root-hosted build, set `SITE_BASE_PATH=/` for both build and preview. In PowerShell use `$env:SITE_BASE_PATH = '/'`; in Bash use `SITE_BASE_PATH=/ npm --prefix website run build`, followed by the same environment setting for preview/check. The build accepts `/` or one project path component, not an arbitrary origin or filesystem path.

Search progressively enhances the guides with a local index. Navigation and content remain available without JavaScript. Code-copy buttons use the browser clipboard when permitted and select code for manual copying when it is unavailable. Escape closes search and returns focus to its opener.

## Enable GitHub Pages after review

Prepare and validate source on a feature branch, then use the normal PR-readiness gate. Enabling Pages and publishing the wiki are separate public operations; ordinary local site work grants no merge permission.

In the repository's **Settings → Pages**, choose **GitHub Actions** as the publishing source. Leave the domain unset unless a custom domain has been selected separately. The workflow deploys only from `main`, after its build job passes. Pull requests build/test/upload an artifact but cannot enter the deploy job. Deploy permissions are limited to `contents: read`, `pages: write` and `id-token: write`; the default workflow permission is read-only.

Enable the Pages source before merging the first site PR, then merge only after the applicable approval and checks. A successful deployment reports the actual URL, normally `https://timothymeadows.github.io/Hephaera/`. Verify that returned URL, document navigation, assets and search; a local build alone does not establish a live deployment.

For a separately approved custom domain/root host, configure DNS and the Pages domain through GitHub, then set the repository variable `HEPHAERA_SITE_BASE_PATH` to `/` before deploying. The workflow otherwise derives the project prefix from the repository name. Do not add a domain or publish DNS changes as a side effect of editing docs.

## Edit and publish the reference wiki

Wiki sources use stable page basenames and ordinary Markdown links such as `[Project contracts](Project-Contracts)`. Source-file links use the main repository's full `blob/main/` or `tree/main/` URL. Guide links point to the public wiki slug. `wiki:check` validates local wiki targets/anchors and source references without claiming those pages are already live.

GitHub stores the wiki in a separate Git repository. It must have an initial page created through GitHub before cloning works. Once initialized, prepare a local checkout:

```bash
git clone https://github.com/TimothyMeadows/Hephaera.wiki.git .local/wiki
node website/scripts/wiki.mjs --publish .local/wiki
```

The second command is a plan only: it lists the source files, their hashes, working-tree dirty state and target without copying, committing or pushing. A draft's HEAD alone does not identify its uncommitted content. It uses no stored token file and accepts only the expected credential-free HTTPS wiki origin. Existing Git authentication supplies access when publication is explicitly selected.

After the source PR has been reviewed and merged, switch to an up-to-date, clean main checkout. With explicit wiki publication authorization:

```bash
node website/scripts/wiki.mjs --publish .local/wiki --execute
```

The helper validates sources, checks both Git roots/origins and the wiki's own default branch, pulls fast-forward only and refuses unpublished local commits. It publishes the exact committed Wiki blobs from the verified main revision, updates only the managed Markdown filenames, preserves other pages, commits with the main source revision and pushes without force. Concurrent wiki changes cause a normal conflict/failure for inspection. Record the observed source/wiki commits and verify the live page; never retry an uncertain push without checking the remote head.

Wiki publication is deliberately explicit. No broad personal token is added to Actions secrets, and no wiki write runs on a pull request. If publication stops after copying, inspect the wiki checkout's changes and reconcile them before another attempt; do not reset or clean away another writer's work.

## Keep the three layers aligned

When a command or production boundary changes, update the authoritative source first, then the relevant wiki page and practical guide. Keep the guides focused on useful tasks; link deeper reference instead of repeating long schemas or command tables. Update navigation only when adding/removing a guide, and preserve stable anchors/slugs where possible.

Run the source/build/link checks after content changes. For layout or interaction changes, review real desktop/mobile pages, keyboard focus, search, clipboard failure handling and no-JavaScript navigation using an available browser. Source tests do not establish rendered usability. Missing tooling or publication prerequisites must be recorded explicitly.

If a page is missing, check its navigation filename, generated route and Pages prefix. If assets/search fail after deployment, compare `SITE_BASE_PATH` with the actual hosting URL. If wiki access returns repository-not-found, check initialization, the exact wiki URL and authenticated access. If native tool/model prerequisites are missing, follow their own setup workflows; building this website never provisions them.
