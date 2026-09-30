/** 5 x 7 block letters for big headings, from the Unreal HUD ('#' is a filled block). */
const GLYPHS: Record<string, string[]> = {
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.####'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
};

/** Draws text as solid gold pixel blocks with a drop shadow; unknown letters and spaces leave a gap. */
export function drawBlockText(canvas: HTMLCanvasElement, text: string, block = 8): void {
  const letters = text.toUpperCase().split('');
  const widthBlocks = letters.length * 6 - 1;
  const shadow = Math.max(2, Math.round(block * 0.3));
  canvas.width = widthBlocks * block + shadow;
  canvas.height = 7 * block + shadow;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const [offset, colour] of [[shadow, '#733312'], [0, '#ffd95a']] as const) {
    ctx.fillStyle = colour;
    letters.forEach((ch, l) => {
      const glyph = GLYPHS[ch];
      if (!glyph) return;
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row][col] === '#') ctx.fillRect((l * 6 + col) * block + offset, row * block + offset, block, block);
        }
      }
    });
  }
}

export function toRoman(value: number): string {
  const table: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [n, s] of table) {
    while (value >= n) {
      out += s;
      value -= n;
    }
  }
  return out;
}
