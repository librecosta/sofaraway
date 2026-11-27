import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { branchLayout, routeSides } from '../../app/game/core/branches';
import { OutroInspection } from '../../app/game/debug/outro-inspection';
import type { ExteriorView, OutroPreset } from '../../app/game/debug/outro-inspection';
import { volumeById } from '../../app/game/core/volumes';
import type { QualityTier } from '../../app/game/contracts';
import type {} from '../harness/stability';

const paired = !!process.env.STABILITY_REFERENCE_DIR;
const reference = { port: 8097, build: 'reference' };
const candidate = { port: 8095, build: 'candidate' };
const pairOrder = paired ? [reference, candidate, candidate, reference] : [candidate, candidate];
const daybreak = volumeById('daybreak');
const chapterBeats = Object.fromEntries(daybreak.sections.map(({ name, beats }, index) =>
  [name, daybreak.sections.slice(0, index).reduce((total, item) => total + item.beats, 0) + beats / 2]));
const benchmarkProfiles = [
  { label: '540-high', width: 960, height: 540, dpr: 1, quality: 'high' },
  { label: '720-auto', width: 1280, height: 720, dpr: 1, quality: 'auto' },
  { label: '1080-high', width: 1920, height: 1080, dpr: 1, quality: 'high' },
  { label: '540-retina', width: 960, height: 540, dpr: 2, quality: 'high' },
  { label: '390-touch', width: 390, height: 844, dpr: 2, quality: 'auto', touch: true },
  { label: '540-low', width: 960, height: 540, dpr: 1, quality: 'low' },
] as const satisfies readonly { label: string; width: number; height: number; dpr: number; quality: QualityTier; touch?: boolean }[];

function evidence(scenario: string, data: object) {
  console.log('STABILITY ' + JSON.stringify({ scenario, ...data }));
}

const viewProbes = {
  Forward: ['full', 'without-exterior', 'sky-only', 'without-canopy', 'without-gate-glass'],
  'Look Up': ['full', 'without-exterior', 'sky-only', 'flat-sky', 'without-cirrus', 'without-canopy'],
  Horizon: ['full', 'without-exterior', 'without-clouds', 'without-canopy'],
  'Cloud Sea': ['full', 'without-exterior', 'without-clouds', 'without-relief', 'without-swells'],
} as const;
for (const [view, probes] of Object.entries(viewProbes)) {
  test(`@p2-attribution · ${view}`, async ({ browser }) => {
    const port = paired ? reference.port : candidate.port;
    for (let trial = 0; trial < 3; trial++) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      try {
        await page.goto(`http://127.0.0.1:${port}/?stability`);
        await page.waitForFunction(() => !!window.stability);
        for (const probe of trial === 1 ? [...probes].reverse() : probes) {
          const result = await page.evaluate(({ view, beat, probe }) => window.stability.fixedGlass(beat, 'high', false,
            'standard', 'center', 224, false, { volumeId: 'daybreak', difficulty: 'impossible', dynamic: true,
              useViewport: true, view, exteriorProbe: probe }),
          { view: view as ExteriorView, beat: chapterBeats[view === 'Look Up' ? 'LIFT' : 'SUNBURST'], probe });
          evidence('p2-attribution', { trial, view, probe, browser: browser.version(), ...result });
          expect(result.glError).toBe(0);
          expect(result.trace.frame.n).toBeGreaterThan(210);
        }
        expect(errors).toEqual([]);
      } finally { await page.close(); }
    }
  });
}

