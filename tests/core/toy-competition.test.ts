import { afterEach, expect, test, vi } from 'vitest';
import type { GameOptions, RunResult, VolumeId } from '../../app/game/contracts';
import { branchLayout, ROUTE_GATE_MULTIPLIERS, routeSides } from '../../app/game/core/branches';
import { difficultySettings } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import { lanePoint } from '../../app/game/core/collision';
import { idleInput } from '../../app/game/core/input';
import { LUMEN_POINTS, RESONANCE_BONUS } from '../../app/game/core/pickups';
import { BOOST_MULTIPLIER, cruiseTarget } from '../../app/game/core/reference-track';
import { resolveRunPolicy } from '../../app/game/core/run-policy';
import { Simulation } from '../../app/game/core/simulation';
import { VOLUMES } from '../../app/game/core/volumes';
import type { RunSettlement } from '../../app/game/runtime/run-settlement';
import { LeaderboardClient } from '../../toy/leaderboard-client';
import { boards, competition, isSdkScore, RankError } from '../../toy/leaderboard-contract';
import type { LeaderboardPlatform } from '../../toy/leaderboard-contract';
import { BilibiliLeaderboard } from '../../toy/leaderboard-sdk.client';

const escaped: RunResult = { title: 'ESCAPED', route: 'main', accuracy: 1, rank: 'S', planned: 10,
  encountered: 10, passed: 10, unreached: 0, neutralized: 0 };
const selection = { volumeId: 'elsewhere', mode: 'standard', difficulty: 'normal' } as const;

function settled(select: Partial<typeof selection> & { autoBoost?: boolean } = {}): RunSettlement {
  return { id: 1, policy: resolveRunPolicy({ ...selection, ...select }, {}, 'run'), result: escaped,
    record: { outcome: 'ESCAPED', score: 12_345 } };
}

test('allocates four boards and passes the unchanged total for either Boost preference', () => {
  expect(boards).toEqual({ elsewhere: 1, daybreak: 2, descent: 3, orbit: 4 });
  for (const volumeId of Object.keys(boards) as VolumeId[]) {
    for (const autoBoost of [false, true]) {
      const run = settled({ autoBoost });
      const encore = { encountered: 4, passed: 3, missed: 1, clean: 2, neutralized: 0, combo: 1, maxCombo: 2, bonusScore: 800 };
      expect(competition({ ...run, policy: { ...run.policy, volumeId }, result: { ...escaped, encore },
        record: { ...run.record, encoreBonus: encore.bonusScore } })).toEqual({ board: boards[volumeId], score: 13_145 });
    }
  }
});

test('checks the actual route, outcome, both recovery counts and run policy', () => {
  const run = settled();
  expect(competition(run)).toEqual({ board: 1, score: 12345 });
  const ineligible = (result: Partial<RunResult>) => competition({ ...run, result: { ...escaped, ...result } });
  expect(ineligible({ title: 'TERMINATED' })).toEqual({ reason: 'finish' });
  for (const route of [undefined, 'challenge', 'score'] as const) expect(ineligible({ route })).toEqual({ reason: 'route' });
  expect(ineligible({ neutralized: 1 })).toEqual({ reason: 'recovery' });
  expect(ineligible({ encore: { encountered: 1, passed: 0, missed: 0, clean: 0, neutralized: 1,
    combo: 0, maxCombo: 0, bonusScore: 0 } })).toEqual({ reason: 'recovery' });
  for (const difficulty of ['easy', 'hard', 'impossible']) expect(competition({ ...run,
    policy: resolveRunPolicy({ ...selection, difficulty }, {}, 'run') })).toEqual({ reason: 'difficulty' });
  for (const mode of ['sightseeing', 'showcase']) expect(competition({ ...run,
    policy: resolveRunPolicy({ ...selection, mode }, {}, 'run') })).toEqual({ reason: 'mode' });
  for (const settings of [{ runSeed: 0 }, { runSeed: NaN }, { diagnostics: { boost: true } }]) {
    expect(competition({ ...run, policy: resolveRunPolicy(selection, settings as GameOptions, 'run') })).toEqual({ reason: 'policy' });
  }
  expect(competition({ ...run, policy: resolveRunPolicy(selection, {}, 'capture') })).toEqual({ reason: 'policy' });
});

