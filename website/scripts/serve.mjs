import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { siteRoot, normalizeBase } from './build.mjs';

const root = path.join(siteRoot, 'dist');
const base = normalizeBase(process.env.SITE_BASE_PATH || '/Hephaera/');
const port = Number(process.env.SITE_PORT || 4319);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('SITE_PORT must be an unprivileged port.');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/' && base !== '/') { response.writeHead(302, { Location: base }).end(); return; }
    if (!url.pathname.startsWith(base)) { response.writeHead(404).end('Page not found'); return; }
    const relative = decodeURIComponent(url.pathname.slice(base.length));
    let file = path.resolve(root, relative || 'index.html');
    if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(404).end('Page not found'); return; }
    let stat = await fs.stat(file);
    if (stat.isDirectory()) {
      if (!url.pathname.endsWith('/')) { response.writeHead(301, { Location: `${url.pathname}/` }).end(); return; }
      file = path.join(file, 'index.html');
    }
    const content = await fs.readFile(file);
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    response.end(content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await fs.readFile(path.join(root, '404.html')).catch(() => 'Page not found'));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Hephaera preview: http://127.0.0.1:${port}${base}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
