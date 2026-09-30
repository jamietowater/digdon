import arena01 from '../data/levels/arena01.txt?raw';
import arena02 from '../data/levels/arena02.txt?raw';
import arena04 from '../data/levels/arena04.txt?raw';
import { BonusItems } from '../data/sprites';
import { InvaderFleet } from './fleet';
import { DonJr } from './donjr';
import { Enemy } from './enemy';
import { EventQueue } from './events';
import { Grid } from './grid';
import { dist, randInt, type Vec2 } from './math';
import { Player } from './player';
import { FallingRock } from './rock';
import { Rules } from './config';
import { ThrownTrowel } from './trowel';
import type { Input, World } from './world';

export type MatchState = 'menu' | 'playing' | 'dying' | 'levelClear' | 'interlude' | 'gameOver';

export interface LevelDef {
  key: 'dig' | 'bricklayer' | 'invasion';
  title: string;
  layout: string;
  invaders: boolean;
  brickLaying: boolean;
}

export const LEVELS: readonly LevelDef[] = [
  { key: 'dig', title: 'DIG DON', layout: arena01, invaders: false, brickLaying: false },
  { key: 'bricklayer', title: 'BRICKLAYER', layout: arena02, invaders: false, brickLaying: true },
  { key: 'invasion', title: 'INVASION', layout: arena04, invaders: true, brickLaying: true },
];

export interface BonusItem {
  cell: Vec2;
  item: number;
  life: number;
}

/**
 * The game mode (port of ADigGameMode for the Dig and Invasion levels): builds arenas, runs the round state
 * machine, tracks score, lives and difficulty, and owns every actor.
 */
export class Game implements World {
  readonly events = new EventQueue();
  state: MatchState = 'menu';
  paused = false;
  round = 1;
  lives: number = Rules.startingLives;
  score = 0;
  hiScore = 0;
  stateTimer = 0;
  levelTime = 0;
  /** Bumped whenever the arena is rebuilt or cleared, so views know to rebuild. */
  levelSerial = 0;
  singleLevel: number | null = null;
  /** Played in order, then repeated; tests swap in their own layouts. */
  levels: readonly LevelDef[] = LEVELS;

  grid!: Grid;
  player!: Player;
  enemies: Enemy[] = [];
  rocks: FallingRock[] = [];
  trowels: ThrownTrowel[] = [];
  fleet: InvaderFleet | null = null;
  bonus: BonusItem | null = null;
  jr: DonJr | null = null;
  collectedItems: number[] = [];
  /** False between rounds, when the stage is empty behind the level numeral. */
  hasArena = false;

  private levelStartDirt = 0;
  private invaderStartCount = 0;
  private cansDropped = 0;
  private bonusSpawned = false;
  private carryDonJr = false;
  private pendingTrophies: number[] = [];

  get levelIndex(): number {
    return this.singleLevel ?? (this.round - 1) % this.levels.length;
  }

  get level(): LevelDef {
    return this.levels[this.levelIndex];
  }

  get levelNumber(): number {
    return this.levelIndex + 1;
  }

  get levelTitle(): string {
    return `LEVEL ${this.levelNumber}  -  ${this.level.title}`;
  }

  get isInvaderLevel(): boolean {
    return this.hasArena && this.level.invaders;
  }

  get brickLaying(): boolean {
    return this.level.brickLaying;
  }

  isPlaying(): boolean {
    return this.state === 'playing' && !this.paused;
  }

  difficulty(): number {
    return 1 + Rules.roundSpeedUp * (this.round - 1);
  }

  donJr(): DonJr | null {
    return this.jr && this.jr.alive ? this.jr : null;
  }

  /** null plays the levels in rotation; otherwise every round repeats that level index. */
  startNewGame(singleLevel: number | null): void {
    this.singleLevel = singleLevel;
    this.carryDonJr = false;
    this.score = 0;
    this.lives = Rules.startingLives;
    this.round = 1;
    this.collectedItems = [];
    this.pendingTrophies = [];
    this.paused = false;
    this.buildLevel();
  }

