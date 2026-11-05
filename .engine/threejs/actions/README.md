# Three.js action v2 presentation

`action-v2.mjs` exports `validateActionV2Package`, `createThreeActionScene` and `DEFAULT_ACTION_SCENE_BUDGETS`. These original modules consume the native action v2 export supplied by the pinned Bubo dependency. They contain no loader, compiler, frame loop, gameplay controller or promotion implementation. See [MODEL_TO_ACTION](../../../docs/MODEL_TO_ACTION.md) for the production and evidence boundary.

The fixed bridge uses the actual host-locked Three r182, Quarks 0.17.1/core 0.17.1 Scene and production VFX service. It borrows that service's existing owner; it creates no BatchedRenderer or composer. Keep v1 packages on the unchanged [native v1 player](../../../runtime/bubo/resources/model-to-action/engines/threejs-action.mjs).

## Exact source-export admission

Obtain a fresh packet from `commands/lib/action-vfx-runtime-evidence.cjs.admit({root,manifest,mode})` in the trusted host. `mode` is explicitly `review` or `runtime`; `nativeAdmission.sourceKind` is `native-source-export`. Both modes execute the real read-only native validation operation against the current source export. Runtime mode additionally requires the current native action, independent and human runtime approvals. It grants no promotion authority. A promoted/rebound destination package has no admission verifier in this bridge.

The browser asset owner receives actual `Uint8Array` bytes and supplies decoded resource bindings:

```javascript
const packet = {
  nativeAdmission, packageBytes, modelBytes, admissionReceipt,
  effectSources: rawSources.map(source => ({
    ...source,
    bindings: decodedBindingsBySource.get(source.id)
  }))
};
const handle = actions.admit(packet);
```

Each raw source contains `id`, `packageBytes`, `profileBytes`, `resourceBytes: [{id,bytes}]` and `correspondenceBytes: [{resourceId,bytes}]`. Bindings follow the existing [production VFX contract](../../../docs/THREEJS_VFX.md): actual bounded DataTexture/static geometry plus its exact native resource and canonical decoded-correspondence identities. The source packet contains no implicit decoder. Load the actor GLB and animations from the exact admitted `modelBytes` through the host's trusted loader.

`validateActionV2Package(packet, engineSelection)` provides standalone data/byte preflight. An optional explicit `packageSha256` must match `nativeAdmission.packageSha256`; `admissionReceipt` is optional local metadata. Every package, model, profile, raw resource and canonical correspondence report is checked against its exact referenced bytes. Full current engine identities must agree. Native closure fingerprints, private source review, rights and acceptance algorithms remain native-owned. A caller-created admission label is not authenticated native or human evidence.

Duplicate package admission fails; reuse the returned Scene-local handle. Admission and actor registration are unavailable during an update. Release a package only after disposing its actors. Packages/profiles and borrowed resource bindings are never edited to implement action overrides.

## Scene and actor API

```javascript
const actions = createThreeActionScene({
  THREE, scene, vfxRuntime: effects, engineSelection,
  deltaPolicy: {
    exceptionalDelta: 'reject', maxDeltaSeconds: 1,
    maxSubstepSeconds: 0.1, hidden: 'pause',
    resume: 'discard-backlog'
  },
  onTrace(event) { captureTrace(event); }
});
const actor = actions.createActor({
  id: 'caster-1', visualRoot, movementRoot, animations,
  package: actions.admit(packet),
  rigOwnership: {
    acquire(request) { return animationOwner.acquire(request); },
    release(lease) { animationOwner.release(lease); }
  },
  onEvent(event) { captureActorEvent(event); }
});
actor.start(actionId, {
  targets: {rehearsalPoint: [4, 1, 0]}, outcomeMode: 'rehearsal'
});

// Once per host frame, after authoritative movement/inputs are current:
actions.update(deltaSeconds);
// The existing renderer/composer owner performs its usual one final render.
```

The example ports are supplied by the host; this module does not create an animation arbiter, evidence collector or render owner. `rigOwnership` is optional only when the host has otherwise excluded external mixer writes. Its synchronous `acquire({actor,generation,visualRoot})` must return a non-null lease and `release(lease)` returns that ownership. Internal root/bone leases reject overlapping action owners. Use skeleton-aware actor copies with independently owned bones; source clips, model geometry, textures and materials stay borrowed.

