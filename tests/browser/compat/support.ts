import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

export function record(info: TestInfo, status: 'PASS' | 'DEGRADED' | 'UNSUPPORTED' | 'BLOCKED', detail: string, data?: unknown) {
  info.annotations.push({ type: status, description: detail });
  console.log('COMPAT ' + JSON.stringify({ project: info.project.name, test: info.title, status, detail, data }));
}

export const startButton = (page: Page) => page.locator('[data-act=start]');
export const fallback = (page: Page) => page.getByRole('dialog', { name: 'GAME UNAVAILABLE' });

export async function resumeRun(page: Page, info: TestInfo, action: 'click' | 'tap' = 'click') {
  const pause = page.getByRole('dialog', { name: 'PAUSED' });
  if (!await pause.isVisible()) return;
  await pause.getByRole('button', { name: 'RESUME', exact: true })[action]({ timeout: 8_000 });
  await expect(pause).toBeHidden();
}

export async function ready(page: Page, info: TestInfo, path = '/?q=low&dbg=1') {
  await page.goto(path);
  const start = startButton(page);
  await expect.poll(async () => await start.isEnabled() || await fallback(page).isVisible()).toBe(true);
  if (await start.isEnabled()) return true;
  const available = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  expect(available, 'fallback with WebGL2 available requires investigation').toBe(false);
  await expect(fallback(page)).toContainText('WebGL2');
  record(info, 'UNSUPPORTED', 'WebGL2 is unavailable and the fallback rendered');
  record(info, 'BLOCKED', 'The environment cannot execute this WebGL2 workflow');
  return false;
}

export async function startRun(page: Page, info: TestInfo, action: 'click' | 'tap' | 'Space' | 'Enter' = 'click') {
  const audio = page.getByRole('dialog', { name: 'AUDIO UNAVAILABLE' });
  const hud = page.locator('#hud');
  const trigger = await audio.isVisible() ? audio.getByRole('button', { name: 'TRY AGAIN' }) : startButton(page);
  if (action === 'Space' || action === 'Enter') await page.keyboard.press(action);
  else await trigger[action]({ timeout: 8_000 });
  await expect.poll(async () => await hud.isVisible() || await audio.isVisible()).toBe(true);
  if (await audio.isVisible()) {
    const available = await page.evaluate(() => typeof AudioContext === 'function' ||
      typeof (window as Window & { webkitAudioContext?: unknown }).webkitAudioContext === 'function');
    if (available) throw new Error('Native AudioContext exists, but activation failed after a real gesture.');
    await audio.getByRole('button', { name: 'PLAY WITH SOUND OFF' })[action === 'tap' ? 'tap' : 'click']();
    record(info, 'UNSUPPORTED', 'This browser build does not expose AudioContext');
    record(info, 'BLOCKED', 'Audible transport cannot run here; explicit silent transport exercised');
  } else {
    record(info, 'PASS', 'Native audio activation');
  }
  await expect(hud).toBeVisible();
}
