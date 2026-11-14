import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { DaybreakStem } from '../../game/audio/daybreak.client';
import { InspectorTransport } from '../../game/debug/audio/inspector-transport.client';
import type { PlaybackState } from '../../game/debug/audio/inspector-transport.client';
import { defaultMix, trackInfo } from '../../game/debug/audio/track-adapter';
import type { InspectorScore, TrackId, TrackMix } from '../../game/debug/audio/track-adapter';
import { renderWaveforms } from '../../game/debug/audio/waveform.client';
import type { Waveforms } from '../../game/debug/audio/waveform.client';
import { TimelineRuler, Waveform, keyTime, pickTime, timecode } from './Timeline';
import s from '../../styles/audio-inspector.module.css';

const TrackWaveform = memo(Waveform);

function Glyph({ name }: { name: 'play' | 'pause' | 'stop' | 'rewind' }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round">
    {name === 'play' && <path d="M7 4.5 16 10l-9 5.5Z" fill="currentColor" />}
    {name === 'pause' && <path d="M7 4v12m6-12v12" strokeWidth="2.5" />}
    {name === 'stop' && <rect x="5" y="5" width="10" height="10" rx="1" />}
    {name === 'rewind' && <><path d="M4 4v12" /><path d="m14 5-7 5 7 5Z" /></>}
  </svg>;
}

