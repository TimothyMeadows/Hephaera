import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

export const siteRoot = fileURLToPath(new URL('../', import.meta.url));
export const repoRoot = path.resolve(siteRoot, '..');
export const repository = 'https://github.com/TimothyMeadows/Hephaera';
export const wiki = `${repository}/wiki`;
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function normalizeBase(value = '/Hephaera/') {
  if (value === '' || value === '/') return '/';
  if (!/^\/[A-Za-z0-9_-]+\/?$/.test(value)) throw new Error('SITE_BASE_PATH must be / or a single safe project path such as /Hephaera/.');
  return `${value.replace(/\/$/, '')}/`;
}

export const slugify = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').trim().replace(/\s+/g, '-');

export function validateNavigation(pages) {
  if (!Array.isArray(pages) || !pages.length || pages.length > 100) throw new Error('Navigation must contain 1–100 pages.');
  const files = new Set();
  const slugs = new Set();
  for (const p of pages) {
    if (!p || !/^[a-z][a-z0-9-]*\.md$/.test(p.file) || !/^(?:[a-z][a-z0-9-]*)?$/.test(p.slug) || typeof p.title !== 'string' || !p.title.trim() || typeof p.summary !== 'string') throw new Error('Invalid documentation navigation entry.');
    if (files.has(p.file) || slugs.has(p.slug)) throw new Error('Duplicate documentation filename or route.');
    files.add(p.file); slugs.add(p.slug);
  }
  if (!slugs.has('')) throw new Error('Documentation needs an overview route.');
  return pages;
}

export function createRenderer(pages, base) {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  const standard = md.renderer.rules.link_open || ((tokens, i, opts, env, self) => self.renderToken(tokens, i, opts));
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const href = token.attrGet('href') || '';
    if (!/^(?:https?:|mailto:|#)/i.test(href)) {
      const [file, fragment] = href.split('#');
      const match = pages.find(p => p.file === path.posix.basename(file));
      if (!match || !/^(?:\.\/)?[^/]+\.md$/.test(file)) throw new Error(`Unknown local documentation link: ${href}`);
      token.attrSet('href', `${base}docs/${match.slug ? `${match.slug}/` : ''}${fragment ? `#${fragment}` : ''}`);
    }
    return standard(tokens, index, options, env, self);
  };
  md.core.ruler.push('heading_ids', state => {
    const counts = new Map();
    state.env.toc = [];
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type !== 'heading_open') continue;
      const inline = state.tokens[i + 1];
      const label = (inline.children || []).filter(t => ['text', 'code_inline'].includes(t.type)).map(t => t.content).join('');
      const stem = slugify(label) || 'section';
      const count = counts.get(stem) || 0;
      counts.set(stem, count + 1);
      const id = `${stem}${count ? `-${count}` : ''}`;
      token.attrSet('id', id);
      if (['h2', 'h3'].includes(token.tag)) state.env.toc.push({ id, label, level: token.tag });
    }
  });
  return md;
}

const icons = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>',
};

