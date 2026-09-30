import { Sprites, type SpriteDef } from '../data/sprites';
import { Race } from '../sim/config';
import { clamp, lerp } from '../sim/math';
import type { RaceSite } from '../sim/race';

/** Arcade resolution: the canvas is this tall and CSS scales it up with hard pixels. */
const H = 240;
const HORIZON = H * 0.4;
/** Projection scale in pixels, as a share of the height so every aspect sees the same road. */
const LENS = H * 0.62;

type Rgb = [number, number, number];

const srgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** One canvas pixel per sprite pixel; drawn scaled with smoothing off. */
function paint(rows: readonly string[], colours: Record<string, Rgb>): HTMLCanvasElement {
  const width = Math.max(...rows.map(row => row.length));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = rows.length;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(width, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const colour = colours[row[x]];
      if (colour) image.data.set([...colour, 255], (y * width + x) * 4);
    }
  });
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Sprite palettes are linear, as authored in Unreal. */
const spriteColours = (sprite: SpriteDef): Record<string, Rgb> =>
  Object.fromEntries(sprite.palette.map(entry => [entry.key, entry.rgb.map(srgb) as Rgb]));

// The front seats from behind: the blond friend drives, Don Jr. rides with his hands over his eyes.
const FRIEND = [
  '     YYYYYY     ',
  '   YYYYYYYYYY   ',
  '  YYYyYYYYyYYY  ',
  ' YYYYYYYyYYYYYY ',
  ' YYyYYYYYYYYyYY ',
  'YYYYYYyYYYYYYYYY',
  'YYYYYYYYYYYyYYYY',
  'YSYYyYYYYYYYYYSY',
  'YSYYYYYYYYyYYYSY',
  'YYYYYYYYYYYYYYYY',
  'YYYyYYYYYYYYyYYY',
  ' YYYYYYyYYYYYYY ',
  ' YYYYSSSSSSYYYY ',
  'BBYYYSSSSSSYYYBB',
  'BBBBBBBBBBBBBBBB',
  'BBBBBBBBBBBBBBBB',
];
const FRIEND_COLOURS = { Y: hex('#f5d56a'), y: hex('#c9a13e'), S: hex('#f2c29a'), B: hex('#2f8f9d') };

const DON_JR = [
  '       AAAAAA       ',
  '     AAAAAAAAAA     ',
  '    AAAaAAAAaAAA    ',
  '    AAAAAAAAAAAA    ',
  '   AAaAAAAAAAAaAA   ',
  '  SSAAAAAAAAAAAASS  ',
  '  SSAAAAAAaAAAAASS  ',
  ' FFSAAAAAAAAAAAASFF ',
  'FFF AAAAAAAAAAAA FFF',
  'FFF  AAAAAAAAAA  FFF',
  ' FFF  SSSSSSSS  FFF ',
  '  FFF SSSSSSSS FFF  ',
  '   FFFFFFFFFFFFFF   ',
  '  FFFPFFFFFFFFPFFF  ',
  ' FFFFPFFFFFFFFPFFFF ',
  ' FFFFPFFFFFFFFPFFFF ',
];

const BRICK = ['RRRRMRRRR', 'RRRRMRRRR', 'MMMMMMMMM', 'RRMRRRRMR', 'RRMRRRRMR'];
const BRICK_COLOURS = { R: hex('#b5452c'), M: hex('#d8cfc0') };

interface Projected {
  x: number;
  y: number;
  /** Half the road width in pixels. */
  w: number;
  scale: number;
}

interface Placed {
  rel: number;
  worldX: number;
  image: HTMLCanvasElement;
  size: number;
  lift: number;
  flip: boolean;
  alpha: number;
  spin: number;
}

