import { expect, test } from '@playwright/test';
import { chartFor } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { VOLUMES } from '../../app/game/core/volumes';
import { hasAudio, mount, openSync, phase, report, state, trace } from './support';

test('real activation, pause, visibility, suspend and silent recovery', async ({ page, browser }, info) => {
  const errors = await openSync(page);
  await mount(page, 'orbit');
  await page.locator('#start').click();
  if (!await hasAudio(page)) {
    expect(info.project.name).toBe('webkit');
    await expect.poll(() => page.evaluate(() => window.b0Harness.snapshot().error?.kind)).toBe('audio');
    await page.locator('#silent').click();
    await expect.poll(async () => {
      const current = await state(page);
      return current.phase === 'paused' || current.elapsed > 0.25;
    }).toBe(true);
    const recovery = await state(page);
    if (recovery.phase === 'paused') {
      expect(recovery).toMatchObject({ pauseReason: 'long-frame', scheduler: false, runBus: false });
      await page.locator('#resume').click();
    }
    await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(0.25);
    expect(await state(page)).toMatchObject({ scheduler: false, runBus: false, contextState: null });
    expect(errors).toEqual([]);
    report('activation', { engine: info.project.name, browser: browser.version(), status: 'BLOCKED', reason: 'AudioContext unavailable',
      pauseReason: recovery.pauseReason, silent: await state(page) });
    return;
  }

  await phase(page, 'playing');
  await expect.poll(async () => (await trace(page)).firstBeat?.beat).toBeGreaterThanOrEqual(1);
  const running = await state(page);
  const startup = await trace(page);
  const first = startup.steps[0];
  expect(running).toMatchObject({ contextState: 'running', scheduler: true, runBus: true });
  expect(startup.firstBeforeAnchor).toMatchObject({ elapsed: 0, beat: 0, simTime: 0 });
  expect(first.at - first.trigger).toBeGreaterThan(0.04);
  expect(first.at - first.trigger).toBeLessThanOrEqual(0.06 + 1e-9);
  expect(startup.firstTick?.beat).toBeGreaterThan(0);
  const output = running.output;
  if (output.status === 'valid') {
    expect(output.outputContextTime).toBeGreaterThan(0);
    expect(output.outputPerformanceTime).toBeGreaterThan(0);
    expect(output.outputEstimateNow).toBeGreaterThan(0);
  }
  const badTimestamps = await page.evaluate(() => {
    const prototype = Object.getPrototypeOf(AudioContext.prototype).getOutputTimestamp
      ? Object.getPrototypeOf(AudioContext.prototype) as AudioContext : AudioContext.prototype;
    const original = prototype.getOutputTimestamp;
    try {
      return [{ contextTime: 0, performanceTime: 0 }, { contextTime: NaN, performanceTime: 5 },
        { contextTime: 1e6, performanceTime: 1e9 }].map(value => {
        prototype.getOutputTimestamp = () => value;
        return window.syncHarness.inspect().output.status;
      });
    } finally { prototype.getOutputTimestamp = original; }
  });
  expect(badTimestamps).toEqual(['invalid', 'invalid', 'invalid']);
  report('activation', { engine: info.project.name, browser: browser.version(), status: 'PASS',
    running, first, firstBeforeAnchor: startup.firstBeforeAnchor, firstTick: startup.firstTick, firstBeat: startup.firstBeat });

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(running.elapsed);
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.evaluate(() => window.b0Harness.pause());
    await phase(page, 'paused');
    const paused = await state(page);
    expect(paused).toMatchObject({ scheduler: false, runBus: false });
    await page.waitForTimeout(120);
    expect(await state(page)).toMatchObject({ elapsed: paused.elapsed, judged: paused.judged, score: paused.score });
    await page.locator('#resume').click();
    await phase(page, 'playing');
    await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(paused.elapsed);
    expect(await state(page)).toMatchObject({ offset: paused.elapsed, scheduler: true, runBus: true });
  }

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await phase(page, 'paused');
  const hidden = await state(page);
  expect(hidden).toMatchObject({ pauseReason: 'background', scheduler: false, runBus: false });
  await page.waitForTimeout(150);
  expect(await state(page)).toMatchObject({ elapsed: hidden.elapsed, score: hidden.score });
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await phase(page, 'playing');
  expect(await state(page)).toMatchObject({ offset: hidden.elapsed, scheduler: true, runBus: true });

  await page.evaluate(() => window.syncHarness.setLevel(0.37, true));
  await expect.poll(async () => (await state(page)).gain).toBeLessThan(0.02);
  await page.evaluate(() => window.syncHarness.setLevel(0.37, false));
  await expect.poll(async () => (await state(page)).gain).toBeGreaterThan(0.34);
  await page.evaluate(() => window.syncHarness.suspend());
  await phase(page, 'paused');
  const suspended = await state(page);
  expect(suspended).toMatchObject({ contextState: 'suspended', pauseReason: 'audio', scheduler: false, runBus: false,
    output: { status: 'inactive' } });
  await page.waitForTimeout(150);
  expect(await state(page)).toMatchObject({ elapsed: suspended.elapsed, beat: suspended.beat, score: suspended.score });
  await page.locator('#resume').click();
  await phase(page, 'playing');
  const resumed = await state(page);
  expect(resumed).toMatchObject({ offset: suspended.elapsed, contextState: 'running', scheduler: true, runBus: true });
  expect(resumed.elapsed - suspended.elapsed).toBeLessThan(0.30);
  await page.evaluate(() => window.syncHarness.suspend());
  await phase(page, 'paused');
  const beforeSilent = await state(page);
  await page.locator('#silent-resume').click();
  await phase(page, 'playing');
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(beforeSilent.elapsed + 2 * STEP);
  expect(await state(page)).toMatchObject({ contextState: 'suspended', scheduler: false, runBus: false });
  report('lifecycle', { engine: info.project.name, hidden, suspended, resumed, beforeSilent, silent: await state(page) });

  for (const volume of VOLUMES) {
    await page.evaluate(async id => { window.b0Harness.returnToMenu(); await window.b0Harness.select(id); }, volume.id);
    await phase(page, 'menu');
    expect(await state(page)).toMatchObject({ scheduler: false, runBus: false });
    const old = (await trace(page)).steps.at(-1)?.run;
    await page.locator('#start').click();
    await phase(page, 'playing');
    const steps = (await trace(page)).steps.filter(item => item.run !== old);
    const newest = steps.at(-1)?.run;
    expect(newest).not.toBe(old);
    expect(steps.find(item => item.run === newest)?.step).toBe(0);
  }
  await page.evaluate(() => window.b0Harness.returnToMenu());
  expect(await state(page)).toMatchObject({ scheduler: false, runBus: false });
  expect(errors).toEqual([]);
});

