import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const dev = 'http://127.0.0.1:5174/';
const mount = 'https://www.bilibili.com/toy/sofaraway/';
const sdk = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';

async function capture(page: Page, name: string) {
  if (!process.env.TOY_CAPTURE_RANKS) return;
  const output = '.local/t1-d';
  await mkdir(output, { recursive: true });
  const iframe = page.locator('iframe[title="SoFarAway Toy"]');
  await iframe.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
}

test('offline standings keep separate boards and periods with readable portrait and desktop layouts', async ({ page }) => {
  const outbound: string[] = [];
  page.on('request', request => { if (!request.url().startsWith(dev)) outbound.push(request.url()); });
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(dev);
  const frame = page.frameLocator('iframe');
  const open = frame.getByRole('button', { name: '排行榜', exact: true });
  const close = frame.getByRole('button', { name: '关闭', exact: true });
  const log = page.getByRole('list', { name: 'Rank request log' });
  await expect(log.locator('li')).toHaveCount(0);
  await page.getByLabel('Device').selectOption('android');
  await page.getByLabel('Orientation').selectOption('portrait');
  for (const [label, value] of [['Capsule width', '92'], ['Capsule height', '34'], ['Bottom bar height', '52']]) {
    const field = page.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.press('Enter');
  }
  await open.click();
  const dialog = frame.getByRole('dialog', { name: '排行榜' });
  await expect(dialog.getByText('标准模式 · 普通难度 · 任意路线成功撤离')).toBeVisible();
  await expect(dialog.getByRole('row')).toHaveCount(7);
  await expect(dialog).toContainText('134,200');
  await expect(dialog.getByText('我的最高分', { exact: true })).toBeVisible();
  await expect(dialog.locator('.toy-rank-summary')).toHaveCSS('border-top-width', '2px');
  await expect(dialog.getByRole('columnheader').first()).toHaveCSS('border-bottom-width', '2px');
  await expect(dialog.locator('tbody tr:nth-child(2)')).toHaveCSS('background-color', 'rgba(220, 238, 248, 0.047)');
  expect(await dialog.locator('.toy-rank-panel').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.top >= 34 && bounds.bottom <= innerHeight - 52 && bounds.width <= innerWidth && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
  await capture(page, 'leaderboard-zh-portrait');
  await dialog.getByRole('radio', { name: '总榜', exact: true }).press('ArrowRight');
  await expect(dialog.getByRole('radio', { name: '本周', exact: true })).toBeChecked();
  await expect(dialog).toContainText('128,894');
  for (const [name, high] of [['DAYBREAK', '131,594'], ['DESCENT', '134,294'], ['ORBIT', '136,994']]) {
    await dialog.getByText(name, { exact: true }).click();
    await expect(dialog).toContainText(high);
  }
  await expect(close).toBeVisible();
  await close.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  const size = await log.locator('li').count();
  await open.click();
  await expect(dialog).toContainText('134,200');
  await expect(log.locator('li')).toHaveCount(size);
  await close.click();
  await page.getByLabel('Orientation').selectOption('landscape');
  await open.click();
  await expect(dialog).toContainText('134,200');
  expect(await dialog.locator('.toy-rank-panel').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.top >= 34 && bounds.bottom <= innerHeight - 52 && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
  await expect(dialog.locator('tbody tr').first()).toBeInViewport({ ratio: .98 });
  await capture(page, 'leaderboard-zh-landscape');
  await close.click();
  for (const label of ['Capsule width', 'Bottom bar height']) {
    const field = page.getByLabel(label, { exact: true });
    await field.fill('0');
    await field.press('Enter');
  }
  await page.getByLabel('Device').selectOption('desktop');
  await frame.locator('[data-act=settings]').click();
  await frame.getByRole('button', { name: 'English' }).click();
  await frame.locator('[data-act=closesettings]').click();
  await frame.getByRole('button', { name: 'Leaderboards' }).click();
  await expect(frame.getByRole('dialog', { name: 'Leaderboards' })).toContainText('All time');
  await expect(frame.getByText('Standard · Normal · Escape on any route')).toBeVisible();
  await expect(frame.getByRole('row')).toHaveCount(7);
  await capture(page, 'leaderboard-en-desktop');
  expect(outbound).toEqual([]);
});

test('mock result submission is opt-in and handles failures and high-water ranks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(dev);
  const frame = page.frameLocator('iframe');
  const log = page.getByRole('list', { name: 'Rank request log' });
  await page.getByRole('button', { name: 'Show mock results' }).click();
  const result = frame.locator('#over');
  const submit = result.getByRole('button', { name: '提交成绩', exact: true });
  const retry = result.getByRole('button', { name: '重试提交', exact: true });
  await expect(result).toContainText('132,320');
  await expect(result).toContainText('149,120');
  await expect(log.locator('li')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Account', exact: true }).selectOption('guest');
  await submit.click();
  await expect(result).toContainText('登录哔哩哔哩');
  await page.getByRole('combobox', { name: 'Account', exact: true }).selectOption('denied');
  await submit.click();
  await expect(result).toContainText('未授权');
  await page.getByRole('combobox', { name: 'Account', exact: true }).selectOption('pilot');
  await page.getByLabel('Rank response').selectOption('limited');
  await submit.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(result).toContainText('排行榜请求过多');
  await expect(log.getByText('Submit 132320 to board 1')).toHaveCount(3);
  await page.getByLabel('Rank response').selectOption('timeout');
  await retry.click();
  await expect(result).toContainText('请求超时', { timeout: 9000 });
  await page.getByLabel('Rank response').selectOption('normal');
  await retry.click();
  const toast = result.getByRole('status');
  await expect(toast).toHaveText('成绩已提交');
  await expect(toast.getByText('成绩已提交')).toBeInViewport();
  expect(await toast.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.top < 80 && bounds.left >= document.getElementById('over-title')!.getBoundingClientRect().right;
  })).toBe(true);
  await expect(result.getByRole('button', { name: '查看排行榜' })).toHaveCount(0);
  await expect(submit).toHaveCount(0);
  await expect(log.getByText('Submit 132320 to board 1')).toHaveCount(5);
  await expect(result).toContainText('134,200');
  await expect(log.getByText('List board 1, all')).toHaveCount(1);
  await expect(log.getByText('My rank on board 1, all')).toHaveCount(0);
  await result.evaluate(element => { element.scrollTop = 0; });
  await expect(result.getByRole('heading', { name: '已撤离' })).toBeInViewport({ ratio: .98 });
  await capture(page, 'leaderboard-result-zh');
  await expect(toast).toBeEmpty();
  await result.getByRole('button', { name: '返回主菜单' }).click();
  await frame.getByRole('button', { name: '排行榜', exact: true }).click();
  const board = frame.getByRole('dialog', { name: '排行榜' });
  await expect(board.getByRole('row', { name: /Mock Pilot/ })).toContainText('132,320');
  await expect(board.locator('dd').first()).toHaveText('#2');
  await board.getByText('本周', { exact: true }).click();
  await expect(board.locator('dd').first()).toHaveText('#1');
  await page.getByRole('combobox', { name: 'Account', exact: true }).selectOption('navigator');
  await expect(board.locator('dd').first()).toHaveText('—');
  await board.getByRole('button', { name: '刷新' }).click();
  await expect(board).toContainText('你还未在此榜上榜。');
  await page.getByRole('button', { name: 'Close container' }).click();
  await expect(frame.getByText('玩具容器已关闭。')).toBeVisible();
});

