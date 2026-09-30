import { Breeds, BonusItems, UFO_BREED } from '../data/sprites';
import type { Game } from './game';
import { dist, random, type Vec2 } from './math';
import { solid } from './platform';
import type { SiteThing } from './scaffold';
import type { Player } from './player';

interface ClimbCreature extends SiteThing {
  kind: 'lobster' | 'dragon';
  direction: number;
  age: number;
  lastColumn: number;
  baseY: number;
  patch: Vec2 | null;
  patchTimer: number;
}

const key = (cell: Vec2) => `${cell.x},${cell.y}`;

export class SummitSite {
  items: SiteThing[];
  creatures: ClimbCreature[] = [];
  ufo: SiteThing | null;
  bonus = 5000;
  viewTop: number;
  readonly broken = new Map<string, Vec2>();
  private readonly summit: number;
  private ufoDirection = 1;
  private ufoClock = 0;
  private wait = 2;
  private clock = 0;
  private lobsterTimer = 0;
  private dragonTimer = 0;

  constructor(private readonly game: Game) {
    this.summit = this.walkingRow(0);
    this.viewTop = Math.max(0, game.grid.height - 18);
    this.ufo = { pos: { x: (game.grid.width - 1) / 2, y: this.summit - 2.1 }, breed: UFO_BREED };
    this.items = (game.grid.markers.get('U') ?? []).map((pos, index) => ({ pos, item: (game.round - 1 + index * 3) % BonusItems.length }));
    this.reset();
  }

  get things(): SiteThing[] { return [...this.items, ...this.creatures, ...(this.ufo ? [this.ufo] : [])]; }

  reset(): void {
    this.creatures = [];
    this.bonus = 5000;
    this.clock = 0;
    this.wait = 2;
    this.lobsterTimer = this.interval(5, 9) * 0.5;
    this.dragonTimer = this.interval(12, 20);
  }

  respawn(near: number, buddy: Player | null = null): Vec2 {
    const grid = this.game.grid;
    if (buddy?.alive && buddy.platform.grounded) {
      const row = Math.round(buddy.pos.y);
      const columns = this.spots(row).sort((left, right) => Math.abs(left - near) - Math.abs(right - near));
      if (columns.length) return { x: columns[0], y: row };
    }
    let fallback: Vec2 | null = null;
    for (let row = Math.min(grid.height - 2, Math.floor(this.viewTop) + 16); row >= Math.floor(this.viewTop); row--) {
      const columns = this.spots(row).sort((left, right) => Math.abs(left - near) - Math.abs(right - near));
      if (!columns.length) continue;
      if (fallback) return { x: columns[0], y: row };
      fallback = { x: columns[0], y: row };
    }
    return fallback ?? { ...grid.playerStart };
  }

  onBrickBroken(cell: Vec2): void {
    this.game.addScore(10, cell);
    this.broken.set(key(cell), { ...cell });
    for (const creature of [...this.creatures]) {
      if (creature.kind === 'lobster' && Math.round(creature.pos.y) + 1 === cell.y && Math.abs(creature.pos.x - cell.x) < 0.7) {
        this.remove(creature, 500);
      }
    }
  }

  private interval(minimum: number, maximum: number): number { return (minimum + random() * (maximum - minimum)) / this.game.difficulty(); }

  private spots(row: number): number[] {
    const grid = this.game.grid;
    return Array.from({ length: grid.width }, (_, column) => column)
      .filter(column => !solid(grid, column, row) && solid(grid, column, row + 1));
  }

  private walkingRow(start: number): number {
    let row = start;
    while (row < this.game.grid.height - 1 && !this.spots(row).length) row++;
    return row;
  }

  private remove(creature: ClimbCreature, points: number): void {
    this.creatures.splice(this.creatures.indexOf(creature), 1);
    if (points) {
      this.game.addScore(points, creature.pos);
      this.game.events.push({ type: 'trowelKill', at: { ...creature.pos } });
    }
  }

  private takeItem(item: SiteThing): void {
    this.game.collectSiteItem(item.item!, item.pos);
    this.items.splice(this.items.indexOf(item), 1);
  }

  trowelHit(pos: Vec2): boolean {
    const creature = this.creatures.find(thing => dist(thing.pos, pos) < (thing.kind === 'dragon' ? 0.7 : 0.6));
    if (creature) { this.remove(creature, creature.kind === 'dragon' ? 800 : 300); return true; }
    const item = this.items.find(thing => dist(thing.pos, pos) < 0.6);
    if (item) { this.takeItem(item); return true; }
    return false;
  }

