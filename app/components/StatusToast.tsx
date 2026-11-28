import { useCallback, useEffect, useRef, useState } from 'react';
import { classes as c } from '../styles/classes';

export type StatusNotice<T> = { id: number; value: T };

export function useStatusToast<T>() {
  const [notice, setNotice] = useState<StatusNotice<T> | null>(null);
  const serial = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const showNotice = useCallback((value: T | null) => {
    clearTimeout(timer.current);
    setNotice(value === null ? null : { id: ++serial.current, value });
    if (value !== null) timer.current = setTimeout(() => setNotice(null), 2200);
  }, []);
  return { notice, showNotice };
}

export function StatusToast<T>({ notice, describe }: {
  notice: StatusNotice<T> | null;
  describe(value: T): string;
}) {
  return <div className={c('toast-region')} data-status-toast role="status" aria-atomic="true">
    {notice && <span key={notice.id} className={c('status-toast')}>{describe(notice.value)}</span>}
  </div>;
}
