import { memo, useSyncExternalStore } from 'react';
import { initialSnapshot } from '../game/contracts';
import type { GameRuntime, GameSnapshot } from '../game/contracts';
import { SIGHTSEEING_SPEED } from '../game/core/sightseeing';
import { usePlayerText } from '../i18n/PlayerLocale';
import { classes as c } from '../styles/classes';

const fallback = () => initialSnapshot;
const noSubscribe = () => () => {};

export const GameHUD = memo(function GameHUD({ runtime }: { runtime: GameRuntime | null }) {
  const snapshot = useSyncExternalStore(runtime?.subscribe ?? noSubscribe, runtime?.getSnapshot ?? fallback, fallback);
  return <HUDView snapshot={snapshot} enableAudio={() => void runtime?.enableAudio()} pause={() => runtime?.pause('user')} />;
});

export function HUDView({ snapshot, enableAudio, pause }: { snapshot: GameSnapshot; enableAudio(): void; pause(): void }) {
  const { text } = usePlayerText();
  const { t, number } = text;
  const visible = ['playing', 'paused', 'crash'].includes(snapshot.phase);
  const routeHint = snapshot.routeHint;
  const routeLabel = snapshot.route ? text.route(snapshot.route) : null;
  const spokenRoute = (route: NonNullable<GameSnapshot['route']>) => text.route(route).toLocaleLowerCase(text.locale);
  const referenceSpeed = snapshot.mode === 'sightseeing' ? snapshot.speed / SIGHTSEEING_SPEED : snapshot.speed;
  const speed = Math.max(0, Math.min(1, (referenceSpeed - 24) / 34)) * 100;
  return (
    <section id="hud" className={c('screen', !visible && 'hidden')}>
      <div className={c('hud-tl')}>
        <div className={c('label')}>{t('score')}</div><div className={c('value')} id="hud-score">{number(snapshot.score)}</div>
      </div>
      <div className={c('hud-tc')}>
        <div className={c('label')}>{t('sector')}</div><div className={c('value', 'sm')} lang="en" id="hud-section">{snapshot.section}</div>
        <div className={c('lives')} id="hud-lives" role="img"
          aria-label={t('livesRemaining', { remaining: snapshot.lives, total: snapshot.maxLives })}>
          {Array.from({ length: snapshot.maxLives }, (_, i) => <i key={i} className={c(i < snapshot.lives && 'on')} />)}
        </div>
        {(snapshot.shield || snapshot.resonance > 0) && (
          <div className={c('pickup-status')} id="hud-pickup">
            {snapshot.shield ? t('shieldStatus', { count: 1 }) : t('resonance', { count: snapshot.resonance })}
          </div>
        )}
        {routeLabel && <div className={c('route-status')} id="hud-route">{routeLabel}</div>}
        {snapshot.outroPhase === 'encore' && <div className={c('route-status')}>{t('encore')}</div>}
      </div>
      {snapshot.phase === 'playing' && routeHint && (
        <div className={c('sr-only')} id="route-hint" role="status">
          {snapshot.route ? t('enteringRoute', { route: spokenRoute(snapshot.route) })
            : t('routeHint', { left: spokenRoute(routeHint.left), main: spokenRoute('main'), right: spokenRoute(routeHint.right) })}
        </div>
      )}
      <div className={c('hud-tr')}>
        <div className={c('label')}>{t('gates')}</div>
        <div className={c('value', 'dim')} id="hud-gates">{number(snapshot.gatesPassed)}/{number(snapshot.gatesTotal)}</div>
      </div>
      <div className={c('hud-bl')}>
        <div className={c('label')}>{t('velocity')}</div>
        <div className={c('bar')}><i id="hud-speed" style={{ width: speed + '%' }} /></div>
        <div className={c('ticks')}>{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
      </div>
      <div className={c('hud-br')}>
        <div className={c('label')}>{t('link')}</div><div className={c('value')} id="hud-combo">×{number(snapshot.combo)}</div>
      </div>
      <div className={c('hint', snapshot.hint && 'show')} id="hint">
        {(snapshot.mode !== 'standard' || !snapshot.autoBoost) && <b className={c('pointer-steer')}>{t('holdBoost')}</b>}
        <span className={c('pointer-steer')}>{t('moveSteer')}</span><span className={c('touch-steer')}>{t('touchSteer')}</span>
      </div>
      <div className={c('boost', snapshot.boosting && 'on')} id="hud-boost">{t('boost')}</div>
      <div className={c('center-msg', !!snapshot.message && 'show')} id="center-msg">{text.message(snapshot.message)}</div>
      {snapshot.phase === 'playing' && snapshot.soundUnavailable && <button type="button" className={c('btn', 'tiny', 'restore-audio')}
        onClick={enableAudio}>{t('restoreSound')}</button>}
      {snapshot.phase === 'playing' && <button type="button" className={c('btn', 'tiny', 'touch-pause')}
        aria-label={t('pauseAction')} onClick={pause}>{t('pause')}</button>}
    </section>
  );
}
