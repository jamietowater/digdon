import { NO_INPUT, type Input } from '../sim/world';

/** One render frame of input: the sim's controls plus UI edges. Edges are true on one frame only. */
export interface InputFrame extends Input {
  pausePressed: boolean;
  backPressed: boolean;
  anyPressed: boolean;
}

/** Written by the on-screen touch controls. */
export interface TouchState {
  moveX: number;
  moveY: number;
  fire: boolean;
  throw: boolean;
  brick: boolean;
  turbo: boolean;
}

// Same bindings as the Unreal build (DigInput.h): one key, one job.
const FIRE = ['Space', 'KeyJ', 'Enter', 'NumpadEnter'];
const THROW = ['KeyS', 'ControlLeft'];
const TURBO = ['KeyA', 'ShiftLeft'];
const BRICK = ['KeyD'];
const PAUSE = ['KeyQ', 'KeyP'];
const BACK = ['KeyM', 'Escape'];
const GAME_KEYS = new Set([...FIRE, ...THROW, ...TURBO, ...BRICK, 'KeyW', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

// Standard gamepad mapping.
const PAD = { a: 0, x: 2, y: 3, lt: 6, rt: 7, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };

export class Controls {
  readonly touch: TouchState = { moveX: 0, moveY: 0, fire: false, throw: false, brick: false, turbo: false };
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private prevTouch = { fire: false, throw: false };
  private prevPad = new Set<string>();

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      // Keep the page from scrolling on arrows and space while playing.
      if (GAME_KEYS.has(e.code) && !(document.activeElement instanceof HTMLButtonElement)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  private any(codes: string[], set: Set<string>): boolean {
    return codes.some((c) => set.has(c));
  }

  /** Call once per render frame. */
  poll(): InputFrame {
    const pad = this.readPad();
    const heldPad = pad.held;
    const padPressed = new Set([...heldPad].filter((b) => !this.prevPad.has(b)));
    this.prevPad = heldPad;

    let x = 0;
    let y = 0;
    if (this.down.has('ArrowRight') || heldPad.has('right')) x += 1;
    if (this.down.has('ArrowLeft') || heldPad.has('left')) x -= 1;
    if (this.down.has('ArrowDown') || heldPad.has('down')) y += 1;
    if (this.down.has('ArrowUp') || heldPad.has('up')) y -= 1;
    if (x === 0 && y === 0 && Math.max(Math.abs(pad.stickX), Math.abs(pad.stickY)) > 0.4) {
      if (Math.abs(pad.stickX) >= Math.abs(pad.stickY)) x = Math.sign(pad.stickX);
      else y = Math.sign(pad.stickY);
    }
    if (x === 0 && y === 0) {
      x = this.touch.moveX;
      y = this.touch.moveY;
    }

    const touchFire = this.touch.fire && !this.prevTouch.fire;
    const touchThrow = this.touch.throw && !this.prevTouch.throw;
    this.prevTouch = { fire: this.touch.fire, throw: this.touch.throw };

    const frame: InputFrame = {
      ...NO_INPUT,
      player2: {
        ...NO_INPUT,
        moveX: Number(this.down.has('KeyD')) - Number(this.down.has('KeyA')),
        firePressed: this.pressed.has('KeyW'),
        throwPressed: this.pressed.has('KeyF'),
      },
      moveX: x,
      moveY: y,
      firePressed: this.any(FIRE, this.pressed) || padPressed.has('a') || padPressed.has('rt') || touchFire,
      throwPressed: this.any(THROW, this.pressed) || padPressed.has('x') || touchThrow,
      brickHeld: this.any(BRICK, this.down) || heldPad.has('y') || this.touch.brick,
      turboHeld: this.any(TURBO, this.down) || heldPad.has('lt') || this.touch.turbo,
      pausePressed: this.any(PAUSE, this.pressed) || padPressed.has('start'),
      backPressed: this.any(BACK, this.pressed) || padPressed.has('back'),
      anyPressed: this.pressed.size > 0 || padPressed.size > 0 || touchFire || touchThrow,
    };
    this.pressed.clear();
    return frame;
  }

  private readPad(): { held: Set<string>; stickX: number; stickY: number } {
    const held = new Set<string>();
    let stickX = 0;
    let stickY = 0;
    let pads: readonly (Gamepad | null)[] = [];
    try {
      pads = navigator.getGamepads?.() ?? [];
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'SecurityError') throw error;
    }
    for (const pad of pads) {
      if (!pad || pad.mapping !== 'standard') continue;
      for (const [name, index] of Object.entries(PAD)) {
        const b = pad.buttons[index];
        if (b && (b.pressed || b.value > 0.5)) held.add(name);
      }
      stickX = pad.axes[0] ?? 0;
      stickY = pad.axes[1] ?? 0;
    }
    return { held, stickX, stickY };
  }
}

/** Input frame with the one-shot edges removed, for extra sim steps within the same render frame. */
export function withoutEdges(frame: InputFrame): InputFrame {
  return { ...frame, player2: frame.player2 ? { ...frame.player2, firePressed: false, throwPressed: false } : undefined,
    firePressed: false, throwPressed: false, pausePressed: false, backPressed: false, anyPressed: false };
}
