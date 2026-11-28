import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

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
  const logo = await canvas.evaluate((node: HTMLCanvasElement) => {
    const context = node.getContext('2d')!;
    const pixels = context.getImageData(523, 45, 30, 30).data;
    let dark = false, light = false;
    for (let index = 0; index < pixels.length; index += 4) {
      dark ||= pixels[index] < 8 && pixels[index + 1] < 8 && pixels[index + 2] < 8;
      light ||= pixels[index] > 210 && pixels[index + 1] > 210 && pixels[index + 2] > 210;
    }
    return { dark, light, width: node.width, height: node.height };
  });
  expect(logo).toEqual({ dark: true, light: true, width: 720, height: 520 });
  await expect(dialog.getByRole('button', { name: '分享成绩卡' })).toBeEnabled();
  await capture(page, 'result-share-librecosta');
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
