import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GameViewport } from '../app/components/GameViewport';
import type { VolumeId } from '../app/game/contracts';
import { createPlayerSettings, readOrientationPreference, readPlayerOptions } from '../app/game/runtime/settings.client';
import { PlayerLocaleProvider, useLocalePreference } from '../app/i18n/PlayerLocale';
import { defaultLocaleFor } from '../app/i18n/player-text';
import { browserSurface, confirmContainerMode, safeAreaEdges } from './platform';
import type { ContainerMode, ToyPlatform } from './platform';
import { CompetitiveResult, LeaderboardButton, LeaderboardPanel } from './Leaderboard';
import { LeaderboardClient } from './leaderboard-client';
import './player.css';

const defaultLocale = defaultLocaleFor('cn', 'bilibili');
const namespace = 'sofaraway.bilibili.sofaraway';
const settings = createPlayerSettings(__TOY_DEVELOPMENT__ ? namespace + '.dev' : namespace);

const copy = {
  en: { landscape: 'PLAY LANDSCAPE', enter: 'ENTER IMMERSIVE', exit: 'EXIT IMMERSIVE',
    pending: 'Changing display mode…', failed: 'The container did not confirm the display change. You can keep playing.',
    start: 'START', closed: 'The Toy container has closed.' },
  'zh-CN': { landscape: '横屏游玩', enter: '进入沉浸模式', exit: '退出沉浸模式',
    pending: '正在切换显示模式…', failed: '容器未确认显示模式切换，仍可继续游玩。',
    start: '开始', closed: '玩具容器已关闭。' },
};
const getBrowserSurface = () => browserSurface;
const subscribeBrowser = () => () => {};

export function ToyPlayer({ platform }: { platform?: ToyPlatform }) {
  const [volume, chooseVolume] = useState<VolumeId>('elsewhere');
  const preference = useLocalePreference(settings, defaultLocale);
  const [orientation, setOrientation] = useState(() => readOrientationPreference(settings));
  const { container, lifecycle, canChangeMode } = useSyncExternalStore(
    platform?.subscribe ?? subscribeBrowser, platform?.getSnapshot ?? getBrowserSurface);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const text = copy[preference.locale];
  const touch = container?.device === 'phone' || container?.device === 'tablet';

  useEffect(() => { document.documentElement.lang = preference.locale; }, [preference.locale]);
  useEffect(() => () => request.current?.abort(), []);
  useLayoutEffect(() => {
    if (!container) return;
    const style = document.documentElement.style;
    style.setProperty('--container-width', `${container.width}px`);
    style.setProperty('--container-height', `${container.height}px`);
    for (const edge of safeAreaEdges) style.setProperty(`--safe-area-${edge}`, `${container.safeArea[edge]}px`);
    return () => {
      style.removeProperty('--container-width');
      style.removeProperty('--container-height');
      for (const edge of safeAreaEdges) style.removeProperty(`--safe-area-${edge}`);
    };
  }, [container]);

  async function changeMode(mode: ContainerMode) {
    if (!platform || request.current || lifecycle !== 'active') return;
    const operation = new AbortController();
    request.current = operation;
    setFailed(false);
    setPending(true);
    const confirmed = await confirmContainerMode(platform, mode, operation.signal);
    if (operation.signal.aborted) return;
    request.current = null;
    setPending(false);
    setFailed(!confirmed);
  }

  const active = container?.immersive ?? false;
  const prepareLandscape = orientation === 'landscape' && container?.orientation !== 'landscape';
  const action = touch && canChangeMode ? {
    active, pending,
    label: prepareLandscape ? text.landscape : active ? text.exit : text.enter,
    toggle: () => {
      if (prepareLandscape) void changeMode({ orientation: 'landscape', immersive: true });
      else if (active) void changeMode({ orientation: 'portrait', immersive: false });
      else void changeMode({ orientation, immersive: true });
    },
  } : undefined;
  const direction = action ? {
    value: orientation, pending,
    choose(value: typeof orientation) {
      if (request.current) return;
      setOrientation(value);
      settings.save('orientation', value);
      void changeMode({ orientation: value, immersive: value === 'landscape' });
    },
  } : undefined;

  if (lifecycle === 'closed') return <p className="toy-closed" role="status">{text.closed}</p>;

  return <PlayerLocaleProvider {...preference}>
    <PlayerWithLeaderboard platform={platform} volume={volume} chooseVolume={chooseVolume}
      display={{ touch, startLabel: touch ? text.start : undefined, orientation: direction, action,
        status: pending ? text.pending : failed ? text.failed : undefined }} />
  </PlayerLocaleProvider>;
}

function PlayerWithLeaderboard({ platform, volume, chooseVolume, display }: {
  platform?: ToyPlatform; volume: VolumeId; chooseVolume(volume: VolumeId): void;
  display: React.ComponentProps<typeof GameViewport>['display'];
}) {
  const [client] = useState(() => new LeaderboardClient(platform?.leaderboard));
  useEffect(() => client.connect(), [client]);

  return <GameViewport settings={settings} volume={volume} chooseVolume={chooseVolume} surface={platform} display={display}
    launch={() => ({ options: readPlayerOptions(settings, volume) })} extension={{
      menu: open => <LeaderboardButton open={open} />,
      results: (run, snapshot) => <CompetitiveResult key={run.id} client={client} run={run} snapshot={snapshot} />,
      panel: (initialVolume, close) => <LeaderboardPanel client={client} initialVolume={initialVolume} close={close} />,
    }} />;
}
