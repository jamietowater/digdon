import { Enemy as Tuning } from './config';
import { Breeds, type BreedDef } from '../data/sprites';
import { Cell } from './grid';
import { clamp, dist, randInt, toCell, type Vec2 } from './math';
import type { World } from './world';

export type EnemyState = 'wander' | 'chase' | 'ghost' | 'encased' | 'crushed' | 'dead';
/** Diggers route through tunnels; invaders are marched by the fleet. */
export type EnemyKind = 'digger' | 'invader' | 'conga';

const DIRS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

let nextId = 1;

/** Port of ADigEnemy: wander/chase through tunnels by BFS, phase through dirt as a ghost when boxed out. */
export class Enemy {
  readonly id = nextId++;
  readonly breedIndex: number;
  readonly breed: BreedDef;
  state: EnemyState = 'wander';
  pos: Vec2;
  facingX = 1;
  hidden = false;
  head = false;
  mortarLayers = 0;
  animTime = 0;
  private nextCell: Vec2;
  private lastCell: Vec2;
  private crackTimer = 0;
  private noRouteTime = 0;
  private ghostTime = 0;
  private idleTimer = 0;
  private pauseClock = 0;

  constructor(
    private readonly world: World,
    readonly spawn: Vec2,
    breedIndex: number,
    readonly kind: EnemyKind = 'digger',
  ) {
    this.breedIndex = ((breedIndex % Breeds.length) + Breeds.length) % Breeds.length;
    this.breed = Breeds[this.breedIndex];
    this.pos = { ...spawn };
    this.nextCell = { ...spawn };
    this.lastCell = { ...spawn };
    this.resetToSpawn();
  }

  get setStages(): number {
    return this.kind === 'conga' ? 2 : Tuning.setStages + this.breed.extraSetStages;
  }

  isHarmful(): boolean {
    return !this.hidden && (this.state === 'wander' || this.state === 'chase');
  }

  canBeEncased(): boolean {
    return !this.hidden && (this.state === 'wander' || this.state === 'chase' || this.state === 'encased');
  }

  resetToSpawn(): void {
    this.pos = { ...this.spawn };
    this.nextCell = { ...this.spawn };
    this.lastCell = { ...this.spawn };
    this.mortarLayers = 0;
    this.noRouteTime = 0;
    this.ghostTime = 0;
    this.pauseClock = 0;
    this.facingX = 1;
    this.idleTimer = Tuning.spawnIdleTime;
    this.state = 'wander';
  }

  setGridPos(p: Vec2): void {
    if (Math.abs(p.x - this.pos.x) > 1e-4) this.facingX = p.x > this.pos.x ? 1 : -1;
    this.pos = { ...p };
  }

  /** Adds one mortar layer. Returns true if this layer set the creature solid (kill). */
  addMortar(): boolean {
    if (!this.canBeEncased()) return false;
    this.mortarLayers++;
    this.crackTimer = Tuning.crackInterval;
    this.state = 'encased';
    if (!this.world.canWeaponsKill && this.mortarLayers >= this.setStages) this.mortarLayers = Math.max(1, this.setStages - 1);
    if (this.mortarLayers >= this.setStages) {
      this.kill();
      return true;
    }
    return false;
  }

  crush(): void {
    if (this.state !== 'dead') this.state = 'crushed';
  }

