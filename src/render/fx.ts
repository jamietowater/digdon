import * as THREE from 'three';
import { createVoxelInstances, type VoxelMesh } from './voxel';
import type { Glob } from '../sim/mortar';
import { ACTOR_Z } from './stage';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  colour: THREE.Color;
  glow: number;
  gravity: number;
  /** Stretched along the velocity, so sparks read as streaks. */
  stretch: number;
  spin: number;
}

const CAPACITY = 900;
const GLOB_CAPACITY = 600;
const MORTAR = new THREE.Color().setRGB(0.8, 0.74, 0.62);
const FOAM = new THREE.Color().setRGB(0.97, 0.96, 0.92);

/** Every short-lived bit of juice: sparks, crumbs, flashes, trails, and the mortar stream. */
export class Effects {
  readonly group = new THREE.Group();
  private readonly cubes: VoxelMesh;
  private readonly globs: VoxelMesh;
  private particles: Particle[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly axis = new THREE.Vector3(0, 0, 1);

  constructor() {
    this.cubes = createVoxelInstances(CAPACITY);
    this.cubes.mesh.frustumCulled = false;
    this.globs = createVoxelInstances(GLOB_CAPACITY);
    this.globs.mesh.geometry.dispose();
    const sphere = new THREE.IcosahedronGeometry(0.5, 1);
    sphere.setAttribute('instanceGlow', this.globs.glow);
    this.globs.mesh.geometry = sphere;
    this.globs.mesh.frustumCulled = false;
    this.group.add(this.cubes.mesh, this.globs.mesh);
  }

  clear(): void {
    this.particles = [];
  }

  spawn(p: Partial<Particle> & { pos: THREE.Vector3; colour: THREE.Color }): void {
    if (this.particles.length >= CAPACITY) this.particles.shift();
    this.particles.push({
      vel: new THREE.Vector3(),
      age: 0,
      life: 0.4,
      size: 0.08,
      glow: 0,
      gravity: 0,
      stretch: 1,
      spin: 0,
      ...p,
    });
  }

  /** A burst of streaking sparks thrown back along -dir, like the trowel's impact. */
  sparks(at: THREE.Vector3, back: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      const out = new THREE.Vector3(THREE.MathUtils.randFloat(-1, 1), THREE.MathUtils.randFloat(-0.4, 1), 0).normalize();
      const hot = Math.random() < 0.5;
      this.spawn({
        pos: at.clone(),
        vel: out.multiplyScalar(THREE.MathUtils.randFloat(3, 7)).addScaledVector(back, THREE.MathUtils.randFloat(0.5, 3)),
        life: THREE.MathUtils.randFloat(0.25, 0.45),
        size: THREE.MathUtils.randFloat(0.05, 0.09),
        colour: hot ? new THREE.Color().setRGB(1, 0.75, 0.2) : new THREE.Color().setRGB(1, 1, 0.95),
        glow: hot ? 6 : 8,
        gravity: 22,
        stretch: 2.2,
      });
    }
    // The "ting": a white star that pops and shrinks.
    this.spawn({ pos: at.clone().setZ(at.z + 0.05), life: 0.12, size: 0.45, colour: new THREE.Color(1, 1, 1), glow: 8, spin: 0 });
  }

  /** Chunky crumbs in a colour, popping up and falling. */
  crumbs(at: THREE.Vector3, colour: [number, number, number], count: number, speed = 3): void {
    const c = new THREE.Color().setRGB(...colour);
    for (let i = 0; i < count; i++) {
      this.spawn({
        pos: at.clone().add(new THREE.Vector3(THREE.MathUtils.randFloat(-0.3, 0.3), THREE.MathUtils.randFloat(-0.3, 0.3), 0)),
        vel: new THREE.Vector3(THREE.MathUtils.randFloat(-1, 1) * speed, THREE.MathUtils.randFloat(0.5, 1.5) * speed, THREE.MathUtils.randFloat(0, 1.5)),
        life: THREE.MathUtils.randFloat(0.35, 0.6),
        size: THREE.MathUtils.randFloat(0.07, 0.13),
        colour: c,
        gravity: 20,
        spin: THREE.MathUtils.randFloat(-10, 10),
      });
    }
  }

  /** A fading afterimage of a trowel blade. */
  ghost(at: THREE.Vector3, angle: number): void {
    this.spawn({ pos: at.clone(), life: 0.16, size: 0.24, colour: new THREE.Color().setRGB(0.75, 0.85, 1), glow: 1.5, stretch: 1.7, spin: 0, vel: new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(1e-4) });
  }

  update(dt: number, globs: readonly Glob[]): void {
    let n = 0;
    const colour = this.cubes.mesh.instanceColor!;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const t = 1 - p.age / p.life;
      const size = p.size * t;
      const angle = p.stretch > 1 ? Math.atan2(p.vel.y, p.vel.x) : p.spin * p.age + (p.spin === 0 && p.stretch === 1 ? Math.PI / 4 : 0);
      this.q.setFromAxisAngle(this.axis, angle);
      this.s.set(size * p.stretch, size, p.stretch > 1 ? size : size * 0.3);
      this.m.compose(p.pos, this.q, this.s);
      this.cubes.mesh.setMatrixAt(n, this.m);
      this.cubes.mesh.setColorAt(n, p.colour);
      this.cubes.glow.setX(n, p.glow * 0.35);
      n++;
    }
    this.cubes.mesh.count = n;
    this.cubes.mesh.instanceMatrix.needsUpdate = true;
    colour.needsUpdate = true;
    this.cubes.glow.needsUpdate = true;
    this.drawGlobs(globs);
  }

  /** Wriggling, pulsing jelly stream, stretched along the flight line (MortarMixer::DrawGlobs). */
  private drawGlobs(globs: readonly Glob[]): void {
    let n = 0;
    const pos = new THREE.Vector3();
    for (const g of globs) {
      if (n >= GLOB_CAPACITY) break;
      let x = g.pos.x;
      let y = g.pos.y;
      if (g.droplet) {
        const s = g.size * Math.min(1, Math.max(0, g.remaining / g.life));
        this.s.set(s, s, s);
        this.q.identity();
      } else {
        const len = Math.hypot(g.vel.x, g.vel.y) || 1;
        const dx = g.vel.x / len;
        const dy = g.vel.y / len;
        const wiggle = Math.sin(g.age * 30 + g.phase) * 0.07;
        x += -dy * wiggle;
        y += dx * wiggle;
        const pop = Math.min(1, Math.max(0.4, g.age / 0.05));
        const pulse = 1 + 0.2 * Math.sin(g.age * 40 + g.phase);
        const d = g.size * pop * pulse;
        this.s.set(1.5 * d, 0.9 * d, 0.8 * d);
        this.q.setFromAxisAngle(this.axis, Math.atan2(-dy, dx));
      }
      pos.set(x, -y, ACTOR_Z + 0.18);
      this.m.compose(pos, this.q, this.s);
      this.globs.mesh.setMatrixAt(n, this.m);
      this.globs.mesh.setColorAt(n, g.foam ? FOAM : MORTAR);
      this.globs.glow.setX(n, g.foam ? 0.14 : 0);
      n++;
    }
    this.globs.mesh.count = n;
    this.globs.mesh.instanceMatrix.needsUpdate = true;
    if (this.globs.mesh.instanceColor) this.globs.mesh.instanceColor.needsUpdate = true;
    this.globs.glow.needsUpdate = true;
  }
}
