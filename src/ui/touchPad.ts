import type { TouchState } from '../input/controls';

interface ActionDef {
  key: keyof Omit<TouchState, 'moveX' | 'moveY'>;
  label: string;
  cls: string;
  big?: boolean;
}

const LAYOUTS: Record<'dig' | 'bricklayer' | 'invasion' | 'platform', ActionDef[]> = {
  platform: [
    { key: 'fire', label: 'JUMP', cls: 'spray', big: true },
    { key: 'throw', label: 'TROWEL', cls: 'trowel' },
  ],
  dig: [
    { key: 'fire', label: 'SPRAY', cls: 'spray', big: true },
    { key: 'throw', label: 'TROWEL', cls: 'trowel' },
    { key: 'turbo', label: 'TURBO', cls: 'turbo' },
  ],
  bricklayer: [
    { key: 'fire', label: 'SPRAY', cls: 'spray' },
    { key: 'throw', label: 'TROWEL', cls: 'trowel' },
    { key: 'turbo', label: 'TURBO', cls: 'turbo' },
    { key: 'brick', label: 'BRICK', cls: 'brick' },
  ],
  invasion: [
    { key: 'fire', label: 'THROW', cls: 'throw', big: true },
    { key: 'brick', label: 'BRICK', cls: 'brick' },
  ],
};

/** On-screen d-pad (drag anywhere on it; the dominant axis wins) and the level's action buttons. */
export class TouchPad {
  private readonly pad = document.getElementById('pad')!;
  private readonly dpad = document.getElementById('dpad')!;
  private readonly knob = document.getElementById('dpad-knob')!;
  private readonly actions = document.getElementById('actions')!;
  private mode: keyof typeof LAYOUTS | null = null;
  private dpadPointer: number | null = null;
  private readonly held = new Map<HTMLButtonElement, { pointer: number }>();
  enabled = false;

  /** First touch seen: switch to on-screen controls from now on. */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.setMode(this.mode);
  }

  constructor(private readonly touch: TouchState) {
    this.dpad.addEventListener('pointerdown', (e) => {
      if (this.dpadPointer !== null) return;
      e.preventDefault();
      this.dpadPointer = e.pointerId;
      this.dpad.setPointerCapture(e.pointerId);
      this.steer(e);
    });
    this.dpad.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.dpadPointer) this.steer(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.dpadPointer) return;
      this.dpadPointer = null;
      this.touch.moveX = 0;
      this.touch.moveY = 0;
      this.knob.style.transform = 'translate(-50%, -50%)';
    };
    this.dpad.addEventListener('pointerup', release);
    this.dpad.addEventListener('pointercancel', release);
    this.dpad.addEventListener('lostpointercapture', release);
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }

  reset(): void {
    const pointer = this.dpadPointer;
    this.dpadPointer = null;
    if (pointer !== null && this.dpad.hasPointerCapture(pointer)) this.dpad.releasePointerCapture(pointer);
    const held = [...this.held];
    this.held.clear();
    for (const [button, entry] of held) {
      button.classList.remove('on');
      if (button.hasPointerCapture(entry.pointer)) button.releasePointerCapture(entry.pointer);
    }
    Object.assign(this.touch, { moveX: 0, moveY: 0, fire: false, throw: false, brick: false, turbo: false });
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private steer(e: PointerEvent): void {
    const r = this.dpad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const dead = r.width * 0.1;
    let x = 0;
    let y = 0;
    if (Math.hypot(dx, dy) > dead) {
      if (Math.abs(dx) >= Math.abs(dy)) x = Math.sign(dx);
      else y = Math.sign(dy);
    }
    if (this.mode === 'invasion') y = 0;
    this.touch.moveX = x;
    this.touch.moveY = y;
    const reach = r.width * 0.28;
    this.knob.style.transform = `translate(calc(-50% + ${x * reach}px), calc(-50% + ${y * reach}px))`;
  }

  /** Swap the action buttons for the level and show the pad on touch devices. */
  setMode(mode: keyof typeof LAYOUTS | 'conga' | 'scaffold' | 'summit' | null): void {
    if (mode === 'conga') mode = 'bricklayer';
    if (mode === 'scaffold' || mode === 'summit') mode = 'platform';
    this.pad.hidden = !this.enabled || mode === null;
    this.reset();
    if (mode === this.mode) return;
    this.mode = mode;
    this.actions.replaceChildren();
    if (!mode) return;
    this.actions.dataset.count = String(LAYOUTS[mode].length);
    for (const def of LAYOUTS[mode]) {
      const b = document.createElement('button');
      b.className = `act ${def.cls}${def.big ? ' big' : ''}`;
      b.textContent = def.label;
      b.setAttribute('aria-label', def.label);
      const set = (on: boolean) => (e: PointerEvent) => {
        e.preventDefault();
        if (on && this.held.has(b)) return;
        if (!on && this.held.get(b)?.pointer !== e.pointerId) return;
        if (on) this.held.set(b, { pointer: e.pointerId });
        else this.held.delete(b);
        this.touch[def.key] = on;
        b.classList.toggle('on', on);
        if (on) b.setPointerCapture(e.pointerId);
      };
      b.addEventListener('pointerdown', set(true));
      b.addEventListener('pointerup', set(false));
      b.addEventListener('pointercancel', set(false));
      b.addEventListener('lostpointercapture', set(false));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      this.actions.append(b);
    }
  }
}
