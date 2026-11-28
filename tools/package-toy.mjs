import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';

const build = new URL('../build/toy/', import.meta.url);
const packages = new URL('../build/packages/', import.meta.url);
const zip = new URL('sofaraway-toy.zip', packages);
const rootFiles = ['index.html', 'LICENSE.txt', 'OFL-Chakra-Petch.txt', 'OFL-Rajdhani.txt', 'THIRD-PARTY-NOTICES.txt'];
const assetName = /^[a-z0-9_.-]+-[a-z0-9_-]{8}\.(?:js|css|woff2)$/i;
const brandLogo = /^librecosta-black-white-[a-z0-9_-]{8}\.svg$/i;
const root = await readdir(build, { withFileTypes: true });
const assets = await readdir(new URL('assets/', build), { withFileTypes: true });
if (root.length !== rootFiles.length + 1 || root.some(entry =>
  entry.name === 'assets' ? !entry.isDirectory() : !entry.isFile() || !rootFiles.includes(entry.name))) {
  throw new Error('Unexpected files in the root of the Toy build.');
}
if (!assets.length || assets.some(entry => !entry.isFile() || !assetName.test(entry.name) && !brandLogo.test(entry.name))) {
  throw new Error('The Toy assets directory must contain only fingerprinted JavaScript, CSS, WOFF2 and the LibreCosta mark.');
}

const paths = [...rootFiles, ...assets.map(entry => 'assets/' + entry.name)].sort();
const files = await Promise.all(paths.map(async path => [path, await readFile(new URL(path, build))]));
const bytes = zipSync(Object.fromEntries(files), { level: 9, mtime: new Date(1980, 0, 1) });
await mkdir(packages, { recursive: true });
await writeFile(zip, bytes);
console.log(`Packaged ${paths.length} files as ${zip.pathname.split('/').at(-1)} (${bytes.length} bytes).`);