test('uses the SDK integer boundaries and rejects inconsistent totals without altering them', () => {
  const run = settled();
  for (const allowed of [-16777216, 0, 16777215]) expect(isSdkScore(allowed)).toBe(true);
  for (const rejected of [-16777217, 16777216, .5, NaN, Infinity, null, '500']) expect(isSdkScore(rejected)).toBe(false);
  for (const score of [-1, 16777216, .5, NaN, Infinity])
    expect(competition({ ...run, record: { ...run.record, score } })).toEqual({ reason: 'score' });
  expect(competition({ ...run, record: { ...run.record, score: 16777215 } })).toEqual({ board: 1, score: 16777215 });
  const encore = { encountered: 1, passed: 1, clean: 1, missed: 0, neutralized: 0, combo: 1, maxCombo: 1, bonusScore: 300 };
  expect(competition({ ...run, result: { ...escaped, encore }, record: { ...run.record, score: 16777215, encoreBonus: 300 } }))
    .toEqual({ reason: 'score' });
  expect(competition({ ...run, result: { ...escaped, encore }, record: { ...run.record, encoreBonus: 0 } }))
    .toEqual({ reason: 'score' });
});

test('actual charts fit the SDK range, including a conservative boosted maximum', () => {
  const layouts = new Map<string, number>();
  for (let seed = 0; layouts.size < 2 && seed < 1000; seed++) {
    const layout = branchLayout(seed);
    layouts.set(routeSides.map(side => layout[side]).join('/'), seed);
  }
  expect(layouts.size).toBe(2);
  const limits = Object.fromEntries(VOLUMES.map(volume => {
    const { mult, speedFactor } = difficultySettings(volume, 'normal');
    const gateLimit = (100 * mult * 1.5 * 3.5 + 150 * mult) * ROUTE_GATE_MULTIPLIERS.main * (1 + RESONANCE_BONUS);
    const travelLimit = volume.beats * (60 / volume.bpm) * cruiseTarget(Infinity) * BOOST_MULTIPLIER * speedFactor * .35;
    const sim = new Simulation(volume);
    const max = Math.ceil(Math.max(...[...layouts.values()].map(seed => {
      sim.start('normal', seed, 'lumen');
      return sim.gatesTotal * gateLimit + travelLimit + LUMEN_POINTS.normal + (sim.outroPlan?.gates.length ?? 0) * 300;
    })));
    expect(isSdkScore(max)).toBe(true);
    sim.start('normal', 0, 'lumen');
    const gate = sim.mainGates[0];
    const [x, y] = lanePoint(gate.kind, gate.open, gate.axis);
    sim.camera.x = sim.camera.tx = x;
    sim.camera.y = sim.camera.ty = y;
    sim.distance = gate.routeStation - .01;
    sim.step(STEP, { ...idleInput, target: [x, y], boosting: true });
    expect(sim.gatesPassed).toBe(1);
    expect(sim.score).toBeGreaterThan(250);
    expect(sim.score).toBeLessThan(max);
    return [volume.id, max];
  }));
  expect(limits).toMatchInlineSnapshot(`
    {
      "daybreak": 175785,
      "descent": 231874,
      "elsewhere": 206174,
      "orbit": 139506,
    }
  `);
});

function stubPlatform() {
  let session = 0;
  let observe: () => void;
  const sdk = {
    session: () => session,
    subscribeSession(listener: () => void) { observe = listener; return () => {}; },
    list: vi.fn<LeaderboardPlatform['list']>().mockResolvedValue([]),
    mine: vi.fn<LeaderboardPlatform['mine']>().mockResolvedValue({ ranked: false, rank: 0, score: 0 }),
    submit: vi.fn<LeaderboardPlatform['submit']>().mockResolvedValue(12345),
  } satisfies LeaderboardPlatform;
  return { sdk, changeAccount() { session++; observe(); } };
}

afterEach(() => vi.useRealTimers());

