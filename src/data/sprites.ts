import raw from './sprites.json';
import { BONUS_NAMES, BREEDS, CHARACTERS } from './spriteOverrides';

export interface PaletteEntry {
  key: string;
  rgb: [number, number, number];
  glow: number;
  metal: number;
  rough: number;
}

export interface SpriteDef {
  name: string;
  width: number;
  height: number;
  rows: string[];
  palette: PaletteEntry[];
  stride?: string[];
}

export interface BreedDef extends SpriteDef {
  angry: [number, number, number];
  speedMul: number;
  patienceMul: number;
  bobHeightCm: number;
  bobRate: number;
  wobble: number;
  extraSetStages: number;
  pauseInterval: number;
  pauseTime: number;
}

interface SpriteData {
  characters: Record<string, SpriteDef>;
  breeds: BreedDef[];
  bonus: SpriteDef[];
  hat: SpriteDef;
}

/** The Unreal export with Trowelblazer's replacement art layered on top. */
function withOverrides(data: SpriteData): SpriteData {
  const characters = { ...data.characters };
  for (const [name, def] of Object.entries(CHARACTERS)) {
    if (def) characters[name] = def;
    else delete characters[name];
  }
  return {
    ...data,
    characters,
    breeds: data.breeds.map(breed => (BREEDS[breed.name] ? { ...breed, ...BREEDS[breed.name] } : breed)),
    bonus: data.bonus.map(item => (BONUS_NAMES[item.name] ? { ...item, name: BONUS_NAMES[item.name] } : item)),
  };
}

export const Sprites = withOverrides(raw as unknown as SpriteData);
export const Breeds = Sprites.breeds;
export const BonusItems = Sprites.bonus;
export const UFO_BREED = Breeds.findIndex((b) => b.name === 'UFO');

/** Unreal authored bob heights in centimetres on a 150 cm cell. */
export const CM_PER_CELL = 150;
