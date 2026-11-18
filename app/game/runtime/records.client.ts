import type { Difficulty, LastRun, LocalRecord, PlayMode, VolumeId } from '../contracts';
import { difficulties } from '../contracts';
import { difficultiesFor } from '../core/difficulty';
import { VOLUMES } from '../core/volumes';

export const RECORDS_KEY = 'sofaraway.records.v1';
const daybreakRecordIds = ['drift', 'daybreak-skyglass', 'daybreak-crystal', 'daybreak-gameplay', 'daybreak-choreography'] as const;
const controlRecordId = 'descent-control';
const laserRecordId = 'descent-laser-security';
const choreographyRecordId = 'descent-laser-choreography';
const spiralRecordId = 'descent-spiral-junction';
const approachRecordId = 'descent-junction-approach';
const encoreRecordId = 'descent-encore';
const astralRecordId = 'orbit-astral-playable-v1';
const timedImpossibleIds = { daybreak: 'daybreak-impossible-timing', descent: 'descent-impossible-timing' } as const;
type RecordId = VolumeId | typeof daybreakRecordIds[number] | typeof controlRecordId | typeof laserRecordId
  | typeof choreographyRecordId | typeof spiralRecordId | typeof approachRecordId | typeof encoreRecordId | typeof astralRecordId
  | typeof timedImpossibleIds[keyof typeof timedImpossibleIds];

function recordId(volume: VolumeId, difficulty?: Difficulty): RecordId {
  if (volume === 'orbit') return astralRecordId;
  if (volume === 'descent' && difficulty !== undefined) return encoreRecordId;
  if (difficulty === 'impossible' && volume === 'daybreak') return timedImpossibleIds.daybreak;
  return volume === 'daybreak' ? 'daybreak-choreography' : volume === 'descent' ? approachRecordId : volume;
}

interface RecordsV1 {
  version: 1;
  standard: Partial<Record<RecordId, Partial<Record<Difficulty, LocalRecord>>>>;
  sightseeing: Partial<Record<RecordId, { last: LastRun | null }>>;
}

export function emptyRecords(): RecordsV1 { return { version: 1, standard: {}, sightseeing: {} }; }

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function score(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function lastRun(value: unknown): LastRun | null {
  const { score: points, outcome, encoreBonus, recovery } = object(value);
  if (!score(points) || (outcome !== 'ESCAPED' && outcome !== 'TERMINATED')) return null;
  return { score: points, outcome, ...(score(encoreBonus) && score(points + encoreBonus) ? { encoreBonus } : {}),
    ...(recovery === true ? { recovery } : {}) };
}

export function totalRunScore(run: LastRun) { return run.score + (run.encoreBonus ?? 0); }

export function parseRecords(raw: string | null): RecordsV1 {
  const records = emptyRecords();
  let source;
  try { source = object(JSON.parse(raw ?? 'null')); } catch { return records; }
  if (source.version !== 1) return records;
  const standard = object(source.standard), sightseeing = object(source.sightseeing);
  const ids: { id: RecordId; volume: VolumeId }[] = [
    ...VOLUMES.map(({ id }) => ({ id, volume: id })),
    { id: astralRecordId, volume: 'orbit' },
    ...daybreakRecordIds.map(id => ({ id, volume: 'daybreak' as const })),
    { id: controlRecordId, volume: 'descent' },
    { id: laserRecordId, volume: 'descent' },
    { id: choreographyRecordId, volume: 'descent' },
    { id: spiralRecordId, volume: 'descent' },
    { id: approachRecordId, volume: 'descent' },
    { id: encoreRecordId, volume: 'descent' },
    { id: timedImpossibleIds.daybreak, volume: 'daybreak' },
    { id: timedImpossibleIds.descent, volume: 'descent' },
  ];
  for (const { id, volume } of ids) {
    const entries = object(standard[id]);
    const priorImpossible = id === timedImpossibleIds.daybreak || id === timedImpossibleIds.descent;
    const supported = id === recordId(volume) || id === encoreRecordId ? difficultiesFor(volume)
      : priorImpossible ? ['impossible'] as const : difficulties;
    for (const difficulty of supported) {
      const entry = object(entries[difficulty]);
      let best = score(entry.best) ? entry.best : null;
      const last = lastRun(entry.last);
      // Older Best entries stored the main score. Last still has the recorded bonus.
      if (last?.encoreBonus && !last.recovery) best = Math.max(best ?? 0, totalRunScore(last));
      if (best !== null || last) (records.standard[id] ??= {})[difficulty] = { best, last };
    }
    const last = lastRun(object(sightseeing[id]).last);
    if (last) records.sightseeing[id] = { last };
  }
  return records;
}

export function readRecords(fallback = emptyRecords()) {
  try {
    return parseRecords(localStorage.getItem(RECORDS_KEY));
  } catch { return fallback; }
}

export function recordFor(records: RecordsV1, volume: VolumeId, difficulty: Difficulty, mode: PlayMode): LocalRecord {
  if (mode === 'sightseeing') return { best: null, last: records.sightseeing[recordId(volume)]?.last ?? null };
  return records.standard[recordId(volume, difficulty)]?.[difficulty] ?? { best: null, last: null };
}

export function recordRun(records: RecordsV1, volume: VolumeId, difficulty: Difficulty, mode: PlayMode, last: LastRun) {
  if (mode === 'sightseeing') {
    records.sightseeing[recordId(volume)] = { last };
    return false;
  }
  const { best } = recordFor(records, volume, difficulty, mode);
  const total = totalRunScore(last);
  const newBest = !last.recovery && (best === null || total > best);
  (records.standard[recordId(volume, difficulty)] ??= {})[difficulty] = { best: newBest ? total : best, last };
  return newBest;
}

export function writeRecords(records: RecordsV1) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    return true;
  } catch { return false; }
}
