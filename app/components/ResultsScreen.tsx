import type { GameSnapshot } from '../game/contracts';
import { ROUTE_LABELS } from '../game/core/branches';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';

export function ResultsScreen({ snapshot, restart, menu, preview = false }: {
  snapshot: GameSnapshot; restart(): void; menu(): void; preview?: boolean;
}) {
  const id = (name: string) => preview ? `preview-${name}` : name;
  const encore = snapshot.mode === 'standard' ? snapshot.result?.encore : undefined;
  return (
    <section id={id('over')} className={c('screen', preview && 'result-preview', snapshot.phase !== 'results' && 'hidden')}>
      <div className={c('center')}>
        <div className={c('eyebrow')}><i /><span id={id('over-title')}>{snapshot.result?.title ?? 'RUN TERMINATED'}</span><i /></div>
        <div className={c('over-score')} id={id('over-score')}>{snapshot.score}</div>
        {encore && <div className={c('route-status')}>MAIN SCORE</div>}
        {snapshot.mode === 'sightseeing'
          ? <div className={c('route-status')} id={id('over-mode')}>SIGHTSEEING</div>
          : <div className={c('rank')} id={id('over-rank')}>{snapshot.result?.rank ?? 'C'}</div>}
        {snapshot.mode === 'standard' && snapshot.difficulty === 'impossible' && <div className={c('route-status')}>IMPOSSIBLE</div>}
        {snapshot.newBest && <div className={c('route-status')}>NEW BEST</div>}
        {snapshot.result?.route && <div className={c('route-status')} id={id('over-route')}>
          {ROUTE_LABELS[snapshot.result.route]} ROUTE
        </div>}
        <div className={c('stats')}>
          <div><b id={id('over-gates')}>{snapshot.gatesPassed}/{snapshot.gatesTotal}</b><span>GATES</span></div>
          <div><b id={id('over-combo')}>{snapshot.maxCombo}</b><span>MAX LINK</span></div>
          <div><b id={id('over-acc')}>{Math.round((snapshot.result?.accuracy ?? 0) * 100)}%</b><span>ACCURACY</span></div>
        </div>
        {encore && <div className={c('stats', 'encore-stats')}>
          <div><b>+{encore.bonusScore}</b><span>ENCORE BONUS</span></div>
          <div><b>{encore.passed}/{encore.encountered}</b><span>ENCORE PASSED</span></div>
          <div><b>{snapshot.score + encore.bonusScore}</b><span>TOTAL SCORE</span></div>
        </div>}
        {!!encore?.neutralized && !snapshot.result?.neutralized && <div className={c('route-status')}>RECOVERY · BEST INELIGIBLE</div>}
        {snapshot.result && (snapshot.result.unreached > 0 || snapshot.result.neutralized > 0) && <div className={c('route-status')}>
          {snapshot.result.encountered} ENCOUNTERED · {snapshot.result.unreached} UNREACHED
          {snapshot.result.neutralized > 0 && ` · ${snapshot.result.neutralized} RECOVERY`}
          {snapshot.result.neutralized > 0 && snapshot.mode === 'standard' && ' · BEST INELIGIBLE'}
        </div>}
        <DecodeButton className={c('btn', 'start')} data-act="restart" disabled={preview} onClick={restart} label="SPACE TO RUN AGAIN" />
        <DecodeButton className={c('btn', 'tiny')} data-act="menu" disabled={preview} onClick={menu} label="BACK TO MENU" />
      </div>
    </section>
  );
}
