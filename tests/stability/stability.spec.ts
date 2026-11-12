import { devices, expect, test, webkit } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { VOLUMES } from '../../app/game/core/volumes';
import { STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import type { QualityTier, VolumeId } from '../../app/game/contracts';
import type {} from '../harness/stability';

const candidate = { label: 'candidate', client: 'http://127.0.0.1:8094', harness: 'http://127.0.0.1:8095' };
const reference = { label: 'reference', client: 'http://127.0.0.1:8096', harness: 'http://127.0.0.1:8097' };
const haveReference = !!process.env.STABILITY_REFERENCE_DIR;
const builds = haveReference ? [reference, candidate, candidate, reference] : [candidate, candidate];
const profiles: { volume: VolumeId; quality: QualityTier; width: number; height: number; dpr: number; mobile?: boolean }[] = [
  { volume: 'elsewhere', quality: 'high', width: 960, height: 540, dpr: 1 },
  { volume: 'elsewhere', quality: 'low', width: 960, height: 540, dpr: 1 },
  { volume: 'elsewhere', quality: 'high', width: 1920, height: 1080, dpr: 1 },
  { volume: 'descent', quality: 'high', width: 960, height: 540, dpr: 1 },
  { volume: 'orbit', quality: 'low', width: 960, height: 540, dpr: 1 },
  { volume: 'orbit', quality: 'high', width: 960, height: 540, dpr: 1 },
  { volume: 'drift', quality: 'auto', width: 390, height: 664, dpr: 2, mobile: true },
  { volume: 'drift', quality: 'auto', width: 390, height: 664, dpr: 3, mobile: true },
];

function log(scenario: string, fields: object) {
  console.log('STABILITY ' + JSON.stringify({ scenario, ...fields }));
}

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`${message.location().url} ${message.text()}`);
  });
  return errors;
}

async function openHarness(page: Page, build = candidate) {
  await page.goto(build.harness + '/?stability');
  await page.waitForFunction(() => !!window.stability);
}

async function productionStartup(browser: Browser, url: string) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.addInitScript(() => {
    const capture = { readyAt: 0, longTasks: [] as number[] };
    Reflect.set(window, '__startupSample', capture);
    const ready = new MutationObserver(() => {
      if (document.querySelector('[data-act=start]:enabled')) {
        capture.readyAt = performance.now();
        ready.disconnect();
      }
    });
    ready.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      new PerformanceObserver(list => {
        capture.longTasks.push(...list.getEntries().map(entry => entry.duration));
      }).observe({ type: 'longtask', buffered: true });
    }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  try {
    const samples = [];
    for (const cache of ['cold', 'warm']) {
      const target = new URL(url);
      if (cache === 'warm') target.searchParams.set('benchmark', 'warm');
      const before = await cdp.send('Performance.getMetrics');
      const at = performance.now();
      await page.goto(target.href, { waitUntil: 'commit' });
      await expect(page.locator('[data-act=start]')).toBeEnabled();
      const readyMs = performance.now() - at;
      expect(await page.evaluate(() => typeof window.stability)).toBe('undefined');
      const after = await cdp.send('Performance.getMetrics');
      const engine = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'V8CompileDuration'].map(name => {
        const value = after.metrics.find(metric => metric.name === name)?.value;
        return [name, value === undefined ? null : (value - (before.metrics.find(metric => metric.name === name)?.value ?? 0)) * 1000];
      }));
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const js = resources.filter(entry => entry.name.endsWith('.js'));
        const runtime = js.find(entry => /GameRuntime\.client-/.test(entry.name));
        const startup = Reflect.get(window, '__startupSample') as { readyAt: number; longTasks: number[] };
        return { ...startup, responseEnd: nav.responseEnd, domInteractive: nav.domInteractive,
          jsBytes: js.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
          jsTransferBytes: js.reduce((sum, entry) => sum + entry.transferSize, 0),
          runtime: runtime && { start: runtime.startTime, end: runtime.responseEnd, bytes: runtime.decodedBodySize,
            transfer: runtime.transferSize },
          runtimeInitMs: Number(JSON.parse(document.querySelector('#errbox')?.textContent || '{}').initMs) };
      });
      samples.push({ cache, readyMs, ...engine, ...timing });
    }
    return samples;
  } finally { await page.close(); }
}

