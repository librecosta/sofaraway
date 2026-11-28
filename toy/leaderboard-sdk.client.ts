import { isSdkScore, leaderboardLimit, RankError } from './leaderboard-contract';
import type { Board, LeaderboardPlatform, MyRank, Period, RankEntry } from './leaderboard-contract';

type Ability = 'getRankList' | 'getMyRank' | 'submitScore';
export interface BilibiliRankSDK {
  getRankList(request: { board: Board; period: Period; limit: number }): Promise<RankEntry[]>;
  getMyRank(request: { board: Board; period: Period }): Promise<MyRank>;
  submitScore(request: { board: Board; score: number }): Promise<{ score: number }>;
}
type RankSDK = Partial<BilibiliRankSDK> & { isSupport?(ability: Ability): Promise<boolean> };

function classify(error: unknown) {
  if (error instanceof RankError) return error;
  const { type, code } = (error ?? {}) as { type?: string; code?: number };
  if (type === 'http_error' && code === 307044) return new RankError('limited');
  if (type === 'not_logged_in' || code === -101) return new RankError('login');
  if (type === 'user_denied' || type === 'no_permission' || type === 'age_restricted' ||
      code === 307059 || code === 307060 || code === 307078) return new RankError('permission');
  if (type === 'unsupported') return new RankError('unsupported');
  if (type === 'timeout') return new RankError('timeout');
  if (type === 'invalid_param') return new RankError('invalid');
  return new RankError('network');
}

function avatarUrl(value: string) {
  try {
    const url = new URL(value.startsWith('//') ? 'https:' + value : value);
    if (url.protocol === 'https:' && !url.username && !url.password && /(^|\.)hdslb\.com$/i.test(url.hostname)) return url.href;
  } catch { /* A missing avatar can be displayed as an initial. */ }
  return '';
}

export class BilibiliLeaderboard implements LeaderboardPlatform {
  private readonly probes = new Map<Ability, Promise<boolean>>();
  private readonly listeners = new Set<() => void>();
  private generation = 0;

  constructor(private readonly load: () => Promise<RankSDK | undefined>) {}

  subscribeSession = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  session = () => this.generation;

  private invalidateSession() {
    this.generation++;
    this.probes.clear();
    for (const listener of this.listeners) listener();
  }

  connect(signal: AbortSignal) {
    const invalidate = () => this.invalidateSession();
    signal.addEventListener('abort', invalidate, { once: true });
    window.addEventListener('pageshow', event => { if (event.persisted) invalidate(); }, { signal });
    window.cookieStore?.addEventListener('change', event => {
      if ([...event.changed, ...event.deleted].some(cookie => cookie.name === 'DedeUserID')) invalidate();
    }, { signal });
    // WebViews and embedded pages can hide account changes. A return starts a fresh cache epoch.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') invalidate();
    }, { signal });
    if (!window.cookieStore) window.addEventListener('focus', invalidate, { signal });
  }

  private async invoke<T>(ability: Ability, signal: AbortSignal, call: (sdk: RankSDK) => Promise<T>): Promise<T> {
    const start = this.session();
    try {
      const sdk = await this.load();
      if (signal.aborted || start !== this.session()) throw new RankError('session');
      if (!sdk?.isSupport || typeof sdk[ability] !== 'function') throw new RankError('unsupported');
      let probe = this.probes.get(ability);
      if (!probe) {
        probe = new Promise<boolean>((resolve, reject) => {
          const timer = setTimeout(() => reject(new RankError('timeout')), 2500);
          void Promise.resolve().then(() => sdk.isSupport!(ability)).then(resolve, reject).finally(() => clearTimeout(timer));
        });
        this.probes.set(ability, probe);
        void probe.catch(() => { if (this.probes.get(ability) === probe) this.probes.delete(ability); });
      }
      const supported = await probe;
      if (signal.aborted || start !== this.session()) throw new RankError('session');
      if (supported !== true) throw new RankError('unsupported');
      return await call(sdk);
    } catch (error) { throw classify(error); }
  }

  list(board: Board, period: Period, signal: AbortSignal) {
    return this.invoke('getRankList', signal, async sdk => {
      const entries = await sdk.getRankList!({ board, period, limit: leaderboardLimit });
      if (!Array.isArray(entries)) throw new RankError('network');
      return entries.slice(0, leaderboardLimit).filter(entry => entry && Number.isInteger(entry.rank) && entry.rank > 0 &&
        isSdkScore(entry.score) && typeof entry.nickname === 'string' && typeof entry.avatar === 'string')
        .map(entry => ({ ...entry, avatar: avatarUrl(entry.avatar) }));
    });
  }

  mine(board: Board, period: Period, signal: AbortSignal) {
    return this.invoke('getMyRank', signal, async sdk => {
      const result = await sdk.getMyRank!({ board, period });
      if (result?.ranked === false) return { ranked: false, rank: 0, score: 0 };
      if (result?.ranked === true && Number.isInteger(result.rank) && result.rank > 0 && isSdkScore(result.score)) return result;
      throw new RankError('network');
    });
  }

  submit(board: Board, score: number, signal: AbortSignal) {
    if (!isSdkScore(score) || score < 0) return Promise.reject(new RankError('invalid'));
    return this.invoke('submitScore', signal, async sdk => {
      const response = await sdk.submitScore!({ board, score });
      if (!isSdkScore(response?.score) || response.score < score) throw new RankError('network');
      return response.score;
    });
  }
}
