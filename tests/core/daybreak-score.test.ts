import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { bpm, daybreakStems, duration, layers, layerTimeline, rhythmTimeline, sections, swing } from '../../app/game/core/daybreak-score';

test('DAYBREAK retains every drum event except the isolated final Kick', () => {
  const timeline = rhythmTimeline();
  // Captured from the previous score after excluding the Kick at 142.016 s.
  expect(createHash('sha256').update(JSON.stringify(timeline)).digest('hex'))
    .toBe('a4601d3fa1ff663cd9da9dc347d4ef0c7ab638f195d91b964cae4de6e98ec476');
  expect(timeline.filter(event => event.kind === 'kick').at(-1)).toMatchObject({ time: 140.766, section: 'OUTRO' });
});

test('the score uses the original 144-second timeline', () => {
  expect(daybreakStems).toEqual(['kick', 'snare', 'hats', 'keys', 'lead', 'atmos']);
  expect([bpm, duration, sections.at(-1)?.endBeat, swing]).toEqual([120, 144, 288, .085]);
});

test('the GLASSHOUSE layers cover every bar without leaving the timeline', () => {
  expect(layers).toHaveLength(72);
  expect(layers.every(events => events.some(event => event.kind === 'pad'))).toBe(true);
  expect(layers.every(events => events.filter(event => event.kind === 'pad').length === 2)).toBe(true);
  expect(layers.every(events => events.every(event => event.at >= 0 && event.at < 16))).toBe(true);
  expect(layers.flat().every(event => event.time >= 0 && event.time < duration)).toBe(true);
  expect(layers[0].filter(event => event.kind === 'pad').map(event => event.time)).toEqual([.016, .016]);
  expect(layers[40].some(event => event.kind === 'air' && event.type === 'impact')).toBe(true);
  expect(layers[39].some(event => event.kind === 'air' && event.type === 'riser')).toBe(true);
  expect(layers[19].some(event => event.kind === 'air' && event.type === 'riser')).toBe(true);
  expect(layers[67].some(event => event.kind === 'air' && event.type === 'riser')).toBe(true);
});

test('the GLASSHOUSE layers match the auditioned arrangement with Bass removed', () => {
  // Captured from the previous score after excluding all 210 Bass events.
  expect(createHash('sha256').update(JSON.stringify(layerTimeline())).digest('hex'))
    .toBe('d6f79949b46bef79c81f50223f378e8655bfdbee744d4becaee52aefec4d0905');
});

test('the mallet phrases stay sparse and inside the intended register', () => {
  const lead = layerTimeline().flatMap(event => event.kind === 'lead' ? [event] : []);
  expect(lead).toHaveLength(19);
  expect(lead.map(event => event.note)).toEqual([78, 83, 81, 81, 78, 83, 86, 83, 86, 78, 86, 83, 88, 86, 83, 78, 81, 74, 74]);
  expect(lead.every(event => event.note >= 74 && event.note <= 88)).toBe(true);
  expect(lead.at(-1)).toMatchObject({ bar: 71, note: 74 });
});
