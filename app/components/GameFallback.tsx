import type { GameSnapshot } from '../game/contracts';
import { classes as c } from '../styles/classes';

interface Props {
  snapshot: GameSnapshot;
  retry(): void;
  startSilent(): void;
  menu(): void;
  settings(): void;
}

export function GameFallback({ snapshot, retry, startSilent, menu, settings }: Props) {
  const { phase, error, pauseReason } = snapshot;
  if (!error && phase !== 'paused') return null;
  const reload = phase === 'error' || phase === 'unsupported';
  const title = reload ? 'GAME UNAVAILABLE' : phase === 'paused' ? 'PAUSED'
    : error?.kind === 'graphics' ? 'GRAPHICS INTERRUPTED' : 'AUDIO UNAVAILABLE';
  const message = error?.message ?? (pauseReason === 'long-frame'
    ? 'Rendering fell behind. Resume when you are ready.' : 'Your run is paused.');
  return (
    <section className={c('modal')} role="dialog" aria-modal="true" aria-label={title}>
      <div className={c('modal-inner')}>
        <div className={c('eyebrow')}><i /><span>{title}</span><i /></div>
        <p role={error ? 'alert' : 'status'}>{message}</p>
        <button className={c('btn', 'tiny')} onClick={retry}>{phase === 'paused' ? 'RESUME' : 'TRY AGAIN'}</button>
        {error?.kind === 'audio' && <button className={c('btn', 'tiny')} onClick={startSilent}>PLAY WITH SOUND OFF</button>}
        {phase === 'paused' && <button className={c('btn', 'tiny')} onClick={settings}>SETTINGS</button>}
        {['paused', 'playing', 'crash', 'results'].includes(phase) &&
          <button className={c('btn', 'tiny')} onClick={menu}>BACK TO MENU</button>}
      </div>
    </section>
  );
}
