import { expect, test } from '@playwright/test';
import { VOLUMES } from '../../app/game/core/volumes';
import type {} from '../harness/main';

const harness = 'http://127.0.0.1:8090/';

test('mode is keyboard accessible and switching back restores the Standard difficulty', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?q=low');
  const group = page.getByRole('group', { name: 'Play mode' });
  const standard = group.getByRole('button', { name: 'STANDARD' });
  const sightseeing = group.getByRole('button', { name: 'SIGHTSEEING' });
  const hard = page.locator('[data-diff=hard]');
  await expect(standard).toHaveAttribute('aria-pressed', 'true');
  await hard.click();
  await sightseeing.press('Enter');
  await expect(sightseeing).toHaveAttribute('aria-pressed', 'true');
  await expect(hard).toHaveCount(0);
  await expect(page.getByText('5 LIVES · ⅓ SPEED')).toBeInViewport();
  await expect(page.locator('[data-act=start]')).toBeInViewport();
  await page.getByRole('button', { name: 'next volume' }).click();
  await expect(page.locator('#vol-name')).toContainText('DRIFT');
  await page.reload();
  await expect(sightseeing).toHaveAttribute('aria-pressed', 'true');
  await standard.click();
  await expect(hard).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sofaraway.mode'))).toBe('standard');
});

test('every sightseeing volume and ELSEWHERE route completes in the results UI', async ({ page }) => {
  const scenarios = [
    { volume: VOLUMES[0], side: 'center', gates: 48, route: 'MAIN' },
    { volume: VOLUMES[0], side: 'right', gates: 49, route: 'CHALLENGE' },
    { volume: VOLUMES[0], side: 'left', gates: 53, route: 'BONUS' },
    { volume: VOLUMES[1], side: 'center', gates: 13 },
    { volume: VOLUMES[2], side: 'center', gates: 53 },
    { volume: VOLUMES[3], side: 'center', gates: 31 },
  ];
  for (const { volume, side, gates, route } of scenarios) {
    const seconds = volume.beats * 60 / volume.bpm + 0.8;
    await page.goto(`/?vol=${volume.id}&mode=sightseeing&diff=hard&t=${seconds}&q=low&align=1&god=0&route=${side}&boost=${side === 'right' ? 1 : 0}`);
    await expect(page.locator('#over-title')).toHaveText('ESCAPED');
    await expect(page.locator('#over-mode')).toHaveText('SIGHTSEEING');
    await expect(page.locator('#over-rank')).toHaveCount(0);
    await expect(page.locator('#over-gates')).toHaveText(`${gates}/${gates}`);
    await expect(page.locator('#over-acc')).toHaveText('100%');
    if (route) await expect(page.locator('#over-route')).toHaveText(route + ' ROUTE');
  }
});

test('sightseeing renders all three portals and route gates remain attached to the shorter path', async ({ page }) => {
  await page.goto(harness);
  const { samples, resets } = await page.evaluate(() => window.b0Harness.inspectJunction('sightseeing'));
  for (const sample of samples) {
    expect(sample.previewBeforeChoice.some(frame => frame.visible.length === 3), JSON.stringify(sample.previewBeforeChoice)).toBe(true);
    expect(sample.activeGates.length).toBeGreaterThan(0);
    expect(new Set(sample.activeGates)).toEqual(new Set([sample.route]));
    expect(Math.max(...sample.gateErrors)).toBeLessThan(1e-6);
    expect(sample.released).toBe(true);
    expect(sample.glError).toBe(0);
  }
  expect(resets.slice(6)).toEqual(resets.slice(3, 6));
});

test('only Standard writes Best Score at the end of a live run', async ({ page }) => {
  await page.goto(harness);
  for (const mode of ['sightseeing', 'standard'] as const) {
    const paused = await page.evaluate(async mode => {
      await window.b0Harness.mount({ volumeId: 'drift', mode, quality: 'low', best: 17,
        diagnostics: { fixedTime: null, autoplay: false, align: true, god: false, boost: false,
          mobileQuality: false, post: true, record: false, debug: false } });
      await window.b0Harness.start(true);
      window.b0Harness.advanceAndPause(223.5);
      return window.b0Harness.snapshot();
    }, mode);
    expect(paused).toMatchObject({ mode, phase: 'paused' });
    expect(paused.progress).toBeGreaterThan(0.99);
    await page.evaluate(() => window.b0Harness.resume(true));
    await expect.poll(() => page.evaluate(() => window.b0Harness.snapshot().phase)).toBe('results');
    const result = await page.evaluate(() => ({ ...window.b0Harness.snapshot(), best: window.b0Harness.best() }));
    expect(result.result?.title).toBe('ESCAPED');
    expect(result.score).toBeGreaterThan(17);
    expect(result.best).toBe(mode === 'sightseeing' ? 17 : result.score);
  }
});
