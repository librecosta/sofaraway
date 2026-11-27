import { expect, test, vi } from 'vitest';
import { difficultiesFor } from '../../app/game/core/difficulty';
import { VOLUMES } from '../../app/game/core/volumes';
import { emptyRecords, parseRecords, readRecords, recordFor, recordRun, RunRecordStore } from '../../app/game/runtime/records.client';

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

test('DAYBREAK choreography records remain independent of all legacy charts after a round trip', () => {
  const last = { score: 800, outcome: 'ESCAPED' } as const;
  const legacy = { standard: { drift: { normal: { best: 1200, last } }, daybreak: { normal: { best: 1900, last } } },
    sightseeing: { drift: { last }, daybreak: { last }, 'daybreak-skyglass': { last } } };
  const skyglass = { normal: { best: 2500, last } };
  const crystal = { normal: { best: 3200, last } };
  const gameplay = { normal: { best: 4100, last } };
  const records = parseRecords(JSON.stringify({ version: 1, ...legacy,
    standard: { ...legacy.standard, 'daybreak-skyglass': skyglass, 'daybreak-crystal': crystal, 'daybreak-gameplay': gameplay } }));
  expect(recordFor(records, 'daybreak', 'normal', 'standard')).toEqual({ best: null, last: null });
  expect(recordFor(records, 'daybreak', 'normal', 'sightseeing').last).toBeNull();
  const daybreak = { ...last, score: 400 };
  expect(recordRun(records, 'daybreak', 'normal', 'standard', daybreak)).toBe(true);
  const impossible = { ...last, score: 800, encoreBonus: 300 };
  expect(recordRun(records, 'daybreak', 'impossible', 'standard', impossible)).toBe(true);
  recordRun(records, 'daybreak', 'normal', 'sightseeing', daybreak);
  const reloaded = parseRecords(JSON.stringify(records));
  expect(reloaded.standard.drift).toEqual(legacy.standard.drift);
  expect(reloaded.sightseeing.drift).toEqual(legacy.sightseeing.drift);
  expect(reloaded.standard.daybreak).toEqual(legacy.standard.daybreak);
  expect(reloaded.sightseeing.daybreak).toEqual(legacy.sightseeing.daybreak);
  expect(reloaded.standard['daybreak-skyglass']).toEqual(skyglass);
  expect(reloaded.standard['daybreak-crystal']).toEqual(crystal);
  expect(reloaded.standard['daybreak-gameplay']).toEqual(gameplay);
  expect(reloaded.sightseeing['daybreak-skyglass']).toEqual(legacy.sightseeing['daybreak-skyglass']);
  expect(recordFor(reloaded, 'daybreak', 'normal', 'standard')).toEqual({ best: 400, last: daybreak });
  expect(recordFor(reloaded, 'daybreak', 'impossible', 'standard')).toEqual({ best: 1100, last: impossible });
  expect(recordFor(reloaded, 'daybreak', 'normal', 'sightseeing').last).toEqual(daybreak);
});

