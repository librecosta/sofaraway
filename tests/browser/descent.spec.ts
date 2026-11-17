import { expect, test } from '@playwright/test';
import { descentGateKinds } from '../../app/game/core/descent-gates';
import { gateDescription, laserExamples } from '../../app/game/debug/catalog';

test('laser gates are loaded before entering view and drawn across the full sight range', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  for (const kind of descentGateKinds) for (const boost of [false, true]) {
    const { samples, glError } = await page.evaluate(({ kind, boost }) =>
      window.b0Harness.inspectGateApproach('descent', kind, boost ? 'low' : 'high', false, boost), { kind, boost });
    const at = (distance: number) => samples.find(({ ahead }) => ahead === distance)!;
    expect(at(451)).toMatchObject({ queued: false, created: false });
    expect(at(445)).toMatchObject({ queued: true, created: true, contrastPixels: 0 });
    expect(at(405).contrastPixels).toBeGreaterThan(0);
    expect(at(280).contrastPixels).toBeGreaterThan(5);
    expect(samples.filter(({ ahead }) => ahead <= 405).every(({ fade }) => fade === 1)).toBe(true);
    expect(at(9).contrastPixels).toBeGreaterThan(at(160).contrastPixels * 10);
    expect(glError).toBe(0);
  }
});

test('rear laser gates contribute a distinct render through a real PRESSURE sequence', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  for (const boost of [false, true]) {
    const { samples, glError } = await page.evaluate(boost =>
      window.b0Harness.inspectGateApproach('descent', 'laser-weave', 'high', false, boost, true), boost);
    for (const { ahead, inFront, fade, contrastPixels } of samples.filter(({ ahead }) => ahead >= 85)) {
      expect(inFront, `gate order at distance ${ahead}`).toBeGreaterThanOrEqual(2);
      expect(fade).toBe(1);
      expect(contrastPixels).toBeGreaterThan(20);
    }
    expect(glError).toBe(0);
  }
});

test('the Debug library renders all 20 laser states and seven facility chapters', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/debug/#descent');
  for (const kind of descentGateKinds) {
    const { label } = gateDescription(kind);
    const canvas = page.getByRole('img', { name: `${label} gate` });
    const select = page.getByRole('combobox', { name: `${label} opening` });
    const images = new Set<string>();
    await expect(select).toBeEnabled();
    for (const index of laserExamples[kind].keys()) {
      await select.selectOption(String(index));
      await expect(canvas).toHaveAttribute('data-rendered-opening', String(index));
      images.add(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()));
    }
    expect(images.size).toBe(laserExamples[kind].length);
    await select.selectOption('0');
    await canvas.screenshot({ path: info.outputPath(`${kind}.png`) });
  }
  await page.getByRole('button', { name: 'Open live facility' }).click();
  const canvas = page.getByRole('img', { name: 'Live DESCENT facility' });
  const chapter = page.getByRole('combobox', { name: 'CONTROL chapter' });
  const frames = [16, 39, 117, 207, 271, 314, 377];
  const stations: number[] = [];
  for (const [index, beat] of frames.entries()) {
    await chapter.selectOption(String(index));
    await expect(canvas).toHaveAttribute('data-light-beat', beat.toFixed(3));
    stations.push(Number(await canvas.getAttribute('data-station')));
    await canvas.screenshot({ path: info.outputPath(`chapter-${index + 1}.png`) });
  }
  expect(stations.every((station, i) => i === 0 || station > stations[i - 1])).toBe(true);
  await chapter.selectOption('5');
  await expect(canvas).toHaveAttribute('data-light-beat', '314.000');
  const cruise = await canvas.screenshot();
  await page.getByRole('checkbox', { name: 'Boost view' }).check();
  const boost = await canvas.screenshot({ path: info.outputPath('lockdown-boost.png') });
  expect(boost.equals(cruise)).toBe(false);
  expect(errors).toEqual([]);
});

