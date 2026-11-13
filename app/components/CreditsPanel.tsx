import type { VolumeId } from '../game/contracts';
import { classes as c } from '../styles/classes';
import { DecodeButton } from './DecodeButton';
import { GameDialog } from './GameDialog';
import { NavigationButton } from './NavigationButton';

export function CreditsPanel({ volume, close, preview }: { volume: VolumeId; close(): void; preview?: boolean }) {
  return <GameDialog id="panel" title="Credits" dismiss={close} preview={preview}>
    <div className={c('panel', 'credits-panel')}>
      <h2 className={c('panel-head')}>CREDITS</h2>
      <div id="panel-body">
        <p><b>SoFaraway</b> — a browser rhythm runner.<br />Thread the gates, ride the beat.</p>
        <p>Made by <NavigationButton className={c('credit-link')} to="https://librecosta.com" newTab preview={preview}>librecosta</NavigationButton>.<br />
          Every material, shader, texture and note is generated at runtime.</p>
        <p><b>INSPIRATION</b><br />Inspired by <NavigationButton className={c('credit-link')} to="https://helloenjoy.itch.io/hellorun" newTab preview={preview}>HelloRun</NavigationButton> (HelloEnjoy, 2013).</p>
        <p><NavigationButton to={`/debug/?vol=${volume}`} preview={preview}>Debug overview</NavigationButton></p>
        <hr className={c('credits-divider')} />
        <NavigationButton className={c('credit-link', 'credits-contact')} to="mailto:contact@librecosta.com" preview={preview}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m4 7 8 6 8-6" strokeLinejoin="round" />
          </svg>
          contact@librecosta.com
        </NavigationButton>
      </div>
      <DecodeButton className={c('panel-close')} data-act="closepanel" onClick={close} label="CLOSE" />
    </div>
  </GameDialog>;
}
