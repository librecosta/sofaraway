import { qualities } from '../game/contracts';
import type { GameSnapshot, QualityTier } from '../game/contracts';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';

interface Props {
  snapshot: GameSnapshot;
  close(): void;
  chooseQuality(value: QualityTier): void;
  setVolume(value: number): void;
  setMuted(value: boolean): void;
}

export function SettingsPanel({ snapshot, close, chooseQuality, setVolume, setMuted }: Props) {
  return (
    <div className={c('modal')} id="settings" role="dialog" aria-label="Settings" aria-modal="true"
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className={c('panel')}>
        <div className={c('panel-head')}>SETTINGS</div>
        <div className={c('panel-row')}>
          <span>QUALITY</span>
          <div className={c('seg')} id="seg-quality">
            {qualities.map(quality => (
              <DecodeButton key={quality} className={c(quality === snapshot.quality && 'on')} data-q={quality}
                aria-pressed={quality === snapshot.quality}
                disabled={snapshot.phase === 'paused'} onClick={() => chooseQuality(quality)} label={quality.toUpperCase()} />
            ))}
          </div>
        </div>
        <div className={c('panel-row')}>
          <label htmlFor="set-volume">VOLUME</label>
          <input id="set-volume" type="range" min="0" max="100" value={Math.round(snapshot.volume * 100)}
            onChange={event => setVolume(event.target.valueAsNumber / 100)} />
        </div>
        <div className={c('panel-row')}>
          <label htmlFor="set-muted">MUTE</label>
          <input id="set-muted" type="checkbox" checked={snapshot.muted} onChange={event => setMuted(event.target.checked)} />
        </div>
        <DecodeButton className={c('panel-close')} data-act="closesettings" onClick={close} label="CLOSE" />
      </div>
    </div>
  );
}
