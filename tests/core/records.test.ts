import { expect, test } from 'vitest';
import { difficultiesFor } from '../../app/game/core/difficulty';
import { VOLUMES } from '../../app/game/core/volumes';
import { emptyRecords, parseRecords, readRecords, recordFor, recordRun, writeRecords } from '../../app/game/runtime/records.client';

test('Best and Last are independent across every supported volume and difficulty', () => {
  const records = emptyRecords();
  let points = 100;
  for (const { id } of VOLUMES) for (const difficulty of difficultiesFor(id)) {
    const last = { score: points++, outcome: 'ESCAPED', encoreBonus: 7200 } as const;
    expect(recordRun(records, id, difficulty, 'standard', last)).toBe(true);
    expect(recordRun(records, id, difficulty, 'standard', { score: 20, outcome: 'TERMINATED' })).toBe(false);
  }
  const loaded = parseRecords(JSON.stringify(records));
  points = 100;
  for (const { id } of VOLUMES) for (const difficulty of difficultiesFor(id)) {
    expect(recordFor(loaded, id, difficulty, 'standard')).toEqual({ best: points++ + 7200, last: { score: 20, outcome: 'TERMINATED' } });
  }
  expect(recordRun(loaded, 'elsewhere', 'impossible', 'standard', { score: 900, outcome: 'ESCAPED', recovery: true })).toBe(false);
  expect(recordRun(loaded, 'elsewhere', 'normal', 'sightseeing', { score: 800, outcome: 'ESCAPED' })).toBe(false);
  expect(recordFor(loaded, 'elsewhere', 'impossible', 'standard')).toEqual({ best: 7303, last: { score: 900, outcome: 'ESCAPED', recovery: true } });
  expect(recordFor(loaded, 'elsewhere', 'hard', 'sightseeing')).toEqual({ best: null, last: { score: 800, outcome: 'ESCAPED' } });
});

test('recoverable legacy bonus counts toward Best and each new Encore run compares by total', () => {
  const previous = { score: 9800, encoreBonus: 900, outcome: 'ESCAPED' } as const;
  const records = parseRecords(JSON.stringify({ version: 1, standard: { elsewhere: { normal: { best: 10000, last: previous } } } }));
  expect(recordFor(records, 'elsewhere', 'normal', 'standard').best).toBe(10700);
  expect(recordRun(records, 'elsewhere', 'normal', 'standard', { ...previous, score: 9900, encoreBonus: 600 })).toBe(false);
  expect(recordRun(records, 'elsewhere', 'normal', 'standard', { ...previous, score: 9400, encoreBonus: 1500 })).toBe(true);
  expect(recordRun(records, 'elsewhere', 'normal', 'standard', { ...previous, score: 20000, recovery: true })).toBe(false);
  expect(recordFor(parseRecords(JSON.stringify(records)), 'elsewhere', 'normal', 'standard').best).toBe(10900);
});

test('DAYBREAK records remain independent of legacy DRIFT scores after a round trip', () => {
  const last = { score: 800, outcome: 'ESCAPED' } as const;
  const legacy = { standard: { drift: { normal: { best: 1200, last } } }, sightseeing: { drift: { last } } };
  const records = parseRecords(JSON.stringify({ version: 1, ...legacy }));
  expect(recordFor(records, 'drift', 'normal', 'standard')).toEqual({ best: null, last: null });
  expect(recordFor(records, 'drift', 'normal', 'sightseeing').last).toBeNull();
  const daybreak = { ...last, score: 400 };
  expect(recordRun(records, 'drift', 'normal', 'standard', daybreak)).toBe(true);
  recordRun(records, 'drift', 'normal', 'sightseeing', daybreak);
  const reloaded = parseRecords(JSON.stringify(records));
  expect(reloaded.standard.drift).toEqual(legacy.standard.drift);
  expect(reloaded.sightseeing.drift).toEqual(legacy.sightseeing.drift);
  expect(recordFor(reloaded, 'drift', 'normal', 'standard')).toEqual({ best: 400, last: daybreak });
  expect(recordFor(reloaded, 'drift', 'normal', 'sightseeing').last).toEqual(daybreak);
});

test('records reject invalid or unknown storage values and tolerate a missing browser', () => {
  for (const raw of [null, '{bad', 'null', '[]', '{"version":2}', '{"version":"1"}']) expect(parseRecords(raw)).toEqual(emptyRecords());
  const raw = '{"version":1,"standard":{"elsewhere":{"hard":{"best":1e999,"last":{"score":-1,"outcome":"ESCAPED"}},' +
    '"normal":{"best":7,"last":{"score":"8","outcome":"TERMINATED"}},"easy":{"best":-10,' +
    '"last":{"score":8,"outcome":"ESCAPED","encoreBonus":-1}},"unknown":{"best":9}},' +
    '"drift":{"impossible":{"best":9}},"unknown":{"hard":{"best":10}}},"sightseeing":{"orbit":{"last":{"score":5,"outcome":"BAD"}}}}';
  expect(parseRecords(raw)).toEqual({ version: 1, standard: { elsewhere: { normal: { best: 7, last: null },
    easy: { best: null, last: { score: 8, outcome: 'ESCAPED' } } } }, sightseeing: {} });
  expect(readRecords()).toEqual(emptyRecords());
  expect(() => writeRecords(emptyRecords())).not.toThrow();
});
