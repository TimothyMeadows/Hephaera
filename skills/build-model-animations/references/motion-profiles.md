# Choose and prepare a motion profile

Skinned subjects need a real rest/bind pose, fitted skeleton, normalized weights, stable root and deformation-ready geometry. Inspect shoulders/hips/joints and equipment at extremes. A generated display mesh with fused limbs, clothing or missing hidden surfaces may need modeling repair or an approved neutral-pose production version before motion authoring. Declared landmarks are artist inputs; a template name is not proof of a correctly fitted rig.

Articulated mechanical assets need independent moving parts and real hierarchy/pivots. Establish wheels, steering, suspension, propellers, doors and control surfaces only when present and requested. Separate clip-driven and continuous-parameter transform ownership. Missing independent geometry blocks the affected articulation; metadata cannot create a movable wheel inside a fused hull.

Reviewed SCHEMATIC_TO_MODEL packages use the explicit preserve-only `mechanical-assembly` profile, including assemblies with zero flexible rigs. Initialize with the exact `bubo-mechanical-assembly-handoff/v1` and rest GLB. Preserve local frames, independent repeated instances, pivots, joint/interface metadata, any owned flexible rigs and approved numerical tolerances. The sealed inventory and current source-state fence must remain unchanged. Use `rig.mode: preserve`; new rigs, retargeting, accidental skins and component/hierarchy substitutions fail. Existing skinned/articulated/rigid profiles retain their restrictions. Read the pinned `runtime/bubo/resources/schematic-to-model/EXPORT.md` for the handoff contract rather than inventing a second schema.

Diagnostic clips prove finite sampled articulation; they are separate from requested production animation and its approvals. Symmetric wheels or shafts may look unchanged in a frame, and closed shells can hide fastener travel. Review actual channels and the bound editable/portable assembly from appropriate inspection views. Receiving preserves technical ancestry and grants no human model acceptance, approved motion set or engine/runtime acceptance.

Rigid assets need stable root/coordinates/anchors and any local response curves, without artificial skeletons. Ship travel is controller-owned; speed/acceleration can drive banking, thruster response and presentation. Mounted characters and composite vehicles have explicit component ownership rather than an assumed universal humanoid rig.

Define the game's actual motion set. A humanoid may need idle/run, starts/stops/turns, jump takeoff/airborne/fall/landing, swimming entry/idle/movement/exit and death entry/settle. No universal attack or combat-collider requirement applies to every profile. Custom anatomy and creatures need explicit recipes and review.

## State motion intent before authoring

Before `author` or `retarget`, write a short brief in the existing task notes alongside the recipe. Share common information across the motion set and record per-clip differences. This is review context, not an additional manifest or new recipe fields.

Capture the clip's role, duration, intended camera/scale, actual source/target rig or part identities and supported root-motion policy. Describe its support/contact phases and partners, travel/turn/reach, equipment clearance, important silhouettes and transition entry/exit expectations. Reference actual presentation markers where applicable. Choose supported numerical limits and manual review criteria before inspecting the result; record intentional holds, exaggeration or sliding so review preserves the selected style.

Adapt the brief to the subject: a landing distinguishes airborne and planted intervals; a vehicle describes pivots, wheel/door travel and transform ownership; a mechanical assembly preserves separate instances and any owned flexible rigs. Floating, flying and swimming subjects need their requested motion and attachments reviewed without invented grounded-foot requirements. A preserve-only assembly still permits no new rig or retargeting.

Use [contact evidence and complete-motion review](review-and-delivery.md#contact-evidence-and-coverage) to distinguish the intended behavior from what was actually checked. If required intent or a threshold is unresolved, retain that gap before production rather than choosing a passing limit after seeing the result.

Preserve model and per-clip rights independently. Retarget only declared compatible source motion with explicit source/target mapping, rest-axis correction, root translation policy and target rig identity. Do not infer commercial clearance from a tool's source-code license. The native baseline uses local authored and cleared motion inputs, with no external provider default or vendor skeleton preset.