test('benchmark production load, shader warmup and chunk construction', async ({ browser }) => {
  for (const [sample, build] of builds.entries()) {
    const startup = await productionStartup(browser, build.client + '/?vol=elsewhere&q=high&dbg=1');
    log('startup', { browser: browser.version(), build: build.label, sample, startup });
    expect(startup[0].jsTransferBytes).toBeGreaterThan(0);
    expect(startup[1].jsTransferBytes).toBeLessThan(startup[0].jsTransferBytes);
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    try {
      await openHarness(page, build);
      for (const { id } of VOLUMES) {
        const result = await page.evaluate(id => window.stability.stream(id), id);
        expect(result.resources.currentDisposals).toBe(result.resources.expectedDisposals);
        expect(result.resources.remaining).toBe(0);
        expect(result.trace.cpu.chunk.n).toBeGreaterThan(4);
        log('chunks', { build: build.label, sample, volume: id, chunk: result.trace.cpu.chunk,
          path: result.trace.cpu.pathStep, counts: result.resources.counts });
      }
    } finally { await page.close(); }
  }
});

for (const profile of profiles) {
  test(`benchmark ${profile.volume} ${profile.quality} ${profile.width}x${profile.height} DPR ${profile.dpr}`, async ({ browser }) => {
    for (const [sample, build] of builds.entries()) {
      const page = await browser.newPage({ viewport: { width: profile.width, height: profile.height },
        deviceScaleFactor: profile.dpr, hasTouch: profile.mobile, isMobile: profile.mobile });
      const errors = captureErrors(page);
      try {
        await openHarness(page, build);
        const init = await page.evaluate(({ volume, quality }) => window.stability.mount(volume, quality), profile);
        await page.evaluate(() => window.stability.start());
        await page.waitForTimeout(1000);
        const sampleMs = 5400;
        const play = await page.evaluate(ms => window.stability.capture(ms), sampleMs);
        const live = await page.evaluate(() => window.stability.metrics());
        const heap = await (await page.context().newCDPSession(page)).send('Runtime.getHeapUsage');
        await page.evaluate(() => window.stability.menu());
        const next = VOLUMES[(VOLUMES.findIndex(v => v.id === profile.volume) + 1) % VOLUMES.length].id;
        const switched = await page.evaluate(next => window.stability.select(next), next);
        const software = /swiftshader|llvmpipe|software|warp/i.test(live.renderer);
        log('frame', { ...profile, browser: browser.version(), build: build.label, sample, sampleMs,
          rendererClass: software ? 'software' : 'hardware-or-unidentified', init, play, live, heap, switched });
        expect(play.frame.n).toBeGreaterThan(0);
        expect(live.snapshot.phase).toBe('playing');
        expect(live.glError).toBe(0);
        expect(errors).toEqual([]);
      } finally { await page.close(); }
    }
  });
}

test('benchmark WebKit mobile compositor at DPR 2 and 3', async () => {
  const browser = await webkit.launch({ channel: undefined });
  try {
    for (const dpr of [2, 3]) {
      for (const [sample, build] of builds.entries()) {
        const page = await browser.newPage({ ...devices['iPhone 13'], deviceScaleFactor: dpr });
        const errors = captureErrors(page);
        try {
          await openHarness(page, build);
          const init = await page.evaluate(() => window.stability.mount('drift', 'auto'));
          await page.evaluate(() => window.stability.start());
          const play = await page.evaluate(() => window.stability.capture(3600));
          const live = await page.evaluate(() => window.stability.metrics());
          log('webkit', { browser: browser.version(), dpr, sample, build: build.label, init, play, live });
          expect(play.frame.n).toBeGreaterThan(0);
          expect(live.glError).toBe(0);
          expect(errors).toEqual([]);
          if (build === candidate) expect(live.snapshot.phase).toBe('playing');
        } finally { await page.close(); }
      }
    }
  } finally { await browser.close(); }
});

