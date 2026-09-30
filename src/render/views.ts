import * as THREE from 'three';
import { BonusItems, CM_PER_CELL, Sprites, type PaletteEntry, type SpriteDef } from '../data/sprites';
import type { Enemy } from '../sim/enemy';
import type { Game } from '../sim/game';
import type { GameEvent } from '../sim/events';
import type { Vec2 } from '../sim/math';
import type { FallingRock } from '../sim/rock';
import type { ThrownTrowel } from '../sim/trowel';
import type { InvaderBomb } from '../sim/bomb';
import { Effects } from './fx';
import { GridView, strataColour } from './gridView';
import { ACTOR_Z, CHARACTER_FILL, LOOKS, type Stage } from './stage';
import { buildVoxelSprite, createVoxelInstances, tintVoxels, type VoxelMesh } from './voxel';

const at = (p: Vec2, z = ACTOR_Z) => new THREE.Vector3(p.x, -p.y, z);
const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];
const MORTAR_COLOUR = [0.72, 0.7, 0.66];
const GHOST_COLOUR = [0.7, 0.85, 1];

/** Two-pose walk: stand, and the stride frame every other 0.14 s while moving. */
class WalkingSprite {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private readonly stand: VoxelMesh;
  private readonly stride: VoxelMesh | null;
  private clock = 0;

  constructor(sprite: SpriteDef, pixel: number) {
    this.stand = buildVoxelSprite(sprite, pixel);
    this.stride = sprite.stride ? buildVoxelSprite(sprite, pixel, sprite.stride) : null;
    this.body.add(this.stand.mesh);
    if (this.stride) this.body.add(this.stride.mesh);
    this.root.add(this.body);
    this.step(false, 0);
  }

  step(moving: boolean, dt: number): void {
    this.clock = moving ? this.clock + dt : 0;
    const stride = !!this.stride && moving && Math.floor(this.clock / 0.14) % 2 === 1;
    this.stand.mesh.visible = !stride;
    if (this.stride) this.stride.mesh.visible = stride;
  }

  /** Faces +x; mirror for left, tip nose-up or nose-down for vertical travel (DigPawn::UpdateTransform). */
  face(f: Vec2): void {
    this.body.rotation.set(0, f.x < 0 ? Math.PI : 0, f.y < 0 ? Math.PI / 2 : f.y > 0 ? -Math.PI / 2 : 0);
  }

  dispose(): void {
    this.stand.mesh.dispose();
    this.stride?.mesh.dispose();
  }
}

class EnemyView {
  readonly root = new THREE.Group();
  private readonly voxels: VoxelMesh;
  private tintKey = '';

  constructor(readonly enemy: Enemy) {
    const b = enemy.breed;
    this.voxels = buildVoxelSprite(b, CHARACTER_FILL / Math.max(b.width, b.height));
    this.root.add(this.voxels.mesh);
  }

  sync(): void {
    const e = this.enemy;
    const b = e.breed;
    const p = at(e.pos);
    if (e.state === 'ghost') p.y += (Math.sin(e.animTime * 6) * 6) / CM_PER_CELL;
    else if (e.state === 'wander' || e.state === 'chase') {
      p.y += (Math.abs(Math.sin(e.animTime * b.bobRate)) * b.bobHeightCm) / CM_PER_CELL;
    }
    if (e.state === 'crushed') {
      this.root.position.copy(p);
      this.root.scale.set(1.3, 0.3, 1);
    } else {
      this.root.position.copy(p);
      const moving = e.state === 'wander' || e.state === 'chase';
      const roll = moving ? THREE.MathUtils.degToRad(Math.sin(e.animTime * b.bobRate * 0.5) * b.wobble) : 0;
      this.root.rotation.set(0, e.facingX >= 0 ? 0 : Math.PI, roll);
      // Mortar builds up as a chunky shell rather than inflating.
      const shell = 1 + 0.1 * e.mortarLayers;
      this.root.scale.set(shell, shell, 1 + 0.25 * e.mortarLayers);
    }
    const key = `${e.state}:${e.mortarLayers}`;
    if (key !== this.tintKey) {
      this.tintKey = key;
      this.retint();
    }
  }

