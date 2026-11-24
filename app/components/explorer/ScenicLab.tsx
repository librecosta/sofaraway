import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { PlayMode } from '../../game/contracts';
import { lightPatterns, type LightPattern } from '../../game/core/lighting-score';
import { referenceFor, START_DISTANCE } from '../../game/core/reference-track';
import { drumOnsets, drumPulse, dynamicLightEnvelope, steadyLights } from '../../game/core/rhythmic-lights';
import { sectionAt, volumeById } from '../../game/core/volumes';
import { previewGameHref, previewNumber, previewQuality, stationBeat } from '../../game/debug/explorer-scene';
import { exteriorViews } from '../../game/debug/outro-inspection';
import { curveExamples, scenicExamples, type ScenicExample } from '../../game/debug/scenic-catalog';
import type { ScenicPreview } from '../../game/debug/scenic-preview.client';
import { cirrusLayers, type CirrusLayer } from '../../game/graphics/daybreak-cirrus';
import { SceneControls, SceneGroup, SceneQuality, SceneViewport, type LabMode } from './LiveScene';
import s from '../../styles/explorer-lab.module.css';

const motionQuery = '(prefers-reduced-motion: reduce)';
const degrees = Math.PI / 180;
const skyglassViews = { ...exteriorViews, 'Cabin roof': [9, 53, 0] } as const;
type SkyglassView = keyof typeof skyglassViews;
const patternLabels: Record<LightPattern, string> = {
  'single-color': 'Game · single color',
  'dual-color': 'Experiment · dual color',
};

