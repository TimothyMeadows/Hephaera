# Build an object from schematics

Use `SCHEMATIC_TO_MODEL` when an object needs real parts: wheels that turn separately, a lid that opens around its hinge, screws with their own geometry, or wires that follow moving components. You design the complete object first, then build its parts and put them together. The delivered model looks assembled while its components remain separately addressable.

**Availability:** this feature is in newer `main` source. The published `5.1.0-rc.1` packages predate it. Use a baseline revision containing this workflow and its reviewed Bubo pin; a later package release must include those changes before that installer version can supply them. A source merge does not update version-pinned packages. For a new source installation, the [advanced manual option](install.md#advanced-manual-fallback) comes after packages; an existing managed installation keeps its normal update and recovery workflow.

## Describe what the object should contain

Explain what it does, its size and materials, which parts move, and what should be visible when you look inside. Agree on the amount of detail, tolerances and output limits before modeling.

For example:

```text
Use the schematic-to-model pipeline for a small wheeled inspection rover. Follow this project's STYLE.md. Include separate wheels, axles, a hinged service panel, fasteners and internal power wiring.

Start with dimensions, the component list, connections and moving parts. Tell me which internal systems are simplified or unresolved. Show the whole schematic package for approval before building parts. Deliver an editable assembly and portable models outside the game's asset folders.
```

Reference pictures can guide the shape and appearance, but the dimensions must be authored explicitly. This workflow does not automatically convert a photograph, scan or CAD drawing into a model.

A task-specific selection leaves your project's default visual pipeline unchanged. It also preserves the engine and the separate audio, music and voice workflows. Use [floor plans to buildings](floor-plan-to-model.md) for architecture.

## Approve the complete design

The agent keeps one structured design as the source of truth. Before construction, review the complete package together:

- Dimensioned views and sections that reveal the internal systems.
- An exploded view and a parts list showing every physical component.
- Mechanical connections, electrical terminals and wire or hose routes.
- Moving-part limits, clearances, materials, detail choices and any agreed simplifications.

Ask for changes while the object is still a design. Approval binds the exact whole package. Approving a side view or a few parts does not approve the complete assembly. A later design change needs a new version and refreshed affected reviews.

## Build the parts, then assemble them

Planning, validation and schematic previews work without Blender. Native construction needs the explicitly built pinned Bubo runtime and an existing Blender 4.5 LTS installation. Current bounded schematic production requires supported 64-bit Windows. The prerequisite check reports missing tools or limits; selection does not install anything.

The agent records source rights and finite time, memory, log and output budgets. Ordinary procedural work needs no media provider or model download. Generating reference images remains a separate request.

Each part definition is built and checked before assembly. Four identical wheels can share geometry, but each actual wheel keeps its own object, identity and movement. A missing screw or fused moving component cannot be hidden by calling the whole object complete.

After assembly, diagnostic motion checks the declared joints and mechanisms. Wires, hoses, springs and belts keep separate geometry and their own deformation rigs. These checks cover the approved sampled movement and clearances; they do not establish manufacturing safety, electrical behavior or general physics simulation.

## Inspect the delivered model

The package includes editable Blender source, an assembled rest GLB, the approved schematics, a hierarchical parts list, component metadata and provenance. A separate diagnostic-motion package shows articulation. Those diagnostic clips are readiness evidence, not finished game animations.

Review the exterior, internal sections, exploded parts and complete diagnostic movement. Check that parts are present, materials and pivots are right, openings remain usable, and flexible components stay attached. Independent re-import checks compare the actual portable geometry and motion with the approved construction.

Technical verification, independent review and your human model acceptance are separate records. Automated fixture checks do not supply that human judgment. Everything remains in staging; importing or promoting it into a game is a separate step.

## Add animation or revise the design

For later animation, use the current `mechanical-assembly` handoff. It preserves the reviewed rigid parts and flexible rigs. Finished clips still need their own motion review and eventual runtime acceptance in the selected engine.

Ask for status before continuing a failed job. Keep previous attempts, source records and `.hephaera/.cache`. A changed design, style, rights record, budget, tool or runtime needs explicit version ancestry and refreshed affected evidence. Do not reuse an old handoff after its source state changes.

The [example walkthrough](https://github.com/TimothyMeadows/Hephaera/tree/main/examples/schematic-to-model) covers a wheeled platform, opening device and curved-hull vessel. These are scoped engineering examples, not complete commercial products or human-approved production assets. Read the [technical reference](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/SCHEMATIC_TO_MODEL.md) and [detailed wiki source](https://github.com/TimothyMeadows/Hephaera/blob/main/wiki/Schematic-to-Model.md) for commands and records. The new wiki page is maintained in source; this guide does not imply it has been published to GitHub's separate wiki.
