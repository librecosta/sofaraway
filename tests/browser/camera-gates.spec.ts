import { expect, test } from '@playwright/test';
import type {} from '../harness/main';

test('the lens is steady on the beat and glass stays aligned during speed changes', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const result = await page.evaluate(() => window.b0Harness.inspectCameraAndGates());
  console.log('CAMERA_GATES ' + JSON.stringify(result));
  for (const lens of result.lens) {
    const lowRate = lens.hz === 20;
    expect(lens.beats).toBeLessThan(lens.mode === 'sightseeing' ? 1e-9 : lowRate ? 0.3 : 0.1);
    expect(lens.entering).toBeLessThan(lowRate ? 1.8 : 0.66);
    expect(lens.leaving).toBeLessThan(lowRate ? 1.8 : 0.66);
    expect(lens.samples).toEqual(result.lens.find(other => other.mode === lens.mode && other.hz === 60)!.samples);
    const fov = (at: number) => lens.samples.find(sample => sample.t === at)!.fov;
    expect(fov(2.25)).toBeGreaterThan(fov(2) + 4);
    expect(fov(4)).toBeGreaterThan(fov(2) + 6.9);
    expect(fov(4.25)).toBeLessThan(fov(4) - 4);
  }
  for (const sample of result.spatial) {
    const context = `${sample.volume} ${sample.mode} ${sample.stage} at beat ${sample.gate}`;
    expect(sample.visible, context).toBe(true);
    expect(sample.judged).toBe(true);
    expect(sample.maxPathError, context).toBeLessThan(1e-6);
    expect(sample.crossingError, context).toBeLessThan(1e-6);
    expect(sample.fadeFrames, context).toBeGreaterThan(0);
    expect(sample.fadeDrift, context).toBeLessThan(1e-6);
    expect(sample.maxAheadIncrease, context).toBeLessThan(1e-6);
    expect(sample.peak.idle, context).toBeLessThan(0.03);
    const anchored = sample.stage === 'branch' || sample.stage === 'entry';
    expect(sample.peak.press, context).toBeLessThan(anchored ? 1e-6 : 0.36);
    expect(sample.peak.release, context).toBeLessThan(anchored ? 1e-6 : 0.12);
    if (sample.stage === 'entry' || sample.stage === 'merge') {
      expect(sample.cameraSeams).toHaveLength(1);
      expect(sample.cameraSeams[0].step).toBeLessThan(0.9);
      expect(sample.cameraSeams[0].turn).toBeLessThan(4);
    }
  }
  for (const { mode, cruise, boosted } of result.heldBoost) {
    expect(boosted.beat).toBe(cruise.beat);
    expect(boosted.along - cruise.along).toBeGreaterThan(mode === 'standard' ? 50 : 25);
    for (const crossing of [cruise, boosted]) {
      expect(crossing.visible).toBe(true);
      expect(crossing.passed).toBe(true);
      expect(crossing.contactError).toBeLessThan(1e-6);
    }
  }
});
