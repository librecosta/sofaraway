import { difficulties } from '../game/contracts';
import type { Difficulty, GameSnapshot } from '../game/contracts';
import { volumeById } from '../game/core/volumes';
import { classes as c } from '../styles/classes';

interface Props {
  snapshot: GameSnapshot;
  visible: boolean;
  chooseDifficulty(value: Difficulty): void;
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
        <button className={c('btn', 'tiny')} data-act="credits" onClick={props.credits}><span>CREDITS</span></button>
        <button className={c('btn', 'tiny')} data-act="share" onClick={props.share}><span>SHARE</span></button>
      </div>
      <div className={c('center')}>
        <div className={c('eyebrow')}><i /><span>{volume.subtitle} &nbsp;/&nbsp; PROCEDURAL&nbsp;RUNNER</span><i /></div>
        <h1 className={c('wordmark')}>SOFARAWAY</h1>
        <div className={c('rule')} />
        <div className={c('tagline')}>ANYWHERE BUT HERE</div>
        <p className={c('sr-only')}>Thread the gates, ride the beat. A procedural rhythm runner by LibreCosta.</p>
        <div className={c('vols')} id="vols">
          <button className={c('vol-nav')} data-vol-step="-1" disabled={!ready} aria-label="previous volume" onClick={() => props.stepVolume(-1)}>‹</button>
          <span className={c('vol-name')} id="vol-name">{volume.subtitle.replace('VOL.', '').trim()} · {volume.name}</span>
          <button className={c('vol-nav')} data-vol-step="1" disabled={!ready} aria-label="next volume" onClick={() => props.stepVolume(1)}>›</button>
        </div>
        <div className={c('diff')} id="diff">
          {difficulties.map(difficulty => (
            <button key={difficulty} className={c('diff-btn', snapshot.difficulty === difficulty && 'active')}
              data-diff={difficulty} aria-pressed={snapshot.difficulty === difficulty}
              disabled={!ready} onClick={() => props.chooseDifficulty(difficulty)}>
              {difficulty.toUpperCase()}<em>{volume.lives[difficulty]} {volume.lives[difficulty] === 1 ? 'LIFE' : 'LIVES'}</em>
            </button>
          ))}
        </div>
      </div>
      <div className={c('bottom')}>
        <button className={c('btn', 'tiny')} data-act="settings" disabled={!ready} onClick={props.settings}><span>SETTINGS</span></button>
        <button className={c('btn', 'start')} data-act="start" disabled={!ready || !!snapshot.error} onClick={props.start}>
          <span>{ready ? 'PRESS SPACE TO START' : 'LOADING'}</span>
        </button>
        <button className={c('btn', 'tiny')} data-act="fullscreen" onClick={props.fullscreen}><span>FULL SCREEN</span></button>
      </div>
      <div className={c('musicbadge')}><span className={c('mb-k')}>MUSIC</span><span className={c('mb-v')}>SYNTHESIZED</span></div>
    </section>
  );
}