for (const profile of benchmarkProfiles) {
  test(`@p2-paired · ${profile.label}`, async ({ browser }, info) => {
    const touch = 'touch' in profile;
    const views: readonly ExteriorView[] = profile.label === '1080-high'
      ? ['Forward', 'Look Up', 'Horizon', 'Cloud Sea'] : ['Forward', 'Look Up', 'Cloud Sea'];
    for (const [trial, { port, build }] of pairOrder.entries()) {
      const page = await browser.newPage({ viewport: { width: profile.width, height: profile.height },
        deviceScaleFactor: profile.dpr, hasTouch: touch, isMobile: touch });
      try {
        await page.goto(`http://127.0.0.1:${port}/?stability`);
        await page.waitForFunction(() => !!window.stability);
        for (const view of views) {
          const { image, ...result } = await page.evaluate(({ quality, beat, view, image }) => window.stability.fixedGlass(beat, quality, false,
            'standard', 'center', 280, false, { volumeId: 'daybreak', difficulty: 'impossible', dynamic: true,
              useViewport: true, image, view, exteriorProbe: 'full' }),
          { quality: profile.quality, beat: chapterBeats[view === 'Look Up' ? 'LIFT' : 'SUNBURST'], view, image: trial < 2 });
          evidence('p2-paired', { trial, build, profile, view, browser: browser.version(), ...result });
          if (image) {
            const png = Buffer.from(image.split(',')[1], 'base64');
            const path = info.outputPath(`${trial}-${view.replaceAll(' ', '-')}.png`);
            await writeFile(path, png);
            evidence('p2-image', { build, profile: profile.label, name: view, path, sha256: createHash('sha256').update(png).digest('hex') });
          }
          expect(result.glError).toBe(0);
          expect(result.trace.frame.n).toBeGreaterThan(270);
        }
        if (profile.label === '1080-high') evidence('p2-bake', { trial, build, fields: await page.evaluate(() => window.stability.daybreakFieldBake()) });
      } finally { await page.close(); }
    }
  });
}

test('@p2-visual · official chapters and escape', async ({ browser }, info) => {
  const fixtures: { name: string; beat: number; view?: ExteriorView; preset?: OutroPreset }[] = [
    ...Object.entries(chapterBeats).map(([name, beat]) => ({ name, beat })),
    { name: 'escape-start', beat: 0, preset: 'white-start' },
    { name: 'escape-peak', beat: 0, preset: 'white-peak' },
    { name: 'encore', beat: 0, preset: 'encore-first' },
    { name: 'afterglow', beat: 0, preset: 'afterglow-peak', view: 'Cloud Sea' },
  ];
  for (const { port, build } of paired ? [reference, candidate] : [candidate]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    try {
      await page.goto(`http://127.0.0.1:${port}/?stability`);
      await page.waitForFunction(() => !!window.stability);
      for (const fixture of fixtures) {
        const { image, ...result } = await page.evaluate(({ beat, preset, view }) => window.stability.fixedGlass(beat, 'high', false,
          'standard', 'center', 224, false, { volumeId: 'daybreak', difficulty: 'impossible', dynamic: true,
            useViewport: true, image: true, preset, view, exteriorProbe: 'full' }), fixture);
        expect(result.glError).toBe(0);
        const png = Buffer.from(image!.split(',')[1], 'base64');
        const path = info.outputPath(`${fixture.name}-${build}.png`);
        await writeFile(path, png);
        evidence('p2-image', { build, profile: '1080-high', name: fixture.name, path, sha256: createHash('sha256').update(png).digest('hex') });
        evidence('p2-chapter', { build, name: fixture.name, ...result });
      }
    } finally { await page.close(); }
  }
});

test('@p2-startup · cold and warm cabin entry', async ({ browser }) => {
  for (const [trial, { port, build }] of pairOrder.entries()) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    try {
      await page.goto(`http://127.0.0.1:${port}/?stability`);
      await page.waitForFunction(() => !!window.stability);
      const sample = await page.evaluate(async () => {
        const cold = await window.stability.mount('daybreak', 'high');
        await window.stability.select('elsewhere');
        const warm = await window.stability.select('daybreak');
        window.stability.dispose();
        return { cold, warm };
      });
      expect(sample.cold.metrics.glError).toBe(0);
      expect(sample.warm.metrics.glError).toBe(0);
      expect(sample.warm.metrics.renderedVolume).toBe('daybreak');
      evidence('p2-startup', { trial, build, ...sample });
    } finally { await page.close(); }
  }
});

