import { Cell, type Grid } from './grid';
import type { Player } from './player';
import type { Input, World } from './world';

export const Platform = {
  walkSpeed: 3, gravity: 30, climbSpeed: 2.5, jumpApex: 1.15, summitApex: 3.3,
  airControl: 0.8, safeFall: 1.5, malletTime: 7.5,
} as const;

export function solid(grid: Grid, column: number, row: number): boolean {
  if (!grid.inBounds(column, row)) return row >= grid.height;
  const cell = grid.get(column, row);
  return cell === Cell.Brick || cell === Cell.Bedrock || cell === Cell.Rock;
}

export function floor(grid: Grid, column: number, row: number): boolean {
  return solid(grid, column, row) || (grid.isLadder(column, row) && !grid.isLadder(column, row - 1));
}

export function ladderSpan(grid: Grid, column: number, row: number): { top: number; bottom: number } | null {
  if (!grid.isLadder(column, row)) return null;
  let top = row;
  let bottom = row;
  while (grid.isLadder(column, top - 1)) top--;
  while (grid.isLadder(column, bottom + 1)) bottom++;
  return { top: top - 1, bottom: bottom + 1 };
}

export class PlatformMotion {
  grounded = true;
  climbing: { top: number; bottom: number } | null = null;
  velocity = { x: 0, y: 0 };
  highest = 0;
  mallet = 0;

  constructor(private readonly world: World, private readonly player: Player) {}

  reset(): void {
    this.grounded = true;
    this.climbing = null;
    this.velocity = { x: 0, y: 0 };
    this.highest = this.player.pos.y;
    this.mallet = 0;
  }

  private supported(column: number, row: number): boolean {
    const grid = this.world.grid;
    return floor(grid, Math.round(column), row + 1) || (this.world.isSummitLevel &&
      (floor(grid, Math.floor(column + 0.25), row + 1) || floor(grid, Math.ceil(column - 0.25), row + 1)));
  }

  update(dt: number, input: Input): void {
    const { grid } = this.world;
    const player = this.player;
    const position = player.pos;
    const summit = this.world.isSummitLevel;
    const before = { ...position };
    this.mallet = Math.max(0, this.mallet - dt);
    if (this.climbing) {
      position.y = Math.max(this.climbing.top, Math.min(this.climbing.bottom, position.y + input.moveY * Platform.climbSpeed * dt));
      if ((input.moveY < 0 && position.y === this.climbing.top) || (input.moveY > 0 && position.y === this.climbing.bottom)) {
        this.climbing = null;
        this.grounded = true;
      }
      this.highest = position.y;
      player.moving = position.y !== before.y;
      return;
    }
    if (this.grounded) {
      position.y = Math.round(position.y);
      const column = Math.round(position.x);
      const span = input.moveY && !this.mallet && Math.abs(position.x - column) < 0.35
        ? ladderSpan(grid, column, position.y + Math.sign(input.moveY)) : null;
      if (span && ((input.moveY < 0 && span.bottom === position.y) || (input.moveY > 0 && span.top === position.y))) {
        this.climbing = span;
        this.grounded = false;
        position.x = column;
        return;
      }
      if (input.firePressed) {
        this.velocity = { x: input.moveX * Platform.walkSpeed, y: -Math.sqrt(2 * Platform.gravity * (summit ? Platform.summitApex : Platform.jumpApex)) };
        this.grounded = false;
        this.highest = position.y;
      } else {
        position.x = Math.max(0, Math.min(grid.width - 1, position.x + input.moveX * Platform.walkSpeed * dt));
        if (input.moveX) player.facing = { x: input.moveX, y: 0 };
        if (!this.supported(position.x, position.y)) {
          this.velocity = { x: 0, y: 0 };
          this.grounded = false;
          this.highest = position.y;
        }
        player.moving = position.x !== before.x;
        return;
      }
    }
    this.velocity.y += Platform.gravity * dt;
    if (summit && input.moveX) this.velocity.x = input.moveX * Platform.walkSpeed * Platform.airControl;
    position.x = Math.max(0, Math.min(grid.width - 1, position.x + this.velocity.x * dt));
    position.y += this.velocity.y * dt;
    if (summit && this.velocity.y < 0) {
      const head = { x: Math.round(position.x), y: Math.floor(position.y - 0.45) };
      if (solid(grid, head.x, head.y)) {
        if (grid.removeBrick(head.x, head.y)) this.world.onBrickBroken(head);
        position.y = head.y + 1.45;
        this.velocity.y = 0;
      }
    }
    if (this.velocity.x) player.facing = { x: Math.sign(this.velocity.x), y: 0 };
    this.highest = Math.min(this.highest, position.y);
    if (this.velocity.y > 0) {
      for (let row = Math.floor(before.y) + 1; row <= Math.floor(position.y); row++) {
        if (!this.supported(position.x, row)) continue;
        position.y = row;
        this.velocity = { x: 0, y: 0 };
        this.grounded = true;
        if (!summit && row - this.highest > Platform.safeFall) player.kill();
        break;
      }
      if (position.y > grid.height) player.kill();
    }
    player.moving = position.x !== before.x || position.y !== before.y;
  }
}