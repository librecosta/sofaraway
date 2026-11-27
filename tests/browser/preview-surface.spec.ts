import { expect, test } from '@playwright/test';
import type { ElementHandle, Locator } from '@playwright/test';

const dev = 'http://127.0.0.1:8091';

for (const [volume, route, action, fault] of [
  ['elsewhere', 'worlds', 'Open live scene', 'prepare'],
  ['daybreak', 'endings', 'Open live ending', 'observe'],
  ['orbit', 'worlds', 'Open live scene', 'observe'],
] as const) {
  test(`${volume} preview rolls back after ${fault} fails`, async ({ page }) => {
    await page.goto(`${dev}/debug/${route}/?vol=${volume}&q=low`);
    await page.evaluate(async fault => {
      const module = '/app/game/graphics/scene.client.ts';
      const { Graphics }: typeof import('../../app/game/graphics/scene.client') = await import(module);
      const dispose = Graphics.prototype.dispose;
      Graphics.prototype.dispose = function () {
        dispose.call(this);
        const canvas = this.renderer.domElement;
        canvas.dataset.disposals = String(Number(canvas.dataset.disposals ?? 0) + 1);
      };
      if (fault === 'prepare') Graphics.prototype.prepare = () => { throw new Error('Scene preparation failed'); };
      else {
        const observe = ResizeObserver.prototype.observe;
        const disconnect = ResizeObserver.prototype.disconnect;
        const pending = new WeakMap<ResizeObserver, HTMLCanvasElement>();
        ResizeObserver.prototype.observe = function (target, options) {
          observe.call(this, target, options);
          if (target instanceof HTMLCanvasElement) {
            pending.set(this, target);
            throw new Error('Resize observation failed after registration');
          }
        };
        ResizeObserver.prototype.disconnect = function () {
          disconnect.call(this);
          const target = pending.get(this);
          if (target) target.dataset.disconnected = 'true';
        };
      }
    }, fault);
    await page.getByRole('button', { name: action }).click();
    const canvas = page.locator('main canvas');
    await expect(page.getByText(/Could not (render|open)|Live ending unavailable/)).toBeVisible();
    await expect(canvas).toHaveAttribute('data-disposals', '1');
    if (fault === 'observe') await expect(canvas).toHaveAttribute('data-disconnected', 'true');
    await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.getContext('webgl2')?.isContextLost())).toBe(true);
    await canvas.dispatchEvent('webglcontextrestored');
    await expect(canvas).toHaveAttribute('data-disposals', '1');
    await expect(canvas).not.toHaveAttribute('data-ready', 'true');
  });
}

async function interrupt(canvas: Locator) {
  const element = (await canvas.elementHandle()) as ElementHandle<HTMLCanvasElement>;
  await element.evaluate(canvas => {
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    canvas.addEventListener('test-restore-context', () => extension.restoreContext(), { once: true });
    extension.loseContext();
  });
  await expect.poll(() => element.evaluate(canvas => canvas.getContext('webgl2')!.isContextLost())).toBe(true);
  return element;
}

for (const volume of ['elsewhere', 'daybreak', 'descent', 'orbit']) {
  test(`${volume} keeps the live scene state through two context restorations and closes while lost`, async ({ page }) => {
    await page.goto(`/debug/lighting/?vol=${volume}&q=low&beat=24`);
    await page.getByRole('button', { name: 'Open live scene' }).click();
    const canvas = page.locator('main canvas');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    const stationControl = page.getByRole('slider', { name: 'World station' });
    const initialStation = Number(await stationControl.inputValue());
    await stationControl.fill(String(initialStation + 35));
    await page.getByRole('slider', { name: 'Music beat' }).fill('32');
    await expect(canvas).toHaveAttribute('data-light-beat', /^32\.0+$/);
    const station = (await canvas.getAttribute('data-station'))!;
    for (let cycle = 0; cycle < 2; cycle++) {
      const element = await interrupt(canvas);
      await expect(page.getByText(/Waiting.*WebGL|Waiting.*restore|Graphics paused/i)).toBeVisible();
      await element.evaluate(canvas => canvas.dispatchEvent(new Event('test-restore-context')));
      await expect(canvas).toHaveAttribute('data-ready', 'true');
      await expect(canvas).toHaveAttribute('data-station', station);
      await expect(canvas).toHaveAttribute('data-light-beat', /^32\.0+$/);
      await expect(canvas).toHaveAttribute('data-quality', 'low');
    }
    const old = await interrupt(canvas);
    await page.getByRole('combobox', { name: 'Volume', exact: true }).selectOption(volume === 'orbit' ? 'daybreak' : 'orbit');
    await expect(canvas).toHaveCount(0);
    await old.evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextrestored')));
    await expect(canvas).toHaveCount(0);
    await page.getByRole('button', { name: 'Open live scene' }).click();
    await expect(canvas).toHaveAttribute('data-ready', 'true');
  });
}

test('a failed restoration releases the scene and its repeated late events are ignored', async ({ page }) => {
  await page.goto(`${dev}/debug/lighting/?vol=orbit&q=low`);
  await page.getByRole('button', { name: 'Open live scene' }).click();
  const canvas = page.locator('main canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page.evaluate(async () => {
    const module = '/app/game/graphics/scene.client.ts';
    const { Graphics }: typeof import('../../app/game/graphics/scene.client') = await import(module);
    Graphics.prototype.restoreOrbit = function () { throw new Error('Orbit restoration failed'); };
  });
  const old = await interrupt(canvas);
  await expect(canvas).not.toHaveAttribute('data-ready', 'true');
  await old.evaluate(canvas => canvas.dispatchEvent(new Event('test-restore-context')));
  await expect(page.getByText('Could not restore the preview.')).toBeVisible();
  await expect.poll(() => old.evaluate(canvas => canvas.getContext('webgl2')!.isContextLost())).toBe(true);
  await old.evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextrestored')));
  await expect(canvas).not.toHaveAttribute('data-ready', 'true');
});

test('the Interface iframe restores its real backdrop and disposes it while interrupted', async ({ page }) => {
  await page.goto('/debug/#ui-states');
  const studio = page.locator('#ui-states');
  const ready = studio.getByRole('status');
  const canvas = studio.frameLocator('iframe').locator('#gl');
  await studio.getByLabel('Real corridor background').check();
  await expect(ready).toHaveText('Rendered game corridor');
  const surface = await interrupt(canvas);
  await expect(ready).toHaveText(/Static fallback/);
  await surface.evaluate(canvas => canvas.dispatchEvent(new Event('test-restore-context')));
  await expect(ready).toHaveText('Rendered game corridor');
  await expect(canvas).toHaveCount(1);
  await interrupt(canvas);
  await studio.getByRole('button', { name: 'Close preview' }).click();
  await expect(studio.locator('iframe')).toHaveCount(0);
});
