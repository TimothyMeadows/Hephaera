'use strict';
const f = require('./files.cjs');
const REPOSITORY = 'https://github.com/TimothyMeadows/Hephaera.git';
function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?$/.test(manifest.version || '') || manifest.repository !== REPOSITORY || manifest.tag !== manifest.version || !/^[a-f0-9]{40}$/.test(manifest.revision || '') || !/^[a-f0-9]{40}$/.test(manifest.tree || '') || typeof manifest.sourceDirty !== 'boolean') f.fail('Invalid installer release identity.');
  const b = manifest.bubo;
  if (!b || b.schemaVersion !== 1 || b.path !== 'runtime/bubo' || b.repository !== 'https://github.com/TimothyMeadows/Bubo.git' || !/^[a-f0-9]{40}$/.test(b.revision || '') || b.apiVersion !== 2 || !/^[a-f0-9]{64}$/.test(b.resourceCatalogSha256 || '') || b.buildReceipt !== 'artifacts/bubo/build-info.json') f.fail('Invalid recorded Bubo identity.');
  if (!manifest.coreFiles || Array.isArray(manifest.coreFiles) || !Object.keys(manifest.coreFiles).length) f.fail('Missing installer core inventory.');
  for (const [name, expected] of Object.entries(manifest.coreFiles)) {
    if (!/^[A-Za-z0-9_/-]+\.cjs$/.test(name) || name.includes('..') || !/^[a-f0-9]{64}$/.test(expected)) f.fail('Invalid core inventory entry.');
  }
  return manifest;
}
function verifyManifest(manifest, directory) {
  validateManifest(manifest);
  for (const [name, expected] of Object.entries(manifest.coreFiles)) {
    const file = f.safe(directory, name);
    if (!f.fs.existsSync(file) || !f.fs.statSync(file).isFile() || f.hash(file) !== expected) f.fail('Installer core changed: ' + name);
  }
  for (const name of Object.keys(f.inventory(directory))) if (name !== 'release-manifest.json' && !Object.hasOwn(manifest.coreFiles, name)) f.fail('Unrecorded installer core file: ' + name);
  return { version: manifest.version, revision: manifest.revision, manifestSha256: f.digest(manifest), coreVerified: true, sourceDirty: manifest.sourceDirty };
}
module.exports = { verifyManifest, validateManifest, manifestDigest: f.digest, REPOSITORY };
