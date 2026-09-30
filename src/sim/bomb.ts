import { Bomb as Tuning } from './config';
import { dist, toCell, type Vec2 } from './math';
import type { World } from './world';

/** A zig-zagging bomb from the invasion formation (port of ADigInvaderBomb). */
export class InvaderBomb {
  pos: Vec2;
  age = 0;
  done = false;

  constructor(
    private readonly world: World,
    from: Vec2,
  ) {
    this.pos = { ...from };
  }

  update(dt: number): void {
    if (this.done) return;
    if (!this.world.isPlaying()) {
      this.done = true; // Don died or the round ended: clear the air
      return;
    }
    this.age += dt;
    this.pos.y += Tuning.speed * dt;
    const { player, grid } = this.world;
    if (player.alive && dist(player.pos, this.pos) < Tuning.hitRadius) {
      player.kill();
      this.done = true;
      return;
    }
    const jr = this.world.donJr();
    if (jr && dist(jr.pos, this.pos) < Tuning.hitRadius) {
      jr.kill();
      this.done = true;
      return;
    }
    const here = toCell(this.pos);
    if (grid.removeBrick(here.x, here.y)) {
      this.world.events.push({ type: 'brickBroken', at: here });
      this.done = true;
    } else if (!grid.isPassable(here.x, here.y)) {
      this.done = true;
    }
  }
}