  /** Anger when chasing, grey mortar as layers build, a pale wash while phasing (ADigEnemy::ApplyLayerColours). */
  private retint(): void {
    const e = this.enemy;
    const set = Math.min(1, e.mortarLayers / Math.max(1, e.setStages));
    const mortar = e.state === 'encased' ? 0.35 + 0.65 * set : 0;
    const anger = e.state === 'chase' || e.state === 'encased' ? 0.45 : 0;
    const phase = e.state === 'ghost' ? 0.62 : 0;
    const colour = (entry: PaletteEntry) => {
      if (entry.key === 'e') return entry.rgb;
      return lerp3(lerp3(lerp3(entry.rgb, e.breed.angry, anger), MORTAR_COLOUR, mortar), GHOST_COLOUR, phase);
    };
    const glow = (entry: PaletteEntry) => entry.glow * (1 - mortar) + (e.state === 'ghost' ? 0.4 : 0);
    tintVoxels(this.voxels, e.breed.palette, colour, glow);
  }

  dispose(): void {
    this.voxels.mesh.dispose();
  }
}

class RockView {
  readonly root = new THREE.Group();
  private readonly voxels: VoxelMesh;

  constructor(readonly rock: FallingRock) {
    const can = Sprites.characters.Can;
    this.voxels = buildVoxelSprite(can, CHARACTER_FILL / can.height);
    this.root.add(this.voxels.mesh);
  }

  sync(): void {
    const r = this.rock;
    this.root.position.copy(at(r.pos));
    this.root.rotation.z = r.state === 'wobble' ? THREE.MathUtils.degToRad(Math.sin(r.timer * 40) * 8) : 0;
    if (r.state === 'breaking') {
      // Crumples flat like a stamped can.
      const t = Math.min(1, r.timer / 0.5);
      this.root.scale.set(1 + 0.45 * t, 1 - 0.85 * t, 1);
      this.root.position.y -= 0.45 * 0.85 * t * CHARACTER_FILL;
    }
  }

  dispose(): void {
    this.voxels.mesh.dispose();
  }
}

const STEEL = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.82, 0.84, 0.88), metalness: 0.6, roughness: 0.3 });
const DARK_STEEL = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.45, 0.47, 0.52), metalness: 0.6, roughness: 0.35 });
const WOOD = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.55, 0.33, 0.15), roughness: 0.8 });
const UNIT = new THREE.BoxGeometry(1, 1, 1);

/** A trowel cartwheeling end over end in the screen plane. Parts in cells, from AThrownTrowel's layout. */
class TrowelView {
  readonly root = new THREE.Group();
  private readonly spinner = new THREE.Group();
  private ghostClock = 0;

  constructor(readonly trowel: ThrownTrowel) {
    const part = (mat: THREE.Material, x: number, y: number, sx: number, sy: number, rot = 0) => {
      const m = new THREE.Mesh(UNIT, mat);
      m.position.set(x, y, 0);
      m.scale.set(sx, sy, 0.03);
      m.rotation.z = rot;
      m.castShadow = true;
      this.spinner.add(m);
    };
    part(STEEL, 0.02, 0, 0.24, 0.14);
    part(STEEL, 0.13, 0, 0.1, 0.1, Math.PI / 4);
    part(DARK_STEEL, -0.06, 0.09, 0.03, 0.08);
    part(WOOD, -0.11, 0.14, 0.14, 0.05);
    this.root.add(this.spinner);
    this.root.rotation.z = Math.atan2(-trowel.dir.y, trowel.dir.x);
  }

