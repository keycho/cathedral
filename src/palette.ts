// cathedral - THE PALETTE LOCK. every colour in the world comes from this
// file. nothing samples a colour outside it: not terrain, not flora, not
// the crew's materials, not particles, not the market's light. if a new
// thing needs a colour it takes one of these swatches or the palette gains
// a documented swatch here first.
//
// the set is DERIVED, not invented: the stillwater basin frame was sampled
// and this is its tonal range built outward. the geology was then RESELECTED
// for the tradition the world builds in: deep cedar-green hills over cool
// grey cliff stone, jade water, mountain mist instead of dry warm dust.
// warmth is now a deliberate accent (lantern, vermilion, ember, a whale's
// gold) against a cool ground, not the temperature of everything. every
// swatch's role is documented in style.md so later sessions cannot drift.

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
  // ground: cedar-green hills. rich and deep, never olive, never mint.
  // GRASS IS NEVER ONE COLOUR ACROSS A HILL. one mid-green covered most of
  // the surface and the whole world read as felt: no tonal variation meant
  // no form, and the eye had nothing to travel over. six values now, chosen
  // by where a column sits rather than scattered — the hillside is painted,
  // not dithered.
  meadow: 0x4f7038, // lit hillside grass, the world's ground note
  meadowDeep: 0x3a5a2c, // valley floors and shaded grass, deeper still
  meadowPale: 0x6d8a45, // ridgelines and sun-struck crowns
  meadowOlive: 0x6a7530, // sun-facing slopes, yellow-olive
  meadowShade: 0x35564a, // the cool side of a fold, blue-green
  meadowSage: 0x7c8760, // dry sage on the ridge crowns
  meadowMoss: 0x2e4726, // deep moss in the hollows
  earth: 0x40382a, // damp forest loam under the grass
  // the cliff is pushed further blue than it looks on a swatch card on
  // purpose: the golden hour's sun is strongly orange, and a neutral grey
  // lit by it reads khaki. this lands as cool stone under the identity
  // light instead of only at noon.
  cliff: 0x6c7885, // exposed cliff stone, cool grey with a blue cast
  cliffDeep: 0x475059, // cliff stone in shadow and at depth
  scarmoss: 0x36502c, // old burns, overgrown dark
  emberseam: 0xc2521c, // rare hot crack near a wound. the one warm geology.
  stillwater: 0x356b5d, // jade water

  // flora, drawn from the same ground family
  grass: 0x5b7a36,
  reed: 0x486b34,
  moss: 0x3d5c30,
  bloomCream: 0xd4cfba,
  bloomLily: 0xa8483a, // the one red in the meadow, a spider lily
  bloomMauve: 0x7a6e91, // wisteria

  // the market's geology
  genesis: 0xe0dac6, // the founding stone
  mass: 0x577a55, // fresh accretion, young growth
  rubble: 0x5d6155, // settled collapse, mossing over
  monument: 0xcbc9b8, // a whale's monolith
  seed: 0x74a05c, // a new holder's block

  // the strata ramp: how age reads through the mass. the mechanic is
  // unchanged (young -> settled -> deep); only the colours were reselected.
  strataYoung: 0x577a55, // living moss on fresh stone
  strataSettled: 0xb5b5a4, // weathered pale granite
  strataOld: 0x54606b, // the deepest layers go cold and blue, like far peaks
  holdings: 0xac8b52, // a large holder's stone warms toward this

  // the crew's LEGACY materials: coursed stone, timber, tile, lead. these
  // predate the two registers and every work built before them is made of
  // these, so they were re-derived with the geology rather than left
  // behind: a warm cream that read as sunlit stone in the old world reads
  // as acid yellow-gold under a golden sun over cool ground. they stay
  // LIGHTER and cleaner than any stratum, because architecture has to read
  // as architecture against raw stone at a glance.
  // THE STONE WAS COLD AND THE WORLD HAD NO MIDDLE. grey-white walls, near
  // black roofs and a mid-green ground is three values with nothing between
  // them. the dressed stone moves to warm cream and ochre, which both fills
  // that gap and puts the buildings on the opposite temperature from the
  // shadows they stand in.
  cream: 0xcbc3a8, // pale dressed stone, the formal body
  creamWarm: 0xdccfae, // bone-warm dressed stone, the domestic body
  timber: 0x4a3626, // dark timber: frames, braces, lintels
  tile: 0x8c4326, // fired tile roofs and kiln work
  lead: 0x5b6068, // lead grey: gates, straps, lamp posts
  teal: 0x3a5f5b, // deep teal, a SPARING accent only

  // -------------------------------------------------------------------
  // THE TEMPLE REGISTER (the heights and the sky islands)
  // timber post and beam, plaster infill, dark stacked tile. the older
  // register, and the one the great work is built in.
  // -------------------------------------------------------------------
  // lifted a value from 0x2f3742. it is the darkest thing in the palette and
  // it roofs every hall, so at golden hour with the sun behind a building the
  // whole roof mass went to a black cutout and the subject of the picture
  // stopped being architecture. still unmistakably dark charcoal; now a dark
  // you can see the courses in.
  tileCharcoal: 0x3a4450, // dark charcoal-blue roof tile, the register's signature
  tileRidge: 0x3f4a58, // the ridge and hip courses, a value up so edges read
  plasterBone: 0xe4dcc6, // bone plaster infill between the posts
  vermilion: 0xb8412c, // ACCENT ONLY: gates, railings, a banner
  // LIVING GREEN HAS TO SURVIVE THE GRADE. at 0x38491f a canopy mass came
  // out brown-black across a whole frame under the golden hour — the value
  // was low enough that the warm grade had nothing green left to work on.
  // lifted and pushed toward green rather than olive; it is still a deep
  // shade, just one the eye reads as foliage.
  foliageDeep: 0x46612a, // deep foliage, the mass of a canopy
  foliageSun: 0x6d8c3a, // its sunward layer
  blossom: 0xd6b5b8, // the seasonal accent. sparing: a single tree, a drift.
  // VERMILION AND LANTERN LIGHT ARE THE ONLY SATURATED THINGS. verdigris,
  // teal and blossom were all competing with the gates for the eye, and a
  // frame with four accents has no focal point. they keep their hue and
  // give up their chroma.
  verdigris: 0x6d8a7d, // patinated copper: finials, bells, roof caps. the ONLY
  // green the temple buildings are allowed. green otherwise lives in the
  // grounds (moss, beds, canopy) so the buildings read AGAINST the hillside.

  // -------------------------------------------------------------------
  // SHARED BETWEEN THE REGISTERS (and nothing else is shared)
  // stone and timber are how a world stays one world.
  // -------------------------------------------------------------------
  stoneGrey: 0x9a9081, // warm stone: stairs, retaining walls, kerbs, bridges
  // the shading partner for stone. paving speckled against TIMBER reads as
  // a chequerboard, because timber is a different temperature; speckled
  // against its own family it reads as coursing.
  stoneDark: 0x776d5d,
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
  panelCream: 0xcfc2a4, // the older muted panels, kept for what is built in them
  panelBlue: 0x8fa3ad,
  panelGreen: 0x7e9184,
  // the town's paints are SATURATED and individual. a street is interesting
  // because every owner painted their own frontage; what unifies it is the
  // LIGHT falling across all of them, not a restrained common palette.
  paintOx: 0x8e3b32, // oxblood
  paintMustard: 0xc4913a,
  paintTeal: 0x2f6b6a,
  paintCobalt: 0x33507e,
  paintPlum: 0x5b3a52,
  glassBlue: 0x59707e, // blue-grey glazing, dark and unlit
  shutterSteel: 0x6f7478, // rolling shutters, ducting, ladders
  asphalt: 0x2b2d30, // the carriageway. dark, so the signage lands on it.
  interiorWarm: 0xf0c882, // warm light behind a window, emissive
  // the town GLOWS after dark, and the glow is the SUBJECT: buildings read
  // dark and the signage is what you see. the contrast between the quiet
  // dark heights and the electric flats is the world's signature night.
  // warm leads and cyan answers, but the full set is here because a real
  // street is not colour-managed.
  neonEmber: 0xff5a3c,
  neonAmber: 0xffab4a,
  neonCyan: 0x63c4c0,
  neonPink: 0xff3d8a,
  neonRed: 0xff2f2a,
  neonGreen: 0x4de07e,
  signWhite: 0xf5f3ea, // an illuminated white lightbox or banner ground
  spill: 0xffc487, // the warm pool a shopfront throws onto the street

  // the sky realm's underside: mist pooling under an island so it reads as
  // floating rather than pasted on the sky
  mist: 0xd6dcd8,

  // light: the only things that glow
  lantern: 0xe8a94e,
  glasslight: 0xdbe4d2,
  // A DATA ELEMENT MUST NOT OUTCOMPETE THE ARCHITECTURE. at 0x86c46a and
  // 0xc2472a the ribbon was the most saturated thing in every frame — a
  // green-and-red candy stripe crossing a muted world, pulling the eye off
  // the buildings it is supposed to cross behind. it keeps its reading (up
  // is green-biased, down is red-biased) and gives up almost all of its
  // chroma: a lit path with a bias, not a signal.
  rise: 0x8a9a72, // the ribbon's ascent
  fall: 0x9c7160, // the ribbon's descent

  // air and dust, so particles never fall outside the palette. the haze
  // reads as mountain mist: pale, luminous, faintly green-grey. it is the
  // lowest band of the sky and the colour distance dissolves into, so warm
  // light sits ON it rather than being made of it.
  haze: 0xccd0c5,
  dust: 0x9aa197, // stone dust, cool
  petal: 0xe0cfa6, // seeds and petals in the air; also the golden hour's cloud

  // the light. the sky's whole cycle is mixed from these, so nothing in
  // the air is off-palette either.
  skyZenithDay: 0x5f87ae,
  skyZenithGolden: 0x6c81a4,
  skyZenithNight: 0x131b31,
  skyHorizonDay: 0xc2c8bd,
  skyHorizonGolden: 0xd9a468,
  skyHorizonNight: 0x27324e,
  sunNoon: 0xffeecd,
  sunGolden: 0xf7c07a,
  sunDusk: 0xe08a4e,
  moon: 0x8fa2c6,
  bounceWarm: 0xe8cba4, // sky bounce at golden hour
  // WARM SUN, COOL SHADE. every surface was the same temperature, so the
  // world had no depth — a lit wall and a shaded one differed only in
  // brightness. the sky half of the hemisphere is what lights a SHADOW, so
  // at golden hour it goes blue-violet while the sun stays orange, and the
  // two temperatures are what separate a near wall from a far one. this is
  // deliberately NOT bounceWarm, which still paints the sky's own mid band:
  // the sky is warm to look at and cool to be lit by, which is what an
  // evening actually does.
  bounceShade: 0x8f9ac6,
  bounceCool: 0xbcd0e4, // sky bounce at noon
  bounceNight: 0x33405e,
  // THE GROUND HALF OF THE HEMISPHERE, which is what actually lights the
  // shaded side of a building. it was the deep meadow green — a 0.13
  // luminance bounce — so a charcoal tile roof turned away from the sun
  // received almost nothing and came back a black cutout at the exact hour
  // the stream runs on. this is that bounce warmed and lifted: still the
  // colour of light coming off a green hillside, at a level a wall can be
  // read by.
  bounceGround: 0x6e7350,
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
  { id: 17, key: "cliff", name: "cliff stone", color: SWATCH.cliff },
  { id: 18, key: "emberseam", name: "ember seam", color: SWATCH.emberseam },
  { id: 19, key: "cliffdeep", name: "deep cliff stone", color: SWATCH.cliffDeep },
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
  { id: 48, key: "stonedark", name: "shaded stone", color: SWATCH.stoneDark },
  // the town's saturated paints and its full neon set
  { id: 49, key: "paintox", name: "oxblood paint", color: SWATCH.paintOx },
  { id: 50, key: "paintmustard", name: "mustard paint", color: SWATCH.paintMustard },
  { id: 51, key: "paintteal", name: "teal paint", color: SWATCH.paintTeal },
  { id: 52, key: "paintcobalt", name: "cobalt paint", color: SWATCH.paintCobalt },
  { id: 53, key: "paintplum", name: "plum paint", color: SWATCH.paintPlum },
  { id: 54, key: "shutter", name: "rolling shutter", color: SWATCH.shutterSteel },
  { id: 55, key: "asphalt", name: "asphalt", color: SWATCH.asphalt },
  { id: 56, key: "neonpink", name: "neon sign", color: SWATCH.neonPink },
  { id: 57, key: "neonred", name: "neon sign", color: SWATCH.neonRed },
  { id: 58, key: "neongreen", name: "neon sign", color: SWATCH.neonGreen },
  { id: 59, key: "signwhite", name: "lightbox", color: SWATCH.signWhite },
  // the rest of the ground family. terrain picks between these per column;
  // they are not in AGENT_KEYS because nothing designs with them.
  { id: 60, key: "meadowolive", name: "meadow", color: SWATCH.meadowOlive },
  { id: 61, key: "meadowshade", name: "meadow", color: SWATCH.meadowShade },
  { id: 62, key: "meadowsage", name: "meadow", color: SWATCH.meadowSage },
  { id: 63, key: "meadowmoss", name: "meadow", color: SWATCH.meadowMoss },
  { id: 64, key: "meadowpale", name: "meadow", color: SWATCH.meadowPale },
  { id: 65, key: "meadowdeep", name: "meadow", color: SWATCH.meadowDeep },
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
export const CLIFF = 17;
export const EMBERSEAM = 18;
export const CLIFFDEEP = 19;
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
export const MEADOWOLIVE = 60;
export const MEADOWSHADE = 61;
export const MEADOWSAGE = 62;
export const MEADOWMOSS = 63;
export const MEADOWPALE = 64;
export const MEADOWDEEP = 65;
// every green the ground may be, so the woods and the plan can ask "is this
// grass" without naming six constants at each call site
export const MEADOWS = [MEADOW, MEADOWOLIVE, MEADOWSHADE, MEADOWSAGE, MEADOWMOSS, MEADOWPALE, MEADOWDEEP] as const;
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
export const STONEDARK = 48;
export const PAINTOX = 49;
export const PAINTMUSTARD = 50;
export const PAINTTEAL = 51;
export const PAINTCOBALT = 52;
export const PAINTPLUM = 53;
export const SHUTTER = 54;
export const ASPHALT = 55;
export const NEONPINK = 56;
export const NEONRED = 57;
export const NEONGREEN = 58;
export const SIGNWHITE = 59;

