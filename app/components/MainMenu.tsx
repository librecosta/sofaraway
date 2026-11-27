import type { MouseEventHandler, ReactNode } from 'react';
import { experienceModes } from '../game/contracts';
import type { Difficulty, ExperienceMode, GameSnapshot, VolumeId } from '../game/contracts';
import type { RouteKind } from '../game/core/branches';
import { difficultySettings } from '../game/core/chart';
import { difficultiesFor } from '../game/core/difficulty';
import { SIGHTSEEING_LIVES } from '../game/core/sightseeing';
import { volumeById } from '../game/core/volumes';
import { totalRunScore } from '../game/runtime/records.client';
import { usePlayerText } from '../i18n/PlayerLocale';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';
import { HorizontalSelector } from './HorizontalSelector';
import { VolumeWheel } from './VolumeWheel';
import { MusicInfo } from './MenuUtilities';

interface Props {
  snapshot: GameSnapshot;
  visible: boolean;
  chooseDifficulty(value: Difficulty): void;
  chooseMode(value: ExperienceMode): void;
  chooseShowcaseRoute(value: RouteKind): void;
  chooseVolume(id: VolumeId): void;
  onVolumeTarget?(id: VolumeId): void;
  setMuted(value: boolean): void;
  start: MouseEventHandler<HTMLButtonElement>;
  settings(): void;
  credits(): void;
  share?(): void;
  socialLinks?: ReactNode;
  fullscreen(): void;
  fullscreenActive: boolean;
  musicInitiallyOpen?: boolean;
  preview?: boolean;
  compliance?: ReactNode;
}

const showcaseRoutes = ['main', 'challenge', 'score'] as const;

export function MainMenu(props: Props) {
  const { text } = usePlayerText();
  const { t } = text;
  const { snapshot } = props;
  const volume = volumeById(snapshot.volumeId);
  const { best, last } = snapshot.localRecord;
  const sightseeing = snapshot.mode === 'sightseeing';
  const showcase = snapshot.mode === 'showcase';
  const standard = snapshot.mode === 'standard';
  const ready = snapshot.phase === 'menu' && snapshot.error?.kind !== 'graphics';
  const lives = difficultySettings(volume, snapshot.difficulty).lives;
  const status = t(snapshot.phase === 'starting' ? 'starting' : 'initializing');
  return (
    <section id="menu" className={c('screen', 'menu-screen', !props.visible && 'hidden')}>
      <div className={c('top')}>
        <div className={c('menu-tools')}>
          <DecodeButton className={c('btn', 'tiny')} data-act="credits" onClick={props.credits} label={t('credits')} />
          {props.share && <DecodeButton className={c('btn', 'tiny')} data-act="share" onClick={props.share} label={t('share')} />}
        </div>
        <div className={c('menu-tools')}>
          {props.socialLinks}
          <MusicInfo volume={volume} muted={snapshot.muted} setMuted={props.setMuted}
            initiallyOpen={props.musicInitiallyOpen} />
        </div>
      </div>
      <div className={c('center', 'menu-center')}>
        <header className={c('menu-brand')}>
          <div className={c('eyebrow')}>{t('proceduralRunner')}</div>
          <h1 className={c('wordmark')}>SoFarAway</h1>
          <div className={c('tagline')}>{t('tagline')}</div>
        </header>
        <noscript><p>{t('noScript')}</p></noscript>
        <VolumeWheel value={snapshot.volumeId} choose={props.chooseVolume} disabled={!ready} onTarget={props.onVolumeTarget} />
        <div className={c('menu-options')}>
          <HorizontalSelector label={t('playMode')} options={experienceModes} value={snapshot.mode}
            choose={props.chooseMode} labelFor={text.mode} disabled={!ready} />
          <div className={c('menu-difficulty')} id="diff" data-collapsed={!standard} inert={!standard} aria-hidden={!standard || undefined}>
            <div><HorizontalSelector label={t('difficulty')} options={difficultiesFor(volume.id)} value={snapshot.difficulty}
              choose={props.chooseDifficulty} labelFor={text.difficulty} disabled={!ready || !standard} /></div>
          </div>
          {showcase && <HorizontalSelector label={t('showcaseRoute')} options={showcaseRoutes} value={snapshot.showcaseRoute}
            choose={props.chooseShowcaseRoute} labelFor={text.route} disabled={!ready} />}
          <div className={c('mode-details')}>{showcase ? t('showcaseDetail')
            : sightseeing ? t('sightseeingDetail', { count: SIGHTSEEING_LIVES })
              : t(lives === 1 ? 'oneLife' : 'lives', { count: lives })}</div>
          {!showcase && <div className={c('local-records', 'record-grid')} role="group" aria-label={t('localRecords')}>
            {!sightseeing && <div><span>{t('bestScore')}</span><b>{text.score(best)}</b></div>}
            <div><span>{t(sightseeing ? 'lastVisit' : 'lastRun')}</span>
              <b>{text.score(last && (sightseeing ? last.score : totalRunScore(last)))}</b>
              <small>{last && text.outcome(last.outcome)}{last?.recovery && ` · ${t('recovery')}`}</small></div>
          </div>}
        </div>
      </div>
      <div className={c('bottom')}>
        <DecodeButton className={c('btn', 'tiny')} data-act="settings" disabled={!ready} onClick={props.settings} label={t('settings')} />
        <DecodeButton className={c('btn', 'start')} data-act="start" disabled={!ready || !!snapshot.error} onClick={props.start}
          aria-keyshortcuts="X" label={ready ? t(showcase ? 'startShowcase' : 'start') : status} />
        <DecodeButton className={c('btn', 'tiny')} data-act="fullscreen" disabled={!ready} onClick={props.fullscreen}
          label={t(props.fullscreenActive ? 'exitFullScreen' : 'fullScreen')} />
        {props.visible && !props.preview && props.compliance}
      </div>
      <div className={c('center-msg', 'menu-message', !!snapshot.message && 'show')} role="status">{text.message(snapshot.message)}</div>
    </section>
  );
}
