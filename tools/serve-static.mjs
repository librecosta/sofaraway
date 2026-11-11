import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const argument = process.argv[2];
if (argument === '--a0' && !process.env.A0_APP_ROOT) {
  throw new Error('Set A0_APP_ROOT to the A0 baseline worktree before running the A0 tests.');
}
const stability = argument === '--stability-client' ? 'client' : argument === '--stability-harness' ? 'harness' : null;
const root = stability ? resolve(process.env.STABILITY_REFERENCE_DIR, stability)
  : resolve(argument === '--a0' ? process.env.A0_APP_ROOT : argument ?? 'build/client');
const port = Number(process.argv[3] ?? 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.data': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};
const revalidate = 'public, max-age=0, must-revalidate';
const fingerprinted = /^\/(?:tools\/)?assets\/[\w.-]+-[\w-]{8,}\.(?:js|css|woff2)$/;

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + sep)) throw new Error('Not found');
    const body = await readFile(file);
    const etag = '"' + createHash('sha256').update(body).digest('hex') + '"';
    const immutable = fingerprinted.test(pathname);
    const age = process.env.STABILITY_HTTP_CACHE === '1' ? 600 : 31536000;
    response.setHeader('Cache-Control', immutable ? `public, max-age=${age}, immutable` : revalidate);
    response.setHeader('ETag', etag);
    if (request.headers['if-none-match']?.split(',').some(tag => ['*', etag].includes(tag.trim().replace(/^W\//, '')))) {
      response.writeHead(304).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    const page = await readFile(resolve(root, '404.html')).catch(() => null);
    response.writeHead(404, { 'Content-Type': page ? types['.html'] : types['.txt'], 'Cache-Control': revalidate });
    response.end(request.method === 'HEAD' ? undefined : page ?? 'Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} on http://127.0.0.1:${port}`));
