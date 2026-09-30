import { DonJr as Tuning } from './config';
import type { Vec2 } from './math';
import type { Player } from './player';
import type { World } from './world';

const DEATH_TIME = 0.5;

/** Don Jr. riding beside his dad on the invasion level (port of ADigDonJr): double firepower, like a dual fighter. */
export class DonJr {
  pos: Vec2;
  alive = true;
  deathTime = 0;
  age = 0;
  moving = false;
  private side = 1;

  constructor(
    private readonly world: World,
    private readonly don: Player,
  ) {
    this.pos = { x: don.pos.x + this.side, y: don.pos.y };
  }

  /** Fully gone once the death animation has played. */
  get gone(): boolean {
    return !this.alive && this.deathTime >= DEATH_TIME;
  }

  get facing(): Vec2 {
    return this.don.facing;
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.deathTime = 0;
    this.world.events.push({ type: 'playerDied', at: { ...this.pos } });
  }

  throwWith(dir: Vec2): void {
    if (this.alive) this.world.spawnTrowel(this.pos, dir);
  }

  update(dt: number): void {
    this.moving = false;
    if (!this.alive) {
      this.deathTime += dt;
      return;
    }
    this.age += dt;
    if (!this.don.alive) return; // wait for dad to respawn, then rejoin at his side

    // Right of Don if there's room, otherwise his left; slide across rather than jump.
    const { grid } = this.world;
    const c = this.don.cell();
    const hasRoom = (x: number, y: number) => grid.inBounds(x, y) && grid.isPassable(x, y);
    let target = 1;
    if (!hasRoom(c.x + 1, c.y)) {
      target = hasRoom(c.x - 1, c.y) || !grid.inBounds(c.x + 1, c.y) ? -1 : 1;
    }
    const rate = 2 / Math.max(0.01, Tuning.sideSwitchTime);
    this.side += Math.sign(target - this.side) * Math.min(Math.abs(target - this.side), rate * dt);
    const next = { x: this.don.pos.x + this.side, y: this.don.pos.y };
    this.moving = next.x !== this.pos.x || next.y !== this.pos.y;
    this.pos = next;
  }
}
