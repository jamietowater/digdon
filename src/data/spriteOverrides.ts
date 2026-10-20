import type { BreedDef, PaletteEntry, SpriteDef } from './sprites';

/**
 * Trowelblazer art that replaces or removes sprites from the Unreal export (sprites.json), applied at load so
 * `npm run export-data` can't bring the old art back. Original characters only: Don wears a hard hat and safety
 * vest, Level 5's thrower is Mortar the raccoon, and nothing leans on national or ethnic caricature.
 */

type Rgb = [number, number, number];

/** Palette colours are linear, like the export. */
function pal(key: string, rgb: Rgb, extra: Partial<Omit<PaletteEntry, 'key' | 'rgb'>> = {}): PaletteEntry {
  return { key, rgb, glow: 0, metal: 0, rough: 0.8, ...extra };
}

function sprite(name: string, rows: string[], palette: PaletteEntry[], stride?: string[]): SpriteDef {
  return { name, width: rows[0].length, height: rows.length, rows, palette, ...(stride ? { stride } : {}) };
}

const SKIN = pal('S', [0.98, 0.78, 0.58]);
const EYE = pal('K', [0.04, 0.04, 0.06]);
const GLOVE = pal('G', [0.96, 0.96, 0.93]);
const TROWEL = pal('T', [0.8, 0.82, 0.84], { metal: 1, rough: 0.25 });
const LEATHER = pal('L', [0.29, 0.17, 0.09]);
const BUCKLE = pal('Y', [0.96, 0.76, 0.24], { metal: 1, rough: 0.25 });
const VEST = pal('O', [1, 0.32, 0.02], { rough: 0.7 });
const REFLECTOR = pal('W', [0.85, 0.88, 0.9], { metal: 0.5, glow: 0.6, rough: 0.3 });

const DON_BODY = [
  '   OOOOOOO  ',
  '  OOOOOOOO  ',
  '  WWWWWWWW  ',
  '  GOOOOOOGT ',
  '   OOOOOO T ',
  '   LLYLLL   ',
];

const Don = sprite('Don', [
  '    CCCC    ',
  '   CCCCCC   ',
  '  ccccccccc ',
  '   HHSSSSS  ',
  '   HHSSKSS  ',
  '   HHSSSSSS ',
  '     HHHHH  ',
  ...DON_BODY,
  '   NN  NN   ',
  '   NN  NN   ',
  '  LLL  LLL  ',
], [
  pal('C', [0.98, 0.72, 0.05], { rough: 0.5 }),
  pal('c', [0.8, 0.5, 0.03], { rough: 0.5 }),
  pal('H', [0.87, 0.48, 0.12]),
  SKIN, EYE, VEST, REFLECTOR, GLOVE, TROWEL, LEATHER, BUCKLE,
  pal('N', [0.4, 0.33, 0.2]),
], [
  '    CCCC    ',
  '   CCCCCC   ',
  '  ccccccccc ',
  '   HHSSSSS  ',
  '   HHSSKSS  ',
  '   HHSSSSSS ',
  '     HHHHH  ',
  ...DON_BODY,
  '   NN   NN  ',
  '  NN     NN ',
  ' LLL     LLL',
]);

const JR_HEAD = [
  '    OOOO    ',
  '   OOOOOO   ',
  '  OOOOOOOO  ',
  ' ddddddddddd',
  ' AAAASSSSS  ',
  ' AAAASSKSS  ',
  '  AAASSSSSS ',
  '   AASSSS   ',
];
const JR_BODY = [
  '    FPFF    ',
  '   FFPFFF   ',
  '   PPPPPP   ',
  '   GFPFFGT  ',
  '    FPFF T  ',
  '    LYLL    ',
];

/** Don's son: an orange hard hat over his red hair, so the race view's back-of-head sprite shows it too. */
const DonJr = sprite('DonJr', [...JR_HEAD, ...JR_BODY, '    J  J    ', '   LL  LL   '], [
  pal('O', [1, 0.42, 0.02], { rough: 0.5 }),
  pal('d', [0.75, 0.28, 0.02], { rough: 0.5 }),
  pal('A', [0.85, 0.2, 0.07], { rough: 0.9 }),
  SKIN, EYE,
  pal('F', [0.69, 0.22, 0.17]),
  pal('P', [0.43, 0.11, 0.07]),
  GLOVE, TROWEL, LEATHER, BUCKLE,
  pal('J', [0.23, 0.29, 0.42]),
], [...JR_HEAD, ...JR_BODY, '   J    J   ', '  LL    LL  ']);

