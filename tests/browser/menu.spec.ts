import { expect, test } from '@playwright/test';
import { readMetrics } from './diagnostics';

test('the idle menu continues past the song and generated path without the finish flash', async ({ page }) => {
  await page.goto('http://127.0.0.1:8091/?q=low&dbg=1');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  const afterEnd = await page.evaluate(async () => {
    const entries = performance.getEntriesByType('resource');
    const loaded = (path: string) => entries.filter(entry => new URL(entry.name).pathname === path).at(-1)!.name;
    const { Simulation, corridorLength }: typeof import('../../app/game/core/simulation') =
      await import(loaded('/app/game/core/simulation.ts'));
    const { Tunnel }: typeof import('../../app/game/graphics/tunnel.client') =
      await import(loaded('/app/game/graphics/tunnel.client.ts'));
    return new Promise<{ distance: number; ahead: number }>(resolve => {
      let jumped = false;
      const step = Simulation.prototype.step;
      Simulation.prototype.step = function (dt, input) {
        step.call(this, dt, input);
        if (this.phase !== 'menu') return;
        Simulation.prototype.step = step;
        this.distance = corridorLength(this.volume) + 1500;
        this.beat = this.volume.beats + 20;
        jumped = true;
      };
      const update = Tunnel.prototype.update;
      Tunnel.prototype.update = function (distance, menu) {
        update.call(this, distance, menu);
        if (!jumped) return;
        Tunnel.prototype.update = update;
        resolve({ distance, ahead: Math.max(...this.chunks.map(chunk => chunk.s1)) - distance });
      };
    });
  });
  expect(afterEnd.ahead).toBeGreaterThanOrEqual(420);
  await expect.poll(async () => (await readMetrics(page)).distance).toBeGreaterThan(afterEnd.distance);
  await expect(page.locator('#flash')).toHaveCSS('opacity', '0');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
});

test('menu labels keep their size while the original reticle expands on hover', async ({ page }) => {
  await page.goto('/?q=low');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  await page.evaluate(() => document.fonts.ready.then(() => {}));
  const credits = page.getByRole('button', { name: 'CREDITS', exact: true });
  const noise = credits.locator('span[aria-hidden] > span > span:nth-child(2)');
  const box = (await credits.boundingBox())!;
  const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  await page.mouse.move(point.x, point.y);
  await expect(noise.first()).toBeAttached();
  await expect(noise.first()).toHaveCSS('pointer-events', 'none');
  expect(await credits.boundingBox()).toEqual(box);
  await expect(credits).toHaveCSS('color', 'rgb(116, 255, 220)');
  await expect(noise).toHaveCount(0);
  expect(await credits.boundingBox()).toEqual(box);
  await expect(page.locator('#cursor svg')).toBeVisible();
  await expect(page.locator('#cursor')).toHaveClass(/hover/);
  await expect(page.locator('#cursor circle').first()).toHaveCSS('transform', 'matrix(1.74, 0, 0, 1.74, 0, 0)');
  await expect(credits).toHaveCSS('cursor', 'none');
  expect(await credits.evaluate(button => getComputedStyle(button, '::after').content)).toBe('none');
  await page.mouse.move(point.x, point.y + 100);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(point.x, point.y);
  await expect(noise).toHaveCount(0);
});

test('Credits, Settings and menu controls keep readable sizes in a narrow viewport', async ({ page }) => {
  const opened: unknown[][] = [];
  await page.exposeFunction('recordMenuNavigation', (...args: unknown[]) => { opened.push(args); });
  await page.addInitScript(() => {
    window.open = (...args) => {
      void (window as unknown as { recordMenuNavigation(...args: unknown[]): Promise<void> }).recordMenuNavigation(...args);
      return null;
    };
  });
  await page.goto('/?q=low');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  for (const [name, href] of [
    ['LibreCosta on X', 'https://x.com/LibreCostaHQ'],
    ['SoFaraway on GitHub', 'https://github.com/librecosta/sofaraway'],
  ]) {
    const link = page.getByRole('link', { name });
    await expect(link).not.toHaveAttribute('href');
    await expect(link).not.toHaveAttribute('title');
    await link.press('Enter');
    await expect.poll(() => opened.at(-1)).toEqual([href, '_blank', 'noopener,noreferrer']);
    await expect(link.locator('svg')).toHaveCSS('width', '27px');
  }
  const sizes = async () => {
    const credits = page.locator('[data-act=credits]');
    const settings = page.locator('[data-act=settings]');
    await expect(credits).toHaveCSS('font-size', '14px');
    await expect(settings).toHaveCSS('font-size', '14px');
    for (const action of await page.locator('#menu button:not([aria-hidden=true])').all()) {
      await expect(action).toBeInViewport({ ratio: .65 });
    }
    await credits.click();
    await expect(page.locator('#panel-body')).toHaveCSS('font-size', '16px');
    for (const name of ['librecosta', 'HelloRun']) {
      const link = page.getByRole('link', { name, exact: true });
      await expect(link).toHaveCSS('color', 'rgb(116, 255, 220)');
      await expect(link).toHaveCSS('font-weight', '700');
    }
    await expect(page.locator('#panel-body hr')).toHaveCSS('border-top-width', '2px');
    await expect(page.locator('#panel-body hr')).toHaveCSS('border-top-style', 'dashed');
    const email = page.getByRole('link', { name: 'contact@librecosta.com' });
    await expect(email).not.toHaveAttribute('href');
    await expect(email.locator('svg')).toBeVisible();
    await page.getByRole('dialog', { name: 'Credits' }).getByRole('button', { name: 'CLOSE' }).click();
    await settings.click();
    const panel = page.getByRole('dialog', { name: 'Settings' });
    await expect(panel.getByText('VOLUME', { exact: true })).toHaveCSS('font-size', '15px');
    await panel.getByRole('button', { name: 'CLOSE' }).click();
  };
  await sizes();
  await page.setViewportSize({ width: 320, height: 568 });
  await sizes();
  await page.setViewportSize({ width: 667, height: 375 });
  await sizes();
});
