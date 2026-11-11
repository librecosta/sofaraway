import type { GameSnapshot } from '../game/contracts';
import { classes as c } from '../styles/classes';

export function ResultsScreen({ snapshot, restart, menu }: {
  snapshot: GameSnapshot; restart(): void; menu(): void;
}) {
  return (
    <section id="over" className={c('screen', snapshot.phase !== 'results' && 'hidden')}>
      <div className={c('center')}>
        <div className={c('eyebrow')}><i /><span id="over-title">{snapshot.result?.title ?? 'RUN TERMINATED'}</span><i /></div>
        <div className={c('over-score')} id="over-score">{snapshot.score}</div>
        <div className={c('rank')} id="over-rank">{snapshot.result?.rank ?? 'C'}</div>
        <div className={c('stats')}>
          <div><b id="over-gates">{snapshot.gatesPassed}/{snapshot.gatesTotal}</b><span>GATES</span></div>
          <div><b id="over-combo">{snapshot.maxCombo}</b><span>MAX LINK</span></div>
          <div><b id="over-acc">{Math.round((snapshot.result?.accuracy ?? 0) * 100)}%</b><span>ACCURACY</span></div>
        </div>
        <button className={c('btn', 'start')} data-act="restart" onClick={restart}><span>SPACE TO RUN AGAIN</span></button>
        <button className={c('btn', 'tiny')} data-act="menu" onClick={menu}><span>BACK TO MENU</span></button>
      </div>
    </section>
  );
}
