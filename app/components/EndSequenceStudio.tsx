import { useEffect, useRef, useState } from 'react';
import type { GameSnapshot, PlayMode, QualityTier } from '../game/contracts';
import { ROUTE_LABELS } from '../game/core/branches';
import type { RouteKind } from '../game/core/branches';
import { modeScale } from '../game/core/reference-track';
import { movements, outroPresets, outroView, outroVolume, previewResults, resultPresets } from '../game/debug/outro-inspection';
import type { OutroInspection, OutroMovement, OutroPreset } from '../game/debug/outro-inspection';
import type { OutroPreview } from '../game/debug/outro-preview.client';
import s from '../styles/debug.module.css';
import { ResultsScreen } from './ResultsScreen';

const routes = ['main', 'challenge', 'score'] as const;
const noAction = () => {};

export function EndSequenceStudio() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<OutroPreview>(null);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<PlayMode>('standard');
  const [route, setRoute] = useState<RouteKind>('main');
  const [seed, setSeed] = useState(0);
  const [inspection, setInspection] = useState<OutroInspection>();
  const [preset, setPreset] = useState<OutroPreset | ''>('main-last');
  const [station, setStation] = useState(0);
  const [beat, setBeat] = useState(416);
  const [angle, setAngle] = useState(0);
  const [quality, setQuality] = useState<QualityTier>('high');
  const [movement, setMovement] = useState<OutroMovement>('Paused');
  const [flying, setFlying] = useState(false);
  const [resultPreset, setResultPreset] = useState<typeof resultPresets[number]>('Main Complete');
  const [result, setResult] = useState<GameSnapshot>();

  useEffect(() => {
    if (!open) return;
    let stale = false;
    setStatus('Loading the live ending…');
    void import('../game/debug/outro-preview.client').then(({ OutroPreview }) => {
      if (stale || !canvas.current) return;
      viewer.current = new OutroPreview(canvas.current, restored => {
        if (!restored && viewer.current?.lastView) {
          const [distance, musicBeat] = viewer.current.lastView;
          setStation(distance);
          setBeat(musicBeat);
        }
        setFlying(false);
        setAvailable(restored);
        setStatus(restored ? '' : 'WebGL interrupted. Waiting to restore the ending.');
      });
      const next = viewer.current.select(mode, seed, route);
      setInspection(next);
      if (!inspection) setStation(outroView(next.plan, 'main-last').station);
      setStatus('');
      setAvailable(true);
    }).catch(() => {
      viewer.current?.dispose();
      viewer.current = null;
      if (!stale) setStatus('Live ending unavailable. This preview needs a working WebGL2 renderer.');
    });
    return () => {
      stale = true;
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (available) viewer.current?.setQuality(quality);
  }, [available, quality]);

  useEffect(() => {
    if (!available || !inspection || flying) return;
    viewer.current?.draw(station, beat, movement, angle);
  }, [available, inspection, station, beat, movement, angle, flying]);

  useEffect(() => {
    if (!available || !inspection || !flying || movement === 'Paused') return;
    const start = performance.now();
    const speed = inspection.state(station, beat, movement).speed;
    let frame = 0;
    const draw = (now: number) => {
      const elapsed = Math.min(10, (now - start) / 1000);
      const distance = Math.min(inspection.max, station + speed * elapsed);
      viewer.current?.draw(distance, Math.min(outroVolume.beats, beat + elapsed * outroVolume.bpm / 60), movement, angle);
      if (elapsed < 10 && distance < inspection.max) frame = requestAnimationFrame(draw);
      else setFlying(false);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [available, inspection, flying, station, beat, movement, angle]);

  useEffect(() => {
    setResult(previewResults(seed, resultPreset));
  }, [seed, resultPreset]);

  const view = inspection && preset ? outroView(inspection.plan, preset) : undefined;
  const relative = inspection ? station - inspection.plan.mainLastStation : 0;
  const seek = (next: OutroPreset) => {
    if (!inspection) return;
    setFlying(false);
    setPreset(next);
    setStation(outroView(inspection.plan, next).station);
    if (next === 'music-end') setBeat(outroVolume.beats);
  };
  const changePlan = (nextMode: PlayMode, nextSeed: number, nextRoute: RouteKind) => {
    setFlying(false);
    const next = viewer.current?.select(nextMode, nextSeed, nextRoute);
    if (next) {
      const selected = nextMode === 'sightseeing' && preset.startsWith('encore-') ? 'afterglow-entry' : preset;
      setPreset(selected);
      setStation(selected ? outroView(next.plan, selected).station :
        Math.max(next.min, Math.min(next.max, next.plan.mainLastStation + relative * modeScale(nextMode) / modeScale(mode))));
      setInspection(next);
    }
    setMode(nextMode);
    setSeed(nextSeed);
    setRoute(nextRoute);
  };

  return <section className={s.section} id="outro">
    <h2>End Sequence Studio</h2>
    <p>Inspect the last main gate, Encore and Afterglow. The score beat and world station can be set independently.</p>
    <div className={s.scenicDesk}>
      <div className={s.scenicView}>
        {!open && <button type="button" className={s.scan} onClick={() => setOpen(true)}>Open live ending</button>}
        {open && <canvas className={s.preview} ref={canvas} width={800} height={450} role="img" aria-label="Live ELSEWHERE ending" />}
        {status && <p role="status">{status}</p>}
      </div>
      <div className={s.scenicControls}>
        <label>Play mode <select disabled={!available} value={mode} onChange={e => changePlan(e.currentTarget.value as PlayMode, seed, route)}>
          <option value="standard">Standard</option><option value="sightseeing">Sightseeing</option>
        </select></label>
        <label>Route <select disabled={!available} value={route} onChange={e => changePlan(mode, seed, e.currentTarget.value as RouteKind)}>
          {routes.map(value => <option key={value} value={value}>{ROUTE_LABELS[value]}</option>)}
        </select></label>
        <label>Run seed <input disabled={!available} className={s.seed} type="number" min="0" max="4294967294" step="1" value={seed}
          onChange={e => {
            const value = e.currentTarget.valueAsNumber;
            if (Number.isFinite(value)) changePlan(mode, Math.max(0, Math.min(4294967294, Math.trunc(value))), route);
          }} /></label>
        <label>Spatial position <input type="range" step="any" disabled={!available} value={relative}
          min={inspection ? inspection.min - inspection.plan.mainLastStation : -160}
          max={inspection ? inspection.max - inspection.plan.mainLastStation : 0}
          onChange={e => { setFlying(false); setPreset(''); setStation(inspection!.plan.mainLastStation + e.currentTarget.valueAsNumber); }} />
          <output>{inspection ? `${relative.toFixed(1)} from main last · World station ${station.toFixed(2)}` : 'World station'}</output>
        </label>
        <label>Music beat <input type="range" min="0" max={outroVolume.beats} step=".1" value={beat}
          onChange={e => { setFlying(false); setBeat(e.currentTarget.valueAsNumber); }} /><output>{beat.toFixed(1)}</output></label>
        <label>Ending view angle <input type="range" min="-36" max="36" value={angle}
          onChange={e => setAngle(e.currentTarget.valueAsNumber)} /><output>{angle}°</output></label>
        <label>Preview quality <select value={quality} onChange={e => setQuality(e.currentTarget.value as QualityTier)}>
          <option value="high">High</option><option value="low">Low</option>
        </select></label>
        <label>Movement <select value={movement} onChange={e => { setFlying(false); setMovement(e.currentTarget.value as OutroMovement); }}>
          {movements.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <button className={s.scan} type="button" disabled={!available || movement === 'Paused'} onClick={() => setFlying(!flying)}>
          {flying ? 'Stop and reset' : 'Play 10s'}
        </button>
        {open && <button className={s.scan} type="button" onClick={() => {
          setFlying(false); setAvailable(false); setStatus(''); setOpen(false);
        }}>Close live ending</button>}
      </div>
    </div>
    <fieldset className={s.curveControls}>
      <legend>Ending positions</legend>
      {outroPresets.map(([id, label]) => <button type="button" className={s.scan} key={id} aria-pressed={preset === id}
        disabled={!available || (mode === 'sightseeing' && id.startsWith('encore-'))} onClick={() => seek(id)}>{label}</button>)}
    </fieldset>
    {mode === 'sightseeing' && <p>Sightseeing continues directly to Afterglow after the transition.</p>}
    {view?.gate && <p>Encore {view.gate.index + 1} · {view.gate.kind} · Gate station {view.gate.worldStation.toFixed(2)}</p>}
    <div className={s.surfaceSelect}>
      <label htmlFor="outro-result">Results preview</label>
      <select id="outro-result" value={resultPreset} onChange={e => setResultPreset(e.currentTarget.value as typeof resultPreset)}>
        {resultPresets.map(value => <option key={value}>{value}</option>)}
      </select>
    </div>
    {result && <ResultsScreen snapshot={result} restart={noAction} menu={noAction} preview />}
  </section>;
}
