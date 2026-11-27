import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { classes as c } from '../styles/classes';

export function GameDialog({ id, title, children, dismiss, preview }: {
  id?: string; title: string; children: ReactNode; dismiss?: () => void; preview?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node || preview) return;
    const active = node.ownerDocument.activeElement as HTMLElement | null;
    node.querySelector<HTMLElement>('button:not(:disabled):not([role="link"])')?.focus();
    return () => { if (active?.isConnected && !active.closest('[inert]')) active.focus(); };
  }, [title, preview]);
  return <section ref={dialog} id={id} className={c('modal')} role="dialog" aria-modal="true" aria-label={title}
    onClick={event => { if (event.target === event.currentTarget) dismiss?.(); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && dismiss) {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]'));
      if (!items.length) return;
      const target = event.currentTarget.ownerDocument.activeElement;
      if (event.shiftKey ? target === items[0] : target === items.at(-1)) {
        event.preventDefault();
        (event.shiftKey ? items.at(-1) : items[0])?.focus();
      }
    }}>
    {children}
  </section>;
}
