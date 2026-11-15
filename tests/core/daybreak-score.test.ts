import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { bpm, daybreakStems, duration, rhythmTimeline, sections, swing } from '../../app/game/core/daybreak-score';

test('DAYBREAK retains every drum event except the isolated final Kick', () => {
  const timeline = rhythmTimeline();
  // Captured from the previous score after excluding the Kick at 142.016 s.
  expect(createHash('sha256').update(JSON.stringify(timeline)).digest('hex'))
    .toBe('a4601d3fa1ff663cd9da9dc347d4ef0c7ab638f195d91b964cae4de6e98ec476');
  expect(timeline.filter(event => event.kind === 'kick').at(-1)).toMatchObject({ time: 140.766, section: 'OUTRO' });
});

test('the drum-only score uses the original 144-second timeline', () => {
  expect(daybreakStems).toEqual(['kick', 'snare', 'hats']);
  expect([bpm, duration, sections.at(-1)?.endBeat, swing]).toEqual([120, 144, 288, .085]);
});
