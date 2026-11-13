import type { VolumeId } from '../game/contracts';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';
import { GameDialog } from './GameDialog';

export function CreditsPanel({ volume, close, preview }: { volume: VolumeId; close(): void; preview?: boolean }) {
  const keepPreview = (event: { target: EventTarget; preventDefault(): void }) => {
    if (preview && (event.target as HTMLElement).closest('a')) event.preventDefault();
  };
  return <GameDialog id="panel" title="Credits" dismiss={close} preview={preview}>
    <div className={c('panel', 'credits-panel')}>
      <h2 className={c('panel-head')}>CREDITS</h2>
      <div id="panel-body" onClick={keepPreview} onAuxClick={keepPreview} onContextMenu={keepPreview}>
        <p><b>SoFaraway</b> — a browser rhythm runner.<br />Thread the gates, ride the beat.</p>
        <p>Made by <a className={c('credit-link')} href="https://librecosta.com" target="_blank" rel="noopener noreferrer">librecosta</a>.<br />
          Every material, shader, texture and note is generated at runtime.</p>
        <p><b>INSPIRATION</b><br />Inspired by <a className={c('credit-link')} href="https://helloenjoy.itch.io/hellorun" target="_blank" rel="noopener noreferrer">HelloRun</a> (HelloEnjoy, 2013).</p>
        <p><a href={`/debug/?vol=${volume}`}>Debug overview</a></p>
        <hr className={c('credits-divider')} />
        <a className={c('credit-link', 'credits-contact')} href="mailto:contact@librecosta.com">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m4 7 8 6 8-6" strokeLinejoin="round" />
          </svg>
          contact@librecosta.com
        </a>
      </div>
      <DecodeButton className={c('panel-close')} data-act="closepanel" onClick={close} label="CLOSE" />
    </div>
  </GameDialog>;
}
