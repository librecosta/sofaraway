import { useEffect, useState } from 'react';
import { Links, Meta, Outlet, Scripts, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { readSetting, saveSetting } from './game/runtime/settings.client';
import { PlayerLocaleProvider } from './i18n/PlayerLocale';
import { isLocale } from './i18n/player-text';
import type { Locale } from './i18n/player-text';
import { webDefaultLocale } from './i18n/web-locale';

export function Layout({ children }: { children: ReactNode }) {
  const playerRoute = useLocation().pathname === '/';
  const [preference, setPreference] = useState<Locale | null>(null);
  const locale = playerRoute ? preference ?? webDefaultLocale : 'en';

  useEffect(() => {
    const saved = readSetting('locale');
    setPreference(isLocale(saved) ? saved : null);
  }, []);

  function chooseLocale(value: Locale) {
    setPreference(value);
    saveSetting('locale', value);
  }

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <Meta />
        <Links />
      </head>
      <body>
        <PlayerLocaleProvider locale={locale} chooseLocale={chooseLocale}>{children}</PlayerLocaleProvider>
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}
