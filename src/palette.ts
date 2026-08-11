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
  // ground
  { id: 1, key: "ash", name: "ash", color: 0x171310 },
  { id: 2, key: "bedrock", name: "bedrock", color: 0x0f0d0b },
  // the founding stone: the one block the launch tx places
  { id: 3, key: "genesis", name: "founding stone", color: 0xfaf3e2 },
  // market geology
  { id: 4, key: "mass", name: "mass", color: 0x8fae6a }, // fresh accretion, young sage
  { id: 5, key: "rubble", name: "rubble", color: 0x554839 }, // settled collapse
  { id: 6, key: "monument", name: "monument", color: 0xfaf3e2 }, // whale monolith
  { id: 7, key: "seed", name: "seed", color: 0xa4bd7f }, // new holder
];

export const ASH = 1;
export const BEDROCK = 2;
export const GENESIS = 3;
export const MASS = 4;
export const RUBBLE = 5;
export const MONUMENT = 6;
export const SEED = 7;

const BY_ID = new Map<number, Material>(MATERIALS.map((m) => [m.id, m]));

export function blockColor(id: number): number {
  return BY_ID.get(id)?.color ?? 0x808080;
}

export function blockById(id: number): Material | undefined {
  return BY_ID.get(id);
}
