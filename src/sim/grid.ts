import type { Vec2 } from './math';

export const Cell = { Dirt: 0, Tunnel: 1, Rock: 2, Bedrock: 3, Brick: 4 } as const;
export type Cell = (typeof Cell)[keyof typeof Cell];

const DIRS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export type CellListener = (x: number, y: number, type: Cell) => void;

/**
 * The dig grid: single source of truth for terrain. x = column, y = row, row 0 is the surface.
 * Port of ADigGrid (layout parsing, passability, digging, bricks, BFS).
 */
export class Grid {
  width = 0;
  height = 0;
  cells: Cell[] = [];
  dirtRemaining = 0;
  playerStart: Vec2 = { x: 0, y: 0 };
  enemySpawns: Vec2[] = [];
  invaderSpawns: Vec2[] = [];
  congaSpawns: Vec2[] = [];
  rockCells: Vec2[] = [];
  listeners: CellListener[] = [];
  markers = new Map<string, Vec2[]>();
  private ladders = new Set<string>();

  static fromText(text: string): Grid {
    const grid = new Grid();
    grid.load(text.split(/\r?\n/));
    return grid;
  }

  load(input: string[]): void {
    const lines = input.map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith(';'));
    if (lines.length === 0) throw new Error('empty level');
    this.height = lines.length;
    this.width = Math.max(...lines.map((l) => l.length));
    this.cells = new Array<Cell>(this.width * this.height).fill(Cell.Dirt);
    this.enemySpawns = [];
    this.invaderSpawns = [];
    this.congaSpawns = [];
    this.rockCells = [];
    this.markers.clear();
    this.ladders.clear();
    this.playerStart = { x: Math.floor(this.width / 2), y: 0 };

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = x < lines[y].length ? lines[y][x] : '#';
        let type: Cell = Cell.Dirt;
        switch (c) {
          case '.': type = Cell.Tunnel; break;
          case 'X': type = Cell.Bedrock; break;
          case 'B': type = Cell.Brick; break;
          case 'R': type = Cell.Rock; this.rockCells.push({ x, y }); break;
          case 'P': type = Cell.Tunnel; this.playerStart = { x, y }; break;
          case 'E': type = Cell.Tunnel; this.enemySpawns.push({ x, y }); break;
          case 'I': type = Cell.Tunnel; this.invaderSpawns.push({ x, y }); break;
          case 'C': type = Cell.Tunnel; this.congaSpawns.push({ x, y }); break;
          case '#': break;
          default:
            type = Cell.Tunnel;
            if (c === 'H') this.ladders.add(`${x},${y}`);
            else this.markers.set(c, [...(this.markers.get(c) ?? []), { x, y }]);
            break;
        }
        this.cells[this.index(x, y)] = type;
      }
    }
    this.dirtRemaining = this.cells.filter((c) => c === Cell.Dirt).length;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  isLadder(x: number, y: number): boolean {
    return this.ladders.has(`${x},${y}`);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Cell {
    return this.inBounds(x, y) ? this.cells[this.index(x, y)] : Cell.Bedrock;
  }

  set(x: number, y: number, type: Cell): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    const old = this.cells[i];
    if (old === type) return;
    if (old === Cell.Dirt) this.dirtRemaining--;
    if (type === Cell.Dirt) this.dirtRemaining++;
    this.cells[i] = type;
    for (const l of this.listeners) l(x, y, type);
  }

  /** Phasing actors pass through dirt but never rock, bedrock or brick. */
  isPassable(x: number, y: number, canPhase = false): boolean {
    const c = this.get(x, y);
    return c === Cell.Tunnel || (canPhase && c === Cell.Dirt);
  }

  dig(x: number, y: number): boolean {
    if (this.get(x, y) !== Cell.Dirt) return false;
    this.set(x, y, Cell.Tunnel);
    return true;
  }

  layBrick(x: number, y: number): boolean {
    if (this.get(x, y) !== Cell.Tunnel) return false;
    this.set(x, y, Cell.Brick);
    return true;
  }

  removeBrick(x: number, y: number): boolean {
    if (this.get(x, y) !== Cell.Brick) return false;
    this.set(x, y, Cell.Tunnel);
    return true;
  }

  /** 0..3 band used for strata colour and mortar kill score. */
  depthBand(row: number): number {
    if (this.height <= 2) return 0;
    return Math.min(3, Math.max(0, Math.trunc(((row - 1) * 4) / Math.max(1, this.height - 2))));
  }

  /** BFS through open cells. The path excludes start and includes goal; null when unreachable. */
  findPath(start: Vec2, goal: Vec2): Vec2[] | null {
    if (!this.inBounds(start.x, start.y) || !this.inBounds(goal.x, goal.y) || !this.isPassable(goal.x, goal.y)) {
      return null;
    }
    if (start.x === goal.x && start.y === goal.y) return [];
    const came = new Int32Array(this.width * this.height).fill(-1);
    const queue: number[] = [this.index(start.x, start.y)];
    came[queue[0]] = queue[0];
    const goalIdx = this.index(goal.x, goal.y);
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      if (cur === goalIdx) {
        const path: Vec2[] = [];
        for (let p = goalIdx; p !== queue[0]; p = came[p]) {
          path.push({ x: p % this.width, y: Math.floor(p / this.width) });
        }
        return path.reverse();
      }
      const cx = cur % this.width;
      const cy = Math.floor(cur / this.width);
      for (const d of DIRS) {
        const nx = cx + d.x;
        const ny = cy + d.y;
        if (!this.inBounds(nx, ny)) continue;
        const n = this.index(nx, ny);
        if (came[n] === -1 && this.isPassable(nx, ny)) {
          came[n] = cur;
          queue.push(n);
        }
      }
    }
    return null;
  }
}
