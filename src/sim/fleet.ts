import { Fleet as Tuning } from './config';
import { InvaderBomb } from './bomb';
import { Enemy } from './enemy';
import { UFO_BREED } from '../data/sprites';
import { dist, lerp, randInt, randRange, random, toCell, type Vec2 } from './math';
import type { World } from './world';

interface FleetInvader {
  enemy: Enemy;
  /** Cells from the fleet's top-left corner. */
  offset: Vec2;
  /** 0 is the top row; higher rows pay more. */
  row: number;
  counted: boolean;
}

/**
 * Invasion level (port of ADigInvaderFleet): the formation marches sideways in steps, drops and reverses at the
 * edges, speeds up as it thins out, and bombs Don from the lowest creature in a column.
 */
export class InvaderFleet {
  bombs: InvaderBomb[] = [];
  ufo: Enemy | null = null;
  private invaders: FleetInvader[] = [];
  private origin: Vec2 = { x: 0, y: 0 };
  private fleetPos: Vec2 = { x: 0, y: 0 };
  private dir = 1;
  private total = 0;
  private stepTimer = 0;
  private bombTimer = 0;
  private waitTimer = 0;
  private ufoTimer = 0;
  private ufoDir = 1;
  private beat = 0;

  constructor(
    private readonly world: World,
    enemies: Enemy[],
    rows: number[],
  ) {
    if (enemies.length === 0) return;
    this.origin = {
      x: Math.min(...enemies.map((e) => e.pos.x)),
      y: Math.min(...enemies.map((e) => e.pos.y)),
    };
    this.invaders = enemies.map((enemy, i) => ({
      enemy,
      offset: { x: enemy.pos.x - this.origin.x, y: enemy.pos.y - this.origin.y },
      row: rows[i] ?? 0,
      counted: false,
    }));
    this.total = this.invaders.length;
    this.regroup();
  }

  /** After Don dies: survivors return to the top and the air clears of bombs. */
  regroup(): void {
    this.fleetPos = { ...this.origin };
    this.dir = 1;
    this.bombs = [];
    this.removeUfo();
    this.waitTimer = Tuning.startDelay;
    this.stepTimer = this.stepInterval();
    this.bombTimer = randRange(Tuning.bombIntervalMin, Tuning.bombIntervalMax);
    this.placeInvaders();
  }

  private isAlive(inv: FleetInvader): boolean {
    return inv.enemy.state !== 'dead' && inv.enemy.state !== 'crushed';
  }

  countAlive(): number {
    return this.invaders.filter((i) => this.isAlive(i)).length;
  }

  private stepInterval(): number {
    // Keep the heartbeat measured until the formation is nearly gone.
    const share = this.total > 0 ? this.countAlive() / this.total : 1;
    const losses = 1 - share;
    return lerp(Tuning.baseStepInterval, Tuning.minStepInterval, losses * losses * losses) / this.world.difficulty();
  }