test('fixed-time visual comparison across four volumes @glass', async ({ browser }, info) => {
  if (!haveReference) { log('visual', { status: 'REFERENCE_NOT_CONFIGURED' }); return; }
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  try {
    for (const { id } of VOLUMES) {
      const images = [];
      // Compare ELSEWHERE during its original Iris-only section.
      const seconds = id === 'elsewhere' ? 36 : 83;
      for (const build of [reference, candidate]) {
        await page.goto(`${build.client}/?vol=${id}&q=high&t=${seconds}&align=1&ui=0&dbg=1`);
        await expect(page.locator('#errbox')).toContainText('"phase":"playing"');
        await page.addStyleTag({ content: '#errbox { display: none; }' });
        const path = id === 'elsewhere' ? info.outputPath(`iris-far-${build.label}.png`) : undefined;
        images.push(await page.locator('#gl').screenshot({ path }));
        if (path) await info.attach(`iris-far-${build.label}`, { path, contentType: 'image/png' });
      }
      const identical = images[1].equals(images[0]);
      log('visual', { id, seconds, status: identical ? 'IDENTICAL' : 'CHANGED' });
    }
    for (const [name, beat] of [['iris-near', 79.1], ['square', 107.2], ['diamond', 168.2], ['score', 333.5]] as const) {
      for (const build of [reference, candidate]) {
        await page.goto(`${build.client}/?vol=elsewhere&q=high&t=${beat * 60 / 128}&route=left&align=1&ui=0&dbg=1`);
        await expect(page.locator('#errbox')).toContainText('"phase":"playing"');
        await page.addStyleTag({ content: '#errbox { display: none; }' });
        if (name === 'score') await expect(page.locator('#hud-route')).toHaveText('BONUS');
        const path = info.outputPath(`${name}-${build.label}.png`);
        await page.locator('#gl').screenshot({ path });
        await info.attach(`${name}-${build.label}`, { path, contentType: 'image/png' });
      }
    }
    for (const build of [reference, candidate]) {
      await page.goto(build.harness);
      const result = await page.evaluate(() => window.b0Harness.inspectGlassOptics?.());
      if (result?.readability) log('optical-readback', { build: build.label,
        readability: result.readability, protectedPixels: result.protectedPixels, surface: result.surface });
    }
  } finally { await page.close(); }
});

