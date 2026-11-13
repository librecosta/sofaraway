import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { VolumeId } from '../game/contracts';
import { VOLUMES } from '../game/core/volumes';
import { classes as c } from '../styles/classes';

const count = VOLUMES.length;
const stepPixels = 56;
const mod = (n: number) => ((n % count) + count) % count;
const nearest = (index: number, position: number) => index + count * Math.round((position - index) / count);

export function VolumeWheel({ value, choose, disabled, onTarget }: {
  value: VolumeId; choose(id: VolumeId): void; disabled: boolean; onTarget?(id: VolumeId): void;
}) {
  const selected = VOLUMES.findIndex(volume => volume.id === value);
  const [position, setPosition] = useState(selected);
  const [moving, setMoving] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const choice = useRef({ selected, choose, disabled, onTarget });
  choice.current = { selected, choose, disabled, onTarget };
  const state = useRef({ position: selected, target: selected, velocity: 0, frame: 0, stamp: 0,
    wheel: 0, wheelTimer: 0, pending: -1 });
  const drag = useRef<{ id: number; y: number; stamp: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  function settle(target: number, commit = true) {
    const m = state.current;
    cancelAnimationFrame(m.frame);
    m.target = target;
    m.stamp = 0;
    if (commit) choice.current.onTarget?.(VOLUMES[mod(target)].id);
    const finish = () => {
      m.frame = 0;
      m.position = m.target;
      m.velocity = 0;
      setPosition(m.position);
      setMoving(false);
      const next = mod(m.target);
      if (commit && next !== choice.current.selected && !choice.current.disabled) {
        m.pending = next;
        choice.current.choose(VOLUMES[next].id);
      }
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(target - m.position) < .001) return finish();
    setMoving(true);
    const frame = (now: number) => {
      const elapsed = m.stamp ? Math.min(.048, (now - m.stamp) / 1000) : 1 / 60;
      m.stamp = now;
      // Analytic underdamped spring; the result does not depend on display refresh rate.
      const zeta = .85, omega = 15, damp = zeta * omega, rate = omega * Math.sqrt(1 - zeta ** 2);
      const a = m.position - m.target, b = (m.velocity + damp * a) / rate;
      const cos = Math.cos(rate * elapsed), sin = Math.sin(rate * elapsed), decay = Math.exp(-damp * elapsed);
      const displacement = a * cos + b * sin;
      m.position = m.target + decay * displacement;
      m.velocity = decay * (rate * (-a * sin + b * cos) - damp * displacement);
      if (Math.abs(m.position - m.target) < .009 && Math.abs(m.velocity) < .12) return finish();
      setPosition(m.position);
      m.frame = requestAnimationFrame(frame);
    };
    m.frame = requestAnimationFrame(frame);
  }

  useEffect(() => {
    const m = state.current;
    choice.current.onTarget?.(value);
    if (m.pending === selected) { m.pending = -1; return; }
    if (mod(m.target) !== selected) settle(nearest(selected, m.position), false);
  }, [selected, value]);

  useEffect(() => {
    const element = host.current!;
    const m = state.current;
    const onWheel = (event: WheelEvent) => {
      if (choice.current.disabled || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 160 : 1);
      if (Math.sign(delta) !== Math.sign(m.wheel)) m.wheel = 0;
      m.wheel += delta;
      if (Math.abs(m.wheel) >= 36) {
        const amount = Math.min(3, Math.max(1, Math.round(Math.abs(m.wheel) / 95)));
        settle(m.target + Math.sign(m.wheel) * amount);
        m.wheel = 0;
      }
      clearTimeout(m.wheelTimer);
      m.wheelTimer = window.setTimeout(() => {
        if (Math.abs(m.wheel) >= 6) settle(m.target + Math.sign(m.wheel));
        m.wheel = 0;
      }, 110);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(m.frame);
      clearTimeout(m.wheelTimer);
    };
  }, []);

  function move(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const delta = d.y - event.clientY;
    if (!d.moved && Math.abs(delta) < 5) return;
    const m = state.current;
    if (!d.moved) {
      event.currentTarget.setPointerCapture(d.id);
      cancelAnimationFrame(m.frame);
      m.frame = 0;
      d.moved = true;
      setMoving(true);
    }
    m.position += delta / stepPixels;
    const speed = delta / stepPixels / Math.max(.012, (event.timeStamp - d.stamp) / 1000);
    m.velocity = .6 * m.velocity + .4 * Math.max(-18, Math.min(18, speed));
    d.y = event.clientY;
    d.stamp = event.timeStamp;
    setPosition(m.position);
  }

  function release(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    const m = state.current;
    const coast = event.type === 'pointerup' && event.timeStamp - d.stamp < 90 ? m.velocity / 14 : 0;
    suppressClick.current = true;
    settle(Math.round(m.position + coast));
  }

  return <div ref={host} id="vols" className={c('volume-wheel')} role="group" aria-label="Volume selector"
    tabIndex={disabled ? -1 : 0} data-moving={moving} onKeyDown={event => {
      if (disabled || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      settle(state.current.target + (event.key === 'ArrowUp' ? -1 : 1));
    }} onPointerDown={event => {
      suppressClick.current = false;
      if (!disabled && event.isPrimary && event.button === 0) {
        drag.current = { id: event.pointerId, y: event.clientY, stamp: event.timeStamp, moved: false };
      }
    }} onPointerMove={move} onPointerUp={release} onPointerCancel={release}
    onLostPointerCapture={event => { if (event.target === event.currentTarget) release(event); }}
    onPointerLeave={event => { if (!drag.current?.moved) release(event); }}>
    {VOLUMES.map((volume, index) => {
      const target = nearest(index, position);
      const offset = target - position;
      const depth = Math.abs(offset);
      const center = Math.round(position) === target;
      const adjacent = nearest(index, selected) - selected;
      return <button type="button" key={volume.id} id={index === selected ? 'vol-name' : undefined}
        data-vol-step={Math.abs(adjacent) === 1 ? adjacent : undefined} aria-current={index === selected ? 'true' : undefined}
        aria-label={adjacent === -1 ? 'Previous volume' : adjacent === 1 ? 'Next volume' : undefined}
        aria-description={Math.abs(adjacent) === 1 ? volume.name : undefined}
        aria-hidden={depth > 1.55 || undefined} disabled={disabled} tabIndex={-1} className={c('wheel-track')}
        style={{ '--wheel-y': offset * 43 + 'px', '--wheel-z': -depth * 29 + 'px',
          '--wheel-tilt': offset * -20 + 'deg', '--wheel-scale': 1 - depth * .10,
          '--wheel-opacity': Math.max(0, 1 - depth * .62), zIndex: center ? 2 : 1 } as CSSProperties}
        onClick={() => { if (!suppressClick.current) settle(target); suppressClick.current = false; }}>
        <span>{volume.subtitle.replace('VOL.', '').trim()}</span> {volume.name}
      </button>;
    })}
    <span className={c('sr-only')} aria-live="polite">{VOLUMES[selected].name}</span>
  </div>;
}
