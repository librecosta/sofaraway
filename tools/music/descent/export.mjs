import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { transformWithOxc } from 'vite';
import { duration, tail, versions } from './score.mjs';

const { values: { verify } } = parseArgs({ options: { verify: { type: 'boolean' } } });
const root = new URL('../../../', import.meta.url);
const output = new URL('scratch/descent-m0/exports/', root);
const paths = [
  'tools/music/descent/render.mjs', 'tools/music/descent/score.mjs', 'tools/music/descent/voices.mjs',
  'tools/music/daybreak/voices.mjs', 'app/game/audio/daybreak-voices.client.ts',
];
const sources = new Map(await Promise.all(paths.map(async path => {
  const source = await readFile(new URL(path, root), 'utf8');
  const body = path.endsWith('.ts') ? (await transformWithOxc(source, path, { lang: 'ts' })).code : source;
  return ['/' + path, body];
})));
const origin = 'http://localhost:13600';
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
try {
  const page = await browser.newPage({ acceptDownloads: true });
  // Supply the isolated synthesis modules to Chromium without opening a server or playback page.
  await page.route(origin + '/**', async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') {
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Offline rendering</title>' });
    } else {
      const body = sources.get(pathname);
      await route.fulfill(body === undefined ? { status: 404 } : { contentType: 'text/javascript', body });
    }
  });
  await page.goto(origin);
  for (const [version, basename] of Object.entries(versions)) {
    const filename = basename + '.wav';
    const [download, metrics] = await Promise.all([
      page.waitForEvent('download', { timeout: 180_000 }),
      page.evaluate(async ({ version, filename, verify }) => {
        const { render } = await import('/tools/music/descent/render.mjs');
        const { blob, ...metrics } = await render(version);
        let repeat;
        if (verify) {
          const next = await render(version);
          const original = new Int16Array(await blob.arrayBuffer(), 44);
          const rerendered = new Int16Array(await next.blob.arrayBuffer(), 44);
          let max = 0, power = 0;
          for (let i = 0; i < original.length; i++) {
            const delta = original[i] - rerendered[i];
            max = Math.max(max, Math.abs(delta));
            power += delta * delta;
          }
          repeat = { max, rms: Math.sqrt(power / original.length) };
        }
        const href = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href, download: filename });
        link.click();
        setTimeout(() => URL.revokeObjectURL(href), 3000);
        return { ...metrics, repeat };
      }, { version, filename, verify }),
    ]);
    const file = fileURLToPath(new URL(filename, output));
    await download.saveAs(file);
    const bytes = await readFile(file);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(bytes.readUInt16LE(20), 1);
    assert.equal(bytes.readUInt16LE(22), 2);
    assert.equal(bytes.readUInt32LE(24), 44_100);
    assert.equal(bytes.readUInt16LE(34), 16);
    assert.equal(bytes.length, 44 + 4 * Math.round((duration + tail) * 44_100));
    assert.equal(bytes.readInt32LE(bytes.length - 4), 0);
    assert.ok(metrics.peak > .2 && metrics.peak < .98 && metrics.rms > .025);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    // Allow sub-audible numerical differences in the browser's summing and dynamics.
    if (verify) assert.ok(metrics.repeat.max <= 24 && metrics.repeat.rms < 1,
      version + ' PCM repeat error in 16-bit codes: ' + JSON.stringify(metrics.repeat));
    console.log(JSON.stringify({ file, ...metrics, sha256 }));
  }
} finally {
  await browser.close();
}
