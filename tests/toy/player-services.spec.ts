import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const dev = 'http://127.0.0.1:5174/';

async function capture(page: Page, name: string) {
  if (!process.env.TOY_CAPTURE_SERVICES) return;
  const output = '.local/t1-e';
  await mkdir(output, { recursive: true });
  await page.locator('iframe[title="SoFarAway Toy"]').screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
}

test('offline cloud sync waits for consent and isolates accounts, versions and the device records', async ({ page }) => {
  const outbound: string[] = [];
  page.on('request', request => { if (!request.url().startsWith(dev)) outbound.push(request.url()); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const deviceKey = 'sofaraway.bilibili.sofaraway.dev.records.v1.precision-v5';
  const device = JSON.stringify({ version: 1, standard: { elsewhere: { normal: {
    best: 550_000, last: { score: 20, outcome: 'TERMINATED' },
  } } }, sightseeing: {} });
  await page.addInitScript(({ key, data }) => localStorage.setItem(key, data), { key: deviceKey, data: device });
  await page.goto(dev);
  const frame = page.frameLocator('iframe');
  const log = page.getByRole('list', { name: 'Rank request log' });
  await page.getByLabel('Device').selectOption('android');
  await page.getByLabel('Orientation').selectOption('portrait');
  await page.getByLabel('Cloud document').selectOption('conflict');
  await frame.getByRole('button', { name: '云存档', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '云存档' });
  await expect(log.locator('li')).toHaveCount(0);
  await dialog.getByRole('button', { name: '授权并同步' }).click();
  await expect(dialog).toContainText('142,001');
  await expect(dialog).not.toContainText('550,000');
  await expect(log.getByText('Write personal cloud save')).toHaveCount(0);
  const cloudBests = await page.evaluate(async key => {
    const keys = Object.keys(localStorage).filter(name => name.includes('.dev.cloud.'));
    const databases = await indexedDB.databases();
    return { sameDevice: localStorage.getItem(key), keys, hasHandoff: databases.some(db => db.name === keys[0] + '.write') };
  }, deviceKey);
  expect(cloudBests).toMatchObject({ sameDevice: device, hasHandoff: true });
  expect(cloudBests.keys).toHaveLength(1);
  await capture(page, 'cloud-save-zh-portrait');
  await page.getByRole('combobox', { name: 'Account', exact: true }).selectOption('navigator');
  await expect(dialog).not.toContainText('142,001');
  await dialog.getByRole('button', { name: '授权并同步' }).click();
  await expect(dialog).toContainText('73,002');
  await page.getByLabel('Cloud document').selectOption('incompatible');
  await dialog.getByRole('button', { name: '同步最高分' }).click();
  await expect(dialog).toContainText('关卡或计分版本');
  await expect(log.getByText('Write personal cloud save')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Account', exact: true }).selectOption('guest');
  await dialog.getByRole('button', { name: '授权并同步' }).click();
  await expect(dialog).toContainText('请登录哔哩哔哩');
  expect(outbound).toEqual([]);
});

test('result preview draws a localized card and only shows supported native actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(dev);
  await page.getByRole('button', { name: 'Show mock results' }).click();
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: '分享成绩', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '分享成绩' });
  const canvas = dialog.getByRole('img');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAccessibleName(/SoFarAway.*Mock Pilot.*LibreCosta.*ELSEWHERE.*精准穿越.*惊险穿越/);
  const brand = await canvas.evaluate((node: HTMLCanvasElement) => {
    const context = node.getContext('2d')!;
    const left = 1170, width = 184;
    function readBand(top: number, height: number, includeDark = false) {
      const pixels = context.getImageData(left, top, width, height).data;
      let right = 0, darkest = 255, peak = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const lightness = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
        darkest = Math.min(darkest, lightness);
        peak = Math.max(peak, lightness);
        if (lightness > 106 || (includeDark && lightness < 16)) right = Math.max(right, left + (index / 4) % width);
      }
      return { right, darkest, peak };
    }
    return { wordmark: readBand(68, 35), icon: readBand(116, 72, true), width: node.width, height: node.height };
  });
  expect(brand).toMatchObject({ width: 1440, height: 1080 });
  expect(brand.wordmark.right).toBeGreaterThan(1330);
  expect(Math.abs(brand.wordmark.right - brand.icon.right)).toBeLessThan(6);
  expect(brand.wordmark.peak).toBeLessThan(200);
  expect(brand.icon.darkest).toBeGreaterThan(0);
  expect(brand.icon.darkest).toBeLessThan(20);
  expect(brand.icon.peak).toBeGreaterThan(200);
  expect(brand.icon.peak).toBeLessThan(240);
  await expect(dialog.getByRole('button', { name: '分享成绩卡' })).toBeEnabled();
  await dialog.getByRole('button', { name: '保存到相册' }).click();
  await expect(dialog.getByRole('status')).toHaveText('成绩卡已保存。');
  await dialog.getByRole('button', { name: '分享成绩卡' }).click();
  await expect(dialog.getByRole('status')).toHaveText('分享操作已完成。');
  const account = page.getByRole('combobox', { name: 'Account', exact: true });
  await account.selectOption('navigator');
  await expect(canvas).toHaveAccessibleName(/Mock Navigator/);
  await account.selectOption('guest');
  await expect(canvas).toHaveAccessibleName(/B站玩家/);
  await page.getByLabel('Share capability').selectOption('entry');
  await expect(dialog.getByRole('button', { name: '保存到相册' })).toHaveCount(0);
  await dialog.getByRole('button', { name: '分享玩具' }).click();
  await expect(dialog.getByRole('status')).toHaveText('分享操作已完成。');
  await page.getByLabel('Share capability').selectOption('unavailable');
  await expect(dialog.getByRole('button', { name: '分享玩具' })).toHaveCount(0);
  await expect(canvas).toBeVisible();
});

