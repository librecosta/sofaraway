import { experienceModes } from '../game/contracts';
import type { Difficulty, ExperienceMode, GameSnapshot, VolumeId } from '../game/contracts';
import { ROUTE_LABELS } from '../game/core/branches';
import type { RouteKind } from '../game/core/branches';
import { difficultySettings } from '../game/core/chart';
import { difficultiesFor } from '../game/core/difficulty';
import { SIGHTSEEING_LIVES } from '../game/core/sightseeing';
import { volumeById } from '../game/core/volumes';
import { totalRunScore } from '../game/runtime/records.client';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';
import { HorizontalSelector } from './HorizontalSelector';
import { VolumeWheel } from './VolumeWheel';
import { MusicInfo, SocialLinks } from './MenuUtilities';

interface Props {
  snapshot: GameSnapshot;
  visible: boolean;
  chooseDifficulty(value: Difficulty): void;
  chooseMode(value: ExperienceMode): void;
  chooseShowcaseRoute(value: RouteKind): void;
  chooseVolume(id: VolumeId): void;
  onVolumeTarget?(id: VolumeId): void;
  setMuted(value: boolean): void;
  start(): void;
  settings(): void;
  credits(): void;
  share(): void;
  fullscreen(): void;
  musicInitiallyOpen?: boolean;
  preview?: boolean;
}

const score = (n: number | null | undefined) => n?.toLocaleString('en-US') ?? '—';
const showcaseRoutes = ['main', 'challenge', 'score'] as const;

export function MainMenu(props: Props) {
  const { snapshot } = props;
  const volume = volumeById(snapshot.volumeId);
  const { best, last } = snapshot.localRecord;
  const sightseeing = snapshot.mode === 'sightseeing';
  const showcase = snapshot.mode === 'showcase';
  const standard = snapshot.mode === 'standard';
  const ready = snapshot.phase === 'menu' && snapshot.error?.kind !== 'graphics';
  const lives = difficultySettings(volume, snapshot.difficulty).lives;
  const status = snapshot.phase === 'starting' ? 'STARTING' : 'INITIALIZING';
  return (
    <section id="menu" className={c('screen', 'menu-screen', !props.visible && 'hidden')}>
      <div className={c('top')}>
        <div className={c('menu-tools')}>
          <DecodeButton className={c('btn', 'tiny')} data-act="credits" onClick={props.credits} label="CREDITS" />
          <DecodeButton className={c('btn', 'tiny')} data-act="share" onClick={props.share} label="SHARE" />
        </div>
        <div className={c('menu-tools')}>
          <SocialLinks preview={props.preview} />
          <MusicInfo volume={volume} muted={snapshot.muted} setMuted={props.setMuted}
            initiallyOpen={props.musicInitiallyOpen} />
        </div>
      </div>
      <div className={c('center', 'menu-center')}>
        <header className={c('menu-brand')}>
          <div className={c('eyebrow')}>PROCEDURAL RUNNER</div>
          <h1 className={c('wordmark')}>SoFarAway</h1>
          <div className={c('tagline')}>MUSIC IN MOTION</div>
        </header>
        <noscript><p>Enable JavaScript and use a WebGL2-capable browser to play.</p></noscript>
        <VolumeWheel value={snapshot.volumeId} choose={props.chooseVolume} disabled={!ready} onTarget={props.onVolumeTarget} />
        <div className={c('menu-options')}>
          <HorizontalSelector label="Play mode" options={experienceModes} value={snapshot.mode} choose={props.chooseMode} disabled={!ready} />
          <div className={c('menu-difficulty')} id="diff" data-collapsed={!standard} inert={!standard} aria-hidden={!standard || undefined}>
            <div><HorizontalSelector label="Difficulty" options={difficultiesFor(volume.id)} value={snapshot.difficulty}
              choose={props.chooseDifficulty} disabled={!ready || !standard} /></div>
          </div>
          {showcase && <HorizontalSelector label="Showcase route" options={showcaseRoutes} value={snapshot.showcaseRoute}
            choose={props.chooseShowcaseRoute} labelFor={value => ROUTE_LABELS[value]} disabled={!ready} />}
          <div className={c('mode-details')}>{showcase ? 'AUTO PILOT · IMPOSSIBLE COURSE · NO SCORE'
            : sightseeing ? `${SIGHTSEEING_LIVES} LIVES · ⅓ SPEED` : `${lives} ${lives === 1 ? 'LIFE' : 'LIVES'}`}</div>
          {!showcase && <div className={c('local-records', 'record-grid')} role="group" aria-label="Local records">
            {!sightseeing && <div><span>BEST SCORE</span><b>{score(best)}</b></div>}
            <div><span>{sightseeing ? 'LAST VISIT' : 'LAST RUN'}</span>
              <b>{score(last && (sightseeing ? last.score : totalRunScore(last)))}</b>
              <small>{last?.outcome}{last?.recovery && ' · RECOVERY'}</small></div>
          </div>}
        </div>
      </div>
      <div className={c('bottom')}>
        <DecodeButton className={c('btn', 'tiny')} data-act="settings" disabled={!ready} onClick={props.settings} label="SETTINGS" />
        <DecodeButton className={c('btn', 'start')} data-act="start" disabled={!ready || !!snapshot.error} onClick={props.start}
          aria-keyshortcuts="X" label={ready ? (showcase ? 'START SHOWCASE' : 'START · PRESS X') : status} />
        <DecodeButton className={c('btn', 'tiny')} data-act="fullscreen" disabled={!ready} onClick={props.fullscreen} label="FULL SCREEN" />
      </div>
      <div className={c('center-msg', 'menu-message', !!snapshot.message && 'show')} role="status">{snapshot.message}</div>
    </section>
  );
}
