import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { VolumeId } from '../../app/game/contracts';
import type {} from '../harness/main';
import type {} from '../harness/audio-sync';

export function report(scenario: string, value: object) {
  console.log('SYNC ' + JSON.stringify({ scenario, ...value }));
}

export async function openSync(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?sync');
  await page.waitForFunction(() => !!window.syncHarness);
  await page.evaluate(() => {
    for (const [id, action] of [
      ['start', () => window.b0Harness.start()],
      ['silent', () => window.b0Harness.start(true)],
      ['resume', () => window.b0Harness.resume()],
      ['silent-resume', () => window.b0Harness.resume(true)],
    ] as const) {
      const button = document.createElement('button');
      button.id = id;
      button.textContent = id;
      button.addEventListener('click', () => { void action(); });
      document.body.append(button);
    }
  });
  return errors;
}

export async function mount(page: Page, volumeId: VolumeId) {
  const phase = await page.evaluate(async id => {
    const snap = await window.b0Harness.mount({ volumeId: id, quality: 'low',
      diagnostics: { fixedTime: null, autoplay: false, align: true, god: false, boost: false,
        mobileQuality: false, post: true, record: false, debug: false } });
    window.syncHarness.clear();
    return snap.phase;
  }, volumeId);
  expect(phase).toBe('menu');
}

export function state(page: Page) { return page.evaluate(() => window.syncHarness.inspect()); }
export function trace(page: Page) { return page.evaluate(() => window.syncHarness.trace()); }
export function hasAudio(page: Page) {
  return page.evaluate(() => typeof AudioContext === 'function' ||
    typeof (window as Window & { webkitAudioContext?: unknown }).webkitAudioContext === 'function');
}
export function phase(page: Page, expected: string) {
  return expect.poll(() => page.evaluate(() => window.b0Harness.snapshot().phase)).toBe(expected);
}