test('scheduler starvation and a 160 ms main-thread stall pause without committing a jump', async ({ page }, info) => {
  const errors = await openSync(page);
  if (!await hasAudio(page)) {
    expect(info.project.name).toBe('webkit');
    report('stress', { engine: info.project.name, status: 'BLOCKED', reason: 'AudioContext unavailable' });
    return;
  }
  await page.evaluate(() => {
    const schedule = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, ms?: number, ...args: unknown[]) => {
      if (ms !== 25 || typeof handler !== 'function') return schedule(handler, ms, ...args);
      return schedule(() => {
        if (!document.documentElement.hasAttribute('data-hold-scheduler')) handler(...args);
      }, ms);
    }) as typeof window.setInterval;
  });
  const volume = VOLUMES[0];
  await mount(page, volume.id);
  await page.locator('#start').click();
  await phase(page, 'playing');
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(0.35);
  await page.evaluate(() => document.documentElement.setAttribute('data-hold-scheduler', ''));
  await phase(page, 'paused');
  const starved = await state(page);
  const queued = (await trace(page)).steps.at(-1)!;
  expect(starved).toMatchObject({ pauseReason: 'long-frame', scheduler: false, runBus: false });
  const nextDue = queued.at + 15 / volume.bpm - starved.anchor;
  expect(starved.elapsed).toBeLessThanOrEqual(nextDue + 1e-9);
  await page.evaluate(() => document.documentElement.removeAttribute('data-hold-scheduler'));
  await page.locator('#resume').click();
  await phase(page, 'playing');
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(starved.elapsed + 0.2);

  const gateTime = chartFor(volume, 'normal')[0].beat * 60 / volume.bpm;
  const before = await page.evaluate(async gateTime => {
    while (window.syncHarness.inspect().elapsed < gateTime - 0.135) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    const snapshot = window.syncHarness.inspect();
    const start = performance.now();
    while (performance.now() - start < 160) { /* deliberate blocking interval */ }
    return snapshot;
  }, gateTime);
  expect(before.elapsed).toBeLessThan(gateTime);
  expect(before.elapsed + 0.16).toBeGreaterThan(gateTime);
  await phase(page, 'paused');
  const stalled = await state(page);
  expect(stalled).toMatchObject({ pauseReason: 'long-frame', elapsed: before.elapsed, beat: before.beat,
    score: before.score, judged: before.judged, runBus: false, scheduler: false });
  await page.locator('#resume').click();
  await phase(page, 'playing');
  expect(await state(page)).toMatchObject({ offset: stalled.elapsed });
  await expect.poll(async () => (await state(page)).judged).toBe(1);
  expect(await state(page)).toMatchObject({ judged: 1, passed: 1, lives: volume.lives.normal });
  report('stress', { engine: info.project.name, nextDue, starved, stalled, resumed: await state(page) });
  expect(errors).toEqual([]);
});
