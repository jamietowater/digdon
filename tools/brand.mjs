// Generates brand art from the game's own pixel sprites: the app icon (iOS + web) and print-ready character files
// for merch (crisp SVG for any size, plus 2048 px PNGs with and without a sticker outline). Run: npm run brand
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(join(root, 'src/data/sprites.json'), 'utf8'));
const { CHARACTERS, BREEDS } = await import(join(root, 'src/data/spriteOverrides.ts'));

// --- Colour -----------------------------------------------------------------------------------------------------

/** Sprite palettes are linear (Unreal); files want sRGB. */
const srgb = c => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.min(1, c), 1 / 2.4) - 0.055));
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

// --- PNG (RGBA) -------------------------------------------------------------------------------------------------

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = buf => {
  let c = ~0;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return ~c >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** grid: rows of [r,g,b,a] | null, scaled by `scale` with nearest-neighbour (pixel art stays crisp). */
function png(grid, scale) {
  const h = grid.length * scale, w = grid[0].length * scale;
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const line = grid[Math.floor(y / scale)];
    for (let x = 0; x < w; x++) {
      const px = line[Math.floor(x / scale)] ?? [0, 0, 0, 0];
      rows.set(px.length === 4 ? px : [...px, 255], y * (w * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** One <rect> per horizontal run of a colour: tiny files that print sharp at any size. */
function svg(grid, title) {
  const h = grid.length, w = grid[0].length;
  const rects = [];
  grid.forEach((line, y) => {
    for (let x = 0; x < w; ) {
      const px = line[x];
      let run = 1;
      while (px && x + run < w && line[x + run] && toHex(line[x + run]) === toHex(px)) run++;
      if (px) rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${toHex(px)}"/>`);
      x += run;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 64}" height="${h * 64}" shape-rendering="crispEdges">` +
    `<title>${title}</title>${rects.join('')}</svg>\n`;
}

// --- Grids ------------------------------------------------------------------------------------------------------

const blank = (w, h) => Array.from({ length: h }, () => Array(w).fill(null));

function spriteGrid(def, pad) {
  const colours = Object.fromEntries(def.palette.map(p => [p.key, p.rgb.map(srgb)]));
  const grid = blank(def.width + pad * 2, def.height + pad * 2);
  def.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (colours[ch]) grid[y + pad][x + pad] = colours[ch]; }));
  return grid;
}

/** Rings every filled pixel's empty neighbours (8-way) with a colour: a cartoon ink line or a sticker border. */
function outline(grid, colour) {
  const out = grid.map(line => [...line]);
  grid.forEach((line, y) => line.forEach((px, x) => {
    if (px) return;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (grid[y + dy]?.[x + dx]) { out[y][x] = colour; return; }
    }
  }));
  return out;
}

const INK = hex('#2a1610');
const STICKER = hex('#ffffff');

// --- App icon: Don, close up ------------------------------------------------------------------------------------

/** A 32 x 32 portrait of Don for the icon, built from shapes so it stays symmetrical; same palette as his sprite. */
function donPortrait() {
  const C = {
    Y: hex('#ffd21f'), y: hex('#e0a400'), h: hex('#fff3a6'), b: hex('#c98a00'),
    S: hex('#ffd2a8'), s: hex('#eba679'), K: hex('#1a0f0b'), W: hex('#ffffff'),
    M: hex('#e8782a'), m: hex('#b9561a'),
    O: hex('#ff6a10'), o: hex('#d24e05'), R: hex('#e6eef2'), B: hex('#2f5d9e'),
    G: hex('#f6f4ec'), T: hex('#d9dde2'), t: hex('#9aa3ad'), w: hex('#8a4b22'),
  };
  const g = blank(32, 32);
  const set = (x, y, k) => { if (x >= 0 && x < 32 && y >= 0 && y < 32) g[y][x] = C[k]; };

  // Shoulders in the safety vest, a blue shirt at the collar, and a reflective stripe.
  for (let y = 23; y < 32; y++) {
    const [a, b] = y === 23 ? [9, 22] : y === 24 ? [6, 25] : [4, 27];
    for (let x = a; x <= b; x++) set(x, y, x <= a + 1 ? 'o' : 'O');
  }
  for (const [y, a, b] of [[23, 13, 18], [24, 14, 17], [25, 15, 16]]) for (let x = a; x <= b; x++) set(x, y, 'B');
  for (let x = 4; x <= 27; x++) { set(x, 28, 'R'); set(x, 29, 'R'); }

  // Face, ears, and shading on the left.
  for (let y = 12; y <= 22; y++) for (let x = 8; x <= 23; x++) {
    if (((x - 15.5) / 7.6) ** 2 + ((y - 15.5) / 7) ** 2 <= 1) set(x, y, x <= 9 ? 's' : 'S');
  }
  for (const [x, y, k] of [[7, 15, 'S'], [7, 16, 's'], [24, 15, 'S'], [24, 16, 'S']]) set(x, y, k);

  // Ginger sideburns, brows, eyes glancing at his trowel, and a small nose (no cartoon-plumber honker).
  for (let y = 12; y <= 15; y++) { set(8, y, 'M'); set(9, y, 'M'); set(22, y, 'M'); set(23, y, 'M'); }
  for (let x = 11; x <= 13; x++) set(x, 13, 'M');
  for (let x = 18; x <= 20; x++) set(x, 13, 'M');
  for (const y of [14, 15]) { set(11, y, 'W'); set(12, y, 'K'); set(19, y, 'W'); set(20, y, 'K'); }
  for (const [x, y] of [[15, 16], [16, 16], [16, 17]]) set(x, y, 's');

  // Full beard and a big toothy grin.
  for (let x = 11; x <= 20; x++) set(x, 18, 'M');
  for (let x = 9; x <= 22; x++) set(x, 19, x >= 13 && x <= 18 ? (x === 13 || x === 18 ? 'K' : 'W') : 'M');
  for (let x = 9; x <= 22; x++) set(x, 20, x >= 14 && x <= 17 ? 'K' : 'M');
  for (let x = 10; x <= 21; x++) set(x, 21, 'M');
  for (let x = 12; x <= 19; x++) set(x, 22, x >= 14 && x <= 17 ? 'm' : 'M');

  // Hard hat: dome with a centre ridge, then a wide brim.
  for (let y = 2; y <= 9; y++) for (let x = 6; x <= 25; x++) {
    if (((x - 15.5) / 9.5) ** 2 + ((y - 10) / 8) ** 2 > 1) continue;
    set(x, y, x === 15 || x === 16 ? 'h' : x <= 8 || y === 9 ? 'y' : 'Y');
  }
  for (let x = 4; x <= 28; x++) set(x, 10, 'b');
  for (let x = 5; x <= 27; x++) set(x, 11, 'b');
  set(12, 4, 'h'); set(11, 5, 'h'); set(12, 5, 'h');

  // Trowel raised in a gloved hand, blade up.
  for (let y = 11; y <= 17; y++) for (let x = 24; x <= 30; x++) {
    const d = Math.abs(x - 27) + Math.abs(y - 14);
    if (d <= 3) set(x, y, x > 27 || y > 15 ? 't' : 'T');
  }
  for (const [x, y, k] of [[27, 18, 't'], [27, 19, 'w'], [26, 20, 'w'], [26, 21, 'w']]) set(x, y, k);
  for (let y = 22; y <= 25; y++) for (let x = 24; x <= 27; x++) set(x, y, 'G');
  return outline(g, INK);
}

/** Teal brick wall behind Don: on brand (brick and mortar) and it pops against the yellow hat. */
function iconBackground() {
  const brick = hex('#1f7a8c'), mortar = hex('#2b91a5'), shade = hex('#186a7a');
  return Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) => {
    if (y % 3 === 2) return mortar;
    if ((x + (Math.floor(y / 3) % 2 ? 3 : 0)) % 6 === 5) return mortar;
    return y % 3 === 1 ? shade : brick;
  }));
}

