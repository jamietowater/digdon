import * as THREE from 'three';
import type { PaletteEntry, SpriteDef } from '../data/sprites';

const BOX = new THREE.BoxGeometry(1, 1, 1);

/**
 * One shared lit material for every voxel. Colour comes from instanceColor; a per-instance glow attribute adds
 * emissive light in the same colour (Unreal's Surfaces::Glow), so fire, beams and pickups still shine.
 */
export const voxelMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
voxelMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float instanceGlow;\nvarying float vGlow;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = instanceGlow;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vGlow;')
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;',
    );
};

/** Glow values authored for Unreal's bloom are much hotter than a plain emissive add wants. */
const GLOW_SCALE = 0.35;

export interface VoxelMesh {
  mesh: THREE.InstancedMesh;
  /** Palette index of every instance, for re-tinting. */
  keys: Uint8Array;
  glow: THREE.InstancedBufferAttribute;
}

/** Instanced cubes with a per-instance colour and glow; used for sprites and for effects. */
export function createVoxelInstances(capacity: number): VoxelMesh {
  const geometry = BOX.clone();
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  glow.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceGlow', glow);
  const mesh = new THREE.InstancedMesh(geometry, voxelMaterial, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color());
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  return { mesh, keys: new Uint8Array(capacity), glow };
}

/**
 * Builds a voxel sprite from pixel rows: one cube per pixel, centred on the origin and facing +x (screen right).
 * Port of DigVisuals::BuildVoxelSprite, but as a single instanced mesh with per-instance colour.
 */
export function buildVoxelSprite(sprite: SpriteDef, pixelSize: number, rows = sprite.rows): VoxelMesh {
  const cells: { col: number; row: number; key: number }[] = [];
  const keyIndex = new Map(sprite.palette.map((p, i) => [p.key, i]));
  for (let row = 0; row < sprite.height; row++) {
    const line = rows[row] ?? '';
    for (let col = 0; col < sprite.width && col < line.length; col++) {
      const key = keyIndex.get(line[col]);
      if (key !== undefined) cells.push({ col, row, key });
    }
  }
  const voxels = createVoxelInstances(cells.length);
  const m = new THREE.Matrix4();
  cells.forEach((c, i) => {
    m.makeScale(pixelSize, pixelSize, pixelSize);
    m.setPosition((c.col - (sprite.width - 1) * 0.5) * pixelSize, ((sprite.height - 1) * 0.5 - c.row) * pixelSize, 0);
    voxels.mesh.setMatrixAt(i, m);
    voxels.keys[i] = c.key;
  });
  tintVoxels(voxels, sprite.palette);
  voxels.mesh.castShadow = true;
  voxels.mesh.computeBoundingSphere();
  return voxels;
}

const tmp = new THREE.Color();

/** Recolours every instance from its palette entry; colours are linear, as authored in Unreal. */
export function tintVoxels(
  voxels: VoxelMesh,
  palette: readonly PaletteEntry[],
  colour: (entry: PaletteEntry, index: number) => [number, number, number] = (e) => e.rgb,
  glow: (entry: PaletteEntry, index: number) => number = (e) => e.glow,
): void {
  for (let i = 0; i < voxels.mesh.count; i++) {
    const k = voxels.keys[i];
    const [r, g, b] = colour(palette[k], k);
    voxels.mesh.setColorAt(i, tmp.setRGB(r, g, b));
    voxels.glow.setX(i, glow(palette[k], k) * GLOW_SCALE);
  }
  voxels.mesh.instanceColor!.needsUpdate = true;
  voxels.glow.needsUpdate = true;
}