test('ELSEWHERE material views and unaffected volumes @m0', async ({ browser }, info) => {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = captureErrors(page);
  try {
    const cases = [
      ['elsewhere', 'tunnel', '36', 'high', 'standard'],
      ['elsewhere', 'floor', '45', 'low', 'sightseeing'],
      ['elsewhere', 'junction', '156.328125', 'high', 'standard'],
      ...(['drift', 'descent', 'orbit'] as const).map(id => [id, id, '83', 'high', 'standard']),
    ];
    for (const [id, name, time, quality, mode] of cases) {
      const images: Buffer[] = [];
      for (const build of haveReference ? [reference, candidate] : [candidate]) {
        await page.goto(`${build.client}/?vol=${id}&t=${time}&q=${quality}&mode=${mode}&align=1&route=left&ui=0&dbg=1`);
        await expect(page.locator('#errbox')).toContainText('"phase":"playing"');
        await page.addStyleTag({ content: '#errbox { display: none; }' });
        const path = id === 'elsewhere' ? info.outputPath(`${name}-${build.label}.png`) : undefined;
        images.push(await page.locator('#gl').screenshot({ path }));
        if (path) await info.attach(`${name}-${build.label}`, { path, contentType: 'image/png' });
      }
      const equal = images.length === 2 && images[0].equals(images[1]);
      if (haveReference && id !== 'elsewhere') expect(equal, id).toBe(true);
      log('m0-image', { id, name, time, quality, mode, equal });
    }
    for (const build of haveReference ? [reference, candidate] : [candidate]) {
      const begin = performance.now();
      await page.goto(`${build.client}/debug/`);
      const target = page.locator('#materials');
      const count = build === candidate ? 7 : 4;
      await expect(target.locator('canvas[data-ready=true]')).toHaveCount(count);
      log('m0-debug', { build: build.label, browser: browser.version(), readyMs: performance.now() - begin, count });
      if (build === candidate) {
        await expect(target.locator('canvas[data-mode=lit]')).toHaveCount(6);
        await expect(page.locator('#effects canvas[data-mode=effect]')).toHaveCount(2);
      }
      for (const id of build === candidate ? ['materials', 'effects'] : ['materials']) {
        const path = info.outputPath(`debug-${id}-${build.label}.png`);
        await page.locator(`#${id}`).screenshot({ path });
        await info.attach(`debug-${id}-${build.label}`, { path, contentType: 'image/png' });
      }
    }
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});

test('ELSEWHERE material GPU cost @m0', async ({ browser }) => {
  for (const [sample, build] of builds.entries()) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const errors = captureErrors(page);
    try {
      await openHarness(page, build);
      for (const [name, beat, quality, boost, mode] of [
        ['cruise-high', 76.8, 'high', false, 'standard'], ['cruise-low', 76.8, 'low', false, 'standard'],
        ['boost', 168, 'high', true, 'standard'], ['tour', 180, 'high', false, 'sightseeing'],
        ['junction', 333.5, 'high', false, 'standard'],
      ] as const) {
        const result = await page.evaluate(([beat, quality, boost, mode]) => window.stability.fixedGlass(beat, quality, boost, mode),
          [beat, quality, boost, mode] as const);
        log('m0-frame', { name, sample, build: build.label, browser: browser.version(), ...result });
        expect(result.phase).toBe('playing');
        expect(result.glError).toBe(0);
        expect(result.trace.cpu.frame.n).toBe(480);
        if (name === 'junction') expect(result.route).toBe('score');
        if (name === 'tour') expect(result.speed).toBeLessThan(12);
      }
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }
});

test('ELSEWHERE structure and light balance across the run @kit-visual', async ({ browser }, info) => {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = captureErrors(page);
  try {
    const cases = [
      ['elsewhere', 'intro', 2.7, 'standard', false],
      ['elsewhere', 'assembly', 1.917, 'standard', false],
      ['elsewhere', 'a', 37.9, 'standard', false],
      ['elsewhere', 'b', 53.283, 'standard', false],
      ['elsewhere', 'build-boost', 79, 'standard', true],
      ['elsewhere', 'drop', 107.45, 'standard', false],
      ['elsewhere', 'break', 140, 'standard', false],
      ['elsewhere', 'split', 149.92, 'standard', false],
      ['elsewhere', 'tour', 11.22, 'sightseeing', false],
      ...(['drift', 'descent', 'orbit'] as const).map(id => [id, id, 83, 'standard', false] as const),
    ] as const;
    for (const [volume, name, seconds, mode, boost] of cases) {
      const images: Buffer[] = [];
      for (const build of haveReference ? [reference, candidate] : [candidate]) {
        await page.goto(`${build.client}/?vol=${volume}&t=${seconds}&q=high&mode=${mode}&boost=${Number(boost)}&align=1&ui=0&dbg=1`);
        await expect(page.locator('#errbox')).toContainText('"phase":"playing"');
        await page.addStyleTag({ content: '#errbox { display: none; }' });
        const path = volume === 'elsewhere' ? info.outputPath(`${name}-${build.label}.png`) : undefined;
        const image = await page.locator('#gl').screenshot({ path });
        images.push(image);
        if (name === 'intro' || name === 'b') {
          const pixels = await page.evaluate(async png => {
            const response = await fetch('data:image/png;base64,' + png);
            const img = await createImageBitmap(await response.blob());
            const canvas = new OffscreenCanvas(img.width, img.height);
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            const { data } = ctx.getImageData(0, 0, img.width, img.height);
            let saturated = 0, midtone = 0;
            for (let i = 0; i < data.length; i += 4) {
              const peak = Math.max(data[i], data[i + 1], data[i + 2]);
              if (peak > 165 && peak - Math.min(data[i], data[i + 1], data[i + 2]) > 65) saturated++;
              const luminance = data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
              if (luminance >= 12 && luminance < 55) midtone++;
            }
            img.close();
            return { saturated, midtone };
          }, image.toString('base64'));
          log('kit-light', { name, build: build.label, ...pixels });
        }
      }
      const equal = images.length === 2 && images[0].equals(images[1]);
      if (haveReference && volume !== 'elsewhere') expect(equal, name).toBe(true);
      log('kit-image', { name, equal });
    }
    for (const build of haveReference ? [reference, candidate] : [candidate]) {
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        const contexts = new Set<unknown>();
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
          value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
            const gl = Reflect.apply(original, this, [type, ...args]);
            if (type === 'webgl2' && gl) contexts.add(gl);
            document.documentElement.dataset.kitContexts = String(contexts.size);
            return gl;
          },
        });
      });
      const start = performance.now();
      await page.goto(`${build.client}/debug/`);
      const count = build === candidate ? 29 : await page.locator('#props').count() ? 31 : 24;
      await expect(page.locator('canvas[data-ready=true]')).toHaveCount(count);
      const contexts = Number(await page.locator('html').getAttribute('data-kit-contexts'));
      expect(contexts).toBeLessThanOrEqual(2);
      log('kit-debug', { build: build.label, readyMs: performance.now() - start, contexts });
      if (build === candidate) await page.locator('#structure').screenshot({ path: info.outputPath('debug-structure.png') });
    }
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});

