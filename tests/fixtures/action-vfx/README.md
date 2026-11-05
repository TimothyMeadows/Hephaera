# Action VFX engineering fixtures

`original-fixture.mjs` owns small original JSON/GLB/PNG data and concrete Three.js bindings for CPU admission/scheduling tests. Its native-admission packet is explicitly synthetic test data. It grants no native verification, source rights, human acceptance or runtime promotion.

`index.html` and `scene.mjs` consume a separately staged, freshly native-validated original model/effect closure. They do not install dependencies or produce an accepted package. Model loading uses the existing pinned GLTFLoader and SkeletonUtils. The small bounded RGBA8 PNG decoder is an independent test oracle, not a production decoder capability.

Supply `fixture.json` in an explicit assets directory:

```json
{
  "engineSelection": {"effectiveEngine": "THREEJS"},
  "budgets": {},
  "performanceCases": ["caster", "launcher"],
  "cases": [{
    "id": "caster",
    "package": "caster/action-package.json",
    "model": "caster/model.glb",
    "nativeAdmission": "caster/native-admission.json",
    "action": "cast",
    "performancePeakTime": 0.5,
    "effects": [{
      "id": "charge",
      "package": "caster/effects/charge/package.json",
      "profile": "caster/effects/charge/profile.json",
      "resources": [{"id": "texture", "path": "caster/effects/charge/texture.png"}],
      "correspondences": [{"resourceId": "texture", "path": "caster/effects/charge/texture-correspondence.json"}]
    }]
  }]
}
```

The abbreviated engine and budget objects above must be replaced by the complete resolved identities and finite profile budgets. Action/source reference paths retain their exact native package identities; the explicit fixture paths locate their unchanged bytes within the local assets route. Every decoded texture/geometry must match its exact independent native correspondence. No loader fallback or proxy geometry is used.

The WebGL runner captures all step, marker, cue and layer start/stop/retirement times together with a declared 4fps PNG cadence and after-boundary views. Its absolute clock observes delivered actor time after each step and records representable scene-clock roundoff. The same-pose pixel comparison temporarily culls the actual scene batch and procedural beam render nodes; a quality/emission setting is not used as a visibility substitute.

Normal playback records the real canvas through the existing browser's explicitly selected `video/webm;codecs=vp9` MediaRecorder profile (30fps, requested 2Mbps, 16MiB and 30-second limits). VP8 is available only through an explicit fixture setting. Missing codec readiness fails the capture. Binary artifacts move to an exclusive Node writer in at most 64KiB byte-array chunks; video/base64 data is never printed in runner logs. The Node helper verifies exact SHA-256, WebM/VP8-or-VP9 track dimensions, video block/frame counts and first/last timestamps under finite parsing bounds. It inspects the container and does not claim codec decoding or human motion-quality review.

Each selected native effect layer is also acquired as one standalone lease from its exact package/profile and resource bindings, using the same scene-owned Quarks service and LDR/FXAA compositor. Neutral, dark and light PNGs show one actual layer at the same state. A trail receives a declared bounded engineering transform path so real retained history is visible. Every layer view names an actual combined-action PNG SHA. The separate concurrency PNG contains two original models plus an actual ambient sprite lease, with one scene owner and one elapsed clock interval.

The pose oracle independently parses the exact GLB again and evaluates its original exported clip with a separate mixer. Captures compare every node world matrix, at most three deformed vertices from each of 32 meshes, and the real exported anchor at each exact cue release. Off-grid after-boundary views exercise interpolation. This is bounded technical pose evidence rather than full-surface or artistic approval.

The fixed action camera fits an independent animated GLB envelope sampled at exported keys and midpoints, every actual model instance, all fixed/live target points and bounded layer size/speed/lifetime extents. Each functional render then projects actual model boxes, beam bounds, particle bounds and retained trail-history bounds and fails if a promised extent is clipped. Standalone views have their own finite fit. GPU projection/pose/pixel QA is excluded from timed benchmark frames. Resource, particle-count and visible-pixel maxima are recorded separately; multiple real PNGs may mark occupancy peaks.

The fixture owns each `SkeletonUtils.clone` skeleton. After the action releases it, reset disposes that unique clone skeleton and its derived GPU bone texture while preserving source skeletons, geometry, materials and textures. Four actual clone/render/reset cycles per model must return to the same renderer texture count before resource-disposal evidence passes.

The lifecycle report keeps actual failures and unavailable capabilities explicit. Context testing resets actors, suspends the clock, invokes the actual WebGL loss/restore extension, checks blocked rendering, explicitly revalidates the compositor and starts a fresh model without hidden-time catch-up. The trail reset browser probe tests the exact reusable native lease with an explicit discontinuity reset; automatic action discontinuity detection is separately covered by source-bound CPU tests. It does not reinterpret an immutable fixed-point projectile as following a teleported caster.

`runtime-test.json` and `runtime-capture.json` are factual evidence/index artifacts. They contain real WebM/PNG references, cleanup observations, per-layer correspondence, exact source hashes and environment data. They are not a native approval envelope. The root integration must bind current installed runtime source paths, fresh native build/model/package identities and actual performance evidence before invoking native receiving validation. Human acceptance and promotion remain separate. Failed runs and earlier source identities are retained.

The common performance runner compares exact parent445 production modules with current production modules on identical state-hashed FX workloads. It keeps first load/compile separate from steady and two-actor-plus-ambient peak frames. The model performance runner records five absolute candidate runs because no parent v2 scheduler existed. Both report CPU submission and synchronized wall measurements, not pure GPU timing or MAUI/device acceptance.
