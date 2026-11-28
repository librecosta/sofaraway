import { useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { qualities } from '../game/contracts';
import type { GameSnapshot, OrientationPreference, QualityTier } from '../game/contracts';
import { usePlayerText } from '../i18n/PlayerLocale';
import { locales } from '../i18n/player-text';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';
import { GameDialog } from './GameDialog';

const motionQuery = '(prefers-reduced-motion: reduce)';
const reducedMotion = () => window.matchMedia(motionQuery).matches;
function subscribeMotion(change: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', change);
  return () => media.removeEventListener('change', change);
}

interface Props {
  snapshot: GameSnapshot;
  close(): void;
  chooseQuality(value: QualityTier): void;
  setVolume(value: number): void;
  setMuted(value: boolean): void;
  setDynamicLights(value: boolean): void;
  setGateQualityDebug?(value: boolean): void;
  setAutoBoost(value: boolean): void;
  setCenterReticle(value: boolean): void;
  immersiveMouseAvailable: boolean;
  setImmersiveMouse(value: boolean): void;
  orientation?: { value: OrientationPreference; choose(value: OrientationPreference): void; pending?: boolean };
  fullscreen: { available: boolean; active: boolean; toggle(): void; failed?: boolean;
    hidden?: boolean; label?: string; pending?: boolean; status?: string };
  preview?: boolean;
}

function Toggle({ id, label, checked, change, description, disabled }: {
  id: string; label: string; checked: boolean; change(value: boolean): void; description?: string; disabled?: boolean;
}) {
  return <label className={c('panel-row', 'switch-row')} htmlFor={id}>
    <span>{label}</span><input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled}
      aria-label={label} aria-describedby={description ? `${id}-description` : undefined}
      onChange={event => change(event.target.checked)} />
    <span className={c('switch-track')} aria-hidden="true" />
    {description && <small id={`${id}-description`} className={c('switch-description')}>{description}</small>}
  </label>;
}

export function SettingsPanel(props: Props) {
  const { snapshot, close, chooseQuality, setVolume, setMuted, setDynamicLights,
    immersiveMouseAvailable, setImmersiveMouse, setAutoBoost, setCenterReticle, orientation, fullscreen, preview } = props;
  const { text, chooseLocale } = usePlayerText();
  const { t } = text;
  const quality = qualities.indexOf(snapshot.quality);
  const reduced = useSyncExternalStore(subscribeMotion, reducedMotion, () => false);
  const boostLocked = snapshot.phase !== 'menu';
  return (
    <GameDialog id="settings" title={t('settingsDialog')} dismiss={close} preview={preview}>
      <div className={c('panel', 'settings-panel')}>
        <h2 className={c('panel-head')}>{t('settings')}</h2>
        <div className={c('settings-controls')}>
          <div className={c('panel-row')}>
            <span>{t('quality')}</span>
            <div className={c('seg')} id="seg-quality" role="group" aria-label={t('qualityGroup')}
              style={{ '--segment-index': quality } as CSSProperties} onKeyDown={event => {
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
                  disabled={snapshot.phase === 'paused'} onClick={() => chooseQuality(item)}>{text.quality(item)}</button>
              ))}
            </div>
          </div>
          <div className={c('panel-row')}>
            <span>{t('language')}</span>
            <div className={c('seg', 'orientation-options')} role="group" aria-label={t('language')}
              style={{ '--segment-index': locales.indexOf(text.locale) } as CSSProperties}>
              {locales.map(locale => <button type="button" key={locale} lang={locale} data-language={locale}
                aria-pressed={text.locale === locale} onClick={() => chooseLocale(locale)}>
                {locale === 'zh-CN' ? '简体中文' : 'English'}
              </button>)}
            </div>
          </div>
          <div className={c('panel-row')}>
            <label htmlFor="set-volume">{t('volume')}</label>
            <input id="set-volume" type="range" min="0" max="100" value={Math.round(snapshot.volume * 100)}
              style={{ '--volume-fill': `${snapshot.volume * 100}%` } as CSSProperties}
              onChange={event => setVolume(event.target.valueAsNumber / 100)} />
          </div>
          <Toggle id="set-muted" label={t('mute')} checked={snapshot.muted} change={setMuted} />
          <Toggle id="set-auto-boost" label={t('autoBoost')} checked={snapshot.autoBoost} change={setAutoBoost}
            disabled={boostLocked} description={boostLocked ? t('autoBoostLocked') : t('autoBoostHelp')} />
          <Toggle id="set-center-reticle" label={t('centerReticle')} checked={snapshot.centerReticle}
            change={setCenterReticle} description={t('centerReticleHelp')} />
          <Toggle id="set-dynamic-lights" label={t('dynamicLights')} checked={snapshot.dynamicLights} change={setDynamicLights}
            description={t(reduced ? 'reducedLights' : 'lightsHelp')} />
          {immersiveMouseAvailable && <Toggle id="set-immersive-mouse" label={t('immersiveMouse')}
            checked={snapshot.immersiveMouse} change={setImmersiveMouse}
            description={t('immersiveHelp')} />}
          {orientation && <div className={c('panel-row', 'orientation-row')}>
            <span>{t('orientationLabel')}</span>
            <div className={c('seg', 'orientation-options')} role="group" aria-label={t('orientation')}
              style={{ '--segment-index': Number(orientation.value === 'portrait') } as CSSProperties}>
              {(['landscape', 'portrait'] as const).map(value => <button type="button" key={value}
                aria-pressed={orientation.value === value} disabled={orientation.pending}
                data-display-action={orientation.pending !== undefined ? '' : undefined}
                onClick={() => orientation.choose(value)}>{text.orientation(value)}</button>)}
            </div>
          </div>}
          {!fullscreen.hidden && <div className={c('panel-row')}>
            <span>{t('fullscreen')}</span>
            <DecodeButton className={c('panel-close')} disabled={!fullscreen.available || fullscreen.pending}
              data-display-action={fullscreen.label ? '' : undefined}
              onClick={fullscreen.toggle} label={fullscreen.label ?? t(fullscreen.active ? 'exitFullscreen' : 'enterFullscreen')} />
          </div>}
          {typeof __LIVE_GATE_QUALITY_DEV__ !== 'undefined' && __LIVE_GATE_QUALITY_DEV__ && props.setGateQualityDebug &&
            <Toggle id="set-live-gate-quality" label={text.locale === 'zh-CN' ? '门型判定区（开发）' : 'GATE SCORING ZONES (DEV)'}
              checked={!!snapshot.gateQualityDebug} change={props.setGateQualityDebug}
              description={text.locale === 'zh-CN' ? '在飞行中显示判定区。青绿为精准，琥珀色为惊险。'
                : 'Show scoring zones on gates during flight. Teal marks Precision and amber marks Near Miss.'} />}
          {fullscreen.status && <small className={c('switch-description')} role="status">{fullscreen.status}</small>}
          {fullscreen.failed && <small className={c('switch-description')} role="status">{t('fullscreenUnavailable')}</small>}
          <details className={c('controls-help')}>
            <summary>{t('controls')}</summary>
            <ul><li>{t('steerHelp')}</li><li>{t('boostHelp')}</li><li>{t('shortcutsHelp')}</li></ul>
          </details>
        </div>
        <DecodeButton className={c('panel-close')} data-act="closesettings" onClick={close} label={t('close')} />
      </div>
    </GameDialog>
  );
}