export function AudioInspector({ score }: { score: InspectorScore }) {
  const [mix, setMix] = useState(defaultMix);
  const [solo, setSolo] = useState<DaybreakStem | null>(null);
  const [state, setState] = useState<PlaybackState>('Ready');
  const [audition, setAudition] = useState<TrackId | null>(null);
  const [selected, setSelected] = useState<TrackId>('master');
  const [cues, setCues] = useState<Partial<Record<TrackId, number>>>({});
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [section, setSection] = useState(score.sections[0].name);
  const [peaks, setPeaks] = useState<Waveforms>();
  const [waveStatus, setWaveStatus] = useState('Preparing waveforms…');
  const [waveAttempt, retryWave] = useState(0);
  const [waveError, setWaveError] = useState(false);
  const [ready, setReady] = useState(false);
  const transport = useRef<InspectorTransport>(undefined);
  const viewport = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const timeOutput = useRef<HTMLOutputElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; track: TrackId | null; time: number }>(undefined);
  const [cueLabel, setCueLabel] = useState<{ track: TrackId; time: number }>();
  const lastPosition = useRef(-1);
  const nextZoom = useRef<number>(undefined);
  const lastSection = useRef('');

  function show(time: number) {
    if (lastPosition.current === time) return;
    lastPosition.current = time;
    const label = timecode(time, true);
    if (timeOutput.current) timeOutput.current.textContent = label;
    const relative = time / score.duration * 100;
    playhead.current?.style.setProperty('--position', relative + '%');
    ruler.current?.setAttribute('aria-valuenow', time.toFixed(2));
    ruler.current?.setAttribute('aria-valuetext', label);
    const current = score.sections.find(marker => time < marker.end)?.name ?? score.sections.at(-1)!.name;
    if (current !== lastSection.current) {
      lastSection.current = current;
      setSection(current);
    }
  }

  useEffect(() => {
    const player = new InspectorTransport(score, (phase, track) => {
      setState(phase);
      setAudition(track);
    });
    transport.current = player;
    setReady(true);
    let raf = 0;
    const frame = () => {
      if (!drag.current || drag.current.track) show(player.time);
      raf = requestAnimationFrame(frame);
    };
    const hidden = () => { if (document.hidden) player.pause(); };
    const leave = () => player.pause();
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leave);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leave);
      player.dispose();
      transport.current = undefined;
    };
  }, [score]);

  useEffect(() => {
    const abort = new AbortController();
    setWaveError(false);
    setWaveStatus('Preparing waveforms…');
    void renderWaveforms(score, abort.signal, (value, preview) => {
      if (preview) setPeaks(preview);
      setWaveStatus('Rendering waveforms · ' + Math.round(value * 100) + '%');
    })
      .then(data => { if (!abort.signal.aborted) { setPeaks(data); setWaveStatus('Waveforms ready'); } })
      .catch(() => {
        if (abort.signal.aborted) return;
        setWaveError(true);
        setWaveStatus(typeof OfflineAudioContext === 'function' ? 'Waveforms could not render.' : 'Offline audio is unavailable in this browser.');
      });
    return () => abort.abort();
  }, [score, waveAttempt]);

  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element || nextZoom.current === undefined) return;
    element.scrollLeft = nextZoom.current * width * zoom;
    nextZoom.current = undefined;
  }, [width, zoom]);

  function reveal(time: number) {
    const area = viewport.current;
    if (!area || !width) return;
    const x = width * zoom * time / score.duration;
    if (x < area.scrollLeft || x > area.scrollLeft + width - 6) area.scrollLeft = Math.max(0, x - width * .12);
  }

  function seek(time: number) {
    transport.current?.seek(time);
    show(time);
    reveal(time);
  }

  function changeZoom(value: number) {
    if (value === zoom) return;
    const time = transport.current?.time ?? 0;
    const offset = width * zoom * time / score.duration - (viewport.current?.scrollLeft ?? 0);
    nextZoom.current = time / score.duration - (offset >= 0 && offset <= width ? offset : width * .12) / Math.max(1, width * value);
    setZoom(value);
  }

  function changeMix(track: TrackId, update: Partial<TrackMix>) {
    const next = { ...mix, [track]: { ...mix[track], ...update } };
    setMix(next);
    transport.current?.updateMix(next, solo);
  }

  function toggleSolo(track: DaybreakStem) {
    const next = solo === track ? null : track;
    setSolo(next);
    transport.current?.updateMix(mix, next);
  }

  function resetMix() {
    const next = defaultMix();
    setMix(next);
    setSolo(null);
    transport.current?.updateMix(next, null);
  }

  function auditionTrack(track: TrackId) {
    if ((state === 'Playing' || state === 'Starting') && audition === track) {
      transport.current?.pause();
      return;
    }
    const time = cues[track] ?? transport.current?.time;
    setSelected(track);
    if (time !== undefined) reveal(time);
    void transport.current?.play(track, time);
  }

  function move(event: PointerEvent<HTMLElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    gesture.time = pickTime(event, score.duration);
    if (gesture.track) {
      setCues(previous => ({ ...previous, [gesture.track!]: gesture.time }));
      setCueLabel({ track: gesture.track, time: gesture.time });
    } else show(gesture.time);
  }

  function finish(event: PointerEvent<HTMLElement>, commit: boolean) {
    const gesture = drag.current;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    if (commit) move(event);
    drag.current = undefined;
    if (gesture.track) setCueLabel({ track: gesture.track, time: gesture.time });
    else if (commit) seek(gesture.time);
  }

  function pointerActions(track: TrackId | null) {
    return {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (!event.isPrimary || event.button !== 0 || drag.current) return;
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        if (track) setSelected(track);
        drag.current = { pointer: event.pointerId, track, time: 0 };
        move(event);
      },
      onPointerMove: move,
      onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event, true),
      onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, false),
      onLostPointerCapture: (event: PointerEvent<HTMLElement>) => finish(event, false),
    };
  }

  const playing = state === 'Playing' || state === 'Starting';
  const activeMix = playing ? audition : null;
  return <section aria-label="Multitrack editor">
    <div className={s.transport}>
      <div className={s.transportButtons} aria-label="Playback controls">
        <button className={s.primary} type="button" disabled={!ready} aria-label={playing ? 'Pause' : 'Play all'}
          onClick={() => playing ? transport.current?.pause() : void transport.current?.play()}>
          <Glyph name={playing ? 'pause' : 'play'} /> <span>{playing ? 'Pause' : 'Play'}</span>
        </button>
        <button type="button" disabled={!ready} onClick={() => transport.current?.stop()}><Glyph name="stop" /> Stop</button>
        <button type="button" aria-label="Return to start" disabled={!ready} onClick={() => { transport.current?.rewind(); reveal(0); }}><Glyph name="rewind" /> Start</button>
      </div>
      <div className={s.position}>
        <output ref={timeOutput} aria-label="Playback position" aria-live="off">00:00.00</output>
        <span>/ {timecode(score.duration, true)}</span>
        <span className={s.playState} role="status" data-playing={playing || undefined}>
          {state}{activeMix ? ' · ' + trackInfo[activeMix].label : ''}
        </span>
      </div>
    </div>
    {state === 'Audio unavailable' && <p className={s.notice} role="alert">Audio could not start. Allow sound in your browser and press Play again.</p>}
    <div className={s.navigation}>
      <nav aria-label="Music sections" className={s.sections}>
        {score.sections.map(({ name, start }) =>
          <button type="button" key={name} aria-current={section === name ? 'true' : undefined} onClick={() => seek(start)}>{name}</button>)}
      </nav>
      <div className={s.zoom} aria-label="Timeline zoom">
        {[1, 2, 4].map(value => <button type="button" key={value} aria-pressed={value === zoom} onClick={() => changeZoom(value)}>
          {value === 1 ? 'Fit' : value + '×'}
        </button>)}
      </div>
    </div>
    <div className={s.editor}>
      <div className={s.controls}>
        <div className={s.controlHeader}><span>Tracks</span><button type="button" onClick={resetMix}>Reset mix</button></div>
        {score.tracks.map(id => {
          const { level, muted } = mix[id];
          const listening = audition === id && playing;
          const disabled = id !== 'master' && ((activeMix ? activeMix !== id && activeMix !== 'master'
            : muted || !!solo && solo !== id) || !level);
          const label = trackInfo[id].label;
          return <div key={id} className={s.channel} data-selected={id === selected || undefined} data-excluded={disabled || undefined}
            style={{ '--track-color': trackInfo[id].color } as CSSProperties}>
            <div className={s.channelTop}>
              <button type="button" className={s.trackPlay} aria-label={(listening ? 'Pause ' : 'Play ') + label}
                disabled={!ready} onClick={() => auditionTrack(id)}><Glyph name={listening ? 'pause' : 'play'} /></button>
              <span className={s.trackName}>{label}</span>
              {id !== 'master' && <button type="button" aria-label={'Solo ' + label} aria-pressed={solo === id}
                onClick={() => toggleSolo(id)}>S</button>}
              <button type="button" aria-label={'Mute ' + label} aria-pressed={muted} onClick={() => changeMix(id, { muted: !muted })}>M</button>
            </div>
            <label className={s.gain}>
              <input type="range" min="0" max="1.5" step=".01" value={level} aria-label={label + ' gain'}
                onChange={event => changeMix(id, { level: event.currentTarget.valueAsNumber })} />
              <span>{Math.round(level * 100)}%</span>
            </label>
          </div>;
        })}
      </div>
      <div ref={viewport} className={s.viewport} aria-label="Timeline scroll area">
        <div className={s.timeline} style={{ width: zoom * 100 + '%', '--bar-width': 400 / score.volume.beats + '%' } as CSSProperties}>
          <div ref={ruler} className={s.ruler} role="slider" aria-label="Timeline position" tabIndex={0}
            aria-valuemin={0} aria-valuemax={score.duration} aria-valuenow={0} aria-valuetext="00:00.00"
            {...pointerActions(null)} onKeyDown={event => {
              const next = keyTime(event, transport.current?.time ?? 0, score.duration, event.shiftKey ? score.step * 16 : score.step * 4);
              if (next !== undefined) seek(next);
            }}>
            <TimelineRuler score={score} zoom={zoom} width={width} />
          </div>
          {score.tracks.map(id => {
            const excluded = activeMix === 'master' ? false : activeMix ? id !== 'master' && activeMix !== id
              : mix[id].muted || !mix[id].level || !!solo && id !== 'master' && solo !== id;
            const cue = cues[id];
            return <div key={id} className={s.lane} role="slider" tabIndex={0} aria-label={trackInfo[id].label + ' cue'}
              aria-valuemin={0} aria-valuemax={score.duration} aria-valuenow={cue ?? 0} aria-valuetext={cue === undefined ? 'Follows playback position' : timecode(cue, true)}
              data-selected={selected === id || undefined} data-excluded={excluded || undefined} {...pointerActions(id)}
              onKeyDown={event => {
                const time = keyTime(event, cue ?? transport.current?.time ?? 0, score.duration, event.shiftKey ? score.step * 16 : score.step * 4);
                if (time === undefined) return;
                setSelected(id);
                setCues(previous => ({ ...previous, [id]: time }));
                setCueLabel({ track: id, time });
                reveal(time);
              }}>
              <TrackWaveform id={id} peaks={peaks?.[id]} width={width * zoom} message={id === 'master' ? waveStatus : null} />
              {cue !== undefined && <i className={s.cue} aria-hidden="true" style={{ left: cue / score.duration * 100 + '%' }} />}
            </div>;
          })}
          <div className={s.playhead} ref={playhead} data-playhead aria-hidden="true"><i /></div>
        </div>
        {zoom > 1 && <div className={s.panStrip} aria-hidden="true" />}
      </div>
    </div>
    <div className={s.footer}>
      <span>{waveStatus} {waveError && <button type="button" onClick={() => retryWave(value => value + 1)}>Retry waveforms</button>}</span>
      {cueLabel && <span>{trackInfo[cueLabel.track].label} cue <b>{timecode(cueLabel.time, true)}</b></span>}
      {score.tracks.length === 1 && <span>Master only</span>}
    </div>
  </section>;
}
