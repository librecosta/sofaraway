import type { Difficulty, VolumeId } from '../app/game/contracts';
import { SCORING_RULES_VERSION } from '../app/game/core/scoring';
import { VOLUMES } from '../app/game/core/volumes';
import { bestCourse, RunRecordStore, totalRunScore } from '../app/game/runtime/records.client';
import type { PersonalBest } from '../app/game/runtime/records.client';
import type { RunSettlement } from '../app/game/runtime/run-settlement';
import { isSdkScore, RankError, rankFailure } from './leaderboard-contract';
import type { RankFailure } from './leaderboard-contract';
import type { CloudPlatform } from './player-services';
import { requestTimeout, retryBackoff, ToyRequestBudget } from './request-budget';

const maxDocumentLength = 4096;
const maxBests = 16;
const keyOf = ({ volume, difficulty }: PersonalBest) => `${volume}/${difficulty}`;
const volumes: readonly string[] = VOLUMES.map(volume => volume.id);
const validScore = (score: unknown): score is number => isSdkScore(score) && score >= 0;
class IncompatibleSave extends Error {}
class LocalSaveUnavailable extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RankError('invalid');
  return value as Record<string, unknown>;
}

export function decodeCloudBests(raw: string | null): PersonalBest[] {
  if (raw === null) return [];
  if (raw.length > maxDocumentLength) throw new RankError('invalid');
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new RankError('invalid'); }
  const { version, scoringVersion, bests } = object(data);
  if (!Number.isSafeInteger(version) || typeof scoringVersion !== 'string') throw new RankError('invalid');
  if (version !== 1 || scoringVersion !== SCORING_RULES_VERSION) throw new IncompatibleSave();
  if (!Array.isArray(bests) || bests.length > maxBests) throw new RankError('invalid');
  const seen = new Set<string>();
  return bests.map(item => {
    const { volume, difficulty, course, best } = object(item);
    if (typeof volume !== 'string' || !volumes.includes(volume) || typeof difficulty !== 'string' ||
      typeof course !== 'string' || !validScore(best)) throw new RankError('invalid');
    const entry = { volume: volume as VolumeId, difficulty: difficulty as Difficulty, course, best };
    if (bestCourse(entry.volume, entry.difficulty) !== course) throw new IncompatibleSave();
    const key = keyOf(entry);
    if (seen.has(key)) throw new RankError('invalid');
    seen.add(key);
    return entry;
  });
}

export function encodeCloudBests(bests: readonly PersonalBest[]) {
  return JSON.stringify({ version: 1, scoringVersion: SCORING_RULES_VERSION, bests });
}

export function settledBest(run: RunSettlement): PersonalBest | undefined {
  const { policy, result, record } = run;
  if (run.scoringVersion !== SCORING_RULES_VERSION || !policy.recordsEligible || !policy.scoring ||
    policy.mode !== 'standard' || !policy.interactiveRandomRun || policy.showcaseRoute !== null ||
    policy.allowSimulationDiagnostics || record.recovery || result.neutralized || result.encore?.neutralized ||
    record.outcome !== result.title || record.encoreBonus !== result.encore?.bonusScore ||
    !validScore(record.score) || record.encoreBonus !== undefined && !validScore(record.encoreBonus)) return;
  const { volumeId: volume, difficulty } = policy;
  const course = bestCourse(volume, difficulty);
  const best = totalRunScore(record);
  if (course && validScore(best)) return { volume, difficulty, course, best };
}

type Failure = RankFailure | 'incompatible' | 'localStorage';
type CloudState = { status: 'idle' | 'syncing' | 'ready' } | { status: 'failed'; reason: Failure };
type Account = { id: string; store: RunRecordStore };

async function accountStore(namespace: string, id: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  const scope = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  return new RunRecordStore(`${namespace}.cloud.${scope}`);
}

export class CloudSaveClient {
  private readonly listeners = new Set<() => void>();
  private session: number | undefined;
  private account?: Account;
  private activeRun?: number;
  private pendingOwner?: string;
  private readonly pending = new Map<string, PersonalBest>();
  private operation?: AbortController;
  private timeout?: ReturnType<typeof setTimeout>;
  private wake?: ReturnType<typeof setTimeout>;
  private retryAt = 0;
  private failures = 0;
  private version = 0;
  private bests: readonly PersonalBest[] = [];
  private state: CloudState = { status: 'idle' };

  constructor(private readonly platform: CloudPlatform | undefined, private readonly namespace: string,
    private readonly budget: ToyRequestBudget) {}

