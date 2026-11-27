import { Links, Meta, Outlet, Scripts, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { webSettings } from './game/runtime/settings.client';
import { PlayerLocaleProvider, useLocalePreference } from './i18n/PlayerLocale';
import { webDefaultLocale } from './i18n/web-locale';

export function Layout({ children }: { children: ReactNode }) {
  const playerRoute = useLocation().pathname === '/';
  const preference = useLocalePreference(webSettings, webDefaultLocale);
  const locale = playerRoute ? preference.locale : 'en';

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
        <PlayerLocaleProvider locale={locale} chooseLocale={preference.chooseLocale}>{children}</PlayerLocaleProvider>
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}
