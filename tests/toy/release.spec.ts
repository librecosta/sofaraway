import { expect, test } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const mount = '/toy/sofaraway/';
const entry = mount + 'index.html';
const start = '[data-act=start]';
const namespace = 'sofaraway.bilibili.sofaraway';
const recordsKey = namespace + '.records.v1';

test('the release contains only the player, relative assets and required licenses', async ({ request }) => {
  const files = await readdir('build/toy', { recursive: true, withFileTypes: true });
  const root = files.filter(file => file.isFile() && file.name.match(/\.(?:html|txt)$/)).map(file => file.name);
  expect(root.sort()).toEqual(['LICENSE.txt', 'OFL-Chakra-Petch.txt', 'OFL-Rajdhani.txt', 'THIRD-PARTY-NOTICES.txt', 'index.html']);
  const icon = await readFile('app/components/china-public-security.png');
  const forbidden = /2025158691|51010702045043|beian\.(?:miit|mps)\.gov\.cn|#errbox|sofaraway-camlog|fixedTime|mobileQuality|branchSide|b0Harness|toy-dev-console|MockToyPlatform|Offline container simulator|sofaraway\.bilibili\.sofaraway\.dev/;
  for (const file of files) {
    if (file.isDirectory()) {
      expect(file.name).toBe('assets');
      continue;
    }
    const path = join(file.parentPath, file.name);
    if (!root.includes(file.name)) expect(file.name, path).toMatch(/-[\w-]{8}\.(?:js|css|woff2)$/);
    const bytes = await readFile(path);
    expect(bytes.includes(icon), path).toBe(false);
    expect(bytes.toString(), path).not.toContain(icon.toString('base64'));
    expect(bytes.toString(), path).not.toMatch(forbidden);
  }
  const html = await (await request.get(entry)).text();
  expect(html).toContain('<html lang="zh-CN">');
  expect(html).toContain('src="./assets/');
  expect(html).not.toContain('canonical');
  for (const path of ['/', '/assets/', entry + '/elsewhere', mount + 'debug/', mount + 'assets/missing.js']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test('nested release ignores diagnostics, selects four volumes and persists player settings', async ({ page, baseURL }) => {
  await page.addInitScript(namespace => {
    localStorage.setItem('sofaraway.locale', 'en');
    localStorage.setItem('sofaraway.autoBoost', 'true');
    localStorage.setItem('sofaraway.bilibili.other.locale', 'en');
    localStorage.setItem(namespace + '.dev.locale', 'en');
    localStorage.setItem(namespace + '.debug', '1');
  }, namespace);
  const errors: string[] = [];
  const network = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => network.add(request.url()));
  page.on('response', response => {
    if (!response.ok()) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(entry + '?vol=orbit&mode=showcase&t=42&seed=1&auto=1&align=1&god=1&boost=1&dbg=1&rec=1&ui=0&panel=1&q=mobile&route=bonus&cur=0,0&post=0&dof=1&dev=1#debug');
  await expect(page.locator(start)).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('#vol-name')).toContainText('ELSEWHERE');
  await expect(page.locator('[data-choice=standard]')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('#settings, #errbox, #rec, [data-toy-dev-console], [data-act=share], [data-registration]')).toHaveCount(0);
  await page.keyboard.press('r');
  await page.keyboard.press('Shift+r');
  await expect(page.locator('canvas')).toHaveCount(1);
  const url = page.url();
  const canvas = await page.locator('#gl').elementHandle();
  for (const volume of ['DAYBREAK', 'DESCENT', 'ORBIT', 'ELSEWHERE']) {
    await page.locator('[data-vol-step="1"]').click();
    await expect(page.locator('#vol-name')).toContainText(volume);
  }
  expect(page.url()).toBe(url);
  await page.locator('[data-act=settings]').click();
  await expect(page.locator('[data-q=auto]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#set-auto-boost')).not.toBeChecked();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await canvas!.evaluate(element => element === document.querySelector('#gl'))).toBe(true);
  await page.locator('#set-auto-boost').check();
  await page.locator('#set-dynamic-lights').check();
  await page.locator('#set-volume').fill('37');
  await page.locator('[data-q=low]').click();
  await page.reload();
  await expect(page.locator(start)).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('[data-act=settings]').click();
  await expect(page.locator('#set-auto-boost')).toBeChecked();
  await expect(page.locator('#set-dynamic-lights')).toBeChecked();
  await expect(page.locator('#set-volume')).toHaveValue('37');
  await expect(page.locator('[data-q=low]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-act=closesettings]').click();
  await page.locator('[data-act=credits]').click();
  await expect(page.getByRole('dialog')).toContainText('BSD-3-Clause');
  await expect(page.locator('a[href]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.load('700 24px Rajdhani'));
  expect([...network].every(url => url.startsWith(baseURL + mount))).toBe(true);
  expect([...network].some(url => url.endsWith('.woff2'))).toBe(true);
  expect(errors).toEqual([]);
});

test('touch flight keeps Auto Boost through orientation changes and leaves other modes at cruise', async ({ browser, baseURL }) => {
  const page = await browser.newPage({
    baseURL, viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce',
  });
  try {
    await page.addInitScript(namespace => {
      localStorage.setItem(namespace + '.quality', 'low');
      localStorage.setItem(namespace + '.difficulty', 'easy');
    }, namespace);
    await page.goto(entry);
    await expect(page.locator(start)).toBeEnabled();
    await page.locator('[data-act=settings]').tap();
    const boost = page.getByRole('switch', { name: '全程加速' });
    await boost.check();
    await page.locator('[data-act=closesettings]').tap();
    await page.locator(start).tap();
    await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('屏幕方向已改变，准备好后可继续。')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '设置' }).tap();
    await expect(boost).toBeDisabled();
    await page.locator('[data-act=closesettings]').tap();
    await page.getByRole('button', { name: '继续', exact: true }).tap();
    await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
    const cdp = await page.context().newCDPSession(page);
    const before = await page.locator('#cursor').evaluate(node => node.style.transform);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 420 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 286, y: 410 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.locator('#cursor').evaluate(node => node.style.transform)).not.toBe(before);
    await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: '暂停' }).tap();
    await page.getByRole('button', { name: '返回主菜单' }).tap();

    const nextMode = page.getByRole('button', { name: '下一个游戏模式' });
    await nextMode.tap();
    await expect(page.locator('[data-choice=sightseeing]')).toHaveAttribute('data-selected', 'true');
    await page.locator(start).tap();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '0');
    await page.getByRole('button', { name: '暂停' }).tap();
    await page.getByRole('button', { name: '返回主菜单' }).tap();
    await nextMode.tap();
    await expect(page.locator('[data-choice=showcase]')).toHaveAttribute('data-selected', 'true');
    await page.getByRole('button', { name: '下一个展示路线' }).tap();
    await expect(page.locator('[data-choice=challenge]')).toHaveAttribute('data-selected', 'true');
    await page.locator(start).tap();
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('#hud')).toHaveCount(0);
  } finally {
    await page.close();
  }
});

