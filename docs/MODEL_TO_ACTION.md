# MODEL_TO_ACTION

Compose reviewed clips into an ordered action, export its real animation, and connect reviewed effects to exact delivered anchors. MODEL_TO_ANIMATION owns the individual clips. MODEL_TO_ACTION remains a downstream workflow under the project's existing STYLE and ENGINE; it does not select another primary pipeline or become an ability/combat controller.

| Contract | Presentation path |
| --- | --- |
| `hephaera-action-package/v1` | Existing native Three.js sample, with `orb`, `particles` and `projectile` cues and its historical primitive backend/semantics |
| `hephaera-action-package/v2` | Native typed effect closure plus the shared Three.js/Quarks Scene scheduler |

V1 remains readable and executable through its original adapter. It is neither migrated nor relabeled as production Quarks. Historical evidence retains its original input/driver scope. The initial v2 bridge requires THREEJS and the fixed host-locked Quarks production profile; it does not certify another engine, WebGPU, custom shader, provider or decoder.

## Prepare and export

Follow [the production workflow](../.styles/.workflows/model-to-action/WORKFLOW.md) and [build-model-actions](../skills/build-model-actions/SKILL.md). Resolve paths, ENGINE and compatible skills first. Use a compatible reviewed skinned, articulated or rigid motion package, exact model/clip hashes, real anchors, source rights and human source selection. Mechanical-assembly actions remain unavailable. Source root motion, missing markers/anchors and unsupported interpolation require a reviewed correction, without fallback.

V2 recipes use `schemaVersion: 2` and exact effect source references. The pinned [native contracts and example](../runtime/bubo/resources/model-to-action/recipes/cast-vfx-v2.example.json) define the data. Use [VFX_ASSETS](VFX_ASSETS.md) for brief, rights, budgets, provisional/detail work, production review and canonical decoded-resource correspondence. Retain private rights/review/preparation ancestry and the original preparation context; copying a source into another action task cannot relabel its task, approvals or attempts.

Inspect the current complete effect closure before initialization/composition:

```bash
./.hephaera/commands/model-to-action.sh inspect-effects \
  --root /absolute/project --task ACTION_TASK --recipe inputs/action-v2.json
```

`inspect-effects` provides native source/profile/allocation facts and review subjects. Its `accepted: false` result does not grant production, human runtime or promotion acceptance. Continue through the native `init`, `inspect`, `compose`, `export`, `review`, `record` and `validate` operations under their actual command help. Existing fixed Blender scripts, build/policy checks, immutable attempts and resource limits remain in force. No operation here installs tools, generates media or expands rights.

The native export binds real composite clips, resolved marker/cue times, each layer's start/emission stop/final retirement, exact profile/resource/correspondence hashes and complete effect closure. Use that timeline directly; the engine adapter does not recompile source addresses. At an off-grid release, the runtime evaluates the delivered composite clip at that time. It cannot recover the original animation's subframe shape after baking.

## Admit the source export

The trusted Node host calls the thin helper:

```javascript
const {admit} = require('./.hephaera/commands/lib/action-vfx-runtime-evidence.cjs');
const sourceExport = await admit({
  root: resolvedProjectRoot, manifest: actionManifest, mode: 'review'
});
```

The helper runs actual native read-only validation and retains exact result/context/manifest references. It returns raw package/model/effect/profile/resource/canonical report bytes plus `nativeAdmission` and a durable local admission receipt. Runtime mode (`mode: 'runtime'`) additionally requires current native action, independent and human runtime approvals. Both modes admit only `sourceKind: 'native-source-export'`. Source-export package verification metadata can remain pending: the separate native promotion operation writes accepted metadata into its destination package. Do not fabricate that status in a source bundle.

A promoted/rebound destination bundle is not supported by this admission helper. The host does not implement another native verifier, closure fingerprint, copy or promotion algorithm. Mode flags and reference-shaped metadata do not authenticate a person or establish that native validation ran; use the actual helper and retain its current native evidence.

The selected-engine asset owner transfers actual bytes, decodes declared resources through trusted host loaders, and adds exact reviewed DataTexture/static-geometry bindings. It loads the actor and composite clips from those admitted model bytes. See [the runtime API and packet shape](../.engine/threejs/actions/README.md). There is no implicit network loader or decoder in the action runtime.

## Share the Scene clock

Create one `createThreeActionScene` with the existing Scene VFX service. Its branded claim prevents a second service/underlying-owner update. Update authoritative movement and supplied endpoints, call the action Scene scheduler once, then let the existing renderer/composer owner render once. Two actors and unrelated ambient effects share the same elapsed FX interval and aggregate resource/work limits.

