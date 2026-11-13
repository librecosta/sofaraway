import { useState } from 'react';
import { playModes } from '../game/contracts';
import type { Difficulty, GameSnapshot, PlayMode, VolumeId } from '../game/contracts';
import { difficultySettings } from '../game/core/chart';
import { difficultiesFor } from '../game/core/difficulty';
import { SIGHTSEEING_LIVES } from '../game/core/sightseeing';
import { volumeById } from '../game/core/volumes';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';
import { HorizontalSelector } from './HorizontalSelector';
import { VolumeWheel } from './VolumeWheel';
import { DynamicLightsButton, MusicInfo } from './MenuUtilities';

interface Props {
  snapshot: GameSnapshot;
  visible: boolean;
  chooseDifficulty(value: Difficulty): void;
  chooseMode(value: PlayMode): void;
  chooseVolume(id: VolumeId): void;
  onVolumeTarget?(id: VolumeId): void;
  setDynamicLights(value: boolean): void;
  start(): void;
  settings(): void;
  credits(): void;
  share(): void;
  fullscreen(): void;
  musicInitiallyOpen?: boolean;
}

const score = (n: number | null | undefined) => n?.toLocaleString('en-US') ?? '—';

export function MainMenu(props: Props) {
  const { snapshot } = props;
  const [musicOpen, setMusicOpen] = useState(props.musicInitiallyOpen ?? false);
  const volume = volumeById(snapshot.volumeId);
  const { best, last } = snapshot.localRecord;
  const sightseeing = snapshot.mode === 'sightseeing';
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
          <DynamicLightsButton active={snapshot.dynamicLights} onToggle={props.setDynamicLights} disabled={!ready} />
          <MusicInfo volume={volume} open={props.visible && musicOpen} setOpen={setMusicOpen} />
        </div>
      </div>
      <div className={c('center', 'menu-center')}>
        <header className={c('menu-brand')}>
          <div className={c('eyebrow')}>PROCEDURAL RUNNER</div>
          <h1 className={c('wordmark')}>SOFARAWAY</h1>
          <div className={c('tagline')}>MUSIC IN MOTION</div>
        </header>
        <noscript><p>Enable JavaScript and use a WebGL2-capable browser to play.</p></noscript>
        <VolumeWheel value={snapshot.volumeId} choose={props.chooseVolume} disabled={!ready} onTarget={props.onVolumeTarget} />
        <div className={c('menu-options')}>
          <HorizontalSelector label="Play mode" options={playModes} value={snapshot.mode} choose={props.chooseMode} disabled={!ready} />
          <div className={c('menu-difficulty')} id="diff" data-collapsed={sightseeing} inert={sightseeing} aria-hidden={sightseeing || undefined}>
            <div><HorizontalSelector label="Difficulty" options={difficultiesFor(volume.id)} value={snapshot.difficulty}
              choose={props.chooseDifficulty} disabled={!ready || sightseeing} /></div>
          </div>
          <div className={c('mode-details')}>{sightseeing ? `${SIGHTSEEING_LIVES} LIVES · ⅓ SPEED` : `${lives} ${lives === 1 ? 'LIFE' : 'LIVES'}`}</div>
          <div className={c('local-records', 'record-grid')} role="group" aria-label="Local records">
            {!sightseeing && <div><span>BEST SCORE</span><b>{score(best)}</b></div>}
            <div><span>{sightseeing ? 'LAST VISIT' : 'LAST RUN'}</span><b>{score(last?.score)}</b>
              {last && <small>{last.outcome}{last.recovery && ' · RECOVERY'}</small>}</div>
          </div>
        </div>
      </div>
      <div className={c('bottom')}>
        <DecodeButton className={c('btn', 'tiny')} data-act="settings" disabled={!ready} onClick={props.settings} label="SETTINGS" />
        <DecodeButton className={c('btn', 'start')} data-act="start" disabled={!ready || !!snapshot.error} onClick={props.start}
          label={ready ? 'PRESS SPACE TO START' : status} />
        <DecodeButton className={c('btn', 'tiny')} data-act="fullscreen" disabled={!ready} onClick={props.fullscreen} label="FULL SCREEN" />
      </div>
      <div className={c('center-msg', 'menu-message', !!snapshot.message && 'show')} role="status">{snapshot.message}</div>
    </section>
  );
}
