import { competition, RankError, rankFailure } from './leaderboard-contract';
import type { Board, LeaderboardPlatform, MyRank, Period, RankEntry, RankFailure } from './leaderboard-contract';
import type { RunSettlement } from '../app/game/runtime/run-settlement';
import { requestTimeout, retryBackoff, ToyRequestBudget } from './request-budget';

type Failure = { readonly kind: RankFailure; readonly retryAt: number };
type Read<T> = { status: 'loading' } | { status: 'ready'; value: T; expires: number } | { status: 'failed'; error: Failure };
interface BoardView {
  list?: Read<readonly RankEntry[]>;
  mine?: Read<MyRank>;
}
type Submission = { status: 'sending' } | { status: 'sent'; best: number } |
  { status: 'failed'; error: Failure; pending?: boolean };
interface Attempt {
  session: number;
  count: number;
  view: Submission;
}

const boardTtl = 120_000;
const unavailable = Infinity;
const loading = { status: 'loading' } as const;
export const leaderboardNow = () => Date.now();

export class LeaderboardClient {
  private readonly listeners = new Set<() => void>();
  private readonly cache = new Map<string, BoardView>();
  private readonly attempts = new WeakMap<RunSettlement, Attempt>();
  private readonly readFailures = new Map<string, number>();
  private session = 0;
  private version = 0;
  private operations = new AbortController();
  private wake?: ReturnType<typeof setTimeout>;
  private readonly deadlines = new Set<number>();

  constructor(private readonly platform?: LeaderboardPlatform, private readonly budget = new ToyRequestBudget()) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.version;

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  connect() {
    if (this.operations.signal.aborted) this.operations = new AbortController();
    const sync = () => this.syncSession();
    const off = this.platform?.subscribeSession(sync);
    const offBudget = this.budget.subscribe(() => this.changed());
    sync();
    return () => {
      off?.();
      offBudget();
      this.operations.abort();
      clearTimeout(this.wake);
      this.deadlines.clear();
      this.cache.clear();
      this.readFailures.clear();
    };
  }

  private syncSession() {
    const next = this.platform?.session() ?? 0;
    if (next === this.session) return;
    this.session = next;
    this.operations.abort();
    this.operations = new AbortController();
    this.cache.clear();
    this.readFailures.clear();
    this.changed();
  }

  private current(signal: AbortSignal) {
    if (signal.aborted) return false;
    this.syncSession();
    return !signal.aborted;
  }

  private notifyAt(at: number) {
    if (this.operations.signal.aborted || !Number.isFinite(at)) return;
    this.deadlines.add(at);
    clearTimeout(this.wake);
    this.wake = setTimeout(() => {
      const now = leaderboardNow();
      for (const deadline of this.deadlines) if (deadline <= now) this.deadlines.delete(deadline);
      this.changed();
      const next = Math.min(...this.deadlines);
      if (next < Infinity) this.notifyAt(next);
    }, Math.max(1, Math.ceil(Math.min(...this.deadlines) - leaderboardNow())));
  }

  private fail(error: unknown, count: number): Failure {
    const kind = rankFailure(error);
    if (kind === 'limited') return { kind, retryAt: this.budget.limit() };
    const retryAt = kind === 'unsupported' || kind === 'invalid' || kind === 'session' ? unavailable : leaderboardNow() + retryBackoff(count);
    this.notifyAt(retryAt);
    return { kind, retryAt };
  }

  get limited() { return this.budget.limited; }

  board(board: Board, period: Period): Readonly<BoardView> {
    return this.cache.get(`${board}/${period}`) ?? {};
  }

  read(board: Board, period: Period, { refresh = false, personal = true } = {}) {
    this.syncSession();
    const signal = this.operations.signal;
    if (signal.aborted || this.limited) return;
    const key = `${board}/${period}`;
    const entry = this.cache.get(key) ?? {};
    this.cache.set(key, entry);
    const request = <T>(part: keyof BoardView, previous: Read<T> | undefined, save: (state: Read<T>) => void,
      call: (signal: AbortSignal) => Promise<T>) => {
      const now = leaderboardNow();
      if (previous?.status === 'loading' ||
          previous?.status === 'ready' && !refresh && previous.expires > now ||
          previous?.status === 'failed' && (!refresh || previous.error.retryAt > now)) return;
      save(loading);
      const job = new AbortController();
      const countKey = `${key}/${part}`;
      const finish = (apply: () => void) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        if (job.signal.aborted) return;
        job.abort();
        if (!this.current(signal) || this.cache.get(key) !== entry) return;
        apply();
        this.changed();
      };
      const cancel = () => finish(() => {});
      const failed = (error: unknown) => finish(() => {
        const count = (this.readFailures.get(countKey) ?? 0) + 1;
        this.readFailures.set(countKey, count);
        save({ status: 'failed', error: this.fail(error, count) });
      });
      const timer = setTimeout(() => failed(new RankError('timeout')), requestTimeout);
      signal.addEventListener('abort', cancel, { once: true });
      void call(job.signal).then(value => finish(() => {
        this.readFailures.delete(countKey);
        save({ status: 'ready', value, expires: leaderboardNow() + boardTtl });
      }), failed);
    };
    request('list', entry.list, value => { entry.list = value; },
      job => this.platform?.list(board, period, job) ?? Promise.reject(new RankError('unsupported')));
    if (personal) request('mine', entry.mine, value => { entry.mine = value; },
      job => this.platform?.mine(board, period, job) ?? Promise.reject(new RankError('unsupported')));
    this.changed();
  }

  submission(run: RunSettlement): Submission | undefined {
    const attempt = this.attempts.get(run);
    if (attempt?.session === this.session) return attempt.view;
    if (!attempt || attempt.view.status === 'failed' &&
      (attempt.view.error.kind === 'login' || attempt.view.error.kind === 'permission')) return;
    return { status: 'failed', error: { kind: 'session', retryAt: unavailable } };
  }

  submit(run: RunSettlement) {
    this.syncSession();
    const candidate = competition(run), view = this.submission(run);
    const signal = this.operations.signal;
    if (candidate.board === undefined || signal.aborted || this.limited ||
      view?.status === 'sent' || view?.status === 'sending' ||
      view?.status === 'failed' && (view.pending || view.error.retryAt > leaderboardNow())) return;
    const { board, score } = candidate;
    const attempt: Attempt = { session: this.session, count: (this.attempts.get(run)?.count ?? 0) + 1, view: { status: 'sending' } };
    this.attempts.set(run, attempt);
    this.changed();
    const operation = new AbortController();
    const cancel = () => operation.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => {
      if (!this.current(signal)) return;
      attempt.view = { status: 'failed', error: this.fail(new RankError('timeout'), attempt.count), pending: true };
      cancel();
      this.changed();
    }, requestTimeout);
    void (this.platform?.submit(board, score, operation.signal) ?? Promise.reject(new RankError('unsupported'))).then(best => {
      if (!this.current(signal)) return;
      attempt.view = { status: 'sent', best };
      this.cache.delete(`${board}/all`);
      this.cache.delete(`${board}/week`);
    }, error => {
      if (!this.current(signal)) return;
      attempt.view = { status: 'failed', error: attempt.view.status === 'failed' && attempt.view.pending &&
        rankFailure(error) === 'session' ? attempt.view.error : this.fail(error, attempt.count) };
    }).finally(() => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      if (!this.operations.signal.aborted) this.changed();
    });
  }

  canSubmit(view: Submission | undefined) {
    return !this.limited && (view === undefined ||
      view.status === 'failed' && !view.pending && view.error.retryAt <= leaderboardNow());
  }
}