/** Draws Level 7 on its own 2D canvas: a pseudo-3D road (segment projection, back to front) and the cockpit. */
export class RaceView {
  private readonly context: CanvasRenderingContext2D;
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private readonly friend = paint(FRIEND, FRIEND_COLOURS);
  private readonly jr: HTMLCanvasElement;
  private readonly brick = paint(BRICK, BRICK_COLOURS);
  private width = 320;
  private clock = 0;
  private sky = 0;
  private camX = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
    const jr = spriteColours(Sprites.characters.DonJr);
    this.jr = paint(DON_JR, { ...jr, a: jr.A.map(c => Math.round(c * 0.72)) as Rgb });
  }

  private sprite(name: string): HTMLCanvasElement {
    let image = this.sprites.get(name);
    if (!image) {
      const sprite = Sprites.characters[name];
      image = paint(sprite.rows, spriteColours(sprite));
      this.sprites.set(name, image);
    }
    return image;
  }

  /** Letterboxed between square and 16:9; wider screens get more desert, never a stretched road. */
  private fit(): void {
    const aspect = clamp((this.canvas.clientWidth || 1) / (this.canvas.clientHeight || 1), 1, 16 / 9);
    const width = Math.round(H * aspect);
    if (width !== this.canvas.width || this.canvas.height !== H) {
      this.canvas.width = width;
      this.canvas.height = H;
    }
    this.width = width;
    this.context.imageSmoothingEnabled = false;
  }

  private project(rel: number, worldX: number): Projected {
    const scale = Race.cameraDepth / rel;
    return {
      x: this.width / 2 + scale * (worldX - this.camX) * LENS,
      y: HORIZON + scale * Race.cameraHeight * LENS,
      w: scale * Race.roadWidth * LENS,
      scale,
    };
  }

  render(race: RaceSite, dt: number): void {
    this.fit();
    this.clock += dt;
    this.sky += race.curveAt(race.position) * race.speedRatio * dt * 12;
    const context = this.context;
    const shake = race.crash > 0 ? Math.max(0, 1 - race.crash / 1.2) : 0;
    this.camX = race.playerX * Race.roadWidth + Math.sin(race.crash * 8) * 800 * shake;
    context.save();
    context.translate(Math.round(Math.sin(race.crash * 60) * 5 * shake), Math.round(Math.cos(race.crash * 47) * 3 * shake));
    this.drawSky();
    const segX = this.drawRoad(race);
    this.drawSprites(race, segX);
    this.drawHood();
    this.drawSplat(race);
    this.drawCabin(race);
    context.restore();
    if (shake > 0) {
      context.fillStyle = `rgba(255, 60, 30, ${0.5 * shake})`;
      context.fillRect(0, 0, this.width, H);
    }
  }

  private drawSky(): void {
    const context = this.context;
    const W = this.width;
    const gradient = context.createLinearGradient(0, 0, 0, HORIZON);
    gradient.addColorStop(0, '#2f8fd8');
    gradient.addColorStop(1, '#f6c27a');
    context.fillStyle = gradient;
    context.fillRect(0, 0, W, HORIZON + 1);
    context.fillStyle = '#fff1b0';
    context.beginPath();
    context.arc(W * 0.78, H * 0.14, 10, 0, Math.PI * 2);
    context.fill();
    const ridge = (colour: string, offset: number, height: (u: number) => number) => {
      context.fillStyle = colour;
      context.beginPath();
      context.moveTo(0, HORIZON + 1);
      for (let x = 0; x <= W; x += 4) context.lineTo(x, HORIZON - height(x + offset));
      context.lineTo(W, HORIZON + 1);
      context.fill();
    };
    ridge('#9a5a4a', this.sky * 0.5, u => 22 + 9 * Math.sin(u * 0.021) + 5 * Math.sin(u * 0.057 + 1));
    ridge('#6e3b30', this.sky, u => 10 + 6 * Math.sin(u * 0.033 + 2) + 3 * Math.sin(u * 0.09));
  }

  private quad(a: Projected, b: Projected, centreA: number, centreB: number, halfA: number, halfB: number, colour: string): void {
    const context = this.context;
    context.fillStyle = colour;
    context.beginPath();
    context.moveTo(a.x + centreA - halfA, a.y);
    context.lineTo(b.x + centreB - halfB, b.y);
    context.lineTo(b.x + centreB + halfB, b.y);
    context.lineTo(a.x + centreA + halfA, a.y);
    context.fill();
  }

  /** Returns each visible segment's sideways offset in world units, for placing sprites along the curve. */
  private drawRoad(race: RaceSite): number[] {
    const context = this.context;
    const W = this.width;
    const length = Race.segmentLength;
    const base = Math.floor(race.position / length);
    const fraction = (race.position - base * length) / length;
    const finish = Math.floor(race.finishZ / length);
    context.fillStyle = '#d9b26b';
    context.fillRect(0, HORIZON, W, H - HORIZON);
    const segX: number[] = [];
    let x = 0;
    let dx = -(race.curves[base] ?? 0) * fraction;
    let maxY = H;
    for (let n = 0; n <= Race.drawDistance; n++) {
      const index = base + n;
      const near = index * length - race.position;
      segX[n] = x;
      const nextX = x + dx;
      x = nextX;
      dx += race.curves[index] ?? 0;
      if (near + length <= 1) continue;
      const a = this.project(Math.max(near, 30), segX[n]);
      const b = this.project(near + length, nextX);
      if (b.y >= maxY) continue;
      const band = Math.floor(index / 3) % 2 === 0;
      context.fillStyle = band ? '#d9b26b' : '#c99a55';
      context.fillRect(0, b.y, W, a.y - b.y + 1);
      this.quad(a, b, 0, 0, a.w * 1.15, b.w * 1.15, band ? '#c0392b' : '#f4ecd8');
      this.quad(a, b, 0, 0, a.w, b.w, band ? '#6b6b6b' : '#636363');
      if (index === finish || index === finish + 1 || index === 3 || index === 4) {
        // Chequered start and finish lines.
        for (let k = 0; k < 8; k++) {
          if ((k + index) % 2) continue;
          const offset = (k + 0.5) / 4 - 1;
          this.quad(a, b, offset * a.w, offset * b.w, a.w / 8, b.w / 8, '#f4ecd8');
        }
      } else if (band) {
        for (const lane of [-1 / 3, 1 / 3]) this.quad(a, b, lane * a.w, lane * b.w, a.w * 0.025, b.w * 0.025, '#f4ecd8');
      }
      maxY = b.y;
    }
    segX[Race.drawDistance + 1] = x;
    return segX;
  }

  private drawSprites(race: RaceSite, segX: number[]): void {
    const length = Race.segmentLength;
    const base = Math.floor(race.position / length);
    const far = Race.drawDistance * length;
    const finish = Math.floor(race.finishZ / length);
    const offsetAt = (rel: number) => {
      const n = (race.position + rel) / length - base;
      const k = clamp(Math.floor(n), 0, Race.drawDistance);
      return lerp(segX[k], segX[k + 1] ?? segX[k], n - k);
    };
    const items: Placed[] = [];
    const place = (rel: number, across: number, image: HTMLCanvasElement, extra: Partial<Placed> = {}) => {
      if (rel < 400 || rel > far) return;
      items.push({ rel, worldX: offsetAt(rel) + across * Race.roadWidth, image, size: 1, lift: 0, flip: false, alpha: 1, spin: 0, ...extra });
    };

    for (let n = 1; n < Race.drawDistance; n++) {
      const index = base + n;
      const rel = index * length - race.position;
      if (index % 10 === 0) place(rel, (index % 20 === 0 ? -1 : 1) * 1.5, this.sprite('Cactus'), { size: 1.4 });
      if (index % 45 === 22) place(rel, (index % 90 === 22 ? 1 : -1) * 1.9, this.sprite('CactusAmigo'), { size: 1.2 });
      if (index === finish) {
        for (const side of [-1.25, 1.25]) place(rel, side, this.sprite('Flag'), { size: 1.6, flip: side > 0 });
        const banner = this.sprite('PapelPicado');
        place(rel, 0, banner, { size: (2.3 * Race.roadWidth) / banner.width / Race.spriteUnit, lift: 1700 });
      }
    }
    for (const enemy of race.enemies) {
      const hit = enemy.hit >= 0 ? enemy.hit : 0;
      const hop = enemy.hop > 0 ? Math.sin(Math.min(1, enemy.hop / 0.5) * Math.PI) * 700 : 0;
      place(enemy.z - race.position, enemy.x, this.sprite(enemy.kind), {
        size: enemy.kind === 'Luchador' ? 1.2 : 1,
        lift: hop + hit * 4000,
        flip: enemy.x > 0,
        alpha: 1 - hit / Race.hitTime,
        spin: hit * 12,
      });
    }
    for (const can of race.cans) {
      const t = Math.min(1, can.age / Race.canFlight);
      place(can.rel, can.x, this.sprite('Can'), { size: 1.1, lift: 900 + 2200 * 4 * t * (1 - t), spin: can.age * 10 });
    }
    for (const brick of race.bricks) {
      const t = Math.min(1, brick.age / Race.brickLife);
      place(brick.z - race.position, brick.x, this.brick, { size: 1.4, lift: 300 + 800 * Math.sin(t * Math.PI), spin: brick.age * 4 });
    }

    const context = this.context;
    items.sort((a, b) => b.rel - a.rel);
    for (const item of items) {
      const p = this.project(item.rel, item.worldX);
      const unit = p.scale * LENS * Race.spriteUnit * item.size;
      const w = item.image.width * unit;
      const h = item.image.height * unit;
      if (w < 0.5 || item.alpha <= 0) continue;
      context.save();
      context.globalAlpha = item.alpha;
      context.translate(p.x, p.y - h / 2 - item.lift * p.scale * LENS);
      if (item.spin) context.rotate(item.spin);
      if (item.flip) context.scale(-1, 1);
      context.drawImage(item.image, -w / 2, -h / 2, w, h);
      context.restore();
    }
  }

  private drawHood(): void {
    const context = this.context;
    const centre = this.width / 2;
    const top = H * 0.76;
    context.fillStyle = '#b3261e';
    context.beginPath();
    context.moveTo(centre - this.width * 0.42, H);
    context.lineTo(centre - this.width * 0.2, top);
    context.lineTo(centre + this.width * 0.2, top);
    context.lineTo(centre + this.width * 0.42, H);
    context.fill();
    context.fillStyle = '#e0503f';
    context.fillRect(centre - this.width * 0.2, top, this.width * 0.4, 1);
    context.fillStyle = '#f4ecd8';
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(centre + side * 4, top);
      context.lineTo(centre + side * 7, top);
      context.lineTo(centre + side * 16, H);
      context.lineTo(centre + side * 9, H);
      context.fill();
    }
  }

  /** A can of pop across the windshield: the "I can't see!!" moment. */
  private drawSplat(race: RaceSite): void {
    if (race.splat <= 0) return;
    const context = this.context;
    let seed = race.splatSeed + 1;
    const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const drip = (Race.splatTime - race.splat) * H * 0.08;
    context.save();
    context.globalAlpha = Math.min(1, race.splat / 0.6) * 0.95;
    for (let i = 0; i < 9; i++) {
      const x = this.width * (0.2 + 0.6 * next());
      const y = H * (0.2 + 0.5 * next());
      const r = H * (0.05 + 0.08 * next());
      context.fillStyle = '#5a3418';
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fill();
      context.fillRect(x - r * 0.25, y, r * 0.35, r * 0.6 + drip * (0.5 + next()));
      context.fillStyle = '#7a4a22';
      context.beginPath();
      context.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private bubble(text: string, x: number, y: number): void {
    const context = this.context;
    context.font = 'bold 8px ui-monospace, Menlo, Consolas, monospace';
    const w = Math.ceil(context.measureText(text).width) + 6;
    const left = Math.round(clamp(x - w / 2, 2, this.width - w - 2));
    context.fillStyle = '#120b09';
    context.fillRect(left - 1, y - 12, w + 2, 14);
    context.beginPath();
    context.moveTo(x - 3, y + 1);
    context.lineTo(x + 3, y + 1);
    context.lineTo(x, y + 6);
    context.fill();
    context.fillStyle = '#f4ecd8';
    context.fillRect(left, y - 11, w, 12);
    context.fillStyle = '#120b09';
    context.fillText(text, left + 3, y - 2);
  }

  private drawCabin(race: RaceSite): void {
    const context = this.context;
    const W = this.width;
    const lean = clamp(-race.curveAt(race.position) * race.speedRatio * 1.5 + race.steer * 1.5, -4, 4);
    const bob = Math.round(Math.sin(this.clock * 22) * race.speedRatio * 1.2);
    context.fillStyle = '#2b2320';
    context.fillRect(0, H * 0.83, W, H * 0.17);
    context.fillStyle = '#4a3b35';
    context.fillRect(0, H * 0.83, W, 2);

    // Steering wheel, turning with the input, hands at ten and two.
    const driverX = W / 2 - 52 + lean;
    const wheelY = H * 0.9;
    const turn = race.steer * 0.5 + lean * 0.05;
    context.strokeStyle = '#161211';
    context.lineWidth = 5;
    context.beginPath();
    context.arc(driverX, wheelY, 26, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = '#f2c29a';
    for (const angle of [-Math.PI + 0.5, -0.5]) {
      context.fillRect(Math.round(driverX + 26 * Math.cos(angle + turn)) - 3, Math.round(wheelY + 26 * Math.sin(angle + turn)) - 2, 7, 5);
    }

    context.drawImage(this.friend, Math.round(driverX - 24), H - 45 + bob, 48, 48);
    const panic = race.splat > 0 ? Math.round(Math.sin(this.clock * 40) * 2) : 0;
    const jrX = W / 2 + 52 + lean * 0.7;
    context.drawImage(this.jr, Math.round(jrX - 30) + panic, H - 45 + bob, 60, 48);

    // Windshield frame and mirror.
    context.fillStyle = '#1a1210';
    context.fillRect(0, 0, W, 6);
    for (const side of [0, W]) {
      const inward = side === 0 ? 1 : -1;
      context.beginPath();
      context.moveTo(side, 0);
      context.lineTo(side + inward * 18, 0);
      context.lineTo(side, H * 0.8);
      context.fill();
    }
    context.fillRect(W / 2 - 22, 6, 44, 9);
    context.fillStyle = '#3f5a6e';
    context.fillRect(W / 2 - 20, 7, 40, 6);

    const cycle = this.clock % 9;
    if (race.splat > 0 || cycle < 2) this.bubble("I CAN'T SEE!!", jrX, H - 50);
    else if (cycle > 2.3 && cycle < 4.3) this.bubble('I GOT THE WHEEL!', driverX, H - 50);
  }
}
