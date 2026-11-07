# Sheet and layered-art content review

## Establish what was delivered

Bind source/export identities, intended row/cell/facing/action mapping and explicit frame order to the review. Inspect each requested item against its declared role; dimensions and a populated grid do not prove distinct poses, correct facings or complete action coverage. Preserve deliberate holds and repeated frames when they satisfy the action contract.

`inspect-animation-sheet-folder.sh` reads PNG headers, grid divisibility and alpha-capable color types. It does not decode transparency, recognize feet, determine frame order or certify playback. A header pass leaves those claims unverified until appropriate content evidence exists.

## Review content in context

- Compare a declared semantic anchor, such as a planted foot or mounting point, across relevant frames. Keep occupied bounds and motion margins separate: a swinging tool can change the alpha box while the contact stays correct. Do not recenter every frame by its bounds or infer contact from the box center.
- Inspect silhouettes, cell edges and required motion extents for clipping at delivered scale. Confirm intended handedness, markings and attachments in every facing before permitting mirroring; a flip can change an approved asymmetric design.
- Verify actual transparency through available decoded-pixel or target inspection, including internal transparent regions. Review edges on neutral, dark and light backgrounds at intended scale. An alpha-capable header or painted checkerboard cannot prove useful transparency; missing decoded/target evidence remains unknown. Preserve intended translucency, glow and tails rather than rejecting all soft alpha.
- Watch the complete ordered action at normal playback speed and inspect relevant loop/transition boundaries. Pixel differences and endpoint similarity can identify review windows, but zero difference can also mean a frozen sequence. They do not prove meaningful movement, correct beats or a seamless cycle.
- For tiles, assemble representative neighbors, transitions, corners and tall props using the declared grid and anchors. Distinguish a ground footprint, an editable region and the complete sprite silhouette; clipping to a ground mask cannot repair a wrong projection or missing crown.
- For parallax, inspect the actual ordered planes at the declared camera-offset range. Check exposed scenery, repeated objects, edge halos, layer joins and sufficient image bleed; an isolated layer thumbnail cannot establish the moving stack.

Use existing local assets, licensed frames or owned Blender renders through the selected workflow. Bubo already supports bounded decoded RGBA, explicit ordering, padding/extrusion and alpha checks for its typed VFX preparation profiles. Reuse those operations only within their admitted scope; they are not a general character-sprite analyzer. Loop quality and semantic placement still need applicable evidence. Unavailable inspection or playback is a gap, not permission to install a decoder, upload assets or change pipeline.

## Retain review and repair boundaries

Record the frame/cell, expected and observed property, evidence, verdict and next owner. Keep numeric diagnostics, visual judgment and unavailable evidence distinct. Honor existing attempt allowances. Cropping, key-color removal, palette conversion, realignment, mirroring and loop trimming change content; do not perform them as silent validation fixes. Authorized repairs preserve original bytes, actual ancestry and refreshed affected reviews, including whole-set approval where required.

Carry the current content evidence and unresolved target checks into `prepare-game-art-handoff`. A clean atlas, attractive contact sheet or accepted authoring preview grants no engine/gameplay or runtime promotion acceptance.
