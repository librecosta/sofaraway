import { expect, test } from '@playwright/test';
import { STEP } from '../../app/game/core/clock';
import { VOLUMES } from '../../app/game/core/volumes';
import { mount, openSync, phase, report, state, trace } from './support';

const normalScores = [105326, 23928, 119039, 65069];
const gateCounts = [141, 40, 158, 91];

test('Sightseeing on DRIFT plays the entire original song on real audio time', async ({ page }) => {
  const volume = VOLUMES[1];
  const duration = volume.beats * 60 / volume.bpm;
  test.setTimeout((duration + 45) * 1000);
  const errors = await openSync(page);
  await mount(page, volume.id, 'sightseeing');
  await page.locator('#start').click();
  await phase(page, 'playing');
  await page.waitForFunction(() => ['paused', 'crash', 'results', 'error'].includes(window.b0Harness.snapshot().phase),
    undefined, { timeout: (duration + 8) * 1000, polling: 200 });
  await phase(page, 'results');
  const result = await state(page);
  const { firstBeforeAnchor, steps, sections, end } = await trace(page);
  expect(firstBeforeAnchor).toMatchObject({ beat: 0, elapsed: 0 });
  expect(steps.map(step => [step.run, step.step])).toEqual(Array.from({ length: volume.beats * 4 }, (_, i) => [1, i]));
  expect(Math.max(...steps.map(({ at, step }) => Math.abs(at - steps[0].at - step * 15 / volume.bpm)))).toBeLessThan(1e-9);
  expect(sections.map(section => section.section)).toEqual(volume.sections.map(section => section.name));
  expect(end).toMatchObject({ beat: volume.beats, scheduler: false, runBus: false });
  expect(end!.elapsed).toBeCloseTo(duration, 5);
  expect(end!.wall - firstBeforeAnchor!.wall).toBeGreaterThanOrEqual((duration - 0.15) * 1000);
  expect(end!.wall - firstBeforeAnchor!.wall).toBeLessThan((duration + 1) * 1000);
  expect(result).toMatchObject({ lives: 5, passed: result.total, judged: result.total });
  expect(await page.evaluate(() => window.b0Harness.snapshot().result?.title)).toBe('ESCAPED');
  expect(errors).toEqual([]);
  report('sightseeing-full', { volume: volume.id, duration, elapsed: end!.elapsed,
    wallSeconds: (end!.wall - firstBeforeAnchor!.wall) / 1000, steps: steps.length, gates: result.total, lives: result.lives });
});

for (const [index, volume] of VOLUMES.entries()) {
  test(`${volume.id} completes the full song on real audio time`, async ({ page, browser }) => {
    const duration = volume.beats * 60 / volume.bpm;
    test.setTimeout((duration + 45) * 1000);
    const errors = await openSync(page);
    await mount(page, volume.id);
    await page.locator('#start').click();
    await phase(page, 'playing');
    await page.waitForFunction(() => ['paused', 'crash', 'results', 'error'].includes(window.b0Harness.snapshot().phase),
      undefined, { timeout: (duration + 8) * 1000, polling: 200 });
    const transition = await state(page);
    expect(transition.phase, JSON.stringify(transition)).not.toBe('paused');
    await phase(page, 'results');
    const result = await state(page);
    const data = await trace(page);
    const first = data.steps[0];
    const last = data.steps.at(-1);
    const stepTime = 15 / volume.bpm;
    const gridError = Math.max(...data.steps.map(item => Math.abs(item.at - first.at - item.step * stepTime)));
    const leads = data.steps.map(item => item.at - item.trigger);
    report('full', { volume: volume.id, browser: browser.version(), duration, first, last, gridError,
      leadRange: [Math.min(...leads), Math.max(...leads)], count: data.steps.length,
      ...Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'steps')), result });
    expect(data.steps.map(item => [item.run, item.step])).toEqual(Array.from({ length: volume.beats * 4 }, (_, i) => [first.run, i]));
    expect(gridError).toBeLessThan(1e-9);
    expect(Math.min(...leads)).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...leads)).toBeLessThanOrEqual(0.120 + 1e-9);
    expect(data.firstBeforeAnchor).toMatchObject({ beat: 0, elapsed: 0, simTime: 0 });
    expect(data.firstTick?.elapsed).toBeGreaterThanOrEqual(STEP);
    expect(data.minQuantization).toBeGreaterThanOrEqual(-1e-9);
    expect(data.maxQuantization).toBeLessThanOrEqual(STEP + 1e-9);
    expect(data.sections.map(frame => frame.section)).toEqual(volume.sections.map(section => section.name));
    let boundary = 0;
    for (const [index, section] of volume.sections.entries()) {
      expect(data.sections[index].beat - boundary).toBeGreaterThanOrEqual(-1e-8);
      expect(data.sections[index].beat - boundary).toBeLessThanOrEqual(STEP * volume.bpm / 60 + 1e-8);
      boundary += section.beats;
    }
    expect(data.lastGate?.beat).toBeGreaterThanOrEqual(data.lastGate!.lastGateBeat! - 1e-8);
    expect(data.lastGate!.beat - data.lastGate!.lastGateBeat!).toBeLessThanOrEqual(STEP * volume.bpm / 60 + 1e-8);
    expect(data.end).toMatchObject({ beat: volume.beats, scheduler: false, runBus: false });
    expect(result).toMatchObject({ beat: volume.beats, passed: gateCounts[index], judged: gateCounts[index],
      total: gateCounts[index], score: normalScores[index], lives: volume.lives.normal, scheduler: false, runBus: false });
    expect(await page.evaluate(() => window.b0Harness.snapshot().result)).toEqual({
      title: 'ESCAPED', rank: 'S', accuracy: 1, ...(volume.id === 'elsewhere' ? { route: 'main' } : {}),
    });
    expect(errors).toEqual([]);
  });
}
