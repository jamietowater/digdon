import type { EventQueue } from './events';
import type { Grid } from './grid';
import type { Vec2 } from './math';
import type { Player } from './player';
import type { Enemy } from './enemy';
import type { FallingRock } from './rock';
import type { DonJr } from './donjr';

/** What the actors need from the game mode (ADigGameMode's public surface for these two levels). */
export interface World {
  readonly grid: Grid;
  readonly player: Player;
  readonly enemies: readonly Enemy[];
  readonly rocks: readonly FallingRock[];
  readonly events: EventQueue;
  readonly isInvaderLevel: boolean;
  readonly brickLaying: boolean;
  isPlaying(): boolean;
  /** Enemy speed multiplier; +8% per cleared round. */
  difficulty(): number;
  /** Don Jr. if he is with Don and still standing. */
  donJr(): DonJr | null;
  addScore(points: number, at: Vec2): void;
  onEnemyKilled(enemy: Enemy): void;
  onPlayerKilled(): void;
  onRockDropped(): void;
  spawnTrowel(from: Vec2, dir: Vec2): void;
  /** A trowel at pos hits the UFO or the bonus item (invasion only). */
  tryTrowelBonusHit(pos: Vec2): boolean;
}

export interface Input {
  /** -1, 0 or 1 per axis; +y is down the screen. */
  moveX: number;
  moveY: number;
  firePressed: boolean;
  throwPressed: boolean;
  brickHeld: boolean;
  turboHeld: boolean;
}

export const NO_INPUT: Input = {
  moveX: 0,
  moveY: 0,
  firePressed: false,
  throwPressed: false,
  brickHeld: false,
  turboHeld: false,
};
