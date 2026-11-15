import { expect, test } from '@playwright/test';
import { OutroInspection } from '../../app/game/debug/outro-inspection';
import { volumeById } from '../../app/game/core/volumes';
import type {} from '../harness/main';

test('near and far panels enclose the standard route and all three glass branches', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const geometry = await page.evaluate(() => window.b0Harness.inspectDaybreakContinuity());
  expect(geometry.misses).toEqual([]);
  expect(geometry.before.farThrough).toBe(geometry.pathLength);
  expect(geometry.after.far).toBe(geometry.before.far);
  expect(geometry.after.near.length).toBeLessThanOrEqual(4);
  expect(geometry.released).toBeGreaterThan(0);
});

test('DAYBREAK reaches near-white in the live renderer at cruise and under sustained Boost', async ({ page }, info) => {
  for (const boost of [0, 1]) {
    const capture = (time: number, align = 1) => page.goto(`/?vol=daybreak&diff=hard&align=${align}&god=0&q=low&dbg=1&boost=${boost}&t=${time}`);
    const flash = page.locator('#flash');
    await capture(138);
    await expect(flash).toHaveCSS('opacity', '0');
    await capture(141);
    await expect(flash).toHaveCSS('opacity', '0.495');
    await capture(144);
    await expect(flash).toHaveCSS('opacity', '0.99');
    await expect(page.locator('#shade')).toHaveCSS('opacity', '0');
    await info.attach(`daybreak-white-boost-${boost}`, { body: await page.screenshot(), contentType: 'image/png' });
    await capture(146.5);
    await expect(page.locator('#over-title')).toHaveText('ESCAPED');
    const diagnostics = JSON.parse((await page.locator('#errbox').textContent())!);
    expect(diagnostics.renderedVolume).toBe('daybreak');
    expect(diagnostics.continuity.far).toBeGreaterThan(1);
    expect(diagnostics.continuity.near).toHaveLength(diagnostics.chunks);
    if (boost) expect(diagnostics.outroPhase).toBe('afterglow');
    await capture(141, 0);
    await expect(page.locator('#over-title')).toHaveText('TERMINATED');
    await expect(flash).toHaveCSS('opacity', '0');
  }
});

test('End Sequence Studio renders DAYBREAK routes, pickup, Encore and long-lived backgrounds', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/debug/#outro');
  const studio = page.locator('#outro');
  await studio.getByRole('button', { name: 'Open live ending' }).click();
  await expect(studio.getByRole('img', { name: 'Live ELSEWHERE ending' })).toHaveAttribute('data-station', /\d+/);
  await studio.getByLabel('World', { exact: true }).selectOption('daybreak');
  const canvas = studio.getByRole('img', { name: 'Live DAYBREAK ending' });
  const go = (name: string) => studio.getByRole('button', { name, exact: true }).click();
  await go('Branch Preview');
  await expect(canvas).toHaveAttribute('data-junction-meshes', '8');
  await info.attach('branch-preview', { body: await canvas.screenshot(), contentType: 'image/png' });
  for (const route of ['main', 'challenge', 'score']) {
    await studio.getByLabel('Route', { exact: true }).selectOption(route);
    await go('Selected Route');
    const [station, arc] = await canvas.evaluate(el => [Number(el.dataset.station), Number(el.dataset.routeArc)]);
    if (route === 'main') expect(arc).toBe(station);
    else expect(arc).toBeGreaterThan(station);
  }
  await go('Branch Rejoin');
  await go('Pickup');
  await expect(canvas).toHaveAttribute('data-pickup', 'true');
  await go('Encore First Gate');
  await expect(canvas).toHaveAttribute('data-gate-stations', /\[1,"daybreak-vertical"/);
  const inspection = new OutroInspection('standard', 0, 'score', undefined, 'normal', volumeById('daybreak'));
  await go('Encore Final Gate');
  await expect(canvas).toHaveAttribute('data-gate-stations', new RegExp(`\\[${inspection.plan.gates.length},"daybreak-`));
  await go('Escape White Start');
  await expect(canvas).toHaveAttribute('data-beat', '276.000');
  await expect(canvas).toHaveAttribute('data-escape-white', '0');
  await go('Escape White Peak');
  await expect(canvas).toHaveAttribute('data-escape-white', '0.99');
  await go('Results Background');
  await expect(canvas).toHaveAttribute('data-phase', 'results');
  await expect(canvas).toHaveAttribute('data-escape-white', '0');
  await info.attach('results-background', { body: await canvas.screenshot(), contentType: 'image/png' });
  const settled = await canvas.getAttribute('data-station');
  for (const minutes of [5, 15, 30]) {
    await go(`Menu · ${minutes} min`);
    await expect(canvas).toHaveAttribute('data-phase', 'menu');
    expect(Number(await canvas.getAttribute('data-station'))).toBeCloseTo(4340 + 2.6 * minutes * 60);
    await go(`Results · ${minutes} min`);
    await expect(canvas).toHaveAttribute('data-phase', 'results');
    expect(Number(await canvas.getAttribute('data-station'))).toBeCloseTo(Number(settled), 1);
  }
  await expect(studio.getByText(/Far \d+ chunks through/)).toBeVisible();
  await expect(studio.getByRole('img')).toHaveCount(1);
  await go('Close live ending');
  expect(errors).toEqual([]);
});

test('selecting DAYBREAK replaces the visible menu scene before the player starts', async ({ page }) => {
  await page.goto('/?vol=elsewhere&q=low&dbg=1');
  const diagnostics = page.locator('#errbox');
  await expect(diagnostics).toContainText('"renderedVolume":"elsewhere"');
  await page.getByRole('button', { name: 'next volume' }).click();
  await expect(diagnostics).toContainText('"renderedVolume":"daybreak"');
  await expect(diagnostics).toContainText('"phase":"menu"');
  await expect(page.locator('canvas#gl')).toHaveCount(1);
});
