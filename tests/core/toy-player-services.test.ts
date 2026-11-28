import { afterEach, expect, test, vi } from 'vitest';
import { resolveRunPolicy } from '../../app/game/core/run-policy';
import { SCORING_RULES_VERSION } from '../../app/game/core/scoring';
import { bestCourse, recordFor, RunRecordStore } from '../../app/game/runtime/records.client';
import type { PersonalBest } from '../../app/game/runtime/records.client';
import type { RunSettlement } from '../../app/game/runtime/run-settlement';
import { createPlayerText } from '../../app/i18n/player-text';
import { CloudSaveClient, decodeCloudBests, encodeCloudBests, settledBest } from '../../toy/cloud-save';
import { LeaderboardClient } from '../../toy/leaderboard-client';
import { RankError } from '../../toy/leaderboard-contract';
import { cloudKey } from '../../toy/player-services';
import type { CloudPlatform } from '../../toy/player-services';
import { ToyRequestBudget } from '../../toy/request-budget';
import { canShareResult, resultCardDetails } from '../../toy/result-card';
import { BilibiliServices } from '../../toy/sdk-services.client';

const run: RunSettlement = {
  id: 1, scoringVersion: SCORING_RULES_VERSION,
  policy: resolveRunPolicy({ volumeId: 'daybreak', difficulty: 'normal', mode: 'standard', autoBoost: true }, { saveRecords: true }, 'run'),
  record: { score: 12_345, encoreBonus: 650, outcome: 'ESCAPED' },
  result: { title: 'ESCAPED', route: 'main', accuracy: .9, rank: 'A', planned: 10, encountered: 10,
    passed: 9, precision: 2, nearMiss: 3, unreached: 0, neutralized: 0,
    encore: { encountered: 3, passed: 2, precision: 1, nearMiss: 1, missed: 1, neutralized: 0, combo: 2, maxCombo: 2, bonusScore: 650 } },
};
const entry: PersonalBest = { volume: 'daybreak', difficulty: 'normal', course: bestCourse('daybreak', 'normal')!, best: 12_995 };
const other: PersonalBest = { volume: 'elsewhere', difficulty: 'hard', course: 'elsewhere', best: 765 };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function storage() {
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
}

test('the cloud document validates its keys, versions, course identities, and Best values', () => {
  expect(decodeCloudBests(null)).toEqual([]);
  expect(decodeCloudBests(encodeCloudBests([entry, other]))).toEqual([entry, other]);
  for (const raw of ['{', 'null', '[]', 'x'.repeat(4097), encodeCloudBests([{ ...entry, best: 1.5 }]),
    encodeCloudBests([{ ...entry, best: 2 ** 24 }]), encodeCloudBests([entry, entry])]) {
    expect(() => decodeCloudBests(raw)).toThrow();
  }
  expect(() => decodeCloudBests(encodeCloudBests([entry]).replace(SCORING_RULES_VERSION, 'precision-v2'))).toThrow();
  expect(() => decodeCloudBests(encodeCloudBests([{ ...entry, course: 'retired' }]))).toThrow();
});

test('only eligible settled Standard runs can earn cloud Bests and cards use the real total and quality counts', () => {
  expect(settledBest(run)).toEqual(entry);
  expect(settledBest({ ...run, record: { ...run.record, recovery: true } })).toBeUndefined();
  expect(settledBest({ ...run, policy: { ...run.policy, mode: 'sightseeing' } })).toBeUndefined();
  expect(settledBest({ ...run, policy: { ...run.policy, interactiveRandomRun: false } })).toBeUndefined();
  expect(canShareResult({ ...run, policy: { ...run.policy, allowSimulationDiagnostics: true } })).toBe(false);
  expect(canShareResult({ ...run, policy: { ...run.policy, mode: 'sightseeing' } })).toBe(true);
  expect(resultCardDetails(run, createPlayerText('zh-CN'))).toMatchObject({
    archive: 'VOL. II', volume: 'DAYBREAK', score: '12,995', rank: 'A', gradeLabel: '等级',
    metrics: [['通过率', '90%'], ['精准穿越', '3'], ['惊险穿越', '4']],
  });
  const failedSightseeing: RunSettlement = {
    ...run,
    policy: { ...run.policy, mode: 'sightseeing' },
    record: { score: 850, outcome: 'TERMINATED' },
    result: { ...run.result, title: 'TERMINATED', rank: 'C', route: undefined, encore: undefined, accuracy: .2 },
  };
  expect(resultCardDetails(failedSightseeing, createPlayerText('en'))).toMatchObject({
    outcome: 'TERMINATED', flight: expect.stringMatching(/SIGHTSEEING.*—/i), score: '850', rank: 'C', gradeLabel: 'GRADE',
  });
});