For each accepted interval the scheduler evaluates actual poses/anchors/endpoints, advances previously active FX, then dispatches stable equal-time transitions. Newly created layers receive no earlier time; stopping layers receive their last interval before emission stops. Actor pause uses scoped handles. Callback pause/replacement discards only that actor's unused time; callback failure retires that generation while unrelated actors finish the accepted interval.

The host arbitrates external animation owners through synchronous rig acquire/release ports. Internal root/bone locks prevent overlapping action writes. Motion completion preserves the final delivered pose, stops/uncaches the mixer and releases rig ownership before finite tails drain. Captured tails freeze at actual stop; attached tails read the anchor. An acquired `continue-on-scene` layer keeps its own emission/retirement deadlines during actor pause. Cancellation, replacement, reset and disposal hard-retire the affected generation; borrowed model assets, clips, materials, textures, service, renderer and composer are never disposed by that actor.

Only validated owned transform/morph targets reach the mixer. Object/index accessor escapes are rejected; supported owned skeleton access is resolved to an exact node before playback. Bounded decoded-model snapshots check geometry/index/morph/skin bytes, static bind data and stable graph/skeleton identities while allowing legitimate animated transforms/influences and renderer-derived skin matrices. Scene-wide copied-byte and comparison-work budgets cover those guards; capture their cost in real model benchmarks. The host still loads the exact admitted GLB; this is not a second loader/parser.

Declare exceptional-delta, hidden and resume policy before playback. Static oversized updates reject before time advances; the scheduler never replays a hidden backlog or silently drops accepted FX time. Physical memory/GPU enforcement and actual target performance remain separate from these finite owned-resource/work checks.

## Targets and presentation outcomes

Every start explicitly selects `outcomeMode: 'rehearsal'` or `'host-outcomes'`. Fixed targets are immutable snapshots from action start. Release range and origin use the exact delivered anchor plus local transform, with right-handed meters/+Y up/+Z forward, normalized orientation and positive uniform scale. Do not apply the exporter basis conversion again. Declared trails reset at teleports/discontinuities.

Continuous beams require generation-bound, finite, monotonic, non-future Scene-time endpoint inputs within their declared age/range/rate policies. They sample at interval end before FX; invalid input retires affected presentation. Beam width applies combined anchor/cue scale once; supplied world endpoints own its length. No beam endpoint or visual projectile implies homing/target authority.

Rehearsal can display the authored impact at its fixed point. Host-outcomes mode suppresses automatic fixed-target impacts; the game may request a reviewed impact cue with current generation, position, normalized normal and fresh Scene timestamp. Each cue can be requested once, only while active/draining, after its presentation window opens and while its full authored duration/offsets/tail fits the remaining action envelope. A late request is refused instead of clipping/stretching the effect; author recovery slack when later contacts need presentation. Gameplay contact remains authoritative even when a visual request expires.

A confirmed impact uses the supplied position and `surfaceFrame(+Y → normal) * authoredCueLocalOrientation`, preserving authored local rotation after replacing anchor rotation with the confirmed surface frame. Combined positive uniform scale is applied once. Endpoint callbacks share the finite mutation budget; recursive invalid-input handlers propagate the originating budget/host error rather than overflowing the stack or hiding it in input validation.

Gameplay owns movement, target eligibility, collision, contacts, damage, resource costs, cooldowns and outcomes. A marker, visual arrival, clip completion or presentation callback manufactures none of them.

## Receiving evidence and native acceptance

Capture whole real skinned/rigid actions and exact boundaries, normal tails, two actors plus ambient, endpoint policies, pause/cancel/reentrancy, resource/capability failure and cleanup. Include actual camera/render settings, driver/module/library identities, model/effect/resource bytes and artifacts. Compare load, steady-state and peak cost with at least five comparable baseline/candidate pairs; retain failed runs and investigate median-stage regressions above 10%. Authored accessibility variants and physical GPU/packaged-device checks need their own evidence.

`commands/lib/action-vfx-runtime-evidence.cjs.bindReceiving` binds an existing actual receiving report and three distinct `runtime-test`, `runtime-capture` and `performance-profile` artifact references into the current task cache. It refreshes read-only native source admission and returns a `pending-native-review` envelope for the existing native runtime review path. It creates no review verdict, human acceptance, runtime dependency copy or promotion. Keep technical verification, independent review, human runtime acceptance and explicit native promotion separate.

Browser/software-renderer, physical GPU and MAUI Windows/Mac Catalyst/Android/iOS results have distinct scopes. Unavailable targets stay not-run. Full visual/performance/accessibility acceptance and public examples are separate from the receiving bridge; implementation tests never manufacture those decisions.
