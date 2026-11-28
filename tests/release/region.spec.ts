import { expect, test } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const china = process.env.VITE_REGION === 'cn';
const defaultLocale = china ? 'zh-CN' : 'en';
const footer = '#menu footer[data-registration="cn"]';
const start = '[data-act=start]';
const canonical = 'https://sofaraway.librecosta.com/';
const filings = [
  { label: '蜀ICP备2025158691号-3', url: 'https://beian.miit.gov.cn/' },
  { label: '川公网安备51010702045043号', url: 'https://beian.mps.gov.cn/#/query/webSearch?code=51010702045043' },
];
const registration = /2025158691|51010702045043|beian\.(?:miit|mps)\.gov\.cn|China registration|中国大陆备案/;

test('the static artifact contains registration data only in the China build', async ({ browser, baseURL }) => {
  const icon = await readFile('app/components/china-public-security.png');
  const encodedIcon = icon.toString('base64');
  const files = await readdir('build/client', { recursive: true, withFileTypes: true });
  for (const file of files) {
    if (!file.isFile()) continue;
    const path = join(file.parentPath, file.name);
    expect(file.name).not.toContain('china-public-security');
    const bytes = await readFile(path);
    expect(bytes.includes('sofaraway.bilibili.sofaraway') || bytes.includes('data-toy-dev-console'), path).toBe(false);
    expect(bytes.includes('/bfs/seed/toy/app/sdk/toy-sdk.js') || bytes.includes('getContainerState'), path).toBe(false);
    expect(bytes.includes('toy-rank-dialog') || bytes.includes('submitScore') || bytes.includes('getRankList'), path).toBe(false);
    expect(bytes.includes(icon), path).toBe(false);
    if (!china || file.name.endsWith('.html') && path !== join('build/client', 'index.html')) {
      const content = bytes.toString('utf8');
      expect(content, path).not.toMatch(registration);
      expect(content, path).not.toContain(encodedIcon);
    }
  }

  const page = await browser.newPage({ baseURL, javaScriptEnabled: false });
  try {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', defaultLocale);
    await expect(page.locator('noscript p')).toHaveText(china
      ? '请启用 JavaScript，并使用支持 WebGL2 的浏览器游玩。'
      : 'Enable JavaScript and use a WebGL2-capable browser to play.');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', canonical);
    if (!china) {
      await expect(page.locator(footer)).toHaveCount(0);
      return;
    }
    const links = page.locator(footer).getByRole('link');
    await expect(page.locator(footer)).toHaveAccessibleName('中国大陆备案');
    await expect(links).toHaveCount(filings.length);
    for (const { label, url } of filings) {
      const link = page.getByRole('link', { name: label, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', url);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noreferrer');
    }
    const badge = page.locator(footer).locator('img');
    await expect(badge).toHaveAttribute('src', 'data:image/png;base64,' + encodedIcon);
    expect(await badge.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([36, 40]);
  } finally {
    await page.close();
  }
});

test('Web keeps fixed-time diagnostics and flight recorder shortcuts', async ({ page }) => {
  await page.goto('/?q=low&t=8&dbg=1&rec=1&vol=daybreak');
  const readout = page.locator('#errbox');
  await expect(readout).toContainText('"renderedVolume":"daybreak"');
  await expect(readout).toContainText('"phase":"playing"');
  const snapshot = await readout.textContent();
  const recorder = page.locator('canvas#rec');
  await expect(recorder).toBeVisible();
  await page.keyboard.press('r');
  await expect(recorder).toBeHidden();
  await page.keyboard.press('r');
  await expect(recorder).toBeVisible();
  const download = page.waitForEvent('download');
  await page.keyboard.press('Shift+r');
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await expect(readout).toHaveText(snapshot!);
});

test('the build locale hydrates, accepts a persisted override and keeps the region and Explorer language', async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on('pageerror', error => hydrationErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /hydrat|Minified React error #(418|423|425)/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem('sofaraway.locale')) localStorage.setItem('sofaraway.locale', 'invalid');
  });
  await page.goto('/?q=low');
  await expect(page.locator(start)).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('lang', defaultLocale);
  await expect(page.locator(start)).toHaveAccessibleName(china ? '开始 · 按 X' : 'START · PRESS X');
  await page.locator('[data-act=settings]').click();
  const chosen = china ? 'en' : 'zh-CN';
  await page.getByRole('button', { name: china ? 'English' : '简体中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', chosen);
  await page.locator('[data-act=closesettings]').click();
  await expect(page.locator(start)).toHaveAccessibleName(china ? 'START · PRESS X' : '开始 · 按 X');
  await expect(page.locator(footer)).toHaveCount(china ? 1 : 0);
  if (china) await expect(page.locator(footer)).toHaveAccessibleName('China registration');
  expect(await page.evaluate(() => localStorage.getItem('sofaraway.locale'))).toBe(chosen);
  await page.reload();
  await expect(page.locator(start)).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('lang', chosen);
  await expect(page.locator(footer)).toHaveCount(china ? 1 : 0);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', canonical);
  await page.goto('/debug/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(hydrationErrors).toEqual([]);
});

test('the China footer fits compact touch layouts and leaves the menu with each flight mode', async ({ browser, baseURL }, info) => {
  test.skip(!china, 'Requires a China artifact.');
  for (const [width, height] of [[640, 360], [844, 390], [360, 640], [390, 844]]) {
    const page = await browser.newPage({ baseURL, viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    try {
      await page.goto('/?q=low');
      await expect(page.locator(start)).toBeEnabled();
      const registrationFooter = page.locator(footer);
      await expect(registrationFooter).toBeInViewport({ ratio: .99 });
      for (const selector of [start, '[data-act=settings]', '[data-act=fullscreen]']) {
        await expect(page.locator(selector), `${width}×${height}`).toBeInViewport({ ratio: .99 });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (process.env.F6_REGION_SCREENSHOTS === '1') {
        await page.screenshot({ path: info.outputPath(`cn-${width}x${height}.png`) });
      }
      if (width === 844 || width === 390) {
        const showcase = width === 844;
        if (showcase) await page.goto('/?q=low&mode=showcase&route=main&seed=1');
        await expect(registrationFooter).toBeVisible();
        await page.locator(start).tap();
        await expect(page.locator('#menu')).toBeHidden();
        await expect(registrationFooter).toHaveCount(0);
        if (showcase) {
          await expect(page.locator('#hud')).toHaveCount(0);
          await expect(page.locator('#gl')).toHaveCSS('cursor', 'none');
        } else await expect(page.locator('#hud')).toBeVisible();
      }
    } finally {
      await page.close();
    }
  }
});