test('RecordStore merges concurrent Bests by maximum while preserving the device Last', async () => {
  storage();
  const first = new RunRecordStore('test-device');
  const second = new RunRecordStore('test-device');
  const last = { score: 80, outcome: 'TERMINATED' } as const;
  await first.commitRunRecord({ volume: 'daybreak', difficulty: 'normal', mode: 'standard', last });
  const signal = new AbortController().signal;
  await Promise.all([first.mergeBests([entry], signal), second.mergeBests([other, { ...entry, best: 55 }], signal)]);
  expect(first.readBests()).toEqual([other, entry]);
  expect(recordFor(first.read(), 'daybreak', 'normal', 'standard')).toEqual({ best: entry.best, last });
});

test('cloud writes require opt-in and a matching account at start, result, and manual sync', async () => {
  storage();
  let account = 'pilot', epoch = 0;
  const listeners = new Set<() => void>();
  const remote = new Map([['pilot', encodeCloudBests([{ ...entry, best: 90 }])], ['navigator', encodeCloudBests([other])]]);
  const platform: CloudPlatform = {
    session: () => epoch,
    subscribeSession: callback => { listeners.add(callback); return () => listeners.delete(callback); },
    identity: async () => account,
    readCloud: vi.fn(async () => remote.get(account) ?? null),
    writeCloud: vi.fn(async raw => { remote.set(account, raw); }),
  };
  const client = new CloudSaveClient(platform, 'test-opt-in', new ToyRequestBudget());
  const stop = client.connect();
  const change = (next: string) => { account = next; epoch++; for (const callback of listeners) callback(); };
  const settle = (settlement: RunSettlement) => { client.started(settlement.id); client.settled(settlement); };
  const sync = async () => {
    client.sync();
    await vi.waitFor(() => expect(client.view.status).toBe('ready'));
  };
  try {
    await new RunRecordStore('test-opt-in').commitRunRecord({ volume: 'orbit', difficulty: 'normal', mode: 'standard',
      last: { score: 500_000, outcome: 'ESCAPED' } });
    settle(run);
    expect(platform.readCloud).not.toHaveBeenCalled();
    client.sync();
    client.sync();
    await vi.waitFor(() => expect(client.scores[0]?.best).toBe(90));
    expect(platform.readCloud).toHaveBeenCalledTimes(1);
    expect(platform.writeCloud).not.toHaveBeenCalled();
    settle(run);
    // A foreground return expires the authorization. The same account can claim the pending flight.
    change('pilot');
    expect(client.scores).toEqual([]);
    await sync();
    expect(decodeCloudBests(remote.get('pilot')!)).toEqual([entry]);
    settle({ ...run, id: 2, record: { ...run.record, score: 15_000 } });
    change('navigator');
    await sync();
    expect(client.scores).toEqual([other]);
    expect(platform.writeCloud).toHaveBeenCalledTimes(1);
    expect(decodeCloudBests(remote.get('navigator')!)).toEqual([other]);
  } finally { stop(); }
});

test('a late read cannot import or write when the verified account changed without an event', async () => {
  storage();
  let resolveRead!: (value: string) => void;
  const read = new Promise<string>(resolve => { resolveRead = resolve; });
  let account = 'alpha';
  const platform: CloudPlatform = {
    session: () => 0, subscribeSession: () => () => {},
    identity: async () => account, readCloud: vi.fn(() => read), writeCloud: vi.fn(async () => {}),
  };
  const client = new CloudSaveClient(platform, 'test-stale', new ToyRequestBudget());
  const stop = client.connect();
  try {
    client.sync();
    await vi.waitFor(() => expect(platform.readCloud).toHaveBeenCalledOnce());
    account = 'beta';
    resolveRead(encodeCloudBests([entry]));
    await vi.waitFor(() => expect(client.view).toEqual({ status: 'failed', reason: 'session' }));
    expect(client.scores).toEqual([]);
    expect(client.authorized).toBe(false);
    expect(platform.writeCloud).not.toHaveBeenCalled();
  } finally { stop(); }
});