| Owner | Operations |
| --- | --- |
| Scene | `admit`, `releasePackage`, `createActor`, `update(seconds)`, `suspend(reason)`, `resume`, `reset`, `stats`, `dispose` |
| Actor | `start` (`play` alias), `pause`, `resume`, `cancel`, `reset`, `setEndpoint`, `presentOutcome`, `stats`, `dispose` |

`movementRoot` defaults to `visualRoot`; a separate authoritative root is recommended. Actual composite clips, actual exported anchors and in-place root/ancestor channels are required. Only owned-node direct transform/morph channels are accepted. An explicit bone accessor must resolve through the actual owned SkinnedMesh skeleton to an owned bone. Accepted channels are internally rewritten to that node's UUID; arbitrary object accessors and indexed properties are rejected before mixer allocation. Playback copies admitted Float32 channels and checks borrowed source samples and material/texture state for drift. Unsupported custom interpolants, including glTF cubic-spline tracks, fail instead of becoming linear. Native composition already requires reviewed LINEAR/STEP source clips. The adapter accepts the known Three discrete/linear/smooth track implementations, without custom interpolant callbacks.

The receiving owner also snapshots decoded model attributes, indices, morph and skin buffers, static bind/inverse matrices and node/geometry/skeleton bindings. Identity, layout, version and exact byte drift retire the affected generation; live animated transforms/morph values and renderer-derived bone matrices/attached-skin inverse values remain live. The source loader is still host-owned; this guard is not another GLTF parser. Instanced/batched actor models require a separately supported receiving profile. The Scene's `maxDecodedModelBytes` bounds copied decoded buffer/bind-matrix snapshots across actors (64 MiB default, at most 256 MiB); node/depth/attribute inventories have separate fixed bounds. Their comparison/metadata work participates in interval preflight. Disposal releases copied snapshots without disposing borrowed assets. Include this CPU comparison cost in actual model performance measurements.

At motion end, the final delivered pose is saved, mixer bindings are stopped/uncached, that pose is reapplied under the rig lease, and ownership is released. Tails never write the rig. An actor's next start hard-retires its previous generation, including any tail. Cancellation, reset and disposal retire owned handles and invalidate stale callbacks. They do not restore or dispose caller assets. Scene disposal returns clock ownership and preserves unrelated ambient leases; the host still owns global pause state and final asset/service teardown.

Scene disposal closes admission and actor commands before invoking any synchronous release callback. Recursive disposal is idempotent; callbacks cannot register or restart an escaping generation. All old actors, copied snapshots, owned handles and packages are cleaned up, and clock ownership is released in a final cleanup path before any originating release error is reported. Internal teardown still runs when the current update's mutation allowance has already been consumed.

## One clock and exact boundaries

While the Scene scheduler holds its branded clock claim, direct `effects.update` and direct underlying owner updates fail. The scheduler advances actors, draining tails and unrelated ambient effects together. Every accepted subinterval `[a,b]` samples needed delivered poses/anchors/endpoints at `b`, advances previously active FX to `b` once, then applies ordered transitions. A new layer receives no time preceding its release; a stopping layer receives its final interval first. Absolute authored deadlines prevent accumulated subtraction from delaying a stop.

Equal-time transitions order by ASCII actor ID, then retirement, layer stop, cue end, step exit, marker, cue capture/start, layer start, step enter and motion end. Stable cue/layer/marker/step IDs break ties. Synchronous callbacks are followed by generation checks. Callback pause or replacement discards that actor's unused time from the current update; other actors and ambient effects continue. Callback exceptions retire the offending generation, let unrelated actors finish the accepted interval, then surface an `AggregateError`.

Actor pause affects only its handles. `follow-action` effects freeze their emission/tail clocks; an acquired `continue-on-scene` layer keeps its own Scene emission-stop and retirement deadlines even while actor motion pauses. New layers still start on the actor clock. `capture-world-on-stop` freezes the transform sampled at the actual stop; `follow-anchor` tails read the live anchor. Attached presentation retires safely when its actor/anchor leaves the required hierarchy.