test('ELSEWHERE instanced dressing keeps rendering cost bounded @kit-perf', async ({ browser }) => {
  for (const [sample, build] of builds.entries()) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const errors = captureErrors(page);
    try {
      await openHarness(page, build);
      for (const [name, beat, quality, boost, mode] of [
        ['intro-high', 4.09, 'high', false, 'standard'], ['b-low', 113.67, 'low', false, 'standard'],
        ['boost-high', 229.23, 'high', true, 'standard'], ['tour-high', 23.936, 'high', false, 'sightseeing'],
        ['bonus-high', 333.5, 'high', false, 'standard'],
      ] as const) {
        const result = await page.evaluate(([beat, quality, boost, mode]) => window.stability.fixedGlass(beat, quality, boost, mode),
          [beat, quality, boost, mode] as const);
        log('kit-frame', { name, sample, build: build.label, browser: browser.version(), ...result });
        expect(result.phase).toBe('playing');
        expect(result.glError).toBe(0);
        expect(result.trace.cpu.frame.n).toBe(480);
        if (name === 'bonus-high') expect(result.route).toBe('score');
        if (name === 'tour-high') expect(result.speed).toBeLessThan(12);
      }
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }
});

const scenicCases = [
  ['intro', 5.6, 'high', false, 'standard', 'center'],
  ['a', 61, 'high', false, 'standard', 'center'],
  ['b', 113.67, 'low', false, 'standard', 'center'],
  ['build', 176, 'high', false, 'standard', 'center'],
  ['drop', 193, 'high', false, 'standard', 'center'],
  ['break', 297, 'high', false, 'standard', 'center'],
  ['main', 333.5, 'high', false, 'standard', 'center'],
  ['challenge', 333.5, 'high', false, 'standard', 'right'],
  ['bonus', 333.5, 'high', false, 'standard', 'left'],
  ['finale', 401, 'high', false, 'standard', 'center'],
  ['cruise', 229.23, 'high', false, 'standard', 'center'],
  ['boost', 229.23, 'high', true, 'standard', 'center'],
  ['sightseeing', 24, 'high', false, 'sightseeing', 'center'],
] as const;

test('ELSEWHERE scenic score, routes and mode capacity across a full composition @scenic-perf', async ({ browser }) => {
  const focus = process.env.STABILITY_SCENES?.split(',').map(name => name.trim()).filter(Boolean);
  const scenes = focus?.length ? scenicCases.filter(([name]) => focus.includes(name)) : scenicCases;
  expect(scenes.length).toBeGreaterThan(0);
  for (const [sample, build] of builds.entries()) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const errors = captureErrors(page);
    try {
      await openHarness(page, build);
      for (const [name, beat, quality, boost, mode, side] of scenes) {
        const result = await page.evaluate(([beat, quality, boost, mode, side]) =>
          window.stability.fixedGlass(beat, quality, boost, mode, side, 240, true), [beat, quality, boost, mode, side] as const);
        log('scenic-frame', { name, sample, build: build.label, browser: browser.version(), ...result });
        expect(result.phase).toBe('playing');
        expect(result.glError).toBe(0);
        expect(result.trace.cpu.frame.n).toBe(240);
        if (name === 'main' || name === 'challenge' || name === 'bonus') {
          expect(result.route).toBe(name === 'bonus' ? 'score' : name);
        }
        if (build === candidate) {
          expect(result.metrics.scenicLights?.point).toBe(4);
          const instances = Object.values(result.metrics.scenicInstances!);
          for (const { planned, visible, capacity, culled, overflow } of instances) {
            expect(visible).toBeLessThanOrEqual(capacity);
            expect(visible + culled).toBe(planned);
            expect(overflow).toBe(0);
          }
        }
      }
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }
});

