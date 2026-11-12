import { expect, test } from '@playwright/test';
import { difficulties } from '../../app/game/contracts';
import { STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import { VOLUMES } from '../../app/game/core/volumes';

const expectedCounts = [[140, 141, 141], [40, 40, 40], [158, 158, 158], [91, 91, 91]];
// ELSEWHERE defaults to Main; the other three retain their A0 scores.
const expectedScores = [[66201, 105326, 156826], [15468, 23928, 35208],
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
      const debug = await page.locator('#errbox').evaluate(el => JSON.parse(el.textContent!));
      expect(debug.hitCount).toBe(0);
      // Gate align aims at the next Iris, outside the pickup radius, preserving the no-pickup baseline.
      expect(debug.pickup).toEqual(volume.id === 'elsewhere' ? { kind: expect.any(String), status: 'missed' } : null);
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

test('ELSEWHERE glass separates optical tiers, filters subpixel lines and has beveled sidewalls', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const result = await page.evaluate(() => window.b0Harness.inspectGlassOptics());
  console.log('GLASS_OPTICS', JSON.stringify(result));
  expect(result.glError).toBe(0);
  expect(result.rim).toBeGreaterThan(result.seam);
  expect(result.seam).toBeGreaterThan(result.outer);
  expect(result.halo).toBeGreaterThan(result.body);
  expect(result.hub.every(delta => Math.abs(delta) <= 2)).toBe(true);
  expect(result.microContrast[0]).toBeGreaterThan(5);
  expect(result.microContrast[1]).toBeLessThanOrEqual(2);
  expect(result.protectedPixels[1]).toEqual(result.protectedPixels[0]);
  for (const readings of result.readability) {
    for (const { width, full, fast } of readings) {
      expect(Math.abs(fast.mean - full.mean)).toBeLessThan(full.mean * 0.02);
      if (width <= 0.003) expect(fast.range).toBeLessThan(full.range * 0.9);
      else expect(fast.range).toBeLessThanOrEqual(full.range);
    }
    expect(readings.at(-1)!.fast.range).toBeLessThanOrEqual(2);
  }
  expect(result.irisWalls.flat().every(pixel => pixel > 0)).toBe(true);
  for (const [i, expected] of result.expectedThroat.entries()) {
    const throat = result.throatAndBevel[0][i];
    const bevel = result.throatAndBevel[1][i];
    expect(throat).not.toBeNull();
    expect(throat!).toBeCloseTo(expected, 3);
    expect(bevel!).toBeGreaterThan(expected + 0.01);
  }
  expect(result.unique).toBe(2);
  expect(result.releasedByGate).toBe(0);
  expect(result.released).toBe(3);
});

test('disconnecting a run isolates its dry signal and reverb from the next run', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const [before, gap, after] = await page.evaluate(() => window.b0Harness.stoppedRunSignal());
  expect(before.rms).toBeGreaterThan(0.001);
  expect(gap.peak).toBe(0);
  expect(after.rms).toBeGreaterThan(0.001);
});

for (const { name, time } of [{ name: 'an early gate', time: 24.4 }, { name: 'the approaching pickup', time: 142.9 }]) {
  test(`reloading a fixed-time capture of ${name} reproduces the same pixels`, async ({ page }) => {
    await page.goto(`/?vol=elsewhere&t=${time}&align=1&god=0&q=high&ui=0&dbg=1`);
    const capture = async () => {
      await expect(page.locator('#errbox')).toHaveText(/"phase":"playing".*"pickup":\{"kind":".+?","status":"pending"\}/);
      await page.addStyleTag({ content: '#errbox { display: none; }' });
      return page.screenshot();
    };
    const first = await capture();
    await page.reload();
    expect((await capture()).equals(first)).toBe(true);
  });
}

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

test('the last ORBIT gate fades into view before reaching full brightness', async ({ page }) => {
  await page.addInitScript(() => {
    const gl = WebGL2RenderingContext.prototype;
    const { getUniformLocation, uniform1f } = gl;
    const fades = new WeakSet<WebGLUniformLocation>();
    const samples: number[] = [];
    gl.getUniformLocation = function (program, name) {
      const location = getUniformLocation.call(this, program, name);
      if (name === 'uFade' && location) fades.add(location);
      return location;
    };
    gl.uniform1f = function (location, value) {
      if (location && fades.has(location)) {
        samples.push(value);
        document.documentElement.dataset.gateFades = JSON.stringify(samples);
      }
      uniform1f.call(this, location, value);
    };
  });

  const renderAt = async (ahead: number, boost = false): Promise<number[]> => {
    const sim = new Simulation(VOLUMES[3], { align: true });
    sim.start('normal');
    const station = sim.reference.station(316, 'standard');
    let ticks = 0;
    while (station - sim.distance > ahead) {
      sim.step(STEP, { ...idleInput, boosting: boost });
      ticks++;
    }
    await page.goto(`/?vol=orbit&t=${ticks * STEP}&q=low&align=1&god=0&dbg=1&boost=${Number(boost)}`);
    await expect(page.locator('#errbox')).toContainText('"phase":"playing"');
    const samples = await page.locator('html').getAttribute('data-gate-fades');
    return JSON.parse(samples ?? '[]');
  };

  // The last gate is at beat 316. Earlier gates in each capture are fully lit.
  const early = Math.min(...await renderAt(187));
  const midway = Math.min(...await renderAt(165));
  const nearlyLit = Math.min(...await renderAt(144));
  expect(early).toBeGreaterThan(0);
  expect(early).toBeLessThan(0.1);
  expect(midway).toBeGreaterThan(early);
  expect(nearlyLit).toBeGreaterThan(midway);
  expect(nearlyLit).toBeLessThan(1);
  expect(Math.min(...await renderAt(139))).toBe(1);
  expect(Math.min(...await renderAt(187, true))).toBeCloseTo(early);
});
