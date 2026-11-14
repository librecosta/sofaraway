// node tools/music/daybreak/export.mjs [--ffmpeg <executable>]
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { transformWithOxc } from 'vite';

const { values } = parseArgs({ options: {
  ffmpeg: { type: 'string', default: 'ffmpeg' },
} });
execFileSync(values.ffmpeg, ['-version'], { stdio: 'ignore' });
const output = new URL('../../../scratch/daybreak-m1/exports/', import.meta.url);
await mkdir(output, { recursive: true });

const root = new URL('../../../', import.meta.url);
const modules = [
  'tools/music/daybreak/render.mjs', 'tools/music/daybreak/voices.mjs',
  'app/game/core/daybreak-score.ts', 'app/game/audio/daybreak.client.ts',
  'app/game/audio/daybreak-voices.client.ts', 'app/game/audio/daybreak-export.client.ts',
];
const sources = new Map(await Promise.all(modules.map(async path => {
  const source = await readFile(new URL(path, root), 'utf8');
  const code = path.endsWith('.ts') ? (await transformWithOxc(source, path, { lang: 'ts' })).code : source;
  return ['/' + path, code];
})));
const server = createServer((req, res) => {
  if (req.url === '/') res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><link rel="icon" href="data:,"><title>Offline audio export</title>');
  else {
    const source = sources.get(req.url) ?? sources.get(req.url + '.ts');
    if (source) res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(source);
    else res.writeHead(404).end();
  }
});
await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));

try {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    page.on('console', message => console.log(message.text()));
    await page.goto('http://127.0.0.1:' + server.address().port);
    async function save(basename) {
      const filename = basename + '.wav';
      const [download, metrics] = await Promise.all([
        page.waitForEvent('download', { timeout: 180_000 }),
        page.evaluate(async filename => {
          const { render } = await import('/tools/music/daybreak/render.mjs');
          const { blob, ...metrics } = await render();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
          return metrics;
        }, filename),
      ]);
      const path = fileURLToPath(new URL(filename, output));
      await download.saveAs(path);
      console.log(JSON.stringify({ filename, ...metrics }));
      return path;
    }

    const name = 'DAYBREAK-Production';
    const wav = await save(name);
    const mp3 = fileURLToPath(new URL(name + '.mp3', output));
    execFileSync(values.ffmpeg, ['-v', 'error', '-xerror', '-y', '-i', wav,
      '-c:a', 'libmp3lame', '-b:a', '256k', mp3], { stdio: 'inherit' });
  } finally {
    await browser.close();
  }
} finally {
  server.close();
}