test('fixed chapter frames lift surfaces while preserving glass and other-volume pixels @scenic-visual', async ({ browser }, info) => {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = captureErrors(page);
  try {
    const all = [...scenicCases.map(([name, beat, quality, boost, mode, side]) =>
      ['elsewhere', name, beat * 60 / 128, quality, boost, mode, side] as const),
    ...(['drift', 'descent', 'orbit'] as const).map(id => [id, id, 83, 'high', false, 'standard', 'center'] as const)];
    for (const [id, name, time, quality, boost, mode, side] of all) {
      const captured: Buffer[] = [];
      const brightness: { shadow: number; middle: number; glare: number; mean: number; total: number }[] = [];
      for (const build of haveReference ? [reference, candidate] : [candidate]) {
        const query = `/?vol=${id}&t=${time.toFixed(6)}&q=${quality}&mode=${mode}&boost=${Number(boost)}&route=${side}&align=1&ui=0&dbg=1`;
        await page.goto(build.client + query);
        await expect(page.locator('#errbox')).toContainText('"phase":"playing"');
        await page.addStyleTag({ content: '#errbox, #cursor { display: none; }' });
        const shot = await page.locator('#gl').screenshot({
          path: id === 'elsewhere' ? info.outputPath(`${name}-${build.label}.png`) : undefined,
        });
        captured.push(shot);
        if (id !== 'elsewhere') continue;
        const sample = await page.evaluate(async png => {
          const data = await (await fetch('data:image/png;base64,' + png)).blob();
          const image = await createImageBitmap(data);
          const canvas = new OffscreenCanvas(image.width, image.height);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(image, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let shadow = 0, middle = 0, glare = 0, sum = 0, warm = 0, cool = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
            const luma = r * .2126 + g * .7152 + b * .0722;
            sum += luma;
            if (luma < 12) shadow++;
            if (luma >= 24 && luma < 150) middle++;
            if (luma >= 210) glare++;
            if (luma >= 20 && r > b * 1.07) warm++;
            if (luma >= 20 && b > r * 1.07) cool++;
          }
          image.close();
          return { shadow, middle, glare, warm, cool, mean: sum / (pixels.length / 4), total: pixels.length / 4 };
        }, shot.toString('base64'));
        brightness.push(sample);
        log('scenic-image', { name, build: build.label, ...sample });
      }
      if (haveReference && id !== 'elsewhere') expect(captured[0].equals(captured[1]), id).toBe(true);
      if (haveReference && (name === 'intro' || name === 'b' || name === 'break')) {
        expect(brightness[1].mean - brightness[0].mean, name).toBeGreaterThan(1);
        expect(brightness[1].mean - brightness[0].mean, name).toBeLessThan(13);
        expect(brightness[1].shadow / brightness[1].total, name).toBeGreaterThan(.53);
        expect(brightness[1].glare / brightness[1].total, name).toBeLessThan(.03);
      }
    }
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});

test('Score Boost and Sightseeing stay readable across pixel ratios @glass', async ({ browser }, info) => {
  const sim = new Simulation(VOLUMES[0], { align: true, branchSide: 'left' });
  sim.start('normal', 0);
  const station = sim.reference.station(333.5, 'standard');
  while (sim.phase === 'playing' && sim.trackDistance < station) sim.step(STEP, { ...idleInput, boosting: true });
  for (const { name, seconds, mode, boost } of [
    { name: 'score-boost', seconds: sim.time, mode: 'standard', boost: 1 },
    { name: 'score-sightseeing', seconds: 333.5 * 60 / 128, mode: 'sightseeing', boost: 0 },
  ]) for (const { dpr, quality } of [{ dpr: 1, quality: 'low' }, { dpr: 2, quality: 'high' }]) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: dpr });
    try {
      for (const build of haveReference ? [reference, candidate] : [candidate]) {
        await page.goto(`${build.client}/?vol=elsewhere&q=${quality}&t=${seconds.toFixed(7)}&mode=${mode}&boost=${boost}&route=left&align=1&ui=0&dbg=1`);
        const debug = page.locator('#errbox');
        await expect(debug).toContainText('"phase":"playing"');
        const { speed, canvas } = JSON.parse((await debug.textContent())!);
        if (boost) expect(speed).toBeGreaterThan(43);
        else expect(speed).toBeLessThan(12);
        expect(canvas).toEqual(dpr === 1 ? [960, 540] : [1536, 864]);
        await expect(page.locator('#hud-route')).toHaveText('BONUS');
        await page.addStyleTag({ content: '#errbox { display: none; }' });
        const path = info.outputPath(`${name}-${quality}-${build.label}.png`);
        await page.locator('#gl').screenshot({ path });
        await info.attach(`${name}-${quality}-${build.label}`, { path, contentType: 'image/png' });
        log('visual-motion', { name, seconds, dpr, quality, build: build.label, speed, canvas });
      }
    } finally { await page.close(); }
  }
});

