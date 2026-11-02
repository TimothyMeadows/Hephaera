import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBase, siteRoot } from './build.mjs';

export async function listFiles(root) {
  const result = [];
  for (const item of await fs.readdir(root, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error(`Unexpected generated link: ${item.name}`);
    const full = path.join(root, item.name);
    if (item.isDirectory()) result.push(...await listFiles(full));
    else result.push(full);
  }
  return result;
}

export async function checkOutput(output, basePath) {
  const root = path.resolve(output);
  const base = normalizeBase(basePath);
  const files = await listFiles(root);
  let links = 0;
  for (const file of files.filter(p => p.endsWith('.html'))) {
    const source = await fs.readFile(file, 'utf8');
    const relative = path.relative(root, file).split(path.sep).join('/');
    const current = new URL(`${base}${relative.replace(/index\.html$/, '')}`, 'https://preview.invalid');
    const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate rendered anchor in ${relative}`);
    for (const match of source.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const raw = match[1].replace(/&amp;/g, '&');
      const url = new URL(raw, current);
      if (url.origin !== current.origin) {
        if (!['https:', 'mailto:'].includes(url.protocol)) throw new Error(`Unsafe external URL in ${relative}: ${raw}`);
        continue;
      }
      if (!url.pathname.startsWith(base)) throw new Error(`Link escapes deployed base ${base}: ${raw}`);
      let target = decodeURIComponent(url.pathname.slice(base.length));
      if (!target || target.endsWith('/')) target += 'index.html';
      const resolved = path.resolve(root, target);
      if (!resolved.startsWith(`${root}${path.sep}`) || !(await fs.stat(resolved).catch(() => null))?.isFile()) throw new Error(`Missing local target in ${relative}: ${raw}`);
      if (url.hash && resolved.endsWith('.html')) {
        const html = await fs.readFile(resolved, 'utf8');
        const anchor = decodeURIComponent(url.hash.slice(1));
        if (![...html.matchAll(/\bid="([^"]+)"/g)].some(m => m[1] === anchor)) throw new Error(`Missing fragment in ${relative}: ${raw}`);
      }
      links++;
    }
  }
  return { files: files.length, html: files.filter(p => p.endsWith('.html')).length, localLinks: links };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkOutput(path.join(siteRoot, 'dist'), process.env.SITE_BASE_PATH || '/Hephaera/').then(result => console.log('Output links passed:', result)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