/** Mortar, the series villain: a masked trash-panda bandit who flings soda cans at Don's building sites. */
const Raccoon = sprite('Raccoon', [
  '  gg      gg    ',
  ' gEEg    gEEg   ',
  ' gGGGGGGGGGGg   ',
  ' GGGGGGGGGGGG   ',
  'GWWWGGGGGGWWWG  ',
  'GKKKKKKKKKKKKG  ',
  'KKWKKKGGKKKWKK  ',
  'GKKKKGGGGKKKKG  ',
  ' GWWWWWWWWWWG   ',
  '  WWWWKKWWWW    ',
  '   WWWWWWWW     ',
  '    gGGGGg      ',
  '  gGGGGGGGGg    ',
  ' GGGGBBBBGGGG   ',
  'GG GBBBBBBG GG  ',
  'KK GBBBBBBG KK  ',
  '   GBBBBBBG  RR ',
  '   GBBBBBBG KK  ',
  '   GGBBBBGGRR   ',
  '    GGGGGGKK    ',
  '    GG  GG      ',
  '    GG  GG      ',
  '   GGG  GGG     ',
  '  KKKK  KKKK    ',
], [
  pal('g', [0.12, 0.12, 0.13]),
  pal('G', [0.38, 0.38, 0.4]),
  pal('E', [0.85, 0.45, 0.5]),
  pal('W', [0.92, 0.92, 0.9]),
  pal('K', [0.02, 0.02, 0.03]),
  pal('B', [0.65, 0.63, 0.6]),
  pal('R', [0.82, 0.82, 0.8]),
]);

const Chili = sprite('Chili', [
  '     g    ',
  '    gg    ',
  '   gggg   ',
  '  gggggg  ',
  '   RRRR   ',
  '  RKRRKR  ',
  '  RRRRRR  ',
  '  RRKKRR  ',
  '  RRRRRR  ',
  '  rRRRRR  ',
  '   rRRR   ',
  '    RRR   ',
  '     RR   ',
  '      R   ',
], [
  pal('g', [0.15, 0.55, 0.12]),
  pal('R', [0.85, 0.1, 0.08], { rough: 0.35 }),
  pal('r', [1, 0.45, 0.4], { rough: 0.35 }),
  pal('K', [0.03, 0.03, 0.04]),
]);

const CactusPal = sprite('CactusPal', [
  '      ff      ',
  '     fyyf     ',
  '      ff      ',
  '     GGGG     ',
  '     GhGG     ',
  '     KGGK     ',
  '  G  GGGG  G  ',
  '  G  GKKG  G  ',
  '  GG GGGG GG  ',
  '   GGGGGGGG   ',
  '     GhGG     ',
  '     GhGG     ',
  '     GhGG     ',
  '     GhGG     ',
  '     GhGG     ',
  '    gggggg    ',
], [
  pal('f', [0.95, 0.35, 0.6]),
  pal('y', [1, 0.85, 0.2]),
  pal('G', [0.3, 0.62, 0.22]),
  pal('h', [0.5, 0.8, 0.32]),
  pal('g', [0.18, 0.4, 0.14]),
  pal('K', [0.03, 0.03, 0.04]),
]);

const POLE = pal('p', [0.45, 0.3, 0.18]);
const FINIAL = pal('y', [0.95, 0.78, 0.25], { metal: 1, rough: 0.3 });

/** The finish line's chequered flag. */
const Flag = sprite('Flag', [
  'y           ',
  'pKWKWKWKWKWK',
  'pWKWKWKWKWKW',
  'pKWKWKWKWKWK',
  'pWKWKWKWKWKW',
  'pKWKWKWKWKWK',
  'pWKWKWKWKWKW',
  'p           ',
  'p           ',
  'p           ',
  'p           ',
  'p           ',
  'p           ',
  'p           ',
], [FINIAL, POLE, pal('K', [0.04, 0.04, 0.05]), pal('W', [0.95, 0.95, 0.93])]);

/** Level 5's goal: the topping-out flag and sapling builders raise on the highest beam. */
const TopFlag = sprite('TopFlag', [
  'y           ',
  'pOOOOOOOOO  ',
  'pOOOOOOOO   ',
  'pOOOOOOO    ',
  'pOOOOOO     ',
  'pOOOOO      ',
  'pOOOO       ',
  'pOO         ',
  'p     g     ',
  'p    ggg    ',
  'p   ggggg   ',
  'p    ggg    ',
  'p   ggggg   ',
  'p  ggggggg  ',
  'p     w     ',
  'p     w     ',
], [
  FINIAL,
  pal('p', [0.75, 0.75, 0.78], { metal: 1, rough: 0.3 }),
  pal('O', [1, 0.35, 0.02], { glow: 0.3 }),
  pal('g', [0.08, 0.4, 0.12]),
  pal('w', [0.35, 0.2, 0.1]),
]);