  update(dt: number): void {
    if (!this.game.isPlaying()) return;
    const climbers = this.game.climbers;
    const lead = Math.min(...climbers.map(player => player.pos.y));
    const target = Math.max(0, Math.min(this.game.grid.height - 18, lead - 12));
    if (target < this.viewTop) this.viewTop = Math.max(target, this.viewTop - 6 * dt);
    if (this.ufo) {
      this.ufoClock += dt;
      this.ufo.pos.x += this.ufoDirection * 2 * dt;
      if (this.ufo.pos.x < 1 || this.ufo.pos.x > this.game.grid.width - 2) {
        this.ufo.pos.x = Math.max(1, Math.min(this.game.grid.width - 2, this.ufo.pos.x));
        this.ufoDirection *= -1;
      }
      this.ufo.pos.y = this.summit - 2.1 + Math.sin(this.ufoClock * 2) * 0.35;
    }
    for (const player of climbers) {
      for (const item of [...this.items]) if (dist(player.pos, item.pos) < 0.6) this.takeItem(item);
      if (this.ufo && dist(player.pos, this.ufo.pos) < 0.9) {
        this.game.addScore(3000, this.ufo.pos);
        this.ufo = null;
        this.game.completeSite(this.bonus);
        return;
      }
      if (player.pos.y > this.viewTop + 17.5 || this.creatures.some(creature =>
        (creature.kind === 'dragon' || creature.age >= 0.5) && dist(player.pos, creature.pos) < (creature.kind === 'dragon' ? 0.7 : 0.6))) player.kill();
    }
    if (!this.game.isPlaying()) return;
    if (this.wait > 0) { this.wait -= dt; return; }
    this.clock += dt;
    while (this.clock >= 2) { this.clock -= 2; this.bonus = Math.max(0, this.bonus - 100); }
    this.lobsterTimer -= dt;
    if (this.lobsterTimer <= 0) { this.spawnLobster(lead); this.lobsterTimer = this.interval(5, 9); }
    this.dragonTimer -= dt;
    if (this.dragonTimer <= 0) { this.spawnDragon(); this.dragonTimer = this.interval(12, 20); }
    for (const creature of [...this.creatures]) {
      creature.age += dt;
      if (creature.kind === 'dragon') {
        creature.pos.x += creature.direction * 2.6 * this.game.difficulty() * dt;
        creature.pos.y = creature.baseY + Math.sin(creature.age * 2.2) * 1.3;
        if (creature.pos.x < -2 || creature.pos.x > this.game.grid.width + 1) this.remove(creature, 0);
      } else if (creature.age > 0.8) this.walkLobster(creature, dt);
    }
  }

  private spawnLobster(lead: number): void {
    if (this.creatures.filter(creature => creature.kind === 'lobster').length >= 3) return;
    let row = this.walkingRow(Math.floor(lead + 0.05));
    if (random() < 0.5) {
      let above = row - 1;
      while (above > this.summit && !this.spots(above).length) above--;
      if (above > this.summit) row = above;
    }
    if (row <= this.summit) return;
    const spots = this.spots(row);
    const ends = [spots[0], spots[spots.length - 1]];
    if (random() < 0.5) ends.reverse();
    for (const column of ends) {
      if (column === undefined) continue;
      const pos = { x: column, y: row };
      if (this.game.climbers.some(player => dist(player.pos, pos) < 4)) continue;
      this.creatures.push({ pos, kind: 'lobster', breed: Breeds.findIndex(breed => breed.name === 'Lobster'),
        direction: column === spots[0] ? 1 : -1, age: 0, lastColumn: column, baseY: row, patch: null, patchTimer: 0 });
      return;
    }
  }

  private spawnDragon(): void {
    const direction = random() < 0.5 ? 1 : -1;
    const row = this.viewTop + 3 + random() * 10;
    this.creatures.push({ pos: { x: direction > 0 ? -1.5 : this.game.grid.width + 0.5, y: row },
      kind: 'dragon', breed: Breeds.findIndex(breed => breed.name === 'Dragon'), direction, age: 0,
      lastColumn: 0, baseY: row, patch: null, patchTimer: 0 });
  }

  private walkLobster(creature: ClimbCreature, dt: number): void {
    const grid = this.game.grid;
    if (creature.patch && creature.patchTimer > 0) {
      creature.patchTimer -= dt;
      if (creature.patchTimer <= 0) {
        if (this.game.climbers.some(player => dist(player.pos, creature.patch!) <= 0.9)) creature.patchTimer = 0.1;
        else {
          if (grid.layBrick(creature.patch.x, creature.patch.y)) {
            this.broken.delete(key(creature.patch));
            this.game.events.push({ type: 'brickLaid', at: { ...creature.patch } });
          }
          creature.patch = null;
        }
      }
      return;
    }
    const ahead = { x: creature.lastColumn + creature.direction, y: Math.round(creature.pos.y) + 1 };
    if (this.broken.has(key(ahead)) && !solid(grid, ahead.x, ahead.y)) {
      creature.pos.x = creature.lastColumn;
      creature.patch = ahead;
      creature.patchTimer = 0.7;
      return;
    }
    if (!solid(grid, ahead.x, ahead.y) || solid(grid, ahead.x, ahead.y - 1)) creature.direction *= -1;
    creature.pos.x += creature.direction * 1.4 * this.game.difficulty() * dt;
    creature.lastColumn = creature.direction > 0 ? Math.floor(creature.pos.x) : Math.ceil(creature.pos.x);
  }
}