  sync(dt: number, fx: Effects): void {
    const t = this.trowel;
    const across = { x: -t.dir.y, y: t.dir.x };
    const wobble = Math.sin(t.age * 16) * 0.06;
    this.root.position.copy(at({ x: t.pos.x + across.x * wobble, y: t.pos.y + across.y * wobble }));
    this.spinner.rotation.z = THREE.MathUtils.degToRad(1080 * t.age);
    // Pops out of Don's hand small, overshoots, then settles.
    const grow = Math.min(1, t.age / 0.08);
    const overshoot = Math.sin(Math.min(1, Math.max(0, (t.age - 0.08) / 0.18)) * Math.PI) * 0.3;
    this.spinner.scale.setScalar(0.5 + 0.5 * grow + overshoot);
    this.ghostClock += dt;
    if (this.ghostClock >= 0.025) {
      this.ghostClock = 0;
      fx.ghost(this.root.position.clone().setZ(ACTOR_Z - 0.05), this.root.rotation.z + this.spinner.rotation.z);
    }
  }

  dispose(): void {}
}

const BOMB = new THREE.Color().setRGB(1, 0.45, 0.1);

class BombView {
  readonly root = new THREE.Group();
  private readonly bits: VoxelMesh;

  constructor(readonly bomb: InvaderBomb) {
    this.bits = createVoxelInstances(3);
    for (let i = 0; i < 3; i++) {
      this.bits.mesh.setColorAt(i, BOMB);
      this.bits.glow.setX(i, 3 * 0.35);
    }
    this.root.add(this.bits.mesh);
  }

  sync(): void {
    const b = this.bomb;
    const pixel = 1 / 12;
    // Squiggle: the three pixels swap sides every beat.
    const side = Math.floor(b.age / 0.08) % 2 === 0 ? 1 : -1;
    const m = new THREE.Matrix4();
    for (let i = 0; i < 3; i++) {
      m.makeScale(pixel, pixel, pixel).setPosition((i === 1 ? -side : side) * pixel * 0.5, (1 - i) * pixel, 0);
      this.bits.mesh.setMatrixAt(i, m);
    }
    this.bits.mesh.instanceMatrix.needsUpdate = true;
    this.root.position.copy(at(b.pos, ACTOR_Z + 0.1));
  }

  dispose(): void {
    this.bits.mesh.dispose();
  }
}

class BonusView {
  readonly root = new THREE.Group();
  private readonly voxels: VoxelMesh;

  constructor(readonly item: number) {
    const def = BonusItems[item];
    this.voxels = buildVoxelSprite(def, CHARACTER_FILL / Math.max(def.width, def.height));
    // A soft glow so the reward pops off the dark site.
    tintVoxels(this.voxels, def.palette, undefined, () => 0.6);
    this.root.add(this.voxels.mesh);
  }

  sync(cell: Vec2, life: number): void {
    this.root.position.copy(at(cell));
    this.root.position.y += Math.sin(life * 3.2) * 0.06;
    this.root.rotation.z = THREE.MathUtils.degToRad(Math.sin(life * 2.1) * 6);
  }

  dispose(): void {
    this.voxels.mesh.dispose();
  }
}

/** Keeps a view per live sim object, creating and disposing them as objects come and go. */
class ViewSet<T extends object, V extends { root: THREE.Object3D; dispose(): void }> {
  private readonly views = new Map<T, V>();
  constructor(
    private readonly parent: THREE.Object3D,
    private readonly make: (item: T) => V,
  ) {}

  sync(items: readonly T[], each: (view: V) => void): void {
    const live = new Set(items);
    for (const [item, view] of this.views) {
      if (!live.has(item)) {
        view.root.removeFromParent();
        view.dispose();
        this.views.delete(item);
      }
    }
    for (const item of items) {
      let view = this.views.get(item);
      if (!view) {
        view = this.make(item);
        this.views.set(item, view);
        this.parent.add(view.root);
      }
      each(view);
    }
  }

  clear(): void {
    this.sync([], () => {});
  }
}

