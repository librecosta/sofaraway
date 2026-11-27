const mouseQuery = '(any-pointer: fine)';

export function immersiveMouseSupported(element: HTMLElement = document.documentElement) {
  return matchMedia(mouseQuery).matches && typeof element.requestPointerLock === 'function' &&
    typeof document.exitPointerLock === 'function' && 'pointerLockElement' in document;
}

export function subscribeImmersiveMouseSupport(change: () => void) {
  const media = matchMedia(mouseQuery);
  media.addEventListener('change', change);
  return () => media.removeEventListener('change', change);
}

interface LockRequest {
  cancelled: boolean;
  legacy: boolean;
}

export class ImmersiveMouse {
  private readonly events = new AbortController();
  private pending?: LockRequest;
  private disposed = false;
  active = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly changed: (active: boolean) => void,
    private readonly lost: () => void,
  ) {
    const { signal } = this.events;
    document.addEventListener('pointerlockchange', this.reconcile, { signal });
    document.addEventListener('pointerlockerror', () => {
      // A promise rejection identifies its request even if the error event is late.
      if (this.pending?.legacy) this.reject(this.pending);
    }, { signal });
  }

  get engaged() { return this.active || !!this.pending && !this.pending.cancelled; }

  request(gesture?: Event) {
    if (!gesture?.isTrusted || navigator.userActivation?.isActive === false ||
      !(gesture instanceof KeyboardEvent || gesture instanceof MouseEvent) ||
      ('pointerType' in gesture && gesture.pointerType && gesture.pointerType !== 'mouse') ||
      this.disposed || this.pending || document.pointerLockElement || !immersiveMouseSupported(this.canvas)) return;
    const request: LockRequest = { cancelled: false, legacy: true };
    this.pending = request;
    try {
      const completion = this.canvas.requestPointerLock();
      if (completion) {
        request.legacy = false;
        void completion.then(() => {
          if (this.pending !== request) return;
          if (document.pointerLockElement === this.canvas) this.reconcile();
          else this.reject(request);
        }, () => this.reject(request));
      }
    } catch {
      this.reject(request);
    }
  }

  release() {
    if (this.pending) this.pending.cancelled = true;
    this.setActive(false);
    if (document.pointerLockElement === this.canvas) {
      this.pending = undefined;
      document.exitPointerLock();
    }
  }

  dispose() {
    this.disposed = true;
    this.release();
    // A legacy request can still succeed after disposal. Observe its terminal event.
    this.detachIfSettled();
  }

  private reconcile = () => {
    if (document.pointerLockElement === this.canvas) {
      const request = this.pending;
      this.pending = undefined;
      if (request?.cancelled) document.exitPointerLock();
      else if (request) this.setActive(true);
    } else if (this.active) {
      this.setActive(false);
      this.lost();
    }
    this.detachIfSettled();
  };

  private reject(request: LockRequest) {
    if (this.pending === request) this.pending = undefined;
    this.detachIfSettled();
  }

  private setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.changed(active);
  }

  private detachIfSettled() {
    if (this.disposed && !this.pending) this.events.abort();
  }
}