for (const { route, locale, volume, routeLabel, submitLabel, sentLabel, write } of [
  { route: 'challenge', locale: 'zh-CN', volume: 'daybreak', routeLabel: '挑战路线', submitLabel: '提交成绩',
    sentLabel: '成绩已提交', write: 'Submit 107050 to board 2' },
  { route: 'score', locale: 'en', volume: 'descent', routeLabel: 'BONUS ROUTE', submitLabel: 'Submit score',
    sentLabel: 'Score submitted', write: 'Submit 90810 to board 3' },
] as const) {
  test(`mock ${route} route result submits its settled score`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1040 });
    await page.addInitScript(language => localStorage.setItem('sofaraway.bilibili.sofaraway.dev.locale', language), locale);
    await page.goto(dev);
    await page.getByLabel('Mock result volume').selectOption(volume);
    await page.getByLabel('Mock result route').selectOption(route);
    await page.getByRole('button', { name: 'Show mock results' }).click();
    const result = page.frameLocator('iframe').locator('#over');
    const log = page.getByRole('list', { name: 'Rank request log' });
    await expect(result.locator('#over-route')).toHaveText(routeLabel);
    await expect(log.locator('li')).toHaveCount(0);
    await result.getByRole('button', { name: submitLabel, exact: true }).click();
    await expect(result.getByRole('status')).toHaveText(sentLabel);
    await expect(log.getByText(write, { exact: true })).toHaveCount(1);
  });
}