  enterMenu(): void {
    this.clearLevel();
    this.paused = false;
    this.state = 'menu';
  }

  togglePause(force?: boolean): void {
    if (this.state === 'menu' || this.state === 'gameOver') return;
    this.paused = force ?? !this.paused;
  }

  private clearLevel(): void {
    this.enemies = [];
    this.rocks = [];
    this.trowels = [];
    this.fleet = null;
    this.bonus = null;
    this.jr = null;
    this.hasArena = false;
    this.levelSerial++;
  }

  private buildLevel(): void {
    this.clearLevel();
    const level = this.level;
    this.grid = Grid.fromText(level.layout);
    this.hasArena = true;
    this.levelStartDirt = this.grid.dirtRemaining;
    this.invaderStartCount = 0;
    this.player = new Player(this);

    this.rocks = this.grid.rockCells.map((c) => new FallingRock(this, c));

    const spawns = this.grid.enemySpawns;
    if (spawns.length > 0) {
      // Each cleared round leaves one more enemy behind; breeds cycle and shift each round.
      const count = spawns.length + (this.round - 1);
      for (let i = 0; i < count; i++) {
        this.enemies.push(new Enemy(this, spawns[i % spawns.length], i + this.round - 1));
      }
    }

    if (level.invaders && this.grid.invaderSpawns.length > 0) {
      // Each row of the formation is one breed, and the breeds shift every round.
      const rowYs = [...new Set(this.grid.invaderSpawns.map((c) => c.y))].sort((a, b) => a - b);
      const invaders: Enemy[] = [];
      const rows: number[] = [];
      for (const cell of this.grid.invaderSpawns) {
        const row = rowYs.indexOf(cell.y);
        const e = new Enemy(this, cell, row + this.round - 1, 'invader');
        invaders.push(e);
        rows.push(row);
      }
      this.enemies.push(...invaders);
      this.fleet = new InvaderFleet(this, invaders, rows);
      this.invaderStartCount = invaders.length;
    }

    this.player.init(this.grid.playerStart);
    if (this.carryDonJr && level.invaders) this.grantDonJr();
    this.carryDonJr = false;

    this.state = 'playing';
    this.stateTimer = 0;
    this.levelTime = 0;
    this.cansDropped = 0;
    this.bonusSpawned = false;
    this.pendingTrophies = [];
    this.events.push({ type: 'levelStart', level: this.levelNumber, round: this.round });
  }

  update(dt: number, input: Input): void {
    if (this.state === 'menu' || this.paused) return;
    this.stateTimer += dt;
    this.levelTime += dt;

    if (this.hasArena) {
      // Second way to clear a round: dig out every last block. Open arenas never clear this way.
      if (this.state === 'playing' && this.levelStartDirt > 0 && this.grid.dirtRemaining === 0) this.roundClear();
      if (this.state === 'playing') {
        this.collectBonusIfReached();
        // Invasion has no cans: the round's bonus appears once half the formation is down.
        if (this.level.invaders && !this.bonusSpawned && this.invaderStartCount > 0 &&
            this.enemies.length * 2 <= this.invaderStartCount) {
          this.spawnBonus();
        }
      }
      this.tickActors(dt, input);
    }

    switch (this.state) {
      case 'dying':
        if (this.stateTimer >= Rules.respawnDelay) {
          if (this.lives > 0) {
            this.respawnAfterDeath();
          } else {
            this.state = 'gameOver';
            this.stateTimer = 0;
            this.events.push({ type: 'gameOver', score: this.score });
          }
        }
        break;
      case 'levelClear':
        if (this.stateTimer >= Rules.levelClearDelay) {
          this.collectedItems.push(...this.pendingTrophies);
          this.pendingTrophies = [];
          // Repeating one level: if Don Jr. saw the round out, he's back for the next one.
          this.carryDonJr = this.singleLevel !== null && this.donJr() !== null;
          this.round++;
          this.clearLevel();
          this.state = 'interlude';
          this.stateTimer = 0;
        }
        break;
      case 'interlude':
        if (this.stateTimer >= Rules.interludeDelay) this.buildLevel();
        break;
      default:
        break;
    }
  }

