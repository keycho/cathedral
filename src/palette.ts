// cathedral - THE PALETTE LOCK. every colour in the world comes from this
// file. nothing samples a colour outside it: not terrain, not flora, not
// the crew's materials, not particles, not the market's light. if a new
// thing needs a colour it takes one of these swatches or the palette gains
// a documented swatch here first.
//
// the set is DERIVED, not invented: the stillwater basin frame was sampled
// and this is its tonal range built outward. deep olive-forest meadow over
// warm rust terraces, muted teal water, tonal variation between adjacent
// ground tiles. temperature is warm throughout. every swatch's role is
// documented in style.md so later sessions cannot drift.

export const NONE = 0;

export interface Material {
  id: number;
  key: string;
  name: string;
  color: number;
}

// ---------------------------------------------------------------------------
// the swatches. named once, referenced everywhere.
// ---------------------------------------------------------------------------
export const SWATCH = {
  // ground: the meadow reads olive-forest, never mint, never pastel
  meadow: 0x6f7d2e, // lit meadow, sampled from the basin frame
  meadowDeep: 0x55632a, // valley floors and shaded grass, richer
  meadowPale: 0x828c3c, // ridgelines and sun-bleached crowns
  earth: 0x4a3520, // dark warm soil under the grass
  rust: 0x9a4c1b, // exposed terrace rock, warm rust-red
  rustDeep: 0x6d3312, // rust in shadow and depth
  scarmoss: 0x3f4d24, // old burns, overgrown dark
  emberseam: 0xc2521c, // rare hot crack near a wound
  stillwater: 0x2f6357, // muted teal water

  // flora, drawn from the same ground family
  grass: 0x63722a,
  reed: 0x51632c,
  moss: 0x475629,
  bloomCream: 0xcfc49c,
  bloomRust: 0xa9552c,
  bloomMauve: 0x84667e,

  // the market's geology
  genesis: 0xe4d8bb, // the founding stone
  mass: 0x6d7d33, // fresh accretion, young growth
  rubble: 0x67614a, // settled collapse, mossing over
  monument: 0xd3c6a8, // a whale's monolith
  seed: 0x8b9c44, // a new holder's block

  // the strata ramp: how age reads through the mass
  strataYoung: 0x6d7d33,
  strataSettled: 0xc9bda0,
  strataOld: 0xa15b2c, // sunwarm terracotta in the deepest layers
  holdings: 0xb08a4e, // a large holder's stone warms toward this

  // the crew's materials: coursed stone, timber, tile, lead
  cream: 0xcabf9d, // coursed cream stone, the formal body
  creamWarm: 0xd6c2a0, // warmer coursed stone, the domestic body
  timber: 0x4a3626, // dark timber: frames, braces, lintels
  tile: 0x8c4326, // fired tile roofs and kiln work
  lead: 0x5b6068, // lead grey: gates, straps, lamp posts
  teal: 0x2b5f58, // deep teal, a SPARING accent only

  // light: the only things that glow
  lantern: 0xe8a94e,
  glasslight: 0xdbe4d2,
  rise: 0x86c46a, // the ribbon's ascent
  fall: 0xc2472a, // the ribbon's descent

  // air and dust, so particles never fall outside the palette
  haze: 0xd3bd9a,
  dust: 0x93825f,
  petal: 0xe0cfa6,

  // the light. the sky's whole cycle is mixed from these, so nothing in
  // the air is off-palette either.
  skyZenithDay: 0x5f87ae,
  skyZenithGolden: 0x6c81a4,
  skyZenithNight: 0x131b31,
  skyHorizonDay: 0xc3c3a4,
  skyHorizonGolden: 0xd9a468,
  skyHorizonNight: 0x27324e,
  sunNoon: 0xffeecd,
  sunGolden: 0xf7c07a,
  sunDusk: 0xe08a4e,
  moon: 0x8fa2c6,
  bounceWarm: 0xe8cba4, // sky bounce at golden hour
  bounceCool: 0xbcd0e4, // sky bounce at noon
  bounceNight: 0x33405e,
  shadowTint: 0x6a6484, // shadows are violet-grey, never black
  crewSurveyor: 0xd8c79c, // the crew's own silhouettes
  crewArchitect: 0x6fa79c,
  crewMason: 0x9a7a5c,
} as const;

