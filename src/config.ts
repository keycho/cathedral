// kodo - engine + world constants (no deps, importable anywhere).
// market rule constants do NOT live here: those belong to src/rules.ts
// (phase 1d) and are mirrored in RULES.md, frozen at genesis.

export const GRID = 256; // voxel cells per side
export const MAXY = 96; // vertical voxel bound
// render chunk size (must divide GRID). 64 gives 16 chunk meshes instead
// of 64: the frame is drawn at least twice (colour and shadow), so every
// chunk mesh is at least two draw calls, and coarser frustum culling is a
// cheaper trade than 128 extra calls.
export const CHUNK = 64;
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
export const HAZE = 0xccd0c5; // fog colour: mountain mist, not darkness
// the mist starts further out than it used to. distance still dissolves,
// but a fold of hill at a hundred blocks has to survive as a FOLD: layered
// ridges receding into air is the whole picture in this tradition, and mist
// that begins at the middle ground flattens them into one wall.
//
// AND THERE ARE TWO OF THEM. this linear scene fog and the post stack's
// depth haze both run, and they compound: at two hundred blocks — which on a
// 256 grid is the middle ground, the settlement seen from the next ridge —
// they measured 0.40 and 0.10, so nearly half the picture's contrast was
// gone before the grade had touched it. the far hills are supposed to
// recede; the town is not. pushed out so the fog does not begin until past
// anything a frame is composed on.
export const FOG_NEAR = 170;
export const FOG_FAR = 560;

// multiplayer transport (place layer, phase 1e). DORMANT: while false the
// net module never connects and the app is fully single-visitor.
export const NET_ENABLED = false;

// dev-only in-world edit probe (break / damage / place). dev builds only;
// dead code in production bundles.
export const DEV_EDIT = import.meta.env.DEV;

// THE MARKET CONTROLS ARE A TELL. the dev panel drives the synthetic feed —
// event-rate and buy/bias sliders, manual buy, sell, whale and burn, a
// storm button, starve and feed. on a public launch that panel is a sign
// over the door reading "the market is simulated", and no visitor needs to
// be told that in the first second.
//
// three ways in, all of them deliberate:
//   - a vite dev server (npm run dev)
//   - ?dev on the url
//   - a localhost origin, which is what the capture harnesses run against
//
// a deployed build served from anywhere else has no panel and no console
// handle, and the world is the only thing in the frame.
function devToolsOn(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof location === "undefined") return false;
  if (new URLSearchParams(location.search).has("dev")) return true;
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}
export const DEV_TOOLS = devToolsOn();

// ---- THE SEASON --------------------------------------------------------------
//
// WINTER IS THE WORLD'S DEFAULT STATE, not a weather event it passes
// through. the settled snow is decided once, at mesh time, per block and
// per face — so it costs nothing per frame and it is the same for every
// visitor, which a weather roll would not be. the falling flakes are still
// weather; the white world underneath them is the world.
//
// ?summer boots the world as it was, which is how the two get compared
// without a rebuild.
export const WINTER =
  typeof location === "undefined" || !new URLSearchParams(location.search).has("summer");