function icon() {
  const portrait = donPortrait();
  return iconBackground().map((line, y) => line.map((px, x) => portrait[y][x] ?? px));
}

// --- Launch image: the neon emblem on the intro's dark gradient --------------------------------------------------

/** Distance from p to segment ab. */
function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Square launch image; iOS crops it to fill the screen, so the emblem sits well inside the middle third. */
function launchImage(tubes, size = 2732, emblemPx = 900) {
  const centre = hex('#24140e'), edge = hex('#0b0605');
  const scale = emblemPx / 200, origin = (size - emblemPx) / 2;
  const rows = [];
  const segments = tubes.map(t => {
    const pts = t.closed ? [...t.points, t.points[0]] : t.points;
    return { colour: hex(t.colour), segs: pts.slice(1).map((p, i) => [pts[i], p]) };
  });
  for (let y = 0; y < size; y++) {
    const line = new Array(size);
    for (let x = 0; x < size; x++) {
      const r = Math.min(1, Math.hypot(x - size / 2, (y - size * 0.46) * 1.2) / (size * 0.55));
      let px = centre.map((c, i) => c + (edge[i] - c) * r);
      const ux = (x - origin) / scale, uy = (y - origin) / scale;
      if (ux > -20 && ux < 220 && uy > -20 && uy < 220) {
        for (const { colour, segs } of segments) {
          let d = Infinity;
          for (const [a, b] of segs) d = Math.min(d, segmentDistance(ux, uy, a, b));
          const halo = 0.85 * Math.exp(-((d / 5) ** 2));
          const core = Math.max(0, Math.min(1, (1.6 - d) * scale / 2));
          const lit = colour.map(c => c + (255 - c) * 0.6);
          px = px.map((c, i) => Math.min(255, c + colour[i] * halo));
          px = px.map((c, i) => c + (lit[i] - c) * core);
        }
      }
      line[x] = px.map(Math.round);
    }
    rows.push(line);
  }
  return rows;
}

