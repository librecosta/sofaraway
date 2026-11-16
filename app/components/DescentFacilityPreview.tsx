import { useEffect, useRef, useState } from 'react';
import type { QualityTier } from '../game/contracts';
import { facilityStages } from '../game/core/descent-facility';
import { controlTrack } from '../game/core/descent-score';
import { referenceFor } from '../game/core/reference-track';
import { volumeById } from '../game/core/volumes';
import type { ScenicPreview } from '../game/debug/scenic-preview.client';
import s from '../styles/debug.module.css';

const descent = volumeById('descent');
const offsets = [16, 7, 21, 31, 15, 26, 25];

export function DescentFacilityPreview() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const [section, setSection] = useState(1);
  const [boost, setBoost] = useState(false);
  const [quality, setQuality] = useState<QualityTier>('high');
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<ScenicPreview>(null);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    void import('../game/debug/scenic-preview.client').then(({ ScenicPreview }) => {
      if (stale || !canvas.current) return;
      viewer.current = new ScenicPreview(canvas.current, restored => {
        setReady(restored);
        setStatus(restored ? '' : 'Waiting for WebGL to restore…');
      });
      setReady(true);
    }).catch(() => { if (!stale) setStatus('The facility preview needs a working WebGL2 renderer.'); });
    return () => { stale = true; viewer.current?.dispose(); viewer.current = null; };
  }, [open]);

  const chapter = controlTrack.sections[section];
  const label = facilityStages[section].name;
  const beat = chapter.startBeat + offsets[section];
  const station = referenceFor(descent).station(beat, 'standard');
  useEffect(() => {
    if (!ready || !viewer.current) return;
    const preview = viewer.current;
    preview.configure(quality, window.devicePixelRatio);
    preview.select({ label, beat, boost }, 'standard', beat, 'descent', station);
    preview.draw({ beat });
  }, [ready, quality, label, beat, boost, station]);

  return <section id="descent" className={s.section}>
    <h2>DESCENT facility</h2>
    <div className={s.scenicDesk}>
      <div className={s.scenicView}>
        {open ? <canvas ref={canvas} className={s.preview} width={800} height={450} role="img" aria-label="Live DESCENT facility" />
          : <button type="button" className={s.scan} onClick={() => setOpen(true)}>Open live facility</button>}
        {status && <p role="status">{status}</p>}
      </div>
      <div className={s.scenicControls}>
        <label>CONTROL chapter <select value={section} onChange={event => setSection(Number(event.currentTarget.value))}>
          {controlTrack.sections.map(({ name }, i) => <option key={name} value={i}>{name} · {facilityStages[i].name}</option>)}
        </select></label>
        <label>Facility quality <select value={quality} onChange={event => setQuality(event.currentTarget.value as QualityTier)}>
          <option value="low">Low</option><option value="auto">Auto</option><option value="high">High</option>
        </select></label>
        <label><input type="checkbox" checked={boost} onChange={event => setBoost(event.currentTarget.checked)} /> Boost view</label>
        <a href={`/?vol=descent&t=${(beat * 60 / descent.bpm).toFixed(4)}&align=1&q=${quality}`}>Open the game view</a>
        <a href="#gates-descent">Inspect the laser gates</a>
      </div>
    </div>
  </section>;
}
