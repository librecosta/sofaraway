// node tools/music/daybreak/export.mjs [--stems] [--ffmpeg <executable>]
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { editions } from './editions.mjs';

const { values } = parseArgs({ options: {
  ffmpeg: { type: 'string', default: 'ffmpeg' },
  stems: { type: 'boolean', default: false },
} });
execFileSync(values.ffmpeg, ['-version'], { stdio: 'ignore' });
const output = new URL('../../../scratch/daybreak-m1/exports/', import.meta.url);
await mkdir(output, { recursive: true });

const sources = new Map(await Promise.all(['score', 'voices', 'editions', 'render'].map(async name =>
  ['/' + name + '.mjs', await readFile(new URL(name + '.mjs', import.meta.url))])));
const server = createServer((req, res) => {
  if (req.url === '/') res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><link rel="icon" href="data:,"><title>Offline audio export</title>');
  else if (sources.has(req.url)) res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(sources.get(req.url));
  else res.writeHead(404).end();
});
await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));

try {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    page.on('console', message => console.log(message.text()));
    await page.goto('http://127.0.0.1:' + server.address().port);
    async function save(edition, basename) {
      const filename = basename + '.wav';
      const [download, metrics] = await Promise.all([
        page.waitForEvent('download', { timeout: 180_000 }),
        page.evaluate(async ({ edition, filename }) => {
          const { render } = await import('/render.mjs');
          const { blob, ...metrics } = await render(edition);
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
          return metrics;
        }, { edition, filename }),
      ]);
      const path = fileURLToPath(new URL(filename, output));
      await download.saveAs(path);
      console.log(JSON.stringify({ filename, ...metrics }));
      return path;
    }

    if (values.stems) {
      for (const track of ['backing', 'reply', 'softReply', 'accents']) await save(track, 'stem-' + track);
    }
    for (const [edition, { name }] of Object.entries(editions)) {
      const wav = await save(edition, name);
      const mp3 = fileURLToPath(new URL(name + '.mp3', output));
      execFileSync(values.ffmpeg, ['-v', 'error', '-xerror', '-y', '-i', wav,
        '-c:a', 'libmp3lame', '-b:a', '256k', mp3], { stdio: 'inherit' });
    }
  } finally {
    await browser.close();
  }
} finally {
  server.close();
}
