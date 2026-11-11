import type { GameSnapshot } from '../game/contracts';
import { ROUTE_LABELS } from '../game/core/branches';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';

export function ResultsScreen({ snapshot, restart, menu }: {
  snapshot: GameSnapshot; restart(): void; menu(): void;
}) {
  return (
    <section id="over" className={c('screen', snapshot.phase !== 'results' && 'hidden')}>
      <div className={c('center')}>
        <div className={c('eyebrow')}><i /><span id="over-title">{snapshot.result?.title ?? 'RUN TERMINATED'}</span><i /></div>
        <div className={c('over-score')} id="over-score">{snapshot.score}</div>
        <div className={c('rank')} id="over-rank">{snapshot.result?.rank ?? 'C'}</div>
        {snapshot.result?.route && <div className={c('route-status')} id="over-route">
          {ROUTE_LABELS[snapshot.result.route]} ROUTE
        </div>}
        <div className={c('stats')}>
          <div><b id="over-gates">{snapshot.gatesPassed}/{snapshot.gatesTotal}</b><span>GATES</span></div>
          <div><b id="over-combo">{snapshot.maxCombo}</b><span>MAX LINK</span></div>
          <div><b id="over-acc">{Math.round((snapshot.result?.accuracy ?? 0) * 100)}%</b><span>ACCURACY</span></div>
        </div>
        <DecodeButton className={c('btn', 'start')} data-act="restart" onClick={restart} label="SPACE TO RUN AGAIN" />
        <DecodeButton className={c('btn', 'tiny')} data-act="menu" onClick={menu} label="BACK TO MENU" />
      </div>
    </section>
  );
}
