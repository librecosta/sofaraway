import { leaderboardLimit, RankError } from '../leaderboard-contract';
import type { Board, LeaderboardPlatform, Period, RankEntry } from '../leaderboard-contract';
import type { VolumeId } from '../../app/game/contracts';
import type { RouteKind } from '../../app/game/core/branches';
import { bestCourse } from '../../app/game/runtime/records.client';
import { encodeCloudBests } from '../cloud-save';
import type { CloudPlatform, ShareAction, SharePlatform } from '../player-services';

type MockAccount = 'pilot' | 'navigator' | 'guest' | 'denied';
type MockResponse = 'normal' | 'failure' | 'timeout' | 'limited';
const defaults = { account: 'pilot' as MockAccount, response: 'normal' as MockResponse, delay: 150,
  empty: false, available: true, fixture: 0, fixtureVolume: 'elsewhere' as VolumeId, fixtureRoute: 'main' as RouteKind,
  log: [] as readonly string[],
  cloud: 'normal' as 'normal' | 'conflict' | 'incompatible',
  sharing: 'all' as 'all' | 'entry' | 'unavailable' };
const names = ['Starwake', 'Blue Hour', 'Aperture', 'Low Orbit', 'Moonwake', 'Afterglow'];
const accountNames = { pilot: 'Mock Pilot', navigator: 'Mock Navigator' };
type MockScore = { readonly account: string; readonly score: number; readonly order: number };

export class MockLeaderboard implements LeaderboardPlatform, CloudPlatform, SharePlatform {
  private controls = defaults;
  private readonly changes = new Set<() => void>();
  private readonly sessionChanges = new Set<() => void>();
  private readonly scores = new Map<string, Map<string, MockScore>>();
  private readonly saves = new Map<string, string>();
  private resetId = 0;
  private order = names.length;
  private generation = 0;
  private fixtureId = 0;

  getControls = () => this.controls;
  session = () => this.generation;

  subscribe = (listener: () => void) => {
    this.changes.add(listener);
    return () => { this.changes.delete(listener); };
  };
  subscribeSession = (listener: () => void) => {
    this.sessionChanges.add(listener);
    return () => { this.sessionChanges.delete(listener); };
  };

  update(patch: Partial<typeof defaults>, invalidate = false) {
    const previous = this.controls;
    this.controls = { ...previous, ...patch };
    if (invalidate || previous.account !== this.controls.account || previous.empty !== this.controls.empty ||
      previous.available !== this.controls.available || previous.sharing !== this.controls.sharing) {
      this.generation++;
      for (const listener of this.sessionChanges) listener();
    }
    for (const listener of this.changes) listener();
  }

  showFixture() { this.update({ fixture: ++this.fixtureId }); }

  reset() {
    this.scores.clear();
    this.saves.clear();
    this.resetId++;
    this.order = names.length;
    this.update(defaults, true);
  }

  private async request<T>(label: string, signal: AbortSignal, call: (account: MockAccount) => T): Promise<T> {
    const { account, response, delay, available } = this.controls;
    this.update({ log: [...this.controls.log.slice(-9), label] });
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new RankError('session'));
      const timer = response !== 'timeout' ? setTimeout(() => {
        signal.removeEventListener('abort', cancel);
        resolve();
      }, delay) : undefined;
      function cancel() { clearTimeout(timer); reject(new RankError('session')); }
      signal.addEventListener('abort', cancel, { once: true });
    });
    if (signal.aborted) throw new RankError('session');
    if (!available) throw new RankError('unsupported');
    if (response === 'failure') throw new RankError('network');
    if (response === 'limited') throw new RankError('limited');
    return call(account);
  }

  private requireAccount(account: MockAccount) {
    if (account === 'guest') throw new RankError('login');
    if (account === 'denied') throw new RankError('permission');
    return account;
  }

  private sorted(board: Board, period: Period) {
    const seed = this.controls.empty ? [] : names.map((account, i) => ({ account, order: i,
      score: 131_500 + board * 2700 - i * 9600 - (period === 'week' ? 5306 : 0) }));
    return [...seed, ...(this.scores.get(`${board}/${period}`)?.values() ?? [])]
      .sort((left, right) => right.score - left.score || left.order - right.order);
  }

  list(board: Board, period: Period, signal: AbortSignal) {
    return this.request(`List board ${board}, ${period}`, signal, (): RankEntry[] =>
      this.sorted(board, period).slice(0, leaderboardLimit).map(({ account, score }, index) => ({
        rank: index + 1, score, nickname: accountNames[account as keyof typeof accountNames] ?? account, avatar: '',
      })));
  }

  mine(board: Board, period: Period, signal: AbortSignal) {
    return this.request(`My rank on board ${board}, ${period}`, signal, account => {
      const player = this.requireAccount(account);
      const sorted = this.sorted(board, period);
      const i = sorted.findIndex(item => item.account === player);
      return i < 0 ? { ranked: false, rank: 0, score: 0 } : { ranked: true, rank: i + 1, score: sorted[i].score };
    });
  }

  submit(board: Board, score: number, signal: AbortSignal) {
    return this.request(`Submit ${score} to board ${board}`, signal, account => {
      const player = this.requireAccount(account);
      let allBest = score;
      for (const period of ['all', 'week'] as const) {
        const key = `${board}/${period}`;
        const current = this.scores.get(key) ?? new Map<string, MockScore>();
        const best = current.get(player);
        if (!best || score > best.score) current.set(player, { account: player, score, order: ++this.order });
        this.scores.set(key, current);
        if (period === 'all') allBest = current.get(player)!.score;
      }
      return allBest;
    });
  }

  identity(signal: AbortSignal) {
    return this.request('Confirm cloud account', signal, account => `mock-${this.resetId}-${this.requireAccount(account)}`);
  }

  readCloud(signal: AbortSignal) {
    return this.request('Read personal cloud save', signal, account => {
      const player = this.requireAccount(account);
      if (this.controls.cloud === 'incompatible') return JSON.stringify({ version: 1, scoringVersion: 'expired', bests: [] });
      if (this.controls.cloud === 'conflict') return encodeCloudBests([{
        volume: 'elsewhere', difficulty: 'normal', course: bestCourse('elsewhere', 'normal')!,
        best: player === 'pilot' ? 142_001 : 73_002,
      }]);
      return this.saves.get(player) ?? null;
    });
  }

  writeCloud(value: string, signal: AbortSignal) {
    return this.request('Write personal cloud save', signal, account => { this.saves.set(this.requireAccount(account), value); });
  }

  async supportsShare(action: ShareAction, signal: AbortSignal) {
    return !signal.aborted && this.controls.available && (this.controls.sharing === 'all' ||
      this.controls.sharing === 'entry' && action === 'share');
  }

  resultNickname(signal: AbortSignal) {
    return this.request('Read result nickname', signal, account => accountNames[this.requireAccount(account)]);
  }

  shareResult(action: ShareAction, base64Data: string, signal: AbortSignal) {
    return this.request(`Share action: ${action}`, signal, () => {
      if (action !== 'share' && !base64Data.startsWith('iVBORw0KGgo')) throw new RankError('invalid');
    });
  }
}
