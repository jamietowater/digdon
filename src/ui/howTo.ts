import type { LevelDef } from '../sim/game';

interface HowToText {
  goal: string;
  /** Matches the on-screen buttons in touchPad.ts. */
  touch: string[];
  keys: string[];
}

const STICK_SPRINT = 'Stick: move. Push it to the edge to sprint.';

/** The "How to play" card for each level: shown the first time a level starts, and from the pause menu. */
export const HOW_TO: Record<LevelDef['key'], HowToText> = {
  dig: {
    goal: 'Dig tunnels through the dirt. Clear all the dirt, or knock out every creature, to finish. Dig out under a rock to drop it on creatures for big points.',
    touch: [STICK_SPRINT, 'TROWEL: throw it at creatures.', 'TURBO: hold to run faster.'],
    keys: ['Arrows: move', 'Space / J: spray mortar (keep spraying to seal a creature)', 'S: throw trowel', 'A: turbo'],
  },
  bricklayer: {
    goal: 'Wall creatures into small pockets to trap them. Your trowel can\'t finish the last one: you have to brick it in. Chisel a girder out from under a can to drop it.',
    touch: [STICK_SPRINT, 'TROWEL: throw it at creatures.', 'BRICK: hold while walking to build a wall behind you.'],
    keys: ['Arrows: move', 'D: lay bricks behind you', 'Space / J: spray mortar', 'S: throw trowel', 'A: turbo'],
  },
  conga: {
    goal: 'Break up the marching conga lines. Leaders in hard hats pay a bonus. Knock a brick out from under a can to drop it on the line.',
    touch: [STICK_SPRINT, 'TROWEL: throw it at the line.', 'BRICK: hold to build a wall behind you.'],
    keys: ['Arrows: move', 'S: throw trowel', 'D: lay bricks', 'Space / J: spray mortar', 'A: turbo'],
  },
  invasion: {
    goal: 'Aliens march down in formation. Throw trowels straight up before they land, and build brick cover from their bombs. Hit the UFO and Junior joins in.',
    touch: ['Stick: move left and right.', 'THROW: throw a trowel up.', 'BRICK: build cover above you.'],
    keys: ['← →: move', 'Space / S: throw up', 'D: build cover'],
  },
  scaffold: {
    goal: 'As Junior, climb to the top and raise the topping-out flag. Jump over Mortar\'s cans and dodge the mortar blobs. A gold trowel smashes them, but you can\'t climb while you hold it.',
    touch: ['Stick: walk. Up and down on ladders.', 'JUMP: jump over cans.', 'TROWEL: throw it.'],
    keys: ['Arrows: walk and climb', 'Space / J: jump', 'S: throw trowel'],
  },
  summit: {
    goal: 'Smash up through the floors to the UFO at the top. Lobsters patch the holes behind you, and a dragon swoops by. Don\'t fall off the bottom of the screen.',
    touch: ['Stick: move.', 'JUMP: jump up and smash the floor above.', 'TROWEL: throw it.'],
    keys: ['Arrows: move', 'Space / J: jump', 'S: throw trowel', '2 players: A / D move, W jump, F throw'],
  },
  drive: {
    goal: 'Junior can\'t see, so his friend drives. Reach the finish before time runs out. Dodge or brick Mortar, luchadors and chilis. Mortar\'s cans splat the windshield.',
    touch: ['Stick: ← → steer, ↑ gas, ↓ brake.', 'BRICK: throw a brick ahead.'],
    keys: ['← →: steer', '↑: gas  ↓: brake', 'Space / J / S: throw a brick'],
  },
};

/** Fills the How to Play screen for a level, with touch or keyboard controls. */
export function renderHowTo(root: HTMLElement, level: LevelDef, number: number, touch: boolean): void {
  const text = HOW_TO[level.key];
  root.querySelector('.howto-level')!.textContent = `LEVEL ${number} · ${level.title}`;
  root.querySelector('.howto-goal')!.textContent = text.goal;
  root.querySelector('.howto-controls')!.replaceChildren(
    ...(touch ? text.touch : text.keys).map(line => Object.assign(document.createElement('li'), { textContent: line })),
  );
}
