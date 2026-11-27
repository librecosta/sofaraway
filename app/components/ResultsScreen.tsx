import type { MouseEventHandler } from 'react';
import type { GameSnapshot } from '../game/contracts';
import { usePlayerText } from '../i18n/PlayerLocale';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';

export function ResultsScreen({ snapshot, restart, menu, preview = false }: {
  snapshot: GameSnapshot; restart: MouseEventHandler<HTMLButtonElement>; menu(): void; preview?: boolean;
}) {
  const { text } = usePlayerText();
  const { t, number } = text;
  const id = (name: string) => preview ? `preview-${name}` : name;
  const visible = snapshot.phase === 'results';
  if (snapshot.mode === 'showcase') {
    return (
      <section id={id('over')} className={c('screen', preview && 'result-preview', !visible && 'hidden')}>
        <div className={c('center')}>
          <h2 className={c('results-title')} id={id('over-title')}>
            {t(snapshot.result?.title === 'ESCAPED' ? 'showcaseComplete' : 'showcaseInterrupted')}
          </h2>
          <DecodeButton className={c('btn', 'start')} data-act="restart" disabled={preview} onClick={restart}
            aria-keyshortcuts="X" label={t('replay')} />
          <DecodeButton className={c('btn', 'tiny')} data-act="menu" disabled={preview} onClick={menu} label={t('menu')} />
        </div>
      </section>
    );
  }
  const encore = snapshot.mode === 'standard' ? snapshot.result?.encore : undefined;
  return (
    <section id={id('over')} className={c('screen', preview && 'result-preview', !visible && 'hidden')}>
      <div className={c('center')}>
        <h2 className={c('results-title')} id={id('over-title')}>{text.outcome(snapshot.result?.title ?? 'TERMINATED')}</h2>
        <div className={c('over-score')} id={id('over-score')}>{number(snapshot.score)}</div>
        {encore && <div className={c('route-status')}>{t('mainScore')}</div>}
        {snapshot.mode === 'sightseeing'
          ? <div className={c('route-status')} id={id('over-mode')}>{t('sightseeing')}</div>
          : <div className={c('rank')} id={id('over-rank')}>{snapshot.result?.rank ?? 'C'}</div>}
        {snapshot.mode === 'standard' && snapshot.difficulty === 'impossible' && <div className={c('route-status')}>{t('impossible')}</div>}
        {snapshot.newBest && <div className={c('route-status')}>{t('newBest')}</div>}
        {snapshot.result?.route && <div className={c('route-status')} id={id('over-route')}>
          {t('resultRoute', { route: text.route(snapshot.result.route) })}
        </div>}
        <div className={c('stats')}>
          <div><b id={id('over-gates')}>{number(snapshot.gatesPassed)}/{number(snapshot.gatesTotal)}</b><span>{t('gates')}</span></div>
          <div><b id={id('over-combo')}>{number(snapshot.maxCombo)}</b><span>{t('maxLink')}</span></div>
          <div><b id={id('over-acc')}>{text.percent(snapshot.result?.accuracy ?? 0)}</b><span>{t('accuracy')}</span></div>
        </div>
        {encore && <div className={c('stats', 'encore-stats')}>
          <div><b>+{number(encore.bonusScore)}</b><span>{t('encoreBonus')}</span></div>
          <div><b>{number(encore.passed)}/{number(encore.encountered)}</b><span>{t('encoreGates')}</span></div>
          <div><b>{number(snapshot.score + encore.bonusScore)}</b><span>{t('totalScore')}</span></div>
        </div>}
        {!!encore?.neutralized && !snapshot.result?.neutralized && <div className={c('route-status')}>{t('recoveryBestIneligible')}</div>}
        {snapshot.result && (snapshot.result.unreached > 0 || snapshot.result.neutralized > 0) && <div className={c('route-status')}>
          {t('gateSummary', { encountered: snapshot.result.encountered, unreached: snapshot.result.unreached })}
          {snapshot.result.neutralized > 0 && ` · ${t('recoveredGates', { count: snapshot.result.neutralized })}`}
          {snapshot.result.neutralized > 0 && snapshot.mode === 'standard' && ` · ${t('bestIneligible')}`}
        </div>}
        <DecodeButton className={c('btn', 'start')} data-act="restart" disabled={preview} onClick={restart}
          aria-keyshortcuts="X" label={t('runAgain')} />
        <DecodeButton className={c('btn', 'tiny')} data-act="menu" disabled={preview} onClick={menu} label={t('menu')} />
      </div>
    </section>
  );
}
