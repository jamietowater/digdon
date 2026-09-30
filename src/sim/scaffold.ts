import { Breeds, BonusItems, UFO_BREED } from '../data/sprites';
import type { Game } from './game';
import { dist, randInt, random, type Vec2 } from './math';
import { floor, ladderSpan, Platform, solid } from './platform';

export interface SiteThing {
  pos: Vec2;
  sprite?: string;
  breed?: number;
  item?: number;
  scale?: number;
  angle?: number;
}

interface Hazard extends SiteThing {
  kind: 'can' | 'flame' | 'creature';
  direction: number;
  age: number;
  falling: boolean;
  descending: boolean;
  velocity: number;
  lastColumn: number;
  climbTarget?: number;
}

export class ScaffoldSite {
  readonly props: SiteThing[] = [];
  items: SiteThing[];
  mallets: SiteThing[] = [];
  hazards: Hazard[] = [];
  bonus = 5000;
  readonly captive: Vec2;
  readonly thrower: Vec2;
  readonly drum: Vec2;
  private wait = 2;
  private clock = 0;
  private canTimer = 0;
  private creatureTimer = 6;
  private jumped = new Set<Hazard>();

  constructor(private readonly game: Game) {
    const markers = game.grid.markers;
    this.thrower = markers.get('K')?.[0] ?? { x: 2, y: 1 };
    this.captive = markers.get('D')?.[0] ?? { x: game.grid.width - 1, y: 1 };
    this.drum = markers.get('O')?.[0] ?? { x: 0, y: game.grid.height - 2 };
    this.props.push({ pos: { x: this.thrower.x, y: this.thrower.y - 0.45 }, sprite: 'CanSlinger', scale: 1.8 },
      { pos: this.captive, sprite: 'Don' }, { pos: this.drum, sprite: 'Drum' });
    for (const [marker, sprite] of Object.entries({ F: 'Flag', T: 'Cactus', A: 'ChiliAmigo', Q: 'CactusAmigo', L: 'Luchador' })) {
      for (const pos of markers.get(marker) ?? []) this.props.push({ pos, sprite });
    }
    this.items = (markers.get('U') ?? []).map((pos, index) => ({ pos, item: (game.round - 1 + 3 * index) % BonusItems.length }));
    this.reset();
  }

  get things(): SiteThing[] { return [...this.props, ...this.items, ...this.mallets, ...this.hazards]; }

  reset(): void {
    this.hazards = [];
    this.mallets = (this.game.grid.markers.get('M') ?? []).map(pos => ({ pos, sprite: 'Mallet', scale: 0.75 }));
    this.bonus = 5000;
    this.clock = 0;
    this.wait = 2;
    this.canTimer = 0;
    this.creatureTimer = 6;
    this.jumped.clear();
  }

  private rollDirection(pos: Vec2, previous: number): number {
    const grid = this.game.grid;
    let left = Math.round(pos.x);
    let right = left;
    while (left > 0 && floor(grid, left - 1, Math.round(pos.y) + 1)) left--;
    while (right < grid.width - 1 && floor(grid, right + 1, Math.round(pos.y) + 1)) right++;
    if ((left > 0) !== (right < grid.width - 1)) return left > 0 ? -1 : 1;
    return previous ? -previous : 1;
  }

  private spawn(kind: Hazard['kind'], pos: Vec2, breed?: number): void {
    this.hazards.push({ pos: { ...pos }, kind, breed, sprite: kind === 'can' ? 'Can' : kind === 'flame' ? 'Flame' : undefined,
      direction: kind === 'can' ? this.rollDirection(pos, 0) : pos.x < this.game.grid.width / 2 ? 1 : -1,
      age: 0, falling: false, descending: false, velocity: 0, lastColumn: Math.round(pos.x) });
  }

  private takeItem(item: SiteThing): void {
    this.game.collectSiteItem(item.item!, item.pos);
    this.items.splice(this.items.indexOf(item), 1);
  }

