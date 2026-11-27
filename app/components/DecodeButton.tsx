import { useEffect, useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { classes as c } from '../styles/classes';

const DURATION = 550;
const FLIP_DELAY = 50;
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*+-=?';

export function DecodeButton({ label, children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  const [active, setActive] = useState(false);
  const [elapsed, setElapsed] = useState(DURATION);
  useEffect(() => {
    if (!active || disabled) return;
    const start = performance.now();
    setElapsed(0);
    const timer = window.setInterval(() => {
      const time = Math.min(DURATION, performance.now() - start);
      setElapsed(time);
      if (time === DURATION) window.clearInterval(timer);
    }, 25);
    return () => window.clearInterval(timer);
  }, [active, disabled, label]);

  function play() {
    if (!disabled && !matchMedia('(prefers-reduced-motion: reduce)').matches) setActive(true);
  }

  function stop() {
    setActive(false);
    setElapsed(DURATION);
  }

  const glyphs = Array.from(label);
  const revealed = Math.floor(elapsed / DURATION * glyphs.length);
  const variation = Math.floor(elapsed / FLIP_DELAY);
  return (
    <button type="button" aria-label={label} {...props} disabled={disabled}
      onPointerEnter={event => {
        if (event.pointerType !== 'touch' && matchMedia('(any-hover: hover)').matches) play();
      }}
      onPointerLeave={stop} onFocus={event => { if (event.currentTarget.matches(':focus-visible')) play(); }} onBlur={stop}>
      <span className={c('decode-label')} aria-hidden="true">
        {glyphs.map((glyph, index) => {
          const encrypted = active && !disabled && index >= revealed && /\S/.test(glyph);
          const noise = CHARACTERS[(index * 13 + variation * (17 + index)) % CHARACTERS.length];
          return <span className={c('decode-cell', encrypted && 'encrypted')} key={index}>
            <span className={c('decode-original')}>{glyph}</span>
            {encrypted && <span className={c('decode-noise')}>{noise}</span>}
          </span>;
        })}
      </span>
      {children}
    </button>
  );
}
