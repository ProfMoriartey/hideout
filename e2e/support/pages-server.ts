import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';

// A tiny stand-in for GitHub Pages: serves dist/ under /hideout/, answers
// unknown paths with 404.html and status 404, redirects /hideout to
// /hideout/. The deploy workflow creates 404.html with
// `cp dist/index.html dist/404.html`; the build does not, so the same copy is
// used here when dist/404.html is missing.
const DIST = join(process.cwd(), 'dist');
const BASE = '/hideout/';
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

async function read(path: string) {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

export async function startPagesServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  const notFound = (await read(join(DIST, '404.html'))) ?? (await read(join(DIST, 'index.html')));
  if (!notFound) throw new Error('dist/ is missing: run `npm run build` first');

  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      if (path === '/hideout') {
        res.writeHead(301, { location: BASE }).end();
        return;
      }
      if (path.startsWith(BASE)) {
        let rel = normalize(path.slice(BASE.length)).replace(/^(\.\.[/\\])+/, '');
        if (rel === '' || rel === '.' || rel.endsWith('/')) rel = join(rel, 'index.html');
        const body = await read(join(DIST, rel));
        if (body) {
          res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' });
          res.end(body);
          return;
        }
      }
      res.writeHead(404, { 'content-type': TYPES['.html'] }).end(notFound);
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
