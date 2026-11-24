import { expect, test } from '@playwright/test';
import { canPass, lanePoint } from '../../app/game/core/collision';
import { VOLUMES } from '../../app/game/core/volumes';
import { inspectGameplay } from '../../app/game/debug/gameplay-inspection';

for (const { id } of VOLUMES) test(`${id} gameplay compares live chart totals, branch sides and Encore without a renderer`, async ({ page }) => {
  await page.goto(`/debug/gameplay/?vol=${id}&diff=impossible&route=bonus&seed=1`);
  const difficulty = page.getByRole('combobox', { name: 'Difficulty', exact: true });
  const route = page.getByRole('combobox', { name: 'Route', exact: true });
  const count = (kind: string) => page.locator(`[data-count="${kind}"]`);
  await expect(difficulty).toHaveValue('impossible');
  await expect(route).toHaveValue('score');
  for (const diff of ['easy', 'normal', 'hard', 'impossible'] as const) {
    await difficulty.selectOption(diff);
    const data = inspectGameplay(id, diff, 1);
    await expect(count('main')).toHaveText(String(data.authored.length));
    if (id === 'orbit') await expect(count('main')).toHaveText(diff === 'impossible' ? '135' : '92');
    for (const choice of ['main', 'challenge', 'score'] as const) {
      await route.selectOption(choice);
      const selected = data.gatesFor(choice);
      await expect(count('route')).toHaveText(String(selected.gates.length));
      await expect(page.locator(`[data-side="${selected.side}"]`)).toHaveAttribute('data-selected', 'true');
    }
    await expect(count('encore')).toHaveText(String(data.plan!.gates.length));
  }
  const data = inspectGameplay(id, 'impossible', 1);
  const inserted = data.gatesFor('score').gates.find(gate => gate.inserted)!;
  await page.getByRole('combobox', { name: 'Section', exact: true }).selectOption(inserted.section);
  await page.getByLabel('Gate at beat').selectOption(String(inserted.beat));
  await expect(page.locator('[data-gate-beat]')).toContainText(`World station ${inserted.worldStation.toFixed(2)}`);
  await expect(page.locator('[data-gate-beat]')).toContainText('Impossible insertion');
  const pickup = page.locator('#pickups');
  await expect(pickup).toContainText(`World station ${data.pickup!.station.toFixed(2)}`);
  await page.getByText(/^Inspect \d+ Encore gates/).click();
  await expect(page.locator('#encore tbody tr')).toHaveCount(data.plan!.gates.length);
  const seed = page.getByRole('spinbutton', { name: 'Run seed' });
  await seed.fill('0');
  await seed.press('Enter');
  const branch = inspectGameplay(id, 'impossible', 0).gatesFor('score');
  await expect(page.locator(`[data-side="${branch.side}"]`)).toHaveAttribute('data-selected', 'true');
  await expect(page.getByRole('link', { name: 'Open Bonus route in Ending Studio' })).toHaveAttribute('href', /seed=0&route=bonus/);
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('link', { name: 'Inspect gate geometry' }).click();
  await expect(page.locator(`canvas[data-preview="${inserted.kind}"]`)).toHaveAttribute('data-rendered-opening', String(inserted.open));
  await expect(page.locator(`canvas[data-preview="${inserted.kind}"]`)).toHaveAttribute('data-rendered-axis', String(inserted.axis));
});

test('the gate crossing sample uses production collision and keeps the selected variant on restore', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    const create = WebGL2RenderingContext.prototype.createProgram;
    let programs = 0;
    WebGL2RenderingContext.prototype.createProgram = function () {
      programs++;
      return create.call(this);
    };
    window.addEventListener('measure-specimen', () => { document.documentElement.dataset.specimenPrograms = String(programs); });
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      const ctx = Reflect.apply(get, this, [type, ...args]);
      const loss = type === 'webgl2' ? ctx?.getExtension('WEBGL_lose_context') : undefined;
      if (loss) {
        window.addEventListener('restore-specimen', () => loss.restoreContext(), { once: true });
        window.addEventListener('lose-specimen', () => loss.loseContext(), { once: true });
      }
      return ctx;
    } as typeof get;
  });
  const kind = 'orbit-dual';
  const open = 3;
  const axis = 1;
  await page.goto(`/debug/gates/?vol=orbit&gate=${kind}&open=${open}&axis=${axis}`);
  const canvas = page.locator(`canvas[data-preview="${kind}"]`);
  const probe = page.locator('[data-pass]');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  const target = lanePoint(kind, open, axis);
  await expect(probe).toHaveAttribute('data-pass', String(canPass(kind, open, axis, ...target)));
  await page.getByLabel('Sample X', { exact: true }).fill('0');
  await page.getByLabel('Sample Y', { exact: true }).fill('0');
  await expect(probe).toHaveAttribute('data-pass', String(canPass(kind, open, axis, 0, 0)));
  const source = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  const programs = () => page.evaluate(() => {
    window.dispatchEvent(new Event('measure-specimen'));
    return Number(document.documentElement.dataset.specimenPrograms);
  });
  const before = await programs();
  expect(before).toBeGreaterThan(0);
  await page.getByLabel('ORBIT specimen angle').fill('55');
  const rotated = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  expect(rotated).not.toBe(source);
  expect(await programs()).toBe(before);
  const waiting = page.getByText('Waiting for WebGL to restore the previews.');
  await page.evaluate(() => window.dispatchEvent(new Event('lose-specimen')));
  await expect(waiting).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('restore-specimen')));
  await expect(waiting).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-rendered-opening', String(open));
  await expect(canvas).toHaveAttribute('data-rendered-axis', String(axis));
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toEqual(rotated);
});