  getSnapshot = () => this.version;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  get view() { return this.state; }
  get scores() { return this.bests; }
  get authorized() { return !!this.account; }
  get available() { return !!this.platform; }
  get limited() { return this.budget.limited; }
  get canSync() { return this.available && !this.limited && !this.operation && Date.now() >= this.retryAt; }

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  connect() {
    const update = () => this.syncSession();
    this.session = this.platform?.session();
    const off = this.platform?.subscribeSession(update);
    const offBudget = this.budget.subscribe(() => this.changed());
    return () => {
      off?.();
      offBudget();
      this.clearAccount();
      this.clearPending();
      this.operation?.abort();
      clearTimeout(this.wake);
      clearTimeout(this.timeout);
    };
  }

  private clearAccount() {
    this.account = undefined;
    this.activeRun = undefined;
    this.bests = [];
  }

  private clearPending() {
    this.pendingOwner = undefined;
    this.pending.clear();
  }

  private syncSession() {
    const session = this.platform?.session();
    if (this.session === session) return;
    this.session = session;
    this.operation?.abort();
    this.clearAccount();
    clearTimeout(this.wake);
    this.retryAt = this.failures = 0;
    this.state = { status: 'idle' };
    this.changed();
  }

  started = (id: number) => {
    this.syncSession();
    this.activeRun = this.account ? id : undefined;
  };

  settled = (run: RunSettlement) => {
    this.syncSession();
    if (this.activeRun !== run.id || !this.account) return;
    this.activeRun = undefined;
    const entry = settledBest(run);
    if (!entry) return;
    if (this.pendingOwner !== this.account.id) this.clearPending();
    this.pendingOwner = this.account.id;
    const key = keyOf(entry);
    if ((this.pending.get(key)?.best ?? -1) < entry.best) this.pending.set(key, entry);
  };

  sync = () => {
    this.syncSession();
    const platform = this.platform;
    if (!platform || !this.canSync) return;
    const operation = new AbortController();
    const { signal } = operation;
    this.operation = operation;
    this.state = { status: 'syncing' };
    this.timeout = setTimeout(() => {
      operation.abort();
      this.fail('timeout');
    }, requestTimeout);
    this.changed();

    const checkSession = () => {
      this.syncSession();
      if (signal.aborted) throw new RankError('session');
      if (this.budget.limited) throw new RankError('limited');
    };
    void (async () => {
      const id = await platform.identity(signal);
      checkSession();
      if (this.account?.id !== id) this.clearAccount();
      if (this.pendingOwner !== id) this.clearPending();
      const remote = decodeCloudBests(await platform.readCloud(signal));
      checkSession();
      const store = this.account?.store ?? await accountStore(this.namespace, id);
      checkSession();
      // An SDK response can outlive an account switch. Verify ownership before persisting any Best.
      if (await platform.identity(signal) !== id) {
        this.clearAccount();
        throw new RankError('session');
      }
      checkSession();
      const scores = await store.mergeBests([...remote, ...this.pending.values()], signal);
      checkSession();
      if (!scores) throw new LocalSaveUnavailable();
      if (scores.some(entry => !validScore(entry.best))) throw new RankError('invalid');
      this.account = { id, store };
      this.bests = scores;
      this.clearPending();

      const previous = new Map(remote.map(entry => [keyOf(entry), entry.best]));
      if (scores.some(entry => entry.best > (previous.get(keyOf(entry)) ?? -1))) {
        // SDK writes take no account argument or revision. Keep one outstanding write and recheck the session.
        if (await platform.identity(signal) !== id) {
          this.clearAccount();
          throw new RankError('session');
        }
        checkSession();
        await platform.writeCloud(encodeCloudBests(scores), signal);
        checkSession();
      }
      this.failures = 0;
      this.state = { status: 'ready' };
    })().catch(error => {
      if (signal.aborted) return;
      const reason = error instanceof IncompatibleSave ? 'incompatible'
        : error instanceof LocalSaveUnavailable ? 'localStorage' : rankFailure(error);
      if (reason === 'session' || reason === 'login' || reason === 'permission') this.clearAccount();
      this.fail(reason);
    }).finally(() => {
      clearTimeout(this.timeout);
      this.operation = undefined;
      this.changed();
    });
  };

  private fail(reason: Failure) {
    this.retryAt = reason === 'limited' ? this.budget.limited ? this.budget.retryAt : this.budget.limit()
      : Date.now() + retryBackoff(++this.failures);
    this.state = { status: 'failed', reason };
    clearTimeout(this.wake);
    this.wake = setTimeout(() => this.changed(), Math.max(1, this.retryAt - Date.now()));
    this.changed();
  }
}