  private tickActors(dt: number, input: Input): void {
    this.player.update(dt, input);
    if (this.jr) {
      this.jr.update(dt);
      if (this.jr.gone) this.jr = null;
    }
    this.fleet?.update(dt);
    for (const e of [...this.enemies]) e.update(dt);
    for (const r of this.rocks) r.update(dt);
    this.rocks = this.rocks.filter((r) => r.state !== 'gone');
    for (const t of this.trowels) t.update(dt);
    this.trowels = this.trowels.filter((t) => !t.done);
    if (this.bonus) this.bonus.life += dt;
  }

  private roundClear(): void {
    this.state = 'levelClear';
    this.stateTimer = 0;
    this.events.push({ type: 'levelClear', level: this.levelNumber, round: this.round });
  }

  private respawnAfterDeath(): void {
    // Classic arcade reset: terrain keeps its tunnels, everyone else returns to their start.
    for (const e of this.enemies) if (e.kind === 'digger') e.resetToSpawn();
    this.fleet?.regroup();
    this.trowels = [];
    this.player.init(this.grid.playerStart);
    this.state = 'playing';
    this.stateTimer = 0;
  }

  addScore(points: number, at: Vec2): void {
    if (points <= 0) return;
    this.score += points;
    this.hiScore = Math.max(this.hiScore, this.score);
    if (points >= 100) this.events.push({ type: 'score', points, at: { ...at } });
  }

  onEnemyKilled(enemy: Enemy): void {
    const i = this.enemies.indexOf(enemy);
    if (i < 0) return;
    this.enemies.splice(i, 1);
    if (this.enemies.length === 0 && this.state === 'playing') this.roundClear();
  }

  onPlayerKilled(): void {
    if (this.state !== 'playing') return;
    this.lives--;
    this.state = 'dying';
    this.stateTimer = 0;
  }

  onRockDropped(): void {
    if (this.state !== 'playing') return;
    this.cansDropped++;
    if (!this.bonusSpawned && this.cansDropped >= Rules.bonusCanThreshold) this.spawnBonus();
  }

  spawnTrowel(from: Vec2, dir: Vec2): void {
    this.trowels.push(new ThrownTrowel(this, from, dir));
  }

  tryTrowelBonusHit(pos: Vec2): boolean {
    if (this.state !== 'playing' || !this.level.invaders) return false;
    if (this.fleet?.hitUfoAt(pos, () => this.grantDonJr())) return true;
    if (this.bonus && dist(pos, this.bonus.cell) < Rules.bonusReach) {
      this.collectBonus();
      return true;
    }
    return false;
  }

  grantDonJr(): void {
    if (this.donJr() || !this.hasArena || !this.player.alive) return;
    this.jr = new DonJr(this, this.player);
    this.events.push({ type: 'donJr' });
  }

  private spawnBonus(): void {
    if (this.bonusSpawned) return;
    this.bonusSpawned = true;
    let cell = { x: Math.floor(this.grid.width / 2), y: Math.floor(this.grid.height / 2) };
    if (this.level.invaders) {
      // Out in the open between the formation and Don, in a random column he has to get under.
      cell = { x: 1 + randInt(this.grid.width - 2), y: this.grid.height - 6 };
    }
    this.bonus = { cell, item: (this.round - 1) % BonusItems.length, life: 0 };
    this.events.push({ type: 'bonusSpawn', at: cell });
  }

  private collectBonusIfReached(): void {
    if (this.bonus && dist(this.player.pos, this.bonus.cell) <= Rules.bonusReach) this.collectBonus();
  }

  private collectBonus(): void {
    if (!this.bonus) return;
    const { cell: at, item } = this.bonus;
    this.addScore(Rules.bonusBasePoints * Math.max(1, this.round), at);
    this.pendingTrophies.push(item);
    this.events.push({ type: 'bonusCollect', at });
    this.bonus = null;
    // On the invasion level the bonus also brings Don Jr. in.
    if (this.level.invaders) this.grantDonJr();
  }
}
