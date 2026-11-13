import { expect, test } from '@playwright/test';
import { readMetrics } from './diagnostics';
import type { Metrics } from './diagnostics';

test('one renderer survives volume changes and the run can pause, resume, and dispose', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const result = await page.evaluate(async () => {
    const test = window.b0Harness;
    await test.mount({ quality: 'low' });
    const original = document.querySelector('canvas')!;
    const gl = original.getContext('webgl2')!;
    const seen = [];
    for (const id of ['drift', 'descent', 'orbit', 'elsewhere'] as const) {
      await test.start(true);
      test.returnToMenu();
      await test.select(id);
      seen.push(test.snapshot().volumeId);
    }
    await test.start(true);
    test.pause();
    const paused = test.snapshot();
    await test.resume(true);
    const resumed = test.snapshot();
    const rendererReused = original === document.querySelector('canvas') && gl === original.getContext('webgl2');
    test.dispose();
    await test.start(true);
    return { seen, paused: paused.phase, resumed: resumed.phase, rendererReused, disposed: test.snapshot().phase };
  });
  expect(result).toEqual({
    seen: ['drift', 'descent', 'orbit', 'elsewhere'],
    paused: 'paused', resumed: 'playing', rendererReused: true, disposed: 'disposed',
  });
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('context recovery and cached navigation preserve progress and a single frame callback', async ({ page }) => {
  await page.addInitScript(() => {
    const active = new Set<number>();
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const counts = { active: 0, max: 0, frames: 0 };
    const registrations: AbortSignal[] = [];
    const listen = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (typeof options === 'object' && options.signal) registrations.push(options.signal);
      listen.call(this, type, listener, options);
    };
    window.requestAnimationFrame = callback => {
      const id = request(now => {
        active.delete(id);
        counts.active = active.size;
        counts.frames++;
        callback(now);
      });
      active.add(id);
      counts.active = active.size;
      counts.max = Math.max(counts.max, active.size);
      return id;
    };
    window.cancelAnimationFrame = id => {
      active.delete(id);
      counts.active = active.size;
      cancel(id);
    };
    Object.defineProperty(window, 'frameCounts', { value: counts });
    Object.defineProperty(window, 'listenerSignals', { value: registrations });
  });
  const counts = () => page.evaluate(() => (window as unknown as {
    frameCounts: { active: number; max: number; frames: number };
  }).frameCounts);
  const snapshot = () => page.evaluate(() => window.b0Harness.snapshot());
  await page.goto('http://127.0.0.1:8090/');
  await page.evaluate(async () => {
    await window.b0Harness.mount({ quality: 'low' });
    await window.b0Harness.start(true);
  });
  await expect.poll(async () => (await snapshot()).progress).toBeGreaterThan(0);
  const corridor = await page.evaluateHandle(() => window.b0Harness.corridor());
  const supported = await page.evaluate(() => {
    const context = document.querySelector('canvas')!.getContext('webgl2')!;
    const extension = context.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    window.addEventListener('b0:restore-webgl', () => extension.restoreContext(), { once: true });
    extension.loseContext();
    return true;
  });
  expect(supported, 'WEBGL_lose_context required for context recovery coverage').toBe(true);
  await expect.poll(async () => (await snapshot()).pauseReason).toBe('context');
  const lost = await snapshot();
  expect((await counts()).active).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('b0:restore-webgl')));
  await expect.poll(async () => (await snapshot()).phase).toBe('playing');
  await expect.poll(async () => (await snapshot()).progress).toBeGreaterThan(lost.progress);
  expect(await page.evaluate(path => path === window.b0Harness.corridor(), corridor)).toBe(true);
  await corridor.dispose();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  const cached = await snapshot();
  expect(cached.pauseReason).toBe('background');
  expect((await counts()).active).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(async () => (await snapshot()).progress).toBeGreaterThan(cached.progress);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  expect((await snapshot()).phase).toBe('disposed');
  const closed = await counts();
  expect(closed.active).toBe(0);
  expect(closed.max).toBe(1);
  const listeners = await page.evaluate(() => {
    const signals = (window as unknown as { listenerSignals: AbortSignal[] }).listenerSignals;
    return { count: signals.length, allRemoved: signals.every(signal => signal.aborted) };
  });
  expect(listeners.count).toBeGreaterThan(10);
  expect(listeners.allRemoved).toBe(true);
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
  expect(await counts()).toEqual(closed);
});

test('forward and backward streaming evicts chunk-owned resources', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  for (const id of ['elsewhere', 'drift', 'descent', 'orbit'] as const) {
    const stream = await page.evaluate(id => window.b0Harness.streamResources(id), id);
    expect(stream.expectedDisposals).toBeGreaterThan(0);
    expect(stream.currentDisposals).toBe(stream.expectedDisposals);
    expect(stream.oldChunksRemoved).toBe(true);
    expect(Math.min(...stream.counts)).toBeGreaterThan(0);
    expect(Math.max(...stream.counts)).toBeLessThanOrEqual(8);
    expect(stream.remaining).toBe(0);
  }
});