The required delta policy selects exceptional-delta `reject`, `pause` or `cancel`, hidden-state `pause` or `cancel`, and `resume: 'discard-backlog'`. `suspend('hidden'|'exceptional-delta'|'host')` is a host-owned Scene operation. Resume validates hierarchy/transforms and requires fresh continuous endpoints. Never pass hidden wall-clock backlog as ordinary playback time.

`DEFAULT_ACTION_SCENE_BUDGETS` bounds actors/packages, union substeps/events/callbacks, work/mutations, aggregate endpoint updates and trace history. Static interval admission rejects an oversized interval before advancing time; callback mutations retain finite dynamic guards. The actual step maximum also respects the owner and all active production profile limits. Active and draining leases remain in the existing aggregate system/particle/history/vertex/index/draw/texture/buffer budgets. These are cooperative finite resource/work limits, not OS/GPU memory enforcement or cross-device determinism.

## Space, targets and outcomes

Compiled v2 placements are `anchor-follow`, `captured-world`, `fixed-target-projectile`, `fixed-target` and `beam`. Runtime coordinates are right-handed meters, +Y up and +Z forward. Local offsets compose with the actual anchor once; orientation is normalized xyzw and scale/parents must be positive uniform, without mirroring or shear. The delivered GLB already uses this basis: do not perform another source-basis conversion. Beam world width receives the combined anchor/cue scale once; its endpoint length remains the supplied world distance.

Fixed targets are copied at action start. Range is checked from the exact delivered cue release anchor, including its local offset. Off-grid cue times sample the actual exported composite clip; they do not recreate the original source animation between its baked samples. Projectiles follow the declared straight presentation path, without homing. Trails use their explicit bounded sample count and reset history at declared teleports/discontinuities.

For a continuous beam call `actor.setEndpoint({target,generation,timestamp,point})`. Timestamps use `actions.stats().time`, in presentation seconds; points are finite world coordinates. Inputs must be current-generation, non-future, strictly increasing and within declared per-target and aggregate rolling-second update rates. Sampling occurs at interval end before FX. Missing, stale, out-of-range or invalid inputs retire the affected presentation instead of inventing a target. A live sample normally precedes the next update, so choose its declared freshness window for the actual bounded update interval.

`outcomeMode` is required on every start:

- `rehearsal` plays the authored fixed-target impact at its rehearsed point. It declares no gameplay contact.
- `host-outcomes` suppresses automatic fixed-target impact cues. `actor.presentOutcome({generation,cue,position,normal,timestamp})` may request that generation's reviewed impact cue once, with a fresh non-future Scene timestamp and normalized world normal. The supplied world position sets the origin. Orientation is `surfaceFrame(+Y → normal) * authoredCueLocalOrientation`: the confirmed surface frame replaces anchor rotation and preserves the authored local rotation; combined positive uniform scale remains applied once. The actor must still be active/draining, the presentation window must have opened, and the complete authored layer offsets/durations/tails must fit its remaining action retirement envelope. There is no clipping, stretching or new lifetime allowance. Authors must include recovery/duration slack for later contact presentation. A refused or expired visual request does not invalidate the game's authoritative contact.

Overrides only reduce declared size, color or emission; trail history can only shrink within the admitted profile. Effects and visual arrival never determine targeting, collision, damage, costs, cooldowns or any authoritative outcome.

## Evidence

`onEvent` and `onTrace` receive immutable data. Semantic events include actor ID/generation/action time and Scene time; `fx-step` reports `{from,to,delta,sceneTime}` after the single FX update. `stats()` exposes immutable actor/effect ages, origins/targets, current positions, tail state, resources and bounded history. Callbacks must finish synchronously. They are technical observability, not authenticated acceptance or exactly-once gameplay commands.

Bind receiving evidence to current raw model/package/effect closure, runtime build, driver/module inputs, libraries, renderer, camera, capture settings and actual artifacts. Test real skinned and rigid exports, two actors plus ambient, exact release boundaries, normal drain, pause/cancel/reentrancy, targets, resource failures and teardown. CPU/library, actual WebGL, physical GPU, packaged MAUI and human visual/runtime evidence remain distinct; unavailable target evidence stays not-run.
