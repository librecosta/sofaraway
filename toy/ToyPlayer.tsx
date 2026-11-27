import { useEffect, useState } from 'react';
import { GameViewport } from '../app/components/GameViewport';
import type { VolumeId } from '../app/game/contracts';
import { createPlayerSettings, readPlayerOptions } from '../app/game/runtime/settings.client';
import { PlayerLocaleProvider, useLocalePreference } from '../app/i18n/PlayerLocale';
import { defaultLocaleFor } from '../app/i18n/player-text';

const defaultLocale = defaultLocaleFor('cn', 'bilibili');
const namespace = 'sofaraway.bilibili.sofaraway';
const settings = createPlayerSettings(__TOY_DEVELOPMENT__ ? namespace + '.dev' : namespace);

export function ToyPlayer() {
  const [volume, chooseVolume] = useState<VolumeId>('elsewhere');
  const preference = useLocalePreference(settings, defaultLocale);

  useEffect(() => { document.documentElement.lang = preference.locale; }, [preference.locale]);

  return <PlayerLocaleProvider {...preference}>
    <GameViewport settings={settings} volume={volume} chooseVolume={chooseVolume}
      launch={() => ({ options: readPlayerOptions(settings, volume) })} />
  </PlayerLocaleProvider>;
}
