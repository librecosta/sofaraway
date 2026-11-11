import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';

const output = new URL('../build/client/', import.meta.url);
const licenses = new URL('licenses/', output);
await mkdir(licenses, { recursive: true });
await Promise.all([
  copyFile(new URL('../LICENSE', import.meta.url), new URL('SoFaraway.txt', licenses)),
  ...['OFL-Chakra-Petch.txt', 'OFL-Rajdhani.txt'].map(file =>
    copyFile(new URL(`../css/fonts/${file}`, import.meta.url), new URL(file, licenses))),
]);

// An exact asset list keeps missing chunks from receiving an immutable 404.
const cache = 'public, max-age=31536000, immutable';
const assets = (await Promise.all(['assets', 'tools/assets'].map(async dir =>
  (await readdir(new URL(dir + '/', output)))
    .filter(file => /^[\w.-]+-[\w-]{8,}\.(?:js|css|woff2)$/.test(file))
    .map(file => `/${dir}/${file}`)))).flat().sort();
const cloudflare = assets.map(path => `${path}\n  Cache-Control: ${cache}\n`).join('');
const edgeone = { headers: assets.map(source => ({
  source,
  headers: [{ key: 'Cache-Control', value: cache }],
})) };
await Promise.all([
  writeFile(new URL('_headers', output), cloudflare),
  writeFile(new URL('edgeone.json', output), JSON.stringify(edgeone, null, 2) + '\n'),
]);

// All application routes are prerendered. Missing paths use the host's 404.
await rm(new URL('__spa-fallback.html', output), { force: true });
