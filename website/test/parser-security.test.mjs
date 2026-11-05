import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRenderer, loadGuideImages, siteRoot } from '../scripts/build.mjs';

test('every site, image-discovery and Wiki parser explicitly disables raw HTML', async () => {
  const sources = await Promise.all(['build.mjs', 'wiki.mjs'].map(name => fs.readFile(path.join(siteRoot, 'scripts', name), 'utf8')));
  const constructors = sources.flatMap(source => [...source.matchAll(/new MarkdownIt\(\{([^}]+)\}\)/g)]);
  assert.equal(constructors.length, 3, 'Review any new parser path for HTML admission.');
  for (const [, options] of constructors) assert.match(options, /\bhtml:\s*false\b/);
  const renderer = createRenderer([], '/');
  assert.equal(renderer.options.html, false);
  assert.equal(renderer.render('<section>Reviewed text</section>\n'), '<p>&lt;section&gt;Reviewed text&lt;/section&gt;</p>\n');
  assert.equal((await loadGuideImages(['<img src="../../assets/guides/qa/absent.png">'])).size, 0);
});

test('bounded inert long-reference input parses in a deadline-owned child', () => {
  const script = `
    import assert from 'node:assert/strict';
    import MarkdownIt from 'markdown-it';
    import { createRenderer } from './scripts/build.mjs';
    const label = 'reviewed-reference-'.repeat(16);
    const source = ('[' + label + ']\\n\\n').repeat(256) + '[' + label + ']: https://example.com/guide\\n';
    assert.ok(Buffer.byteLength(source) < 128000);
    for (const parser of [new MarkdownIt({ html: false }), createRenderer([], '/')]) {
      assert.equal(parser.options.html, false);
      const html = parser.render(source);
      assert.equal((html.match(/href="https:\\/\\/example.com\\/guide"/g) || []).length, 256);
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: siteRoot, timeout: 10_000, maxBuffer: 128_000, encoding: 'utf8', windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
