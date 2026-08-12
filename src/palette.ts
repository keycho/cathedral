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

  // -------------------------------------------------------------------
  // THE TEMPLE REGISTER (the heights and the sky islands)
  // timber post and beam, plaster infill, dark stacked tile. the older
  // register, and the one the great work is built in.
  // -------------------------------------------------------------------
  tileCharcoal: 0x2f3742, // dark charcoal-blue roof tile, the register's signature
  tileRidge: 0x3f4a58, // the ridge and hip courses, a value up so edges read
  plasterBone: 0xe4dcc6, // bone plaster infill between the posts
  vermilion: 0xb8412c, // ACCENT ONLY: gates, railings, a banner
  foliageDeep: 0x38491f, // deep foliage, the mass of a canopy
  foliageSun: 0x53682a, // its sunward layer
  blossom: 0xdfb0ba, // the seasonal accent. sparing: a single tree, a drift.
  verdigris: 0x5f8f7a, // patinated copper: finials, bells, roof caps. the ONLY
  // green the temple buildings are allowed. green otherwise lives in the
  // grounds (moss, beds, canopy) so the buildings read AGAINST the hillside.

  // -------------------------------------------------------------------
  // SHARED BETWEEN THE REGISTERS (and nothing else is shared)
  // stone and timber are how a world stays one world.
  // -------------------------------------------------------------------
  stoneGrey: 0x8d8b84, // grey stone: stairs, retaining walls, kerbs, bridges
  timberDark: 0x3b2b1d, // structural posts, beams, brackets
  timberMid: 0x5a4230, // rails, frames, scaffolding
  timberLight: 0x7a5a3e, // decking, shutters, stalls

  // -------------------------------------------------------------------
  // THE TOWN REGISTER (the flats)
  // concrete, painted panel, glass. the newer register, and the one that
  // grows a skyline when the market sustains.
  // -------------------------------------------------------------------
  concretePale: 0x8a8781,
  concreteMid: 0x6f6c68,
  concreteDark: 0x565450,
  panelCream: 0xcfc2a4, // muted painted panels
  panelBlue: 0x8fa3ad,
  panelGreen: 0x7e9184,
  glassBlue: 0x59707e, // blue-grey glazing
  interiorWarm: 0xf0c882, // warm light behind a window, emissive
  // the town GLOWS after dark, and warm: the contrast between the quiet
  // dark heights and the electric flats is the world's signature night.
  // reds and ambers lead, cyan answers them. never magenta cyberpunk.
  neonEmber: 0xff5a3c,
  neonAmber: 0xffab4a,
  neonCyan: 0x63c4c0,
  spill: 0xffc487, // the warm pool a shopfront throws onto the street

  // the sky realm's underside: mist pooling under an island so it reads as
  // floating rather than pasted on the sky
  mist: 0xd6dcd8,

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
  // the temple register
  { id: 23, key: "tilecharcoal", name: "roof tile", color: SWATCH.tileCharcoal },
  { id: 24, key: "tileridge", name: "ridge tile", color: SWATCH.tileRidge },
  { id: 25, key: "plaster", name: "plaster", color: SWATCH.plasterBone },
  { id: 26, key: "vermilion", name: "vermilion", color: SWATCH.vermilion },
  { id: 27, key: "foliage", name: "foliage", color: SWATCH.foliageDeep },
  { id: 28, key: "foliagesun", name: "sunward foliage", color: SWATCH.foliageSun },
  { id: 29, key: "blossom", name: "blossom", color: SWATCH.blossom },
  // shared: stone and timber
  { id: 30, key: "stone", name: "grey stone", color: SWATCH.stoneGrey },
  { id: 31, key: "timberdark", name: "structural timber", color: SWATCH.timberDark },
  { id: 32, key: "timbermid", name: "timber", color: SWATCH.timberMid },
  { id: 33, key: "timberlight", name: "pale timber", color: SWATCH.timberLight },
  // the town register
  { id: 34, key: "concretepale", name: "concrete", color: SWATCH.concretePale },
  { id: 35, key: "concretemid", name: "shaded concrete", color: SWATCH.concreteMid },
  { id: 36, key: "concretedark", name: "deep concrete", color: SWATCH.concreteDark },
  { id: 37, key: "panelcream", name: "painted panel", color: SWATCH.panelCream },
  { id: 38, key: "panelblue", name: "blue panel", color: SWATCH.panelBlue },
  { id: 39, key: "panelgreen", name: "green panel", color: SWATCH.panelGreen },
  { id: 40, key: "glassblue", name: "glazing", color: SWATCH.glassBlue },
  { id: 41, key: "interior", name: "lit window", color: SWATCH.interiorWarm },
  { id: 42, key: "neonember", name: "neon sign", color: SWATCH.neonEmber },
  { id: 43, key: "neoncyan", name: "neon sign", color: SWATCH.neonCyan },
  { id: 44, key: "neonamber", name: "neon sign", color: SWATCH.neonAmber },
  { id: 45, key: "spill", name: "shopfront spill", color: SWATCH.spill },
  { id: 46, key: "verdigris", name: "patinated copper", color: SWATCH.verdigris },
  { id: 47, key: "mist", name: "mist", color: SWATCH.mist },
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
// the temple register
export const TILECHARCOAL = 23;
export const TILERIDGE = 24;
export const PLASTER = 25;
export const VERMILION = 26;
export const FOLIAGE = 27;
export const FOLIAGESUN = 28;
export const BLOSSOM = 29;
// shared
export const STONE = 30;
export const TIMBERDARK = 31;
export const TIMBERMID = 32;
export const TIMBERLIGHT = 33;
// the town register
export const CONCRETEPALE = 34;
export const CONCRETEMID = 35;
export const CONCRETEDARK = 36;
export const PANELCREAM = 37;
export const PANELBLUE = 38;
export const PANELGREEN = 39;
export const GLASSBLUE = 40;
export const INTERIOR = 41;
export const NEONEMBER = 42;
export const NEONCYAN = 43;
export const NEONAMBER = 44;
export const SPILL = 45;
export const VERDIGRIS = 46;
export const MIST = 47;