test('the DESCENT junction approach records preserve the original spiral junction and earlier charts', () => {
  const old = { score: 119039, outcome: 'ESCAPED' } as const;
  const control = { ...old, score: 79234 };
  const laser = { ...old, score: 76834 };
  const choreography = { ...old, score: 131315 };
  const spiral = { ...old, score: 130250 };
  const legacy = { standard: { descent: { normal: { best: old.score, last: old } },
    'descent-control': { normal: { best: control.score, last: control } },
    'descent-laser-security': { normal: { best: laser.score, last: laser } },
    'descent-laser-choreography': { normal: { best: choreography.score, last: choreography } },
    'descent-spiral-junction': { normal: { best: spiral.score, last: spiral } } },
    sightseeing: { descent: { last: old }, 'descent-control': { last: control },
      'descent-laser-security': { last: laser }, 'descent-laser-choreography': { last: choreography },
      'descent-spiral-junction': { last: spiral } } };
  const records = parseRecords(JSON.stringify({ version: 1, ...legacy }));
  expect(recordFor(records, 'descent', 'normal', 'standard')).toEqual({ best: null, last: null });
  expect(recordFor(records, 'descent', 'normal', 'sightseeing').last).toBeNull();
  const current = { score: 131315, outcome: 'ESCAPED' } as const;
  expect(recordRun(records, 'descent', 'normal', 'standard', current)).toBe(true);
  const impossible = { score: 310000, outcome: 'ESCAPED' } as const;
  const lastImpossible = { score: 750, outcome: 'TERMINATED' } as const;
  expect(recordRun(records, 'descent', 'impossible', 'standard', impossible)).toBe(true);
  expect(recordRun(records, 'descent', 'impossible', 'standard', lastImpossible)).toBe(false);
  recordRun(records, 'descent', 'normal', 'sightseeing', current);
  const reloaded = parseRecords(JSON.stringify(records));
  expect(reloaded.standard.descent).toEqual(legacy.standard.descent);
  expect(reloaded.sightseeing.descent).toEqual(legacy.sightseeing.descent);
  expect(reloaded.standard['descent-control']).toEqual(legacy.standard['descent-control']);
  expect(reloaded.sightseeing['descent-control']).toEqual(legacy.sightseeing['descent-control']);
  expect(reloaded.standard['descent-laser-security']).toEqual(legacy.standard['descent-laser-security']);
  expect(reloaded.sightseeing['descent-laser-security']).toEqual(legacy.sightseeing['descent-laser-security']);
  expect(reloaded.standard['descent-laser-choreography']).toEqual(legacy.standard['descent-laser-choreography']);
  expect(reloaded.sightseeing['descent-laser-choreography']).toEqual(legacy.sightseeing['descent-laser-choreography']);
  expect(reloaded.standard['descent-spiral-junction']).toEqual(legacy.standard['descent-spiral-junction']);
  expect(reloaded.sightseeing['descent-spiral-junction']).toEqual(legacy.sightseeing['descent-spiral-junction']);
  expect(recordFor(reloaded, 'descent', 'normal', 'standard')).toEqual({ best: current.score, last: current });
  expect(recordFor(reloaded, 'descent', 'impossible', 'standard')).toEqual({ best: impossible.score, last: lastImpossible });
  expect(recordFor(reloaded, 'descent', 'normal', 'sightseeing').last).toEqual(current);
});

test.each([
  ['daybreak', 'daybreak-choreography', 'daybreak-impossible-timing', 'daybreak-impossible-timing'],
  ['descent', 'descent-junction-approach', 'descent-impossible-timing', 'descent-encore'],
] as const)('%s keeps earlier Impossible results in storage across changes', (volume, earlier, timed, current) => {
  const last = { score: 180000, outcome: 'ESCAPED' } as const;
  const standard = { [earlier]: { impossible: { best: last.score, last }, hard: { best: 98000, last: null } } };
  const records = parseRecords(JSON.stringify({ version: 1, standard }));
  expect(recordFor(records, volume, 'impossible', 'standard')).toEqual({ best: null, last: null });
  const newRun = { ...last, score: 135000 };
  expect(recordRun(records, volume, 'impossible', 'standard', newRun)).toBe(true);
  const restored = parseRecords(JSON.stringify(records));
  expect(restored.standard[earlier]).toEqual(standard[earlier]);
  expect(restored.standard[current]).toEqual({ impossible: { best: newRun.score, last: newRun } });
  expect(recordFor(restored, volume, 'hard', 'standard').best).toBe(volume === 'descent' ? null : 98000);
});