// --- Output -----------------------------------------------------------------------------------------------------

const brand = join(root, 'brand');
const out = (path, data) => {
  mkdirSync(dirname(join(brand, path)), { recursive: true });
  writeFileSync(join(brand, path), data);
};

const art = icon();
out('icon/icon-1024.png', png(art, 32));
out('icon/icon.svg', svg(art, 'App icon'));
writeFileSync(join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), png(art, 32));
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public/apple-touch-icon.png'), png(art, 6)); // 192 px, iOS scales it down
writeFileSync(join(root, 'public/favicon.png'), png(art, 2));

const { TUBES } = await import(join(root, 'src/ui/emblem.ts'));
const launch = png(launchImage(TUBES), 1);
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  writeFileSync(join(root, 'ios/App/App/Assets.xcassets/Splash.imageset', name), launch);
}
out('icon/launch-2732.png', launch);

const portrait = donPortrait().map(line => [null, null, ...line, null, null]);
portrait.unshift(Array(36).fill(null), Array(36).fill(null));
portrait.push(Array(36).fill(null), Array(36).fill(null));
out('characters/don-portrait.svg', svg(portrait, 'Don'));
out('characters/don-portrait.png', png(portrait, 64));
out('characters/don-portrait-sticker.png', png(outline(outline(portrait, STICKER), STICKER), 64));

/** The cast, by file name. Props (cans, flags, cones) stay in the game. */
const merged = { ...raw.characters, ...Object.fromEntries(Object.entries(CHARACTERS).filter(([, v]) => v)) };
const breeds = raw.breeds.map(b => (BREEDS[b.name] ? { ...b, ...BREEDS[b.name] } : b)).filter(b => b.name !== 'UFO' && b.name !== 'Police car');
const cast = {
  don: merged.Don, junior: merged.DonJr, mortar: merged.Raccoon, chili: merged.Chili, 'cactus-pal': merged.CactusPal,
  luchador: merged.Luchador,
  ...Object.fromEntries(breeds.map(b => [b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), b])),
};
for (const [name, def] of Object.entries(cast)) {
  const inked = outline(spriteGrid(def, 4), INK);
  const scale = Math.max(1, Math.floor(2048 / Math.max(inked.length, inked[0].length)));
  out(`characters/${name}.svg`, svg(inked, def.name));
  out(`characters/${name}.png`, png(inked, scale));
  out(`characters/${name}-sticker.png`, png(outline(outline(inked, STICKER), STICKER), scale));
}
// brand/README.md is hand-written; rm -rf brand would remove it.
console.log(`brand/: icon + ${Object.keys(cast).length + 1} characters`);
