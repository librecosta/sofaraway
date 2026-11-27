import { expect, test } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const china = process.env.VITE_REGION === 'cn';
const footer = '#menu footer[aria-label="China registration"]';
const start = '[data-act=start]';
const canonical = 'https://sofaraway.librecosta.com/';
const filings = [
  { label: '蜀ICP备2025158691号-3', url: 'https://beian.miit.gov.cn/' },
  { label: '川公网安备51010702045043号', url: 'https://beian.mps.gov.cn/#/query/webSearch?code=51010702045043' },
];
const registration = /2025158691|51010702045043|beian\.(?:miit|mps)\.gov\.cn|China registration/;

test('the static artifact contains registration data only in the China build', async ({ browser, baseURL }) => {
  const icon = await readFile('app/components/china-public-security.png');
  const encodedIcon = icon.toString('base64');
  const files = await readdir('build/client', { recursive: true, withFileTypes: true });
  for (const file of files) {
    if (!file.isFile()) continue;
    const path = join(file.parentPath, file.name);
    expect(file.name).not.toContain('china-public-security');
    const bytes = await readFile(path);
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
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', canonical);
    if (!china) {
      await expect(page.locator(footer)).toHaveCount(0);
      return;
    }
    const links = page.locator(footer).getByRole('link');
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

test('the China footer fits compact touch layouts and leaves the menu with each flight mode', async ({ browser, baseURL }, info) => {
  test.skip(!china, 'Requires a China artifact.');
  for (const [width, height] of [[640, 360], [844, 390], [360, 640], [390, 844]]) {
    const page = await browser.newPage({ baseURL, viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    try {
      await page.addInitScript(preference => localStorage.setItem('sofaraway.orientation', preference), width > height ? 'landscape' : 'portrait');
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
