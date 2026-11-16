import { useEffect, useRef, useState } from 'react';
import type { Difficulty, GameSnapshot, PlayMode, QualityTier } from '../game/contracts';
import { ROUTE_LABELS } from '../game/core/branches';
import type { RouteKind } from '../game/core/branches';
import { sections as daybreakSections } from '../game/core/daybreak-score';
import { modeScale } from '../game/core/reference-track';
import { volumeById } from '../game/core/volumes';
import { exteriorViews, movements, outroPresets, outroVolume, previewResults, resultPresets } from '../game/debug/outro-inspection';
import type { ExteriorView, OutroInspection, OutroMovement, OutroPreset } from '../game/debug/outro-inspection';
import type { OutroPreview } from '../game/debug/outro-preview.client';
import { cirrusLayers } from '../game/graphics/daybreak-cirrus';
import type { CirrusLayer } from '../game/graphics/daybreak-cirrus';
import s from '../styles/debug.module.css';
import { ResultsScreen } from './ResultsScreen';

const routes = ['main', 'challenge', 'score'] as const;
const noAction = () => {};

export function EndSequenceStudio() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const continuity = useRef<HTMLOutputElement>(null);
  const viewer = useRef<OutroPreview>(null);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<PlayMode>('standard');
  const [volume, setVolume] = useState(outroVolume);
  const daybreak = volume.id === 'daybreak';
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [route, setRoute] = useState<RouteKind>('main');
  const [seed, setSeed] = useState(0);
  const [inspection, setInspection] = useState<OutroInspection>();
  const [preset, setPreset] = useState<OutroPreset | ''>('main-last');
  const [station, setStation] = useState(0);
  const [beat, setBeat] = useState(416);
  const [angle, setAngle] = useState(0);
  const [exteriorView, setExteriorView] = useState<ExteriorView>('Forward');
  const [cirrusLayer, setCirrusLayer] = useState<CirrusLayer>('Composite');
  const [quality, setQuality] = useState<QualityTier>('high');
  const [dynamic, setDynamic] = useState(false);
  const [movement, setMovement] = useState<OutroMovement>('Paused');
  const [flying, setFlying] = useState(false);
  const [roam, setRoam] = useState<{ phase: 'menu' | 'results'; minutes: number }>();
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
      }, summary => { if (continuity.current) continuity.current.textContent = summary; });
      const next = viewer.current.select(mode, seed, route, difficulty, volume);
      setInspection(next);
      if (!inspection) setStation(next.view('main-last').station);
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
    if (available) {
      viewer.current?.setQuality(quality);
      viewer.current?.setDynamic(daybreak && dynamic);
      viewer.current?.setExteriorView(exteriorView);
      viewer.current?.setCirrusLayer(cirrusLayer);
    }
  }, [available, quality, daybreak, dynamic, exteriorView, cirrusLayer]);

  useEffect(() => {
    if (!available || !inspection || flying) return;
    if (roam) viewer.current?.roam(roam.phase, roam.minutes, angle);
    else viewer.current?.draw(station, beat, movement, angle, preset === 'results-world');
  }, [available, inspection, station, beat, movement, angle, flying, preset, roam]);

  useEffect(() => {
    if (!available || !inspection || !flying || movement === 'Paused') return;
    const start = performance.now();
    const speed = inspection.state(station, beat, movement).speed;
    let frame = 0;
    const draw = (now: number) => {
      const elapsed = Math.min(10, (now - start) / 1000);
      const songTimeLeft = Math.max(0, (volume.beats - beat) * 60 / volume.bpm);
      const distance = inspection.stationAfter(station, speed * (daybreak ? Math.min(elapsed, songTimeLeft) : elapsed));
      const musicBeat = beat + elapsed * volume.bpm / 60;
      viewer.current?.draw(distance, daybreak ? musicBeat : Math.min(volume.beats, musicBeat), movement, angle);
      if (elapsed < 10 && distance < inspection.max) frame = requestAnimationFrame(draw);
      else setFlying(false);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [available, inspection, flying, station, beat, movement, angle, volume, daybreak]);

  const resultDifficulty = mode === 'sightseeing' ? 'normal' : difficulty;
  useEffect(() => {
    setResult(previewResults(seed, resultPreset, resultDifficulty, volume));
  }, [seed, resultPreset, resultDifficulty, volume]);

  const view = inspection && preset ? inspection.view(preset) : undefined;
  const relative = inspection ? station - inspection.plan.mainLastStation : 0;
  const seek = (next: OutroPreset) => {
    if (!inspection) return;
    setRoam(undefined);
    setFlying(false);
    setPreset(next);
    const view = inspection.view(next);
    setStation(view.station);
    if ('musicBeat' in view && view.musicBeat !== undefined) setBeat(view.musicBeat);
    if (next === 'music-end') setBeat(volume.beats);
  };
  const changePlan = (nextMode: PlayMode, nextSeed: number, nextRoute: RouteKind, nextDifficulty = difficulty,
    nextVolume = volume, nextPreset = preset) => {
    setFlying(false);
    setRoam(undefined);
    const next = viewer.current?.select(nextMode, nextSeed, nextRoute, nextDifficulty, nextVolume);
    if (next) {
      const selected = nextVolume !== volume ? 'main-last' : nextMode === 'sightseeing' && nextPreset.startsWith('encore-')
        ? 'afterglow-entry' : nextPreset;
      setPreset(selected);
      const view = selected ? next.view(selected) : undefined;
      setStation(view ? view.station :
        Math.max(next.min, Math.min(next.max, next.plan.mainLastStation + relative * modeScale(nextMode) / modeScale(mode))));
      if (selected === 'branch' && view && 'musicBeat' in view && typeof view.musicBeat === 'number') setBeat(view.musicBeat);
      setInspection(next);
    }
    if (nextVolume !== volume) setBeat(nextVolume.beats - 16);
    setVolume(nextVolume);
    setMode(nextMode);
    setSeed(nextSeed);
    setRoute(nextRoute);
    setDifficulty(nextDifficulty);
  };

  return <section className={s.section} id="outro">
    <h2>End Sequence Studio</h2>
    <p>Inspect the last main gate, Encore and Afterglow. The score beat and world station can be set independently.</p>
    <div className={s.scenicDesk}>
      <div className={s.scenicView}>
        {!open && <button type="button" className={s.scan} onClick={() => setOpen(true)}>Open live ending</button>}
        {open && <div className={s.endingFrame}>
          <canvas className={s.preview} ref={canvas} width={800} height={450} role="img" aria-label={`Live ${volume.name} ending`} />
          <span className={s.endingWhite} aria-hidden="true" />
        </div>}
        {status && <p role="status">{status}</p>}
      </div>
      <div className={s.scenicControls}>
        <label>World <select aria-label="World" value={volume.id} onChange={e => {
          const next = volumeById(e.currentTarget.value);
          changePlan(mode, seed, route, 'normal', next);
        }}><option value="elsewhere">ELSEWHERE</option><option value="daybreak">DAYBREAK</option></select></label>
        <label>Play mode <select disabled={!available} value={mode} onChange={e => changePlan(e.currentTarget.value as PlayMode, seed, route)}>
          <option value="standard">Standard</option><option value="sightseeing">Sightseeing</option>
        </select></label>
        <label>Route <select aria-label="Route" disabled={!available} value={route} onChange={e => changePlan(mode, seed, e.currentTarget.value as RouteKind)}>
          {routes.map(value => <option key={value} value={value}>{ROUTE_LABELS[value]}</option>)}
        </select></label>
        <label>Chart difficulty <select disabled={mode === 'sightseeing'} value={mode === 'sightseeing' ? 'normal' : difficulty}
          onChange={e => changePlan(mode, seed, route, e.currentTarget.value as Difficulty)}>
          {daybreak && <option value="easy">Easy</option>}<option value="normal">Normal</option>
          {daybreak && <option value="hard">Hard</option>}<option value="impossible">Impossible</option>
        </select></label>
        <label>Run seed <input disabled={!available} className={s.seed} type="number" min="0" max="4294967294" step="1" value={seed}
          onChange={e => {
            const value = e.currentTarget.valueAsNumber;
            if (Number.isFinite(value)) changePlan(mode, Math.max(0, Math.min(4294967294, Math.trunc(value))), route);
          }} /></label>
        <label>Spatial position <input type="range" step="any" disabled={!available} value={relative}
          min={inspection ? inspection.min - inspection.plan.mainLastStation : -160}
          max={inspection ? inspection.max - inspection.plan.mainLastStation : 0}
          onChange={e => { setFlying(false); setRoam(undefined); setPreset(''); setStation(inspection!.plan.mainLastStation + e.currentTarget.valueAsNumber); }} />
          <output>{inspection ? `${relative.toFixed(1)} from main last · World station ${station.toFixed(2)}` : 'World station'}</output>
        </label>
        <label>Music beat <input type="range" min="0" max={volume.beats} step=".1" value={beat}
          onChange={e => { setFlying(false); setRoam(undefined); setBeat(e.currentTarget.valueAsNumber); }} /><output>{beat.toFixed(1)}</output></label>
        <label>Ending view angle <input type="range" min="-36" max="36" value={angle}
          onChange={e => setAngle(e.currentTarget.valueAsNumber)} /><output>{angle}°</output></label>
        <label>Preview quality <select value={quality} onChange={e => setQuality(e.currentTarget.value as QualityTier)}>
          <option value="high">High</option>{daybreak && <option value="auto">Auto</option>}<option value="low">Low</option>
        </select></label>
        {daybreak && <label><input type="checkbox" checked={dynamic} onChange={e => setDynamic(e.currentTarget.checked)} /> Dynamic Lights preview</label>}
        <label>Movement <select value={movement} onChange={e => { setFlying(false); setMovement(e.currentTarget.value as OutroMovement); }}>
          {movements.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <button className={s.scan} type="button" disabled={!available || movement === 'Paused' || !!roam} onClick={() => setFlying(!flying)}>
          {flying ? 'Stop and reset' : 'Play 10s'}
        </button>
        {open && <button className={s.scan} type="button" onClick={() => {
          setFlying(false); setAvailable(false); setStatus(''); setOpen(false);
        }}>Close live ending</button>}
      </div>
    </div>
    {daybreak && <fieldset className={s.curveControls}>
      <legend>DAYBREAK Exterior</legend>
      <label>Exterior view <select aria-label="Exterior view" value={exteriorView} onChange={e => setExteriorView(e.currentTarget.value as ExteriorView)}>
        {Object.keys(exteriorViews).map(view => <option key={view}>{view}</option>)}
      </select></label>
      <label>Cirrus layers <select value={cirrusLayer} onChange={e => setCirrusLayer(e.currentTarget.value as CirrusLayer)}>
        {cirrusLayers.map(layer => <option key={layer}>{layer}</option>)}
      </select></label>
      {daybreakSections.map(({ name, startBeat, endBeat }) => {
        const middle = (startBeat + endBeat) / 2;
        return <button type="button" className={s.scan} key={name} disabled={!available} aria-pressed={!roam && !preset && beat === middle}
          onClick={() => {
            setRoam(undefined);
            setFlying(false);
            setPreset('');
            setBeat(middle);
            setStation(inspection!.sim.reference.station(middle, mode));
          }}>{name} Atmosphere</button>;
      })}
    </fieldset>}
    <fieldset className={s.curveControls}>
      <legend>Course and ending positions</legend>
      {outroPresets.slice(0, daybreak ? undefined : 12).map(([id, label]) => <button type="button" className={s.scan} key={id} aria-pressed={!roam && preset === id}
        disabled={!available || (mode === 'sightseeing' && id.startsWith('encore-'))} onClick={() => seek(id)}>
        {daybreak && id === 'build' ? 'LIFT Gates' : daybreak && id === 'drop' ? 'SUNBURST Gates' : daybreak && id === 'finale' ? 'RETURN Gates' : label}</button>)}
    </fieldset>
    {daybreak && <fieldset className={s.curveControls}>
      <legend>Junction interiors</legend>
      {routes.map(value => <button type="button" className={s.scan} key={value} disabled={!available}
        aria-pressed={preset === 'branch' && route === value && !roam}
        onClick={() => changePlan(mode, seed, value, difficulty, volume, 'branch')}>{ROUTE_LABELS[value]} Interior</button>)}
    </fieldset>}
    {daybreak && <fieldset className={s.curveControls}>
      <legend>World Continuity</legend>
      {(['menu', 'results'] as const).flatMap(phase => [5, 15, 30].map(minutes => <button type="button" key={`${phase}-${minutes}`}
        className={s.scan} disabled={!available} aria-pressed={roam?.phase === phase && roam.minutes === minutes}
        onClick={() => { setFlying(false); setRoam({ phase, minutes }); }}>{phase === 'menu' ? 'Menu' : 'Results'} · {minutes} min</button>))}
      <output ref={continuity} />
    </fieldset>}
    {mode === 'sightseeing' && <p>Sightseeing continues directly to Afterglow after the transition.</p>}
    {view && 'gate' in view && view.gate && <p>Encore {view.gate.index + 1} · {view.gate.kind} · Gate station {view.gate.worldStation.toFixed(2)}</p>}
    <div className={s.surfaceSelect}>
      <label htmlFor="outro-result">Results preview</label>
      <select id="outro-result" value={resultPreset} onChange={e => setResultPreset(e.currentTarget.value as typeof resultPreset)}>
        {resultPresets.map(value => <option key={value} value={value}>
          {resultDifficulty === 'impossible' && value === 'Main Complete' ? 'Cruise Complete' : value}
        </option>)}
      </select>
    </div>
    {result && <ResultsScreen snapshot={result} restart={noAction} menu={noAction} preview />}
  </section>;
}