test('DESCENT keeps both retired Standard records and the active Sightseeing last run', () => {
  const last = { score: 175000, outcome: 'ESCAPED' } as const;
  const standard = {
    'descent-junction-approach': { normal: { best: last.score, last } },
    'descent-impossible-timing': { impossible: { best: last.score, last } },
  };
  const sightseeing = { 'descent-junction-approach': { last } };
  const records = parseRecords(JSON.stringify({ version: 1, standard, sightseeing }));
  const newRun = { ...last, encoreBonus: 800 };
  expect(recordFor(records, 'descent', 'normal', 'standard').best).toBeNull();
  expect(recordFor(records, 'descent', 'impossible', 'standard').best).toBeNull();
  recordRun(records, 'descent', 'impossible', 'standard', newRun);
  const restored = parseRecords(JSON.stringify(records));
  expect(restored.standard['descent-junction-approach']).toEqual(standard['descent-junction-approach']);
  expect(restored.standard['descent-impossible-timing']).toEqual(standard['descent-impossible-timing']);
  expect(recordFor(restored, 'descent', 'impossible', 'standard')).toEqual({ best: 175800, last: newRun });
  expect(recordFor(restored, 'descent', 'normal', 'sightseeing').last).toEqual(last);
});

test('records reject invalid or unknown storage values and tolerate a missing browser', async () => {
  for (const raw of [null, '{bad', 'null', '[]', '{"version":2}', '{"version":"1"}']) expect(parseRecords(raw)).toEqual(emptyRecords());
  const raw = '{"version":1,"standard":{"elsewhere":{"hard":{"best":1e999,"last":{"score":-1,"outcome":"ESCAPED"}},' +
    '"normal":{"best":7,"last":{"score":"8","outcome":"TERMINATED"}},"easy":{"best":-10,' +
    '"last":{"score":8,"outcome":"ESCAPED","encoreBonus":-1}},"unknown":{"best":9}},' +
    '"drift":{"impossible":{"best":9}},"unknown":{"hard":{"best":10}}},"sightseeing":{"orbit":{"last":{"score":5,"outcome":"BAD"}}}}';
  expect(parseRecords(raw)).toEqual({ version: 1, standard: { elsewhere: { normal: { best: 7, last: null },
    easy: { best: null, last: { score: 8, outcome: 'ESCAPED' } } } }, sightseeing: {} });
  expect(readRecords()).toEqual(emptyRecords());
  await expect(new RunRecordStore().commitRunRecord({ volume: 'elsewhere', difficulty: 'normal', mode: 'standard',
    last: { score: 100, outcome: 'ESCAPED' } })).resolves.toBeNull();
});

test('a failed save retries its intent against fresh storage and never writes after a blocked read', async () => {
  let raw: string | null = null;
  let readsBlocked = false, writesBlocked = true;
  const setItem = vi.fn((_key: string, value: string) => {
    if (writesBlocked) throw new Error('Write blocked');
    raw = value;
  });
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('localStorage', { setItem, getItem: () => {
    if (readsBlocked) throw new Error('Read blocked');
    return raw;
  } });
  const store = new RunRecordStore();
  const submit = (score: number, recovery = false) => store.commitRunRecord({ volume: 'elsewhere', difficulty: 'normal',
    mode: 'standard', last: { score, outcome: 'ESCAPED', ...(recovery ? { recovery } : {}) } });
  try {
    await expect(submit(300)).resolves.toBeNull();
    expect(raw).toBeNull();
    raw = JSON.stringify({ version: 1, standard: {
      elsewhere: { normal: { best: 200, last: { score: 200, outcome: 'ESCAPED' } } },
      drift: { normal: { best: 90, last: { score: 80, outcome: 'ESCAPED', encoreBonus: 10 } } },
      'orbit-starwake-density-v2': { easy: { best: 50, last: null } },
    }, sightseeing: {} });
    readsBlocked = true;
    writesBlocked = false;
    await expect(submit(400, true)).resolves.toBeNull();
    expect(setItem).toHaveBeenCalledTimes(1);
    readsBlocked = false;
    await expect(submit(100)).resolves.toEqual({ localRecord: { best: 300, last: { score: 100, outcome: 'ESCAPED' } }, newBest: false });
    const records = readRecords();
    expect(records.standard.drift?.normal?.best).toBe(90);
    expect(recordFor(records, 'orbit', 'easy', 'standard').best).toBe(50);
    await expect(submit(800, true)).resolves.toEqual({ localRecord: { best: 300,
      last: { score: 800, outcome: 'ESCAPED', recovery: true } }, newBest: false });
    expect(setItem).toHaveBeenCalledTimes(3);
  } finally { vi.unstubAllGlobals(); }
});
