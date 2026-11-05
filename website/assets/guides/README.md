# Guide illustrations

These images explain Hephaera's architectural and mechanical workflows. They follow the project's shared charcoal, steel and gold branding. Read each image's caption for its purpose and limits.

The floor-plan and schematic SVGs are original explanatory diagrams. They help readers understand a design package and separate physical parts; they are not approved construction drawings, native Blender renders or proof that a proposed example has passed validation.

`qa/device-rest.png` and `qa/device-open.png` are unedited 512 × 512 PNGs from an actual Blender review of Bubo's minimal synthetic electronic-device fixture. They show the closed pose and a sampled open-lid pose. The fixture has six part definitions and seven physical occurrences. Internal wiring and fasteners are not visible clearly in this camera view; these two frames do not establish their quality, complete travel, finished animation or human/runtime acceptance.

The fixture is [`resources/schematic-to-model/examples-v2/device.json`](https://github.com/TimothyMeadows/Bubo/blob/7ab99a9f12761095e5a3ee5cfb37d2a679b026a7/resources/schematic-to-model/examples-v2/device.json), rendered by the reviewed Bubo revision `7ab99a9f12761095e5a3ee5cfb37d2a679b026a7`. These are project-authored QA outputs, with no private references, recordings or third-party image inputs. The source and these project illustrations use the repository's MIT license, copyright Timothy D Meadows II.

`vfx/caster-trail.png` and `vfx/rigid-beam.png` are byte-identical copies of the original 960 × 540 engineering captures in `docs/images/model-to-action/`. They use reviewed native exports from Bubo `a47896d730b32d00b165e61820060e7c73d1ec4a` and the Three.js/Quarks shared owner with LDR postprocessing. Their recorded target is Windows x64, Edge 156.0.4314.58 and WebGL2 through ANGLE/Intel Direct3D11; this one observed desktop configuration supplies no device-class or MAUI certification. The first is a synthetic skinned caster; the second is a rigid fixture with an explicit supplied beam endpoint. Both are project-authored QA outputs with no private references or third-party media. They illustrate selected moments, not finished art, complete motion review, accessibility acceptance, human runtime acceptance or promotion. The project illustrations use this repository's MIT license, copyright Timothy D Meadows II.

| VFX image | SHA-256 |
| --- | --- |
| `caster-trail.png` | `fd8c27bc2385a48164fa55714c0c2ffc6544140a09f1e4951eeaa640050a387b` |
| `rigid-beam.png` | `0fab7f0d306f6b3babd12f01cc5f607aeda59a5a3018e29aa76793e527504945` |

`vfx/caster-target-diamond.png` is an unedited 960 by 540 engineering capture of the original steady-shape alternative's target phase at 1.8 seconds. It comes from source `020c5c9dee583c184bc0d2634498b417247c8499` and the same actual native revision, desktop renderer and pinned libraries described above. The selected asset is `caster-static-cues/revision-1`. Independent review confirmed the filled diamond on neutral, dark and light backgrounds without changing the camera. This frame illustrates shape/plane choice, not complete playback, human accessibility/runtime acceptance or promotion. Its SHA-256 is `61b36b927ab77953c9be70d2b3cc3d212e8b75983a3a785e52f16db867b5ddf8`. It is project-authored output under the same MIT license, with no private or third-party image inputs.

Only images referenced by guide Markdown enter the Pages output. This provenance note and local task evidence are not copied into the site automatically.
