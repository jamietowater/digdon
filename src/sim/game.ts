import arena01 from '../data/levels/arena01.txt?raw';
import arena02 from '../data/levels/arena02.txt?raw';
import arena03 from '../data/levels/arena03.txt?raw';
import arena04 from '../data/levels/arena04.txt?raw';
import arena05 from '../data/levels/arena05.txt?raw';
import arena06 from '../data/levels/arena06.txt?raw';
import { BonusItems } from '../data/sprites';
import { InvaderFleet } from './fleet';
import { CongaLine } from './conga';
import { ScaffoldSite } from './scaffold';
import { SummitSite } from './summit';
import { RaceSite } from './race';
import { DonJr } from './donjr';
import { Enemy } from './enemy';
import { EventQueue } from './events';
import { Grid } from './grid';
import { dist, randInt, toCell, type Vec2 } from './math';
import { Player } from './player';
import { FallingRock } from './rock';
import { Rules } from './config';
import { ThrownTrowel } from './trowel';
import { NO_INPUT, type Input, type World } from './world';

export type MatchState = 'menu' | 'playing' | 'dying' | 'levelClear' | 'interlude' | 'gameOver';

export interface LevelDef {
  key: 'dig' | 'bricklayer' | 'conga' | 'invasion' | 'scaffold' | 'summit' | 'drive';
  title: string;
  layout: string;
  invaders: boolean;
  brickLaying: boolean;
  conga?: number;
  platform?: 'scaffold' | 'summit';
  race?: boolean;
}

/** The driving level has no arena; this stub keeps the shared grid and player in place. */
const DRIVE_LAYOUT = 'P..\n...\nXXX';

