import { devices, expect, test, webkit } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { VOLUMES } from '../../app/game/core/volumes';
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
          if (live.snapshot.phase !== 'playing') expect(live.snapshot.pauseReason).toBe('long-frame');
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
      if (id !== 'elsewhere') expect(identical, `${id} at t=${seconds}`).toBe(true);
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
  } finally { await page.close(); }
});

test('fixed ELSEWHERE frames and dense Score gates @glass', async ({ browser }) => {
  for (const [sample, build] of builds.entries()) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const errors = captureErrors(page);
    try {
      await openHarness(page, build);
      for (const [beat, quality] of [[76.8, 'high'], [333.5, 'high'], [333.5, 'low']] as const) {
        const result = await page.evaluate(([beat, quality]) => window.stability.fixedGlass(beat, quality), [beat, quality] as const);
        log('glass', { sample, build: build.label, browser: browser.version(), quality, ...result });
        expect(result.phase).toBe('playing');
        expect(result.glError).toBe(0);
        expect(result.trace.cpu.frame.n).toBe(480);
        if (beat === 333.5) {
          expect(result.route).toBe('score');
          expect(result.gateCount).toBeGreaterThanOrEqual(10);
          expect(new Set(result.gateKinds)).toEqual(new Set(['square', 'diamond']));
        }
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
    let pauses = 0;
    const wallLimit = longest.beats * 60_000 / longest.bpm + 25_000;
    for (let sample = 0; performance.now() - began < wallLimit; sample++) {
      const trace = await page.evaluate(() => window.stability.capture(4600));
      const metrics = await page.evaluate(() => window.stability.metrics());
      expect(metrics.glError).toBe(0);
      log('song', { sample, elapsedMs: performance.now() - began, trace, metrics,
        heap: await cdp.send('Runtime.getHeapUsage') });
      if (metrics.snapshot.phase === 'results') {
        expect(metrics.snapshot.result?.title).toBe('ESCAPED');
        expect(metrics.snapshot.gatesPassed).toBe(metrics.snapshot.gatesTotal);
        expect(metrics.beat).toBe(longest.beats);
        break;
      }
      if (metrics.snapshot.phase === 'paused') {
        expect(metrics.snapshot.pauseReason).toBe('long-frame');
        pauses++;
        await page.evaluate(() => window.stability.resume());
      }
    }
    expect(await phase()).toBe('results');
    expect(errors).toEqual([]);
    log('soak-complete', { volume: longest.id, wallMs: performance.now() - began, pauses });
    await page.evaluate(() => window.stability.dispose());
    await expect.poll(() => page.evaluate(() => window.stability.state())).toMatchObject({ phase: 'disposed',
      scheduler: false, runBus: false, audio: 'closed', raf: false, listenersReleased: true, inputReleased: true });
  } finally { await page.close(); }
});
