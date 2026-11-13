import { useEffect, useRef, useState } from 'react';
import type { VolumeDefinition } from '../game/core/volumes';
import { classes as c } from '../styles/classes';

export function DynamicLightsButton({ active, disabled, onToggle }: {
  active: boolean; disabled?: boolean; onToggle(value: boolean): void;
}) {
  return <button type="button" className={c('icon-action')} aria-label="Dynamic lights" aria-pressed={active}
    title="Dynamic lights" disabled={disabled} onClick={() => onToggle(!active)}>
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M16 2v4" />
      <path className={c('mirror-coral')} d="M5.5 13 11 11l2 5-7 2z" />
      <path className={c('mirror-mint')} d="m13 16 6-1 2 6-7 1z" />
      <path className={c('mirror-blue')} d="m21 21 6-2-2 6-3 2z" />
      <circle cx="16" cy="17" r="11" />
      <path d="M5.7 13.4c5.7-3 13.1-3.9 19.6-2.5M5.1 18.8c7.5-3.2 14.9-4.3 21.8-3.6M8 24.4c6.6-2.6 12.9-3.5 18.3-3.3M12.1 6.8c-3.2 6.6-.3 16.9 5.3 21M16.1 6c4.2 4.5 7.5 13.8 5.8 20.1" />
    </svg>
  </button>;
}

export function MusicInfo({ volume, open, setOpen }: {
  volume: VolumeDefinition; open: boolean; setOpen(value: boolean): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open || !host.current) return;
    const doc = host.current.ownerDocument;
    function outside(event: PointerEvent) {
      if (!event.composedPath().includes(host.current!)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    }
    doc.addEventListener('pointerdown', outside);
    doc.addEventListener('keydown', escape, true);
    return () => {
      doc.removeEventListener('pointerdown', outside);
      doc.removeEventListener('keydown', escape, true);
    };
  }, [open, setOpen]);

  const seconds = Math.round(volume.beats * 60 / volume.bpm);
  return <div ref={host} className={c('music-info')}>
    <button ref={button} type="button" className={c('icon-action')} title="Music information" aria-label="Music information"
      aria-expanded={open} aria-controls="music-information" onClick={() => setOpen(!open)}>
      <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M11 23V8l15-3v14M11 13l15-3" />
        <ellipse className={c('mirror-blue')} cx="7" cy="23.5" rx="4" ry="3.2" transform="rotate(-14 7 23.5)" />
        <ellipse className={c('mirror-mint')} cx="22" cy="19.5" rx="4" ry="3.2" transform="rotate(-14 22 19.5)" />
      </svg>
    </button>
    <section id="music-information" aria-label="Music" aria-hidden={!open} inert={!open} data-open={open} className={c('music-sheet')}>
      <h2>MUSIC</h2>
      <strong>{volume.name}</strong>
      <p>{volume.music.toUpperCase()} · {volume.bpm} BPM · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>
      <small>SYNTHESIZED</small>
    </section>
  </div>;
}

export type ShareNotice = { id: number; success: boolean };
export function useShareToast() {
  const [notice, setNotice] = useState<ShareNotice | null>(null);
  const serial = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const showNotice = (success: boolean) => {
    clearTimeout(timer.current);
    setNotice({ id: ++serial.current, success });
    timer.current = setTimeout(() => setNotice(null), 2200);
  };
  return { notice, showNotice };
}
export function ShareToast({ notice }: { notice: ShareNotice | null }) {
  return <div className={c('toast-region')} role="status" aria-atomic="true">
    {notice && <span key={notice.id} className={c('share-toast')}>{notice.success ? 'LINK COPIED' : 'COULD NOT COPY LINK'}</span>}
  </div>;
}
