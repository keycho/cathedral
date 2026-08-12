// cathedral - block materials. flat-shaded single-colour voxels, no
// textures. terrain reads near-void; everything the market grows carries
// the warm strata palette. epoch tinting (sage -> cream -> orange with
// age) is applied per block on top of these bases in phase 1d.

export const NONE = 0;

export interface Material {
  id: number;
  key: string;
  name: string;
  color: number;
}

export const MATERIALS: Material[] = [
  // ground: darker and drier than anything built or grown, so matter
  // visibly sits ON the plain
  { id: 1, key: "ash", name: "ash", color: 0x231e19 },
  { id: 2, key: "bedrock", name: "bedrock", color: 0x151210 },
  // the founding stone: the one block the launch tx places
  { id: 3, key: "genesis", name: "founding stone", color: 0xfaf3e2 },
  // market geology
  { id: 4, key: "mass", name: "mass", color: 0x9dbd76 }, // fresh accretion, young sage
  { id: 5, key: "rubble", name: "rubble", color: 0x5e5040 }, // settled collapse
  { id: 6, key: "monument", name: "monument", color: 0xfaf3e2 }, // whale monolith
  { id: 7, key: "seed", name: "seed", color: 0xa4bd7f }, // new holder
  // the crew's vocabulary (style.md): geology never wears these, and the
  // crew never wears strata tints, so grown vs architected reads at a
  // glance. lantern blocks carry pooled lights; glasslight and stillwater
  // read luminous against the dusk (true translucency is a later render
  // split, noted in style.md).
  // dressed stone sits OFF the warm strata axis entirely: a pale cool
  // grey, so architecture reads as a different material family at a
  // glance (the strata own sage-cream-orange; the crew owns grey + its
  // accents)
  { id: 8, key: "dressed", name: "dressed stone", color: 0xb2b6ac },
  { id: 9, key: "teal", name: "deep teal", color: 0x1f6d68 },
  { id: 10, key: "violet", name: "violet", color: 0x6b4a8f },
  { id: 11, key: "lantern", name: "lantern", color: 0xffc873 },
  { id: 12, key: "glasslight", name: "glasslight", color: 0xd8ece4 },
  { id: 13, key: "crimson", name: "banner crimson", color: 0xa3333d },
  { id: 14, key: "gold", name: "banner gold", color: 0xd9a13b },
  { id: 15, key: "stillwater", name: "stillwater", color: 0x2b6478 },
];

export const ASH = 1;
export const BEDROCK = 2;
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

// families: geology is grown by the market; agent materials are built by
// the crew. ground is neither.
export function isGeology(id: number): boolean {
  return id >= GENESIS && id <= SEED;
}
export function isAgentMaterial(id: number): boolean {
  return id >= DRESSED && id <= STILLWATER;
}
export const AGENT_KEYS: Record<string, number> = {
  dressed: DRESSED,
  teal: TEAL,
  violet: VIOLET,
  lantern: LANTERN,
  glasslight: GLASSLIGHT,
  crimson: CRIMSON,
  gold: GOLD,
  stillwater: STILLWATER,
};

const BY_ID = new Map<number, Material>(MATERIALS.map((m) => [m.id, m]));

export function blockColor(id: number): number {
  return BY_ID.get(id)?.color ?? 0x808080;
}

export function blockById(id: number): Material | undefined {
  return BY_ID.get(id);
}