test('a normal result keeps Best and Last plus handoff and locks in the Toy namespace', async ({ page }) => {
  await page.addInitScript(({ namespace, recordsKey }) => {
    localStorage.setItem(namespace + '.difficulty', 'impossible');
    localStorage.setItem(namespace + '.quality', 'low');
    localStorage.setItem(namespace + '.autoBoost', 'true');
    localStorage.setItem('sofaraway.records.v1', 'web');
    localStorage.setItem('sofaraway.bilibili.other.records.v1', 'other toy');
    if (navigator.locks) {
      navigator.locks.request = new Proxy(navigator.locks.request, {
        apply(target, receiver, args) {
          document.documentElement.dataset.requestedLock = args[0];
          return Reflect.apply(target, receiver, args);
        },
      });
    }
    if (localStorage.getItem(recordsKey) === 'other toy') throw new Error('Toy namespace collision');
  }, { namespace, recordsKey });
  await page.goto(entry);
  await expect(page.locator(start)).toBeEnabled();
  await expect(page.locator('#diff [data-choice]')).toHaveCount(4);
  await expect(page.locator('#diff [data-choice=impossible]')).toHaveAttribute('data-selected', 'true');
  await page.locator(start).click();
  await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
  await page.mouse.move(4, 4);
  await expect(page.locator('#over')).toBeVisible({ timeout: 24_000 });
  await expect(page.locator('#over-title')).toHaveText('飞行终止');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), recordsKey)).not.toBeNull();
  const observed = await page.evaluate(async key => {
    const requestedLock = document.documentElement.dataset.requestedLock;
    const value = localStorage.getItem(key);
    const database = (await indexedDB.databases()).find(database => database.name === key + '.write');
    if (!database) throw new Error('Missing Toy handoff database.');
    const handoff = await new Promise(resolve => {
      const open = indexedDB.open(database.name!);
      open.onsuccess = () => {
        const read = open.result.transaction('commits').objectStore('commits').get(key);
        read.onsuccess = () => { open.result.close(); resolve(read.result); };
      };
    });
    return { value, requestedLock, handoff, legacy: localStorage.getItem('sofaraway.records.v1'),
      other: localStorage.getItem('sofaraway.bilibili.other.records.v1') };
  }, recordsKey);
  expect(observed.requestedLock).toBe(recordsKey + '.write');
  expect(observed.handoff).toBe(observed.value);
  expect(JSON.parse(observed.value!).standard.elsewhere.impossible).toMatchObject({
    best: expect.any(Number), last: { outcome: 'TERMINATED', score: expect.any(Number) },
  });
  expect(observed.legacy).toBe('web');
  expect(observed.other).toBe('other toy');
  await page.locator('[data-act=restart]').click();
  await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: '本地成绩' })).toContainText('飞行终止');
});

test('blocked browser storage still allows flight and settings', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  await page.goto(entry);
  await expect(page.locator(start)).toBeEnabled();
  await page.locator('[data-act=settings]').click();
  await page.locator('[data-q=low]').click();
  await page.locator('#set-auto-boost').check();
  await page.locator('[data-act=closesettings]').click();
  await page.locator(start).click();
  await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
});
