import { browserSurface, safeAreaEdges } from './platform';
import type { ContainerMode, ToyContainerState, ToyPlatform, ToyPlatformState } from './platform';
import { BilibiliLeaderboard } from './leaderboard-sdk.client';
import type { BilibiliRankSDK } from './leaderboard-sdk.client';

const scriptUrl = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
const abilities = ['getContainerState', 'onContainerChange', 'setContainerMode', 'onPageClose'] as const;
type Ability = typeof abilities[number];

interface BilibiliToySDK extends BilibiliRankSDK {
  isSupport(ability: Ability | keyof BilibiliRankSDK): Promise<boolean>;
  getContainerState(): Promise<unknown>;
  onContainerChange(listener: (state: unknown) => void): () => void;
  setContainerMode(mode: ContainerMode): Promise<void>;
  onPageClose(listener: () => void): () => void;
}

function sdkGlobal() {
  const sdk = (window as Window & { toy?: Partial<BilibiliToySDK> }).toy;
  return typeof sdk?.isSupport === 'function' ? sdk : undefined;
}

function sdkScript(signal: AbortSignal) {
  const current = sdkGlobal();
  if (current || signal.aborted) return Promise.resolve(current);
  return new Promise<ReturnType<typeof sdkGlobal>>(resolve => {
    const installed = Array.from(document.scripts).find(script => script.src === scriptUrl);
    const script = installed ?? document.createElement('script');
    function finish(loaded: boolean) {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      script.removeEventListener('load', ready);
      script.removeEventListener('error', cancel);
      if (!loaded && !installed) script.remove();
      resolve(loaded ? sdkGlobal() : undefined);
    }
    const cancel = () => finish(false);
    const ready = () => finish(true);
    const timer = setTimeout(cancel, 2500);
    script.addEventListener('load', ready, { once: true });
    script.addEventListener('error', cancel, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
    if (!installed) {
      script.async = true;
      script.src = scriptUrl;
      document.head.append(script);
    }
  });
}

function bounded<T>(call: () => Promise<T>, signal: AbortSignal): Promise<T | undefined> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve(undefined);
    function finish(value?: T) {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      resolve(value);
    }
    const cancel = () => finish();
    const timer = setTimeout(cancel, 1500);
    signal.addEventListener('abort', cancel, { once: true });
    try { void call().then(finish, cancel); } catch { cancel(); }
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function pixels(value: unknown, maximum = Infinity) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(0, value)) : 0;
}

export function normalizeContainer(value: unknown): ToyContainerState | null {
  const state = record(value);
  const viewport = record(state.viewport);
  const width = pixels(viewport.width), height = pixels(viewport.height);
  const { orientation, deviceType } = state;
  if (width < 1 || height < 1 || (orientation !== 'landscape' && orientation !== 'portrait') ||
      typeof state.immersive !== 'boolean') return null;
  const safe = record(state.safeArea);
  const safeArea = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const edge of safeAreaEdges) {
    safeArea[edge] = pixels(safe[edge], (edge === 'top' || edge === 'bottom' ? height : width) / 2);
  }
  return {
    device: deviceType === 'phone' || deviceType === 'tablet' || deviceType === 'desktop' ? deviceType : 'unknown',
    orientation, immersive: state.immersive, width, height, safeArea,
  };
}

export class NativeToyPlatform implements ToyPlatform {
  private state = browserSurface;
  private readonly listeners = new Set<() => void>();
  private sdk?: Partial<BilibiliToySDK>;
  private loading: Promise<Partial<BilibiliToySDK> | undefined> = Promise.resolve(undefined);
  readonly leaderboard = new BilibiliLeaderboard(() => this.loading);

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(state: ToyPlatformState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  async requestMode(mode: ContainerMode) {
    if (!this.state.canChangeMode || !this.sdk?.setContainerMode) throw new Error('Container control unavailable.');
    await this.sdk.setContainerMode(mode);
  }

  connect() {
    // Hosted Web and App both support services. Container controls remain App-only.
    if (window.location.protocol !== 'https:' || !/(^|\.)bilibili\.com$/i.test(location.hostname) ||
        !location.pathname.startsWith('/toy/')) return;
    const events = new AbortController();
    const { signal } = events;
    const stop = () => { events.abort(); this.sdk = undefined; this.loading = Promise.resolve(undefined); };
    const close = () => {
      if (signal.aborted) return;
      stop();
      this.publish({ container: null, lifecycle: 'closed', canChangeMode: false });
    };
    const cleanup = (off: () => void) => {
      const release = () => { try { off(); } catch { /* The host may already be closing. */ } };
      if (signal.aborted) release();
      else signal.addEventListener('abort', release, { once: true });
    };
    window.addEventListener('pagehide', event => { if (!event.persisted) close(); }, { signal });
    this.leaderboard.connect(signal);
    this.loading = sdkScript(signal);
    if (!/BiliApp/i.test(navigator.userAgent)) return stop;
    void (async () => {
      const sdk = await this.loading;
      if (!sdk || signal.aborted) return;
      const probe = (ability: Ability) => bounded(() => sdk.isSupport!(ability), signal);
      // Close support is independent of the container mode capabilities.
      void probe('onPageClose').then(supported => {
        if (supported !== true || signal.aborted) return;
        try {
          const off = sdk.onPageClose?.(close);
          if (off) cleanup(off);
        } catch { /* Browser pagehide remains available. */ }
      });
      const [read, watch, change] = await Promise.all(abilities.slice(0, 3).map(probe));
      if (signal.aborted) return;
      let changes = 0;
      let watching = false;
      const update = (value: unknown) => {
        const container = normalizeContainer(value);
        if (!container || signal.aborted) return;
        changes++;
        this.publish({ ...this.state, container,
          canChangeMode: watching && change === true && typeof sdk.setContainerMode === 'function' });
      };
      this.sdk = sdk;
      if (watch === true && sdk.onContainerChange) {
        try {
          watching = true;
          cleanup(sdk.onContainerChange(update));
        } catch { watching = false; }
      }
      let latestRead = 0;
      const refresh = async () => {
        if (read !== true || !sdk.getContainerState || signal.aborted) return;
        const version = changes;
        const id = ++latestRead;
        const result = await bounded(() => sdk.getContainerState!(), signal);
        if (id === latestRead && version === changes) update(result);
      };
      window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); }, { signal });
      let resizeTimer: ReturnType<typeof setTimeout>;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => void refresh(), 180);
      }, { signal });
      signal.addEventListener('abort', () => clearTimeout(resizeTimer), { once: true });
      void refresh();
    })();
    return stop;
  }
}
