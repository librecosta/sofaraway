import { expect, test } from '@playwright/test';
import { stat, utimes } from 'node:fs/promises';

test('offline console updates the existing player and serves hot updates', async ({ page }) => {
  const requests = new Set<string>();
  page.on('request', request => requests.add(request.url()));
  await page.goto('http://127.0.0.1:5174/');
  await expect(page.getByRole('heading', { name: 'Toy Dev Console' })).toBeVisible();
  const frame = page.frameLocator('iframe[title="SoFarAway Toy"]');
  await expect(frame.locator('[data-act=start]')).toBeEnabled();
  const canvas = await frame.locator('#gl').elementHandle();
  await page.getByLabel('Device').selectOption('android');
  await page.getByLabel('Orientation').selectOption('portrait');
  await expect(page.getByRole('status')).toHaveText('393 × 800 CSS px');
  await page.getByLabel('Device').selectOption('ios');
  await expect(page.getByRole('status')).toHaveText('844 × 390 CSS px');
  await page.getByLabel('Width').fill('900');
  await page.getByLabel('Width').press('Enter');
  await expect(page.getByRole('status')).toHaveText('900 × 390 CSS px');
  await page.getByLabel('Safe area top').fill('36');
  await page.getByLabel('Safe area top').press('Enter');
  await expect.poll(() => frame.locator('html').evaluate(element =>
    getComputedStyle(element).getPropertyValue('--safe-area-top'))).toBe('36px');
  await page.getByLabel('Immersive').check();
  await expect(page.locator('iframe')).toHaveCSS('outline-style', 'none');
  await page.getByLabel('SDK unavailable').check();
  await expect(page.getByRole('status')).toContainText('SDK unavailable.');
  await page.getByRole('button', { name: 'Reset simulation' }).click();
  await expect(page.getByLabel('Device')).toHaveValue('desktop');
  await expect(page.getByRole('status')).toHaveText('960 × 540 CSS px');
  await frame.locator('[data-act=settings]').click();
  await frame.locator('#set-auto-boost').check();
  expect(await page.evaluate(() => ({
    development: localStorage.getItem('sofaraway.bilibili.sofaraway.dev.autoBoost'),
    release: localStorage.getItem('sofaraway.bilibili.sofaraway.autoBoost'),
  }))).toEqual({ development: 'true', release: null });

  // Trigger Vite's real file watcher without changing any tracked contents.
  const stylesheet = 'toy/dev/console.css';
  const { atime } = await stat(stylesheet);
  const hotUpdate = page.waitForRequest(request => /\/dev\/console\.css.*[?&]t=\d+/.test(request.url()));
  await utimes(stylesheet, atime, new Date());
  await hotUpdate;
  expect(await canvas!.evaluate(element => element === document.querySelector('#gl'))).toBe(true);
  await expect(frame.locator('#set-auto-boost')).toBeChecked();
  await frame.locator('[data-q=low]').click();
  await frame.locator('[data-act=closesettings]').click();
  await frame.locator('[data-act=start]').click();
  await expect(frame.locator('#hud-boost')).toHaveCSS('opacity', '1');
  await page.getByLabel('Device').selectOption('android');
  await expect(frame.locator('#hud-boost')).toHaveCSS('opacity', '1');
  expect(await canvas!.evaluate(element => element === document.querySelector('#gl'))).toBe(true);
  expect([...requests].every(url => url.startsWith('http://127.0.0.1:5174/'))).toBe(true);
});
