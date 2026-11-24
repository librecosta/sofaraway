import type { ReactNode, Ref } from 'react';
import type { QualityTier, VolumeId } from '../../game/contracts';
import s from '../../styles/explorer-lab.module.css';

export type LabMode = 'worlds' | 'lighting';

export function SceneViewport({ volume, label, canvas, open, onOpen, status, steerable }: {
  volume: VolumeId; label: string; canvas: Ref<HTMLCanvasElement>; open: boolean; onOpen(): void;
  status?: string; steerable?: boolean;
}) {
  return <div className={s.viewport}>
    {open
      ? <canvas ref={canvas} width={800} height={450} role="img" aria-label={label} tabIndex={steerable ? 0 : undefined}
          data-steerable={steerable || undefined} />
      : <><img src={`/explorer/${volume}.webp`} width={768} height={432} alt="" />
          <div className={s.cover}><button type="button" onClick={onOpen}>Open live scene</button></div></>}
    {status && open && <div className={s.status}>
      <p role="status">{status}</p>
      {status.startsWith('Could not') && <button type="button" onClick={onOpen}>Retry preview</button>}
    </div>}
  </div>;
}

export function SceneControls({ children }: { children: ReactNode }) {
  return <div className={s.controls}>{children}</div>;
}

export function SceneGroup({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <fieldset className={s.group} id={id}><legend>{title}</legend>{children}</fieldset>;
}

export function SceneQuality({ quality, change, label = 'Quality' }: {
  quality: QualityTier; change(quality: QualityTier): void; label?: string;
}) {
  return <label>{label}<select aria-label={label} value={quality} onChange={event => change(event.currentTarget.value as QualityTier)}>
    <option value="low">Low</option><option value="auto">Auto</option><option value="high">High</option>
  </select></label>;
}
