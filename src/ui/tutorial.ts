import type { GameEvent } from '../sim/events';

interface Step {
  touch: string;
  keys: string;
  /** Finishes the step when this returns true for an event (or on a movement frame). */
  done: (e: GameEvent | 'moved') => boolean;
}

const STEPS: Record<'dig' | 'bricklayer' | 'invasion', Step[]> = {
  dig: [
    {
      touch: 'Drag the pad to walk. Walking into dirt digs a tunnel.',
      keys: 'Arrow keys to walk. Walking into dirt digs a tunnel.',
      done: (() => {
        let dug = 0;
        return (e) => e !== 'moved' && e.type === 'dig' && ++dug >= 3;
      })(),
    },
    {
      touch: 'Face a creature down a tunnel and tap SPRAY. Keep tapping to set it solid in mortar.',
      keys: 'Face a creature down a tunnel and tap SPACE to spray mortar. Keep tapping to set it solid.',
      done: (e) => e !== 'moved' && (e.type === 'encaseKill' || e.type === 'trowelKill'),
    },
    {
      touch: 'Dig out the dirt under a soda can, then step aside: it drops and crushes whatever is below.',
      keys: 'Dig out the dirt under a soda can, then step aside: it drops and crushes whatever is below.',
      done: (e) => e !== 'moved' && e.type === 'rockFall',
    },
  ],
  bricklayer: [
    {
      touch: 'Drag the pad to walk. Hold BRICK while moving to wall creatures into a pocket.',
      keys: 'Arrow keys to walk. Hold D while moving to wall creatures into a pocket.',
      done: (e) => e !== 'moved' && e.type === 'brickLaid',
    },
    {
      touch: 'Dig under a soda can, then step aside to drop it on the creatures below.',
      keys: 'Dig under a soda can, then step aside to drop it on the creatures below.',
      done: (e) => e !== 'moved' && e.type === 'rockFall',
    },
  ],
  invasion: [
    {
      touch: 'Drag the pad left and right to move along the bottom.',
      keys: 'Left and right arrows to move along the bottom.',
      done: (e) => e === 'moved',
    },
    {
      touch: 'Tap THROW to send a trowel straight up at the invaders.',
      keys: 'SPACE or S to throw a trowel straight up at the invaders.',
      done: (e) => e !== 'moved' && e.type === 'trowelThrow',
    },
    {
      touch: 'Hold BRICK to lay cover above you. Bombs chip it away.',
      keys: 'Hold D to lay a brick of cover above you. Bombs chip it away.',
      done: (e) => e !== 'moved' && e.type === 'brickLaid',
    },
  ],
};

/** First-play guide for each level: one short card at a time, advanced by actually doing the thing. */
export class Tutorial {
  private readonly card = document.getElementById('tutorial')!;
  private level: 'dig' | 'bricklayer' | 'invasion' | null = null;
  private index = 0;

  constructor(
    private readonly isTouch: () => boolean,
    private readonly onFinished: (level: 'dig' | 'bricklayer' | 'invasion') => void,
  ) {}

  start(level: 'dig' | 'bricklayer' | 'invasion'): void {
    this.level = level;
    this.index = 0;
    this.render();
  }

  stop(): void {
    this.level = null;
    this.card.hidden = true;
  }

  get active(): boolean {
    return this.level !== null;
  }

  /** Re-word the current card, e.g. once touch input is detected. */
  refresh(): void {
    this.render();
  }

  observe(events: readonly GameEvent[], moved: boolean): void {
    if (!this.level) return;
    const step = STEPS[this.level][this.index];
    const hit = (moved && step.done('moved')) || events.some((e) => step.done(e));
    if (!hit) return;
    this.index++;
    if (this.index >= STEPS[this.level].length) {
      const finished = this.level;
      this.stop();
      this.onFinished(finished);
    } else {
      this.render();
    }
  }

  private render(): void {
    if (!this.level) return;
    const steps = STEPS[this.level];
    const step = steps[this.index];
    const label = document.createElement('div');
    label.className = 'step';
    label.textContent = `HOW TO PLAY ${this.index + 1}/${steps.length}`;
    const text = document.createElement('div');
    text.textContent = this.isTouch() ? step.touch : step.keys;
    const skip = document.createElement('button');
    skip.className = 'skip';
    skip.textContent = '✕';
    skip.setAttribute('aria-label', 'Skip tutorial');
    skip.addEventListener('click', () => {
      const finished = this.level!;
      this.stop();
      this.onFinished(finished);
    });
    this.card.replaceChildren(label, text, skip);
    this.card.hidden = false;
  }
}
