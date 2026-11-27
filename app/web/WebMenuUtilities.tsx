import { useEffect, useRef, useState } from 'react';
import { NavigationButton } from '../components/NavigationButton';
import { usePlayerText } from '../i18n/PlayerLocale';
import { classes as c } from '../styles/classes';

export function SocialLinks({ preview }: { preview?: boolean }) {
  const { text: { t } } = usePlayerText();
  const link = { className: c('icon-action', 'social-link'), newTab: true, preview };
  return <>
    <NavigationButton {...link} to="https://x.com/LibreCostaHQ" aria-label={t('onX')}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-7.4L5.6 22H2.5l7.3-8.4L2 2h6.5l4.4 6.7L18.9 2ZM17.8 20h1.7L7.5 3.9H5.7L17.8 20Z" />
      </svg>
    </NavigationButton>
    <NavigationButton {...link} to="https://github.com/librecosta/sofaraway" aria-label={t('onGitHub')}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.46-1.15-1.11-1.45-1.11-1.45-.9-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.69 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85v2.73c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
      </svg>
    </NavigationButton>
  </>;
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
  const { text: { t } } = usePlayerText();
  return <div className={c('toast-region')} role="status" aria-atomic="true">
    {notice && <span key={notice.id} className={c('share-toast')}>{t(notice.success ? 'linkCopied' : 'copyFailed')}</span>}
  </div>;
}
