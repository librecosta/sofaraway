import { memo, useSyncExternalStore } from 'react';
import { initialSnapshot } from '../game/contracts';
import type { GameRuntime } from '../game/contracts';
import { ROUTE_LABELS } from '../game/core/branches';
import { SIGHTSEEING_SPEED } from '../game/core/sightseeing';
import { classes as c } from '../styles/classes';

const fallback = () => initialSnapshot;
const noSubscribe = () => () => {};

export const GameHUD = memo(function GameHUD({ runtime }: { runtime: GameRuntime | null }) {
  const snapshot = useSyncExternalStore(runtime?.subscribe ?? noSubscribe, runtime?.getSnapshot ?? fallback, fallback);
  const visible = ['playing', 'paused', 'crash'].includes(snapshot.phase);
  const routeHint = snapshot.routeHint;
  const routeLabel = snapshot.route ? ROUTE_LABELS[snapshot.route] : null;
  const referenceSpeed = snapshot.mode === 'sightseeing' ? snapshot.speed / SIGHTSEEING_SPEED : snapshot.speed;
  const speed = Math.max(0, Math.min(1, (referenceSpeed - 24) / 34)) * 100;
  return (
    <section id="hud" className={c('screen', !visible && 'hidden')}>
      <div className={c('hud-tl')}>
        <div className={c('label')}>SCORE</div><div className={c('value')} id="hud-score">{snapshot.score}</div>
      </div>
      <div className={c('hud-tc')}>
        <div className={c('label')}>SECTOR</div><div className={c('value', 'sm')} id="hud-section">{snapshot.section}</div>
        <div className={c('lives')} id="hud-lives">
          {Array.from({ length: snapshot.maxLives }, (_, i) => <i key={i} className={c(i < snapshot.lives && 'on')} />)}
        </div>
        {(snapshot.shield || snapshot.resonance > 0) && (
          <div className={c('pickup-status')} id="hud-pickup">
            {snapshot.shield ? 'SHIELD ×1' : `RESONANCE ×${snapshot.resonance}`}
          </div>
        )}
        {routeLabel && <div className={c('route-status')} id="hud-route">{routeLabel}</div>}
      </div>
      {snapshot.phase === 'playing' && routeHint && (
        <div className={c('sr-only')} id="route-hint" role="status">
          {routeLabel ? `Entering ${routeLabel.toLowerCase()} route.`
            : `Steer left for ${ROUTE_LABELS[routeHint.left].toLowerCase()}, straight for main, or right for ${ROUTE_LABELS[routeHint.right].toLowerCase()}.`}
        </div>
      )}
      <div className={c('hud-tr')}>
        <div className={c('label')}>GATES</div>
        <div className={c('value', 'dim')} id="hud-gates">{snapshot.gatesPassed}/{snapshot.gatesTotal}</div>
      </div>
      <div className={c('hud-bl')}>
        <div className={c('label')}>VELOCITY</div>
        <div className={c('bar')}><i id="hud-speed" style={{ width: speed + '%' }} /></div>
        <div className={c('ticks')}>{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
      </div>
      <div className={c('hud-br')}>
        <div className={c('label')}>LINK</div><div className={c('value')} id="hud-combo">×{snapshot.combo}</div>
      </div>
      <div className={c('hint', snapshot.hint && 'show')} id="hint"><b>HOLD SHIFT TO BOOST</b><span>MOVE TO STEER</span></div>
      <div className={c('boost', snapshot.boosting && 'on')} id="hud-boost">BOOST</div>
      <div className={c('center-msg', !!snapshot.message && 'show')} id="center-msg">{snapshot.message}</div>
      {snapshot.phase === 'playing' && snapshot.soundUnavailable && <button type="button" className={c('btn', 'tiny', 'restore-audio')}
        onClick={() => void runtime?.enableAudio()}>SOUND OFF · RESTORE AUDIO</button>}
      {snapshot.phase === 'playing' && <button type="button" className={c('btn', 'tiny', 'touch-pause')}
        aria-label="Pause" onClick={() => runtime?.pause('user')}>PAUSE</button>}
    </section>
  );
});