test('mock board discards account and closed-panel replies and offers an empty-state refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(dev);
  const frame = page.frameLocator('iframe');
  const open = frame.getByRole('button', { name: '排行榜', exact: true });
  const board = frame.getByRole('dialog', { name: '排行榜' });
  const field = page.getByLabel('Rank delay (ms)');
  await field.fill('1200');
  await field.press('Enter');
  await open.click();
  await expect(board).toContainText('正在加载');
  await page.getByRole('combobox', { name: 'Account', exact: true }).selectOption('guest');
  await page.getByLabel('Hide seeded scores').check();
  await expect(board.getByRole('row')).toHaveCount(0);
  await board.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(board).toBeHidden();
  await open.click();
  await expect(board).toContainText('暂无上榜成绩。');
  await expect(board).toContainText('登录哔哩哔哩');
  await page.getByLabel('Rank response').selectOption('failure');
  await board.getByRole('button', { name: '刷新' }).click();
  await expect(board).toContainText('暂时无法连接');
});

test('hosted desktop release uses the same SDK script without native container support', async ({ page }) => {
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
  let loads = 0;
  await page.route('**/*', route => route.abort());
  await page.route(mount + '**', async route => {
    const path = new URL(route.request().url()).pathname.slice(new URL(mount).pathname.length);
    if (path === 'index.html') {
      const html = await readFile('build/toy/index.html', 'utf8');
      return route.fulfill({ contentType: 'text/html', body: html.replace('</head>', `<script async src="${sdk}"></script></head>`) });
    }
    return route.fulfill({ path: 'build/toy/' + path, contentType: types[extname(path)] });
  });
  await page.route(sdk, async route => {
    loads++;
    await new Promise(resolve => setTimeout(resolve, 350));
    return route.fulfill({ contentType: 'text/javascript', body: `
      window.rankCalls = [];
      window.toy = {
        isSupport: async ability => { rankCalls.push(ability); return ['getRankList', 'getMyRank', 'submitScore',
          'getUserProfile', 'getCloudStorage', 'setCloudStorage'].includes(ability); },
        getRankList: async request => {
          rankCalls.push(request);
          return Array.from({ length: request.limit }, (_, index) => ({
            rank: index + 1, score: 1000 - index, nickname: 'Pilot ' + (index + 1), avatar: '',
          }));
        },
        getMyRank: async request => { rankCalls.push(request); throw { type: 'not_logged_in', code: -101 }; },
        submitScore: async request => { rankCalls.push(request); throw new Error('Unexpected write'); },
        getUserProfile: async () => { rankCalls.push('profile'); return { toyOpenId: 'test-browser-account' }; },
        getCloudStorage: async keys => { rankCalls.push(keys); return {}; },
        setCloudStorage: async items => { rankCalls.push(items); throw new Error('Unexpected write'); },
      };
    ` });
  });
  await page.goto(mount + 'index.html?seed=1&dev=1#rankFixture');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  const calls = () => page.evaluate(() => Reflect.get(window, 'rankCalls') ?? []);
  expect(await calls()).toEqual([]);
  await page.getByRole('button', { name: '排行榜' }).click();
  const board = page.getByRole('dialog', { name: '排行榜' });
  const list = board.getByRole('region', { name: '排行榜' });
  const last = list.getByRole('cell', { name: 'Pilot 100', exact: false });
  await expect(list.locator('tbody tr')).toHaveCount(100);
  await expect(list).toHaveCSS('scrollbar-width', 'none');
  await expect(last).not.toBeInViewport();
  await list.press('End');
  await expect(last).toBeInViewport();
  await expect(board).toContainText('登录哔哩哔哩');
  await board.getByText('ORBIT', { exact: true }).click();
  await board.getByText('本周', { exact: true }).click();
  await expect(list.locator('tbody tr')).toHaveCount(100);
  await expect(last).not.toBeInViewport();
  expect(await calls()).toEqual(expect.arrayContaining([
    'getRankList', 'getMyRank', { board: 1, period: 'all', limit: 100 }, { board: 4, period: 'week', limit: 100 },
  ]));
  expect(await calls()).not.toContain('getContainerState');
  expect(await calls()).not.toContain('submitScore');
  await board.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '云存档', exact: true }).click();
  await expect.poll(calls).not.toContain('getUserProfile');
  await page.getByRole('button', { name: '授权并同步' }).click();
  await expect(page.getByRole('dialog', { name: '云存档' })).toContainText('个人最高分已同步。');
  expect(await calls()).toEqual(expect.arrayContaining([['sofaraway_toy_v1'], 'profile']));
  expect(await calls()).not.toContain('setCloudStorage');
  expect(loads).toBe(1);
  await expect(page.locator(`script[src="${sdk}"]`)).toHaveCount(1);
});

test('standalone release keeps play available without loading a leaderboard SDK', async ({ page }) => {
  const outbound: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4174/')) outbound.push(request.url()); });
  await page.goto('/toy/sofaraway/index.html');
  await page.getByRole('button', { name: '排行榜' }).click();
  const board = page.getByRole('dialog', { name: '排行榜' });
  await expect(board).toContainText('当前环境无法使用排行榜。');
  await board.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  expect(outbound).toEqual([]);
});
