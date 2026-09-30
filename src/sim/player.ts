import { Pawn, Score } from './config';
import { Cell } from './grid';
import { dist, toCell, type Vec2 } from './math';
import { MortarMixer } from './mortar';
import type { Input, World } from './world';

const KINDA_SMALL = 1e-4;
const LAY_COOLDOWN = 0.15;

/**
 * Don Blox (port of ADigPawn, lane levels). Moves on grid lanes in four directions; a perpendicular input first
 * slides him to the nearest lane (the arcade corner assist). Moving into dirt carves a tunnel at dig speed.
 */
export class Player {
  pos: Vec2 = { x: 0, y: 0 };
  facing: Vec2 = { x: 1, y: 0 };
  alive = true;
  deathTime = 0;
  throwTimer = 0;
  throwKick = 0;
  layTimer = 0;
  /** True on frames where he actually moved; drives the walk cycle. */
  moving = false;
  readonly mortar: MortarMixer;
  private diggingCell: Vec2 | null = null;
  private wasHorizontal = false;
  private wasVertical = false;
  private verticalPressedLast = false;

  constructor(private readonly world: World) {
    this.mortar = new MortarMixer(world, this);
  }

  init(start: Vec2): void {
    this.pos = { ...start };
    this.facing = { x: 1, y: 0 };
    this.diggingCell = null;
    this.alive = true;
    this.deathTime = 0;
    this.throwTimer = 0;
    this.throwKick = 0;
    this.layTimer = 0;
    this.moving = false;
    this.mortar.release();
  }

  cell(): Vec2 {
    return toCell(this.pos);
  }

  /** Cells the body overlaps: one when centred, two while between cells. */
  occupiedCells(): Vec2[] {
    const e = Pawn.laneEpsilon;
    const lo = { x: Math.floor(this.pos.x + e), y: Math.floor(this.pos.y + e) };
    const hi = { x: Math.ceil(this.pos.x - e), y: Math.ceil(this.pos.y - e) };
    return lo.x === hi.x && lo.y === hi.y ? [lo] : [lo, hi];
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.deathTime = 0;
    this.mortar.release();
    this.world.events.push({ type: 'playerDied', at: { ...this.pos } });
    this.world.onPlayerKilled();
  }

  update(dt: number, input: Input): void {
    this.mortar.update(dt);
    this.moving = false;
    if (!this.alive) {
      this.deathTime += dt;
      return;
    }
    if (!this.world.isPlaying()) return;

    const invaders = this.world.isInvaderLevel;
    const desired = this.readMoveInput(input);
    if (invaders) desired.y = 0;
    this.throwKick = Math.max(0, this.throwKick - dt / 0.16);
    if (this.throwTimer > 0) this.throwTimer = Math.max(0, this.throwTimer - dt);
    if (input.throwPressed || (invaders && input.firePressed)) this.throwTrowel();
    this.layTimer = Math.max(0, this.layTimer - dt);
    if (this.world.brickLaying && input.brickHeld) this.layBrick();

    if (!invaders && input.firePressed) {
      this.mortar.fire();
    } else if (desired.x !== 0 || desired.y !== 0) {
      // Walking away stops the spray, as in the arcade original.
      this.mortar.release();
      const before = { ...this.pos };
      this.move(desired, dt, input.turboHeld);
      this.moving = before.x !== this.pos.x || before.y !== this.pos.y;
    }
  }

  private readMoveInput(input: Input): Vec2 {
    const h = input.moveX !== 0;
    const v = input.moveY !== 0;
    if (h && !this.wasHorizontal) this.verticalPressedLast = false;
    if (v && !this.wasVertical) this.verticalPressedLast = true;
    this.wasHorizontal = h;
    this.wasVertical = v;
    if (h && v) return this.verticalPressedLast ? { x: 0, y: input.moveY } : { x: input.moveX, y: 0 };
    return { x: input.moveX, y: input.moveY };
  }

  private throwTrowel(): void {
    if (this.throwTimer > 0) return;
    const invaders = this.world.isInvaderLevel;
    this.throwTimer = invaders ? Pawn.arcadeThrowCooldown : Pawn.throwCooldown;
    this.throwKick = 1;
    // On the invasion level every throw goes straight up, whichever way Don faces.
    const dir = invaders ? { x: 0, y: -1 } : { ...this.facing };
    this.world.spawnTrowel(this.pos, dir);
    this.world.events.push({ type: 'trowelThrow', at: { ...this.pos } });
    this.world.donJr()?.throwWith(dir);
  }