// families: geology is grown by the market; agent materials are built by
// the crew; ground is the old world; rise/fall belong to the price ribbon.
const GEOLOGY = new Set([GENESIS, MASS, RUBBLE, MONUMENT, SEED]);
const AGENT = new Set([
  CREAM, CREAMWARM, TEAL, TIMBER, TILE, LEAD, LANTERN, GLASSLIGHT, STILLWATER,
  // the temple register
  TILECHARCOAL, TILERIDGE, PLASTER, VERMILION, FOLIAGE, FOLIAGESUN, BLOSSOM,
  // shared
  STONE, TIMBERDARK, TIMBERMID, TIMBERLIGHT,
  // the town register
  CONCRETEPALE, CONCRETEMID, CONCRETEDARK, PANELCREAM, PANELBLUE, PANELGREEN,
  GLASSBLUE, INTERIOR, NEONEMBER, NEONCYAN, NEONAMBER, SPILL, VERDIGRIS,
]);
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
  // the temple register
  tilecharcoal: TILECHARCOAL,
  tileridge: TILERIDGE,
  plaster: PLASTER,
  vermilion: VERMILION,
  foliage: FOLIAGE,
  foliagesun: FOLIAGESUN,
  blossom: BLOSSOM,
  stone: STONE,
  timberdark: TIMBERDARK,
  timbermid: TIMBERMID,
  timberlight: TIMBERLIGHT,
  // the town register
  concretepale: CONCRETEPALE,
  concretemid: CONCRETEMID,
  concretedark: CONCRETEDARK,
  panelcream: PANELCREAM,
  panelblue: PANELBLUE,
  panelgreen: PANELGREEN,
  glassblue: GLASSBLUE,
  interior: INTERIOR,
  neonember: NEONEMBER,
  neoncyan: NEONCYAN,
  neonamber: NEONAMBER,
  spill: SPILL,
  verdigris: VERDIGRIS,
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
