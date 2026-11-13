import { expect, test } from '@playwright/test';
import type { FixedStepClock } from '../../app/game/core/clock';
import type { Simulation } from '../../app/game/core/simulation';
import type { Runtime } from '../../app/game/runtime/GameRuntime.client';

const key = 'sofaraway.records.v1';

test('local records follow the selected volume, difficulty and mode at narrow sizes', async ({ page }) => {
  await page.addInitScript(key => {
    if (!localStorage.getItem('sofaraway.best')) localStorage.setItem('sofaraway.best', '999999');
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1,
      standard: { elsewhere: { hard: { best: 32500, last: { score: 2000, outcome: 'TERMINATED', recovery: true } },
        impossible: { best: 128640, last: { score: 97450, outcome: 'ESCAPED', encoreBonus: 10800 } } },
      drift: { normal: { best: 21000, last: { score: 1200, outcome: 'TERMINATED' } } } },
      sightseeing: { elsewhere: { last: { score: 930, outcome: 'ESCAPED' } } } }));
  }, key);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/?q=low');
  const record = page.getByRole('group', { name: 'Local records' });
  const difficulty = page.locator('#diff [data-selected=true]');
  const next = page.getByRole('button', { name: 'Next difficulty' });
  const previous = page.getByRole('button', { name: 'Previous difficulty' });
  await expect(record).toContainText(/BEST SCORE\s*—/);
  await expect(record).not.toContainText('999,999');
  await expect(page.locator('#diff [data-choice]')).toHaveCount(4);
  for (const size of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(size);
    for (const button of await page.locator('#menu button:not([aria-hidden=true])').all()) await expect(button).toBeInViewport({ ratio: .65 });
  }
  await page.evaluate(() => document.fonts.ready.then(() => {}));
  const emptyBox = await record.boundingBox();
  await next.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(difficulty).toHaveText('IMPOSSIBLE');
  await expect(page.getByText('1 LIFE', { exact: true })).toBeVisible();
  await expect(record).toContainText(/BEST SCORE\s*128,640/);
  await expect(record).toContainText(/LAST RUN\s*108,250/);
  expect(await record.boundingBox()).toMatchObject({ y: emptyBox!.y, height: emptyBox!.height });
  await page.reload();
  await expect(record).toContainText(/BEST SCORE\s*128,640/);
  await previous.click();
  await expect(record).toContainText(/BEST SCORE\s*32,500/);
  await expect(record).toContainText('TERMINATED · RECOVERY');
  await next.click();
  await page.getByRole('button', { name: 'Next play mode' }).click();
  await expect(record).toContainText(/LAST VISIT\s*930/);
  await expect(record).not.toContainText('BEST');
  await page.getByRole('button', { name: 'Previous play mode' }).click();
  await expect(difficulty).toHaveText('IMPOSSIBLE');
  await page.getByRole('button', { name: 'next volume' }).click();
  await expect(page.locator('#vol-name')).toContainText('DRIFT');
  await expect(page.locator('#diff [data-choice=impossible]')).toHaveCount(0);
  await expect(difficulty).toHaveText('NORMAL');
  await expect(record).toContainText(/BEST SCORE\s*21,000/);
  await page.goto('/?vol=drift&diff=impossible&t=2&dbg=1&q=low');
  await expect(page.locator('#errbox')).toContainText('"speed":24');
  expect(await page.evaluate(() => localStorage.getItem('sofaraway.best'))).toBe('999999');
});

