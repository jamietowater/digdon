export interface Vec2 {
  x: number;
  y: number;
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const toCell = (p: Vec2): Vec2 => ({ x: Math.round(p.x), y: Math.round(p.y) });
export const sameCell = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Swappable so tests can make the simulation deterministic. */
export let random: () => number = Math.random;
export function setRandom(fn: () => number): void {
  random = fn;
}
export const randRange = (lo: number, hi: number): number => lo + (hi - lo) * random();
export const randInt = (n: number): number => Math.floor(random() * n);

/** Small seeded generator for tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