test('fixed ELSEWHERE frames and dense Score gates @glass', async ({ browser }) => {
  for (const [sample, build] of builds.entries()) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const errors = captureErrors(page);
    try {
      await openHarness(page, build);
      for (const [beat, quality, boost] of [[76.8, 'high', false], [333.5, 'high', false], [333.5, 'low', false], [333.5, 'high', true]] as const) {
        const result = await page.evaluate(([beat, quality, boost]) => window.stability.fixedGlass(beat, quality, boost),
          [beat, quality, boost] as const);
        log('glass', { sample, build: build.label, browser: browser.version(), quality, boost, ...result });
        expect(result.phase).toBe('playing');
        expect(result.glError).toBe(0);
        expect(result.trace.cpu.frame.n).toBe(480);
        if (beat === 333.5) {
          expect(result.route).toBe('score');
          expect(result.gateCount).toBeGreaterThanOrEqual(10);
          expect(new Set(result.gateKinds)).toEqual(new Set(['square', 'diamond']));
        }
        if (boost) expect(result.speed).toBeGreaterThan(43);
        if (build === candidate) {
          expect(result.gateMeshes).toBe(result.gateCount);
          expect(result.gateGeometries).toBeLessThanOrEqual(8);
        }
      }
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }
});

test('repeated volume prewarming releases every compiled shader handle', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = WebGL2RenderingContext.prototype;
    const create = proto.createShader;
    const release = proto.deleteShader;
    const live = new WeakSet<WebGLShader>();
    const counts = { created: 0, deleted: 0 };
    Reflect.set(window, '__shaderHandles', counts);
    proto.createShader = function (kind) {
      const shader = create.call(this, kind);
      if (shader) { live.add(shader); counts.created++; }
      return shader;
    };
    proto.deleteShader = function (shader) {
      if (shader && live.delete(shader)) counts.deleted++;
      release.call(this, shader);
    };
  });
  await openHarness(page);
  const result = await page.evaluate(async ids => {
    await window.stability.mount('orbit', 'low');
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const id of ids) await window.stability.select(id);
    }
    return Reflect.get(window, '__shaderHandles') as { created: number; deleted: number };
  }, VOLUMES.map(volume => volume.id));
  log('shader-handles', result);
  expect(result.created).toBeGreaterThan(0);
  expect(result.deleted).toBe(result.created);
});

test('switching away from mixed gates keeps GPU resource counts bounded', async ({ page }) => {
  const errors = captureErrors(page);
  await openHarness(page);
  const samples = await page.evaluate(async () => {
    const game = window.b0Harness;
    const counts = () => {
      const { geometries, textures, programs } = JSON.parse(game.metrics()!);
      return { phase: game.snapshot().phase, geometries, textures, programs };
    };
    try {
      // Warm the renderer's sky geometry and shader before comparing counts.
      await game.mount({ volumeId: 'drift', quality: 'high', diagnostics: {
        fixedTime: 113, autoplay: false, god: false, align: true, boost: false,
        mobileQuality: false, post: true, record: false, debug: true,
      } });
      game.returnToMenu();
      // At 113 s the DROP preview includes Iris, Square and Diamond.
      await game.select('elsewhere');
      const result = [counts()];
      for (let repeat = 0; repeat < 3; repeat++) {
        game.returnToMenu();
        await game.select('drift');
        game.returnToMenu();
        await game.select('elsewhere');
        result.push(counts());
      }
      return result;
    } finally { game.dispose(); }
  });
  expect(samples[0].phase).toBe('playing');
  expect(samples.slice(1)).toEqual(Array(3).fill(samples[0]));
  expect(errors).toEqual([]);
  log('mixed-gate-resources', { samples });
});

