import type { CSSProperties } from 'react';
import { qualities } from '../game/contracts';
import type { GameSnapshot, QualityTier } from '../game/contracts';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';
import { GameDialog } from './GameDialog';

interface Props {
  snapshot: GameSnapshot;
  close(): void;
  chooseQuality(value: QualityTier): void;
  setVolume(value: number): void;
  setMuted(value: boolean): void;
  setDynamicLights(value: boolean): void;
  preview?: boolean;
}

function Toggle({ id, label, checked, change, description }: {
  id: string; label: string; checked: boolean; change(value: boolean): void; description?: string;
}) {
  return <label className={c('panel-row', 'switch-row')} htmlFor={id}>
    <span>{label}</span><input id={id} type="checkbox" role="switch" checked={checked}
      aria-label={label} aria-describedby={description ? `${id}-description` : undefined}
      onChange={event => change(event.target.checked)} />
    <span className={c('switch-track')} aria-hidden="true" />
    {description && <small id={`${id}-description`} className={c('switch-description')}>{description}</small>}
  </label>;
}

export function SettingsPanel({ snapshot, close, chooseQuality, setVolume, setMuted, setDynamicLights, preview }: Props) {
  const quality = qualities.indexOf(snapshot.quality);
  return (
    <GameDialog id="settings" title="Settings" dismiss={close} preview={preview}>
      <div className={c('panel')}>
        <h2 className={c('panel-head')}>SETTINGS</h2>
        <div className={c('panel-row')}>
          <span>QUALITY</span>
          <div className={c('seg')} id="seg-quality" role="group" aria-label="Quality"
            style={{ '--quality-index': quality } as CSSProperties} onKeyDown={event => {
              const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
              if (!direction || snapshot.phase === 'paused') return;
              event.preventDefault();
              event.stopPropagation();
              const next = (quality + direction + qualities.length) % qualities.length;
              chooseQuality(qualities[next]);
              event.currentTarget.querySelectorAll('button')[next]?.focus();
            }}>
            {qualities.map(item => (
              <button type="button" key={item} data-q={item} aria-pressed={item === snapshot.quality}
                disabled={snapshot.phase === 'paused'} onClick={() => chooseQuality(item)}>{item.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className={c('panel-row')}>
          <label htmlFor="set-volume">VOLUME</label>
          <input id="set-volume" type="range" min="0" max="100" value={Math.round(snapshot.volume * 100)}
            style={{ '--volume-fill': `${snapshot.volume * 100}%` } as CSSProperties}
            onChange={event => setVolume(event.target.valueAsNumber / 100)} />
        </div>
        <Toggle id="set-muted" label="MUTE" checked={snapshot.muted} change={setMuted} />
        <Toggle id="set-dynamic-lights" label="DYNAMIC LIGHTS" checked={snapshot.dynamicLights} change={setDynamicLights}
          description="Stronger corridor pulses on kick and snare." />
        <DecodeButton className={c('panel-close')} data-act="closesettings" onClick={close} label="CLOSE" />
      </div>
    </GameDialog>
  );
}
