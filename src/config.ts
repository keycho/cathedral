// cathedral - engine + world constants (no deps, importable anywhere).
// market rule constants do NOT live here: those belong to src/rules.ts
// (phase 1d) and are mirrored in RULES.md, frozen at genesis.

export const GRID = 256; // voxel cells per side
export const MAXY = 96; // vertical voxel bound
export const CHUNK = 32; // render chunk size (must divide GRID)
export const WORLD = GRID; // world units per side (1 unit per cell)

// style bible
export const C_VOID = 0x0b0b0a; // warm black
export const C_SAGE = 0x8fae6a;
export const C_CREAM = 0xfaf3e2;
export const C_ORANGE = 0xd45a20;

// ashfall dusk. the sun carries the contrast: lit faces read their strata
// tint at orbit distance while the ambient floor stays near-void. colour
// kept warm but shy of orange so cream reads cream, not amber.
export const SUN_COLOR = 0xeeb488;
export const SUN_INTENSITY = 2.6;
export const FOG_NEAR = 40;
export const FOG_FAR = 185;

// multiplayer transport (place layer, phase 1e). DORMANT: while false the
// net module never connects and the app is fully single-visitor.
export const NET_ENABLED = false;

// dev-only in-world edit probe (break / damage / place). dev builds only;
// dead code in production bundles.
export const DEV_EDIT = import.meta.env.DEV;
