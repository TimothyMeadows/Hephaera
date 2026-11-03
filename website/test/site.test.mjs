import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildSite, createRenderer, normalizeBase, validateNavigation, siteRoot, repoRoot } from '../scripts/build.mjs';
import { checkOutput, listFiles } from '../scripts/check-links.mjs';

const pages = JSON.parse(await fs.readFile(path.join(siteRoot, 'navigation.json'), 'utf8'));

test('root and project deployments resolve every generated link and anchor', async () => {
  for (const [name, base] of [['project', '/Hephaera/'], ['root', '/']]) {
    const output = path.join(siteRoot, '.test-output', name);
    await buildSite({ basePath: base, output });
    const result = await checkOutput(output, base);
    assert.equal(result.html, pages.length + 2);
    assert.ok(result.localLinks > 100);
    const search = JSON.parse(await fs.readFile(path.join(output, 'search-index.json'), 'utf8'));
    assert.equal(search.length, pages.length);
    for (const page of search) assert.ok(page.url.startsWith(`${base}docs/`));
    const floorPlan = search.find(page => page.url === `${base}docs/floor-plan-to-model/`);
    assert.equal(floorPlan?.title, 'Floor plans to buildings');
    assert.match(floorPlan.text, /FLOOR_PLAN_TO_MODEL/);
    const floorHtml = await fs.readFile(path.join(output, 'docs/floor-plan-to-model/index.html'), 'utf8');
    assert.ok(floorHtml.includes(`href="${base}docs/floor-plan-to-model/" aria-current="page"`));
    const landing = await fs.readFile(path.join(output, 'index.html'), 'utf8');
    assert.match(landing, /approved floor plans/);
  }
});

test('rendering escapes raw HTML, rejects script URLs and preserves code for copying', () => {
  const md = createRenderer(pages, '/Hephaera/');
  const html = md.render('# A heading\n\n## Same\n\n## Same\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n```bash\necho "hello & goodbye"\n```\n\n[Install](install.md#install)');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('id="same"') && html.includes('id="same-1"'));
  assert.ok(html.includes('hello &amp; goodbye'));
  assert.ok(html.includes('href="/Hephaera/docs/install/#install"'));
});

test('unrecognized content links and unsafe publication paths fail explicitly', async () => {
  const md = createRenderer(pages, '/Hephaera/');
  assert.throws(() => md.render('[private](../../.hephaera/.cache/SYSTEM_MEMORY.md)'), /Unknown local/);
  for (const base of ['//other.example', '/../', '/Hephaera/../../', 'https://other.example', '/one/two/']) assert.throws(() => normalizeBase(base));
  assert.throws(() => validateNavigation([{ file: '../../secret.md', slug: '', title: 'Bad', summary: '' }]));
  assert.throws(() => validateNavigation([pages[0], pages[0]]), /Duplicate/);
  await assert.rejects(buildSite({ output: path.join(repoRoot, '.hephaera', '.cache') }), /Output must remain/);
});

test('publication output is deterministic and contains only the selected public files', async () => {
  const output = path.join(siteRoot, '.test-output', 'repeat');
  const snapshot = async () => {
    const files = (await listFiles(output)).sort();
    return Promise.all(files.map(async file => [path.relative(output, file), crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')]));
  };
  await buildSite({ output });
  const first = await snapshot();
  await buildSite({ output });
  assert.deepEqual(await snapshot(), first);
  const expected = ['.nojekyll', '404.html', 'index.html', 'search-index.json', 'assets/owl.png', 'assets/site.css', 'assets/site.js', ...pages.map(p => path.posix.join('docs', p.slug, 'index.html'))].sort();
  assert.deepEqual(first.map(([name]) => name.split(path.sep).join('/')).sort(), expected);
});
