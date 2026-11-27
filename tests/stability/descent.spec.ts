import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { branchLayout, sideForRoute } from '../../app/game/core/branches';
import type { RouteSide } from '../../app/game/core/branches';
import type { OutroPreset } from '../../app/game/debug/outro-inspection';
import type {} from '../harness/stability';

const candidate = { build: 'candidate', port: 8095 };
const reference = { build: 'reference', port: 8097 };
const paired = !!process.env.STABILITY_REFERENCE_DIR;
const order = paired ? [reference, candidate, candidate, reference] : [candidate, candidate];

const scenes: ReadonlyArray<{ name: string; beat: number; side?: RouteSide; preset?: OutroPreset }> = [
  { name: 'ORDER', beat: 16 }, { name: 'LOCK', beat: 70 }, { name: 'TRANSFER main', beat: 151 },
  { name: 'TRANSFER challenge', beat: 151, side: sideForRoute(branchLayout(0), 'challenge') },
  { name: 'TRANSFER bonus', beat: 151, side: sideForRoute(branchLayout(0), 'score') },
  { name: 'THE WELL', beat: 201 }, { name: 'CORE', beat: 278 },
  { name: 'LOCKDOWN', beat: 314 }, { name: 'BREACH', beat: 366 },
  { name: 'Encore', beat: 0, preset: 'encore-first' }, { name: 'Afterglow', beat: 0, preset: 'afterglow-peak' },
];

function log(scenario: string, fields: object) { console.log('STABILITY ' + JSON.stringify({ scenario, ...fields })); }
async function session(browser: Browser, port: number, width: number, height: number) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/?stability`);
  await page.waitForFunction(() => !!window.stability);
  return page;
}

test('@p3-profile · isolated facility construction', async ({ browser }, info) => {
  const { port, build } = paired ? reference : candidate;
  const page = await session(browser, port, 960, 540);
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
    const result = await page.evaluate(() => window.stability.descentConstruction(32));
    const { profile } = await cdp.send('Profiler.stop');
    await writeFile(info.outputPath(`facility-${build}.cpuprofile`), JSON.stringify(profile));
    log('p3-profile', { build, result });
    expect(result).toHaveLength(7);
  } finally { await page.close(); }
});

test('@p3-cpu · repeated facility construction', async ({ browser }) => {
  for (const [trial, { port, build }] of order.entries()) {
    const page = await session(browser, port, 960, 540);
    try {
      const result = await page.evaluate(() => window.stability.descentConstruction(32));
      log('p3-cpu', { trial, build, result });
      expect(result.every(zone => zone.facilityBuild.n === 32)).toBe(true);
    } finally { await page.close(); }
  }
});

test('@p3-attribution · isolate 1080p facility colour passes', async ({ browser }) => {
  const probes = ['baseline', 'without-facility-structure', 'without-facility-lenses', 'without-laser-panes'] as const;
  for (const scene of scenes.filter(scene => ['TRANSFER main', 'THE WELL', 'CORE', 'LOCKDOWN'].includes(scene.name))) {
    for (let trial = 0; trial < 3; trial++) {
      const page = await session(browser, paired ? reference.port : candidate.port, 1920, 1080);
      try {
        for (const probe of trial === 1 ? [...probes].reverse() : probes) {
          const sample = await page.evaluate(({ beat, probe }) => window.stability.fixedGlass(beat, 'high',
            false, 'standard', 'center', 224, false,
            { volumeId: 'descent', difficulty: 'impossible', dynamic: true, useViewport: true, gpuProbe: probe }),
          { beat: scene.beat, probe });
          log('p3-attribution', { trial, name: scene.name, probe, ...sample });
          expect(sample.glError).toBe(0);
        }
      } finally { await page.close(); }
    }
  }
});

test('@p3-fixed · chapters, routes and ending at 1080p High', async ({ browser }, info) => {
  const images = new Map<string, string>();
  for (const [trial, { port, build }] of order.entries()) {
    const page = await session(browser, port, 1920, 1080);
    try {
      for (const scene of scenes) {
        const { image, ...sample } = await page.evaluate(({ beat, side, preset, image }) =>
          window.stability.fixedGlass(beat, 'high', false, 'standard', side ?? 'center', 224, false,
            { volumeId: 'descent', difficulty: 'impossible', dynamic: true, useViewport: true, image, preset, tunnelTrace: true }),
        { ...scene, image: trial < 2 });
        expect(sample.glError).toBe(0);
        if (scene.side) expect(sample.route).toBe(scene.name.endsWith('bonus') ? 'score' : 'challenge');
        log('p3-fixed', { trial, build, name: scene.name, ...sample });
        if (image) {
          const png = Buffer.from(image.split(',')[1], 'base64');
          await writeFile(info.outputPath(`${scene.name.replaceAll(' ', '-')}-${trial}-${build}.png`), png);
          const sha = createHash('sha256').update(png).digest('hex');
          if (images.has(scene.name)) expect(sha, scene.name).toBe(images.get(scene.name));
          else images.set(scene.name, sha);
        }
      }
    } finally { await page.close(); }
  }
});

test('@p3-lifecycle · reload facility rooms, quality and context', async ({ browser }) => {
  for (const [trial, { port, build }] of order.entries()) {
    const page = await session(browser, port, 960, 540);
    try {
      const cold = await page.evaluate(() => window.stability.mount('descent', 'high', false, true));
      const canvas = page.locator('canvas');
      for (let cycle = 0; cycle < 2; cycle++) {
        for (const id of ['elsewhere', 'descent', 'daybreak', 'descent', 'orbit', 'descent'] as const) {
          const entry = await page.evaluate(id => window.stability.select(id), id);
          expect(entry.metrics.renderedVolume).toBe(id);
          expect(entry.metrics.glError).toBe(0);
          await expect(canvas).toHaveCount(1);
          if (id !== 'descent') continue;
          for (const q of ['low', 'auto', 'high'] as const) await page.evaluate(q => window.stability.quality(q), q);
          await page.evaluate(() => window.stability.start());
          await page.waitForFunction(() => window.stability.state().phase === 'playing');
          if (cycle === 1) {
            const extension = await canvas.evaluateHandle((element: HTMLCanvasElement) =>
              element.getContext('webgl2')!.getExtension('WEBGL_lose_context')!);
            try {
              await extension.evaluate(ext => ext.loseContext());
              await page.waitForFunction(() => window.stability.state().phase === 'paused');
              await extension.evaluate(ext => ext.restoreContext());
              await page.waitForFunction(() => window.stability.state().phase === 'playing');
            } finally { await extension.dispose(); }
          }
          await page.evaluate(() => window.stability.menu());
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          const menu = await page.evaluate(() => window.stability.metrics());
          expect(menu.glError).toBe(0);
          expect(menu.chunks).toBeLessThanOrEqual(5);
          log('p3-lifecycle', { trial, build, cycle, coldMs: cold.readyMs, coldBuild: cold.trace.cpu, entry, menu });
        }
      }
      const gl = await canvas.evaluateHandle((element: HTMLCanvasElement) => element.getContext('webgl2')!);
      await page.evaluate(() => window.stability.dispose());
      await expect(canvas).toHaveCount(0);
      expect(await gl.evaluate(context => context.isContextLost())).toBe(true);
      await gl.dispose();
      expect(await page.evaluate(() => window.stability.state())).toMatchObject({
        raf: false, scheduler: false, listenersReleased: true, inputReleased: true,
      });
    } finally { await page.close(); }
  }
});
