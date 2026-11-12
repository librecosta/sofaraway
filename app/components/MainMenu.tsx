import { difficulties, playModes } from '../game/contracts';
import type { Difficulty, GameSnapshot, PlayMode } from '../game/contracts';
import { SIGHTSEEING_LIVES } from '../game/core/sightseeing';
import { volumeById } from '../game/core/volumes';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';

interface Props {
  snapshot: GameSnapshot;
  visible: boolean;
  chooseDifficulty(value: Difficulty): void;
  chooseMode(value: PlayMode): void;
  stepVolume(direction: number): void;
  start(): void;
  settings(): void;
  credits(): void;
  share(): void;
  fullscreen(): void;
}

export function MainMenu(props: Props) {
  const { snapshot } = props;
  const volume = volumeById(snapshot.volumeId);
  const ready = snapshot.phase === 'menu' && snapshot.error?.kind !== 'graphics';
  return (
    <section id="menu" className={c('screen', !props.visible && 'hidden')}>
      <div className={c('top')}>
        <DecodeButton className={c('btn', 'tiny')} data-act="credits" onClick={props.credits} label="CREDITS" />
        <DecodeButton className={c('btn', 'tiny')} data-act="share" onClick={props.share} label="SHARE" />
      </div>
      <div className={c('center')}>
        <div className={c('eyebrow')}><i /><span>{volume.subtitle} &nbsp;/&nbsp; PROCEDURAL&nbsp;RUNNER</span><i /></div>
        <h1 className={c('wordmark')}>SOFARAWAY</h1>
        <div className={c('rule')} />
        <div className={c('tagline')}>ANYWHERE BUT HERE</div>
        <p className={c('sr-only', 'intro')}>Thread the gates, ride the beat. A procedural rhythm runner by LibreCosta.</p>
        <noscript><p>Enable JavaScript and use a WebGL2-capable browser to play.</p></noscript>
        <div className={c('vols')} id="vols">
          <button className={c('vol-nav')} data-vol-step="-1" disabled={!ready} aria-label="previous volume" onClick={() => props.stepVolume(-1)}>‹</button>
          <span className={c('vol-name')} id="vol-name">{volume.subtitle.replace('VOL.', '').trim()} · {volume.name}</span>
          <button className={c('vol-nav')} data-vol-step="1" disabled={!ready} aria-label="next volume" onClick={() => props.stepVolume(1)}>›</button>
        </div>
        <div className={c('play-options')}>
          <div className={c('diff', 'modes')} role="group" aria-label="Play mode">
            {playModes.map(mode => (
              <DecodeButton key={mode} className={c('diff-btn', snapshot.mode === mode && 'active')}
                label={mode.toUpperCase()} aria-pressed={snapshot.mode === mode} disabled={!ready}
                onClick={() => props.chooseMode(mode)} />
            ))}
          </div>
          <div className={c('diff', 'mode-options')} id="diff">
            {snapshot.mode === 'sightseeing' ? <span className={c('mode-details')}>{SIGHTSEEING_LIVES} LIVES · ⅓ SPEED</span> : difficulties.map(difficulty => {
              const label = difficulty.toUpperCase();
              const lives = `${volume.lives[difficulty]} ${volume.lives[difficulty] === 1 ? 'LIFE' : 'LIVES'}`;
              return (
                <DecodeButton key={difficulty} className={c('diff-btn', snapshot.difficulty === difficulty && 'active')}
                  label={label} aria-label={`${label} ${lives}`} data-diff={difficulty} aria-pressed={snapshot.difficulty === difficulty}
                  disabled={!ready} onClick={() => props.chooseDifficulty(difficulty)}>
                  <em>{lives}</em>
                </DecodeButton>
              );
            })}
          </div>
        </div>
      </div>
      <div className={c('bottom')}>
        <DecodeButton className={c('btn', 'tiny')} data-act="settings" disabled={!ready} onClick={props.settings} label="SETTINGS" />
        <DecodeButton className={c('btn', 'start')} data-act="start" disabled={!ready || !!snapshot.error} onClick={props.start}
          label={ready ? 'PRESS SPACE TO START' : 'LOADING'} />
        <DecodeButton className={c('btn', 'tiny')} data-act="fullscreen" disabled={!ready} onClick={props.fullscreen} label="FULL SCREEN" />
      </div>
      <div className={c('center-msg', !!snapshot.message && 'show')} role="status">{snapshot.message}</div>
      <div className={c('musicbadge')}><span className={c('mb-k')}>MUSIC</span><span className={c('mb-v')}>SYNTHESIZED</span></div>
    </section>
  );
}
