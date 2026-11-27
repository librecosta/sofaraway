import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { QualityTier } from '../../app/game/contracts';
import { branchLayout, sideForRoute } from '../../app/game/core/branches';
import type { RouteSide } from '../../app/game/core/branches';
import { orbitLandmarkBeats } from '../../app/game/core/orbit-setpieces';
import type { OutroPreset } from '../../app/game/debug/outro-inspection';
import type {} from '../harness/stability';

const reference = { build: 'reference', port: 8097 };
const candidate = { build: 'candidate', port: 8095 };
const paired = !!process.env.STABILITY_REFERENCE_DIR;
const order = paired ? [reference, candidate, candidate, reference] : [candidate, candidate];
const hashes = {
  celestial: '43a31b8b3a8d4630801c1c04126f4748f9cdd8e6e12ea4e4602a8b1f7198a93d',
  asteroid: 'b647a4a0404c7116730d3c6a09ddb65484e345e75a6d4165ca72b5f5a7e1cd0f',
};

type View = { name: string; beat: number; side?: RouteSide; preset?: OutroPreset };
type Display = { name: string; width: number; height: number; dpr: number; quality: QualityTier; touch?: boolean; post?: boolean };
const desktop: Display = { name: '1080-high', width: 1920, height: 1080, dpr: 1, quality: 'high' };
const setup: Display = { name: '540-high', width: 960, height: 540, dpr: 1, quality: 'high' };
const views: readonly View[] = [
  ...['OUTER BELT', 'DRIFT', 'RINGBREAK', 'MAELSTROM', 'ECLIPSE', 'AURORA', 'APHELION'].map(
    (name, index) => ({ name, beat: orbitLandmarkBeats[index] })),
  { name: 'Challenge', beat: 138, side: sideForRoute(branchLayout(0), 'challenge') },
  { name: 'Bonus', beat: 138, side: sideForRoute(branchLayout(0), 'score') },
  { name: 'Encore', beat: 0, preset: 'encore-middle' },
  { name: 'Afterglow', beat: 0, preset: 'afterglow-peak' },
];

function log(scenario: string, fields: object) { console.log('STABILITY ' + JSON.stringify({ scenario, ...fields })); }

async function session(browser: Browser, port: number, profile: Display) {
  const page = await browser.newPage({
    viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.dpr,
    hasTouch: profile.touch, isMobile: profile.touch,
  });
  await page.goto(`http://127.0.0.1:${port}/?stability`);
  await page.waitForFunction(() => !!window.stability);
  return page;
}

test('@p4-profile · cold ORBIT preparation', async ({ browser }, info) => {
  const { port, build } = paired ? reference : candidate;
  const page = await session(browser, port, setup);
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
    const mounted = await page.evaluate(() => window.stability.mount('orbit', 'high'));
    const { profile } = await cdp.send('Profiler.stop');
    await writeFile(info.outputPath(`cold-orbit-${build}.cpuprofile`), JSON.stringify(profile));
    log('p4-profile', { build, mounted });
    expect(mounted.metrics.glError).toBe(0);
  } finally {
    await page.evaluate(() => window.stability.dispose());
    await page.close();
  }
});

test('@p4-bake · paired procedural bakes and world lifecycle', async ({ browser }) => {
  for (const [trial, { port, build }] of order.entries()) {
    const page = await session(browser, port, setup);
    try {
      const mounted = await page.evaluate(() => window.stability.mount('orbit', 'high'));
      const canvas = page.locator('canvas');
      log('p4-mount', { build, trial, ...mounted });
      for (const id of ['elsewhere', 'orbit', 'daybreak', 'orbit', 'descent', 'orbit'] as const) {
        const selected = await page.evaluate(id => window.stability.select(id), id);
        log('p4-switch', { build, trial, id, ...selected });
        expect(selected.metrics.renderedVolume).toBe(id);
        expect(selected.metrics.glError).toBe(0);
        await expect(canvas).toHaveCount(1);
      }
      for (const quality of ['low', 'auto', 'high'] as const) {
        await page.evaluate(quality => window.stability.quality(quality), quality);
      }
      await page.evaluate(() => window.stability.start());
      await page.waitForFunction(() => window.stability.state().phase === 'playing');
      const gl = await canvas.evaluateHandle((el: HTMLCanvasElement) => el.getContext('webgl2')!);
      const lose = await gl.evaluateHandle(gl => gl.getExtension('WEBGL_lose_context')!);
      try {
        await lose.evaluate(ext => ext.loseContext());
        await page.waitForFunction(() => window.stability.state().phase === 'paused');
        await lose.evaluate(ext => ext.restoreContext());
        await page.waitForFunction(() => window.stability.state().phase === 'playing');
        expect(await page.evaluate(() => window.stability.metrics().glError)).toBe(0);
        await page.evaluate(() => window.stability.menu());
        await page.evaluate(() => window.stability.dispose());
        await expect(canvas).toHaveCount(0);
        expect(await gl.evaluate(gl => gl.isContextLost())).toBe(true);
        const released = await page.evaluate(() => window.stability.state());
        expect(released).toMatchObject({ raf: false, scheduler: false, listenersReleased: true, inputReleased: true });
        log('p4-release', { build, trial, released });
      } finally {
        await lose.dispose();
        await gl.dispose();
      }
      const bakes = await page.evaluate(() => window.stability.orbitFieldBake());
      for (const result of bakes) {
        expect(new Set(result.hashes)).toEqual(new Set([hashes[result.field]]));
        log('p4-bake', { build, trial, ...result });
      }
    } finally { await page.close(); }
  }
});

