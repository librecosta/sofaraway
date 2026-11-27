import { useEffect, useId, useRef, useState } from 'react';
import type { VolumeDefinition } from '../game/core/volumes';
import { usePlayerText } from '../i18n/PlayerLocale';
import { classes as c } from '../styles/classes';
const soundtrackTitles = {
  elsewhere: 'ELSEWHERE',
  daybreak: 'GLASSHOUSE',
  descent: 'CONTROL',
  orbit: 'STARWAKE',
} as const satisfies Record<VolumeDefinition['id'], string>;

export function MusicInfo({ volume, muted, setMuted, initiallyOpen = false }: {
  volume: VolumeDefinition; muted: boolean; setMuted(value: boolean): void; initiallyOpen?: boolean;
}) {
  const { text: { t, number } } = usePlayerText();
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
    <button type="button" className={c('icon-action')} aria-label={t('sound')} aria-pressed={!muted} aria-describedby={id}
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
      <p className={c('music-state')}>{t(muted ? 'soundOff' : 'soundOn')}</p>
      <strong lang="en">{volume.name}</strong>
      <p><span lang="en">{soundtrackTitles[volume.id]}</span> · {number(volume.bpm)} BPM · {number(Math.floor(seconds / 60))}:{number(seconds % 60).padStart(2, '0')}</p>
      <small>{t('synthesized')}</small>
    </div>
  </div>;
}
