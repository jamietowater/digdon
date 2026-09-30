import { ArrowUp, ChevronsDown, Scan, createElement } from 'lucide';
import { Stage, gridToWorld, ACTOR_Z } from '../render/stage';
import type { Game } from '../sim/game';
import { Cell, type Grid } from '../sim/grid';
import type { Vec2 } from '../sim/math';

export class Overview {
  private readonly button = document.querySelector<HTMLButtonElement>('#overview')!;
  private readonly canvas = document.querySelector<HTMLCanvasElement>('#overview-map')!;
  private readonly context = this.canvas.getContext('2d')!;
  private readonly terrain = document.createElement('canvas');
  private readonly overlay = document.querySelector<HTMLElement>('#threats')!;
  private readonly arrows: HTMLElement[] = [];
  private readonly boundary = document.createElement('div');
  private readonly boundaryLabel = document.createElement('span');
  private pointer: number | null = null;
  private keyboard = false;
  private grid: Grid | null = null;
  private dirty = true;
  private elapsed = 0;
  private readonly invalidate = () => { this.dirty = true; };

  constructor(private readonly stage: Stage) {
    this.button.append(createElement(Scan, { width: 16, height: 16, 'aria-hidden': 'true' }));
    this.button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (this.pointer !== null || this.keyboard) return;
      this.pointer = event.pointerId;
      this.button.setPointerCapture(event.pointerId);
      this.peek(true);
    });
    const release = (event: PointerEvent) => { if (event.pointerId === this.pointer) this.reset(); };
    this.button.addEventListener('pointerup', release);
    this.button.addEventListener('pointercancel', release);
    this.button.addEventListener('lostpointercapture', release);
    this.button.addEventListener('keydown', event => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || this.pointer !== null) return;
      this.keyboard = true;
      this.peek(true);
    });
    this.button.addEventListener('keyup', event => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      this.reset();
    });
    this.button.addEventListener('contextmenu', event => event.preventDefault());
    this.button.addEventListener('blur', () => this.reset());
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    for (let index = 0; index < 5; index++) {
      const marker = document.createElement('span');
      marker.className = 'threat';
      marker.hidden = true;
      marker.append(createElement(ArrowUp, { width: 18, height: 18 }));
      this.arrows.push(marker);
      this.overlay.append(marker);
    }
    this.boundary.className = 'fall-boundary';
    this.boundary.hidden = true;
    this.boundary.append(createElement(ChevronsDown, { width: 14, height: 14 }), this.boundaryLabel);
    this.overlay.append(this.boundary);
  }

  private peek(on: boolean): void {
    this.stage.peeking = on;
    this.button.setAttribute('aria-pressed', String(on));
  }

  reset(): void {
    const pointer = this.pointer;
    this.pointer = null;
    this.keyboard = false;
    this.peek(false);
    if (pointer !== null && this.button.hasPointerCapture(pointer)) this.button.releasePointerCapture(pointer);
  }

  private bind(grid: Grid | null): void {
    if (grid === this.grid) return;
    if (this.grid) {
      const index = this.grid.listeners.indexOf(this.invalidate);
      if (index >= 0) this.grid.listeners.splice(index, 1);
    }
    this.grid = grid;
    grid?.listeners.push(this.invalidate);
    this.invalidate();
    this.reset();
  }

  private cacheTerrain(grid: Grid): void {
    this.terrain.width = grid.width * 3;
    this.terrain.height = grid.height * 3;
    const context = this.terrain.getContext('2d')!;
    const colours = ['#735347', '#102122', '#79888e', '#53636a', '#b87351'];
    for (let row = 0; row < grid.height; row++) {
      for (let column = 0; column < grid.width; column++) {
        context.fillStyle = colours[grid.get(column, row)];
        context.fillRect(column * 3, row * 3, 3, 3);
        if (grid.isLadder(column, row)) {
          context.fillStyle = '#ccbb80';
          context.fillRect(column * 3 + 1, row * 3, 1, 3);
        } else if (grid.get(column, row) === Cell.Brick) {
          context.fillStyle = '#573e38';
          context.fillRect(column * 3, row * 3 + 2, 3, 1);
        }
      }
    }
    this.dirty = false;
  }

  update(game: Game, active: boolean, dt: number): void {
    this.bind(game.hasArena ? game.grid : null);
    this.overlay.hidden = !active;
    if (!active || !this.grid) { this.reset(); return; }
    this.elapsed += dt;
    if (this.elapsed < 1 / 30 && !this.dirty) return;
    this.elapsed = 0;
    const grid = this.grid;
    if (this.dirty) this.cacheTerrain(grid);
    const width = Math.round(this.canvas.clientWidth * 2);
    const height = Math.round(this.canvas.clientHeight * 2);
    if (width !== this.canvas.width || height !== this.canvas.height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const context = this.context;
    context.clearRect(0, 0, width, height);
    const scale = Math.min((width - 8) / grid.width, (height - 8) / grid.height);
    const offsetX = (width - grid.width * scale) / 2;
    const offsetY = (height - grid.height * scale) / 2;
    context.imageSmoothingEnabled = false;
    context.drawImage(this.terrain, offsetX, offsetY, grid.width * scale, grid.height * scale);
    const point = (pos: Vec2) => ({ x: offsetX + (pos.x + 0.5) * scale, y: offsetY + (pos.y + 0.5) * scale });
    const marker = (pos: Vec2, colour: string, shape: 'player' | 'threat' | 'item') => {
      const centre = point(pos);
      context.fillStyle = colour;
      context.strokeStyle = '#071415';
      context.lineWidth = 1.5;
      context.beginPath();
      if (shape === 'player') context.arc(centre.x, centre.y, 3.6, 0, Math.PI * 2);
      else if (shape === 'item') context.rect(centre.x - 2.6, centre.y - 2.6, 5.2, 5.2);
      else {
        context.moveTo(centre.x, centre.y - 3.2);
        context.lineTo(centre.x + 3.2, centre.y + 2.8);
        context.lineTo(centre.x - 3.2, centre.y + 2.8);
        context.closePath();
      }
      context.fill();
      context.stroke();
    };
    const threats: Vec2[] = [
      ...game.rocks.filter(rock => rock.state === 'falling' || rock.state === 'wobble').map(rock => rock.pos),
      ...(game.scaffold?.hazards ?? []).map(hazard => hazard.pos),
      ...(game.summit?.creatures ?? []).map(creature => creature.pos),
      ...game.enemies.filter(enemy => !enemy.hidden && enemy.isHarmful()).map(enemy => enemy.pos),
      ...(game.fleet?.bombs ?? []).filter(bomb => !bomb.done).map(bomb => bomb.pos),
    ];
    for (const threat of threats) marker(threat, '#ff816a', 'threat');
    for (const item of game.scaffold?.items ?? game.summit?.items ?? []) marker(item.pos, '#ffe380', 'item');
    for (const mallet of game.scaffold?.mallets ?? []) marker(mallet.pos, '#ffe380', 'item');
    if (game.bonus) marker(game.bonus.cell, '#ffe380', 'item');
    if (game.scaffold) marker(game.scaffold.captive, '#ffe380', 'item');
    if (game.summit?.ufo) marker(game.summit.ufo.pos, '#ffe380', 'item');
    if (game.fleet?.ufo) marker(game.fleet.ufo.pos, '#ff816a', 'threat');
    for (const player of game.climbers) marker(player.pos, player === game.player ? '#ffffff' : '#79f2e5', 'player');
    const bounds = this.stage.visibleBounds;
    context.save();
    context.beginPath();
    context.rect(offsetX - 2, offsetY - 2, grid.width * scale + 4, grid.height * scale + 4);
    context.clip();
    if (game.summit) {
      context.strokeStyle = '#ff816a';
      context.lineWidth = 2;
      context.setLineDash([3, 3]);
      context.strokeRect(offsetX, point({ x: 0, y: game.summit.viewTop - 0.5 }).y, grid.width * scale, 18 * scale);
      context.setLineDash([]);
    }
    const corner = point({ x: bounds.left, y: bounds.top });
    context.strokeStyle = '#a9e6e4';
    context.lineWidth = 2;
    context.strokeRect(corner.x, corner.y, (bounds.right - bounds.left) * scale, (bounds.bottom - bounds.top) * scale);
    context.restore();
    this.drawThreats(game, threats);
  }

  private drawThreats(game: Game, threats: Vec2[]): void {
    this.arrows.forEach(arrow => { arrow.hidden = true; });
    this.boundary.hidden = true;
    if (!this.stage.focused || !game.player.alive || !game.isPlaying()) return;
    const width = this.stage.canvas.clientWidth;
    const height = this.stage.canvas.clientHeight;
    const bounds = this.stage.visibleBounds;
    const range = width / (bounds.right - bounds.left) * 2;
    const shown: Vec2[] = [];
    for (const threat of threats) {
      const projected = this.stage.project(gridToWorld(threat.x, threat.y, ACTOR_Z));
      if (projected.x >= 0 && projected.x <= width && projected.y >= 0 && projected.y <= height) continue;
      if (projected.x < -range || projected.x > width + range || projected.y < -range || projected.y > height + range) continue;
      const position = { x: Math.max(12, Math.min(width - 12, projected.x)), y: Math.max(12, Math.min(height - 12, projected.y)) };
      if (shown.some(other => Math.hypot(position.x - other.x, position.y - other.y) < 28)) continue;
      const arrow = this.arrows[shown.length];
      arrow.hidden = false;
      arrow.style.left = `${position.x}px`;
      arrow.style.top = `${position.y}px`;
      const angle = Math.atan2(projected.y - position.y, projected.x - position.x) * 180 / Math.PI + 90;
      arrow.style.transform = `rotate(${angle}deg)`;
      shown.push(position);
      if (shown.length === this.arrows.length) break;
    }
    if (game.summit) {
      const below = game.summit.viewTop + 17.5 - bounds.bottom;
      if (below > 0.2) {
        this.boundary.hidden = false;
        this.boundaryLabel.textContent = `FALL LINE: ${below.toFixed(1)} ROWS BELOW`;
      }
    }
  }
}