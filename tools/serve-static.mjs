import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const argument = process.argv[2];
if (argument === '--a0' && !process.env.A0_APP_ROOT) {
  throw new Error('Set A0_APP_ROOT to the A0 baseline worktree before running the A0 tests.');
}
const root = resolve(argument === '--a0' ? process.env.A0_APP_ROOT : argument ?? 'build/client');
const port = Number(process.argv[3] ?? 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.data': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error('Not found');
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} on http://127.0.0.1:${port}`));
