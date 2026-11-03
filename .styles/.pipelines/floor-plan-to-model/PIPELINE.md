# FLOOR_PLAN_TO_MODEL Art Pipeline

## Intent

Create detailed, unfurnished building architecture from an explicit dimensional specification. Design each floor, then approve the complete architectural package before construction. Straight and angled walls, multi-storey buildings and courtyards are supported. The existing default art pipeline remains `PROOF_TO_MODEL`.

Use [`build-floor-plan-models`](../../../skills/build-floor-plan-models/SKILL.md) and [`floor-plan-to-model.sh`](../../../commands/floor-plan-to-model.sh). Hephaera owns selection, rights, policy and reviews. The exact pinned Bubo runtime owns dimensional validation, vector drawings, construction, exports and verification.

## Inputs

- Read the current `STYLE.md` and resolve `FLOOR_PLAN_TO_MODEL`. A current-prompt selection is task-scoped and does not rewrite the style contract or select an engine or media backend.
- Capture purpose, floor count, dimensions, architectural style, materials, circulation, player-clearance envelope, detail profile, tolerances and finite output/process budgets. These are design choices, not hidden construction defaults.
- Author a versioned structured building plan with stable floor, room, wall, opening, roof and stair identities in shared metre coordinates. Use the pinned [design contract](../../../runtime/bubo/resources/floor-plan-to-model/README.md), [construction contract](../../../runtime/bubo/resources/floor-plan-to-model/CONSTRUCTION.md) and their schemas/examples. The construction-capable v2 plan is required for modeling.
- Record exact local plan/reference rights and finite native limits at initialization. Reference images may inform design, but they never establish dimensions automatically. Generated images require their separately selected `MEDIA.md` workflow and authorization.
- When external libraries are configured, inspect them before creating another model. Copy any selected asset into the project before use and preserve its rights and copy ancestry; the original library remains read-only.

## Production Rules

1. Initialize a new task-owned asset version with `init`. Preserve the original plan, current style and policy evidence. A revision creates a new version with `--parent-manifest`; never overwrite an approved design or rewrite its history.
2. Run `validate` and `preview`. Present every dimensioned floor plan, the roof plan, exterior elevations and all required sections, including vertical connections. Review wall thickness, openings, floor elevations, stair/slab connections, clearances and required-room connectivity.
3. Obtain the user's approval of that exact complete package and record the actual evidence with `record --kind whole-building-design`. Per-floor approval, a successful validator or a synthetic fixture decision does not approve the whole building. Any plan/package change invalidates affected approval and models.
4. Use `doctor` to inspect declared prerequisites. Select an existing compatible Blender explicitly for `build`, `export` and `review`; ordinary production never installs software. Native memory enforcement currently requires supported 64-bit Windows. Report unavailable hosts or tools explicitly; declared capability is not executable readiness.
5. Build detailed floors, ceilings, shared walls, doors/windows, stairs, landings, railings, roofs, facades, materials and trim while preserving approved dimensions. Use only Bubo's fixed, audited, hash-bound floor-plan Blender bundle on its declared repository-local working copies. This batch exception grants no arbitrary script/add-on execution and does not change standalone `BLENDER` connected-authoring policy.
6. Export with an explicit model author, then render the complete exported-model review. Require separate clean-process imports of visual and collision GLBs and compare their measured geometry, openings, hierarchy, pivots, semantic inventory and material assignments to the approved design. Read the pinned [export contract](../../../runtime/bubo/resources/floor-plan-to-model/EXPORT.md) for exact package and review identities.
7. Complete independent model review before separate human model acceptance. Record actual hash-bound evidence using `independent-model` and `human-model`; a technical pass or render cannot fabricate either decision. Keep current status, failed attempts, rejected reviews and interruption evidence.

## Output Contract

The sealed non-runtime package contains editable Blender source, visual GLB, separate collision GLB, the structured plan, semantic metadata, approved SVG drawings and provenance. Complete review views cover every floor, exterior elevations, roof and sections through vertical connections. Preserve per-floor hierarchy, semantic identities, door pivots and separate visual/collision representations. Do not replace rooms or stairwells with a whole-building convex collider or remesh away openings.

Measured clearance and geometry evidence describe traversal preparation. Actual engine collision, movement, navigation and target-device behavior require later selected-engine integration. This command does not copy assets into a game and has no promotion operation.

Rooms remain empty. Curved architecture, automatic CAD/raster conversion, furnishings, interaction/gameplay systems and engine adapters are deferred. Stop if the selected pipeline is unavailable or fails; never fall back to another pipeline silently.

## Acceptance Checks

- Validate the complete design and current whole-building approval before construction; reject conflicting dimensions, intersecting geometry, invalid connections, insufficient declared clearances and unreachable required rooms.
- Compare actual exported geometry with approved dimensions, floor alignment, openings, hierarchy, pivots and materials. Independently import visual and collision exports; metadata alone does not prove a geometric match.
- Review every floor, exterior elevation, roof and required section. Verify that collision proxies preserve entrances, rooms and stairwells, with declared door movement envelopes and measured clearances.
- Test source/review invalidation, semantic reproducibility, finite resource limits, cancellation, interrupted attempts and path confinement. Preserve failed attempts and separate independent review, human model acceptance and later engine testing.

## Role Fit

Use with architecture/environment design, `technical-3d-artist`, `blender-production-artist`, `art-director` and `qa-engineer` perspectives. The coordinating skill is engine-agnostic; engine owners handle any later runtime integration.