  trowelHit(pos: Vec2): boolean {
    const item = this.items.find(thing => dist(thing.pos, pos) < 0.6);
    if (item) { this.takeItem(item); return true; }
    const hazard = this.hazards.find(thing => dist(thing.pos, pos) < 0.6);
    if (hazard) {
      if (hazard.kind !== 'flame') this.remove(hazard, 300);
      return true;
    }
    return dist(pos, this.thrower) < 0.9;
  }

  private remove(hazard: Hazard, points = 0): void {
    const index = this.hazards.indexOf(hazard);
    if (index < 0) return;
    this.hazards.splice(index, 1);
    if (points) {
      this.game.addScore(points, hazard.pos);
      this.game.events.push({ type: 'trowelKill', at: { ...hazard.pos } });
    }
  }

  update(dt: number): void {
    if (!this.game.isPlaying()) return;
    this.checkPlayer();
    if (!this.game.isPlaying()) return;
    if (this.wait > 0) { this.wait -= dt; return; }
    this.clock += dt;
    while (this.clock >= 2) { this.clock -= 2; this.bonus = Math.max(0, this.bonus - 100); }
    this.canTimer -= dt;
    if (this.canTimer <= 0) {
      this.spawn('can', { x: this.thrower.x + 1, y: this.thrower.y });
      this.canTimer = (3 + random() * 2) / this.game.difficulty();
    }
    this.creatureTimer -= dt;
    if (this.creatureTimer <= 0) {
      this.spawnCreatures();
      this.creatureTimer = (9 + random() * 6) / this.game.difficulty();
    }
    for (const hazard of [...this.hazards]) {
      hazard.age += dt;
      if (hazard.kind === 'can') this.roll(hazard, dt);
      else if (hazard.kind === 'flame' || hazard.age > 0.8) this.walk(hazard, dt);
    }
  }

  private roll(hazard: Hazard, dt: number): void {
    const grid = this.game.grid;
    if (hazard.falling) {
      const before = hazard.pos.y;
      hazard.velocity += 30 * dt;
      hazard.pos.y += hazard.velocity * dt;
      for (let row = Math.floor(before) + 1; row <= Math.floor(hazard.pos.y); row++) {
        const supported = hazard.descending ? solid(grid, Math.round(hazard.pos.x), row + 1) : floor(grid, Math.round(hazard.pos.x), row + 1);
        if (!supported) continue;
        hazard.pos.y = row;
        hazard.velocity = 0;
        hazard.falling = false;
        hazard.descending = false;
        hazard.direction = this.rollDirection(hazard.pos, hazard.direction);
        hazard.lastColumn = Math.round(hazard.pos.x);
        break;
      }
      if (hazard.pos.y > grid.height) this.remove(hazard);
    } else {
      const speed = 3 * this.game.difficulty();
      hazard.pos.x += hazard.direction * speed * dt;
      hazard.angle = (hazard.angle ?? 0) - hazard.direction * speed * dt * Math.PI * 2 / 0.9;
      if (dist(hazard.pos, this.drum) < 0.5) {
        this.remove(hazard);
        if (random() < 0.25 && this.hazards.filter(thing => thing.kind === 'flame').length < 3) {
          this.spawn('flame', { x: this.drum.x + 1, y: this.drum.y });
        }
        return;
      }
      const column = hazard.direction > 0 ? Math.floor(hazard.pos.x) : Math.ceil(hazard.pos.x);
      if (column !== hazard.lastColumn) {
        hazard.lastColumn = column;
        const row = Math.round(hazard.pos.y) + 1;
        hazard.descending = grid.isLadder(column, row) && random() < 0.25;
        if (!floor(grid, column, row) || hazard.descending) {
          hazard.pos.x = column;
          hazard.falling = true;
        }
      }
      if (hazard.pos.x < 0 || hazard.pos.x > grid.width - 1) {
        hazard.pos.x = Math.max(0, Math.min(grid.width - 1, hazard.pos.x));
        hazard.direction *= -1;
      }
    }
  }