test('@p4-fixed · paired ORBIT chapters and pixel-density profiles', async ({ browser }, info) => {
  const profiles: Display[] = [
    setup, { name: '720-auto', width: 1280, height: 720, dpr: 1, quality: 'auto' }, desktop,
    { ...setup, name: '540-dpr2', dpr: 2 },
    { name: '390-touch-auto', width: 390, height: 844, dpr: 2, quality: 'auto', touch: true },
    { ...setup, name: '540-low-direct', quality: 'low', post: false },
  ];
  const pngs = new Map<string, string>();
  for (const [trial, { port, build }] of order.entries()) for (const profile of profiles) {
    const page = await session(browser, port, profile);
    try {
      const list = profile === desktop ? views : views.filter(view => ['AURORA', 'APHELION'].includes(view.name));
      for (const view of list) {
        const { image, ...sample } = await page.evaluate(({ view, profile, image }) =>
          window.stability.fixedGlass(view.beat, profile.quality, false, 'standard', view.side ?? 'center', 192, false,
            { volumeId: 'orbit', difficulty: 'impossible', dynamic: true, useViewport: true, post: profile.post, image, preset: view.preset }),
        { view, profile, image: trial < 2 });
        expect(sample.glError).toBe(0);
        expect(sample.metrics.dof).toBe(false);
        if (view.side) expect(sample.route).toBe(view.name === 'Bonus' ? 'score' : 'challenge');
        log('p4-fixed', { build, trial, profile, view: view.name, ...sample });
        if (!image) continue;
        const key = `${profile.name}-${view.name.replaceAll(' ', '-')}`;
        const bytes = Buffer.from(image.split(',')[1], 'base64');
        const hash = createHash('sha256').update(bytes).digest('hex');
        await writeFile(info.outputPath(`${key}-${build}-${trial}.png`), bytes);
        if (pngs.has(key)) expect(hash, key).toBe(pngs.get(key));
        else pngs.set(key, hash);
      }
    } finally { await page.close(); }
  }
});

test('@p4-attribution · layer masks and locked asteroid LOD', async ({ browser }) => {
  const probes = ['baseline', 'without-orbit-debris', 'without-orbit-landmarks',
    'without-orbit-nebula', 'without-orbit-celestials'] as const;
  const { build, port } = paired ? reference : candidate;
  for (const view of views.filter(view => ['DRIFT', 'AURORA', 'APHELION'].includes(view.name))) {
    for (let trial = 0; trial < 3; trial++) for (const profile of [setup, desktop]) {
      const page = await session(browser, port, profile);
      try {
        for (const probe of profile === setup ? ['baseline'] as const : trial === 1 ? [...probes].reverse() : probes) {
          const sample = await page.evaluate(({ beat, probe }) =>
            window.stability.fixedGlass(beat, 'high', false, 'standard', 'center', 192, false,
              { volumeId: 'orbit', difficulty: 'impossible', dynamic: true, useViewport: true, gpuProbe: probe, orbitLodHeight: 540 }),
          { beat: view.beat, probe });
          log('p4-attribution', { build, trial, profile: profile.name, view: view.name, probe, ...sample });
          expect(sample.glError).toBe(0);
        }
      } finally { await page.close(); }
    }
  }
});
