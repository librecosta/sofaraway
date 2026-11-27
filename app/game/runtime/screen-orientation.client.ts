import type { OrientationPreference } from '../contracts';

export function isCompactTouchDevice() {
  return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600;
}

function physicalOrientation(): OrientationPreference {
  const type = screen.orientation?.type;
  if (type) return type.startsWith('landscape') ? 'landscape' : 'portrait';
  if (typeof window.orientation === 'number') return Math.abs(window.orientation) % 180 === 90 ? 'landscape' : 'portrait';
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

export function observeScreenOrientation(change: (orientation: OrientationPreference) => void, signal: AbortSignal) {
  let orientation = physicalOrientation();
  const update = () => {
    const next = physicalOrientation();
    if (next === orientation) return;
    orientation = next;
    change(next);
  };
  screen.orientation?.addEventListener('change', update, { signal });
  window.addEventListener('orientationchange', update, { signal });
  window.addEventListener('resize', update, { signal });
  window.addEventListener('pageshow', update, { signal });
  document.addEventListener('visibilitychange', update, { signal });
}

type LockApi = ScreenOrientation & { lock?(value: OrientationPreference): Promise<void> };
let lockOwner: FullscreenOrientation | undefined;

export class FullscreenOrientation {
  private request = 0;
  private owner?: LockApi;

  constructor(private readonly root: HTMLElement, private preference: OrientationPreference) {}

  choose(preference: OrientationPreference) {
    this.preference = preference;
    void this.apply();
  }

  async apply() {
    const api: LockApi | undefined = screen.orientation;
    if (document.fullscreenElement !== this.root || typeof api?.lock !== 'function' || typeof api.unlock !== 'function') return;
    const request = ++this.request;
    this.owner = api;
    lockOwner = this;
    try {
      await api.lock(this.preference);
    } catch {
      if (request === this.request) this.release();
      return;
    }
    // An obsolete completion must not unlock a newer request or outlive the viewport.
    if (request !== this.request && !lockOwner) this.unlock(api);
    else if (request === this.request && document.fullscreenElement !== this.root) this.release();
  }

  release() {
    const owner = this.owner;
    this.owner = undefined;
    this.request++;
    if (owner && lockOwner === this) {
      lockOwner = undefined;
      this.unlock(owner);
    }
  }

  private unlock(api: LockApi) {
    try { api.unlock(); } catch { /* The browser may already have released the lock. */ }
  }
}
