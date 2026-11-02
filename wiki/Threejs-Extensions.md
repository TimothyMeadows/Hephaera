# Three.js extensions

THREEJS selects three.quarks for new particles/VFX and pmndrs postprocessing for new screen effects. These are engine capabilities, independent of STYLE, media generation and MAUI packaging. Selection installs/imports nothing, preserves the host renderer and does not upgrade Three.js. Other engines retain their own systems.

The detailed sources are [Three.js particles](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/THREEJS_PARTICLES.md), [postprocessing](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/THREEJS_POSTPROCESSING.md) and the [engine registry](https://github.com/TimothyMeadows/Hephaera/blob/main/.engine/registry.json). Resolve `threejs-build-particles` or `threejs-build-postprocessing` before activation.

## Host dependencies and read-only inspection

| Capability | Tested dependency fixture | Renderer boundary |
| --- | --- | --- |
| Particles | Three 0.182.0, three.quarks 0.17.1, quarks.core 0.17.1 | Established WebGLRenderer integration |
| Postprocessing | Three 0.182.0, postprocessing 6.39.5; shared Quarks/core 0.17.1 fixture | Actual WebGL2 required |

These versions describe tested baseline fixtures, not permission to overwrite an existing lock. Quarks declares Three >=0.182.0 and wildcard core; postprocessing 6.39.5 declares Three >=0.168.0 <0.187.0. Keep one compatible Three resolution, exact resolved core and package integrity. Review different versions/graphs explicitly. Preserve applicable MIT and Zlib notices.

```bash
bash .hephaera/commands/threejs-particles.sh inspect --renderer WebGLRenderer
bash .hephaera/commands/threejs-postprocessing.sh inspect --renderer WebGLRenderer
```

Inspectors read bounded package/lock/installed metadata without importing host JavaScript. A matching graph establishes metadata consistency only: installed bytes, real context, shader execution and target readiness remain unverified. Executable discovery coverage is the documented npm lock v2/v3/direct layout. Unsupported workspaces, aliases, links or complex graphs need review, not forced package-manager conversion.

WebGPU is unavailable in these bounded integrations. Experimental Quarks nodes, optional R3F packages and hosted editors are separate choices. Never silently select another renderer or fall back to native Points because a dependency is missing.

## Scaffold reviewed source explicitly

```bash
bash .hephaera/commands/threejs-particles.sh scaffold --output src/engine/particles --renderer WebGLRenderer
bash .hephaera/commands/threejs-postprocessing.sh scaffold --output src/engine/postprocessing --renderer WebGLRenderer
```

Scaffold copies reviewed helper/example/contracts into new owned directories with source/engine identities. Existing output, unsafe paths, linked components and invalid override scopes fail. It changes no package manifest, lock or renderer and performs no automatic helper migration. Valid prototype overrides pass `--engine-evidence` and stay within recorded scope. Inspect retained interrupted scaffold state instead of deleting it blindly.

Use copied examples with host-installed APIs. Read the exact [particle helper contract](https://github.com/TimothyMeadows/Hephaera/blob/main/.engine/threejs/particles/README.md) and [composer helper contract](https://github.com/TimothyMeadows/Hephaera/blob/main/.engine/threejs/postprocessing/README.md) before integration; this page does not invent a wrapper API.

## Particle ownership and bounds

The particle helper owns one BatchedRenderer for its scene, while the host owns renderer, canvas, scene, camera and simulation. Use the existing presentation clock. Update particles once; a second loop must not advance them again.

The bounded helper covers point/sphere-emitter billboard effects. Broader Quarks trails, mesh particles, shaders, JSON and custom behaviors need separately reviewed integration and budgets. Define finite emission, lifetime, capacity, system/instance and delta limits. Upstream 0.17.1 has no public hard `maxParticle` cap and batch buffers can grow; buffer capacity is not a safety policy. Unsupported sub-emitters or hidden emission cannot bypass helper bounds.

Pause freezes emission/simulation. Resume consumes ordinary bounded delta rather than the whole hidden interval. Cancel/reset/pool reuse retire old generations and clear particles while retaining bounded pools. Final disposal releases owned batch geometry/materials; borrowed textures, models and materials remain with their owners. Test repeated disposal, zero delta, world transforms, shared scenes, ID reuse and stale callbacks.

Bind effects to reviewed actor/action anchors and accepted controller events. Target points are explicit. Particle completion cannot grant damage, movement, projectile arrival or targeting authority. Retain reduced-motion/flash controls, finite quality tiers, readable essential cues and transparent-overdraw budgets.

## Composer ownership and initial profile

Inject actual host Three/postprocessing modules, renderer, scene and camera. One existing presentation loop runs simulation, animation/Quarks, then composer output once. The helper owns no animation-frame scheduler and never disposes borrowed scene assets or the particle runtime.

The initial bounded profile is WebGL2, LDR byte framebuffer, zero MSAA, RenderPass and FXAA. Validate the actual context and framebuffer capabilities, explicit color/tone settings and finite size/DPR/pixel/delta limits. Suspend on visibility/MAUI lifecycle and context loss; validate again after restoration. Teardown releases owned composer resources and listeners.

Bloom, HDR, depth/outline/SSAO, LUTs, multisampling and custom passes require a reviewed extension with capability probes, rights where applicable and effect/pass/texture/frame budgets. HDR needs verified high-precision targets and one final tone/output path. Byte targets lose HDR range; do not silently lower a selected profile or change color behavior to hide failure.

## Motion ancestry and packaged targets

Pinned Bubo motion/action sample adapters retain their historical CPU Points code and hashes. A new registry capability does not rewrite them or inherit a Quarks approval. Reuse requires explicit reviewed host integration/migration; new particle production uses the selected Quarks owner.

MAUI packages the static host normally. Route lifecycle suspend/resume into presentation owners. Test real packaged assets on Windows, Mac Catalyst, Android and iOS: context creation, shader compilation, particle/composer interaction, alpha/color, UI readability, DPR/orientation, context loss, sustained frame time and memory. Browser or CPU-fixture success cannot certify native GPU behavior. Do not bypass GPU blocklists or select software rendering to manufacture acceptance.

## Rendering scope and evidence

Ray tracing and path tracing remain deferred. The current integration uses the host's raster WebGLRenderer and bounded LDR/FXAA profile. It selects no tracing library, WebGPU requirement or renderer replacement. Finite picking/raycast queries are a separate gameplay concept.

Record actual source/helper/dependency identities, renderer/context, target, settings and measured workloads. Source/CPU tests establish exercised lifecycle or metadata behavior; actual GPU appearance, packaged color, device performance and human visual acceptance require their own evidence. Keep missing checks explicit and preserve failed results before requesting a deliberate next step.