export default function ScenicLab({ id, lab, anchor }: {
  id: 'elsewhere' | 'daybreak'; lab: LabMode; anchor: string;
}) {
  const [params] = useSearchParams();
  const volume = volumeById(id);
  const reference = referenceFor(volume);
  const lighting = lab === 'lighting';
  const skyglass = id === 'daybreak';
  const beatInspection = anchor === '#beat-inspection';
  const initialCamera = anchor === '#environment' ? 'Cloud Sea' : 'Forward';
  const maxBeat = volume.beats - .001;
  const secondsPerBeat = 60 / volume.bpm;
  const chapterStarts = volume.sections.map((_, i) => volume.sections.slice(0, i).reduce((sum, part) => sum + part.beats, 0));
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<ScenicPreview>(null);
  const initialBeat = beatInspection && !skyglass ? 222 : skyglass ? 6 : 5;
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState(() => ({
    station: previewNumber(params, 'station', reference.station(initialBeat, 'standard'), START_DISTANCE, reference.station(maxBeat, 'standard')),
    beat: previewNumber(params, 'beat', initialBeat, 0, maxBeat), quality: previewQuality(params, beatInspection ? 'high' : 'auto'),
    dynamic: !beatInspection, reduced: false, mode: 'standard' as PlayMode,
    yaw: skyglass ? 0 : previewNumber(params, 'view', 0, -36, 36),
    camera: (Object.keys(skyglassViews).find(key => key === params.get('view')) ?? initialCamera) as SkyglassView,
    layer: 'Composite' as CirrusLayer, pattern: 'single-color' as LightPattern, preset: 'Pure Frame', boost: false,
  }));
  const [shown, setShown] = useState({ station: view.station, beat: view.beat, seconds: view.beat * secondsPerBeat });
  const playhead = useRef(shown);
  const startTime = useRef(0);
  const [sample, setSample] = useState({ ...steadyLights, reduced: false });
  const [zone, setZone] = useState('');
  const maximum = reference.station(maxBeat, view.mode);
  const position = playing ? shown.station : view.station;
  const lightBeat = playing ? shown.beat : view.beat;
  const cue = sectionAt(volume, Math.min(lightBeat, maxBeat))!;
  const worldCue = sectionAt(volume, Math.min(stationBeat(volume, position, view.mode), maxBeat))!;
  const examples = skyglass ? [] : scenicExamples;
  const example = examples.find(candidate => candidate.label === view.preset);
  const onsetEvents = drumOnsets(volume);
  const localEvents = onsetEvents.filter(event => event.time >= cue.start * secondsPerBeat && event.time < cue.end * secondsPerBeat);
  const recent = onsetEvents.filter(event => event.time <= shown.beat * secondsPerBeat + 1e-8).at(-1);
  const recentDrums = onsetEvents.filter(event => event.time === recent?.time).map(event => event.kind).join(' + ');
  const dual = zone === 'staggered-cells' || zone === 'connected-flow';

  useEffect(() => {
    if (!open) return;
    let stale = false;
    const element = canvas.current!;
    void import('../../game/debug/scenic-preview.client').then(({ ScenicPreview }) => {
      if (stale) return;
      viewer.current = new ScenicPreview(element, restored => {
        setReady(restored);
        setPlaying(false);
        if (!restored) setView(previous => ({ ...previous, station: playhead.current.station, beat: playhead.current.beat }));
        setStatus(restored ? '' : 'Waiting to restore the current WebGL scene.');
      });
      setReady(true);
      setStatus('');
    }).catch(() => {
      if (!stale) setStatus('Could not open the scene. A working WebGL2 renderer is required.');
    });
    return () => { stale = true; viewer.current?.dispose(); viewer.current = null; };
  }, [open, attempt]);

  useEffect(() => {
    if (ready) viewer.current?.configure(view.quality, window.devicePixelRatio);
  }, [ready, view.quality]);

  useEffect(() => {
    if (!ready || !viewer.current) return;
    const selected = viewer.current.select({ label: example?.label ?? volume.name, beat: 0,
      side: example?.side, boost: view.boost }, view.mode, 0, id, view.station);
    startTime.current = selected.seconds;
  }, [ready, volume.name, id, view.mode, view.station, example, view.boost]);

  useEffect(() => {
    const preview = viewer.current;
    if (!ready || !preview) return;
    preview.setCirrusLayer(view.layer);
    const motion = matchMedia(motionQuery);
    const [yaw, pitch, cameraLift] = skyglassViews[view.camera];
    const dynamics = { ...steadyLights };
    const draw = (beat: number, station: number, seconds: number, publish: boolean) => {
      const reduced = view.reduced || motion.matches;
      dynamicLightEnvelope(volume, beat * secondsPerBeat, Number(view.dynamic), reduced, dynamics);
      const metrics = preview.draw({ beat, exteriorBeat: beat, dynamics, reducedMotion: reduced,
        yaw: (yaw + view.yaw) * degrees, pitch: pitch * degrees, cameraLift, pattern: view.pattern });
      playhead.current = { beat, station, seconds };
      if (metrics && canvas.current) Object.assign(canvas.current.dataset, {
        gains: JSON.stringify(dynamics), dpr: String(metrics.dpr), resources: JSON.stringify(
          [metrics.calls, metrics.programs, metrics.textures, metrics.geometries]),
      });
      if (publish) {
        setShown(playhead.current);
        setSample({ ...dynamics, reduced });
        setZone(metrics?.scenicLights?.zone ?? '');
      }
    };
    const repaint = () => draw(playhead.current.beat, playhead.current.station, playhead.current.seconds, true);
    draw(view.beat, view.station, startTime.current, true);
    motion.addEventListener('change', repaint);
    let frame = 0;
    const pauseWhenHidden = () => {
      if (!document.hidden || !playing) return;
      setPlaying(false);
      setView(previous => ({ ...previous, station: playhead.current.station, beat: playhead.current.beat }));
    };
    if (playing) {
      document.addEventListener('visibilitychange', pauseWhenHidden);
      const started = performance.now();
      let last = started;
      const update = (now: number) => {
        const elapsed = (now - started) / 1000;
        const seconds = startTime.current + elapsed;
        const station = lighting ? view.station : preview.advance(seconds, view.boost) ?? view.station;
        const beat = Math.min(maxBeat, view.beat + elapsed / secondsPerBeat);
        const finished = lighting ? beat >= maxBeat : station >= maximum || beat >= maxBeat;
        draw(beat, station, seconds, finished || now - last >= 100);
        if (now - last >= 100) last = now;
        if (finished) {
          setPlaying(false);
          setView(previous => ({ ...previous, beat, station: Math.min(maximum, station) }));
        } else frame = requestAnimationFrame(update);
      };
      frame = requestAnimationFrame(update);
    }
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener('change', repaint);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
    };
  }, [ready, playing, view, volume, lighting, secondsPerBeat, maxBeat, maximum]);

  function change(next: Partial<typeof view>) {
    if (playing) setPlaying(false);
    setView(previous => ({ ...previous, ...(playing ? { station: playhead.current.station, beat: playhead.current.beat } : {}), ...next }));
  }

  function setStation(station: number, preset = view.preset) {
    change({ station, preset, pattern: 'single-color', ...(preset === '' && { boost: false }),
      ...(!lighting && { beat: stationBeat(volume, station, view.mode) }) });
  }

  function choose(next: ScenicExample) {
    let station = reference.station(next.beat, view.mode);
    if (viewer.current && ready) {
      station = viewer.current.select(next, view.mode, next.beat, id).station;
    }
    change({ station, preset: next.curveT === undefined ? next.label : 'S-Curve', yaw: 0,
      boost: !!next.boost, pattern: 'single-color', ...(!lighting && { beat: next.beat }) });
  }

  function reset() {
    change({ station: reference.station(initialBeat, 'standard'), beat: initialBeat, quality: 'auto', dynamic: !beatInspection,
      reduced: false, mode: 'standard', yaw: 0, camera: 'Forward', layer: 'Composite', pattern: 'single-color', preset: 'Pure Frame', boost: false });
  }

  function peak(kind: 'kick' | 'snare' | 'fill') {
    return localEvents.filter(event => event.kind === kind).reduce<number | undefined>((nearest, event) => {
      const beat = event.time / secondsPerBeat;
      return nearest === undefined || Math.abs(beat - shown.beat) <= Math.abs(nearest - shown.beat) ? beat : nearest;
    }, undefined);
  }

  function valley() {
    const time = shown.beat * secondsPerBeat;
    const stronger = localEvents.filter(event => event.kind !== 'fill');
    const start = stronger.filter(event => event.time <= time).at(-1)?.time ?? cue.start * secondsPerBeat;
    const end = stronger.find(event => event.time > time)?.time ?? cue.end * secondsPerBeat;
    let low = start, minimum = Infinity;
    for (let at = start; at < end; at += secondsPerBeat / 80) {
      const pulse = drumPulse(volume, at);
      if (pulse <= minimum) { low = at; minimum = pulse; }
    }
    change({ beat: low / secondsPerBeat });
  }

  const snapshot = new URLSearchParams({ vol: id, station: shown.station.toFixed(3), beat: shown.beat.toFixed(3),
    q: view.quality, view: skyglass ? view.camera : String(view.yaw) });
  return <section className={s.preview} id={lighting ? 'lighting' : skyglass ? 'daybreak-cabin' : 'volumes'}>
    <SceneViewport volume={id} label={lighting ? `Live ${volume.name} lighting` : `Live ${volume.name} world`}
      canvas={canvas} open={open} status={status} onOpen={() => {
        setReady(false); setStatus('Loading live scene…'); setOpen(true); setAttempt(value => value + 1);
      }} />
    <SceneControls>
      <SceneGroup title="Scene">
        <label>{lighting ? 'World chapter' : 'Chapter'}<select aria-label={lighting ? 'World chapter' : 'Chapter'} value={worldCue.start}
          onChange={event => {
            const at = sectionAt(volume, Number(event.currentTarget.value))!;
            setStation(reference.station(at.start + Math.min(at.beats / 2, 12), view.mode), '');
          }}>
          {volume.sections.map((part, i) => <option key={part.name} value={chapterStarts[i]}>{part.name}</option>)}
        </select></label>
        {!skyglass && <>
          <label>Corridor type<select value={view.preset} onChange={event => {
            const next = examples.find(item => item.label === event.currentTarget.value);
            if (next) choose(next);
            else if (event.currentTarget.value === 'S-Curve') choose(curveExamples[0]);
          }}>
            <option value="">Chapter camera</option>
            {examples.map(item => <option key={item.label}>{item.label}</option>)}
            <option>S-Curve</option>
          </select></label>
          <label>Play mode<select value={view.mode} onChange={event => {
            const mode = event.currentTarget.value as PlayMode;
            change({ mode, station: reference.station(stationBeat(volume, shown.station, view.mode), mode) });
          }}><option value="standard">Standard</option><option value="sightseeing">Sightseeing</option></select></label>
        </>}
        <label>World station<input aria-label="World station" type="range" min={START_DISTANCE} max={maximum} step="any"
          value={position} onInput={event => setStation(event.currentTarget.valueAsNumber)} />
          <span>{position.toFixed(2)} world units</span></label>
        <div className={s.actions}>
          <button type="button" disabled={!ready} onClick={() => playing ? change({}) : setPlaying(true)}>
            {playing ? 'Pause' : lighting ? 'Play continuously' : 'Play flight'}
          </button>
          <button type="button" onClick={reset}>Reset</button>
          <a href={previewGameHref(id, shown.seconds, view.quality, view.dynamic, view.mode, example?.side, view.boost)}>Open in game</a>
          <a href={`/debug/${lab}/?${snapshot}`}>Link to this view</a>
        </div>
      </SceneGroup>
      {!skyglass && <details className={s.details} open={anchor === '#s-curve' || undefined}>
        <summary>Corridor camera and S-Curve</summary>
        <SceneGroup title="S-Curve Preview" id="s-curve">
          {curveExamples.map(next => <button type="button" key={next.label} disabled={!ready} onClick={() => choose(next)}>{next.label}</button>)}
          <label>Camera yaw<input type="range" min="-36" max="36" value={view.yaw}
            onChange={event => change({ yaw: event.currentTarget.valueAsNumber })} /></label>
        </SceneGroup>
      </details>}
      <SceneGroup title="Camera and quality">
        {skyglass && <>
          <label>Camera view<select value={view.camera} onChange={event => change({ camera: event.currentTarget.value as SkyglassView })}>
            {Object.keys(skyglassViews).map(name => <option key={name}>{name}</option>)}
          </select></label>
          <label>Cirrus layers<select value={view.layer} onChange={event => change({ layer: event.currentTarget.value as CirrusLayer })}>
            {cirrusLayers.map(layer => <option key={layer}>{layer}</option>)}
          </select></label>
        </>}
        <SceneQuality quality={view.quality} change={quality => change({ quality })} />
      </SceneGroup>
      {lighting && <>
        <SceneGroup title="Music lighting">
          <label>Section<select aria-label="Section" value={cue.start} onChange={event => {
            const section = sectionAt(volume, Number(event.currentTarget.value))!;
            change({ beat: section.start + Math.min(30, Math.floor(section.beats / 2)) });
          }}>{volume.sections.map((part, i) => <option key={part.name} value={chapterStarts[i]}>{part.name}</option>)}</select></label>
          <label>Music beat<input aria-label="Music beat" type="range" min="0" max={maxBeat} step="any"
            value={lightBeat} onInput={event => change({ beat: event.currentTarget.valueAsNumber })} />
            <span>Beat {lightBeat.toFixed(3)}</span></label>
          <label>Dynamic lighting<select aria-label="Dynamic lighting" value={view.dynamic ? 'on' : 'off'}
            onChange={event => change({ dynamic: event.currentTarget.value === 'on' })}>
            <option value="off">Off</option><option value="on">On</option>
          </select></label>
          <label><input type="checkbox" checked={view.reduced} onChange={event => change({ reduced: event.currentTarget.checked })} /> Reduced motion</label>
          {!skyglass && <label>Lighting pattern<select value={view.pattern} onChange={event => change({ pattern: event.currentTarget.value as LightPattern })}>
            {lightPatterns.map(pattern => <option key={pattern} value={pattern}
              disabled={pattern === 'dual-color' && !dual}>{patternLabels[pattern]}</option>)}</select></label>}
          <button type="button" onClick={() => setStation(reference.station(lightBeat, view.mode), '')}>Go to beat’s station</button>
          <button type="button" onClick={() => change({ beat: Math.min(maxBeat, playhead.current.seconds / secondsPerBeat) })}>Match beat to station</button>
        </SceneGroup>
        <SceneGroup title="Beat inspection" id="beat-inspection">
          {(['kick', 'snare', ...(skyglass ? ['fill'] : [])] as const).map(kind => {
            const beat = peak(kind as 'kick' | 'snare' | 'fill');
            return <button type="button" key={kind} disabled={!ready || beat === undefined}
              onClick={() => change({ beat: beat! })}>{kind[0].toUpperCase() + kind.slice(1)} Peak</button>;
          })}
          <button type="button" disabled={!ready || localEvents.length === 0} onClick={valley}>Beat Valley</button>
          <output aria-live="off">
            {recent && <>{Math.abs(shown.beat * secondsPerBeat - recent.time) < .0002 ? 'At' : 'Last'} {recentDrums} · {recent.time.toFixed(4)} s<br /></>}
            Fixture {sample.fixtureGain.toFixed(3)}× · Rim {sample.rimGain.toFixed(3)}× · Physical {sample.physicalGain.toFixed(3)}×<br />
            Pulse {drumPulse(volume, shown.beat * secondsPerBeat).toFixed(3)}<br />
            Reduced Motion {sample.reduced ? 'active · baseline lighting' : 'off'}
          </output>
          {!skyglass && <output>Hue {(Number(canvas.current?.dataset.hue ?? 0) * 360).toFixed(0)}°</output>}
        </SceneGroup>
      </>}
    </SceneControls>
  </section>;
}
