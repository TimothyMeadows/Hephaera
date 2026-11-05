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

The WebGL runner captures semantic boundaries, after-boundary visibility, normal-speed complete playback and cleanup. Its pixel comparison renders the same pose with effects hidden, so a visible model cannot make absent effects pass. Nine-family construction coverage remains separate from individual artistic quality.

The common performance runner compares exact parent445 production modules with current production modules on identical state-hashed FX workloads. It keeps first load/compile separate from steady and two-actor-plus-ambient peak frames. The model performance runner records five absolute candidate runs because no parent v2 scheduler existed. Both report CPU submission and synchronized wall measurements, not pure GPU timing or MAUI/device acceptance.
