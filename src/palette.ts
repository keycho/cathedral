// cathedral - block materials. flat-shaded single-colour voxels, no
// textures. the world is heightened natural: warm meadow ground, cream
// stone, wildflower accents, ruins reclaimed by growth. the market's
// elements (ribbon, candles, monuments, lanterns) read as spirit-light
// against it. saturated but soft, never neon.

export const NONE = 0;

export interface Material {
  id: number;
  key: string;
  name: string;
  color: number;
}

export const MATERIALS: Material[] = [
  // ground: warm meadow over earth, with the old world showing through
  { id: 1, key: "meadow", name: "meadow", color: 0x7fa04f },
  { id: 2, key: "earth", name: "earth", color: 0x6b5136 },
  // the founding stone: the one block the launch tx places
  { id: 3, key: "genesis", name: "founding stone", color: 0xfaf3e2 },
  // market geology (strata tint by age rides on top of mass)
  { id: 4, key: "mass", name: "mass", color: 0x8fbc66 }, // fresh accretion, young green
  { id: 5, key: "rubble", name: "rubble", color: 0x7a6f52 }, // settled collapse, mossing over
  { id: 6, key: "monument", name: "monument", color: 0xfaf3e2 }, // whale monolith
  { id: 7, key: "seed", name: "seed", color: 0x9fc470 }, // new holder
  // the crew's vocabulary (style.md)
  { id: 8, key: "dressed", name: "dressed stone", color: 0xcfd2c9 }, // cool cut stone
  { id: 9, key: "teal", name: "deep teal", color: 0x2b7d74 },
  { id: 10, key: "violet", name: "violet", color: 0x7a5aa0 },
  { id: 11, key: "lantern", name: "lantern", color: 0xffc873 },
  { id: 12, key: "glasslight", name: "glasslight", color: 0xddeee2 },
  { id: 13, key: "crimson", name: "banner crimson", color: 0xb04048 },
  { id: 14, key: "gold", name: "banner gold", color: 0xdca844 },
  { id: 15, key: "stillwater", name: "stillwater", color: 0x3f7d8c },
  // varied ground: reclaimed scars and old rock
  { id: 16, key: "scarmoss", name: "scar moss", color: 0x4c5e38 }, // old burns, overgrown
  { id: 17, key: "oldrock", name: "sunwarm rock", color: 0xb07040 }, // exposed terracotta ridges
  { id: 18, key: "emberseam", name: "ember seam", color: 0xff6a2e }, // rare cracks near burns
  // the crew's vocabulary, doubled (style.md)
  { id: 19, key: "dressedwarm", name: "warm dressed stone", color: 0xe2cfa4 },
  { id: 20, key: "darkiron", name: "dark iron", color: 0x46505c },
  // the market rendered as terrain: the price ribbon's ascent and descent
  { id: 21, key: "rise", name: "ascent", color: 0xa8e6a0 }, // spirit green
  { id: 22, key: "fall", name: "descent", color: 0xe8552a }, // ember red
];

export const MEADOW = 1;
export const EARTH = 2;
export const GENESIS = 3;
export const MASS = 4;
export const RUBBLE = 5;
export const MONUMENT = 6;
export const SEED = 7;
export const DRESSED = 8;
export const TEAL = 9;
export const VIOLET = 10;
export const LANTERN = 11;
export const GLASSLIGHT = 12;
export const CRIMSON = 13;
export const GOLD = 14;
export const STILLWATER = 15;
export const SCARMOSS = 16;
export const OLDROCK = 17;
export const EMBERSEAM = 18;
export const DRESSEDWARM = 19;
export const DARKIRON = 20;
export const RISE = 21;
export const FALL = 22;

// families: geology is grown by the market; agent materials are built by
// the crew; ground is the old world; rise/fall belong to the price ribbon.
export function isGeology(id: number): boolean {
  return id >= GENESIS && id <= SEED;
}
export function isAgentMaterial(id: number): boolean {
  return (id >= DRESSED && id <= STILLWATER) || id === DRESSEDWARM || id === DARKIRON;
}
export function isGround(id: number): boolean {
  return id === MEADOW || id === EARTH || id === SCARMOSS || id === OLDROCK || id === EMBERSEAM;
}
export const AGENT_KEYS: Record<string, number> = {
  dressed: DRESSED,
  dressedwarm: DRESSEDWARM,
  teal: TEAL,
  violet: VIOLET,
  lantern: LANTERN,
  glasslight: GLASSLIGHT,
  crimson: CRIMSON,
  gold: GOLD,
  stillwater: STILLWATER,
  darkiron: DARKIRON,
};

const BY_ID = new Map<number, Material>(MATERIALS.map((m) => [m.id, m]));

export function blockColor(id: number): number {
  return BY_ID.get(id)?.color ?? 0x808080;
}

export function blockById(id: number): Material | undefined {
  return BY_ID.get(id);
}