  private layBrick(): void {
    if (this.layTimer > 0) return;
    const { grid } = this.world;
    const invaders = this.world.isInvaderLevel;
    let target: Vec2;
    const here = this.cell();
    if (invaders) {
      // Cover goes in the cell right above Don, between him and the bombs.
      target = { x: here.x, y: here.y - 1 };
    } else {
      // First cell behind Don that he isn't standing in, so walking with the key held leaves a wall.
      target = { x: here.x - this.facing.x, y: here.y - this.facing.y };
      if (this.occupiedCells().some((c) => c.x === target.x && c.y === target.y)) {
        target = { x: target.x - this.facing.x, y: target.y - this.facing.y };
      }
    }
    if (grid.get(target.x, target.y) !== Cell.Tunnel) return;
    if (this.world.enemies.some((e) => dist(e.pos, target) < 1)) return;
    if (this.world.rocks.some((r) => r.occupies(target))) return;
    if (grid.layBrick(target.x, target.y)) {
      this.layTimer = invaders ? Pawn.invaderLayCooldown : LAY_COOLDOWN;
      this.world.events.push({ type: 'brickLaid', at: target });
    }
  }

  private move(desired: Vec2, dt: number, turbo: boolean): void {
    const { grid } = this.world;
    let timeLeft = dt;
    for (let iter = 0; iter < 4 && timeLeft > KINDA_SMALL; iter++) {
      const horizontal = desired.x !== 0;
      const perpKey = horizontal ? 'y' : 'x';
      const alongKey = horizontal ? 'x' : 'y';
      const perp = this.pos[perpKey];

      let axis: 'x' | 'y';
      let target: number;
      let stepDir: Vec2;
      if (Math.abs(perp - Math.round(perp)) > Pawn.laneEpsilon) {
        // Off-lane for the requested direction: keep going the way we were facing until the next lane, then turn.
        const facingOnPerp = horizontal ? this.facing.y : this.facing.x;
        const sign = facingOnPerp !== 0 ? facingOnPerp : Math.round(perp) > perp ? 1 : -1;
        axis = perpKey;
        target = sign > 0 ? Math.ceil(perp) : Math.floor(perp);
        stepDir = horizontal ? { x: 0, y: sign } : { x: sign, y: 0 };
      } else {
        this.pos[perpKey] = Math.round(perp);
        const sign = horizontal ? desired.x : desired.y;
        const along = this.pos[alongKey];
        axis = alongKey;
        target = sign > 0 ? Math.floor(along + Pawn.laneEpsilon) + 1 : Math.ceil(along - Pawn.laneEpsilon) - 1;
        stepDir = { ...desired };
      }

      const targetPos = { ...this.pos, [axis]: target };
      const targetCell = toCell(targetPos);
      const targetType = grid.get(targetCell.x, targetCell.y);
      if (targetType === Cell.Rock || targetType === Cell.Bedrock) {
        this.facing = stepDir;
        break;
      }
      if (targetType === Cell.Dirt || targetType === Cell.Brick) this.diggingCell = targetCell;

      const digging =
        this.diggingCell !== null && this.diggingCell.x === targetCell.x && this.diggingCell.y === targetCell.y;
      let speed = Pawn.moveSpeed;
      if (digging) speed = targetType === Cell.Brick ? Pawn.brickDigSpeed : Pawn.digSpeed;
      speed *= turbo ? Pawn.turboMultiplier : 1;
      const distance = Math.abs(target - this.pos[axis]);
      const step = speed * timeLeft;
      this.facing = stepDir;

      if (step >= distance) {
        this.pos[axis] = target;
        timeLeft -= distance / speed;
        if (digging) this.diggingCell = null;
      } else {
        this.pos[axis] += Math.sign(target - this.pos[axis]) * step;
        timeLeft = 0;
      }
      this.digOverlappedCells();
    }
  }

  private digOverlappedCells(): void {
    const { grid } = this.world;
    for (const c of this.occupiedCells()) {
      if (dist(this.pos, c) > Pawn.digReach) continue;
      // Chiselling a brick back out pays nothing, so walls cannot be farmed for score.
      if (grid.removeBrick(c.x, c.y)) this.world.events.push({ type: 'brickBroken', at: c });
      if (grid.dig(c.x, c.y)) {
        this.world.addScore(Score.digPoints, c);
        this.world.events.push({ type: 'dig', at: c });
      }
    }
  }
}
