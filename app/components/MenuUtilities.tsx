import { useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { VolumeDefinition } from '../game/core/volumes';
import { classes as c } from '../styles/classes';

function keepPreviewLink(event: MouseEvent) { event.preventDefault(); }

export function SocialLinks({ preview }: { preview?: boolean }) {
  const link = { className: c('icon-action', 'social-link'), target: '_blank', rel: 'noopener noreferrer',
    onClick: preview ? keepPreviewLink : undefined, onAuxClick: preview ? keepPreviewLink : undefined,
    onContextMenu: preview ? keepPreviewLink : undefined };
  return <>
    <a {...link} href="https://x.com/LibreCostaHQ" aria-label="LibreCosta on X" title="LibreCosta on X">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-7.4L5.6 22H2.5l7.3-8.4L2 2h6.5l4.4 6.7L18.9 2ZM17.8 20h1.7L7.5 3.9H5.7L17.8 20Z" />
      </svg>
    </a>
    <a {...link} href="https://github.com/librecosta/sofaraway" aria-label="SoFaraway on GitHub" title="SoFaraway on GitHub">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.46-1.15-1.11-1.45-1.11-1.45-.9-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.69 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85v2.73c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
      </svg>
    </a>
  </>;
}

export function MusicInfo({ volume, muted, setMuted, initiallyOpen = false }: {
  volume: VolumeDefinition; muted: boolean; setMuted(value: boolean): void; initiallyOpen?: boolean;
}) {
  const id = useId();
  const gradient = `${id}-sound`;
  const [hover, setHover] = useState(initiallyOpen);
  const [focus, setFocus] = useState(false);
  const [dismissed, dismiss] = useState(false);
  const open = !dismissed && (hover || focus);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !host.current) return;
    const doc = host.current.ownerDocument;
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.stopPropagation();
      event.preventDefault();
      dismiss(true);
    }
    doc.addEventListener('keydown', escape, true);
    return () => doc.removeEventListener('keydown', escape, true);
  }, [open]);

  const seconds = Math.round(volume.beats * 60 / volume.bpm);
  const paint = muted ? 'currentColor' : `url(#${gradient})`;
  return <div ref={host} className={c('music-info')} onPointerEnter={event => {
    if (event.pointerType !== 'touch') { setHover(true); dismiss(false); }
  }} onPointerLeave={() => setHover(false)}>
    <button type="button" className={c('icon-action')} aria-label="Sound" aria-pressed={!muted} aria-describedby={id}
      onFocus={event => {
        setFocus(event.currentTarget.matches(':focus-visible'));
        dismiss(false);
      }} onBlur={() => setFocus(false)} onClick={() => setMuted(!muted)}>
      <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
        <defs>
          <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="2" y1="26" x2="27" y2="7">
            <stop stopColor="#55f5dc" />
            <stop offset=".42" stopColor="#73baff" />
            <stop offset=".64" stopColor="#ff83cc" />
            <stop offset=".83" stopColor="#ffad69" />
            <stop offset="1" stopColor="#fff393" />
          </linearGradient>
        </defs>
        <path stroke={paint} d="M11 23V8l15-3v14M11 13l15-3" />
        <path stroke={paint} fill={muted ? 'none' : paint}
          d="M11 23c0 2-2 4-5 4-2 0-3-1-3-2.5 0-2 2-4 5-4 2 0 3 1 3 2.5Zm15-4c0 2-2 4-5 4-2 0-3-1-3-2.5 0-2 2-4 5-4 2 0 3 1 3 2.5Z" />
        {muted && <><path d="m4 4 24 24" stroke="#081116" strokeWidth="5" />
          <path d="m4 4 24 24" strokeLinecap="round" /></>}
      </svg>
    </button>
    <div id={id} role="tooltip" data-open={open} className={c('music-sheet')}>
      <p className={c('music-state')}>{muted ? 'SOUND OFF' : 'SOUND ON'}</p>
      <strong>{volume.name}</strong>
      <p>{volume.music.toUpperCase()} · {volume.bpm} BPM · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>
      <small>SYNTHESIZED</small>
    </div>
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
