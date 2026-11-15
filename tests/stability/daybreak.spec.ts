import { expect, test } from '@playwright/test';
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
      if (port !== 8095) continue;
      const inspection = new OutroInspection('standard', 0, 'main', undefined, 'normal', volumeById('daybreak'));
      for (const [name, beat] of [['branch-entry', 232], ['encore-first', 200], ['afterglow-peak', 277]] as const) {
        const { station } = inspection.view(name);
        const result = await page.evaluate(([station, beat]) => window.stability.fixedGlass(beat, 'low', true, 'standard',
          'center', 60, false, { station, inspection: true, fly: true, volumeId: 'daybreak' }), [station, beat]);
        console.log('DAYBREAK PERF', JSON.stringify({ build: 'candidate', name, ...result }));
        expect(result.glError).toBe(0);
        expect(result.metrics.continuity!.farBytes).toBeLessThan(400_000);
        expect(result.metrics.chunks).toBeLessThanOrEqual(4);
      }
    } finally { await page.close(); }
  }
});