  private walk(hazard: Hazard, dt: number): void {
    const grid = this.game.grid;
    const speed = (hazard.kind === 'flame' ? 1.5 : 1.3) * this.game.difficulty();
    if (hazard.climbTarget !== undefined) {
      const difference = hazard.climbTarget - hazard.pos.y;
      const climbSpeed = hazard.kind === 'flame' ? 1.2 * this.game.difficulty() : speed;
      hazard.pos.y += Math.sign(difference) * Math.min(Math.abs(difference), climbSpeed * dt);
      if (hazard.pos.y === hazard.climbTarget) hazard.climbTarget = undefined;
      return;
    }
    const row = Math.round(hazard.pos.y);
    const ahead = hazard.lastColumn + hazard.direction;
    if (ahead < 0 || ahead >= grid.width || !floor(grid, ahead, row + 1)) hazard.direction *= -1;
    hazard.pos.x += hazard.direction * speed * dt;
    const column = hazard.direction > 0 ? Math.floor(hazard.pos.x) : Math.ceil(hazard.pos.x);
    if (column === hazard.lastColumn) return;
    hazard.lastColumn = column;
    const up = ladderSpan(grid, column, row - 1);
    const down = ladderSpan(grid, column, row + 1);
    if (up && up.bottom === row && up.top > this.thrower.y && random() < 0.3) hazard.climbTarget = up.top;
    else if (down && down.top === row && random() < 0.3) hazard.climbTarget = down.bottom;
    else if (random() < 0.08) hazard.direction *= -1;
    if (hazard.climbTarget !== undefined) hazard.pos.x = column;
  }

  private spawnCreatures(): void {
    const grid = this.game.grid;
    const walking = (row: number) => Array.from({ length: grid.width }, (_, column) => column)
      .filter(column => !solid(grid, column, row) && solid(grid, column, row + 1));
    let row = Math.floor(this.game.player.pos.y + 0.05);
    while (row < grid.height - 1 && !walking(row).length) row++;
    let above = row - 1;
    while (above > this.thrower.y && !walking(above).length) above--;
    for (const target of [row, above]) {
      if (target <= this.thrower.y || this.hazards.filter(thing => thing.kind === 'creature').length >= 4) continue;
      const spots = walking(target).map(column => ({ x: column, y: target }))
        .filter(pos => dist(pos, this.game.player.pos) >= 4 && dist(pos, this.drum) > 1 && !grid.isLadder(pos.x, pos.y));
      if (!spots.length) continue;
      let breed = randInt(Breeds.length);
      if (breed === UFO_BREED) breed = (breed + 1) % Breeds.length;
      this.spawn('creature', spots[randInt(spots.length)], breed);
    }
  }

  private checkPlayer(): void {
    const player = this.game.player;
    if (!player.alive) return;
    if (dist(player.pos, this.captive) < 0.8) { this.game.completeSite(this.bonus); return; }
    for (const mallet of [...this.mallets]) {
      if (dist(player.pos, mallet.pos) >= 0.6) continue;
      player.platform.mallet = Platform.malletTime;
      this.mallets.splice(this.mallets.indexOf(mallet), 1);
    }
    for (const item of [...this.items]) if (dist(player.pos, item.pos) < 0.6) this.takeItem(item);
    if (dist(player.pos, this.thrower) < 0.9) { player.kill(); return; }
    if (player.platform.grounded || player.platform.climbing) this.jumped.clear();
    const reach = { x: player.pos.x + player.facing.x * 0.7, y: player.pos.y };
    for (const hazard of [...this.hazards]) {
      if (hazard.kind === 'creature' && hazard.age < 0.5) continue;
      const touches = dist(player.pos, hazard.pos) < 0.6;
      if (player.platform.mallet > 0 && (touches || dist(reach, hazard.pos) < 0.6)) this.remove(hazard, 500);
      else if (touches) { player.kill(); return; }
      else if (!player.platform.grounded && !player.platform.climbing && hazard.kind !== 'flame' && !this.jumped.has(hazard) &&
          Math.abs(player.pos.x - hazard.pos.x) < 0.5 && hazard.pos.y - player.pos.y > 0.3 && hazard.pos.y - player.pos.y < 1.6) {
        this.jumped.add(hazard);
        this.game.addScore(100, player.pos);
      }
    }
  }
}