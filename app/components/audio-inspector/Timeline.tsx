import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { InspectorScore, TrackId } from '../../game/debug/audio/track-adapter';
import { trackInfo } from '../../game/debug/audio/track-adapter';
import { drawWaveform } from '../../game/debug/audio/waveform.client';
import type { Peaks } from '../../game/debug/audio/waveform.client';
import s from '../../styles/audio-inspector.module.css';

export function timecode(time: number, fraction = false) {
  const centiseconds = Math.max(0, Math.floor(time * 100 + 1e-7));
  return [Math.floor(centiseconds / 6000), Math.floor(centiseconds / 100) % 60].map(value => String(value).padStart(2, '0')).join(':')
    + (fraction ? '.' + String(centiseconds % 100).padStart(2, '0') : '');
}

export function pickTime(event: PointerEvent<HTMLElement>, duration: number) {
  const rect = event.currentTarget.getBoundingClientRect();
  return Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration));
}

export function keyTime(event: KeyboardEvent, current: number, duration: number, step: number) {
  let target: number;
  switch (event.key) {
    case 'Home': target = 0; break;
    case 'End': target = duration; break;
    case 'ArrowLeft': target = current - step; break;
    case 'ArrowRight': target = current + step; break;
    default: return undefined;
  }
  event.preventDefault();
  return Math.max(0, Math.min(duration, target));
}

export function TimelineRuler({ score, zoom, width }: { score: InspectorScore; zoom: number; width: number }) {
  const barSeconds = score.step * 16;
  const bars = Math.max(1, Math.ceil(score.duration / barSeconds));
  const interval = Math.max(1, Math.ceil(bars * 88 / Math.max(1, width * zoom)));
  return <>
    <div className={s.sectionBands} aria-hidden="true">
      {score.sections.map(({ name, start, end }) => <div key={name} style={{ width: (end - start) / score.length * 100 + '%' }}>{name}</div>)}
      <div style={{ width: score.tail / score.length * 100 + '%' }}>TAIL</div>
    </div>
    <div className={s.ticks} aria-hidden="true">
      {Array.from({ length: Math.ceil(bars / interval) }, (_, i) => {
        const bar = i * interval;
        const time = bar * barSeconds;
        if (bar && (1 - time / score.length) * width * zoom < 75) return null;
        return <span key={bar} style={{ left: time / score.length * 100 + '%' }}>
          <b>{timecode(time)}</b><small>BAR {bar + 1} · BEAT {bar * 4 + 1}</small>
        </span>;
      })}
    </div>
  </>;
}

export function Waveform({ id, peaks, width, message }: {
  id: TrackId; peaks?: Peaks; width: number; message: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element || !peaks || !width) return;
    const draw = () => drawWaveform(element, peaks, width, element.clientHeight, trackInfo[id].color);
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    draw();
    return () => observer.disconnect();
  }, [id, peaks, width]);
  return <>
    <i className={s.centerline} aria-hidden="true" />
    {peaks ? <canvas ref={canvas} className={s.waveform} aria-label={trackInfo[id].label + ' waveform'} role="img" />
      : message && <span className={s.waveMessage}>{message}</span>}
  </>;
}
