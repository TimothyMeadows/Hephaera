import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildSite, createRenderer, guideImagePath, guideImageSize, loadGuideImages, normalizeBase, validateNavigation, siteRoot, repoRoot } from '../scripts/build.mjs';
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
    const schematic = search.find(page => page.url === `${base}docs/schematic-to-model/`);
    assert.equal(schematic?.title, 'Schematics to assembled models');
    assert.match(schematic.text, /SCHEMATIC_TO_MODEL/);
    assert.match(schematic.text, /mechanical-assembly/);
    const schematicHtml = await fs.readFile(path.join(output, 'docs/schematic-to-model/index.html'), 'utf8');
    assert.ok(schematicHtml.includes(`href="${base}docs/schematic-to-model/" aria-current="page"`));
    assert.ok(schematicHtml.includes('blob/main/wiki/Schematic-to-Model.md'));
    assert.ok(!schematicHtml.includes('/wiki/Schematic-to-Model"'));
    const landing = await fs.readFile(path.join(output, 'index.html'), 'utf8');
    assert.match(landing, /approved floor plans/);
    assert.match(landing, /schematics into models with separate moving parts/);
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
  const built = await buildSite({ output });
  const first = await snapshot();
  await buildSite({ output });
  assert.deepEqual(await snapshot(), first);
  const expected = ['.nojekyll', '404.html', 'index.html', 'search-index.json', 'assets/owl.png', 'assets/site.css', 'assets/site.js', ...built.images, ...pages.map(p => path.posix.join('docs', p.slug, 'index.html'))].sort();
  assert.deepEqual(first.map(([name]) => name.split(path.sep).join('/')).sort(), expected);
  for (const file of built.images) assert.deepEqual(await fs.readFile(path.join(output, file)), await fs.readFile(path.join(siteRoot, file)));
});

test('guide images and full-size links use the deployment base and retain accessible labels', async () => {
  const source = '[![Closed synthetic QA enclosure](../../assets/guides/qa/device-rest.png)](../../assets/guides/qa/device-rest.png)';
  const images = await loadGuideImages([source]);
  assert.equal(images.size, 1);
  for (const base of ['/', '/Hephaera/']) {
    const html = createRenderer(pages, base, images).render(source);
    assert.ok(html.includes(`href="${base}assets/guides/qa/device-rest.png"`));
    assert.ok(html.includes(`src="${base}assets/guides/qa/device-rest.png"`));
    assert.match(html, /alt="Closed synthetic QA enclosure"/);
    assert.match(html, /width="512" height="512" loading="lazy" decoding="async"/);
    assert.throws(() => createRenderer(pages, base, images).render('![](../../assets/guides/qa/device-rest.png)'), /descriptive alt/);
  }
});

test('guide image admission refuses traversal, external content, missing files and active SVG', async () => {
  for (const source of ['../../.hephaera/.cache/secret.png', '../../assets/guides/qa/../secret.png', '../../assets/guides/qa/%2e%2e.png', '../../assets/guides/qa/device-rest.png?x=1', 'https://example.com/track.png', 'data:image/png;base64,AAAA']) {
    assert.throws(() => guideImagePath(source), /Unknown guide image/);
    await assert.rejects(loadGuideImages([`![Example](${source})`]), /Unknown guide image/);
  }
  await assert.rejects(loadGuideImages(['![Missing](../../assets/guides/qa/absent-example.png)']), /ENOENT/);
  const svg = body => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80">${body}</svg>`);
  assert.deepEqual(guideImageSize(svg('<rect width="100" height="80"/>'), 'example.svg'), { width: 100, height: 80 });
  for (const body of ['<script>alert(1)</script>', '<s:script xmlns:s="http://www.w3.org/2000/svg">alert(1)</s:script>', '<image href="https://example.com/image.png"/>', '<rect onclick="alert(1)"/>', '<foreignObject/>', '<style>@import "https://example.com/x.css";</style>', '<style>rect{fill:url(https://example.com/x)}</style>', '<style>svg{background-image:image-set("https://example.com/x" 1x)}</style>', '<style>svg{background-image:-webkit-image-set("https://example.com/x" 1x)}</style>', String.raw`<style>rect{fill:u\72l(https://example.com/x)}</style>`, String.raw`<style>@\69mport "https://example.com/x";</style>`, '<rect fill="&#117;rl(https://example.com/x)"/>']) {
    assert.throws(() => guideImageSize(svg(body), 'bad.svg'), /self-contained/);
  }
  assert.throws(() => guideImageSize(Buffer.alloc(2 * 1024 * 1024 + 1), 'large.png'), /size limit/);
  assert.throws(() => guideImageSize(Buffer.from('not a png'), 'bad.png'), /Invalid guide PNG/);
  const original = await fs.readFile(path.join(siteRoot, 'assets/guides/qa/device-rest.png'));
  assert.throws(() => guideImageSize(original.subarray(0, 24), 'header-only.png'), /Invalid guide PNG/);
  const corrupt = Buffer.from(original); corrupt[60] ^= 1;
  assert.throws(() => guideImageSize(corrupt, 'corrupt.png'), /checksum/);
  assert.throws(() => guideImageSize(Buffer.from('<svg><svg viewBox="0 0 100 80"></svg></svg>'), 'nested.svg'), /self-contained/);
  assert.throws(() => guideImageSize(svg('<g xml:base="https://example.com/"></g>'), 'base.svg'), /Unsupported guide SVG/);
  assert.throws(() => guideImageSize(Buffer.from('<svg id="viewBox=\'0 0 100 80\'"></svg>'), 'false-viewbox.svg'), /viewBox/);
  assert.throws(() => guideImageSize(svg('<g>'), 'unbalanced.svg'), /Unbalanced/);
  assert.throws(() => guideImageSize(Buffer.from('<svg viewBox="0 0 9999 80"></svg>'), 'large.svg'), /dimensions/);
});
