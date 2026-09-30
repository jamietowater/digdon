import type { Vec2 } from './math';

/** Everything the presentation layer (audio, particles, popups, tutorial) needs to hear about. */
export type GameEvent =
  | { type: 'dig'; at: Vec2 }
  | { type: 'score'; points: number; at: Vec2 }
  | { type: 'spray'; at: Vec2 }
  | { type: 'mortarHit'; at: Vec2; layers: number }
  | { type: 'crack'; at: Vec2 }
  | { type: 'encaseKill'; at: Vec2 }
  | { type: 'trowelThrow'; at: Vec2 }
  | { type: 'trowelHit'; at: Vec2; dir: Vec2; sparks: number }
  | { type: 'trowelKill'; at: Vec2 }
  | { type: 'rockWobble'; at: Vec2 }
  | { type: 'rockFall'; at: Vec2 }
  | { type: 'rockLand'; at: Vec2; crushed: number }
  | { type: 'brickLaid'; at: Vec2 }
  | { type: 'brickBroken'; at: Vec2 }
  | { type: 'bomb'; at: Vec2 }
  | { type: 'fleetStep'; beat: number }
  | { type: 'ufo'; active: boolean }
  | { type: 'ufoHit'; at: Vec2 }
  | { type: 'bonusSpawn'; at: Vec2 }
  | { type: 'bonusCollect'; at: Vec2 }
  | { type: 'donJr' }
  | { type: 'ghost'; at: Vec2 }
  | { type: 'playerDied'; at: Vec2 }
  | { type: 'brickThrow'; at: Vec2 }
  | { type: 'canThrow'; at: Vec2 }
  | { type: 'raceHit'; at: Vec2 }
  | { type: 'splat'; at: Vec2 }
  | { type: 'crash'; at: Vec2 }
  | { type: 'levelStart'; level: number; round: number }
  | { type: 'levelClear'; level: number; round: number }
  | { type: 'gameOver'; score: number };

export class EventQueue {
  private items: GameEvent[] = [];

  push(e: GameEvent): void {
    this.items.push(e);
  }

  drain(): GameEvent[] {
    const out = this.items;
    this.items = [];
    return out;
  }
}
