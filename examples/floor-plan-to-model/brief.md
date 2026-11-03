# Example brief: two-storey hall

Create an unfurnished game-environment building using this project's existing `STYLE.md` and the `FLOOR_PLAN_TO_MODEL` pipeline for this task.

Use a 10 m by 8 m footprint on both storeys. Put the finished floors at 0 m and 3 m, with 2.8 m clear storey heights. Provide one empty hall on each level, an exterior entrance, a connected straight stair with landings, the explicit upper slab opening, railings, a roof and detailed door/window assemblies. Choose wall, floor, stair, roof, glazing and trim materials consistently with the project style.

Use a player envelope with 0.3 m radius, 1.8 m height, 0.22 m maximum step and 1.2 m minimum landing depth for this exercise. Declare opening sizes, structural/profile dimensions, tolerances, detail and finite geometry/output/process budgets in the structured source before approval. These values describe this exercise rather than a default for every game.

Design the floors individually, then show both dimensioned floor plans, the roof, all exterior elevations, the principal section and the stair section together. Wait for approval of that exact complete architectural package before modeling. A revision to either floor needs a fresh complete review.

Deliver editable Blender source, a visual GLB, separate collision geometry, semantic metadata, the approved drawings and provenance in non-runtime staging. Review all nine delivered model views and the independent imports. Keep independent model review and human model acceptance separate. Engine import, movement/interaction systems and asset promotion are later work.

The native `multi-storey` example is a small engineering starting point for this brief. It does not establish a human-approved design, a finished art-style treatment or target-engine behavior.
