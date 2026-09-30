import { Rock, rockKillPoints } from './config';
import type { Enemy } from './enemy';
import { Cell } from './grid';
import type { Vec2 } from './math';
import type { World } from './world';

export type RockState = 'idle' | 'wobble' | 'falling' | 'breaking' | 'gone';

/**
 * A soda can wedged in the dirt (port of AFallingRock). Once the cell below is dug out and the player has stepped
 * away it wobbles, then drops, crushing everything beneath until it hits solid ground.
 */
export class FallingRock {
  state: RockState = 'idle';
  row: number;
  timer = 0;
  private crushed: Enemy[] = [];

  constructor(
    private readonly world: World,
    readonly cell: Vec2,
  ) {
    this.row = cell.y;
  }

  occupies(q: Vec2): boolean {
    return q.x === this.cell.x && q.y >= Math.floor(this.row) && q.y <= Math.ceil(this.row);
  }

  get pos(): Vec2 {
    return { x: this.cell.x, y: this.row };
  }

  update(dt: number): void {
    const { grid, player } = this.world;
    this.timer += dt;
    switch (this.state) {
      case 'idle':
        if (this.world.isPlaying() && grid.get(this.cell.x, this.cell.y + 1) === Cell.Tunnel) {
          // Wait for the player to step out from directly underneath, like the arcade original.
          const below = player.alive && player.occupiedCells().some((c) => c.x === this.cell.x && c.y === this.cell.y + 1);
          if (!below) {
            this.state = 'wobble';
            this.timer = 0;
            this.world.events.push({ type: 'rockWobble', at: this.pos });
          }
        }
        break;
      case 'wobble':
        if (this.timer >= Rock.wobbleTime) this.startFalling();
        break;
      case 'falling': {
        this.row += Math.min(Rock.fallSpeed * dt, 0.5);
        this.crushBeneath();
        const base = Math.floor(this.row);
        if (grid.get(this.cell.x, base + 1) !== Cell.Tunnel) {
          this.row = base;
          this.crushBeneath();
          this.land();
        }
        for (const e of this.crushed) e.setGridPos({ x: this.cell.x, y: this.row + 0.55 });
        break;
      }
      case 'breaking':
        if (this.timer >= Rock.breakTime) this.state = 'gone';
        break;
      default:
        break;
    }
  }

  private startFalling(): void {
    this.world.grid.set(this.cell.x, this.cell.y, Cell.Tunnel);
    this.state = 'falling';
    this.timer = 0;
    this.world.events.push({ type: 'rockFall', at: this.pos });
    this.world.onRockDropped();
  }

  private crushBeneath(): void {
    const beneath = (p: Vec2) =>
      Math.abs(p.x - this.cell.x) < Rock.crushWidth && p.y - this.row >= -0.1 && p.y - this.row < Rock.crushDepth;
    for (const e of this.world.enemies) {
      if (!e.hidden && e.state !== 'crushed' && e.state !== 'ghost' && e.state !== 'dead' && beneath(e.pos)) {
        e.crush();
        this.crushed.push(e);
      }
    }
    const { player } = this.world;
    if (player.alive && beneath(player.pos)) player.kill();
    const jr = this.world.donJr();
    if (jr && beneath(jr.pos)) jr.kill();
  }

  private land(): void {
    this.state = 'breaking';
    this.timer = 0;
    const victims = this.crushed.filter((e) => e.state !== 'dead');
    this.crushed = [];
    this.world.events.push({ type: 'rockLand', at: this.pos, crushed: victims.length });
    this.world.addScore(rockKillPoints(victims.length), this.pos);
    for (const e of victims) e.kill();
  }
}