test('live flight through the shaft and stator chamber keeps the view and gates stable', async ({ page }, info) => {
  await page.goto('http://127.0.0.1:8090/');
  await page.evaluate(async () => {
    await window.b0Harness.mount({ volumeId: 'descent', quality: 'high', diagnostics: {
      fixedTime: null, autoplay: false, god: false, align: true, boost: false,
      mobileQuality: false, post: true, record: false, debug: true,
    } });
    await window.b0Harness.start(true);
  });
  const metrics = () => page.evaluate(() => JSON.parse(window.b0Harness.metrics() || '{}') as {
    phase: string; beat: number; speed: number; hitCount: number; chunks: number; postFailure: string | null;
  });
  for (const [label, beat, boost] of [['shaft', 204, true], ['core', 269, false]] as const) {
    await page.evaluate(async at => {
      window.b0Harness.advanceAndPause(at);
      await window.b0Harness.resume(true);
    }, beat);
    if (boost) await page.keyboard.down('Shift');
    await expect.poll(async () => (await metrics()).beat).toBeGreaterThan(beat + 3);
    const snapshot = await metrics();
    expect(snapshot).toMatchObject({ phase: 'playing', hitCount: 0, postFailure: null });
    expect(snapshot.chunks).toBeLessThanOrEqual(5);
    if (boost) {
      expect(snapshot.speed).toBeGreaterThan(43);
      await page.keyboard.up('Shift');
    }
    await page.locator('canvas').screenshot({ path: info.outputPath(`live-${label}.png`) });
  }
  await page.evaluate(() => window.b0Harness.dispose());
});

test('DESCENT restores the laser scene at the same station and releases it on switch', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const streamed = await page.evaluate(() => window.b0Harness.streamResources('descent'));
  expect(streamed.oldChunksRemoved).toBe(true);
  expect(streamed.currentDisposals).toBe(streamed.expectedDisposals);
  expect(streamed.remaining).toBe(0);
  const snapshot = () => page.evaluate(() => window.b0Harness.snapshot());
  const at = await page.evaluate(async () => {
    const test = window.b0Harness;
    await test.mount({ volumeId: 'descent', quality: 'low', diagnostics: {
      fixedTime: null, autoplay: false, god: false, align: true, boost: false,
      mobileQuality: false, post: true, record: false, debug: true,
    } });
    await test.start(true);
    const state = test.advanceAndPause(207);
    await test.resume(true);
    return state;
  });
  expect(at.sharedPath).toBe(true);
  expect(at.metrics.calls).toBeGreaterThan(0);
  const extension = await page.evaluateHandle(() => document.querySelector('canvas')!.getContext('webgl2')!
    .getExtension('WEBGL_lose_context'));
  expect(await extension.evaluate(value => value !== null)).toBe(true);
  await extension.evaluate(value => value!.loseContext());
  await expect.poll(async () => (await snapshot()).pauseReason).toBe('context');
  await extension.evaluate(value => value!.restoreContext());
  await expect.poll(async () => (await snapshot()).phase).toBe('playing');
  const restored = await page.evaluate(() => window.b0Harness.branchState());
  expect(restored.sharedPath).toBe(true);
  expect(restored.trackDistance).toBeGreaterThanOrEqual(at.trackDistance);
  expect(restored.trackDistance - at.trackDistance).toBeLessThan(70);
  expect(Math.abs(restored.metrics.geometries - at.metrics.geometries)).toBeLessThanOrEqual(2);
  await page.evaluate(async () => {
    await window.b0Harness.resume(true);
    window.b0Harness.returnToMenu();
    await window.b0Harness.start(true);
  });
  expect((await snapshot()).progress).toBeLessThan(.01);
  const switched = await page.evaluate(async () => {
    const test = window.b0Harness;
    test.returnToMenu();
    await test.select('orbit');
    await test.start(true);
    const state = test.branchState();
    test.dispose();
    return state;
  });
  expect(switched.sharedPath).toBe(true);
  await expect(page.locator('canvas')).toHaveCount(0);
});
