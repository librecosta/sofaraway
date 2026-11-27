import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import type { AudioTransport } from '../../app/game/audio/transport.client';
import type { Simulation } from '../../app/game/core/simulation';
import type { Runtime } from '../../app/game/runtime/GameRuntime.client';
import { readMetrics } from './diagnostics';

interface ObservedPage extends Window {
  t1Runtime?: Runtime;
  t1Initializations: number;
}

async function observeRuntime(page: Page) {
  await page.goto('http://127.0.0.1:8091/?q=low');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  await page.evaluate(async () => {
    const observed = window as unknown as ObservedPage;
    const entry = performance.getEntriesByType('resource').find(item =>
      new URL(item.name).pathname === '/app/game/runtime/GameRuntime.client.ts')!;
    const { Runtime: Engine }: typeof import('../../app/game/runtime/GameRuntime.client') = await import(entry.name);
    const start = Engine.prototype.start;
    const initialize = Engine.prototype.initialize;
    observed.t1Initializations = 0;
    Engine.prototype.start = function (silent, gesture) {
      observed.t1Runtime = this;
      return start.call(this, silent, gesture);
    };
    Engine.prototype.initialize = function (canvas, options) {
      observed.t1Initializations++;
      return initialize.call(this, canvas, options);
    };
  });
}

test('a paused language change preserves focus, canvas, runtime, simulation and audio transport', async ({ page }) => {
  await observeRuntime(page);
  await page.locator('[data-act=start]').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const runtime = (window as unknown as ObservedPage).t1Runtime!;
    const audio: AudioTransport = Reflect.get(runtime, 'audio');
    return audio.time;
  })).toEqual(expect.any(Number));
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  const dialog = page.locator('#settings');
  const language = dialog.getByRole('button', { name: '简体中文' });
  const before = await page.evaluateHandle(() => {
    const runtime = (window as unknown as ObservedPage).t1Runtime!;
    const audio: AudioTransport = Reflect.get(runtime, 'audio');
    const simulation: Simulation = Reflect.get(runtime, 'simulation');
    return { runtime, simulation, canvas: document.querySelector('#gl'), audio, beat: simulation.beat,
      audioGeneration: Reflect.get(audio, 'generation') };
  });
  await language.focus();
  await page.keyboard.press('Enter');
  await expect(language).toBeFocused();
  await expect(language).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('#gl')).toHaveAccessibleName('SoFarAway 游戏画面');
  expect(await page.evaluate(old => {
    const observed = window as unknown as ObservedPage;
    return observed.t1Initializations === 0 && old.runtime === observed.t1Runtime &&
      old.simulation === Reflect.get(old.runtime, 'simulation') && old.beat === old.simulation.beat &&
      old.canvas === document.querySelector('#gl') && old.audio === Reflect.get(old.runtime, 'audio') &&
      old.audioGeneration === Reflect.get(old.audio, 'generation');
  }, before)).toBe(true);
  await dialog.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('dialog', { name: '已暂停' })).toBeVisible();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.locator('#hud').getByText('得分', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(old => old.simulation.beat, before)).toBeGreaterThan(
    await page.evaluate(old => old.beat, before));
  await before.dispose();
});

