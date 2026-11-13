import type { GameSnapshot } from '../game/contracts';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';
import { GameDialog } from './GameDialog';

interface Props {
  snapshot: GameSnapshot;
  retry(): void;
  startSilent(): void;
  menu(): void;
  settings(): void;
  preview?: boolean;
}

export function isBlockingFallback({ phase, error }: GameSnapshot) {
  if (phase === 'error' || phase === 'unsupported') return true;
  if (error?.kind === 'graphics') return false;
  return phase === 'paused' || !!error;
}

export function GameFallback({ snapshot, retry, startSilent, menu, settings, preview }: Props) {
  const { phase, error, pauseReason } = snapshot;
  const blocking = isBlockingFallback(snapshot);
  if (!blocking) {
    if (error?.kind !== 'graphics') return null;
    return <div className={c('system-status')} role="status">{error.message}</div>;
  }
  const title = phase === 'unsupported' ? 'GRAPHICS UNSUPPORTED'
    : error?.kind === 'audio' ? 'AUDIO UNAVAILABLE'
    : error?.kind === 'runtime' ? 'GAME UNAVAILABLE'
    : error?.stage === 'recovery' ? 'GRAPHICS RECOVERY FAILED'
    : error?.kind === 'graphics' ? 'GRAPHICS UNAVAILABLE' : 'PAUSED';
  const message = error?.message ?? (pauseReason === 'background' ? 'The run paused when the page left the foreground.'
    : pauseReason === 'context' ? 'Graphics were interrupted. Resume when you are ready.' : 'Your run is paused.');
  const dismiss = phase === 'paused' && !error ? retry : error?.kind === 'audio' ? menu : undefined;
  return (
    <GameDialog title={title} dismiss={dismiss} preview={preview}>
      <div className={c('panel', 'fallback-panel')}>
        <h2 className={c('panel-head')}>{title}</h2>
        <p role={error ? 'alert' : 'status'}>{message}</p>
        <div className={c('fallback-actions')}>
          <DecodeButton className={c('btn', 'tiny')} onClick={retry} label={phase === 'paused' ? 'RESUME' : 'TRY AGAIN'} />
          {error?.kind === 'audio' && <DecodeButton className={c('btn', 'tiny')} onClick={startSilent} label="PLAY WITH SOUND OFF" />}
          {phase === 'paused' && <DecodeButton className={c('btn', 'tiny')} onClick={settings} label="SETTINGS" />}
          {['paused', 'playing', 'crash', 'results'].includes(phase) &&
            <DecodeButton className={c('btn', 'tiny')} onClick={menu} label="BACK TO MENU" />}
        </div>
      </div>
    </GameDialog>
  );
}
