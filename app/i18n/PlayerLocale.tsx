import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlayerSettings } from '../game/runtime/settings.client';
import { createPlayerText, isLocale } from './player-text';
import type { Locale } from './player-text';

const texts = { en: createPlayerText('en'), 'zh-CN': createPlayerText('zh-CN') };
const ignoreLocale = () => {};
const PlayerLocale = createContext({ text: texts.en, chooseLocale: ignoreLocale as (locale: Locale) => void });

export function PlayerLocaleProvider({ locale, chooseLocale, children }: {
  locale: Locale; chooseLocale(locale: Locale): void; children: ReactNode;
}) {
  return <PlayerLocale.Provider value={{ text: texts[locale], chooseLocale }}>{children}</PlayerLocale.Provider>;
}

export function usePlayerText() {
  return useContext(PlayerLocale);
}

export function useLocalePreference(settings: PlayerSettings, defaultLocale: Locale) {
  const [preference, setPreference] = useState<Locale | null>(null);

  useEffect(() => {
    const saved = settings.read('locale');
    setPreference(isLocale(saved) ? saved : null);
  }, [settings]);

  function chooseLocale(value: Locale) {
    setPreference(value);
    settings.save('locale', value);
  }

  return { locale: preference ?? defaultLocale, chooseLocale };
}