function shell({ title, description, body, base, pages, current, toc = [], landing = false }) {
  const docUrl = p => `${base}docs/${p.slug ? `${p.slug}/` : ''}`;
  const side = pages.map(p => `<a href="${docUrl(p)}"${current === p.slug ? ' aria-current="page"' : ''}>${escapeHtml(p.title)}</a>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(description)}"><meta name="theme-color" content="#202A32"><title>${escapeHtml(title)}${title === 'Hephaera' ? '' : ' · Hephaera'}</title><link rel="icon" href="${base}assets/owl.png"><link rel="stylesheet" href="${base}assets/site.css"><script defer src="${base}assets/site.js" data-base="${base}"></script></head>
<body${landing ? ' class="landing"' : ''}><a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"><a class="brand" href="${base}" aria-label="Hephaera home"><img src="${base}assets/owl.png" width="42" height="42" alt=""><span>Hephaera</span></a><nav aria-label="Main navigation"><a href="${base}docs/"${!landing ? ' aria-current="true"' : ''}>Docs</a><a href="${base}docs/install/">Install</a><a href="${wiki}">Wiki</a><a class="repo-link" href="${repository}">GitHub ${icons.arrow}</a></nav><button class="search-open" type="button" hidden aria-label="Search documentation" aria-haspopup="dialog">${icons.search}<span>Search docs</span><kbd>/</kbd></button></header>
${landing ? `<main id="main">${body}</main>` : `<div class="docs-layout"><aside class="docs-sidebar"><details open><summary>Guides</summary><nav aria-label="Documentation">${side}</nav><div class="sidebar-reference"><small>Need the full details?</small><a href="${wiki}">Open the reference wiki ${icons.arrow}</a></div></details></aside><main id="main" class="article"><div class="breadcrumb"><a href="${base}docs/">Docs</a><span>/</span><span>${escapeHtml(title)}</span></div>${body}<div class="article-bottom"><span>Written to help you get something done.</span><a href="${repository}/blob/main/website/content/docs/${escapeHtml(pages.find(p => p.slug === current)?.file || 'index.md')}">Edit this page ${icons.arrow}</a></div></main><aside class="toc" aria-label="On this page"><span>On this page</span>${toc.map(t => `<a class="${t.level}" href="#${t.id}">${escapeHtml(t.label)}</a>`).join('')}</aside></div>`}
<footer class="site-footer"><a class="footer-name" href="${base}">Hephaera<span>A shared playbook for making games.</span></a><nav aria-label="Footer"><a href="${base}docs/">Guides</a><a href="${wiki}">Reference wiki</a><a href="${repository}">Source on GitHub</a><a href="${repository}/blob/main/LICENSE">License</a></nav><p>Built around your project. Guided by your decisions.</p></footer>
<dialog class="search-dialog" aria-labelledby="search-title"><form method="dialog"><h2 id="search-title">Find your next step</h2><button class="search-close" aria-label="Close search">×</button></form><label for="search-input">Search the practical guides</label><input id="search-input" type="search" placeholder="Try installation, music, or a first session" autocomplete="off"><p id="search-status" role="status" aria-live="polite">Type a few words to find a guide.</p><ul id="search-results"></ul><a class="search-reference" href="${wiki}">Looking for a command or contract? Use the reference wiki ${icons.arrow}</a></dialog>
</body></html>`;
}

function landing(base) {
  return `<section class="hero section-wrap"><div class="hero-copy"><p class="eyebrow"><span></span> A game-production baseline for your AI agent</p><h1>Make your game.<br><em>Keep your bearings.</em></h1><p class="hero-lead">Give your coding agent a shared playbook for planning, building and checking your game. Keep the decisions, the context and the final say in your project.</p><div class="hero-actions"><a class="button primary" href="${base}docs/install/">Install Hephaera ${icons.arrow}</a><a class="text-link" href="${base}docs/first-session/">See how a session works ${icons.arrow}</a></div><p class="hero-note">Works alongside Codex, Claude, Cursor and compatible coding agents.</p></div><div class="hero-art"><div class="owl-orbit"></div><img src="${base}assets/owl.png" alt="Hephaera’s shared robotic owl, in charcoal, steel and gold" width="560" height="560" fetchpriority="high"><span class="art-caption"><span>Hephaera</span> A little more direction. A lot less starting over.</span></div></section>
<section class="engine-strip section-wrap" aria-label="Supported engines"><span>Build with the engine you choose</span><div>Three.js <b>·</b> Babylon.js <b>·</b> Phaser <b>·</b> Unity <b>·</b> Unreal <b>·</b> Godot</div></section>
<section class="section-wrap introduction"><div><p class="eyebrow">WHAT IT IS</p><h2>A shared playbook.<br>Right in your repository.</h2></div><div class="intro-text"><p>Hephaera lives in a <code>.hephaera/</code> folder inside your game project. It gives your agent reusable instructions, specialist workflows and a place to keep project context between sessions.</p><p>You describe the result you want. Together, you work out a plan, use the right tools and check what actually happened. You still choose the engine, approve the work and review the result.</p><a class="text-link" href="${base}docs/">Take the short tour ${icons.arrow}</a></div></section>
<section class="workflow-band"><div class="section-wrap"><div class="section-heading"><p class="eyebrow">FROM IDEA TO REVIEW</p><h2>Start with a conversation.</h2><p>You don’t need to memorize a list of commands to ask for useful work.</p></div><div class="session-example"><span>A first request might sound like this</span><blockquote>“Help me make a small playable prototype. Start with movement, one enemy and a clear HUD. Show me a plan before changing files.”</blockquote><a href="${base}docs/first-session/">Walk through your first session ${icons.arrow}</a></div><ol class="workflow-steps"><li><span>01</span><h3>Talk it through</h3><p>Explain what the player should experience and what matters to you.</p></li><li><span>02</span><h3>Make a plan</h3><p>Choose a manageable scope, the right tools and a way to judge the result.</p></li><li><span>03</span><h3>Build and check</h3><p>Work through the change, with tests, playthroughs and evidence that fit the task.</p></li><li><span>04</span><h3>Review and decide</h3><p>Keep what works. Revise what doesn’t. Approve delivery when it’s ready.</p></li></ol></div></section>
<section class="section-wrap capabilities"><div class="section-heading"><p class="eyebrow">THE WORK AROUND THE GAME</p><h2>Give each part a clear path.</h2></div><div class="capability-list"><a href="${base}docs/project-setup/"><span>01 / FOUNDATION</span><h3>Set the direction ${icons.arrow}</h3><p>Choose your engine, project structure and visual style.</p></a><a href="${base}docs/everyday-work/"><span>02 / DEVELOPMENT</span><h3>Keep the work connected ${icons.arrow}</h3><p>Plan features, fix bugs and carry useful context into the next session.</p></a><a href="${base}docs/art-and-assets/"><span>03 / PRODUCTION</span><h3>Make room for the assets ${icons.arrow}</h3><p>Turn approved floor plans into buildings and schematics into models with separate moving parts.</p></a><a href="${base}docs/audio-music-voice/"><span>04 / SOUND</span><h3>Let audio have its own lane ${icons.arrow}</h3><p>Use separate workflows for effects and ambience, music, and speech.</p></a></div></section>
<section id="install" class="install-band"><div class="section-wrap install-grid"><div><p class="eyebrow">GET STARTED</p><h2>One folder.<br>A better starting point.</h2><p>Versioned npm and NuGet setup installs the baseline and creates your project scaffold automatically. The GitHub Packages prerelease is available; public npmjs and NuGet.org distribution is being prepared.</p><a class="text-link" href="${base}docs/install/">Package setup, prerequisites and manual fallback ${icons.arrow}</a></div><div class="install-code"><div class="code-heading"><span>Verified GitHub package setup</span><span>Node 24 + Git + Bash</span></div><pre><code>npm exec --yes --package=@timothymeadows/hephaera@&lt;VERSION&gt; -- hephaera install --project .</code></pre><p>GitHub prerelease <code>5.1.0-rc.1</code> is published. Authenticate for that feed; public registry mirrors remain pending. The guide covers NuGet next, then manual clone/submodule options. Native tools and models remain separate.</p></div></div></section>
<section class="section-wrap reading-room"><div><p class="eyebrow">TWO WAYS TO FIND YOUR WAY</p><h2>Guides for doing.<br>Reference for the details.</h2></div><div class="reading-links"><a href="${base}docs/"><span>THE PRACTICAL DOCS</span><h3>“How do I use this?” ${icons.arrow}</h3><p>Plain-language explanations, useful examples and a next step you can follow.</p></a><a href="${wiki}"><span>THE REFERENCE WIKI</span><h3>“What exactly does this do?” ${icons.arrow}</h3><p>The commands, contracts and workflow details behind the shorter guides.</p></a></div></section>`;
}

export async function buildSite({ basePath = process.env.SITE_BASE_PATH || '/Hephaera/', output = path.join(siteRoot, 'dist') } = {}) {
  const base = normalizeBase(basePath);
  const allowedOutputs = [path.join(siteRoot, 'dist'), path.join(siteRoot, '.test-output')];
  const target = path.resolve(output);
  if (!allowedOutputs.some(p => target === p || target.startsWith(`${p}${path.sep}`))) throw new Error('Output must remain within website/dist or website/.test-output.');
  let segment = siteRoot;
  for (const name of path.relative(siteRoot, target).split(path.sep)) {
    segment = path.join(segment, name);
    const stat = await fs.lstat(segment).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (stat?.isSymbolicLink()) throw new Error('Generated output must not follow symbolic links.');
  }
  const pages = validateNavigation(JSON.parse(await fs.readFile(path.join(siteRoot, 'navigation.json'), 'utf8')));
  const sources = [];
  for (const page of pages) {
    const file = path.join(siteRoot, 'content/docs', page.file);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256_000) throw new Error(`Documentation must be a bounded regular Markdown file: ${page.file}`);
    sources.push(await fs.readFile(file, 'utf8'));
  }
  // Remove only the exact, owned generated output directory after verifying its boundary.
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.join(target, 'assets'), { recursive: true });
  const md = createRenderer(pages, base);
  const search = [];
  for (const [index, page] of pages.entries()) {
    const source = sources[index];
    const env = {};
    const rendered = md.render(source, env);
    const url = `${base}docs/${page.slug ? `${page.slug}/` : ''}`;
    const html = shell({ title: page.title, description: page.summary, body: rendered, base, pages, current: page.slug, toc: env.toc });
    const folder = path.join(target, 'docs', page.slug);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'index.html'), html);
    search.push({ title: page.title, summary: page.summary, url, text: source.replace(/```[\s\S]*?```/g, '').replace(/[#*`\[\]()]/g, ' ').replace(/\s+/g, ' ').slice(0, 16000) });
  }
  await fs.writeFile(path.join(target, 'index.html'), shell({ title: 'Hephaera', description: 'A shared AI production playbook for game projects. Plan, build, review and keep your bearings with Hephaera.', body: landing(base), base, pages, landing: true }));
  await fs.writeFile(path.join(target, '404.html'), shell({ title: 'Page not found', description: 'Find your way back to the Hephaera guides.', body: `<h1>Let’s get you back on track.</h1><p>This page may have moved. <a href="${base}docs/">Browse the guides</a> or visit the <a href="${wiki}">reference wiki</a>.</p>`, base, pages, current: null }));
  for (const file of ['site.css', 'site.js']) await fs.copyFile(path.join(siteRoot, 'assets', file), path.join(target, 'assets', file));
  await fs.copyFile(path.join(repoRoot, 'logo.png'), path.join(target, 'assets/owl.png'));
  await fs.writeFile(path.join(target, 'search-index.json'), JSON.stringify(search));
  await fs.writeFile(path.join(target, '.nojekyll'), '');
  console.log(`Built ${pages.length + 2} pages at ${base} into ${path.relative(repoRoot, target)}.`);
  return { output: target, base, pages };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSite().catch(error => { console.error(error.message); process.exitCode = 1; });
}
