# Hephaera 5.2.0

This stable release brings the new building, mechanical-model and reusable game-effect workflows into the versioned installer packages. Both installers select the same immutable Hephaera source and Bubo revision; setup runs the existing project scaffold automatically.

## New production workflows

- **FLOOR PLAN TO MODEL:** design a building floor by floor, approve its complete dimensioned architectural package, then construct detailed unfurnished interiors and exteriors. Keep editable Blender source, semantic identities and separate visual/collision exports. [Practical guide](https://hephaera.com/docs/floor-plan-to-model/).
- **SCHEMATIC TO MODEL:** approve dimensioned schematics, build parts independently and assemble vehicles, devices and vessels with separately addressable components. Validate supported joints, mechanisms and flexible components, and preserve articulation metadata and diagnostic motion. [Practical guide](https://hephaera.com/docs/schematic-to-model/).
- **Reusable VFX and MODEL TO ACTION v2:** prepare versioned effect packages, process bounded textures/flipbooks/atlases, and connect reviewed effects to action clips with stable source/target bindings. The Three.js bridge uses Quarks with explicit resource ownership, cleanup, accessibility alternatives and review captures. [Practical guide](https://hephaera.com/docs/game-effects-and-actions/) and [detailed reference](https://github.com/TimothyMeadows/Hephaera/wiki/VFX-and-Action-v2).

The default visual pipeline stays unchanged. AUDIO, MUSIC and VOICE remain independent domains that can be loaded alongside visual work. Existing action-v1 consumers keep their original contract.

## Installation and updates

GitHub Packages is the primary registry for this release:

- npm: `@timothymeadows/hephaera@5.2.0` at `https://npm.pkg.github.com`.
- NuGet tool: `Hephaera` version `5.2.0` at `https://nuget.pkg.github.com/TimothyMeadows/index.json`.

Both feeds require GitHub authentication. Use the matching release's setup ZIP, manifest and checksums; follow the [installation guide](INSTALLER.md) for a new project or an explicit managed update. Manual clone/submodule installation remains the advanced option. npmjs.com and NuGet.org distribution is deferred and is not part of this release rollout.

Updating installer tooling alone does not update a project's pinned baseline. Review the target version's `update --dry-run` before an explicit update, and preserve `.hephaera/.cache`, its approval history and recovery journals. A changed native revision requires a fresh verified Bubo build using an existing .NET 10 SDK.

## Verification and scope

The feature delivery exercised actual Blender construction/export/re-import, real Three.js WebGL rendering, action cancellation/resource ownership, lower-cost and steady-shape readability alternatives, and comparable performance runs. Independent review and human backend readability QA were recorded separately. Performance observations describe the measured test scenes; they are not device-wide frame-rate or whole-game guarantees.

The reviewed native dependency for this release is Bubo `a47896d730b32d00b165e61820060e7c73d1ec4a` (API 2). The installed gitlink, lock, build receipt and audited resources must agree; this note is not a second pin.

Three.js is the implemented reusable-VFX action bridge. Native-engine adapters, packaged-device QA, gameplay authority, human runtime acceptance and asset promotion remain separate. Mechanical assemblies retain their preserve-only animation handoff; action composition does not gain implicit mechanical-assembly support. No models, drivers, licensed tools or generated-media allowances are installed or granted by the package release.

The previous `5.1.0-rc.1` tag and package artifacts remain unchanged. Its full GitHub classification did not remove its SemVer prerelease suffix or add these features.
