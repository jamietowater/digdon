import { Race } from './config';
import type { Game } from './game';
import { clamp, lerp, randInt, randRange, random } from './math';
import type { Input } from './world';

export type RaceEnemyKind = 'CanSlinger' | 'Luchador' | 'ChiliAmigo';

export interface RaceEnemy {
  kind: RaceEnemyKind;
  /** Distance along the track. */
  z: number;
  /** Across the road: -1 and 1 are the edges. */
  x: number;
  targetX: number;
  /** Seconds into a Luchador lane hop; 0 on the ground. */
  hop: number;
  /** Until the next hop or can throw. */
  timer: number;
  /** Seconds since a brick knocked it down; -1 while standing. */
  hit: number;
}

export interface RaceBrick {
  z: number;
  x: number;
  age: number;
}

/** A can in flight, placed relative to the car so it always lands on the windshield plane. */
export interface RaceCan {
  rel: number;
  rel0: number;
  x: number;
  x0: number;
  x1: number;
  age: number;
}

const POINTS: Record<RaceEnemyKind, number> = { CanSlinger: 300, Luchador: 200, ChiliAmigo: 100 };
const LANES = [-0.6, 0, 0.6];

/**
 * Level 7, I CAN'T SEE!!: a Pole Position-style drive to the finish line. Don Jr. can't see, so his friend drives;
 * the player steers, throws bricks at the creatures on the road and beats the clock.
 */
export class RaceSite {
  readonly curves: number[] = [];
  readonly finishZ: number;
  position = 0;
  speed = 0;
  playerX = 0;
  steer = 0;
  timeLeft: number;
  /** Seconds of windshield splat left, and a seed so the blobs hold still. */
  splat = 0;
  splatSeed = 0;
  /** Seconds since the crash that cost the current life. */
  crash = 0;
  timedOut = false;
  enemies: RaceEnemy[] = [];
  bricks: RaceBrick[] = [];
  cans: RaceCan[] = [];
  spawnTimer: number = Race.firstSpawn;
  private brickCooldown = 0;

  constructor(private readonly game: Game) {
    // Each round is a little longer, with the clock stretched to match.
    const scale = 1 + Race.roundLength * (game.round - 1);
    const segments = Math.round(Race.trackSegments * scale);
    this.finishZ = segments * Race.segmentLength;
    this.timeLeft = Race.timeLimit * scale;
    const total = segments + Race.drawDistance + 20;
    for (let i = 0; i < 40; i++) this.curves.push(0);
    while (this.curves.length < total) {
      const length = 30 + randInt(90);
      const curve = random() < 0.3 ? 0 : (random() < 0.5 ? -1 : 1) * randRange(1, Race.maxCurve);
      for (let i = 0; i < length; i++) this.curves.push(curve * Math.sin((Math.PI * i) / length));
    }
    // A straight run to the flag and beyond it.
    for (let i = Math.max(0, segments - 40); i < this.curves.length; i++) this.curves[i] = 0;
  }

  get progress(): number { return clamp(this.position / this.finishZ, 0, 1); }
  get speedRatio(): number { return this.speed / Race.maxSpeed; }

  curveAt(z: number): number {
    return this.curves[Math.max(0, Math.floor(z / Race.segmentLength))] ?? 0;
  }

  addEnemy(kind: RaceEnemyKind, z: number, x: number): RaceEnemy {
    const timer = kind === 'CanSlinger' ? randRange(0.5, 1.5) : randRange(1, 2.5);
    const enemy: RaceEnemy = { kind, z, x, targetX: x, hop: 0, timer, hit: -1 };
    this.enemies.push(enemy);
    return enemy;
  }

  /** After a lost life: stopped in the middle of the road, with the nearest trouble cleared away. */
  reset(): void {
    this.speed = 0;
    this.playerX = 0;
    this.steer = 0;
    this.crash = 0;
    this.splat = 0;
    this.timedOut = false;
    this.enemies = this.enemies.filter(enemy => enemy.hit < 0 && enemy.z - this.position > Race.clearAhead);
    this.bricks = [];
    this.cans = [];
    this.timeLeft = Math.max(this.timeLeft, Race.retryTime);
    this.spawnTimer = Race.firstSpawn;
  }