export const MATERIALS: Material[] = [
  // ground
  { id: 1, key: "meadow", name: "meadow", color: SWATCH.meadow },
  { id: 2, key: "earth", name: "earth", color: SWATCH.earth },
  // the founding stone: the one block the launch tx places
  { id: 3, key: "genesis", name: "founding stone", color: SWATCH.genesis },
  // market geology (strata tint by age rides on top of mass)
  { id: 4, key: "mass", name: "mass", color: SWATCH.mass },
  { id: 5, key: "rubble", name: "rubble", color: SWATCH.rubble },
  { id: 6, key: "monument", name: "monument", color: SWATCH.monument },
  { id: 7, key: "seed", name: "seed", color: SWATCH.seed },
  // the crew's vocabulary
  { id: 8, key: "cream", name: "coursed stone", color: SWATCH.cream },
  { id: 9, key: "teal", name: "deep teal", color: SWATCH.teal },
  { id: 10, key: "timber", name: "dark timber", color: SWATCH.timber },
  { id: 11, key: "lantern", name: "lantern", color: SWATCH.lantern },
  { id: 12, key: "glasslight", name: "glasslight", color: SWATCH.glasslight },
  { id: 13, key: "tile", name: "fired tile", color: SWATCH.tile },
  { id: 14, key: "creamwarm", name: "warm coursed stone", color: SWATCH.creamWarm },
  { id: 15, key: "stillwater", name: "stillwater", color: SWATCH.stillwater },
  // varied ground
  { id: 16, key: "scarmoss", name: "scar moss", color: SWATCH.scarmoss },
  { id: 17, key: "rust", name: "terrace rock", color: SWATCH.rust },
  { id: 18, key: "emberseam", name: "ember seam", color: SWATCH.emberseam },
  { id: 19, key: "rustdeep", name: "deep terrace rock", color: SWATCH.rustDeep },
  { id: 20, key: "lead", name: "lead", color: SWATCH.lead },
  // the market rendered as terrain: the price ribbon
  { id: 21, key: "rise", name: "ascent", color: SWATCH.rise },
  { id: 22, key: "fall", name: "descent", color: SWATCH.fall },
];

export const MEADOW = 1;
export const EARTH = 2;
export const GENESIS = 3;
export const MASS = 4;
export const RUBBLE = 5;
export const MONUMENT = 6;
export const SEED = 7;
export const CREAM = 8;
export const TEAL = 9;
export const TIMBER = 10;
export const LANTERN = 11;
export const GLASSLIGHT = 12;
export const TILE = 13;
export const CREAMWARM = 14;
export const STILLWATER = 15;
export const SCARMOSS = 16;
export const RUST = 17;
export const EMBERSEAM = 18;
export const RUSTDEEP = 19;
export const LEAD = 20;
export const RISE = 21;
export const FALL = 22;

// families: geology is grown by the market; agent materials are built by
// the crew; ground is the old world; rise/fall belong to the price ribbon.
const GEOLOGY = new Set([GENESIS, MASS, RUBBLE, MONUMENT, SEED]);
const AGENT = new Set([CREAM, CREAMWARM, TEAL, TIMBER, TILE, LEAD, LANTERN, GLASSLIGHT, STILLWATER]);
const GROUND = new Set([MEADOW, EARTH, SCARMOSS, RUST, RUSTDEEP, EMBERSEAM]);

export function isGeology(id: number): boolean {
  return GEOLOGY.has(id);
}
export function isAgentMaterial(id: number): boolean {
  return AGENT.has(id);
}
export function isGround(id: number): boolean {
  return GROUND.has(id);
}

// the names a blueprint may use. the legacy names of the first works are
// kept as aliases into the locked set, so everything already authored
// still stands, in the palette the world now speaks.
export const AGENT_KEYS: Record<string, number> = {
  cream: CREAM,
  creamwarm: CREAMWARM,
  timber: TIMBER,
  tile: TILE,
  lead: LEAD,
  teal: TEAL,
  lantern: LANTERN,
  glasslight: GLASSLIGHT,
  stillwater: STILLWATER,
  // legacy names from the first blueprints
  dressed: CREAM,
  dressedwarm: CREAMWARM,
  darkiron: LEAD,
  violet: TIMBER, // the candy violet is gone; its role is timber now
  crimson: TILE, // and the candy crimson is fired tile
  gold: CREAMWARM,
};

const BY_ID = new Map<number, Material>(MATERIALS.map((m) => [m.id, m]));

export function blockColor(id: number): number {
  return BY_ID.get(id)?.color ?? SWATCH.rubble;
}

export function blockById(id: number): Material | undefined {
  return BY_ID.get(id);
}