for (const { port, build } of paired ? [reference, candidate] : [candidate]) test(
  `@p2-lifecycle · repeated DAYBREAK entries, resize and restore · ${build}`, async ({ page }) => {
  const messages: string[] = [];
  page.on('console', message => {
    if (message.type() === 'warning' || message.type() === 'error') messages.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/?stability`);
  await page.waitForFunction(() => !!window.stability);
  await page.evaluate(() => window.stability.mount('elsewhere', 'high'));
  const canvas = page.locator('canvas');
  const samples = [];
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const id of ['elsewhere', 'daybreak', 'descent', 'daybreak', 'orbit', 'daybreak'] as const) {
      const entry = await page.evaluate(id => window.stability.select(id), id);
      expect(entry.metrics.renderedVolume).toBe(id);
      expect(entry.metrics.glError, `${build} ${id} entry in cycle ${cycle}: ${messages.slice(-8).join('\n')}`).toBe(0);
      await expect(canvas).toHaveCount(1);
      if (id !== 'daybreak') continue;
      for (const quality of ['low', 'auto', 'high'] as const) await page.evaluate(q => window.stability.quality(q), quality);
      await page.evaluate(() => window.stability.start());
      await page.waitForFunction(() => window.stability.state().phase === 'playing');
      if (cycle === 1) {
        await page.setViewportSize({ width: 1280, height: 720 });
        await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBe(1280);
        const extension = await canvas.evaluateHandle((element: HTMLCanvasElement) =>
          element.getContext('webgl2')!.getExtension('WEBGL_lose_context')!);
        try {
          await extension.evaluate(ext => ext.loseContext());
          await page.waitForFunction(() => window.stability.state().phase === 'paused');
          await extension.evaluate(ext => ext.restoreContext());
          await page.waitForFunction(() => window.stability.state().phase === 'playing');
        } finally { await extension.dispose(); }
        await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBe(1280);
        await page.setViewportSize({ width: 960, height: 540 });
        await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBe(960);
      }
      await page.evaluate(() => window.stability.menu());
      await page.waitForFunction(() => window.stability.state().phase === 'menu');
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const metrics = await page.evaluate(() => window.stability.metrics());
      expect(metrics.exterior).toBeDefined();
      expect(metrics.glError).toBe(0);
      samples.push({ cycle, textures: metrics.textures, programs: metrics.programs, geometries: metrics.geometries });
    }
  }
  const context = await canvas.evaluateHandle((element: HTMLCanvasElement) => element.getContext('webgl2')!);
  await page.evaluate(() => window.stability.dispose());
  await expect(canvas).toHaveCount(0);
  expect(await context.evaluate(gl => gl.isContextLost())).toBe(true);
  await context.dispose();
  const released = await page.evaluate(() => window.stability.state());
  expect(released).toMatchObject({ raf: false, scheduler: false, listenersReleased: true, inputReleased: true });
  evidence('p2-lifecycle', { build, samples, released });
});

for (const route of ['main', 'challenge', 'score'] as const) {
  test(`@p2-flight · audio-led DAYBREAK Showcase ${route}`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`http://127.0.0.1:${candidate.port}/?stability`);
      await page.waitForFunction(() => !!window.stability);
      await page.evaluate(route => window.stability.mount('daybreak', 'auto', true, false, route), route);
      await page.getByRole('button', { name: 'Start with audio' }).click();
      await page.waitForFunction(() => window.stability.state().phase === 'playing');
      expect(await page.evaluate(() => window.stability.state().scheduler)).toBe(true);
      const trace = await page.evaluate(() => window.stability.capture(170_000, true));
      const result = await page.evaluate(() => window.stability.metrics());
      expect(result.effectiveDifficulty).toBe('impossible');
      expect(result.snapshot).toMatchObject({ phase: 'results', mode: 'showcase', route, score: 0, result: { title: 'ESCAPED' } });
      expect(result.snapshot.gatesPassed).toBe(result.snapshot.gatesTotal);
      expect(result.hits).toBe(0);
      expect(result.glError).toBe(0);
      expect(result.audioDiagnostics).toMatchObject({ missedSteps: 0, silentFallbacks: 0 });
      await page.waitForFunction(() => !window.stability.state().scheduler && !window.stability.state().runBus);
      await page.evaluate(() => window.stability.dispose());
      await page.waitForFunction(() => window.stability.state().audio === 'closed');
      evidence('p2-flight', { route, result, trace, released: await page.evaluate(() => window.stability.state()) });
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  });
}

test('DAYBREAK frame and streaming measurements @daybreak-perf', async ({ browser }) => {
  const ports = process.env.STABILITY_REFERENCE_DIR ? [8097, 8095] : [8095];
  for (const port of ports) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    try {
      await page.goto(`http://127.0.0.1:${port}/?stability`);
      await page.waitForFunction(() => !!window.stability);
      const sample = await page.evaluate(async () => {
        const menu = await window.stability.mount('daybreak', 'low');
        const idle = await window.stability.capture(1500);
        await window.stability.start(true);
        const play = await window.stability.capture(1500);
        const metrics = window.stability.metrics();
        window.stability.dispose();
        return { readyMs: menu.readyMs, idle: idle.cpu.frame, play: play.cpu.frame, gpu: play.gpu.frame, gpuStatus: play.gpuStatus, metrics };
      });
      console.log('DAYBREAK PERF', JSON.stringify({ build: port === 8095 ? 'candidate' : 'baseline', ...sample }));
      expect(sample.metrics.glError).toBe(0);
      expect(sample.metrics.snapshot.phase).toBe('playing');
      const build = port === 8095 ? 'candidate' : 'baseline';
      const layout = branchLayout(0);
      const volume = volumeById('daybreak');
      const inspection = new OutroInspection('standard', 0, 'main', undefined, 'normal', volume);
      const junctionFrames = routeSides.map(side => {
        const route = layout[side];
        const station = inspection.sim.junctionPath!.open + 85;
        return { name: `${route}-interior`, side, beat: 240, station, difficulty: 'normal' as const };
      });
      const otherFrames = ([['branch-entry', 232], ['encore-first', 200], ['afterglow-peak', 277]] as const).map(([name, beat]) =>
        ({ name, side: 'center' as const, beat, station: inspection.view(name).station, difficulty: 'normal' as const }));
      const sunburst = inspection.sim.reference.station(194, 'standard');
      const normal = { name: 'normal-sunburst', station: sunburst, beat: 194, side: 'center', difficulty: 'normal' } as const;
      const white = new OutroInspection('standard', 0, 'main', undefined, 'impossible', volume).view('white-start');
      const added = port === 8095 ? [
        { ...normal, name: 'impossible-sunburst', difficulty: 'impossible' },
        { ...normal, name: 'impossible-ending', station: white.station, beat: 276, difficulty: 'impossible' },
      ] as const : [];
      for (const { name, station, beat, side, difficulty } of [...otherFrames, ...junctionFrames, normal, ...added]) {
        const result = await page.evaluate(({ station, beat, side, name, difficulty }) => window.stability.fixedGlass(beat, 'low', true, 'standard',
          side, 180, false, { station, inspection: true, fly: name !== 'branch-entry', difficulty, volumeId: 'daybreak' }),
        { station, beat, side, name, difficulty });
        console.log('DAYBREAK PERF', JSON.stringify({ build, name, ...result }));
        expect(result.glError).toBe(0);
        expect(result.metrics.continuity!.farThrough).toBe(result.pathLength);
        expect(result.metrics.continuity!.farBytes).toBeLessThan(400_000);
        expect(result.metrics.chunks).toBeLessThanOrEqual(4);
      }
    } finally { await page.close(); }
  }
});