export const LEVELS: readonly LevelDef[] = [
  { key: 'dig', title: 'DIG DON', layout: arena01, invaders: false, brickLaying: false },
  { key: 'bricklayer', title: 'BRICKLAYER', layout: arena02, invaders: false, brickLaying: true },
  { key: 'conga', title: 'CONGA LINE', layout: arena03, invaders: false, brickLaying: true, conga: 10 },
  { key: 'invasion', title: 'INVASION', layout: arena04, invaders: true, brickLaying: true },
  { key: 'scaffold', title: 'SCAFFOLD', layout: arena05, invaders: false, brickLaying: false, platform: 'scaffold' },
  { key: 'summit', title: 'SUMMIT', layout: arena06, invaders: false, brickLaying: false, platform: 'summit' },
  { key: 'drive', title: "I CAN'T SEE!!", layout: DRIVE_LAYOUT, invaders: false, brickLaying: false, race: true },
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
  player2: Player | null = null;
  twoPlayers = false;
  enemies: Enemy[] = [];
  rocks: FallingRock[] = [];
  trowels: ThrownTrowel[] = [];
  fleet: InvaderFleet | null = null;
  conga: CongaLine[] = [];
  scaffold: ScaffoldSite | null = null;
  summit: SummitSite | null = null;
  race: RaceSite | null = null;
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

  get canWeaponsKill(): boolean { return this.level.key !== 'bricklayer' || this.enemies.length > 1; }

  get isCongaLevel(): boolean {
    return this.hasArena && !!this.level.conga;
  }

  isPlaying(): boolean {
    return this.state === 'playing' && !this.paused;
  }

  get isPlatformLevel(): boolean { return !!this.level.platform; }
  get isSummitLevel(): boolean { return this.level.platform === 'summit'; }

  onBrickBroken(at: Vec2): void {
    this.events.push({ type: 'brickBroken', at });
    this.summit?.onBrickBroken(at);
  }

  get climbers(): Player[] { return [this.player, ...(this.player2 ? [this.player2] : [])].filter(player => player.alive); }

  difficulty(): number {
    return 1 + Rules.roundSpeedUp * (this.round - 1);
  }

  donJr(): DonJr | null {
    return this.jr && this.jr.alive ? this.jr : null;
  }

  /** null plays the levels in rotation; otherwise every round repeats that level index. */
  startNewGame(singleLevel: number | null, twoPlayers = false): void {
    this.singleLevel = singleLevel;
    this.twoPlayers = twoPlayers;
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
    this.conga = [];
    this.scaffold = null;
    this.summit = null;
    this.race = null;
    this.bonus = null;
    this.jr = null;
    this.player2 = null;
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
    if (level.platform === 'scaffold') this.scaffold = new ScaffoldSite(this);
    if (level.platform === 'summit') this.summit = new SummitSite(this);
    if (level.race) this.race = new RaceSite(this);
    if (this.summit && this.twoPlayers) {
      this.player2 = new Player(this);
      this.player2.init(this.summit.respawn(this.grid.playerStart.x + 3, this.player));
    }
    if (level.conga) {
      for (const entry of this.grid.congaSpawns) {
        const length = level.conga + 2 * Math.floor((this.round - 1) / this.levels.length);
        const segments = Array.from({ length }, (_, index) => new Enemy(this, entry, index + this.round - 1, 'conga'));
        this.enemies.push(...segments);
        this.conga.push(new CongaLine(this, entry, segments));
      }
    }
    if (this.carryDonJr && (level.invaders || level.conga)) this.grantDonJr();
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
    if (this.race) {
      this.race.update(dt, input);
      return;
    }
    this.player.update(dt, input);
    if (this.player2) {
      this.player2.update(dt, input.player2 ?? NO_INPUT);
      if (this.isPlaying() && !this.player2.alive && this.player2.deathTime >= Rules.respawnDelay) {
        this.player2.init(this.summit!.respawn(Math.round(this.player.pos.x) + 2, this.player));
      }
    }
    this.scaffold?.update(dt);
    this.summit?.update(dt);
    if (this.jr) {
      this.jr.update(dt);
      if (this.jr.gone) this.jr = null;
    }
    this.fleet?.update(dt);
    for (const line of this.conga) line.update(dt);
    for (const e of [...this.enemies]) e.update(dt);
    for (const r of this.rocks) r.update(dt);
    this.rocks = this.rocks.filter((r) => r.state !== 'gone');
    for (const t of this.trowels) t.update(dt);
    this.trowels = this.trowels.filter((t) => !t.done);
    for (const line of this.conga) line.splitLosses();
    if (this.isPlaying() && this.level.key === 'bricklayer') this.trapEnclosedEnemies();
    if (this.bonus) this.bonus.life += dt;
  }

  private trapEnclosedEnemies(): void {
    const playerCells = new Set(this.player.occupiedCells().map(cell => this.grid.index(cell.x, cell.y)));
    const snapshot = [...this.enemies];
    for (const enemy of snapshot) {
      if (enemy.state === 'dead' || enemy.state === 'crushed') continue;
      const start = toCell(enemy.pos);
      if (!this.grid.isPassable(start.x, start.y)) continue;
      const pocket = [start];
      const seen = new Set([this.grid.index(start.x, start.y)]);
      let trapped = true;
      for (let index = 0; index < pocket.length; index++) {
        const cell = pocket[index];
        if (pocket.length > 12 || playerCells.has(this.grid.index(cell.x, cell.y))) { trapped = false; break; }
        for (const neighbor of [{ x: cell.x + 1, y: cell.y }, { x: cell.x - 1, y: cell.y }, { x: cell.x, y: cell.y + 1 }, { x: cell.x, y: cell.y - 1 }]) {
          const address = this.grid.index(neighbor.x, neighbor.y);
          if (!seen.has(address) && this.grid.isPassable(neighbor.x, neighbor.y)) { seen.add(address); pocket.push(neighbor); }
        }
      }
      if (!trapped) continue;
      for (const victim of snapshot) {
        const cell = toCell(victim.pos);
        if (victim.state === 'dead' || !seen.has(this.grid.index(cell.x, cell.y))) continue;
        this.addScore(1000, victim.pos);
        victim.kill();
      }
      for (const cell of pocket) {
        if (this.grid.layBrick(cell.x, cell.y)) this.events.push({ type: 'brickLaid', at: cell });
      }
    }
  }

  private roundClear(): void {
    this.state = 'levelClear';
    this.stateTimer = 0;
    this.events.push({ type: 'levelClear', level: this.levelNumber, round: this.round });
  }

  private respawnAfterDeath(): void {
    // Classic arcade reset: terrain keeps its tunnels, everyone else returns to their start.
    for (const e of this.enemies) e.resetToSpawn();
    this.fleet?.regroup();
    for (const line of this.conga) line.regroup();
    this.trowels = [];
    this.player.init(this.summit?.respawn(this.grid.playerStart.x, this.player2) ?? this.grid.playerStart);
    if (this.player2 && !this.player2.alive) this.player2.init(this.summit!.respawn(this.player.pos.x + 3, this.player));
    this.state = 'playing';
    this.scaffold?.reset();
    this.summit?.reset();
    this.race?.reset();
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

  onPlayerKilled(player: Player = this.player): void {
    if (player === this.player2) return;
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
    if (this.isPlaying() && this.scaffold?.trowelHit(pos)) return true;
    if (this.isPlaying() && this.summit?.trowelHit(pos)) return true;
    if (this.state !== 'playing' || !(this.level.invaders || this.level.conga)) return false;
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

  collectSiteItem(item: number, at: Vec2): void {
    this.addScore(800, at);
    this.pendingTrophies.push(item);
    this.events.push({ type: 'bonusCollect', at: { ...at } });
  }

  completeSite(bonus: number): void {
    if (!this.isPlaying()) return;
    this.addScore(bonus, this.player.pos);
    this.roundClear();
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
    if (this.level.invaders || this.level.conga) this.grantDonJr();
  }
}
