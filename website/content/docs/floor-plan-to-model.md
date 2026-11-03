# Build a building from floor plans

Use `FLOOR_PLAN_TO_MODEL` when you want to design a building floor by floor, check the complete design, then turn it into a detailed model. It supports straight and angled walls, multiple storeys and courtyards. Rooms stay empty so you can furnish and use them later in your game.

**Availability:** this feature is in the newer `main` source checkout. The published `5.1.0-rc.1` packages predate it. Until a later release includes it, use the documented [advanced manual installation](install.md#advanced-manual-fallback) for a new installation. Keep an existing package-managed checkout under its normal update and recovery workflow.

## Describe the building you need

Start with the building's purpose, size, floor count and architectural style. Explain how people or players should move through it, and agree on room sizes, clearances, materials and detail limits before modeling.

For example:

```text
Use the floor-plan-to-model pipeline for a two-storey stone lodge with a small open courtyard. Follow this project's STYLE.md. Start with the room list, dimensions, stairs and player clearances, and agree on the detail and output budgets with me.

Show every floor, the roof, exterior elevations and stair sections together. Wait for my approval of the complete design before modeling. Keep rooms empty and deliver an editable model package without adding it to the game.
```

The agent records the dimensions in a structured plan and keeps the same room, wall, opening and stair identities across drawings and models. Reference pictures can guide appearance; they do not supply reliable dimensions automatically. You can use the [reviewed examples](https://github.com/TimothyMeadows/Hephaera/tree/main/examples/floor-plan-to-model) as starting points rather than inventing a new file format.

Selecting this pipeline for one task leaves your project's default visual workflow unchanged. New style contracts still default to `PROOF_TO_MODEL`. Your engine and the separate audio, music and voice workflows also keep their existing choices.

## Approve the whole building

You can revise individual floors while designing. Before construction starts, review one complete architectural package:

- Every dimensioned floor plan, including room sizes, wall thicknesses, doors and windows.
- The roof plan and exterior elevations.
- Sections that show floor heights, stairs, landings and other vertical connections.
- The agreed circulation, player clearances, materials and detail limits.

Ask for changes while it is still a plan. Your approval binds the exact complete package. If a floor, opening, roof or other plan detail changes later, the affected approval and models need a new version and fresh review. Approving one floor does not approve the remaining building.

## Check the tools, then build

Planning, drawing previews and dimensional validation work without Blender. Construction, export and model review need the explicitly built pinned Bubo runtime and an existing Blender 4.5 LTS installation. Current bounded native execution requires supported 64-bit Windows. The prerequisite check reports what is missing; selecting the pipeline does not install it.

The agent also records your source rights and the agreed limits for runtime, memory, logs and outputs. Read `MEDIA.md` only if you separately choose to generate reference images. Ordinary dimension-driven building work needs no image-generation provider or model download.

After approval, Bubo constructs the detailed architecture: floors and ceilings, shared walls, door and window assemblies, stairs, landings, railings, roof, facades, materials and trim. Detail must preserve the dimensions and openings you approved.

## Review the exported model

The result is a package with editable Blender source, a visual GLB, a separate collision GLB, semantic metadata, the structured plan and approved drawings. Those files remain in staging outside the game's asset folders.

Review every floor, the exterior, roof and sections through stairs. Check that openings still line up, door pivots are in the right places, materials are assigned and collision geometry preserves entrances, rooms and stairwells. Independent imports compare the exports with the approved design. Technical checks, independent review and your human model acceptance are recorded separately.

Measured geometry and clearances help prepare the building for traversal. Actual movement, navigation and collision behavior still need testing in your chosen engine. Importing the package into the game is a separate integration task.

## Pick up work or make a revision

Ask the agent for the current status and the exact step that failed. Keep the task evidence, staged versions and previous attempts so the next session can continue. Do not delete `.hephaera/.cache` to force a retry.

A changed plan, style, rights record or budget needs a new version with its parent recorded. The same applies when the native runtime changes. The agent refreshes the affected checks and approvals rather than treating an earlier pass as approval of new files.

The first release covers unfurnished architecture. Curved forms, automatic CAD or scanned-plan conversion, furnishings, interaction systems and gameplay remain separate work. See the [floor-plan reference](https://github.com/TimothyMeadows/Hephaera/wiki/Floor-Plan-to-Model) for commands, contracts, review records and recovery details, or return to [art and assets](art-and-assets.md) to choose another workflow.