  kill(): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.world.onEnemyKilled(this);
  }

  update(dt: number): void {
    this.animTime += dt;
    const playing = this.world.isPlaying();
    switch (this.state) {
      case 'encased':
        this.crackTimer -= dt;
        if (this.crackTimer <= 0) {
          this.crackTimer = Tuning.crackInterval;
          if (--this.mortarLayers <= 0) {
            this.mortarLayers = 0;
            this.state = 'chase';
          } else {
            this.world.events.push({ type: 'crack', at: { ...this.pos } });
          }
        }
        break;
      case 'ghost':
        if (playing) this.tickGhost(dt);
        break;
      case 'wander':
      case 'chase':
        if (playing && this.kind === 'digger') {
          if (this.idleTimer > 0) this.idleTimer -= dt;
          else this.tickTunnel(dt);
        }
        break;
      default:
        break;
    }

    if (playing && this.isHarmful()) {
      const player = this.world.player;
      if (player.alive && dist(player.pos, this.pos) < Tuning.contactRange) player.kill();
      const jr = this.world.donJr();
      if (jr && dist(jr.pos, this.pos) < Tuning.contactRange) jr.kill();
    }
  }

  private tickTunnel(dt: number): void {
    const scale = this.world.difficulty() * this.breed.speedMul;
    if (this.state === 'wander') {
      this.noRouteTime += dt;
      if (this.noRouteTime >= (Tuning.ghostDelay * this.breed.patienceMul) / scale && this.world.player.alive) {
        this.ghostTime = 0;
        this.state = 'ghost';
        this.world.events.push({ type: 'ghost', at: { ...this.pos } });
        return;
      }
    }

    // Lurkers freeze on the spot for a beat, then scuttle again.
    const b = this.breed;
    if (b.pauseInterval > 0) {
      this.pauseClock = (this.pauseClock + dt) % (b.pauseInterval + b.pauseTime);
      if (this.pauseClock > b.pauseInterval) return;
    }

    const { grid } = this.world;
    let budget = Tuning.moveSpeed * scale * dt;
    for (let iter = 0; iter < 3 && budget > 1e-4; iter++) {
      // A brick may have been laid into the cell we were heading for: back out to the one we left.
      if (!grid.isPassable(this.nextCell.x, this.nextCell.y)) this.nextCell = toCell(this.pos);
      const dx = this.nextCell.x - this.pos.x;
      const dy = this.nextCell.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 1e-4) this.facingX = dx > 0 ? 1 : -1;
      if (d <= budget) {
        this.pos = { ...this.nextCell };
        budget -= d;
        this.chooseNextCell();
        const here = toCell(this.pos);
        if ((this.nextCell.x === here.x && this.nextCell.y === here.y) || this.state === ('ghost' as EnemyState)) break;
      } else {
        this.pos.x += (dx / d) * budget;
        this.pos.y += (dy / d) * budget;
        budget = 0;
      }
    }
  }

  private chooseNextCell(): void {
    const current = toCell(this.pos);
    const route = this.findRouteToPlayer();
    if (route) {
      this.state = 'chase';
      this.noRouteTime = 0;
      this.nextCell = route.length > 0 ? route[0] : current;
    } else {
      this.state = 'wander';
      const { grid } = this.world;
      const options: Vec2[] = [];
      for (const d of DIRS) {
        const n = { x: current.x + d.x, y: current.y + d.y };
        if ((n.x !== this.lastCell.x || n.y !== this.lastCell.y) && grid.isPassable(n.x, n.y)) options.push(n);
      }
      const atLast = this.lastCell.x === current.x && this.lastCell.y === current.y;
      if (options.length === 0 && grid.isPassable(this.lastCell.x, this.lastCell.y) && !atLast) {
        options.push({ ...this.lastCell }); // dead end: turn around
      }
      this.nextCell = options.length > 0 ? options[randInt(options.length)] : current;
    }
    this.lastCell = current;
  }

  private findRouteToPlayer(): Vec2[] | null {
    const player = this.world.player;
    if (!player.alive) return null;
    const current = toCell(this.pos);
    for (const goal of player.occupiedCells()) {
      const path = this.world.grid.findPath(current, goal);
      if (path) return path;
    }
    return null;
  }

  private tickGhost(dt: number): void {
    const { grid, player } = this.world;
    this.ghostTime += dt;
    const here = toCell(this.pos);
    const canSolidify = this.ghostTime >= Tuning.minGhostTime && grid.get(here.x, here.y) === Cell.Tunnel;

    // Head for the player; once in open tunnel after the minimum phase time, settle onto that cell.
    const goal = canSolidify ? here : player.pos;
    const dx = goal.x - this.pos.x;
    const dy = goal.y - this.pos.y;
    const d = Math.hypot(dx, dy);
    const step = Tuning.ghostSpeed * this.world.difficulty() * this.breed.speedMul * dt;
    let next = d <= step ? { ...goal } : { x: this.pos.x + (dx / d) * step, y: this.pos.y + (dy / d) * step };

    // Bricks stop even a ghost; slide along the wall instead of phasing through it.
    const isBrick = (p: Vec2) => {
      const c = toCell(p);
      return grid.get(c.x, c.y) === Cell.Brick;
    };
    if (isBrick(next)) {
      const slideX = { x: next.x, y: this.pos.y };
      const slideY = { x: this.pos.x, y: next.y };
      if (!isBrick(slideX)) next = slideX;
      else if (!isBrick(slideY)) next = slideY;
      else next = { ...this.pos };
    }
    if (Math.abs(next.x - this.pos.x) > 1e-4) this.facingX = next.x > this.pos.x ? 1 : -1;
    this.pos = { x: clamp(next.x, 0, grid.width - 1), y: clamp(next.y, 0, grid.height - 2) };

    if (canSolidify && d <= step) {
      this.nextCell = { ...here };
      this.lastCell = { ...here };
      this.noRouteTime = 0;
      this.state = 'chase';
    }
  }
}
