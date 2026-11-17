import { useEffect, useRef, useState } from 'react';
import type { QualityTier } from '../game/contracts';
import { branchLayout } from '../game/core/branches';
import type { RouteKind, RouteSide } from '../game/core/branches';
import { facilityStages } from '../game/core/descent-facility';
import { descentCargo, descentJunction } from '../game/core/descent-routes';
import { controlTrack } from '../game/core/descent-score';
import { referenceFor } from '../game/core/reference-track';
import { dynamicLightEnvelope } from '../game/core/rhythmic-lights';
import { CAPTURE_RUN_SEED } from '../game/core/run-seed';
import { volumeById } from '../game/core/volumes';
import type { ScenicPreview } from '../game/debug/scenic-preview.client';
import s from '../styles/debug.module.css';

const descent = volumeById('descent');
const offsets = [16, 7, 21, 31, 15, 26, 25];
const layout = branchLayout(CAPTURE_RUN_SEED);
const junctionViews: readonly { label: string; beat: number; route?: RouteKind }[] = [
  { label: 'Approach', beat: descentJunction.split - .8 },
  { label: 'Main spine', beat: 148, route: 'main' },
  { label: 'Challenge guideway', beat: 151, route: 'challenge' },
  { label: 'Bonus guideway', beat: 151, route: 'score' },
  { label: 'Supply carrier', beat: descentCargo.beat - .9, route: 'score' },
  { label: 'Merge', beat: descentJunction.rejoin - 2.2, route: 'challenge' },
];

export function DescentFacilityPreview() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const [section, setSection] = useState(1);
  const [junction, setJunction] = useState(-1);
  const [boost, setBoost] = useState(false);
  const [dynamic, setDynamic] = useState(true);
  const [lightOffset, setLightOffset] = useState(0);
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
  const view = junctionViews[junction];
  const label = view?.label ?? facilityStages[section].name;
  const beat = view?.beat ?? chapter.startBeat + offsets[section];
  const side: RouteSide | undefined = view?.route === 'main' ? 'center'
    : view?.route && (layout.left === view.route ? 'left' : 'right');
  const station = referenceFor(descent).station(beat, 'standard');
  useEffect(() => {
    if (!ready || !viewer.current) return;
    const preview = viewer.current;
    preview.configure(quality, window.devicePixelRatio);
    preview.select({ label, beat, boost, side }, 'standard', beat, 'descent', station);
  }, [ready, quality, label, beat, boost, side, station]);
  useEffect(() => {
    if (!ready || !viewer.current) return;
    const lightBeat = beat + lightOffset;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    viewer.current.draw({ beat: lightBeat,
      dynamics: dynamicLightEnvelope(descent, lightBeat * 60 / descent.bpm, Number(dynamic), reduced) });
  }, [ready, quality, beat, boost, side, lightOffset, dynamic]);

  return <section id="descent" className={s.section}>
    <h2>DESCENT facility</h2>
    <div className={s.scenicDesk}>
      <div className={s.scenicView}>
        {open ? <canvas ref={canvas} className={s.preview} width={800} height={450} role="img" aria-label="Live DESCENT facility" />
          : <button type="button" className={s.scan} onClick={() => setOpen(true)}>Open live facility</button>}
        {status && <p role="status">{status}</p>}
      </div>
      <div className={s.scenicControls}>
        <label>CONTROL chapter <select value={section} onChange={event => {
          setSection(Number(event.currentTarget.value));
          setJunction(-1);
          setLightOffset(0);
        }}>
          {controlTrack.sections.map(({ name }, i) => <option key={name} value={i}>{name} · {facilityStages[i].name}</option>)}
        </select></label>
        <label>Transfer chamber <select value={junction} onChange={event => {
          setJunction(Number(event.currentTarget.value));
          setLightOffset(0);
        }}>
          <option value="-1">Chapter camera</option>
          {junctionViews.map(({ label }, i) => <option key={label} value={i}>{label}</option>)}
        </select></label>
        <label>Facility quality <select value={quality} onChange={event => setQuality(event.currentTarget.value as QualityTier)}>
          <option value="low">Low</option><option value="auto">Auto</option><option value="high">High</option>
        </select></label>
        <label><input type="checkbox" checked={boost} onChange={event => setBoost(event.currentTarget.checked)} /> Boost view</label>
        <label><input type="checkbox" checked={dynamic} onChange={event => setDynamic(event.currentTarget.checked)} /> Dynamic lights</label>
        <label>Light beat offset <input type="range" min="0" max="4" step=".0625" value={lightOffset}
          onChange={event => setLightOffset(event.currentTarget.valueAsNumber)} /></label>
        <a href={`/?vol=descent&t=${(beat * 60 / descent.bpm).toFixed(4)}&align=1&q=${quality}&lights=${dynamic}${side ? `&route=${side}` : ''}${boost ? '&boost=1' : ''}`}>Open the game view</a>
        <a href="#gates-descent">Inspect the holographic glass gates</a>
      </div>
    </div>
  </section>;
}
