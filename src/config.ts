// cathedral - engine + world constants (no deps, importable anywhere).
// market rule constants do NOT live here: those belong to src/rules.ts
// (phase 1d) and are mirrored in RULES.md, frozen at genesis.

export const GRID = 256; // voxel cells per side
export const MAXY = 96; // vertical voxel bound
export const CHUNK = 32; // render chunk size (must divide GRID)
export const WORLD = GRID; // world units per side (1 unit per cell)

// style tokens. the hud keeps the warm-black terminal identity; the world
// itself is heightened natural under a long golden hour.
export const C_VOID = 0x0b0b0a; // hud warm black
export const C_SAGE = 0x8fae6a;
export const C_CREAM = 0xfaf3e2;
export const C_ORANGE = 0xd45a20;

// the golden hour: warm low sun, soft shadows filled by warm bounce, and
// distance that fades into atmospheric haze, never black.
export const SUN_COLOR = 0xffd9a0;
export const SUN_INTENSITY = 2.3;
export const HAZE = 0xd8c4a4; // fog colour: warm air, not darkness
export const FOG_NEAR = 60;
export const FOG_FAR = 300;

// multiplayer transport (place layer, phase 1e). DORMANT: while false the
// net module never connects and the app is fully single-visitor.
export const NET_ENABLED = false;

// dev-only in-world edit probe (break / damage / place). dev builds only;
// dead code in production bundles.
export const DEV_EDIT = import.meta.env.DEV;