test('flight archive exports all four optical motifs and both locales', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(dev);
  const frame = page.frameLocator('iframe');
  const fixture = page.getByLabel('Mock result volume');
  await page.getByRole('button', { name: 'Show mock results' }).click();
  const captureDir = '.local/t1-e-f1';
  if (process.env.TOY_CAPTURE_ARCHIVE) await mkdir(captureDir, { recursive: true });

  async function archive(file: string, title: string, description: RegExp) {
    await frame.getByRole('button', { name: title, exact: true }).click();
    const dialog = frame.getByRole('dialog', { name: title });
    const canvas = dialog.getByRole('img');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAccessibleName(description);
    const base64 = await canvas.evaluate(async (node: HTMLCanvasElement) => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return node.toDataURL('image/png').split(',')[1];
    });
    const png = Buffer.from(base64, 'base64');
    expect(png.readUInt32BE(16)).toBe(1440);
    expect(png.readUInt32BE(20)).toBe(1080);
    expect(base64.length).toBeLessThan(5_000_000);
    if (process.env.TOY_CAPTURE_ARCHIVE) await writeFile(captureDir + '/' + file + '.png', png);
    return canvas;
  }

  const volumes = [
    ['elsewhere', 'I', '132,320', 'S'],
    ['daybreak', 'II', '107,050', 'A'],
    ['descent', 'III', '90,810', 'B'],
    ['orbit', 'IV', '66,480', 'C'],
  ] as const;
  for (const [volume, number, score, grade] of volumes) {
    await fixture.selectOption(volume);
    await archive(volume, '分享成绩', new RegExp(
      'Mock Pilot.*VOL\\. ' + number + ' · ' + volume.toUpperCase() + '.*' + score + '.*等级 · ' + grade + '.*精准穿越.*惊险穿越'
    ));
    await frame.getByRole('dialog', { name: '分享成绩' }).getByRole('button', { name: '关闭' }).click();
  }

  await page.evaluate(() => localStorage.setItem('sofaraway.bilibili.sofaraway.dev.locale', 'en'));
  await page.reload();
  await page.getByLabel('Device').selectOption('android');
  await page.getByLabel('Orientation').selectOption('portrait');
  await page.getByRole('button', { name: 'Show mock results' }).click();
  const portrait = await archive('elsewhere-en', 'SHARE RESULT', /Mock Pilot.*ELSEWHERE.*132,320.*GRADE · S.*ACCURACY.*PRECISION.*NEAR MISS/i);
  const displayed = await portrait.boundingBox();
  const screen = await page.locator('iframe').boundingBox();
  expect(displayed!.width).toBeLessThan(screen!.width);
  expect(displayed!.width / displayed!.height).toBeCloseTo(4 / 3, 2);
  if (process.env.TOY_CAPTURE_ARCHIVE) {
    await page.locator('iframe').screenshot({ path: captureDir + '/preview-en-portrait.png', animations: 'disabled' });
  }
});
