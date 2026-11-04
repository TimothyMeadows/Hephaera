import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { siteRoot } from '../scripts/build.mjs';
import { checkWiki, publishWiki } from '../scripts/wiki.mjs';

test('all detailed-reference pages and source anchors resolve locally', async () => {
  const result = await checkWiki();
  assert.equal(result.pages, 19);
  assert.ok(result.names.includes('Floor-Plan-to-Model.md'));
  assert.ok(result.names.includes('Schematic-to-Model.md'));
  assert.ok(result.links > 100);
});

test('wiki preparation is read-only and rejects a foreign publication origin', async () => {
  const folder = path.join(siteRoot, '.test-output', 'wiki-plan');
  await fs.mkdir(folder, { recursive: true });
  execFileSync('git', ['init', folder], { stdio: 'ignore' });
  execFileSync('git', ['-C', folder, 'config', 'remote.origin.url', 'https://github.com/TimothyMeadows/Hephaera.wiki.git']);
  const before = (await fs.readdir(folder)).sort();
  const plan = await publishWiki(folder);
  assert.equal(plan.execute, false);
  assert.equal(plan.preserveOtherPages, true);
  assert.equal(plan.files.length, 19);
  assert.ok(plan.files.includes('Floor-Plan-to-Model.md'));
  assert.ok(plan.files.includes('Schematic-to-Model.md'));
  assert.equal(typeof plan.sourceDirty, 'boolean');
  assert.equal(plan.sourceFiles.length, 19);
  assert.ok(plan.sourceFiles.every(file => /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.deepEqual((await fs.readdir(folder)).sort(), before);
  execFileSync('git', ['-C', folder, 'config', 'remote.origin.url', 'https://github.com/another-owner/unrelated.wiki.git']);
  await assert.rejects(publishWiki(folder), /expected HTTPS repository/);
  assert.deepEqual((await fs.readdir(folder)).sort(), before);
});
