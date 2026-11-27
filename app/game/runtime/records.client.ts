import type { Difficulty, LastRun, LocalRecord, PlayMode, VolumeId } from '../contracts';
import { difficulties } from '../contracts';
import { difficultiesFor } from '../core/difficulty';
import { VOLUMES } from '../core/volumes';

export const RECORDS_KEY = 'sofaraway.records.v1';
export const RECORDS_LOCK = `${RECORDS_KEY}.write`;
const handoffStore = 'commits';
const allDifficulties = [...difficulties, 'impossible'] as const;
const daybreakRecordIds = ['drift', 'daybreak-skyglass', 'daybreak-crystal', 'daybreak-gameplay', 'daybreak-choreography'] as const;
const controlRecordId = 'descent-control';
const laserRecordId = 'descent-laser-security';
const choreographyRecordId = 'descent-laser-choreography';
const spiralRecordId = 'descent-spiral-junction';
const approachRecordId = 'descent-junction-approach';
const encoreRecordId = 'descent-encore';
const astralRecordId = 'orbit-astral-playable-v1';
const starwakeRecordId = 'orbit-starwake-aperture-v1';
const densityRecordId = 'orbit-starwake-density-v2';
const timedImpossibleIds = { daybreak: 'daybreak-impossible-timing', descent: 'descent-impossible-timing' } as const;
type RecordId = VolumeId | typeof daybreakRecordIds[number] | typeof controlRecordId | typeof laserRecordId
  | typeof choreographyRecordId | typeof spiralRecordId | typeof approachRecordId | typeof encoreRecordId | typeof astralRecordId | typeof starwakeRecordId | typeof densityRecordId
  | typeof timedImpossibleIds[keyof typeof timedImpossibleIds];

function recordId(volume: VolumeId, difficulty?: Difficulty): RecordId {
  if (volume === 'orbit') return densityRecordId;
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
    { id: starwakeRecordId, volume: 'orbit' },
    { id: densityRecordId, volume: 'orbit' },
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
    const supported = id === recordId(volume) || id === encoreRecordId || id === astralRecordId || id === starwakeRecordId ? difficultiesFor(volume)
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

function readRecordDocument(key: string, fallback = emptyRecords()) {
  try {
    return parseRecords(localStorage.getItem(key));
  } catch { return fallback; }
}

export function readRecords(fallback = emptyRecords()) { return readRecordDocument(RECORDS_KEY, fallback); }

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

interface RunRecordIntent {
  readonly volume: VolumeId;
  readonly difficulty: Difficulty;
  readonly mode: PlayMode;
  readonly last: LastRun;
}

function mergeHandoff(records: RecordsV1, raw: string) {
  const handoff = parseRecords(raw);
  for (const id of Object.keys(handoff.standard) as RecordId[]) {
    for (const difficulty of allDifficulties) {
      const previous = handoff.standard[id]?.[difficulty];
      if (!previous) continue;
      const entries = records.standard[id] ??= {};
      const current = entries[difficulty];
      entries[difficulty] = {
        best: previous.best === null ? current?.best ?? null : Math.max(previous.best, current?.best ?? 0),
        last: previous.last ?? current?.last ?? null,
      };
    }
  }
  Object.assign(records.sightseeing, handoff.sightseeing);
}

function openHandoff(name: string): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore(handoffStore); };
      let blocked = false;
      request.onblocked = () => { blocked = true; resolve(null); };
      request.onsuccess = () => {
        if (blocked) request.result.close();
        else resolve(request.result);
      };
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

// Web Locks serialize the callbacks, but a renderer may still see a stale localStorage cache.
// Carry the last successful V1 write across lock holders via a single IndexedDB row.
function withHandoff<T>(database: IDBDatabase, key: string, write: (previous?: string, publish?: (value: string) => void) => T): Promise<T> {
  return new Promise(resolve => {
    const transaction = database.transaction(handoffStore, 'readwrite');
    const store = transaction.objectStore(handoffStore);
    const request = store.get(key);
    let result: { value: T } | undefined;
    request.onsuccess = () => {
      const previous = typeof request.result === 'string' ? request.result : undefined;
      result = { value: write(previous, value => store.put(value, key)) };
    };
    transaction.oncomplete = () => resolve(result!.value);
    transaction.onabort = () => resolve(result ? result.value : write());
  });
}

export class RunRecordStore {
  private readonly key: string;
  private readonly lock: string;
  private tail = Promise.resolve();
  private readonly pending: RunRecordIntent[] = [];

  constructor(namespace = 'sofaraway') {
    this.key = `${namespace}.records.v1`;
    this.lock = `${this.key}.write`;
  }

  read() { return readRecordDocument(this.key); }

  commitRunRecord(intent: RunRecordIntent) {
    const completion = this.tail.then(() => this.commit(intent));
    this.tail = completion.then(() => {});
    return completion;
  }

  private async commit(intent: RunRecordIntent) {
    const { volume, difficulty, mode, last } = intent;
    const save = (previous?: string, publish?: (value: string) => void) => {
      try {
        const current = localStorage.getItem(this.key);
        const records = parseRecords(current);
        if (previous !== undefined && previous !== current) mergeHandoff(records, previous);
        for (const { volume, difficulty, mode, last } of this.pending) {
          recordRun(records, volume, difficulty, mode, last);
        }
        const newBest = recordRun(records, volume, difficulty, mode, last);
        const raw = JSON.stringify(records);
        localStorage.setItem(this.key, raw);
        this.pending.length = 0;
        try { publish?.(raw); } catch { /* The V1 document was saved even if the handoff is unavailable. */ }
        const localRecord = recordFor(publish ? records : readRecordDocument(this.key, records), volume, difficulty, mode);
        return { localRecord, newBest: newBest && localRecord.best === totalRunScore(last) };
      } catch { return null; }
    };

    const persist = async () => {
      try {
        const locks = globalThis.navigator?.locks;
        if (locks) {
          const handoff = await openHandoff(this.lock);
          try {
            return await locks.request(this.lock, { mode: 'exclusive' }, () => handoff ? withHandoff(handoff, this.key, save) : save());
          } finally { handoff?.close(); }
        }
      } catch { /* The lock API can be restricted by the browser. */ }
      // A fresh read and verification give best-effort persistence without a lock.
      return save();
    };
    const saved = await persist();
    if (!saved) this.pending.push(intent);
    return saved;
  }
}
