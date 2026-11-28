import type { GameSnapshot } from '../game/contracts';
import { classes as c } from '../styles/classes';

export function CenterReticle({ snapshot }: { snapshot: GameSnapshot }) {
  if (!snapshot.centerReticle || snapshot.phase !== 'playing' || snapshot.error || snapshot.mode === 'showcase') return null;
  const cross = 'M11 2v5m0 8v5M2 11h5m8 0h5';
  return <svg id="center-reticle" className={c('center-reticle')} viewBox="0 0 22 22" aria-hidden="true" focusable="false">
    <path d={cross} stroke="#02090dc9" strokeWidth="3" />
    <path d={cross} stroke="#ebf8efb3" strokeWidth="1" />
  </svg>;
}