test('a long frame drains without a modal and neutralizes an unobservable crossing', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const result = await page.evaluate(async () => {
    let next: FrameRequestCallback | undefined;
    window.requestAnimationFrame = callback => { next = callback; return 1; };
    window.cancelAnimationFrame = () => { next = undefined; };
    const test = window.b0Harness;
    const results = [];
    for (const gap of [50, 100, 160, 250, 500, 2300]) {
      const diagnostics = { fixedTime: null, autoplay: false, god: false, align: false, boost: false,
        mobileQuality: false, post: true, record: false, debug: false };
      await test.mount({ quality: 'low', difficulty: 'hard', diagnostics });
      await test.start(true);
      const start = performance.now();
      const approach = gap < 150 ? 6900 : 7400;
      test.advance(approach / 1000 * 128 / 60);
      next!(start + approach);
      const before = test.snapshot();
      for (let i = 0; i < 18; i++) next!(start + approach + gap + i * 17);
      const after = test.snapshot();
      let settled;
      if (gap === 500) {
        diagnostics.align = true;
        test.advance(448);
        for (let i = 0; i < 50; i++) next!(start + 210000 + i * 17);
        settled = { score: test.snapshot().score, record: test.snapshot().localRecord, result: test.snapshot().result };
      }
      test.dispose();
      results.push({ gap, before, after, settled });
    }
    return results;
  });
  for (const { gap, before, after, settled } of result) {
    expect(after.phase, String(gap)).toBe('playing');
    expect(after.pauseReason).toBeNull();
    expect(after.progress).toBeGreaterThan(before.progress);
    expect(after.gatesPassed).toBe(0);
    expect(after.lives).toBe(before.lives);
    if (gap >= 150) expect(after.message).toBe('RECOVERY · BEST INELIGIBLE');
    if (gap === 500) {
      expect(settled?.score).toBeGreaterThan(17);
      expect(settled?.record).toEqual({ best: null, last: null });
      expect(settled?.result).toMatchObject({ title: 'ESCAPED', neutralized: 1, encountered: 141, passed: 140 });
    }
  }
});

test('repeated switches and runs keep resource counts bounded', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const samples = await page.evaluate(async () => {
    const test = window.b0Harness;
    const samples: Metrics[] = [];
    await test.mount({ quality: 'low' });
    for (let lap = 0; lap < 3; lap++) {
      for (const id of ['drift', 'descent', 'orbit', 'elsewhere'] as const) {
        await test.select(id);
        await test.start(true);
        await new Promise(resolve => setTimeout(resolve, 100));
        samples.push(JSON.parse(test.metrics()!));
        test.returnToMenu();
      }
    }
    test.dispose();
    return samples;
  });
  for (let index = 0; index < 4; index++) {
    const first = samples[index];
    expect(first.phase).toBe('playing');
    for (const later of [samples[index + 4], samples[index + 8]]) {
      expect(later.chunks).toBeLessThanOrEqual(6);
      expect(later.geometries).toBeLessThanOrEqual(first.geometries + 2);
      expect(later.textures).toBeLessThanOrEqual(first.textures + 1);
      expect(later.programs).toBeLessThanOrEqual(first.programs + 1);
    }
  }
});

test.describe('quality', () => {
  test.use({ deviceScaleFactor: 2 });

  test('high to low updates canvas, DPR and PostFX without a document reload', async ({ page }) => {
    await page.goto('/?q=high&dbg=1');
    await expect(page.locator('#errbox')).toHaveText(/^\{/);
    await expect.poll(async () => (await readMetrics(page)).dpr).toBe(1.6);
    const high = await readMetrics(page);
    expect(high.canvas).toEqual([1536, 864]);
    expect(high.targets[0].slice(0, 2)).toEqual(high.canvas);
    const canvas = await page.locator('#gl').elementHandle();
    await page.locator('[data-act=settings]').click();
    await page.locator('[data-q=low]').click();
    await expect.poll(async () => (await readMetrics(page)).dof).toBe(false);
    await page.setViewportSize({ width: 720, height: 500 });
    await expect.poll(async () => (await readMetrics(page)).canvas).toEqual([720, 500]);
    const low = await readMetrics(page);
    expect(low.targets[0]).toEqual([720, 500, 0]);
    expect(low.targets.slice(1, 3)).toEqual([[2, 2, 0], [2, 2, 0]]);
    expect(await canvas!.evaluate(el => el === document.querySelector('#gl'))).toBe(true);
  });

  test('auto reduces canvas and post target sizes after sustained slow frames', async ({ page }) => {
    await page.addInitScript(() => {
      let id = 0;
      let time = 0;
      const callbacks = new Map<number, FrameRequestCallback>();
      window.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id; };
      window.cancelAnimationFrame = id => { callbacks.delete(id); };
      window.addEventListener('b0:slow-frame', () => {
        time = Math.max(time, performance.now()) + 35;
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const frame of pending) frame(time);
      });
    });
    await page.goto('/?q=auto&dbg=1');
    await expect(page.locator('[data-act=start]')).toBeEnabled();
    const initial = await readMetrics(page);
    await page.evaluate(() => {
      for (let frame = 0; frame < 188; frame++) window.dispatchEvent(new Event('b0:slow-frame'));
    });
    const reduced = await readMetrics(page);
    expect(reduced.dpr).toBeLessThan(initial.dpr);
    expect(reduced.canvas[0]).toBeLessThan(initial.canvas[0]);
    expect(reduced.targets[0].slice(0, 2)).toEqual(reduced.canvas);
  });
});
