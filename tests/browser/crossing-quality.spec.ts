import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const captures = '.local/t1-d1/';

test('Gate Lab distinguishes the legal reward zones for every volume', async ({ page }) => {
  if (process.env.CAPTURE_CROSSING_QUALITY) await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 900 });
  for (const [volume, gate, open] of [
    ['elsewhere', 'iris', 0], ['daybreak', 'daybreak-crystal', 0],
    ['descent', 'laser-matrix', 0], ['descent', 'laser-weave', 1], ['orbit', 'orbit-triple', 4],
  ] as const) {
    await page.goto(`/debug/gates/?vol=${volume}&gate=${gate}&open=${open}`);
    const plot = page.getByRole('img', { name: 'Sampled legal crossing region' });
    await expect(page.locator('[data-pass]')).toContainText('Pass · Precision');
    await expect(plot.locator('path')).toHaveCount(3);
    for (const path of await plot.locator('path').all()) await expect(path).toHaveAttribute('d', /^M/);
    if (process.env.CAPTURE_CROSSING_QUALITY) {
      await page.getByRole('region', { name: 'Aperture and collision' }).screenshot({ path: captures + gate + '.png' });
    }
  }
});

test('both player locales render the rewards and aggregate main and Encore counts', async ({ page }) => {
  if (process.env.CAPTURE_CROSSING_QUALITY) await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [locale, precision, nearMiss, scope] of [
    ['en', 'PRECISION', 'NEAR MISS', 'MAIN + ENCORE'],
    ['zh-CN', '精准穿越', '惊险穿越', '主赛道 + 返场'],
  ] as const) {
    await page.goto(`/debug/interface/?vol=elsewhere&state=precision&locale=${locale}`);
    const studio = page.locator('#ui-states');
    const preview = studio.locator('iframe');
    const frame = studio.frameLocator('iframe');
    const scenario = studio.getByLabel('Scenario');
    const message = frame.locator('#center-msg');
    await expect(message).toHaveText(precision + ' +150');
    await expect(message).toHaveCSS('color', 'rgb(116, 255, 220)');
    if (process.env.CAPTURE_CROSSING_QUALITY) {
      await studio.getByLabel('Real corridor background').check();
      await expect(studio.getByRole('status')).toHaveText('Rendered game corridor');
      await preview.screenshot({ path: captures + `hud-precision-${locale}.png`, animations: 'disabled' });
    }
    await scenario.selectOption('near-miss');
    await expect(message).toHaveText(nearMiss + ' +225');
    await expect(message).toHaveCSS('color', 'rgb(255, 189, 112)');
    if (process.env.CAPTURE_CROSSING_QUALITY) {
      await preview.screenshot({ path: captures + `hud-near-miss-${locale}.png`, animations: 'disabled' });
    }

    await scenario.selectOption('encore-partial');
    const result = frame.locator('#over');
    await expect(result.getByText(scope, { exact: true })).toBeInViewport();
    await expect(result.getByText(precision, { exact: true })).toBeInViewport();
    await expect(result.getByText(nearMiss, { exact: true })).toBeInViewport();
    await expect(result.locator('[data-crossing-count=precision]')).toHaveText('76');
    await expect(result.locator('[data-crossing-count=near-miss]')).toHaveText('14');
    if (process.env.CAPTURE_CROSSING_QUALITY) {
      await preview.screenshot({ path: captures + `results-${locale}.png`, animations: 'disabled' });
    }
    await studio.getByLabel('Preview viewport').selectOption('4');
    await expect(result.getByText(scope, { exact: true })).toBeVisible();
    await studio.getByLabel('Preview viewport').selectOption('5');
    await result.getByRole('button', { name: locale === 'en' ? 'BACK TO MENU' : '返回主菜单' }).scrollIntoViewIfNeeded();
    await expect(result.locator('[data-act=menu]')).toBeInViewport();
  }
});
