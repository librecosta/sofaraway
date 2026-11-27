import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';

const output = new URL('../build/client/', import.meta.url);
const licenses = new URL('licenses/', output);
await mkdir(licenses, { recursive: true });
await Promise.all([
  copyFile(new URL('../LICENSE', import.meta.url), new URL('SoFaraway.txt', licenses)),
  ...['OFL-Chakra-Petch.txt', 'OFL-Rajdhani.txt'].map(file =>
    copyFile(new URL(`../css/fonts/${file}`, import.meta.url), new URL(file, licenses))),
]);

const revalidate = 'public, max-age=0, must-revalidate';
const immutable = 'public, max-age=31536000, immutable';
const mutable = [
  '/', '/index.html', '/404.html', '/404', '/debug', '/debug/*',
  '/explorer/*', '/licenses/*', '/tools/*', '/social/*',
  '/favicon.svg', '/robots.txt', '/sitemap.xml', '/llms.txt', '/.well-known/security.txt', '/THIRD-PARTY-NOTICES.txt',
];

// Apply immutable caching only to fingerprinted files in the artifact.
const assets = (await readdir(new URL('assets/', output)))
  .filter(file => /^[\w.-]+-[\w-]{8,}\.(?:js|css|woff2)$/.test(file))
  .map(file => `/assets/${file}`).sort();
if (assets.length + mutable.length > 100) throw new Error('Cloudflare Workers Static Assets supports up to 100 header rules.');
const cloudflare = [
  ...mutable.map(path => `${path}\n  Cache-Control: ${revalidate}\n`),
  ...assets.map(path => `${path}\n  Cache-Control: ${immutable}\n`),
].join('');

// EdgeOne Pages already gives hashed assets a one-year browser TTL. Reserve
// custom header rules for mutable URLs to stay within its 30-rule limit.
const edgeone = { headers: mutable.map(source => ({
  source,
  headers: [{ key: 'Cache-Control', value: revalidate }],
})) };
await Promise.all([
  writeFile(new URL('_headers', output), cloudflare),
  writeFile(new URL('edgeone.json', output), JSON.stringify(edgeone, null, 2) + '\n'),
]);

// All application routes are prerendered. Missing paths use the host's 404.
await rm(new URL('__spa-fallback.html', output), { force: true });
