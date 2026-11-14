import { expect, test } from '@playwright/test';
import { chartFor } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { VOLUMES } from '../../app/game/core/volumes';
import { hasAudio, mount, openSync, phase, report, state, trace } from './support';

for (const volume of ['descent', 'drift'] as const) test(`${volume} dynamic structure lights peak on scheduled drum onsets in a live run`, async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'The live timing budget is measured on Chromium.');
  const errors = await openSync(page);
  await mount(page, volume);
  await page.evaluate(() => window.syncHarness.setDynamicLights());
  await page.locator('#start').click();
  await phase(page, 'playing');
  const samples = () => page.evaluate(() => window.syncHarness.beatTiming());
  await expect.poll(async () => (await samples()).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  const measured = await samples();
  for (const sample of measured) expect(sample.scheduled - sample.audioAnchor).toBeCloseTo(sample.planned, 9);
  expect(Math.max(...measured.map(sample => Math.abs(sample.errorMs)))).toBeLessThanOrEqual(20);
  for (const { output, renderedAt } of measured) {
    if (output.status === 'valid' && output.scheduledPerformanceTime !== null) {
      expect(Math.abs(renderedAt - output.scheduledPerformanceTime)).toBeLessThanOrEqual(24);
    }
  }
  expect(errors).toEqual([]);
  report('dynamic-lights', { volume, measured });
});

test('real activation, pause, visibility, suspend and silent recovery', async ({ page, browser }, info) => {
  const errors = await openSync(page);
  await mount(page, 'orbit');
  await page.locator('#start').click();
  if (!await hasAudio(page)) {
    expect(info.project.name).toBe('webkit');
    await expect.poll(() => page.evaluate(() => window.b0Harness.snapshot().error?.kind)).toBe('audio');
    await page.locator('#silent').click();
    await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(0.25);
    expect(await state(page)).toMatchObject({ scheduler: false, runBus: false, contextState: null,
      audio: { silentFallbacks: 1 }, soundUnavailable: false });
    expect(errors).toEqual([]);
    report('activation', { engine: info.project.name, browser: browser.version(), status: 'BLOCKED', reason: 'AudioContext unavailable',
      silent: await state(page) });
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
    expect(await state(page)).toMatchObject({ offset: paused.pausedAt, scheduler: true, runBus: true });
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
  expect(await state(page)).toMatchObject({ offset: hidden.pausedAt, scheduler: true, runBus: true });

  await page.evaluate(() => window.syncHarness.setLevel(0.37, true));
  await expect.poll(async () => (await state(page)).gain).toBeLessThan(0.02);
  await page.evaluate(() => window.syncHarness.setLevel(0.37, false));
  await expect.poll(async () => (await state(page)).gain).toBeGreaterThan(0.34);
  const beforeSuspend = await state(page);
  await page.evaluate(() => window.syncHarness.suspend());
  await expect.poll(async () => (await state(page)).audio.resumes).toBeGreaterThan(beforeSuspend.audio.resumes);
  const resumed = await state(page);
  expect(resumed).toMatchObject({ phase: 'playing', contextState: 'running', scheduler: true, runBus: true });

  await page.evaluate(async () => {
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = () => Promise.reject(new Error('test activation requires a gesture'));
    window.addEventListener('test-allow-audio', () => { AudioContext.prototype.resume = resume; }, { once: true });
    await window.syncHarness.suspend();
  });
  await expect.poll(async () => (await state(page)).soundUnavailable).toBe(true);
  const silent = await state(page);
  expect(silent).toMatchObject({ phase: 'playing', scheduler: false, runBus: false, audio: { silentFallbacks: 1 } });
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(silent.elapsed + 2 * STEP);
  await page.evaluate(() => window.dispatchEvent(new Event('test-allow-audio')));
  await page.locator('#restore-audio').click();
  await expect.poll(async () => (await state(page)).soundUnavailable).toBe(false);
  expect(await state(page)).toMatchObject({ phase: 'playing', scheduler: true, runBus: true });
  report('lifecycle', { engine: info.project.name, hidden, resumed, silent, restored: await state(page) });

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

test('scheduler starvation and a 160 ms blocked crossing recover in the same run', async ({ page }, info) => {
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
  const beforeStarvation = await state(page);
  await page.evaluate(() => document.documentElement.setAttribute('data-hold-scheduler', ''));
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(beforeStarvation.elapsed + 0.36);
  const starved = await state(page);
  expect(starved).toMatchObject({ phase: 'playing', scheduler: true, runBus: true });
  await page.evaluate(() => document.documentElement.removeAttribute('data-hold-scheduler'));
  await expect.poll(async () => (await state(page)).audio.missedSteps).toBeGreaterThan(0);
  const afterStarvation = await state(page);
  expect(afterStarvation.anchor).toBe(starved.anchor);

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
  await expect.poll(async () => (await state(page)).judged).toBe(1);
  const recovered = await state(page);
  expect(recovered).toMatchObject({ phase: 'playing', judged: 1, passed: 0, neutralized: 1, lives: volume.lives.normal });
  expect(recovered.elapsed).toBeGreaterThan(before.elapsed);
  const steps = (await trace(page)).steps;
  expect(new Set(steps.map(item => item.run)).size).toBe(1);
  expect(new Set(steps.map(item => item.step)).size).toBe(steps.length);
  for (const step of steps) {
    expect(step.at - step.trigger).toBeGreaterThanOrEqual(-1e-9);
    expect(step.at).toBeCloseTo(steps[0].at + step.step * 15 / volume.bpm, 9);
  }
  report('stress', { engine: info.project.name, starved, afterStarvation, recovered });
  expect(errors).toEqual([]);
});
