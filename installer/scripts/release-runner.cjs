#!/usr/bin/env node
'use strict';
// Reviewed workflow tools and frozen package source have separate identities.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { verifyReleaseSource, repository } = require('../lib/release.cjs');
const { input, publish } = require('../lib/publish.cjs');
const { publishAssets } = require('../lib/release-assets.cjs');
const TOOLS = path.resolve(__dirname, '../..');
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
function git(root, ...args) {
  return cp.execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','pipe'] }).trim();
}
async function runOperation(mode, directory, sourceRoot) {
  if (!['assets-check', 'publish', 'assets-publish'].includes(mode)) throw new Error('Unknown release operation.');
  const sourceSha = process.env.HEPHAERA_RELEASE_SOURCE_SHA, toolsSha = process.env.HEPHAERA_RELEASE_TOOLS_SHA;
  if (!sha(sourceSha) || !sha(toolsSha)) throw new Error('Exact source and workflow-tools revisions are required.');
  const rawReleaseId = process.env.HEPHAERA_RELEASE_ID;
  if (typeof rawReleaseId !== 'string' || !/^[1-9]\d*$/.test(rawReleaseId) || !Number.isSafeInteger(Number(rawReleaseId))) throw new Error('An exact approved draft release ID is required.');
  const releaseId = Number(rawReleaseId);
  if (process.env.GITHUB_REPOSITORY !== 'TimothyMeadows/Hephaera') throw new Error('Release repository differs.');
  if (git(TOOLS, 'rev-parse', 'HEAD') !== toolsSha || git(TOOLS, 'status', '--porcelain', '--untracked-files=normal')) throw new Error('Release tools must be their exact clean reviewed workflow revision.');
  if (!/^https:\/\/github\.com\/TimothyMeadows\/Hephaera(?:\.git)?\/?$/i.test(git(TOOLS, 'remote', 'get-url', 'origin'))) throw new Error('Release tools origin differs.');
  sourceRoot = fs.realpathSync(sourceRoot);
  const { directory: output, receipt } = input(directory);
  const expectedManifest = verifyReleaseSource(sourceRoot, receipt.version);
  if (expectedManifest.revision !== sourceSha) throw new Error('Selected package source differs from the approved revision.');
  const provenance = { schemaVersion: 1, repository, version: expectedManifest.version, sourceRevision: sourceSha, sourceTree: expectedManifest.tree, workflowToolsRevision: toolsSha, releaseId };
  const provenanceFile = path.join(output, 'release-orchestration.json');
  if (fs.existsSync(provenanceFile)) {
    if (fs.lstatSync(provenanceFile).isSymbolicLink() || JSON.stringify(JSON.parse(fs.readFileSync(provenanceFile, 'utf8'))) !== JSON.stringify(provenance)) throw new Error('Existing release orchestration identity differs.');
  } else fs.writeFileSync(provenanceFile, JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx' });
  // Never infer package identity from this newer tools checkout's HEAD.
  let result;
  if (mode === 'publish') {
    await publishAssets(output, { preflight: true, expectedManifest, expectedReleaseId: releaseId });
    result = await publish(output, { execute: true, expectedManifest });
  } else result = await publishAssets(output, { execute: mode === 'assets-publish', preflight: mode === 'assets-check', expectedManifest, expectedReleaseId: releaseId });
  return { ...result, sourceRevision: sourceSha, workflowToolsRevision: toolsSha };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[2] !== '--source-root') {
    console.error('Usage: node release-runner.cjs <assets-check|publish|assets-publish> ARTIFACT_DIRECTORY --source-root SOURCE_DIRECTORY');
    process.exitCode = 1;
  } else runOperation(args[0], args[1], args[3]).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { runOperation };
