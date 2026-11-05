# Browser evidence adapter

Use a task-local, self-contained JavaScript ESM adapter to connect host-native character code to the deterministic evidence harness. The adapter exports:

```js
export async function createCodeCharacterEvidenceAdapter({ THREE, stage, profile, seed })
```

The returned object implements these methods:

- `capture({ view, pixelHeight, kind, partId? })`: render one deterministic canvas below `stage`; `kind` is `whole`, `semantic-mask`, or `isolated`.
- `sampleStructure(config)`: return the coordinate system, stable-pivot and finite-transform/bounds flags, semantic parts and parents, generic anchors, joints, sockets, colliders, normalized ground measurements, declared attachment gaps, and declared symmetry deviations.
- `sampleMotion(config)`: return the actual motion mode, skeleton identity, maximum influences, finite-normalized-weight and finite-deformation flags, roles, representative poses, contacts and normalized errors, and moving-part count.
- `sampleRuntime(config)`: measure the exact representative actor count and contextual draw, geometry, material, texture, rig, clip, shader, memory, CPU, and GPU facts.
- `constructionHash({ run, ...config })`: independently construct the actor and return a stable semantic hash without object identities or timestamps.
- `lifecycleCycle({ cycle, ...config })`: perform create, update, animation, attachment, and dispose work and return `{ cycle, resourceDelta, staleCallbacks }`.
- `dispose()`: release the live capture subject, renderer, listeners, callbacks, materials, geometries, and owned textures.

The harness serves an explicit inventory on `127.0.0.1` using an OS-assigned port and a fresh per-run URL capability. The adapter is automatically admitted; declare each necessary project-relative JavaScript/JSON dependency with repeatable `--module FILE`. Use relative module imports; bare `three` resolves through the harness import map. The installed `three.module.js` and its optional sibling `three.core.js` are admitted automatically. Absolute `/project/` and `/three/` URLs are unavailable. Undeclared files return 404. Inventory paths reject links, filesystem aliases, `.git`, `.hephaera/.cache` and legacy `.opencaw/.cache`; keep adapter source outside these private directories. Profiles, calibration and reports may still live in the project cache.

```bash
./commands/measure-code-character-evidence.sh capture .hephaera/.cache/tasks/actor/code-character.json \
  --adapter evidence/actor-adapter.mjs --module src/models/actor.js \
  --module evidence/measurements.json --output-dir evidence/actor-capture
```

Only immutable admitted bytes are served: at most 256 module files, 8 MiB per file and 32 MiB total including the page. Each capture is limited to 4,096 HTTP requests, 16 concurrent responses, 32 connections and two minutes. Host and method checks allow only the exact loopback authority and GET. Request/header/inactivity timeouts and cancellation close owned sockets and the browser. Source changes require a new run; reports retain hashes of the admitted inventory without its URL capability.

The harness blocks service workers and external requests, launches Chromium with its sandbox enabled, confines outputs to a new repository directory, and locks that directory against concurrent capture. Do not import remote modules, fetch assets, install packages, disable the sandbox, reuse a production server, or write outside the requested output. The capability and loopback controls protect local source navigation; they do not make project adapter code trusted or provide an OS sandbox for filesystem admission against a hostile concurrent local writer.

Fixture analysis calibrates the measurement semantics but is marked untrusted. Freeze its all-pass and focused-fail reports with `record-code-character-calibration.sh` before the gate's first result. A machine-gate pass then requires exactly one successful browser capture report as `machine-report` evidence. Even trusted evidence cannot decide identity, silhouette readability, form readability, materials, style, appeal, or other aesthetic questions.

Treat `not-applicable` as a reasoned outcome, not an omission. Static actors have no animation-role/contact checks; articulated actors prove declared moving parts and roles; skinned actors also prove skeleton identity and influence limits. The observed mode must match the frozen profile, so declaring a simpler mode cannot bypass required behavior.
