import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { transformWithOxc } from 'vite';
import { duration, tail, versions } from './score.mjs';
import { starwakeTrack } from '../../../app/game/core/orbit-score.ts';
import { inspectWav } from './verify.mjs';

const { values } = parseArgs({ options: { verify: { type: 'boolean' }, prototypes: { type: 'boolean' }, m1: { type: 'boolean' } } });
assert.ok(!(values.m1 && values.prototypes), 'Select one audition collection.');
const tracks = values.m1 ? { 'starwake-m1':'ORBIT-M1-MELODY-FIRST-FULL' }
  : values.prototypes ? versions : { [starwakeTrack.id]: 'ORBIT-STARWAKE-FULL' };
const seconds = values.prototypes ? duration + tail : starwakeTrack.duration + starwakeTrack.tail;
const root = new URL('../../../', import.meta.url);
const output = new URL(values.m1 ? 'scratch/orbit-m1/exports/' : 'scratch/orbit-m0/exports/', root);
const paths = ['tools/music/orbit/score.mjs', 'tools/music/orbit/voices.mjs', 'tools/music/orbit/render.mjs',
  'tools/music/daybreak/voices.mjs', 'app/game/audio/daybreak-voices.client.ts',
  'app/game/core/orbit-score.ts', 'app/game/audio/orbit-voices.client.ts',
  'app/game/audio/orbit.client.ts', 'app/game/audio/orbit-export.client.ts',
  'app/game/core/orbit-m1-score.ts', 'app/game/audio/orbit-m1.client.ts', 'app/game/audio/orbit-m1-export.client.ts'];
const sources = new Map(await Promise.all(paths.map(async path => {
  const source = await readFile(new URL(path, root), 'utf8');
  const code = path.endsWith('.ts') ? (await transformWithOxc(source, path, { lang: 'ts' })).code : source;
  return ['/' + path, code];
})));
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
const reports = [];
try {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'log') console.log(message.text()); });
  const origin = 'http://localhost:13601';
  await page.route(origin + '/**', route => {
    const { pathname } = new URL(route.request().url());
    const body = sources.get(pathname) ?? sources.get(pathname + '.ts');
    return route.fulfill(pathname === '/'
      ? { contentType: 'text/html', body: '<!doctype html><title>Offline audio export</title>' }
      : body === undefined ? { status: 404 } : { contentType: 'text/javascript', body });
  });
  await page.goto(origin);
  for (const [version, basename] of Object.entries(tracks)) {
    const filename = basename + '.wav';
    console.log('Rendering ' + filename);
    const [download, metrics] = await Promise.all([
      page.waitForEvent('download', { timeout: 1800000 }),
      page.evaluate(async ({ version, filename, verify }) => {
        const render = version === 'starwake-m1'
          ? async () => (await import('/app/game/audio/orbit-m1-export.client')).exportOrbitM1()
          : version === 'starwake'
          ? async () => {
            const { renderStarwake, encodeStarwakeWav } = await import('/app/game/audio/orbit-export.client');
            return encodeStarwakeWav(await renderStarwake());
          }
          : async () => (await import('/tools/music/orbit/render.mjs')).render(version);
        const renders = [render()];
        if (verify) renders.push(render());
        const [{ blob, ...metrics }, next] = await Promise.all(renders);
        console.log('Complete render' + (verify ? ' and independent repeat: ' : ': ') + filename);
        // Decode the actual delivered format through the browser's audio decoder.
        const decoder = new OfflineAudioContext(2, 1, 44100);
        const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
        let repeat;
        if (next) {
          const original = new Int16Array(await blob.arrayBuffer(), 44);
          const other = new Int16Array(await next.blob.arrayBuffer(), 44);
          let maximum = 0, square = 0;
          for (let i = 0; i < original.length; i++) {
            const delta = original[i] - other[i];
            maximum = Math.max(maximum, Math.abs(delta));
            square += delta * delta;
          }
          repeat = { peakCodes: maximum, rmsCodes: Math.sqrt(square / original.length) };
        }
        const href = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href, download: filename }).click();
        setTimeout(() => URL.revokeObjectURL(href), 3000);
        return { ...metrics, repeat, decoded: { duration: decoded.duration,
          channels: decoded.numberOfChannels, sampleRate: decoded.sampleRate } };
      }, { version, filename, verify: values.verify }),
    ]);
    const file = fileURLToPath(new URL(filename, output));
    await download.saveAs(file);
    const bytes = await readFile(file);
    assert.equal(bytes.length, 44 + Math.round(seconds * 44100) * 4);
    assert.deepEqual(metrics.decoded, { duration: seconds, channels: 2, sampleRate: 44100 });
    if (values.verify) assert.ok(metrics.repeat.peakCodes <= 32 && metrics.repeat.rmsCodes < 1,
      'Repeat render differs beyond Web Audio rounding tolerance');
    const report = { file, version, browser: browser.version(), ...metrics,
      ...inspectWav(bytes, values.prototypes ? undefined : starwakeTrack),
      sha256: createHash('sha256').update(bytes).digest('hex') };
    reports.push(report);
    console.log(JSON.stringify(report));
  }
  assert.deepEqual(errors, []);
  if (values.prototypes) assert.ok(Math.abs(reports[0].bodyRmsDb - reports[1].bodyRmsDb) < .5, 'Audition loudness differs');
  await writeFile(new URL(values.prototypes ? 'audio-validation.json' : 'starwake-validation.json', output), JSON.stringify(reports, null, 2) + '\n');
} finally { await browser.close(); }
