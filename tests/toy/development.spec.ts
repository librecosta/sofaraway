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
  await page.getByLabel('Width', { exact: true }).fill('900');
  await page.getByLabel('Width', { exact: true }).press('Enter');
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
  const gateZones = frame.getByRole('switch', { name: '门型判定区（开发）' });
  await expect(gateZones).not.toBeChecked();
  const gateZonesModule = page.waitForRequest(request =>
    new URL(request.url()).pathname.endsWith('/live-gate-quality.client.ts'));
  await gateZones.check();
  await gateZonesModule;
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
  await expect(gateZones).toBeChecked();
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

test('player mode requests drive the offline container and share the flight lifecycle', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5174/');
  const frame = page.frameLocator('iframe');
  const mode = frame.locator('[data-act=fullscreen]');
  const start = frame.locator('[data-act=start]');
  await expect(start).toBeEnabled();
  const canvas = await frame.locator('#gl').elementHandle();
  await page.getByLabel('Device').selectOption('android');
  await page.getByLabel('Orientation').selectOption('portrait');
  const setNumber = async (label: string, value: string) => {
    const field = page.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.press('Enter');
  };
  await setNumber('Capsule width', '110');
  await setNumber('Capsule height', '35');
  await setNumber('Bottom bar height', '50');
  await expect(frame.locator('html')).toHaveCSS('--safe-area-top', '35px');
  await expect(frame.locator('html')).toHaveCSS('--safe-area-bottom', '50px');
  await expect(mode).toHaveAccessibleName('横屏游玩');

  await page.getByLabel('Mode response').selectOption('reject');
  await mode.click();
  const status = frame.locator('#menu [role=status]');
  await expect(status).toContainText('容器未确认');
  await expect(start).toBeEnabled();
  await page.getByLabel('Mode response').selectOption('timeout');
  await mode.click();
  await expect(status).toContainText('正在切换显示模式');
  await expect(start).toBeDisabled();
  await expect(status).toContainText('容器未确认');
  await expect(start).toBeEnabled();
  await expect(mode).toHaveAccessibleName('横屏游玩');

  await page.getByLabel('Mode response').selectOption('accept');
  await mode.click();
  await expect(page.getByLabel('Orientation')).toHaveValue('landscape');
  await expect(page.getByLabel('Immersive')).toBeChecked();
  await expect(page.getByRole('list', { name: 'Container log' })).toContainText('Confirmed: landscape, immersive on');
  await expect(mode).toHaveAccessibleName('退出沉浸模式');
  await mode.click();
  await expect(page.getByLabel('Orientation')).toHaveValue('portrait');
  await expect(page.getByLabel('Immersive')).not.toBeChecked();
  await frame.locator('[data-act=settings]').click();
  await frame.locator('[data-q=low]').click();
  await frame.locator('#set-auto-boost').check();
  await frame.getByRole('button', { name: '横屏', exact: true }).click();
  await expect(page.getByLabel('Orientation')).toHaveValue('landscape');
  await frame.locator('[data-act=closesettings]').click();
  await start.click();
  await expect(frame.locator('#hud-boost')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Suspend', exact: true }).click();
  await expect(frame.getByRole('heading', { name: '已暂停' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(frame.locator('#hud-boost')).toHaveCSS('opacity', '1');
  expect(await canvas!.evaluate(element => element === document.querySelector('#gl'))).toBe(true);
  await page.getByRole('button', { name: 'Close container' }).click();
  await expect(frame.getByText('玩具容器已关闭。')).toBeVisible();
  await expect(frame.locator('#gl')).toHaveCount(0);
});
