import { expect, test } from '@playwright/test';
import { VOLUMES } from '../../app/game/core/volumes';
import { openSync, report } from './support';

// Voice calls include the absolute step, instrument, and arguments from the C0-B score.
const scoreDigests = [
  'd6c5c906813db9ed1c3ec07297baab4ecf63ad21cb1cf636300e03c157855f51',
  'cb3451f0db6e689d08291030a36a693362d13d8b06401e69fc77565309a6f87c',
  '83c0231a6616cb1261f2a0aecdd8041f85db30d7c813443f98e5f1fc70b743db',
  '9f94f49a78430b679a2d6a5ac0a573661104bb13cad60a53750287a7a55cc77b',
];

for (const [index, volume] of VOLUMES.entries()) {
  test(`${volume.id} offline section boundaries, voices and ending`, async ({ page }, info) => {
    const errors = await openSync(page);
    const data = await page.evaluate(id => window.syncHarness.score(id), volume.id);
    report('score', { engine: info.project.name, volume: volume.id, ...data });
    expect(data.digest).toBe(scoreDigests[index]);
    expect(data.levels.map(level => level.section)).toEqual([...volume.sections.map(section => section.name), 'tail']);
    for (const level of data.levels) {
      expect(level.sectionSignal.rms, level.section).toBeGreaterThan(0.001);
      for (const sample of [level.before, level.after, level.sectionSignal, level.tail]) {
        if (!sample) continue;
        expect(sample.nonFinite, level.section).toBe(0);
        expect(sample.clipped, level.section).toBe(0);
        expect(sample.peak, level.section).toBeLessThan(1);
      }
    }
    let beat = 0;
    const transitions = [];
    for (const [i, section] of volume.sections.entries()) {
      if (i > 0 && section.energy > volume.sections[i - 1].energy + 0.05) {
        transitions.push({ beat: beat - 4, voice: '_riser' }, { beat, voice: '_impact' });
      }
      beat += section.beats;
    }
    expect(beat).toBe(volume.beats);
    expect(data.transitions).toEqual(transitions);
    expect(data.last?.step).toBeLessThan(beat * 4);
    expect(errors).toEqual([]);
  });
}

test('offline stop isolates queued dry sound and reverb from the next run', async ({ page }, info) => {
  const errors = await openSync(page);
  if (!await page.evaluate(() => typeof OfflineAudioContext.prototype.suspend === 'function' &&
    typeof OfflineAudioContext.prototype.resume === 'function')) {
    report('offline-stop', { engine: info.project.name, status: 'BLOCKED', reason: 'OfflineAudioContext suspend/resume unavailable' });
    return;
  }
  const [before, gap, after] = await page.evaluate(() => window.b0Harness.stoppedRunSignal());
  expect(before.rms).toBeGreaterThan(0.001);
  expect(gap).toEqual({ rms: 0, peak: 0, nonFinite: 0, clipped: 0 });
  expect(after.rms).toBeGreaterThan(0.001);
  report('offline-stop', { engine: info.project.name, status: 'PASS', before, gap, after });
  expect(errors).toEqual([]);
});
