import { expect, test } from '@playwright/test';
import { OutroInspection, outroView } from '../../app/game/debug/outro-inspection';
import type {} from '../harness/main';

test('ELSEWHERE fades to white on the music clock at cruise and under sustained Boost', async ({ page }) => {
  const flash = page.locator('#flash');
  const diagnostics = page.locator('#errbox');
  for (const boost of [0, 1]) {
    const capture = (time: number) => page.goto(`/?vol=elsewhere&diff=normal&align=1&god=0&q=low&dbg=1&boost=${boost}&t=${time}`);
    await capture(204);
    await expect(diagnostics).toContainText('"phase":"playing"');
    await expect(flash).toHaveCSS('opacity', '0');

    await capture(207.1875); // Six of the final twelve beats have elapsed.
    await expect(diagnostics).toContainText(`"outroPhase":"${boost ? 'afterglow' : 'main'}"`);
    await expect(flash).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(flash).toHaveCSS('opacity', '0.475');

    await capture(210);
    await expect(diagnostics).toContainText('"phase":"crash"');
    await expect(flash).toHaveCSS('opacity', '0.95');

    await capture(210.8);
    await expect(page.locator('#over-title')).toHaveText('ESCAPED');
    await expect(flash).toHaveCSS('opacity', '0');
  }
});

test('End Sequence Studio locates real gates, keeps music separate, flies, and restores its single context', async ({ page }) => {
  await page.goto('/debug/#outro');
  const studio = page.locator('#outro');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(studio.getByRole('heading', { name: 'End Sequence Studio' })).toBeVisible();
  await studio.getByRole('button', { name: 'Open live ending' }).click();
  const canvas = studio.getByRole('img', { name: 'Live ELSEWHERE ending' });
  const inspection = new OutroInspection('standard', 0, 'main');
  await expect(canvas).toHaveAttribute('data-station', outroView(inspection.plan, 'main-last').station.toFixed(6));
  for (const [label, preset, index] of [['Encore First Gate', 'encore-first', 1],
    ['Encore Middle', 'encore-middle', 12], ['Encore Final Gate', 'encore-final', 24]] as const) {
    await studio.getByRole('button', { name: label, exact: true }).click();
    const view = outroView(inspection.plan, preset);
    await expect(canvas).toHaveAttribute('data-station', view.station.toFixed(6));
    await expect(canvas).toHaveAttribute('data-gate-stations', new RegExp(`\\[${index},`));
    const gates = JSON.parse((await canvas.getAttribute('data-gate-stations'))!);
    expect(gates.find(([id]: number[]) => id === index)).toEqual([index, view.gate!.kind, view.gate!.worldStation]);
    expect(Number(await canvas.getAttribute('data-encore-meshes'))).toBeLessThanOrEqual(3);
  }
  const station = (await canvas.getAttribute('data-station'))!;
  const hue = await canvas.getAttribute('data-hue');
  await studio.getByLabel('Music beat').fill('320');
  await expect(canvas).toHaveAttribute('data-beat', '320.000');
  await expect(canvas).toHaveAttribute('data-station', station);
  await expect(canvas).not.toHaveAttribute('data-hue', hue!);
  await studio.getByLabel('Spatial position').fill('250');
  await expect(canvas).toHaveAttribute('data-station', (inspection.plan.mainLastStation + 250).toFixed(6));
  await expect(canvas).toHaveAttribute('data-beat', '320.000');

  const seed = studio.getByLabel('Run seed');
  await seed.fill('29');
  await studio.getByRole('button', { name: 'Encore Middle', exact: true }).click();
  const from29 = (await canvas.getAttribute('data-gate-stations'))!;
  await seed.fill('0');
  await expect(canvas).not.toHaveAttribute('data-gate-stations', from29);
  await seed.fill('29');
  await expect(canvas).toHaveAttribute('data-gate-stations', from29);
  await studio.getByLabel('Route').selectOption('challenge');
  await expect(canvas).toHaveAttribute('data-route', 'challenge');
  expect(await canvas.getAttribute('data-route-arc')).not.toBe(await canvas.getAttribute('data-station'));

  await studio.getByRole('button', { name: 'Afterglow Peak', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-afterglow', 'luminous');
  const entry = (await canvas.getAttribute('data-station'))!;
  const high = await canvas.screenshot();
  await studio.getByLabel('Preview quality').selectOption('low');
  expect((await canvas.screenshot()).equals(high)).toBe(false);
  await expect(canvas).toHaveAttribute('data-station', entry);
  const width = await canvas.evaluate((element: HTMLCanvasElement) => element.width);
  await page.setViewportSize({ width: 840, height: 720 });
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBeLessThan(width);
  await expect(canvas).toHaveAttribute('data-afterglow', 'luminous');
  for (const movement of ['Cruise', 'Boost']) {
    await studio.getByLabel('Movement').selectOption(movement);
    await studio.getByRole('button', { name: 'Play 10s', exact: true }).click();
    await expect.poll(async () => Number(await canvas.getAttribute('data-station'))).toBeGreaterThan(Number(entry) + 2);
    await studio.getByRole('button', { name: 'Stop and reset' }).click();
    await expect(canvas).toHaveAttribute('data-station', entry);
    await expect(canvas).toHaveAttribute('data-beat', '320.000');
  }
  await studio.getByLabel('Play mode').selectOption('sightseeing');
  await expect(studio.getByRole('button', { name: 'Encore Middle', exact: true })).toBeDisabled();
  await expect(canvas).toHaveAttribute('data-mode', 'sightseeing');
  await expect(canvas).toHaveAttribute('data-encore-meshes', '0');
  const restoredStation = (await canvas.getAttribute('data-station'))!;
  expect(await canvas.evaluate((el: HTMLCanvasElement) => {
    const ext = el.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    el.addEventListener('restore-outro', () => ext.restoreContext(), { once: true });
    ext.loseContext();
    return true;
  })).toBe(true);
  const status = studio.locator('p[role=status]');
  await expect(status).toContainText('Waiting to restore');
  await canvas.dispatchEvent('restore-outro');
  await expect(status).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-station', restoredStation);
  await expect(canvas).toHaveAttribute('data-seed', '29');
  await expect(canvas).toHaveAttribute('data-beat', '320.000');
  await expect(canvas).toHaveAttribute('data-afterglow', 'luminous');
  await expect(studio.locator('canvas')).toHaveCount(1);
  await canvas.evaluate((el: HTMLCanvasElement) => {
    const gl = el.getContext('webgl2')!;
    Reflect.set(window, 'endingContextReleased', () => gl.isContextLost());
  });
  await studio.getByRole('button', { name: 'Close live ending' }).click();
  await expect(canvas).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'endingContextReleased')())).toBe(true);
  expect(errors).toEqual([]);
});

