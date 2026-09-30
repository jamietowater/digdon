import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Cell, type Grid } from '../sim/grid';

const STRATA: [number, number, number][] = [
  [0.85, 0.55, 0.2], // ochre topsoil
  [0.7, 0.3, 0.12], // rust clay
  [0.45, 0.16, 0.2], // deep maroon
  [0.2, 0.12, 0.3], // mantle violet
];
const CHIPS: [number, number][] = [
  [-2, 2],
  [2, 2],
  [0, -2],
];

const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Terrain view (the visual half of ADigGrid): full-size soft toy blocks coloured by depth band, dark chip dots on
 * the camera face, bedrock, a near-black back wall so dug tunnels read as cavities, and brick courses on mortar.
 */
export class GridView {
  readonly group = new THREE.Group();
  private readonly strata: THREE.InstancedMesh[] = [];
  private readonly chips: THREE.InstancedMesh;
  private readonly brickMortar: THREE.InstancedMesh;
  private readonly brickCourses: THREE.InstancedMesh;
  /** Per cell: [band, instance] of its dirt block, or -1. */
  private readonly dirtSlot: Int32Array;
  private readonly dirtBand: Int8Array;
  private readonly brickSlot: Int32Array;
  private readonly chipBase: Int32Array;
  private freeBricks: number[] = [];
  private brickCount = 0;
  private readonly m = new THREE.Matrix4();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly grid: Grid) {
    const n = grid.width * grid.height;
    this.dirtSlot = new Int32Array(n).fill(-1);
    this.dirtBand = new Int8Array(n).fill(-1);
    this.brickSlot = new Int32Array(n).fill(-1);
    this.chipBase = new Int32Array(n).fill(-1);

    const block = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
    const cube = new THREE.BoxGeometry(1, 1, 1);
    this.disposables.push(block, cube);
    const mat = (c: THREE.Color, rough = 0.95, metal = 0, emissive = 0) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
      if (emissive > 0) m.emissive = c.clone().multiplyScalar(emissive);
      this.disposables.push(m);
      return m;
    };

    const counts = [0, 0, 0, 0];
    let bedrock = 0;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const c = grid.get(x, y);
        if (c === Cell.Dirt) counts[grid.depthBand(y)]++;
        if (c === Cell.Bedrock) bedrock++;
      }
    }

    for (let b = 0; b < 4; b++) {
      const mesh = new THREE.InstancedMesh(block, mat(lin(...STRATA[b])), Math.max(1, counts[b]));
      mesh.count = 0;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.strata.push(mesh);
      this.group.add(mesh);
    }
    const bedrockMesh = new THREE.InstancedMesh(block, mat(lin(0.06, 0.06, 0.08), 0.5, 0.2, 0.15), Math.max(1, bedrock));
    bedrockMesh.count = 0;
    bedrockMesh.receiveShadow = true;
    const backdrop = new THREE.InstancedMesh(cube, mat(lin(0.035, 0.02, 0.03), 1), n);
    backdrop.count = 0;
    backdrop.receiveShadow = true;
    this.chips = new THREE.InstancedMesh(cube, mat(lin(0.16, 0.09, 0.05), 1), Math.max(1, n * CHIPS.length));
    this.chips.count = 0;
    this.brickMortar = new THREE.InstancedMesh(cube, mat(lin(0.78, 0.76, 0.7), 0.9), n);
    this.brickMortar.count = 0;
    this.brickMortar.frustumCulled = false;
    this.brickMortar.receiveShadow = true;
    this.brickCourses = new THREE.InstancedMesh(block, mat(lin(0.72, 0.26, 0.16), 0.85), n * 2);
    this.brickCourses.count = 0;
    this.brickCourses.frustumCulled = false;
    this.brickCourses.castShadow = true;
    this.brickCourses.receiveShadow = true;
    this.group.add(bedrockMesh, backdrop, this.chips, this.brickMortar, this.brickCourses);

    const pixel = 1 / 8;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (y > 0) {
          this.m.makeTranslation(x, -y, -1);
          backdrop.setMatrixAt(backdrop.count++, this.m);
        }
        const c = grid.get(x, y);
        const i = grid.index(x, y);
        if (c === Cell.Dirt) {
          const band = grid.depthBand(y);
          const mesh = this.strata[band];
          this.m.makeTranslation(x, -y, 0);
          this.dirtSlot[i] = mesh.count;
          this.dirtBand[i] = band;
          mesh.setMatrixAt(mesh.count++, this.m);
          this.chipBase[i] = this.chips.count;
          for (const [dx, dy] of CHIPS) {
            this.m.makeScale(pixel, pixel, 0.034).setPosition(x + dx * pixel, -y + dy * pixel, 0.5);
            this.chips.setMatrixAt(this.chips.count++, this.m);
          }
        } else if (c === Cell.Bedrock) {
          this.m.makeTranslation(x, -y, 0);
          bedrockMesh.setMatrixAt(bedrockMesh.count++, this.m);
        } else if (c === Cell.Brick) {
          this.showBrick(x, y);
        }
      }
    }
    for (const mesh of [...this.strata, bedrockMesh, backdrop, this.chips]) mesh.instanceMatrix.needsUpdate = true;
    grid.listeners.push((x, y, type) => this.onCellChanged(x, y, type));
  }

  private onCellChanged(x: number, y: number, type: Cell): void {
    const i = this.grid.index(x, y);
    if (type !== Cell.Dirt && this.dirtSlot[i] >= 0) {
      // Zero-scale rather than remove, so the other cells' instance indices stay stable.
      const mesh = this.strata[this.dirtBand[i]];
      mesh.setMatrixAt(this.dirtSlot[i], HIDDEN);
      mesh.instanceMatrix.needsUpdate = true;
      const chipBase = this.chipIndex(i);
      if (chipBase >= 0) {
        for (let k = 0; k < CHIPS.length; k++) this.chips.setMatrixAt(chipBase + k, HIDDEN);
        this.chips.instanceMatrix.needsUpdate = true;
      }
      this.dirtSlot[i] = -1;
    }
    if (type === Cell.Brick) this.showBrick(x, y);
    else this.hideBrick(x, y);
  }

  /** Chips were added in dirt order, three per dirt cell. */
  private chipIndex(cellIndex: number): number {
    return this.chipBase[cellIndex];
  }

  private showBrick(x: number, y: number): void {
    const i = this.grid.index(x, y);
    if (this.brickSlot[i] >= 0) return;
    const slot = this.freeBricks.pop() ?? this.brickCount++;
    this.brickSlot[i] = slot;
    this.m.makeScale(0.96, 0.96, 0.96).setPosition(x, -y, 0);
    this.brickMortar.setMatrixAt(slot, this.m);
    // Courses sit proud on the camera side of the mortar backing.
    for (const [k, dy] of [[0, 0.23], [1, -0.23]]) {
      this.m.makeScale(0.92, 0.4, 0.3).setPosition(x, -y + dy, 0.34);
      this.brickCourses.setMatrixAt(slot * 2 + k, this.m);
    }
    this.brickMortar.count = Math.max(this.brickMortar.count, slot + 1);
    this.brickCourses.count = Math.max(this.brickCourses.count, slot * 2 + 2);
    this.brickMortar.instanceMatrix.needsUpdate = true;
    this.brickCourses.instanceMatrix.needsUpdate = true;
  }

  private hideBrick(x: number, y: number): void {
    const i = this.grid.index(x, y);
    const slot = this.brickSlot[i];
    if (slot < 0) return;
    this.brickMortar.setMatrixAt(slot, HIDDEN);
    this.brickCourses.setMatrixAt(slot * 2, HIDDEN);
    this.brickCourses.setMatrixAt(slot * 2 + 1, HIDDEN);
    this.brickMortar.instanceMatrix.needsUpdate = true;
    this.brickCourses.instanceMatrix.needsUpdate = true;
    this.freeBricks.push(slot);
    this.brickSlot[i] = -1;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
    for (const child of this.group.children) (child as THREE.InstancedMesh).dispose?.();
  }
}

export function strataColour(band: number): [number, number, number] {
  return STRATA[Math.max(0, Math.min(3, band))];
}
