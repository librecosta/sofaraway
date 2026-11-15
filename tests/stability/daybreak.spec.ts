import { expect, test } from '@playwright/test';
import { branchLayout, routeSides } from '../../app/game/core/branches';
import { OutroInspection } from '../../app/game/debug/outro-inspection';
import { volumeById } from '../../app/game/core/volumes';
import type {} from '../harness/stability';

test('DAYBREAK frame and streaming measurements @daybreak-perf', async ({ browser }) => {
  const ports = process.env.STABILITY_REFERENCE_DIR ? [8097, 8095] : [8095];
  for (const port of ports) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    try {
      await page.goto(`http://127.0.0.1:${port}/?stability`);
      await page.waitForFunction(() => !!window.stability);
      const sample = await page.evaluate(async () => {
        const menu = await window.stability.mount('daybreak', 'low');
        const idle = await window.stability.capture(1500);
        await window.stability.start(true);
        const play = await window.stability.capture(1500);
        const metrics = window.stability.metrics();
        window.stability.dispose();
        return { readyMs: menu.readyMs, idle: idle.cpu.frame, play: play.cpu.frame, gpu: play.gpu.frame, gpuStatus: play.gpuStatus, metrics };
      });
      console.log('DAYBREAK PERF', JSON.stringify({ build: port === 8095 ? 'candidate' : 'baseline', ...sample }));
      expect(sample.metrics.glError).toBe(0);
      expect(sample.metrics.snapshot.phase).toBe('playing');
      const build = port === 8095 ? 'candidate' : 'baseline';
      const layout = branchLayout(0);
      const volume = volumeById('daybreak');
      const inspection = new OutroInspection('standard', 0, 'main', undefined, 'normal', volume);
      const junctionFrames = routeSides.map(side => {
        const route = layout[side];
        const station = inspection.sim.junctionPath!.open + 85;
        return { name: `${route}-interior`, side, beat: 240, station, difficulty: 'normal' as const };
      });
      const otherFrames = ([['branch-entry', 232], ['encore-first', 200], ['afterglow-peak', 277]] as const).map(([name, beat]) =>
        ({ name, side: 'center' as const, beat, station: inspection.view(name).station, difficulty: 'normal' as const }));
      const sunburst = inspection.sim.reference.station(194, 'standard');
      const normal = { name: 'normal-sunburst', station: sunburst, beat: 194, side: 'center', difficulty: 'normal' } as const;
      const white = new OutroInspection('standard', 0, 'main', undefined, 'impossible', volume).view('white-start');
      const added = port === 8095 ? [
        { ...normal, name: 'impossible-sunburst', difficulty: 'impossible' },
        { ...normal, name: 'impossible-ending', station: white.station, beat: 276, difficulty: 'impossible' },
      ] as const : [];
      for (const { name, station, beat, side, difficulty } of [...otherFrames, ...junctionFrames, normal, ...added]) {
        const result = await page.evaluate(({ station, beat, side, name, difficulty }) => window.stability.fixedGlass(beat, 'low', true, 'standard',
          side, 180, false, { station, inspection: true, fly: name !== 'branch-entry', difficulty, volumeId: 'daybreak' }),
        { station, beat, side, name, difficulty });
        console.log('DAYBREAK PERF', JSON.stringify({ build, name, ...result }));
        expect(result.glError).toBe(0);
        expect(result.metrics.continuity!.farThrough).toBe(result.pathLength);
        expect(result.metrics.continuity!.farBytes).toBeLessThan(400_000);
        expect(result.metrics.chunks).toBeLessThanOrEqual(4);
      }
    } finally { await page.close(); }
  }
});
