import { Mortar, encaseKillPoints } from './config';
import type { Enemy } from './enemy';
import { Cell } from './grid';
import { random, randRange, type Vec2 } from './math';
import type { Player } from './player';
import type { World } from './world';

/** One blob of mortar in flight, or a droplet thrown off by a splat. Grid units. */
export interface Glob {
  pos: Vec2;
  vel: Vec2;
  age: number;
  /** Stream blobs: distance left before they splat. Droplets: seconds left to live. */
  remaining: number;
  life: number;
  size: number;
  phase: number;
  foam: boolean;
  droplet: boolean;
}

/**
 * Mortar mixer (port of UMortarMixerComponent). Sprays along Don's facing through open tunnel only;
 * on a hit it stays latched, and every further press adds a layer until the creature sets and crumbles.
 */
export class MortarMixer {
  globs: Glob[] = [];
  recoil = 0;
  private latched: Enemy | null = null;
  private shotTimer = 0;
  private shotLength = 0;
  private streamLength = 0;
  private emitAccum = 0;
  private globCounter = 0;

  constructor(
    private readonly world: World,
    private readonly pawn: Player,
  ) {}

  get isLatched(): boolean {
    return this.latched !== null;
  }

  release(): void {
    this.latched = null;
    this.shotTimer = 0;
  }

  fire(): void {
    this.recoil = 1;
    const pawn = this.pawn;
    const dir = pawn.facing;
    const enemy = this.latched;
    if (enemy) {
      if (enemy.canBeEncased()) {
        const band = this.world.grid.depthBand(Math.round(enemy.pos.y));
        for (let i = 0; i < 4; i++) this.spawnGlob(randRange(1.1, 1.5));
        const at = { ...enemy.pos };
        if (enemy.addMortar()) {
          this.splat(at, dir, 18);
          this.world.addScore(encaseKillPoints(band), at);
          this.world.events.push({ type: 'encaseKill', at });
          this.release();
        } else {
          this.world.events.push({ type: 'mortarHit', at, layers: enemy.mortarLayers });
        }
        return;
      }
      this.latched = null;
    }

    const free = this.traceFreeLength();
    const target = this.findTarget(free);
    this.world.events.push({ type: 'spray', at: { ...pawn.pos } });
    if (target) {
      this.latched = target;
      target.addMortar();
      this.world.events.push({ type: 'mortarHit', at: { ...target.pos }, layers: target.mortarLayers });
      this.streamLength = this.reach(target);
    } else {
      this.shotTimer = Mortar.shotDisplayTime;
      this.shotLength = this.streamLength = free;
    }
    for (let i = 0; i < 5; i++) this.spawnGlob(randRange(1.0, 1.4));
  }

  update(dt: number): void {
    this.recoil = Math.max(0, this.recoil - dt / Mortar.recoilTime);
    let flowing = false;
    const enemy = this.latched;
    if (enemy) {
      if (enemy.state !== 'encased') {
        this.release();
      } else {
        this.streamLength = this.reach(enemy);
        flowing = true;
      }
    } else if (this.shotTimer > 0) {
      this.shotTimer -= dt;
      this.streamLength = this.shotLength;
      flowing = true;
    }

    if (flowing) {
      this.emitAccum += dt * Mortar.globRate;
      while (this.emitAccum >= 1) {
        this.emitAccum -= 1;
        this.spawnGlob(randRange(0.8, 1.15));
      }
    } else {
      this.emitAccum = 0;
    }
    this.updateGlobs(dt);
  }

  private reach(enemy: Enemy): number {
    const rx = enemy.pos.x - this.pawn.pos.x;
    const ry = enemy.pos.y - this.pawn.pos.y;
    return Math.max(0.3, Math.abs(rx) + Math.abs(ry) - 0.15);
  }

  private spawnGlob(sizeMul: number): void {
    const dir = this.pawn.facing;
    const perp = { x: -dir.y, y: dir.x };
    const j = randRange(-0.05, 0.05);
    const speed = Mortar.globSpeed * randRange(0.85, 1.1);
    const side = randRange(-0.4, 0.4);
    const foam = ++this.globCounter % 3 === 0;
    this.globs.push({
      pos: {
        x: this.pawn.pos.x + dir.x * Mortar.nozzleOffset + perp.x * j,
        y: this.pawn.pos.y + dir.y * Mortar.nozzleOffset + perp.y * j,
      },
      vel: { x: dir.x * speed + perp.x * side, y: dir.y * speed + perp.y * side },
      age: 0,
      remaining: Math.max(0.1, this.streamLength - Mortar.nozzleOffset),
      life: 0,
      size: Mortar.globSize * sizeMul * (foam ? 0.7 : 1),
      phase: randRange(0, Math.PI * 2),
      foam,
      droplet: false,
    });
  }

  private splat(where: Vec2, dir: Vec2, count: number): void {
    const perp = { x: -dir.y, y: dir.x };
    for (let i = 0; i < count; i++) {
      const back = randRange(0.5, 3.5);
      const side = randRange(-4, 4);
      const up = randRange(3, 7);
      const life = randRange(0.3, 0.55);
      this.globs.push({
        pos: { ...where },
        vel: { x: -dir.x * back + perp.x * side, y: -dir.y * back + perp.y * side - up },
        age: 0,
        remaining: life,
        life,
        size: Mortar.globSize * randRange(0.35, 0.65),
        phase: 0,
        foam: random() < 0.5,
        droplet: true,
      });
    }
  }

  private updateGlobs(dt: number): void {
    const splats: [Vec2, Vec2][] = [];
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const g = this.globs[i];
      g.age += dt;
      if (g.droplet) {
        g.vel.y += Mortar.dropletGravity * dt;
        g.pos.x += g.vel.x * dt;
        g.pos.y += g.vel.y * dt;
        g.remaining -= dt;
        if (g.remaining <= 0) this.globs.splice(i, 1);
        continue;
      }
      const speed = Math.hypot(g.vel.x, g.vel.y);
      g.pos.x += g.vel.x * dt;
      g.pos.y += g.vel.y * dt;
      g.remaining -= speed * dt;
      if (g.remaining <= 0) {
        splats.push([{ ...g.pos }, { x: g.vel.x / speed, y: g.vel.y / speed }]);
        this.globs.splice(i, 1);
      }
    }
    for (const [at, dir] of splats) this.splat(at, dir, 2);
  }

  private traceFreeLength(): number {
    const { grid } = this.world;
    const dir = this.pawn.facing;
    const step = 0.25;
    for (let d = step; d <= Mortar.range; d += step) {
      const tx = this.pawn.pos.x + dir.x * (d + 0.25);
      const ty = this.pawn.pos.y + dir.y * (d + 0.25);
      if (grid.get(Math.round(tx), Math.round(ty)) !== Cell.Tunnel) return d;
    }
    return Mortar.range;
  }

  private findTarget(maxLength: number): Enemy | null {
    const dir = this.pawn.facing;
    let best: Enemy | null = null;
    let bestAlong = Infinity;
    for (const enemy of this.world.enemies) {
      if (!enemy.canBeEncased()) continue;
      const rx = enemy.pos.x - this.pawn.pos.x;
      const ry = enemy.pos.y - this.pawn.pos.y;
      const along = rx * dir.x + ry * dir.y;
      const perp = Math.abs(rx * dir.y - ry * dir.x);
      if (along > -0.2 && along <= maxLength + 0.5 && perp < 0.6 && along < bestAlong) {
        best = enemy;
        bestAlong = along;
      }
    }
    return best;
  }
}