/** Mirrors the game onto the stage every frame, and turns sim events into effects. */
export class GameView {
  private readonly fx = new Effects();
  private readonly arena = new THREE.Group();
  private gridView: GridView | null = null;
  private serial = -1;
  private don: WalkingSprite;
  private jr: WalkingSprite;
  private readonly enemies: ViewSet<Enemy, EnemyView>;
  private readonly rocks: ViewSet<FallingRock, RockView>;
  private readonly trowels: ViewSet<ThrownTrowel, TrowelView>;
  private readonly bombs: ViewSet<InvaderBomb, BombView>;
  private bonus: BonusView | null = null;
  private trophies: BonusView[] = [];
  private shake = 0;

  constructor(private readonly stage: Stage) {
    stage.world.add(this.arena, this.fx.group);
    const donSprite = Sprites.characters.Don;
    const pixel = CHARACTER_FILL / donSprite.height;
    this.don = new WalkingSprite(donSprite, pixel);
    this.jr = new WalkingSprite(Sprites.characters.DonJr, pixel);
    this.enemies = new ViewSet(this.arena, (e) => new EnemyView(e));
    this.rocks = new ViewSet(this.arena, (r) => new RockView(r));
    this.trowels = new ViewSet(this.arena, (t) => new TrowelView(t));
    this.bombs = new ViewSet(this.arena, (b) => new BombView(b));
  }

  private rebuild(game: Game): void {
    this.serial = game.levelSerial;
    this.gridView?.dispose();
    this.gridView = null;
    this.enemies.clear();
    this.rocks.clear();
    this.trowels.clear();
    this.bombs.clear();
    this.bonus?.root.removeFromParent();
    this.bonus?.dispose();
    this.bonus = null;
    for (const trophy of this.trophies) {
      trophy.root.removeFromParent();
      trophy.dispose();
    }
    this.trophies = [];
    this.fx.clear();
    this.arena.remove(this.don.root, this.jr.root);
    if (!game.hasArena) return;
    this.gridView = new GridView(game.grid);
    this.arena.add(this.gridView.group, this.don.root, this.jr.root);
    const count = Math.min(game.collectedItems.length, Math.max(1, Math.floor(game.grid.width / 1.1)));
    const start = game.grid.width * 0.5 - (count - 1) * 0.55;
    for (let index = 0; index < count; index++) {
      const item = game.collectedItems[game.collectedItems.length - count + index];
      const trophy = new BonusView(item);
      trophy.root.scale.setScalar(0.5);
      trophy.sync({ x: start + index * 1.1, y: -1.1 }, 0);
      this.trophies.push(trophy);
      this.arena.add(trophy.root);
    }
    this.stage.applyLook(LOOKS[game.level.key]);
    this.stage.frame(game.grid.width, game.grid.height);
  }

