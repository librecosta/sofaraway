import { useLayoutEffect, useRef } from 'react';
import { classes as c } from '../styles/classes';

export function HorizontalSelector<T extends string>({ label, options, value, choose, disabled }: {
  label: string; options: readonly T[]; value: T; choose(value: T): void; disabled: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const direction = useRef(1);
  const last = useRef(value);
  const index = Math.max(0, options.indexOf(value));
  function step(amount: number) {
    if (disabled) return;
    direction.current = amount;
    choose(options[(index + amount + options.length) % options.length]);
  }
  useLayoutEffect(() => {
    if (last.current === value) return;
    const previous = last.current;
    const host = track.current;
    last.current = value;
    if (!host) return;
    const distance = direction.current * 27;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const node of host.querySelectorAll<HTMLElement>('[data-choice]')) {
      const current = node.dataset.choice === value;
      const computed = getComputedStyle(node);
      const opacity = node.style.opacity ? Number(computed.opacity) : Number(node.dataset.choice === previous);
      const from = { transform: opacity > .01 ? computed.transform : `translateX(${distance}px)`, opacity };
      node.getAnimations().forEach(animation => animation.cancel());
      const to = { transform: `translateX(${current ? 0 : -distance}px)`, opacity: current ? 1 : 0 };
      node.style.transform = to.transform;
      node.style.opacity = String(to.opacity);
      if (!reduced) node.animate([from, to], { duration: 420, easing: 'cubic-bezier(.22,.74,.18,1)' });
    }
  }, [value]);
  return <div className={c('horizontal-selector')} role="group" aria-label={label} onKeyDown={event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    step(event.key === 'ArrowLeft' ? -1 : 1);
  }}>
    <button type="button" aria-label={`Previous ${label.toLowerCase()}`} disabled={disabled} onClick={() => step(-1)}>‹</button>
    <div ref={track} className={c('selector-track')} aria-live="polite">
      {options.map(option => <span key={option} data-choice={option} data-selected={option === value}
        aria-hidden={option !== value || undefined}>{option.toUpperCase()}</span>)}
    </div>
    <button type="button" aria-label={`Next ${label.toLowerCase()}`} disabled={disabled} onClick={() => step(1)}>›</button>
  </div>;
}
