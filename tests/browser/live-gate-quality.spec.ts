import { expect, test } from '@playwright/test';
import type { DataTexture, Mesh, MeshBasicMaterial } from 'three';
import type { Simulation } from '../../app/game/core/simulation';
import type { Graphics } from '../../app/game/graphics/scene.client';
import type { Runtime } from '../../app/game/runtime/GameRuntime.client';

test('the development Settings switch mounts and removes scoring zones on live gate faces', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sofaraway.locale', 'en');
    localStorage.setItem('sofaraway.immersiveMouse', 'false');
    localStorage.setItem('sofaraway.muted', 'true');
  });
  await page.goto('http://127.0.0.1:8091/?q=low');
  const start = page.locator('[data-act=start]');
  await expect(start).toBeEnabled();
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry =>
      new URL(entry.name).pathname === '/app/game/runtime/GameRuntime.client.ts')!.name;
    const { Runtime: Engine }: typeof import('../../app/game/runtime/GameRuntime.client') = await import(url);
    const original = Engine.prototype.start;
    Engine.prototype.start = function (...args) {
      Reflect.set(window, 'liveGateQualityRuntime', this);
      return original.apply(this, args);
    };
  });
  const settings = page.locator('#settings');
  const toggle = settings.getByRole('switch', { name: 'GATE SCORING ZONES (DEV)' });
  await page.locator('[data-act=settings]').click();
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(entry =>
    new URL(entry.name).pathname.endsWith('/live-gate-quality.client.ts')))).toBe(false);
  await toggle.check();
  await settings.getByRole('button', { name: 'CLOSE' }).click();
  await start.click();
  await expect(page.locator('#hud')).toBeVisible();

  await expect.poll(() => page.evaluate(() => {
    const live: Runtime = Reflect.get(window, 'liveGateQualityRuntime');
    const graphics: Graphics = Reflect.get(live, 'graphics');
    const volume = Reflect.get(graphics, 'volume');
    if (!volume) return [];
    const children = volume.scene.getObjectsByProperty('name', 'live-gate-quality') as Mesh[];
    const plane = children[0] as Mesh | undefined;
    if (!plane?.parent) return [];
    const texture = (plane.material as MeshBasicMaterial).map as DataTexture;
    const pixels = texture.image.data as Uint8Array;
    const opacity = new Set<number>();
    for (let offset = 3; offset < pixels.length; offset += 4) opacity.add(pixels[offset]);
    return [children.length > 0, plane.parent.type, ...[...opacity].sort((a, b) => a - b)];
  })).toEqual([true, 'Mesh', 0, 105, 145]);
  if (process.env.CAPTURE_LIVE_GATE_QUALITY) {
    await expect.poll(() => page.evaluate(() => {
      const live: Runtime = Reflect.get(window, 'liveGateQualityRuntime');
      const sim: Simulation = Reflect.get(live, 'simulation');
      return sim.previewGates.some(gate => gate.routeStation - sim.distance > 9 && gate.routeStation - sim.distance < 16);
    }), { timeout: 20_000 }).toBe(true);
    await page.screenshot({ path: '.local/live-gate-quality/flight.png', animations: 'disabled' });
  }

  await page.keyboard.press('p');
  const pause = page.getByRole('dialog', { name: 'PAUSED', exact: true });
  await pause.getByRole('button', { name: 'SETTINGS' }).click();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  expect(await page.evaluate(() => {
    const live: Runtime = Reflect.get(window, 'liveGateQualityRuntime');
    const graphics: Graphics = Reflect.get(live, 'graphics');
    return Reflect.get(graphics, 'volume').scene.getObjectsByProperty('name', 'live-gate-quality').length;
  })).toBe(0);
  await settings.getByRole('button', { name: 'CLOSE' }).click();
  await pause.getByRole('button', { name: 'RESUME' }).click();
  await expect(pause).toBeHidden();
});