test('deduplicates reads and writes, blocks retry during transport timeout, and sends a genuine retry once', async () => {
  vi.useFakeTimers();
  const { sdk } = stubPlatform();
  const client = new LeaderboardClient(sdk);
  const close = client.connect();
  client.read(1, 'all');
  client.read(1, 'all');
  client.read(1, 'week');
  await vi.advanceTimersByTimeAsync(10);
  client.read(1, 'all');
  expect(sdk.list).toHaveBeenCalledTimes(2);
  expect(sdk.mine).toHaveBeenCalledTimes(2);

  const run = settled();
  let rejectWrite!: (error: Error) => void;
  sdk.submit.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectWrite = reject; }));
  client.submit(run);
  client.submit(run);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(client.submission(run)).toMatchObject({ status: 'failed', pending: true });
  client.submit(run);
  expect(sdk.submit).toHaveBeenCalledTimes(1);
  rejectWrite(new RankError('network'));
  await vi.advanceTimersByTimeAsync(2000);
  client.submit(run);
  await vi.advanceTimersByTimeAsync(1000);
  client.submit(run);
  expect(sdk.submit).toHaveBeenCalledTimes(2);
  expect(sdk.submit.mock.calls.map(([board, score]) => [board, score])).toEqual([[1, 12345], [1, 12345]]);
  expect(client.submission(run)).toEqual({ status: 'sent', best: 12345 });
  expect(client.board(1, 'all')).toEqual({});
  expect(client.board(1, 'week')).toEqual({});
  close();
});

test('account changes and close discard previous replies and rate limits pause requests without polling', async () => {
  vi.useFakeTimers();
  const { sdk, changeAccount } = stubPlatform();
  const client = new LeaderboardClient(sdk);
  const close = client.connect();
  let late!: () => void;
  sdk.mine.mockImplementationOnce(() => new Promise(resolve => { late = () => resolve({ ranked: true, score: 99, rank: 1 }); }));
  client.read(1, 'all');
  changeAccount();
  late();
  await vi.advanceTimersByTimeAsync(10);
  expect(client.board(1, 'all')).toEqual({});
  sdk.list.mockRejectedValueOnce(new RankError('limited'));
  client.read(1, 'all');
  await vi.advanceTimersByTimeAsync(10);
  client.read(2, 'all');
  client.submit(settled());
  expect(sdk.list).toHaveBeenCalledTimes(2);
  expect(sdk.submit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(sdk.list).toHaveBeenCalledTimes(2);
  client.read(2, 'all');
  close();
  await vi.advanceTimersByTimeAsync(10);
  expect(client.board(2, 'all')).toEqual({});
});

test('adapts the official SDK call shape, permissions and errors', async () => {
  const sdk = {
    isSupport: vi.fn().mockResolvedValue(true),
    getRankList: vi.fn().mockResolvedValue([{ rank: 1, score: -4, nickname: 'Pilot', avatar: '//p0.hdslb.com/avatar.png' }]),
    getMyRank: vi.fn().mockResolvedValue({ ranked: true, rank: 1, score: 0 }),
    submitScore: vi.fn().mockResolvedValue({ score: 110 }),
  };
  const rank = new BilibiliLeaderboard(async () => sdk);
  const { signal } = new AbortController();
  expect(await rank.list(4, 'week', signal)).toEqual([{ rank: 1, score: -4, nickname: 'Pilot', avatar: 'https://p0.hdslb.com/avatar.png' }]);
  await rank.list(1, 'all', signal);
  expect(await rank.mine(2, 'all', signal)).toEqual({ ranked: true, rank: 1, score: 0 });
  expect(await rank.submit(3, 90, signal)).toBe(110);
  expect(sdk.getRankList.mock.calls).toEqual([[{ board: 4, period: 'week', limit: 100 }], [{ board: 1, period: 'all', limit: 100 }]]);
  expect(sdk.getMyRank).toHaveBeenCalledExactlyOnceWith({ board: 2, period: 'all' });
  expect(sdk.submitScore).toHaveBeenCalledExactlyOnceWith({ board: 3, score: 90 });
  for (const [error, kind] of [[{ type: 'http_error', code: 307044 }, 'limited'], [{ type: 'not_logged_in' }, 'login'],
    [{ type: 'user_denied' }, 'permission'], [{ type: 'no_permission', code: 307059 }, 'permission']] as const) {
    sdk.submitScore.mockRejectedValueOnce(error);
    await expect(rank.submit(1, 50, signal)).rejects.toMatchObject({ kind });
  }
  await expect(new BilibiliLeaderboard(async () => undefined).list(1, 'all', signal)).rejects.toMatchObject({ kind: 'unsupported' });
});
