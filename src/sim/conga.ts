import type { Enemy } from './enemy';
import type { Vec2 } from './math';
import type { World } from './world';

interface Chain {
  segments: Enemy[];
  cells: Vec2[];
  previous: Vec2[];
  progress: number;
  march: number;
  vertical: number;
}

const sameCell = (left: Vec2, right: Vec2) => left.x === right.x && left.y === right.y;
const cellKey = (cell: Vec2) => `${cell.x},${cell.y}`;
const active = (enemy: Enemy) => enemy.state !== 'dead' && enemy.state !== 'crushed';

export class CongaLine {
  private chains: Chain[] = [];
  private wait = 2;

  constructor(private readonly world: World, private readonly entry: Vec2, segments: Enemy[]) {
    this.build(segments);
  }

  regroup(): void {
    this.build(this.chains.flatMap(chain => chain.segments).filter(active));
  }

  private build(segments: Enemy[]): void {
    this.wait = 2;
    this.chains = segments.length ? [{
      segments, cells: segments.map(() => ({ ...this.entry })),
      previous: segments.map(() => ({ ...this.entry })), progress: 1,
      march: this.entry.x < this.world.grid.width / 2 ? 1 : -1, vertical: 1,
    }] : [];
    for (const chain of this.chains) {
      chain.segments.forEach((enemy, index) => { enemy.head = index === 0; });
      this.place(chain);
    }
  }

  splitLosses(): void {
    for (let index = 0; index < this.chains.length; index++) {
      const chain = this.chains[index];
      const lost = chain.segments.findIndex(enemy => !active(enemy));
      if (lost < 0) continue;
      const where = chain.cells[lost];
      if (chain.segments[lost].state !== 'crushed') {
        const occupied = this.world.player.occupiedCells().some(cell => sameCell(cell, where)) ||
          this.world.rocks.some(rock => rock.occupies(where)) ||
          this.chains.some(other => other.segments.some((enemy, segment) => active(enemy) && sameCell(other.cells[segment], where)));
        if (!occupied && this.world.grid.layBrick(where.x, where.y)) {
          this.world.events.push({ type: 'brickLaid', at: { ...where } });
        }
        if (lost === 0) this.world.addScore(200, where);
      }
      const tail: Chain = {
        ...chain, segments: chain.segments.slice(lost + 1), cells: chain.cells.slice(lost + 1),
        previous: chain.previous.slice(lost + 1),
      };
      chain.segments = chain.segments.slice(0, lost);
      chain.cells = chain.cells.slice(0, lost);
      chain.previous = chain.previous.slice(0, lost);
      if (tail.segments.length) {
        tail.segments[0].head = true;
        this.chains.push(tail);
      }
      index--;
    }
    this.chains = this.chains.filter(chain => chain.segments.length);
  }

  update(dt: number): void {
    if (!this.world.isPlaying()) return;
    this.splitLosses();
    if (this.wait > 0) { this.wait -= dt; return; }
    const occupied = new Set(this.chains.flatMap(chain => chain.cells.map(cellKey)));
    for (const chain of this.chains) {
      if (chain.segments.some(enemy => enemy.state === 'encased')) continue;
      chain.progress += 3 * this.world.difficulty() * dt;
      while (chain.progress >= 1) {
        let next = this.choose(chain, occupied);
        if (!next && chain.segments.length > 1) {
          chain.segments.reverse();
          chain.cells.reverse();
          chain.previous = chain.cells.map(cell => ({ ...cell }));
          chain.segments.forEach((enemy, index) => { enemy.head = index === 0; });
          const away = chain.cells[0].x - chain.cells[1].x;
          if (away) chain.march = Math.sign(away);
          next = this.choose(chain, occupied);
        }
        if (!next) { chain.progress = 1; break; }
        chain.progress--;
        chain.previous = chain.cells;
        chain.cells = [next, ...chain.previous.slice(0, -1)];
        occupied.add(cellKey(next));
      }
      this.place(chain);
    }
  }

  private choose(chain: Chain, occupied: Set<string>): Vec2 | null {
    const current = chain.cells[0];
    const clear = (cell: Vec2) => this.world.grid.isPassable(cell.x, cell.y) && !occupied.has(cellKey(cell));
    const zoneTop = this.world.grid.height - 5;
    if (chain.vertical < 0 && current.y <= zoneTop) chain.vertical = 1;
    const side = { x: current.x + chain.march, y: current.y };
    if (clear(side)) return side;
    for (let attempt = 0; attempt < 2; attempt++) {
      const vertical = { x: current.x, y: current.y + chain.vertical };
      if (clear(vertical)) { chain.march *= -1; return vertical; }
      chain.vertical *= -1;
      if (chain.vertical < 0 && current.y <= zoneTop) { chain.vertical = 1; break; }
    }
    chain.march *= -1;
    const back = { x: current.x + chain.march, y: current.y };
    if (clear(back)) return back;
    return [{ x: current.x, y: current.y - 1 }, { x: current.x, y: current.y + 1 }].find(clear) ?? null;
  }

  private place(chain: Chain): void {
    chain.segments.forEach((enemy, index) => {
      if (!active(enemy)) return;
      enemy.hidden = index > 0 && sameCell(chain.cells[index], chain.cells[index - 1]) &&
        sameCell(chain.previous[index], chain.previous[index - 1]);
      const before = chain.previous[index];
      const after = chain.cells[index];
      enemy.setGridPos({ x: before.x + (after.x - before.x) * chain.progress, y: before.y + (after.y - before.y) * chain.progress });
    });
  }
}