test('the production result transition saves once, skips abandoned and diagnostic runs, and keeps recovery out of Best', async ({ page }) => {
  await page.goto('http://127.0.0.1:8091/?q=low');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  const observed = await page.evaluate(async key => {
    const moduleUrl = performance.getEntriesByType('resource').find(entry =>
      new URL(entry.name).pathname === '/app/game/runtime/GameRuntime.client.ts')!.name;
    const { Runtime: Engine }: typeof import('../../app/game/runtime/GameRuntime.client') = await import(moduleUrl);
    let runtime: Runtime | undefined;
    const start = Engine.prototype.start;
    const setItem = Storage.prototype.setItem;
    let writes = 0;
    Storage.prototype.setItem = function (name, value) { if (name === key) writes++; setItem.call(this, name, value); };
    Engine.prototype.start = function () { runtime = this; return start.call(this, true); };
    document.querySelector<HTMLButtonElement>('[data-act=start]')!.click();
    Engine.prototype.start = start;
    const live = runtime!;
    const sim: Simulation = Reflect.get(live, 'simulation');
    const clock: FixedStepClock = Reflect.get(live, 'clock');
    const { diagnostics } = Reflect.get(live, 'options') as { diagnostics: { align: boolean; god: boolean; debug: boolean } };
    const frame: FrameRequestCallback = Reflect.get(live, 'frame');
    const step = Reflect.get(live, 'step') as (sim: Simulation, neutralize?: boolean) => void;
    const firstGate = () => {
      while (sim.gatesJudged === 0 && sim.phase === 'playing') {
        clock.consume(clock.elapsed + 1 / 60, () => step.call(live, sim));
      }
    };
    const settle = () => {
      const now = performance.now() + clock.elapsed * 1000;
      for (let index = 0; index < 70; index++) {
        cancelAnimationFrame(Reflect.get(live, 'raf'));
        frame(now + index * 17);
      }
      return live.getSnapshot();
    };
    const saved = () => JSON.parse(localStorage.getItem(key) ?? 'null');
    try {
      live.returnToMenu();
      const abandoned = saved();
      live.setDifficulty('impossible');
      await live.start(true);
      firstGate();
      const fail = settle();
      const original = saved();
      const writesAfterFail = writes;
      for (const diagnostic of ['align', 'god', 'debug'] as const) {
        diagnostics[diagnostic] = true;
        await live.start(true);
        while (sim.phase === 'playing') clock.consume(clock.elapsed + 1 / 60, () => step.call(live, sim));
        settle();
        diagnostics[diagnostic] = false;
      }
      const diagnosticsSaved = saved();
      // Reproduce a technically neutralized crossing followed by a real miss.
      await live.start(true);
      while (sim.gatesJudged === 0) clock.consume(clock.elapsed + 1 / 60, () => step.call(live, sim, true));
      while (sim.phase === 'playing') clock.consume(clock.elapsed + 1 / 60, () => step.call(live, sim));
      const recovery = settle();
      return { abandoned, fail, original, writesAfterFail, diagnosticsSaved, recovery, last: saved(), writes };
    } finally { Storage.prototype.setItem = setItem; }
  }, key);
  expect(observed.abandoned).toBeNull();
  expect(observed.fail).toMatchObject({ phase: 'results', difficulty: 'impossible', newBest: true, result: { title: 'TERMINATED' } });
  expect(observed.original.standard.elsewhere.impossible).toEqual({ best: observed.fail.score,
    last: { score: observed.fail.score, outcome: 'TERMINATED' } });
  expect(observed.writesAfterFail).toBe(1);
  expect(observed.diagnosticsSaved).toEqual(observed.original);
  expect(observed.recovery.score).toBeGreaterThan(observed.fail.score);
  expect(observed.recovery.newBest).toBe(false);
  expect(observed.last.standard.elsewhere.impossible).toEqual({ best: observed.fail.score,
    last: { score: observed.recovery.score, outcome: 'TERMINATED', recovery: true } });
  expect(observed.writes).toBe(2);
});

test('blocked storage leaves the real menu and a finished run usable', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem']) {
      Object.defineProperty(Storage.prototype, method, { value: () => { throw new DOMException('Disabled', 'SecurityError'); } });
    }
  });
  await page.goto('/?vol=elsewhere&diff=impossible&t=210.8&align=1&q=low');
  await expect(page.locator('#over-title')).toHaveText('ESCAPED');
  await expect(page.locator('#over').getByText('IMPOSSIBLE', { exact: true })).toBeVisible();
  await page.goto('/?q=low');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  await expect(page.getByRole('group', { name: 'Local records' })).toContainText(/BEST SCORE\s*—/);
});

test('the real Sightseeing result saves a Last Visit while a fixed capture cannot overwrite records', async ({ page }) => {
  await page.goto('http://127.0.0.1:8091/?vol=drift&q=low');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  const result = await page.evaluate(async key => {
    const moduleUrl = performance.getEntriesByType('resource').find(entry =>
      new URL(entry.name).pathname === '/app/game/runtime/GameRuntime.client.ts')!.name;
    const { Runtime: Engine }: typeof import('../../app/game/runtime/GameRuntime.client') = await import(moduleUrl);
    let runtime: Runtime | undefined;
    const start = Engine.prototype.start;
    Engine.prototype.start = function () { runtime = this; return start.call(this, true); };
    document.querySelector<HTMLButtonElement>('[data-act=start]')!.click();
    Engine.prototype.start = start;
    const live = runtime!;
    live.returnToMenu();
    live.setMode('sightseeing');
    await live.start(true);
    const sim: Simulation = Reflect.get(live, 'simulation');
    const clock: FixedStepClock = Reflect.get(live, 'clock');
    const step = Reflect.get(live, 'step') as (sim: Simulation) => void;
    while (sim.phase === 'playing') clock.consume(clock.elapsed + 1 / 60, () => step.call(live, sim));
    const frame: FrameRequestCallback = Reflect.get(live, 'frame');
    const now = performance.now() + clock.elapsed * 1000;
    for (let index = 0; index < 70; index++) {
      cancelAnimationFrame(Reflect.get(live, 'raf'));
      frame(now + index * 17);
    }
    return { snapshot: live.getSnapshot(), raw: localStorage.getItem(key)! };
  }, key);
  expect(result.snapshot).toMatchObject({ mode: 'sightseeing', phase: 'results', newBest: false });
  expect(JSON.parse(result.raw)).toEqual({ version: 1, standard: {}, sightseeing: {
    drift: { last: { score: result.snapshot.score, outcome: result.snapshot.result?.title } },
  } });
  await page.goto('http://127.0.0.1:8091/?vol=drift&t=140.8&align=1&q=low');
  await expect(page.locator('#over-title')).toHaveText('ESCAPED');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(result.raw);
});
