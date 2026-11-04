import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { repoRoot, repository, wiki, slugify, guideImagePath, loadGuideImages } from './build.mjs';

const sourceRoot = path.join(repoRoot, 'wiki');
const parser = new MarkdownIt({ html: false });
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export async function checkWikiImage(src, alt) {
  const prefix = 'https://raw.githubusercontent.com/TimothyMeadows/Hephaera/main/website/';
  if (!src.startsWith(prefix) || !alt.trim()) throw new Error(`Wiki image needs a public project source and descriptive alt text: ${src}`);
  const relative = `../../${src.slice(prefix.length)}`;
  guideImagePath(relative); // Validate exact source before any Markdown reconstruction.
  await loadGuideImages([`![Reviewed illustration](${relative})`]);
}

function headings(source) {
  const tokens = parser.parse(source, {});
  const ids = new Set();
  const counts = new Map();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue;
    const label = (tokens[i + 1].children || []).filter(t => ['text', 'code_inline'].includes(t.type)).map(t => t.content).join('');
    const stem = slugify(label);
    const count = counts.get(stem) || 0;
    counts.set(stem, count + 1);
    ids.add(`${stem}${count ? `-${count}` : ''}`);
  }
  return ids;
}

export async function checkWiki() {
  const names = (await fs.readdir(sourceRoot)).filter(name => name.endsWith('.md')).sort();
  if (!names.includes('Home.md') || !names.includes('_Sidebar.md')) throw new Error('Wiki needs Home.md and _Sidebar.md.');
  const sources = new Map();
  for (const name of names) {
    if (!/^[A-Za-z][A-Za-z0-9-]*\.md$/.test(name) && name !== '_Sidebar.md') throw new Error(`Unsupported wiki filename: ${name}`);
    const stat = await fs.lstat(path.join(sourceRoot, name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256_000) throw new Error(`Wiki source must be a bounded regular file: ${name}`);
    sources.set(name.slice(0, -3), await fs.readFile(path.join(sourceRoot, name), 'utf8'));
  }
  let links = 0, images = 0;
  for (const [name, source] of sources) {
    const tokens = parser.parse(source, {});
    for (const block of tokens) for (const token of block.children || []) {
      if (token.type === 'image') {
        await checkWikiImage(token.attrGet('src') || '', token.content);
        images++;
      }
      if (token.type !== 'link_open') continue;
      const href = token.attrGet('href');
      const url = new URL(href, `${wiki}/${name}`);
      if (url.origin === 'https://github.com' && url.pathname.startsWith('/TimothyMeadows/Hephaera/wiki')) {
        const target = decodeURIComponent(url.pathname.split('/')[4] || 'Home');
        if (!sources.has(target)) throw new Error(`Missing wiki page in ${name}: ${href}`);
        if (url.hash && !headings(sources.get(target)).has(decodeURIComponent(url.hash.slice(1)))) throw new Error(`Missing wiki anchor in ${name}: ${href}`);
      } else if (url.origin === 'https://github.com' && /^\/TimothyMeadows\/Hephaera\/(blob|tree)\/main\//.test(url.pathname)) {
        const local = path.resolve(repoRoot, decodeURIComponent(url.pathname.split('/').slice(5).join('/')));
        if (!local.startsWith(`${repoRoot}${path.sep}`) || local.split(path.sep).includes('.cache') || !(await fs.stat(local).catch(() => null))) throw new Error(`Missing/nonpublic source reference in ${name}: ${href}`);
        if (url.hash && local.endsWith('.md') && !headings(await fs.readFile(local, 'utf8')).has(decodeURIComponent(url.hash.slice(1)))) throw new Error(`Missing source anchor in ${name}: ${href}`);
      } else if (!['https:', 'mailto:'].includes(url.protocol) || !/^[a-z][a-z\d+.-]*:/i.test(href)) {
        throw new Error(`Unexpected wiki/source link in ${name}: ${href}`);
      }
      links++;
    }
  }
  return { names, pages: names.length, links, images };
}

export async function publishWiki(destination, execute = false) {
  const checked = await checkWiki();
  const target = path.resolve(destination);
  const canonical = await fs.realpath(target);
  const source = await fs.realpath(sourceRoot);
  if (canonical === source || canonical.startsWith(`${source}${path.sep}`) || source.startsWith(`${canonical}${path.sep}`)) throw new Error('Wiki checkout must not overlap the main repository or wiki sources.');
  if (path.resolve(git(target, 'rev-parse', '--show-toplevel')) !== target) throw new Error('Destination must be its own Wiki Git checkout.');
  const remote = git(target, 'remote', 'get-url', 'origin');
  if (!/^https:\/\/github\.com\/TimothyMeadows\/Hephaera\.wiki(?:\.git)?\/?$/i.test(remote)) throw new Error('Wiki origin must be the expected HTTPS repository, without embedded credentials.');
  if (git(target, 'status', '--porcelain')) throw new Error('Wiki checkout has local changes; review them before preparing publication.');
  const sourceSha = git(repoRoot, 'rev-parse', 'HEAD');
  const sourceDirty = Boolean(git(repoRoot, 'status', '--porcelain'));
  const sourceFiles = await Promise.all(checked.names.map(async name => ({ name, sha256: createHash('sha256').update(await fs.readFile(path.join(sourceRoot, name))).digest('hex') })));
  const plan = { sourceSha, sourceDirty, sourceFiles, destination: target, files: checked.names, preserveOtherPages: true, execute, liveUrl: wiki };
  if (!execute) return plan;
  if (!/^https:\/\/github\.com\/TimothyMeadows\/Hephaera(?:\.git)?\/?$/i.test(git(repoRoot, 'remote', 'get-url', 'origin'))) throw new Error('Source origin must be the canonical Hephaera repository, without embedded credentials.');
  if (git(repoRoot, 'branch', '--show-current') !== 'main' || git(repoRoot, 'status', '--porcelain')) throw new Error('Publish only from a clean, reviewed main checkout after PR merge.');
  git(repoRoot, 'fetch', 'origin', 'main');
  if (git(repoRoot, 'rev-parse', 'origin/main') !== sourceSha) throw new Error('Source main must exactly match origin/main.');
  // Publish exact committed blobs, not working files that another writer could change after preflight.
  const committedSources = new Map(checked.names.map(name => [name, execFileSync('git', ['-C', repoRoot, 'show', `${sourceSha}:wiki/${name}`], { stdio: ['ignore', 'pipe', 'pipe'] })]));
  plan.sourceFiles = [...committedSources].map(([name, bytes]) => ({ name, sha256: createHash('sha256').update(bytes).digest('hex') }));
  const branch = git(target, 'branch', '--show-current');
  const defaultBranch = git(target, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '');
  if (branch !== defaultBranch) throw new Error('Wiki checkout must be on its own default branch.');
  git(target, 'pull', '--ff-only', 'origin', branch);
  if (git(target, 'rev-parse', 'HEAD') !== git(target, 'rev-parse', `origin/${branch}`)) throw new Error('Wiki has unpublished local commits; reconcile before publishing.');
  for (const name of checked.names) {
    const existing = await fs.lstat(path.join(target, name)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error(`Cannot overwrite non-regular wiki target: ${name}`);
  }
  for (const name of checked.names) await fs.writeFile(path.join(target, name), committedSources.get(name));
  git(target, 'add', '--', ...checked.names);
  git(target, 'diff', '--cached', '--check');
  const changed = git(target, 'diff', '--cached', '--name-only');
  if (!changed) return { ...plan, changed: false, wikiCommit: git(target, 'rev-parse', 'HEAD') };
  git(target, 'commit', '-m', `docs: publish Hephaera reference from ${sourceSha.slice(0, 12)}`);
  git(target, 'push', 'origin', `HEAD:${branch}`);
  const wikiCommit = git(target, 'rev-parse', 'HEAD');
  const remoteHead = git(target, 'ls-remote', 'origin', `refs/heads/${branch}`).split(/\s+/)[0];
  if (remoteHead !== wikiCommit) throw new Error('Wiki push outcome requires reconciliation against the remote head.');
  return { ...plan, changed: true, wikiCommit };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let operation;
  if (!args.length) operation = checkWiki;
  else if (args[0] === '--publish' && args[1] && (args.length === 2 || args.length === 3 && args[2] === '--execute')) operation = () => publishWiki(args[1], args[2] === '--execute');
  else throw new Error('Usage: node website/scripts/wiki.mjs [--publish WIKI_CHECKOUT [--execute]]');
  operation().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