// families: geology is grown by the market; agent materials are built by
// the crew; ground is the old world; rise/fall belong to the price ribbon.
const GEOLOGY = new Set([GENESIS, MASS, RUBBLE, MONUMENT, SEED]);
const AGENT = new Set([
  CREAM, CREAMWARM, TEAL, TIMBER, TILE, LEAD, LANTERN, GLASSLIGHT, STILLWATER,
  // the temple register
  TILECHARCOAL, TILERIDGE, PLASTER, VERMILION, FOLIAGE, FOLIAGESUN, BLOSSOM,
  // shared
  STONE, STONEDARK, TIMBERDARK, TIMBERMID, TIMBERLIGHT,
  // the town register
  CONCRETEPALE, CONCRETEMID, CONCRETEDARK, PANELCREAM, PANELBLUE, PANELGREEN,
  GLASSBLUE, INTERIOR, NEONEMBER, NEONCYAN, NEONAMBER, SPILL, VERDIGRIS,
  PAINTOX, PAINTMUSTARD, PAINTTEAL, PAINTCOBALT, PAINTPLUM, SHUTTER, ASPHALT,
  NEONPINK, NEONRED, NEONGREEN, SIGNWHITE,
]);
const GROUND = new Set([...MEADOWS, EARTH, SCARMOSS, CLIFF, CLIFFDEEP, EMBERSEAM]);

export function isGeology(id: number): boolean {
  return GEOLOGY.has(id);
}
export function isAgentMaterial(id: number): boolean {
  return AGENT.has(id);
}
// is this any of the ground's greens
const MEADOW_SET = new Set<number>(MEADOWS);
export function isMeadow(id: number): boolean {
  return MEADOW_SET.has(id);
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
  stonedark: STONEDARK,
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
  paintox: PAINTOX,
  paintmustard: PAINTMUSTARD,
  paintteal: PAINTTEAL,
  paintcobalt: PAINTCOBALT,
  paintplum: PAINTPLUM,
  shutter: SHUTTER,
  asphalt: ASPHALT,
  neonpink: NEONPINK,
  neonred: NEONRED,
  neongreen: NEONGREEN,
  signwhite: SIGNWHITE,
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
