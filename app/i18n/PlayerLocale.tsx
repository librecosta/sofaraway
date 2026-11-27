import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { createPlayerText } from './player-text';
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
