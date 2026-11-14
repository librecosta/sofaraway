import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { QualityTier, VolumeId } from '../game/contracts';
import { referenceFor, START_DISTANCE } from '../game/core/reference-track';
import { drumOnsets, drumPulse, dynamicLightEnvelope, steadyLights } from '../game/core/rhythmic-lights';
import { sectionAt, volumeById, VOLUMES } from '../game/core/volumes';
import type { ScenicPreview } from '../game/debug/scenic-preview.client';
import s from '../styles/debug.module.css';

const motionQuery = '(prefers-reduced-motion: reduce)';
const reducedMotion = () => window.matchMedia(motionQuery).matches;
function lastOnset(events: ReturnType<typeof drumOnsets>, time: number) {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].time <= time) return events[i];
}

function subscribeMotion(change: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', change);
  return () => media.removeEventListener('change', change);
}

export function BeatInspection() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<ScenicPreview>(null);
  const shownBeat = useRef(222);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Loading the live corridor…');
  const [id, setId] = useState<VolumeId>('elsewhere');
  const [beat, setBeat] = useState(222);
  const [station, setStation] = useState(referenceFor(VOLUMES[0]).station(222, 'standard'));
  const [quality, setQuality] = useState<QualityTier>('high');
  const [dynamic, setDynamic] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sample, setSample] = useState({ ...steadyLights, beat: 222 });
  const reduced = useSyncExternalStore(subscribeMotion, reducedMotion, () => false);
  const volume = volumeById(id);
  const maxStation = referenceFor(volume).station(volume.beats, 'standard');
  const sections = volume.sections.map((section, index) => ({
    ...section, start: volume.sections.slice(0, index).reduce((sum, part) => sum + part.beats, 0),
  }));
  const section = sectionAt(volume, beat)!;
  const secondsPerBeat = 60 / volume.bpm;
  const events = drumOnsets(volume);
  const local = events.filter(event => event.time >= section.start * secondsPerBeat && event.time < section.end * secondsPerBeat);
  const nearest = (kind: 'kick' | 'snare' | 'fill') => {
    let closest: number | undefined;
    let distance = Infinity;
    for (const event of local) {
      const gap = Math.abs(event.time - beat * secondsPerBeat);
      if (event.kind === kind && gap <= distance) { closest = event.time / secondsPerBeat; distance = gap; }
    }
    return closest;
  };
  const kick = nearest('kick'), snare = nearest('snare'), fill = nearest('fill');
  const valley = () => {
    const time = beat * secondsPerBeat;
    const stronger = local.filter(event => event.kind !== 'fill');
    const start = lastOnset(stronger, time)?.time ?? section.start * secondsPerBeat;
    const end = stronger.find(event => event.time > time)?.time ?? section.end * secondsPerBeat;
    let low = start, minimum = Infinity;
    for (let at = start; at < end; at += secondsPerBeat / 80) {
      const pulse = drumPulse(volume, at);
      if (pulse <= minimum) { low = at; minimum = pulse; }
    }
    return low / secondsPerBeat;
  };
  const sampledTime = sample.beat * secondsPerBeat;
  const recent = lastOnset(events, sampledTime + 1e-8);
  const drums = events.filter(event => event.time === recent?.time).map(event => event.kind).join(' + ');

  useEffect(() => {
    let stale = false;
    void import('../game/debug/scenic-preview.client').then(({ ScenicPreview }) => {
      if (stale || !canvas.current) return;
      viewer.current = new ScenicPreview(canvas.current, restored => {
        setReady(restored);
        setPlaying(false);
        setBeat(shownBeat.current);
        setStatus(restored ? '' : 'WebGL interrupted. Waiting to restore this scene.');
      });
      setReady(true);
      setStatus('');
    }).catch(() => { if (!stale) setStatus('A working WebGL2 renderer is required.'); });
    return () => {
      stale = true;
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    viewer.current?.configure(quality, window.devicePixelRatio);
    viewer.current?.select({ label: volume.name, beat: 0 }, 'standard', 0, id, station);
  }, [ready, quality, id, station, volume.name]);

  useEffect(() => {
    if (!ready) return;
    const dynamics = { ...steadyLights };
    const draw = (value: number, publish: boolean) => {
      shownBeat.current = value;
      dynamicLightEnvelope(volume, value * 60 / volume.bpm, Number(dynamic), reduced, dynamics);
      const metrics = viewer.current?.draw({ beat: value, dynamics });
      if (metrics && canvas.current) Object.assign(canvas.current.dataset, {
        gains: JSON.stringify(dynamics), dpr: String(metrics.dpr), resources: JSON.stringify(
          [metrics.calls, metrics.programs, metrics.textures, metrics.geometries]),
      });
      if (publish) setSample({ ...dynamics, beat: value });
    };
    draw(beat, true);
    if (!playing) return;
    const start = performance.now();
    let frame = 0, last = start;
    const tick = (now: number) => {
      const value = Math.min(section.end - .0001, beat + (now - start) * volume.bpm / 60000);
      const ended = value >= section.end - .0001;
      const publish = ended || now - last >= 100;
      draw(value, publish);
      if (publish) last = now;
      if (ended) { setPlaying(false); setBeat(value); }
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, quality, id, station, volume, beat, section.end, dynamic, reduced, playing]);

  function seek(value: number) {
    setPlaying(false);
    setBeat(value);
  }

  function chooseSection(nextId: VolumeId, start: number) {
    setId(nextId);
    const next = volumeById(nextId);
    const cue = sectionAt(next, start)!;
    const at = Math.min(cue.end - 1, start + Math.min(30, Math.floor(cue.beats / 2)));
    seek(at);
    if (nextId !== id) setStation(referenceFor(next).station(at, 'standard'));
  }

  return <div className={s.scenicDesk}>
    <div className={s.scenicView}>
      <canvas ref={canvas} className={s.preview} width={800} height={450} role="img" aria-label="Live beat inspection" />
      {status && <p role="status">{status}</p>}
    </div>
    <div className={s.scenicControls}>
      <label>Volume <select aria-label="Volume" value={id} onChange={e => {
        const next = e.currentTarget.value as VolumeId;
        chooseSection(next, next === 'elsewhere' ? 192 : volumeById(next).sections[0].beats);
      }}>{VOLUMES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Section <select aria-label="Section" value={section.start} onChange={e => chooseSection(id, Number(e.currentTarget.value))}>
        {sections.map(item => <option key={item.name} value={item.start}>{item.name}</option>)}
      </select></label>
      <label>Beat <input type="range" min={section.start} max={section.end - .0001} step=".0001" value={beat}
        onChange={e => seek(e.currentTarget.valueAsNumber)} /></label>
      <label>World Station <input type="range" min={START_DISTANCE} max={maxStation} step=".01" value={station}
        onChange={e => setStation(e.currentTarget.valueAsNumber)} /></label>
      <span>{station.toFixed(2)} world units</span>
      <button onClick={() => setStation(referenceFor(volume).station(shownBeat.current, 'standard'))}>Go to beat’s station</button>
      <label>Quality <select aria-label="Quality" value={quality} onChange={e => setQuality(e.currentTarget.value as QualityTier)}>
        <option value="high">High</option><option value="low">Low</option>
      </select></label>
      <label>Dynamic <select aria-label="Dynamic" value={dynamic ? 'on' : 'off'} onChange={e => {
        if (playing) seek(shownBeat.current);
        setDynamic(e.currentTarget.value === 'on');
      }}><option value="off">Off</option><option value="on">On</option></select></label>
      <div className={s.channelControls} role="group" aria-label="Beat phase">
        <button disabled={!ready || kick === undefined} onClick={() => seek(kick!)}>Kick Peak</button>
        <button disabled={!ready || snare === undefined} onClick={() => seek(snare!)}>Snare Peak</button>
        {id === 'drift' && <button disabled={!ready || fill === undefined} onClick={() => seek(fill!)}>Fill Peak</button>}
        <button disabled={!ready || (kick === undefined && snare === undefined)} onClick={() => seek(valley())}>Beat Valley</button>
        <button disabled={!ready} onClick={() => playing ? seek(shownBeat.current) : setPlaying(true)}>
          {playing ? 'Pause' : 'Play continuously'}
        </button>
      </div>
      <output aria-live="off">
        Beat {sample.beat.toFixed(4)} · {volume.bpm} BPM<br />
        {!recent ? 'No drums yet' : `${Math.abs(sampledTime - recent.time) < .0002 ? 'At' : 'Last'} ${drums} · ${recent.time.toFixed(4)} s`}
        <br />Pulse {sample.pulse.toFixed(3)} · Amount {sample.amount.toFixed(2)}
        <br />Fixture {sample.fixtureGain.toFixed(3)}× · Rim {sample.rimGain.toFixed(3)}×
        <br />Physical {sample.physicalGain.toFixed(3)}×
        <br />Reduced Motion {reduced ? 'active · baseline lighting' : 'off'}
      </output>
    </div>
  </div>;
}
