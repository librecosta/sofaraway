import { useEffect, useState, useSyncExternalStore } from 'react';
import { ResultsScreen } from '../../app/components/ResultsScreen';
import { initialSnapshot } from '../../app/game/contracts';
import { resolveRunPolicy } from '../../app/game/core/run-policy';
import { ENCORE_BASE_POINTS, ENCORE_QUALITY_BONUS, SCORING_RULES_VERSION } from '../../app/game/core/scoring';
import type { RunSettlement } from '../../app/game/runtime/run-settlement';
import { PlayerLocaleProvider, useLocalePreference } from '../../app/i18n/PlayerLocale';
import { createPlayerSettings } from '../../app/game/runtime/settings.client';
import { classes as c } from '../../app/styles/classes';
import { CompetitiveResult } from '../Leaderboard';
import { LeaderboardClient } from '../leaderboard-client';
import { ToyPlayer } from '../ToyPlayer';
import { ResultShareButton, ResultSharePanel } from '../ResultShare';
import { readDevPlatform } from './bridge';
import type { MockLeaderboard } from './mock-leaderboard';

const settings = createPlayerSettings('sofaraway.bilibili.sofaraway.dev');
const encore = { encountered: 12, passed: 12, precision: 9, nearMiss: 2, missed: 0, neutralized: 0, combo: 12, maxCombo: 12,
  bonusScore: 12 * ENCORE_BASE_POINTS + 9 * ENCORE_QUALITY_BONUS.precision + 2 * ENCORE_QUALITY_BONUS.nearMiss };

function ResultFixture({ platform, id }: { platform: MockLeaderboard; id: number }) {
  const preference = useLocalePreference(settings, 'zh-CN');
  const [client] = useState(() => new LeaderboardClient(platform));
  const [sharing, setSharing] = useState(false);
  useEffect(() => client.connect(), [client]);
  const [run] = useState<RunSettlement>(() => ({
    id, scoringVersion: SCORING_RULES_VERSION,
    policy: resolveRunPolicy({ volumeId: 'elsewhere', mode: 'standard', difficulty: 'normal', autoBoost: true }, {}, 'run'),
    result: { title: 'ESCAPED', route: 'main', accuracy: .99, rank: 'S', planned: 180, encountered: 180,
      passed: 179, precision: 103, nearMiss: 19, unreached: 0, neutralized: 0, encore },
    record: { score: 128_720, outcome: 'ESCAPED', encoreBonus: encore.bonusScore },
  }));
  const snapshot = { ...initialSnapshot, phase: 'results' as const, result: run.result, score: run.record.score,
    gatesPassed: run.result.passed, gatesTotal: run.result.planned, maxCombo: 75,
    localRecord: { best: 149_120, last: null } };

  return <PlayerLocaleProvider {...preference}>
    <main className={c('viewport')} style={{ background: 'radial-gradient(ellipse at 50% 30%, #18323b, #071216 65%)' }}>
      <div inert={sharing}>
        <ResultsScreen snapshot={snapshot} restart={() => platform.showFixture()} menu={() => platform.update({ fixture: 0 })}>
          <CompetitiveResult client={client} run={run} snapshot={snapshot} />
          <ResultShareButton run={run} open={() => setSharing(true)} />
        </ResultsScreen>
      </div>
      {sharing && <ResultSharePanel run={run} platform={platform} close={() => setSharing(false)} />}
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
