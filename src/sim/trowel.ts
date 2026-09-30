import { Trowel } from './config';
import { dist, toCell, type Vec2 } from './math';
import type { World } from './world';

/** A trowel cartwheeling down a lane (port of AThrownTrowel). Kills the first creature it reaches. */
export class ThrownTrowel {
  pos: Vec2;
  age = 0;
  travelled = 0;
  done = false;

  constructor(
    private readonly world: World,
    from: Vec2,
    readonly dir: Vec2,
  ) {
    this.pos = { ...from };
  }

  update(dt: number): void {
    if (this.done) return;
    const { grid } = this.world;
    this.age += dt;
    const step = Trowel.speed * dt;
    this.pos.x += this.dir.x * step;
    this.pos.y += this.dir.y * step;
    this.travelled += step;

    // On the invasion level the trowel flies until it hits something, and knocks out the first brick it meets.
    const arcade = this.world.isInvaderLevel || this.world.isCongaLevel;
    const here = toCell(this.pos);
    if (this.hitEnemy() || this.world.tryTrowelBonusHit(this.pos)) {
      this.impact(16);
      return;
    }
    if (!arcade && this.travelled >= Trowel.range) {
      this.impact(5);
      return;
    }
    if (!grid.isPassable(here.x, here.y)) {
      // Stop at the face of the block, not inside it.
      this.pos.x -= this.dir.x * 0.45;
      this.pos.y -= this.dir.y * 0.45;
      if (arcade && grid.removeBrick(here.x, here.y)) {
        this.world.events.push({ type: 'brickBroken', at: here });
      }
      this.impact(10);
    }
  }

  private impact(sparks: number): void {
    this.done = true;
    this.world.events.push({ type: 'trowelHit', at: { ...this.pos }, dir: this.dir, sparks });
  }

  private hitEnemy(): boolean {
    for (const e of [...this.world.enemies]) {
      if (e.isHarmful() && dist(e.pos, this.pos) < Trowel.hitRadius) {
        if (!this.world.canWeaponsKill) return true;
        const at = { ...e.pos };
        this.world.addScore(Trowel.killPoints, at);
        this.world.events.push({ type: 'trowelKill', at });
        e.kill();
        return true;
      }
    }
    return false;
  }
}
