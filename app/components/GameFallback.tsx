import type { MouseEvent } from 'react';
import type { GameSnapshot } from '../game/contracts';
import { usePlayerText } from '../i18n/PlayerLocale';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';
import { GameDialog } from './GameDialog';

interface Props {
  snapshot: GameSnapshot;
  retry(event?: MouseEvent<HTMLButtonElement>): void;
  startSilent(event: MouseEvent<HTMLButtonElement>): void;
  menu(): void;
  settings(): void;
  preview?: boolean;
  previewMessage?: string;
}

export function isBlockingFallback({ phase, error }: GameSnapshot) {
  if (phase === 'error' || phase === 'unsupported') return true;
  if (error?.kind === 'graphics') return false;
  return phase === 'paused' || !!error;
}

export function GameFallback({ snapshot, retry, startSilent, menu, settings, preview, previewMessage }: Props) {
  const { text } = usePlayerText();
  const { t } = text;
  const { phase, error, pauseReason } = snapshot;
  const blocking = isBlockingFallback(snapshot);
  if (!blocking) {
    if (error?.kind !== 'graphics') return null;
    return <div className={c('system-status')} role="status">{t(error.message)}</div>;
  }
  const title = phase === 'unsupported' ? 'graphicsUnsupported'
    : error?.kind === 'audio' ? 'audioUnavailable'
    : error?.kind === 'runtime' ? 'gameUnavailable'
    : error?.stage === 'recovery' ? 'graphicsRecoveryFailed'
    : error?.kind === 'graphics' ? 'graphicsUnavailable' : 'paused';
  const message = previewMessage ?? (error ? t(error.message) : text.pause(pauseReason ?? 'user'));
  const dismiss = phase === 'paused' && !error && pauseReason !== 'pointer-lock' && pauseReason !== 'orientation'
    ? (snapshot.mode === 'showcase' ? menu : retry)
    : error?.kind === 'audio' ? menu : undefined;
  return (
    <GameDialog title={t(title)} focusKey={title} dismiss={dismiss} preview={preview}>
      <div className={c('panel', 'fallback-panel')}>
        <h2 className={c('panel-head')}>{t(title)}</h2>
        <p role={error ? 'alert' : 'status'}>{message}</p>
        <div className={c('fallback-actions')}>
          <DecodeButton className={c('btn', 'tiny')} onClick={retry} label={t(phase === 'paused' ? 'resume' : 'tryAgain')} />
          {error?.kind === 'audio' && <DecodeButton className={c('btn', 'tiny')} onClick={startSilent} label={t('playSilent')} />}
          {phase === 'paused' && <DecodeButton className={c('btn', 'tiny')} onClick={settings} label={t('settings')} />}
          {['paused', 'playing', 'crash', 'results'].includes(phase) &&
            <DecodeButton className={c('btn', 'tiny')} onClick={menu} label={t('menu')} />}
        </div>
      </div>
    </GameDialog>
  );
}