test('a timeout discards a late read and keeps retries single-flight until the original request settles', async () => {
  vi.useFakeTimers();
  let complete!: (value: string | null) => void;
  const wait = new Promise<string | null>(resolve => { complete = resolve; });
  const platform: CloudPlatform = {
    session: () => 0, subscribeSession: () => () => {},
    identity: async () => 'pilot', readCloud: vi.fn(() => wait), writeCloud: vi.fn(async () => {}),
  };
  const client = new CloudSaveClient(platform, 'test-timeout', new ToyRequestBudget());
  const stop = client.connect();
  try {
    client.sync();
    await vi.advanceTimersByTimeAsync(6000);
    expect(client.view).toEqual({ status: 'failed', reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(2000);
    client.sync();
    expect(platform.readCloud).toHaveBeenCalledTimes(1);
    complete(encodeCloudBests([entry]));
    await vi.advanceTimersByTimeAsync(0);
    expect(client.canSync).toBe(true);
    expect(client.scores).toEqual([]);
    expect(platform.writeCloud).not.toHaveBeenCalled();
  } finally { stop(); }
});

test('cloud rate limits share the leaderboard cooldown and prevent new budgeted traffic', async () => {
  const platform = new BilibiliServices(async () => ({
    isSupport: async () => true,
    getUserProfile: async () => ({ toyOpenId: 'pilot' }),
    getCloudStorage: async () => { throw { type: 'http_error', code: 307044 }; },
    getRankList: vi.fn(async () => []),
  }));
  const budget = new ToyRequestBudget();
  const cloud = new CloudSaveClient(platform, 'test-limits', budget);
  const ranks = new LeaderboardClient(platform, budget);
  const stopCloud = cloud.connect(), stopRanks = ranks.connect();
  try {
    cloud.sync();
    await vi.waitFor(() => expect(cloud.view).toEqual({ status: 'failed', reason: 'limited' }));
    expect(ranks.limited).toBe(true);
    ranks.read(1, 'all');
    expect(ranks.board(1, 'all')).toEqual({});
    expect(cloud.canSync).toBe(false);
  } finally { stopCloud(); stopRanks(); }
});

test('the SDK adapter uses the documented cloud and native sharing request shapes', async () => {
  const getCloudStorage = vi.fn(async () => ({ [cloudKey]: 'value' }));
  const setCloudStorage = vi.fn(async () => {});
  const sharePicture = vi.fn(async () => {});
  const saveImageToAlbum = vi.fn(async () => {});
  const share = vi.fn(async () => {});
  const supports = vi.fn(async () => true);
  const sdk = { isSupport: supports, getCloudStorage, setCloudStorage, sharePicture, saveImageToAlbum, share };
  const platform = new BilibiliServices(async () => ({ ...sdk, getUserProfile: async () => ({}) }));
  const signal = new AbortController().signal;
  await expect(platform.identity(signal)).rejects.toEqual(new RankError('permission'));
  await expect(platform.resultNickname(signal)).resolves.toBeNull();
  const sharingProfile = new BilibiliServices(async () => ({ ...sdk, getUserProfile: async () => ({ nickname: '  飞行员  ' }) }));
  await expect(sharingProfile.resultNickname(signal)).resolves.toBe('飞行员');
  await expect(platform.readCloud(signal)).resolves.toBe('value');
  expect(getCloudStorage).toHaveBeenCalledWith([cloudKey]);
  await platform.writeCloud('merged', signal);
  expect(setCloudStorage).toHaveBeenCalledWith({ [cloudKey]: 'merged' });
  await platform.shareResult('sharePicture', 'png', signal);
  await platform.shareResult('saveImageToAlbum', 'png', signal);
  await platform.shareResult('share', 'unused', signal);
  expect(sharePicture).toHaveBeenCalledWith({ base64Data: 'png' });
  expect(saveImageToAlbum).toHaveBeenCalledWith({ base64Data: 'png' });
  expect(share).toHaveBeenCalledWith({ path: 'index.html' });
  expect(supports).toHaveBeenCalledWith('getCloudStorage');
});