test('continuous Shift and Auto Boost produce the same fixed-step flight', async ({ page }) => {
  await observeRuntime(page);
  await page.locator('[data-act=start]').click();
  await expect(page.locator('#hud')).toBeVisible();
  const flights = await page.evaluate(async () => {
    const runtime = (window as unknown as ObservedPage).t1Runtime!;
    const input = (type: 'keydown' | 'keyup', key: string) => window.dispatchEvent(new KeyboardEvent(type, { key }));
    const step = Reflect.get(runtime, 'step') as (simulation: Simulation) => void;
    const options = Reflect.get(runtime, 'options');
    options.runSeed = 3207;
    cancelAnimationFrame(Reflect.get(runtime, 'raf'));
    Reflect.set(runtime, 'raf', 0);
    Reflect.set(runtime, 'schedule', () => {});
    async function run(mode: 'standard' | 'sightseeing' | 'showcase', autoBoost: boolean, shift: boolean) {
      runtime.returnToMenu();
      runtime.setMode(mode);
      runtime.setAutoBoost(autoBoost);
      await runtime.start(true);
      const sim: Simulation = Reflect.get(runtime, 'simulation');
      if (shift) input('keydown', 'Shift');
      const trace = [];
      for (let tick = 0; tick < 640 && sim.phase === 'playing'; tick++) {
        if (tick === 60) input('keydown', 'ArrowRight');
        if (tick === 90) input('keyup', 'ArrowRight');
        step.call(runtime, sim);
        trace.push([sim.distance, sim.speed, sim.boostLens, sim.camera.x, sim.camera.y,
          sim.score, sim.gatesJudged, sim.lives, sim.boosting]);
      }
      if (shift) input('keyup', 'Shift');
      return trace;
    }
    return {
      manual: await run('standard', false, true), automatic: await run('standard', true, false),
      cruise: await run('standard', false, false),
      sightseeing: await run('sightseeing', true, false), plainSightseeing: await run('sightseeing', false, false),
      showcase: await run('showcase', true, true), plainShowcase: await run('showcase', false, false),
    };
  });
  expect(flights.manual.length).toBeGreaterThan(100);
  expect(flights.manual.some(frame => Number(frame[6]) > 0)).toBe(true);
  expect(flights.automatic).toEqual(flights.manual);
  expect(flights.cruise[100][1]).toBeLessThan(flights.automatic[100][1] as number);
  expect(flights.sightseeing).toEqual(flights.plainSightseeing);
  expect(flights.showcase).toEqual(flights.plainShowcase);
});

test('a touch player can rotate, resume, steer at full Boost and change the next flight preference', async ({ browser, baseURL }) => {
  const page = await browser.newPage({
    baseURL, viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce',
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem('sofaraway.locale')) localStorage.setItem('sofaraway.locale', 'zh-CN');
  });
  try {
    await page.goto('/?q=low&dbg=1');
    await expect(page.locator('[data-act=start]')).toBeEnabled();
    await page.locator('[data-act=settings]').tap();
    const toggle = page.getByRole('switch', { name: '全程加速' });
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toHaveAccessibleDescription('在标准模式中持续加速，无需按住加速键。');
    await toggle.check();
    await expect(page.getByRole('button', { name: '简体中文' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('[data-act=start]')).toBeEnabled();
    await page.locator('[data-act=settings]').tap();
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    expect(await page.evaluate(() => localStorage.getItem('sofaraway.autoBoost'))).toBe('false');
    await page.locator('[data-act=closesettings]').tap();
    await page.locator('[data-act=start]').tap();
    await expect.poll(async () => (await readMetrics(page)).beat).toBeGreaterThan(0.2);
    await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '0');
    await page.getByRole('button', { name: '暂停' }).tap();
    await page.getByRole('button', { name: '返回主菜单' }).tap();
    await page.locator('[data-act=settings]').tap();
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await page.locator('[data-act=closesettings]').tap();
    await page.locator('[data-act=start]').tap();
    await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
    await expect(page.locator('#hint').getByText('拖动以转向')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('屏幕方向已改变，准备好后可继续。')).toBeVisible();
    await expect.poll(async () => (await readMetrics(page)).canvas).toEqual([390, 844]);
    await page.getByRole('dialog').getByRole('button', { name: '设置' }).tap();
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveAccessibleDescription('本次飞行已锁定加速设置，返回菜单后可更改。');
    await page.locator('[data-act=closesettings]').tap();
    await page.getByRole('button', { name: '继续' }).tap();
    await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');

    const cdp = await page.context().newCDPSession(page);
    const before = await readMetrics(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 420 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 280, y: 410 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await readMetrics(page)).camera.tx).toBeGreaterThan(before.camera.tx + 0.1);
    await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
  } finally {
    await page.close();
  }
});