test('the real results component remains available without WebGL and keeps Encore separate', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value(this: HTMLCanvasElement, name: string, ...args: unknown[]) {
      return name === 'webgl2' ? null : Reflect.apply(getContext, this, [name, ...args]);
    } });
  });
  await page.goto('/debug/#outro');
  const studio = page.locator('#outro');
  await studio.getByRole('button', { name: 'Open live ending' }).click();
  await expect(studio.locator('p[role=status]')).toContainText('Live ending unavailable');
  const results = studio.getByLabel('Results preview');
  const panel = studio.locator('#preview-over');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('ENCORE BONUS')).toHaveCount(0);
  await results.selectOption('Partial Encore');
  await expect(panel.getByText('ENCORE BONUS')).toBeVisible();
  await expect(panel.getByText('+7200')).toHaveCount(0);
  await results.selectOption('Perfect Encore');
  await expect(panel.getByText('+7200')).toBeVisible();
  await expect(panel.getByText('24/24')).toBeVisible();
  await expect(panel.getByText('TOTAL SCORE')).toBeVisible();
  await studio.getByLabel('Chart difficulty').selectOption('impossible');
  await expect(panel.getByText('IMPOSSIBLE', { exact: true })).toBeVisible();
  await expect(panel.getByText('+10800')).toBeVisible();
  await results.selectOption('Sightseeing Complete');
  await expect(panel.locator('#preview-over-mode')).toHaveText('SIGHTSEEING');
  await expect(panel.getByText('ENCORE BONUS')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('sofaraway.records.v1'))).toBeNull();
});

