import { clampSection, RANGE_X, RANGE_Y } from '../core/collision';
import type { Point } from '../core/collision';
import type { InputFrame } from '../core/input';

export interface PointerView {
  x: number;
  y: number;
  visible: boolean;
  hover: boolean;
  down: boolean;
  locked: boolean;
}

export class InputController {
  private readonly events = new AbortController();
  private readonly keys = new Set<string>();
  private boostPointer: number | null = null;
  private touch: { id: number; x: number; y: number } | null = null;
  private dragX = 0;
  private dragY = 0;
  private target: Point | null = null;
  readonly pointer: PointerView;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    playing: () => boolean,
    command: (key: string, event: KeyboardEvent) => boolean,
    startCursor?: Point,
  ) {
    const { signal } = this.events;
    this.pointer = {
      x: startCursor?.[0] ?? window.innerWidth / 2,
      y: startCursor?.[1] ?? window.innerHeight / 2,
      visible: true, hover: false, down: false, locked: false,
    };

    window.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') {
        if (!this.touch || this.touch.id !== e.pointerId) return;
        this.dragX += (e.clientX - this.touch.x) / window.innerWidth;
        this.dragY += (e.clientY - this.touch.y) / window.innerHeight;
        this.touch.x = e.clientX;
        this.touch.y = e.clientY;
        return;
      }
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.visible = true;
      this.target = clampSection((e.clientX / window.innerWidth * 2 - 1) * RANGE_X,
        (1 - e.clientY / window.innerHeight * 2) * RANGE_Y, 0.34);
    }, { passive: true, signal });
    window.addEventListener('pointerover', e => {
      this.pointer.hover = e.target instanceof Element && !!e.target.closest('button');
    }, { signal });
    document.addEventListener('pointerleave', () => { this.pointer.visible = false; }, { signal });
    document.addEventListener('pointerenter', () => { this.pointer.visible = true; }, { signal });
    canvas.addEventListener('pointerdown', e => {
      if (!playing() || !e.isPrimary || e.button !== 0) return;
      try {
        if (!canvas.hasPointerCapture(e.pointerId)) canvas.setPointerCapture(e.pointerId);
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
      }
      this.pointer.down = true;
      this.pointer.visible = true;
      if (e.pointerType === 'touch') this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
      else this.boostPointer = e.pointerId;
    }, { signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      window.addEventListener(type, e => {
        if (e.pointerId === this.boostPointer) this.boostPointer = null;
        if (e.pointerId === this.touch?.id) {
          this.touch = null;
          if (type !== 'pointerup') this.dragX = this.dragY = 0;
        }
        this.pointer.down = this.boostPointer !== null || this.touch !== null;
      }, { signal });
    }
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (key !== 'escape' && event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (command(key, event)) return;
      if (playing()) {
        if (key.startsWith('arrow') || key === ' ') event.preventDefault();
        this.keys.add(key);
      }
    }, { signal });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()), { signal });
    window.addEventListener('blur', () => this.clear(), { signal });
    canvas.addEventListener('contextmenu', e => e.preventDefault(), { signal });
  }

  read(): InputFrame {
    const keys = this.keys;
    const axisX = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const axisY = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
    const frame = { axisX, axisY, target: this.target, dragX: this.dragX, dragY: this.dragY,
      boosting: this.boostPointer !== null || keys.has('shift') };
    this.target = null;
    this.dragX = this.dragY = 0;
    return frame;
  }

  moveReticle(input: InputFrame, x: number, y: number) {
    if (input.dragX || input.dragY) {
      this.pointer.x = (0.5 + x / RANGE_X * 0.31) * window.innerWidth;
      this.pointer.y = (0.5 - y / RANGE_Y * 0.31) * window.innerHeight - 64;
    } else if (input.axisX || input.axisY) {
      this.pointer.x = (x / RANGE_X + 1) * window.innerWidth / 2;
      this.pointer.y = (1 - y / RANGE_Y) * window.innerHeight / 2;
    }
  }

  clear() {
    const ids = [this.boostPointer, this.touch?.id];
    this.boostPointer = this.touch = this.target = null;
    for (const id of ids) {
      if (id != null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    }
    this.dragX = this.dragY = 0;
    this.keys.clear();
    this.pointer.down = this.pointer.locked = false;
  }

  dispose() {
    this.clear();
    this.events.abort();
  }
}
