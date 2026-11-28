import { useEffect, useState, useSyncExternalStore } from 'react';
import { ResultsScreen } from '../../app/components/ResultsScreen';
import { initialSnapshot } from '../../app/game/contracts';
import { resolveRunPolicy } from '../../app/game/core/run-policy';
import type { RunSettlement } from '../../app/game/runtime/run-settlement';
import { PlayerLocaleProvider, useLocalePreference } from '../../app/i18n/PlayerLocale';
import { createPlayerSettings } from '../../app/game/runtime/settings.client';
import { classes as c } from '../../app/styles/classes';
import { CompetitiveResult, LeaderboardPanel } from '../Leaderboard';
import { LeaderboardClient } from '../leaderboard-client';
import { ToyPlayer } from '../ToyPlayer';
import { readDevPlatform } from './bridge';
import type { MockLeaderboard } from './mock-leaderboard';

const settings = createPlayerSettings('sofaraway.bilibili.sofaraway.dev');

function ResultFixture({ platform, id }: { platform: MockLeaderboard; id: number }) {
  const preference = useLocalePreference(settings, 'zh-CN');
  const [client] = useState(() => new LeaderboardClient(platform));
  const [board, setBoard] = useState(false);
  useEffect(() => client.connect(), [client]);
  const [run] = useState<RunSettlement>(() => ({
    id, policy: resolveRunPolicy({ volumeId: 'elsewhere', mode: 'standard', difficulty: 'normal', autoBoost: true }, {}, 'run'),
    result: { title: 'ESCAPED', route: 'main', accuracy: .99, rank: 'S', planned: 180, encountered: 180,
      passed: 179, unreached: 0, neutralized: 0, encore: { encountered: 12, passed: 12, clean: 12,
        missed: 0, neutralized: 0, combo: 12, maxCombo: 12, bonusScore: 3600 } },
    record: { score: 128_720, outcome: 'ESCAPED', encoreBonus: 3600 },
  }));
  const snapshot = { ...initialSnapshot, phase: 'results' as const, result: run.result, score: run.record.score,
    gatesPassed: run.result.passed, gatesTotal: run.result.planned, maxCombo: 75,
    localRecord: { best: 149_120, last: null } };

  return <PlayerLocaleProvider {...preference}>
    <main className={c('viewport')} style={{ background: 'radial-gradient(ellipse at 50% 30%, #18323b, #071216 65%)' }}>
      <div inert={board}>
        <ResultsScreen snapshot={snapshot} restart={() => platform.showFixture()} menu={() => platform.update({ fixture: 0 })}>
          <CompetitiveResult client={client} run={run} snapshot={snapshot} open={() => setBoard(true)} />
        </ResultsScreen>
      </div>
      {board && <LeaderboardPanel client={client} initialVolume="elsewhere" close={() => setBoard(false)} />}
    </main>
  </PlayerLocaleProvider>;
}

export function DevPlayer() {
  const platform = readDevPlatform();
  if (platform) return <DevSession platform={platform} />;
  return <ToyPlayer />;
}

function DevSession({ platform }: { platform: NonNullable<ReturnType<typeof readDevPlatform>> }) {
  const { fixture } = useSyncExternalStore(platform.leaderboard.subscribe, platform.leaderboard.getControls);
  const { lifecycle } = useSyncExternalStore(platform.subscribe, platform.getSnapshot);
  if (fixture && lifecycle !== 'closed') return <ResultFixture key={fixture} platform={platform.leaderboard} id={fixture} />;
  return <ToyPlayer platform={platform} />;
}