test('the Impossible Studio exposes dense sections, route views and all 36 Encore gates in one context', async ({ page }) => {
  await page.goto('/debug/#outro');
  const studio = page.locator('#outro');
  await studio.getByRole('button', { name: 'Open live ending' }).click();
  const canvas = studio.getByRole('img', { name: 'Live ELSEWHERE ending' });
  await expect(canvas).toHaveAttribute('data-difficulty', 'normal');
  await studio.getByLabel('Chart difficulty').selectOption('impossible');
  await expect(canvas).toHaveAttribute('data-difficulty', 'impossible');
  for (const [preset, label] of [['build', 'BUILD Gates'], ['drop', 'DROP Gates'], ['finale', 'FINALE Gates']] as const) {
    const inspection = new OutroInspection('standard', 0, 'main', undefined, 'impossible');
    await studio.getByRole('button', { name: label, exact: true }).click();
    await expect(canvas).toHaveAttribute('data-station', inspection.view(preset).station.toFixed(6));
  }
  for (const route of ['main', 'challenge', 'score'] as const) {
    const inspection = new OutroInspection('standard', 0, route, undefined, 'impossible');
    await studio.getByLabel('Route', { exact: true }).selectOption(route);
    await studio.getByRole('button', { name: 'Selected Route', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-route', route);
    await expect(canvas).toHaveAttribute('data-station', inspection.view('branch').station.toFixed(6));
  }
  for (const [label, index] of [['Encore First Gate', 1], ['Encore Middle', 18], ['Encore Final Gate', 36]] as const) {
    await studio.getByRole('button', { name: label, exact: true }).click();
    await expect(canvas).toHaveAttribute('data-gate-stations', new RegExp(`\\[${index},`));
  }
  await studio.getByRole('button', { name: 'Afterglow Peak' }).click();
  await expect(canvas).toHaveAttribute('data-afterglow', 'luminous');
  await studio.getByRole('button', { name: 'Music End' }).click();
  await expect(canvas).toHaveAttribute('data-afterglow', 'closing');
  const finish = Number(await canvas.getAttribute('data-station'));
  const length = Number(await canvas.getAttribute('data-path-length'));
  expect(length - finish).toBeGreaterThanOrEqual(650 - 1e-6);
  await expect(studio.locator('canvas')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('sofaraway.records.v1'))).toBeNull();
});

test('live Encore survives context loss, retries, and menu return with bounded meshes', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090');
  await page.waitForFunction(() => !!window.b0Harness);
  await page.evaluate(async () => {
    await window.b0Harness.mount({ runSeed: 0, volumeId: 'elsewhere', diagnostics: {
      fixedTime: null, autoplay: false, god: false, align: true, boost: true, mobileQuality: false,
      post: true, record: false, debug: false, branchSide: 'center',
    } });
    await window.b0Harness.start(true);
  });
  await page.keyboard.down('Shift');
  const before = await page.evaluate(() => window.b0Harness.advanceAndPause(350));
  await page.keyboard.up('Shift');
  const snapshot = () => page.evaluate(() => window.b0Harness.snapshot());
  const bonus = (await snapshot()).encore;
  expect(bonus?.bonusScore).toBeGreaterThan(0);
  expect(before.metrics.encoreMeshes).toBeGreaterThan(0);
  expect(before.metrics.encoreMeshes).toBeLessThanOrEqual(3);
  expect(await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const ext = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    canvas.addEventListener('restore-outro-run', () => ext.restoreContext(), { once: true });
    ext.loseContext();
    return true;
  })).toBe(true);
  await expect.poll(async () => (await snapshot()).error?.kind).toBe('graphics');
  await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new Event('restore-outro-run')));
  await expect.poll(async () => (await snapshot()).error).toBeNull();
  expect((await snapshot()).encore).toEqual(bonus);
  const start = await page.evaluate(async () => {
    window.b0Harness.returnToMenu();
    await window.b0Harness.start(true);
    return window.b0Harness.snapshot();
  });
  await page.keyboard.down('Shift');
  const again = await page.evaluate(async () => {
    const replay = window.b0Harness.advanceAndPause(350);
    const repeated = window.b0Harness.snapshot();
    window.b0Harness.returnToMenu();
    await window.b0Harness.select('drift');
    return { replay, repeated, next: window.b0Harness.branchState() };
  });
  await page.keyboard.up('Shift');
  expect(start.encore).toBeUndefined();
  expect(again.repeated.encore).toEqual(bonus);
  for (const key of ['geometries', 'textures', 'programs', 'encoreMeshes'] as const) expect(again.replay.metrics[key]).toBe(before.metrics[key]);
  expect(again.next.metrics.encoreMeshes).toBe(0);
});