const Cone = sprite('Cone', [
  '   OO   ',
  '   OO   ',
  '  WWWW  ',
  '  OOOO  ',
  '  OOOO  ',
  ' WWWWWW ',
  ' OOOOOO ',
  ' OOOOOO ',
  'kkkkkkkk',
  'kkkkkkkk',
], [
  pal('O', [1, 0.3, 0.02], { rough: 0.5 }),
  pal('W', [0.95, 0.95, 0.95], { glow: 0.3, rough: 0.4 }),
  pal('k', [0.1, 0.1, 0.11]),
]);

/** Cans that roll into the mixer can come back out as mortar blobs. */
const Mixer = sprite('Mixer', [
  '   kggk   ',
  '  OOOOOO  ',
  ' OOOOOOOO ',
  'OOGGGGGGOO',
  'OOOOOOOOOO',
  'OOGGGGGGOO',
  ' OOOOOOOO ',
  '  OOOOOO  ',
  '    ss    ',
  '   s  s   ',
  '  s    s  ',
  ' ss    ss ',
], [
  pal('k', [0.08, 0.08, 0.09]),
  pal('g', [0.7, 0.68, 0.62]),
  pal('O', [0.95, 0.35, 0.03], { metal: 0.6, rough: 0.4 }),
  pal('G', [0.6, 0.62, 0.65], { metal: 1, rough: 0.3 }),
  pal('s', [0.25, 0.27, 0.3], { metal: 1, rough: 0.4 }),
]);

const Blob = sprite('Blob', [
  '    w   ',
  '   ww   ',
  '  wGGw  ',
  ' GKGGKG ',
  ' GGGGGG ',
  'GGGGGGGG',
  'GGGGGGGG',
], [
  pal('G', [0.72, 0.69, 0.62]),
  pal('w', [0.88, 0.86, 0.8]),
  pal('K', [0.02, 0.02, 0.03]),
]);

/** Level 5's power-up: a gold trowel that smashes cans and blobs for a few seconds. */
const GoldTrowel = sprite('GoldTrowel', [
  ' WW     ',
  ' WW     ',
  '  k     ',
  '   kYY  ',
  '  YYYYY ',
  ' YYYYYYY',
  '  YYYYY ',
  '   YY   ',
], [
  pal('Y', [1, 0.75, 0.15], { metal: 1, glow: 0.5, rough: 0.25 }),
  pal('k', [0.3, 0.3, 0.32], { metal: 1, rough: 0.3 }),
  pal('W', [0.55, 0.33, 0.15]),
]);

/** Sprites to add or replace; null removes an exported sprite nothing should draw any more. */
export const CHARACTERS: Record<string, SpriteDef | null> = {
  Don, DonJr, Raccoon, Chili, CactusPal, Flag, TopFlag, Cone, Mixer, Blob, GoldTrowel,
  CanSlinger: null, ChiliAmigo: null, CactusAmigo: null, Drum: null, Flame: null, Mallet: null,
};

/** Creature breeds to redraw, by exported name; tuning (speed, patience, bob) is kept. */
export const BREEDS: Record<string, Pick<BreedDef, 'name' | 'width' | 'height' | 'rows' | 'palette'>> = {
  // A cartoon cat burglar: balaclava, striped jumper, and a loot sack in place of a gun.
  Gangster: sprite('Burglar', [
    '   HHHH     ',
    '  HHHHHH    ',
    '  BBBBBB    ',
    '  BWBBWB    ',
    '  BBBBBB    ',
    '  KWKWKW    ',
    ' WKWKWKWK   ',
    ' KWKWKWKW   ',
    '  WKWKWK t  ',
    '  GKWKWGss  ',
    '  JJJJJJsss ',
    '  JJJJJJsss ',
    '  JJ  JJ ss ',
    '  JJ  JJ    ',
    '  JJ  JJ    ',
    '  KK  KK    ',
  ], [
    pal('H', [0.05, 0.05, 0.06], { rough: 0.6 }),
    pal('B', [0.13, 0.13, 0.15], { rough: 0.6 }),
    pal('W', [0.9, 0.9, 0.9], { rough: 0.6 }),
    pal('K', [0.06, 0.06, 0.07], { rough: 0.6 }),
    pal('G', [0.12, 0.12, 0.13], { rough: 0.6 }),
    pal('J', [0.15, 0.25, 0.55], { rough: 0.6 }),
    pal('s', [0.6, 0.45, 0.25], { rough: 0.7 }),
    pal('t', [0.4, 0.28, 0.12], { rough: 0.7 }),
  ]),
};

/** Bonus items to rename, by exported name. */
export const BONUS_NAMES: Record<string, string> = { Bug: 'Car' };
