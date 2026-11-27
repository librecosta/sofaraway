import { useEffect, useRef, useState } from 'react';
import type { VolumeId } from '../../game/contracts';
import type { ModelPreviews } from '../../game/debug/previews.client';
import type { MaterialLibrary } from '../../game/graphics/materials/library.client';
import type { SurfaceChannel, SurfaceMaterialId } from '../../game/graphics/materials/presets';
import s from '../../styles/explorer-lab.module.css';

export function SpecimenCanvas({ id, label, open, axis, square }: {
  id: string; label: string; open?: number; axis?: number; square?: boolean;
}) {
  return <canvas className={s.specimenCanvas} data-preview={id} data-open={open} data-axis={axis}
    role="img" aria-label={label} width={square ? 256 : 432} height={square ? 256 : 270}>{label}</canvas>;
}

export function useSpecimens(kind: 'gates' | 'materials' | 'pickups', volume?: VolumeId, enabled = true) {
  const root = useRef<HTMLElement>(null);
  const model = useRef<ModelPreviews>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'lost' | 'unavailable'>('idle');
  const [raw, setRaw] = useState<((id: SurfaceMaterialId, channel: SurfaceChannel) => void) | undefined>();

  useEffect(() => {
    const container = root.current;
    if (!enabled || !container) return;
    let cancelled = false;
    let materials: MaterialLibrary | undefined;
    let viewer: ModelPreviews | undefined;
    setStatus('loading');
    const library = kind === 'materials' ? import('../../game/graphics/materials/library.client') : undefined;
    void Promise.all([import('../../game/debug/previews.client'), library]).then(([previews, library]) => {
      if (cancelled) return;
      if (library) {
        const owned = materials = new library.MaterialLibrary(true);
        setRaw(() => (id: SurfaceMaterialId, channel: SurfaceChannel) => previews.renderRawChannel(container, owned, id, channel));
      }
      try {
        const context = kind === 'gates' ? { kind, volume: volume! } as const
          : kind === 'materials' ? { kind, materials: materials! } as const : { kind } as const;
        viewer = new previews.ModelPreviews(container, context, restored => setStatus(restored ? 'ready' : 'lost'));
        if (kind === 'materials') viewer.drawMaterials();
        model.current = viewer;
        setStatus('ready');
      } catch {
        viewer?.dispose();
        viewer = undefined;
        if (materials) previews.renderRawSurfaces(container, materials);
        setStatus('unavailable');
      }
    }).catch(() => { if (!cancelled) setStatus('unavailable'); });
    return () => {
      cancelled = true;
      viewer?.dispose();
      materials?.dispose();
      model.current = null;
    };
  }, [kind, volume, enabled]);

  return { root, model, status, raw };
}

export function SpecimenStatus({ status }: { status: ReturnType<typeof useSpecimens>['status'] }) {
  if (status === 'loading') return <p role="status">Loading the 3D previews…</p>;
  if (status === 'lost') return <p role="status">Waiting for WebGL to restore the previews.</p>;
  if (status === 'unavailable') return <p role="status">WebGL2 is needed for 3D previews.</p>;
  return null;
}
