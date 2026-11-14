import type { Difficulty, LastRun, LocalRecord, PlayMode, VolumeId } from '../contracts';
import { difficultiesFor } from '../core/difficulty';
import { VOLUMES } from '../core/volumes';

export const RECORDS_KEY = 'sofaraway.records.v1';
type RecordId = VolumeId | 'daybreak';
const recordId = (volume: VolumeId): RecordId => volume === 'drift' ? 'daybreak' : volume;

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
  const ids: RecordId[] = [...VOLUMES.map(volume => volume.id), 'daybreak'];
  for (const id of ids) {
    const entries = object(standard[id]);
    for (const difficulty of difficultiesFor(id === 'daybreak' ? 'drift' : id)) {
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
  const id = recordId(volume);
  if (mode === 'sightseeing') return { best: null, last: records.sightseeing[id]?.last ?? null };
  return records.standard[id]?.[difficulty] ?? { best: null, last: null };
}

export function recordRun(records: RecordsV1, volume: VolumeId, difficulty: Difficulty, mode: PlayMode, last: LastRun) {
  if (mode === 'sightseeing') {
    records.sightseeing[recordId(volume)] = { last };
    return false;
  }
  const { best } = recordFor(records, volume, difficulty, mode);
  const total = totalRunScore(last);
  const newBest = !last.recovery && (best === null || total > best);
  (records.standard[recordId(volume)] ??= {})[difficulty] = { best: newBest ? total : best, last };
  return newBest;
}

export function writeRecords(records: RecordsV1) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    return true;
  } catch { return false; }
}