test('the migrated labs fit five viewports and release their resources while navigating', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    const contexts = new Set<WebGL2RenderingContext>();
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      const ctx = Reflect.apply(get, this, [type, ...args]);
      if (type === 'webgl2' && ctx) contexts.add(ctx);
      return ctx;
    } as typeof get;
    window.addEventListener('check-lab-contexts', () => {
      document.documentElement.dataset.activeContexts = String([...contexts].filter(ctx => !ctx.isContextLost()).length);
    });
  });
  const active = () => page.evaluate(() => {
    window.dispatchEvent(new Event('check-lab-contexts'));
    return Number(document.documentElement.dataset.activeContexts);
  });
  await page.goto('/debug/gates/?vol=orbit');
  const navigation = page.getByRole('navigation', { name: 'Explorer', exact: true });
  const route = (name: string) => navigation.getByRole('link', { name, exact: true }).click();
  const viewports = [[1920, 1080], [1280, 720], [960, 540], [390, 844], [360, 760]] as const;
  for (const [name, selector, count] of [
    ['Gates', 'canvas[data-ready=true]', 1], ['Materials', 'canvas[data-mode=lit]', 1],
    ['Gameplay', '[data-count=route]', 0], ['Endings', '#outro', 1], ['Interface', 'iframe', 0],
  ] as const) {
    if (name !== 'Gates') await route(name);
    await expect(page.locator(selector).first()).toBeVisible();
    if (name === 'Endings') {
      await expect.poll(active).toBe(0);
      await page.getByRole('button', { name: 'Open live ending' }).click();
      await expect(page.locator('#outro canvas')).toHaveAttribute('data-station', /\d/);
    }
    await expect.poll(active).toBe(count);
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `${name} at ${width}px` }).toBe(width);
    }
    await page.screenshot({ path: info.outputPath(`${name.toLowerCase()}-mobile.png`), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: info.outputPath(`${name.toLowerCase()}-desktop.png`), fullPage: true });
  }
  for (const name of ['Worlds', 'Lighting', 'Audio', 'Overview']) {
    await route(name);
    await expect.poll(active).toBe(0);
    await expect(page.locator('iframe')).toHaveCount(0);
  }
});

test('Legacy anchors reach their owning experiments and WebGL failures preserve inspection data', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type === 'webgl2' ? null : Reflect.apply(get, this, [type, ...args]);
    } as typeof get;
  });
  for (const [anchor, lab, fixedVolume] of [
    ['gates', 'gates', 'orbit'], ['gates-elsewhere', 'gates', 'elsewhere'], ['gates-daybreak', 'gates', 'daybreak'],
    ['gates-descent', 'gates', 'descent'], ['gates-orbit', 'gates', 'orbit'], ['pickups', 'gameplay', 'orbit'],
    ['materials', 'materials', 'orbit'], ['effects', 'materials', 'orbit'], ['outro', 'endings', 'orbit'],
    ['ui-states', 'interface', 'orbit'],
  ] as const) {
    await page.goto(`/debug/legacy/?vol=orbit&seed=17#${anchor}`);
    await expect(page).toHaveURL(`/debug/${lab}/?vol=${fixedVolume}&seed=17#${anchor}`);
  }
  await page.goto('/debug/gates/?vol=daybreak&gate=daybreak-vertical');
  await expect(page.getByText('WebGL2 is needed for 3D previews.')).toBeVisible();
  await expect(page.locator('[data-pass]')).toHaveAttribute('data-pass', 'true');
  await page.goto('/debug/gameplay/?vol=orbit#pickups');
  await expect(page.getByText('WebGL2 is needed for 3D previews.')).toBeVisible();
  await expect(page.locator('[data-count=main]')).toHaveText('92');
  await page.goto('/debug/endings/?vol=descent');
  await page.getByRole('button', { name: 'Open live ending' }).click();
  await expect(page.getByText(/Live ending unavailable/)).toBeVisible();
  await expect(page.locator('#preview-over')).toBeVisible();
  await page.goto('/debug/legacy/?vol=orbit');
  await expect(page).toHaveURL('/debug/?vol=orbit');
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('Ending Studio restores a shared phase link and uses the real White Escape cue', async ({ page }) => {
  await page.goto('/debug/endings/?vol=elsewhere&seed=1&route=challenge&stage=white-peak&q=low');
  await page.getByRole('button', { name: 'Open live ending' }).click();
  const canvas = page.getByRole('img', { name: 'Live ELSEWHERE ending' });
  await expect(canvas).toHaveAttribute('data-escape-white', '0.99');
  await expect(canvas).toHaveAttribute('data-route', 'challenge');
  const beat = await canvas.getAttribute('data-beat');
  const station = await canvas.getAttribute('data-station');
  await page.getByRole('checkbox', { name: 'Dynamic Lights preview' }).check();
  await expect(canvas).toHaveAttribute('data-beat', beat!);
  await expect(canvas).toHaveAttribute('data-station', station!);
  const href = (await page.getByRole('link', { name: 'Link to this view' }).getAttribute('href'))!;
  await page.goto(href);
  await page.getByRole('button', { name: 'Open live ending' }).click();
  await expect(canvas).toHaveAttribute('data-escape-white', '0.99');
  await expect(canvas).toHaveAttribute('data-station', station!);
  await page.getByRole('button', { name: 'Escape White Start' }).click();
  await expect(canvas).toHaveAttribute('data-escape-white', '0');
});
