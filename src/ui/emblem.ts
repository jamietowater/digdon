/**
 * The Don & Mortar neon emblem: a brick arch, Don's hard hat, and a trowel, as glowing tubes on a 200 x 200 grid.
 * One definition feeds the animated intro (SVG, below) and the iOS launch image (tools/brand.mjs rasterises it).
 */

type Point = [number, number];

export interface Tube {
  /** Animation and draw order: tubes in the same group switch on together. */
  group: number;
  colour: string;
  points: Point[];
  closed?: boolean;
}

function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 32): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  });
}

const ORANGE = '#ff6a10';
const YELLOW = '#ffd21f';
const TEAL = '#4fd8e8';

/** Brick arch with its keystone joints, like a storefront doorway (brick and mortar). */
const archJoints: Tube[] = [150, 120, 90, 60, 30].map(angle => {
  const [[x1, y1]] = arc(100, 92, 62, angle, angle, 1);
  const [[x2, y2]] = arc(100, 92, 74, angle, angle, 1);
  return { group: 0, colour: ORANGE, points: [[x1, y1], [x2, y2]] };
});

export const TUBES: Tube[] = [
  { group: 0, colour: ORANGE, points: [[38, 168], ...arc(100, 92, 62, 180, 0), [162, 168]] },
  { group: 0, colour: ORANGE, points: [[26, 168], ...arc(100, 92, 74, 180, 0), [174, 168]] },
  ...archJoints,
  // Hard hat: dome, ridge and brim.
  { group: 1, colour: YELLOW, points: arc(100, 122, 34, 180, 0) },
  { group: 1, colour: YELLOW, points: [[100, 88], [100, 104]] },
  { group: 1, colour: YELLOW, points: [[56, 122], [144, 122]] },
  // Trowel: handle, shank, and a diamond blade.
  { group: 2, colour: TEAL, points: [[62, 160], [86, 148]] },
  { group: 2, colour: TEAL, points: [[86, 148], [96, 144]] },
  { group: 2, colour: TEAL, points: [[96, 144], [118, 133], [142, 144], [118, 155]], closed: true },
];

const path = (tube: Tube) =>
  'M' + tube.points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + (tube.closed ? ' Z' : '');

/**
 * Inline SVG: each tube is a blurred halo plus a bright core, tagged by group for the switch-on animation. The glow
 * filter covers the whole emblem: sized to each path, WebKit clips straight tubes into visible boxes.
 */
export function emblemSvg(): string {
  const tubes = TUBES.map(tube => `<g class="tube g${tube.group}" style="--c:${tube.colour}">` +
    `<path d="${path(tube)}" class="halo"/><path d="${path(tube)}" class="core"/></g>`).join('');
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><defs><filter id="neon" filterUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240">` +
    `<feGaussianBlur stdDeviation="5"/></filter></defs>${tubes}</svg>`;
}