test('fixed-time captures reserve Boost for the explicit diagnostic flag', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('sofaraway.autoBoost')) localStorage.setItem('sofaraway.autoBoost', 'true');
  });
  const metrics = async () => {
    await expect(page.locator('#errbox')).toContainText('"beat"');
    return readMetrics(page);
  };
  await page.goto('/?t=4&q=low&dbg=1');
  const autoBoostSaved = await metrics();
  await page.evaluate(() => localStorage.setItem('sofaraway.autoBoost', 'false'));
  await page.reload();
  const cruise = await metrics();
  expect(autoBoostSaved).toMatchObject({ beat: cruise.beat, distance: cruise.distance, speed: cruise.speed });
  await page.goto('/?t=4&q=low&dbg=1&boost=1');
  const diagnostic = await metrics();
  expect(diagnostic.beat).toBe(cruise.beat);
  expect(diagnostic.distance).toBeGreaterThan(cruise.distance);
  expect(diagnostic.speed).toBeGreaterThan(cruise.speed);
});

for (const profile of [
  { locale: 'en', width: 1280, height: 720, mobile: false },
  { locale: 'zh-CN', width: 1280, height: 720, mobile: false },
  { locale: 'zh-CN', width: 640, height: 360, mobile: true },
  { locale: 'zh-CN', width: 390, height: 844, mobile: true },
] as const) {
  test(`localized player screens fit ${profile.locale} at ${profile.width}×${profile.height}`, async ({ browser, baseURL }) => {
    const { locale, width, height, mobile } = profile;
    const page = await browser.newPage({
      baseURL, viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce',
    });
    const capture = async (name: string) => {
      if (process.env.T1_SCREENSHOTS === '1') await page.screenshot({
        path: resolve('.local/t1-a/screenshots', `${locale}-${width}x${height}-${name}.png`),
        animations: 'disabled',
      });
    };
    await page.addInitScript(value => {
      localStorage.setItem('sofaraway.locale', value);
      localStorage.setItem('sofaraway.autoBoost', 'true');
    }, locale);
    try {
      await page.goto('/?q=low&vol=daybreak');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('[data-act=start]')).toBeEnabled();
      for (const selector of ['#vol-name', '[data-act=start]', '[data-act=fullscreen]', '[data-act=settings]']) {
        await expect(page.locator(selector)).toBeInViewport({ ratio: 0.99 });
      }
      await capture('menu');
      await page.locator('[data-act=settings]').click();
      await expect(page.locator('#set-auto-boost')).toBeInViewport({ ratio: 0.99 });
      await expect(page.locator('[data-act=closesettings]')).toBeInViewport({ ratio: 0.99 });
      const panel = page.locator('#settings > div');
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await capture('settings');
      await panel.locator('summary').click();
      await expect(panel.getByText(locale === 'en' ? 'On touch, enable Auto Boost' : '使用触屏时，可在设置中开启全程加速')).toBeVisible();
      await panel.locator('summary').click();
      await page.locator('[data-act=closesettings]').click();
      await page.locator('[data-act=start]').click();
      await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
      for (const id of ['#hud-score', '#hud-lives', '#hud-gates', '#hud-combo']) {
        await expect(page.locator(id)).toBeInViewport({ ratio: 0.99 });
      }
      await capture('hud');
      await page.goto('/?vol=daybreak&diff=hard&q=low&t=146.5&god=0&align=1');
      await expect(page.locator('#over-title')).toHaveText(locale === 'en' ? 'ESCAPED' : '已脱离');
      await expect(page.locator('#over [data-act=menu]')).toBeInViewport({ ratio: 0.99 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await capture('results');
    } finally {
      await page.close();
    }
  });
}