  update(dt: number, input: Input): void {
    this.splat = Math.max(0, this.splat - dt);
    this.brickCooldown = Math.max(0, this.brickCooldown - dt);
    for (const enemy of this.enemies) if (enemy.hit >= 0) enemy.hit += dt;
    this.enemies = this.enemies.filter(enemy => enemy.hit < Race.hitTime && enemy.z > this.position);
    if (!this.game.isPlaying()) {
      // Crashed, cleared or out of time: coast to a stop.
      if (this.game.state === 'dying') this.crash += dt;
      this.speed = Math.max(0, this.speed - Race.crashDecel * dt);
      this.position += this.speed * dt;
      this.steer = 0;
      return;
    }
    this.drive(dt, input);
    if (this.position >= this.finishZ) {
      this.game.completeSite(Math.ceil(this.timeLeft) * Race.timeBonus);
      return;
    }
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.timedOut = true;
      this.crashOut();
      return;
    }
    this.spawn(dt);
    if (input.firePressed || input.throwPressed) this.throwBrick();
    this.moveBricks(dt);
    this.moveCans(dt);
    this.moveEnemies(dt);
  }

  private drive(dt: number, input: Input): void {
    if (input.moveY < 0) this.speed += Race.accel * dt;
    else if (input.moveY > 0) this.speed -= Race.brake * dt;
    else if (this.speed < Race.cruiseSpeed) this.speed = Math.min(Race.cruiseSpeed, this.speed + Race.accel * 0.6 * dt);
    else this.speed = Math.max(Race.cruiseSpeed, this.speed - Race.coastDecel * dt);
    if (Math.abs(this.playerX) > 1 && this.speed > Race.offRoadMaxSpeed) {
      this.speed = Math.max(Race.offRoadMaxSpeed, this.speed - Race.offRoadDecel * dt);
    }
    this.speed = clamp(this.speed, 0, Race.maxSpeed);
    const ratio = this.speedRatio;
    this.steer = input.moveX;
    this.playerX += input.moveX * Race.steer * dt * (ratio > 0 ? 0.25 + 0.75 * ratio : 0);
    // Curves push the car toward the outside.
    this.playerX -= this.curveAt(this.position) * ratio * Race.centrifugal * dt;
    this.playerX = clamp(this.playerX, -Race.maxOffRoad, Race.maxOffRoad);
    this.position += this.speed * dt;
  }

  private spawn(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || this.enemies.length >= Race.maxEnemies) return;
    this.spawnTimer = randRange(Race.spawnMin, Race.spawnMax) / this.game.difficulty();
    const z = this.position + Race.spawnAhead;
    if (z > this.finishZ - 2000) return;
    const roll = random();
    if (roll < 0.35) {
      // Chili Amigos walk in pairs.
      const x = randRange(-0.7, 0.7);
      this.addEnemy('ChiliAmigo', z, x - 0.25);
      this.addEnemy('ChiliAmigo', z + 150, x + 0.25);
    } else if (roll < 0.7) {
      this.addEnemy('Luchador', z, LANES[randInt(LANES.length)]);
    } else {
      this.addEnemy('CanSlinger', z, randRange(-0.8, 0.8));
    }
  }

  private throwBrick(): void {
    if (this.brickCooldown > 0) return;
    this.brickCooldown = Race.brickCooldown;
    this.bricks.push({ z: this.position + Race.hitZ, x: this.playerX, age: 0 });
    this.game.events.push({ type: 'brickThrow', at: { x: this.playerX, y: 0 } });
  }

  private moveBricks(dt: number): void {
    for (const brick of this.bricks) {
      const from = brick.z;
      brick.z += (this.speed + Race.brickSpeed) * dt;
      brick.age += dt;
      const target = this.enemies.find(enemy => enemy.hit < 0 && Math.abs(enemy.x - brick.x) < Race.hitWidth &&
        enemy.z >= from - Race.brickReach && enemy.z <= brick.z + Race.brickReach);
      if (!target) continue;
      target.hit = 0;
      brick.age = Infinity;
      const at = { x: target.x, y: 0 };
      this.game.addScore(POINTS[target.kind] * this.game.round, at);
      this.game.events.push({ type: 'raceHit', at });
    }
    this.bricks = this.bricks.filter(brick => brick.age < Race.brickLife);
  }

  private moveCans(dt: number): void {
    for (const can of this.cans) {
      can.age += dt;
      const t = Math.min(1, can.age / Race.canFlight);
      can.rel = lerp(can.rel0, Race.hitZ, t);
      can.x = lerp(can.x0, can.x1, t);
      if (t < 1 || Math.abs(can.x1 - this.playerX) >= Race.splatWidth) continue;
      this.splat = Race.splatTime;
      this.splatSeed = randInt(1000);
      this.game.events.push({ type: 'splat', at: { x: can.x, y: 0 } });
    }
    this.cans = this.cans.filter(can => can.age < Race.canFlight);
  }

  private moveEnemies(dt: number): void {
    const difficulty = this.game.difficulty();
    for (const enemy of this.enemies) {
      if (enemy.hit >= 0) continue;
      const pace = enemy.kind === 'CanSlinger' ? 0.4 : enemy.kind === 'Luchador' ? 1.2 : 1;
      enemy.z -= Race.walkSpeed * difficulty * pace * dt;
      enemy.timer -= dt;
      const rel = enemy.z - this.position;
      if (enemy.kind === 'Luchador') this.hop(enemy, dt, difficulty);
      if (enemy.kind === 'CanSlinger' && enemy.timer <= 0 && rel >= Race.throwMin && rel <= Race.throwMax) {
        enemy.timer = randRange(1.6, 2.8) / difficulty;
        const x1 = clamp(this.playerX + randRange(-0.08, 0.08), -1.2, 1.2);
        this.cans.push({ rel, rel0: rel, x: enemy.x, x0: enemy.x, x1, age: 0 });
        this.game.events.push({ type: 'canThrow', at: { x: enemy.x, y: 0 } });
      }
      if (rel < Race.hitZ && rel > Race.hitZ - Race.hitDepth && Math.abs(enemy.x - this.playerX) < Race.hitWidth) {
        this.crashOut();
        return;
      }
    }
  }

  /** Luchadors leap from lane to lane. */
  private hop(enemy: RaceEnemy, dt: number, difficulty: number): void {
    if (enemy.hop > 0) {
      enemy.hop += dt;
      const step = Race.hopSpeed * dt;
      const gap = enemy.targetX - enemy.x;
      enemy.x = Math.abs(gap) <= step ? enemy.targetX : enemy.x + Math.sign(gap) * step;
      if (enemy.x === enemy.targetX) enemy.hop = 0;
    } else if (enemy.timer <= 0) {
      const lanes = LANES.filter(lane => Math.abs(lane - enemy.x) > 0.1);
      enemy.targetX = lanes[randInt(lanes.length)];
      enemy.hop = 1e-3;
      enemy.timer = randRange(1.2, 2.4) / difficulty;
    }
  }

  private crashOut(): void {
    this.crash = 0;
    this.game.events.push({ type: 'crash', at: { x: this.playerX, y: 0 } });
    this.game.onPlayerKilled();
  }
}
