import { expect, test } from '@playwright/test';
import { difficulties } from '../../app/game/contracts';
import { VOLUMES } from '../../app/game/core/volumes';

const expectedCounts = [[143, 144, 144], [40, 40, 40], [158, 158, 158], [91, 91, 91]];
// Final scoreboard values captured from A0 with the same fixed-time query.
const expectedScores = [[67701, 107726, 160426], [15468, 23928, 35208],
  [75314, 119039, 177339], [41444, 65069, 96569]];

for (const [index, volume] of VOLUMES.entries()) {
  test(`${volume.id} completes all difficulties with collision enabled`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const time = volume.beats * 60 / volume.bpm + 0.8;
    for (const [i, difficulty] of difficulties.entries()) {
      await page.goto(`/?vol=${volume.id}&diff=${difficulty}&q=low&t=${time}&align=1&god=0&dbg=1`);
      const count = expectedCounts[index][i];
      await expect(page.locator('#over')).toBeVisible();
      await expect(page.locator('#over-title')).toHaveText('ESCAPED');
      await expect(page.locator('#over-rank')).toHaveText('S');
      await expect(page.locator('#over-gates')).toHaveText(`${count}/${count}`);
      await expect(page.locator('#over-combo')).toHaveText(String(count));
      await expect(page.locator('#over-acc')).toHaveText('100%');
      await expect(page.locator('#over-score')).toHaveText(String(expectedScores[index][i]));
      expect(await page.locator('#errbox').evaluate(el => JSON.parse(el.textContent!).hitCount)).toBe(0);
    }
    expect(errors).toEqual([]);
  });

  test(`${volume.id} GPU openings match collision and each score section has signal`, async ({ page }) => {
    await page.goto('http://127.0.0.1:8090/');
    const sample = await page.evaluate(id => window.b0Harness.shaderMismatches(id), volume.id);
    expect(sample).toEqual({ mismatches: [], glError: 0 });
    const levels = await page.evaluate(id => window.b0Harness.sectionSignals(id), volume.id);
    expect(levels.map(level => level.section)).toEqual(volume.sections.map(section => section.name));
    for (const { section, rms, peak } of levels) {
      expect(rms, section).toBeGreaterThan(0.001);
      expect(peak, section).toBeLessThanOrEqual(1);
    }
  });
}

test('disconnecting a run isolates its dry signal and reverb from the next run', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const [before, gap, after] = await page.evaluate(() => window.b0Harness.stoppedRunSignal());
  expect(before.rms).toBeGreaterThan(0.001);
  expect(gap.peak).toBe(0);
  expect(after.rms).toBeGreaterThan(0.001);
});

test('reloading a fixed-time capture reproduces the same pixels', async ({ page }) => {
  await page.goto('/?vol=elsewhere&t=24.4&align=1&god=0&q=high&ui=0&dbg=1');
  const capture = async () => {
    await expect(page.locator('#errbox')).toHaveText(/"phase":"playing"/);
    await page.addStyleTag({ content: '#errbox { display: none; }' });
    return page.screenshot();
  };
  const first = await capture();
  await page.reload();
  expect((await capture()).equals(first)).toBe(true);
});

test('distant gates stay sharp while foreground depth of field remains active', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  // At 36 s a distant iris gate fills the centre, with tunnel wall in the upper left.
  const gate = { x: 900, y: 515, width: 120, height: 85 };
  const wall = { x: 30, y: 160, width: 220, height: 220 };
  const capture = async (query: string) => {
    await page.goto('/?vol=elsewhere&t=36&q=high&ui=0&dbg=1' + query);
    await expect(page.locator('#errbox')).toContainText('"phase":"playing"');
    await expect(page.locator('#errbox')).toContainText('"dof":true');
    await page.addStyleTag({ content: '#errbox, #cursor { display: none; }' });
    return {
      gate: await page.screenshot({ clip: gate }),
      wall: await page.screenshot({ clip: wall }),
    };
  };

  const regular = await capture('');
  const sharp = await capture('&dof=0');
  expect(regular.gate.equals(sharp.gate)).toBe(true);
  expect(regular.wall.equals(sharp.wall)).toBe(false);
});