  update(game: Game, dt: number): void {
    if (game.levelSerial !== this.serial) this.rebuild(game);
    if (!game.hasArena) {
      this.fx.update(dt, []);
      return;
    }
    const frameDt = game.paused ? 0 : dt;
    this.syncPawn(game, frameDt);
    const ufo = game.fleet?.ufo;
    this.enemies.sync(ufo ? [...game.enemies, ufo] : game.enemies, (v) => v.sync());
    this.rocks.sync(game.rocks, (v) => v.sync());
    this.trowels.sync(game.trowels, (v) => v.sync(frameDt, this.fx));
    this.bombs.sync(game.fleet?.bombs ?? [], (v) => v.sync());
    this.syncBonus(game);
    this.fx.update(frameDt, game.player.mortar.globs);

    // Screen shake, decaying.
    this.shake = Math.max(0, this.shake - frameDt * 3);
    const s = this.shake * this.shake * 0.25;
    this.stage.world.position.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0);
  }

  private syncPawn(game: Game, dt: number): void {
    const p = game.player;
    const don = this.don;
    don.step(p.moving, dt);
    don.face(p.facing);
    don.root.position.copy(at(p.pos));
    don.root.rotation.z = 0;
    if (!p.alive) {
      // Squash-and-spin death so it is obvious what happened.
      const t = Math.min(1, p.deathTime / 0.6);
      don.root.scale.set(1 + 0.5 * t, THREE.MathUtils.lerp(1, 0.18, t), 1 + 0.5 * t);
      don.root.rotation.z = t * Math.PI * 2;
    } else {
      // A mortar pump squashes him back on his heels; a throw lunges him forward and low.
      const r = p.mortar.recoil;
      const k = p.throwKick;
      don.root.scale.set(1 - 0.18 * r + 0.2 * k, 1 + 0.14 * r - 0.12 * k, 1);
    }

    const jr = game.jr;
    this.jr.root.visible = !!jr;
    if (jr) {
      this.jr.step(jr.moving, dt);
      this.jr.face(jr.facing);
      this.jr.root.position.copy(at(jr.pos));
      if (!jr.alive) {
        const t = Math.min(1, jr.deathTime / 0.5);
        this.jr.root.scale.set(1 + 0.5 * t, THREE.MathUtils.lerp(1, 0.1, t), 1);
        this.jr.root.rotation.z = t * Math.PI * 2;
      } else {
        // Joining pop, like a rescued fighter docking: small, overshoot, settle.
        const grow = Math.min(1, jr.age / 0.12);
        const overshoot = Math.sin(Math.min(1, Math.max(0, (jr.age - 0.12) / 0.25)) * Math.PI) * 0.3;
        this.jr.root.scale.setScalar(0.3 + 0.7 * grow + overshoot);
        this.jr.root.rotation.z = 0;
      }
    }
  }

  private syncBonus(game: Game): void {
    const b = game.bonus;
    if (!b) {
      if (this.bonus) {
        this.bonus.root.removeFromParent();
        this.bonus.dispose();
        this.bonus = null;
      }
      return;
    }
    if (!this.bonus || this.bonus.item !== b.item) {
      this.bonus?.root.removeFromParent();
      this.bonus?.dispose();
      this.bonus = new BonusView(b.item);
      this.arena.add(this.bonus.root);
    }
    this.bonus.sync(b.cell, b.life);
  }

  /** Particles and shake for what just happened in the sim. */
  onEvents(events: readonly GameEvent[], game: Game): void {
    if (!game.hasArena) return;
    for (const e of events) {
      switch (e.type) {
        case 'dig':
          this.fx.crumbs(at(e.at, 0.5), strataColour(game.grid.depthBand(e.at.y)), 5, 2.5);
          break;
        case 'brickBroken':
          this.fx.crumbs(at(e.at, 0.5), [0.72, 0.26, 0.16], 6, 3);
          break;
        case 'brickLaid':
          this.fx.crumbs(at(e.at, 0.5), [0.78, 0.76, 0.7], 4, 1.5);
          break;
        case 'trowelHit':
          this.fx.sparks(at(e.at, ACTOR_Z + 0.15), new THREE.Vector3(-e.dir.x, e.dir.y, 0), e.sparks);
          break;
        case 'encaseKill':
          this.fx.crumbs(at(e.at), [0.72, 0.7, 0.66], 16, 4);
          this.shake = Math.max(this.shake, 0.5);
          break;
        case 'trowelKill':
          this.fx.crumbs(at(e.at), [0.95, 0.85, 0.5], 10, 4);
          break;
        case 'rockLand':
          this.fx.crumbs(at(e.at), [0.55, 0.5, 0.45], 10, 3);
          this.shake = Math.max(this.shake, e.crushed > 0 ? 1 : 0.5);
          break;
        case 'playerDied':
          this.shake = Math.max(this.shake, 0.9);
          break;
        case 'ufoHit':
          this.fx.crumbs(at(e.at), [0.55, 0.8, 0.9], 20, 5);
          this.shake = Math.max(this.shake, 0.6);
          break;
        case 'bonusCollect':
          this.fx.sparks(at(e.at), new THREE.Vector3(0, 1, 0), 18);
          break;
        default:
          break;
      }
    }
  }
}
