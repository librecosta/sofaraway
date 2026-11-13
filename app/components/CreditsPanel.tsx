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
        <p>Made by <a href="https://librecosta.com" target="_blank" rel="noopener noreferrer">librecosta</a>.<br />
          Every material, shader, texture and note is generated at runtime.</p>
        <p><b>INSPIRATION</b><br />Inspired by <a href="https://helloenjoy.itch.io/hellorun" target="_blank" rel="noopener noreferrer">HelloRun</a> (HelloEnjoy, 2013).</p>
        <p><a href={`/debug/?vol=${volume}`}>Debug overview</a></p>
      </div>
      <DecodeButton className={c('panel-close')} data-act="closepanel" onClick={close} label="CLOSE" />
    </div>
  </GameDialog>;
}
