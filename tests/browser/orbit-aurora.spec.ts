import { expect, test } from '@playwright/test';
import type {} from '../harness/main';

const cases = [
  { name: 'Impossible Boost, High, post', quality: 'high', boost: true, difficulty: 'impossible', mode: 'standard', post: true, prepare: true },
  { name: 'Normal cruise, Auto, post', quality: 'auto', boost: false, difficulty: 'normal', mode: 'standard', post: true, prepare: true },
  { name: 'Sightseeing Boost, Low, direct', quality: 'low', boost: true, difficulty: 'normal', mode: 'sightseeing', post: false, prepare: false },
] as const;

for (const scenario of cases) {
  test(`@perf Aurora prewarms before its first visible draw (${scenario.name})`, async ({ page }, run) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:8090/');
    const result = await page.evaluate(({ quality, boost, difficulty, mode, post, prepare }) =>
      window.b0Harness.measureAuroraEntry(quality, boost, difficulty, mode, post, { prepare }), scenario);
    await run.attach('Cold and warm frame timings', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(errors).toEqual([]);
    expect(result.glError).toBe(0);
    expect(result.probes).toHaveLength(1);
    expect(result.probes[0].station).toBeLessThan(result.from - 330);
    expect(result.fieldUploads).toEqual([result.probes[0].station]);
    expect(result.preparation.draws).toBe(0);
    if (scenario.prepare) expect(result.preparation.builtMs).not.toBeNull();
    const firstFrames = ['cold', 'warm'].map(entry => result.frames.find(frame => frame.entry === entry && frame.draws > 0)!);
    for (const first of firstFrames) {
      expect(first).toMatchObject({ draws: 6, builtMs: null, programDelta: 0 });
      expect(first.presence).toBeGreaterThan(.001);
    }
    expect(firstFrames[0].station).toBe(firstFrames[1].station);
    expect(result.frames.every(frame => frame.draws === 0 || frame.presence > .001)).toBe(true);
  });
}