test('soak 20 lifecycles and a full song on the longest volume', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = captureErrors(page);
  const cdp = await page.context().newCDPSession(page);
  const warmed = new Map<VolumeId, { geometries: number; textures: number; programs: number }>();
  try {
    await openHarness(page);
    await page.evaluate(() => window.stability.mount('elsewhere', 'low'));
    const start = page.getByRole('button', { name: 'Start with audio' });
    const phase = () => page.evaluate(() => window.stability.state().phase);
    for (let round = 0; round < 20; round++) {
      const volume = VOLUMES[round % VOLUMES.length].id;
      await page.evaluate(async id => {
        const h = window.stability;
        await h.select(id);
        await h.quality('high');
      }, volume);
      await page.setViewportSize({ width: 1024, height: 576 });
      await start.click();
      await expect.poll(phase).toBe('playing');
      const transition = await page.evaluate(async () => {
        const h = window.stability;
        h.pause();
        const paused = h.state().phase;
        await h.resume();
        const resumed = h.state().phase;
        h.menu();
        return { paused, resumed };
      });
      expect(transition).toEqual({ paused: 'paused', resumed: 'playing' });
      await start.click();
      await expect.poll(phase).toBe('playing');
      await page.evaluate(async () => {
        const h = window.stability;
        h.menu();
        await h.quality('low');
      });
      await page.setViewportSize({ width: 960, height: 540 });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const metrics = await page.evaluate(() => window.stability.metrics());
      const active = await page.evaluate(() => window.stability.state());
      expect(metrics.glError).toBe(0);
      expect(active).toMatchObject({ phase: 'menu', scheduler: false, runBus: false, raf: true });
      expect(metrics.chunks).toBeLessThanOrEqual(5);
      if (round >= VOLUMES.length) {
        const prior = warmed.get(volume);
        if (!prior) warmed.set(volume, metrics);
        else for (const key of ['geometries', 'textures', 'programs'] as const) {
          expect(metrics[key], `${volume} ${key} after round ${round + 1}`).toBeLessThanOrEqual(prior[key] + 2);
        }
      }
      const heap = await cdp.send('Runtime.getHeapUsage');
      log('cycle', { round: round + 1, volume, metrics, active, heap });
      if ((round + 1) % VOLUMES.length === 0) {
        // Let old, already disconnected reverb and scheduled nodes drain before sampling retention.
        await page.waitForTimeout(2200);
        await cdp.send('HeapProfiler.collectGarbage');
        log('retained', { round: round + 1, heap: await cdp.send('Runtime.getHeapUsage'),
          dom: await cdp.send('Memory.getDOMCounters') });
      }
    }

    await page.evaluate(() => window.stability.dispose());
    await expect.poll(() => page.evaluate(() => window.stability.state())).toEqual({ phase: 'disposed',
      scheduler: false, runBus: false, audio: 'closed', raf: false, listenersReleased: true, inputReleased: true });
    const longest = VOLUMES.reduce((a, b) => a.beats / a.bpm > b.beats / b.bpm ? a : b);
    await page.evaluate(id => window.stability.mount(id, 'low'), longest.id);
    const began = performance.now();
    await start.click();
    await expect.poll(phase).toBe('playing');
    const wallLimit = longest.beats * 60_000 / longest.bpm + 25_000;
    for (let sample = 0; performance.now() - began < wallLimit; sample++) {
      const trace = await page.evaluate(() => window.stability.capture(4600));
      const metrics = await page.evaluate(() => window.stability.metrics());
      expect(metrics.glError).toBe(0);
      log('song', { sample, elapsedMs: performance.now() - began, trace, metrics,
        heap: await cdp.send('Runtime.getHeapUsage') });
      if (metrics.snapshot.phase === 'results') {
        expect(metrics.snapshot.result?.title).toBe('ESCAPED');
        expect(metrics.snapshot.gatesPassed + metrics.snapshot.result!.neutralized).toBe(metrics.snapshot.gatesTotal);
        expect(metrics.beat).toBe(longest.beats);
        break;
      }
      if (metrics.snapshot.phase === 'crash') {
        // The sampling window can end during the successful run's results transition.
        expect(metrics.snapshot.result?.title).toBe('ESCAPED');
        expect(metrics.beat).toBe(longest.beats);
      } else expect(metrics.snapshot.phase).toBe('playing');
    }
    expect(await phase()).toBe('results');
    expect(errors).toEqual([]);
    log('soak-complete', { volume: longest.id, wallMs: performance.now() - began });
    await page.evaluate(() => window.stability.dispose());
    await expect.poll(() => page.evaluate(() => window.stability.state())).toMatchObject({ phase: 'disposed',
      scheduler: false, runBus: false, audio: 'closed', raf: false, listenersReleased: true, inputReleased: true });
  } finally { await page.close(); }
});