  update(dt: number): void {
    for (const b of this.bombs) b.update(dt);
    this.bombs = this.bombs.filter((b) => !b.done);
    this.ufo?.update(dt);
    if (!this.world.isPlaying()) return;
    this.scoreLosses();
    if (this.countAlive() === 0) return;
    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      return;
    }
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.step();
      this.stepTimer = this.stepInterval();
    }
    this.tickUfo(dt);
    this.bombTimer -= dt;
    if (this.bombTimer <= 0) {
      this.dropBomb();
      this.bombTimer = randRange(Tuning.bombIntervalMin, Tuning.bombIntervalMax) / this.world.difficulty();
    }
  }

  private step(): void {
    const maxX = this.world.grid.width - 1;
    let atEdge = false;
    for (const inv of this.invaders) {
      const nextX = this.fleetPos.x + inv.offset.x + this.dir * Tuning.stepSize;
      if (this.isAlive(inv) && (nextX < 0 || nextX > maxX)) {
        atEdge = true;
        break;
      }
    }
    if (atEdge) {
      this.fleetPos.y += Tuning.dropStep;
      this.dir = -this.dir;
    } else {
      this.fleetPos.x += this.dir * Tuning.stepSize;
    }
    this.placeInvaders();
    this.world.events.push({ type: 'fleetStep', beat: this.beat++ % 4 });

    // Reaching Don's row is an invasion.
    const floor = this.world.grid.height - 2;
    if (this.invaders.some((inv) => this.isAlive(inv) && this.fleetPos.y + inv.offset.y >= floor - 0.25)) {
      this.world.player.kill();
    }
  }

  private placeInvaders(): void {
    for (const inv of this.invaders) {
      if (!this.isAlive(inv)) continue;
      const p = { x: this.fleetPos.x + inv.offset.x, y: this.fleetPos.y + inv.offset.y };
      inv.enemy.setGridPos(p);
      // Marching through Don's cover knocks it down, as in the arcade original.
      const c = toCell(p);
      if (this.world.grid.removeBrick(c.x, c.y)) this.world.events.push({ type: 'brickBroken', at: c });
    }
  }

  private scoreLosses(): void {
    for (const inv of this.invaders) {
      if (inv.counted || this.isAlive(inv)) continue;
      inv.counted = true;
      // On top of the trowel's own points: top row +200, next two +100, bottom rows nothing extra.
      const bonus = inv.row === 0 ? 200 : inv.row <= 2 ? 100 : 0;
      if (bonus > 0) this.world.addScore(bonus, { x: this.fleetPos.x + inv.offset.x, y: this.fleetPos.y + inv.offset.y });
    }
  }

  private spawnUfo(): void {
    // Enter from a random side, just off the arena.
    this.ufoDir = random() < 0.5 ? 1 : -1;
    const pos = { x: this.ufoDir > 0 ? -1 : this.world.grid.width, y: Tuning.ufoRowY };
    this.ufo = new Enemy(this.world, pos, UFO_BREED, 'invader');
    this.ufo.setGridPos(pos);
    this.world.events.push({ type: 'ufo', active: true });
  }

  private tickUfo(dt: number): void {
    if (!this.ufo) {
      this.ufoTimer -= dt;
      if (this.ufoTimer <= 0) this.spawnUfo();
      return;
    }
    const pos = { x: this.ufo.pos.x + this.ufoDir * Tuning.ufoSpeed * dt, y: this.ufo.pos.y };
    this.ufo.setGridPos(pos);
    if (pos.x < -1.5 || pos.x > this.world.grid.width + 0.5) this.removeUfo(); // got away
  }

  private removeUfo(): void {
    if (this.ufo) this.world.events.push({ type: 'ufo', active: false });
    this.ufo = null;
    this.ufoTimer = randRange(Tuning.ufoIntervalMin, Tuning.ufoIntervalMax);
  }

  /** A trowel at pos hits the mystery UFO: pays a random bonus and brings in Don Jr. */
  hitUfoAt(pos: Vec2, grantDonJr: () => void): boolean {
    if (!this.ufo || dist(this.ufo.pos, pos) > Tuning.ufoHitRadius) return false;
    const at = { ...this.ufo.pos };
    this.world.addScore(Tuning.ufoPoints[randInt(Tuning.ufoPoints.length)], at);
    this.world.events.push({ type: 'ufoHit', at });
    grantDonJr();
    this.removeUfo();
    return true;
  }

  private dropBomb(): void {
    if (this.bombs.length >= Tuning.maxBombs) return;
    // The lowest living creature in each column is the one that can drop a bomb.
    const lowest = new Map<number, Vec2>();
    for (const inv of this.invaders) {
      if (!this.isAlive(inv)) continue;
      const p = { x: this.fleetPos.x + inv.offset.x, y: this.fleetPos.y + inv.offset.y };
      const col = Math.round(p.x);
      const found = lowest.get(col);
      if (!found || p.y > found.y) lowest.set(col, p);
    }
    if (lowest.size === 0) return;
    const columns = [...lowest.keys()];
    let chosen = columns[randInt(columns.length)];
    // Half the time, aim: bomb from the column nearest Don.
    if (random() < 0.5) {
      const donX = this.world.player.pos.x;
      for (const c of columns) if (Math.abs(c - donX) < Math.abs(chosen - donX)) chosen = c;
    }
    const from = lowest.get(chosen)!;
    const at = { x: from.x, y: from.y + 0.5 };
    this.bombs.push(new InvaderBomb(this.world, at));
    this.world.events.push({ type: 'bomb', at });
  }
}
