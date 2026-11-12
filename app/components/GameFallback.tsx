import { useEffect, useRef } from 'react';
import type { GameSnapshot } from '../game/contracts';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';

interface Props {
  snapshot: GameSnapshot;
  retry(): void;
  startSilent(): void;
  menu(): void;
  settings(): void;
}

export function GameFallback({ snapshot, retry, startSilent, menu, settings }: Props) {
  const { phase, error } = snapshot;
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [phase, error]);
  if (!error && phase !== 'paused') return null;
  const reload = phase === 'error' || phase === 'unsupported';
  if (error?.kind === 'graphics' && !reload) return <div className={c('center-msg', 'show')} role="status">{error.message}</div>;
  const title = reload ? 'GAME UNAVAILABLE' : phase === 'paused' ? 'PAUSED' : 'AUDIO UNAVAILABLE';
  const message = error?.message ?? 'Your run is paused.';
  return (
    <section ref={dialog} className={c('modal')} role="dialog" aria-modal="true" aria-label={title}>
      <div className={c('modal-inner')}>
        <div className={c('eyebrow')}><i /><span>{title}</span><i /></div>
        <p role={error ? 'alert' : 'status'}>{message}</p>
        <div className={c('fallback-actions')}>
          <DecodeButton className={c('btn', 'tiny')} onClick={retry}
            label={phase === 'paused' ? 'RESUME' : 'TRY AGAIN'} />
          {error?.kind === 'audio' && <DecodeButton className={c('btn', 'tiny')} onClick={startSilent} label="PLAY WITH SOUND OFF" />}
          {phase === 'paused' && <DecodeButton className={c('btn', 'tiny')} onClick={settings} label="SETTINGS" />}
          {['paused', 'playing', 'crash', 'results'].includes(phase) &&
            <DecodeButton className={c('btn', 'tiny')} onClick={menu} label="BACK TO MENU" />}
        </div>
      </div>
    </section>
  );
}
