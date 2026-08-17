// kodo - the component catalogue: the architect's actual vocabulary.
//
// the architect used to write a blueprint as six hundred raw cells, one
// coordinate and one material name at a time. it could say "put a stone
// here" and it could not say "put a swept roof here", so every roof it
// drew was a stack of boxes and every tower was a slab — while the mason's
// own compositions, which import this kit, got course-by-course roofs and
// braced frames from the same materials. the difference was never the
// designer. it was that one of them had parts and the other had pixels.
//
// so the blueprint format is a COMPOSITION now: an ordered list of
// component calls with their parameters and where they go. the architect
// never places a raw cell again. this file is the registry both sides
// agree on — it expands a call into cells for the mason, and it writes its
// own description for the prompt, so the vocabulary the architect is told
// about cannot drift from the vocabulary that exists.

import { AGENT_KEYS } from "../palette";
import type { Cell, Part } from "./kit";
import { Build } from "./kit";
import * as canal from "./canal";
import * as compose from "./compose";
import * as temple from "./temple";
import * as town from "./town";
import * as trees from "./trees";
import * as clutter from "./clutter";

// how a parameter is read off the wire. everything is a number on the
// wire; the kind says what that number means and what a legal one is.
type Kind = "int" | "material" | "bool" | "axis" | "side";

interface Param {
  name: string;
  kind: Kind;
  min?: number;
  max?: number;
  def: number | string | boolean;
}

interface Entry {
  fn: (...a: never[]) => Part | Build;
  register: "temple" | "town" | "canal" | "any";
  params: Param[];
  note: string;
}

const i = (name: string, min: number, max: number, def: number): Param => ({ name, kind: "int", min, max, def });
const seed = (): Param => ({ name: "seed", kind: "int", min: 0, max: 999, def: 7 });
const mat = (name: string, def: string): Param => ({ name, kind: "material", def });
const bool = (name: string, def: boolean): Param => ({ name, kind: "bool", def });
const axis = (): Param => ({ name: "axis", kind: "axis", def: "x" });

// the vocabulary. every entry is a real exported part; the ranges are the
// span over which that part still makes sense, not the span over which it
// happens not to throw.
export const CATALOGUE: Record<string, Entry> = {
  // ---- temple register ----------------------------------------------------
  podium: { fn: temple.podium, register: "temple", params: [i("w", 3, 29, 9), i("d", 3, 29, 9), i("courses", 1, 5, 2)], note: "the stone base a hall stands on, stepped" },
  stair: { fn: temple.stair, register: "temple", params: [i("width", 2, 15, 5), i("steps", 2, 20, 6), mat("m", "stone")], note: "a flight, one tread per step" },
  templeColumn: { fn: temple.templeColumn, register: "temple", params: [i("h", 3, 14, 6)], note: "a timber post with its stone footing" },
  bracketSet: { fn: temple.bracketSet, register: "temple", params: [i("reach", 1, 4, 2)], note: "the exposed bracket that carries an eave off a column" },
  wallPanel: { fn: temple.wallPanel, register: "temple", params: [i("width", 2, 20, 4), i("h", 2, 10, 4)], note: "plaster infill between posts, with sill and head rail" },
  latticeWindow: { fn: temple.latticeWindow, register: "temple", params: [i("width", 2, 8, 3), i("h", 2, 6, 3)], note: "a timber lattice opening" },
  door: { fn: temple.door, register: "temple", params: [i("width", 1, 6, 2), i("h", 2, 6, 3)], note: "a doorway, so a work can be entered" },
  sweptRoof: { fn: temple.sweptRoof, register: "temple", params: [i("span", 5, 29, 11), i("courses", 2, 8, 4)], note: "tile laid course by course with the corners swept up" },
  eaveCourse: { fn: temple.eaveCourse, register: "temple", params: [i("span", 3, 29, 11)], note: "the course that finishes the LOWER edge of a roof. it goes at the roof's own y, level with its first course — not above it. a roof does not need one; put it on when you want the eave line picked out" },
  finial: { fn: temple.finial, register: "temple", params: [i("h", 2, 8, 4)], note: "the verdigris crown on a roof" },
  courtyardPaving: { fn: temple.courtyardPaving, register: "temple", params: [i("w", 3, 29, 15), i("d", 3, 29, 15)], note: "a paved court" },
  wallWithCap: { fn: temple.wallWithCap, register: "temple", params: [i("len", 3, 29, 12), i("h", 2, 8, 3), axis()], note: "a boundary wall with a tiled cap" },
  gate: { fn: temple.gate, register: "temple", params: [i("width", 3, 11, 5), i("h", 3, 10, 5)], note: "a roofed gateway; the thing an approach runs through" },
  stoneLantern: { fn: temple.stoneLantern, register: "temple", params: [], note: "a lit stone lantern, the temple's light unit" },
  basin: { fn: temple.basin, register: "temple", params: [i("r", 1, 5, 2)], note: "a water basin, laid flat" },
  bell: { fn: temple.bell, register: "temple", params: [], note: "a hung bronze bell" },
  gardenBed: { fn: temple.gardenBed, register: "temple", params: [i("w", 2, 20, 5), i("d", 2, 20, 4)], note: "planting: moss and low green, for the GROUNDS not the building" },
  ornamentalTree: { fn: temple.ornamentalTree, register: "temple", params: [i("height", 3, 12, 5), i("spread", 1, 5, 2), bool("blossoming", false)], note: "a canopy tree; blossoming turns it pink" },
  retainingWall: { fn: temple.retainingWall, register: "temple", params: [i("len", 3, 29, 12), i("h", 2, 12, 4), axis()], note: "holds a terrace back against a slope" },
  // THE TIER, IN ITS THREE REAL PIECES. pagodaTier builds a whole small
  // building including its own podium and roof, so it could not be stacked
  // and could not be afforded; these can be both. each note carries the
  // offset to the next piece, because a part you cannot place without
  // guessing is not usable.
  tierPodium: { fn: compose.tierPodium, register: "temple", params: [i("span", 5, 25, 11), i("courses", 1, 4, 2)], note: "the stone base of a tier and the flight that climbs it. (span+4) square. the body goes on it at (x+2, y+courses, z+2)" },
  tierBody: { fn: compose.tierBody, register: "temple", params: [i("span", 5, 25, 11), i("storey", 4, 9, 6)], note: "ONE STOREY: posts, plaster infill, door, lattice windows, the beam course and the bracket sets that carry the eave. span square. its roof goes on at (x-1, y+storey+3, z-1)" },
  // the roof's own height is ceil((span+6)/2) and BOTH things that go above
  // it are placed off that number. the first run to get the documented
  // offsets right still put its second storey three blocks up inside a
  // nine-block roof, and its finial three blocks above the ridge, because
  // those two offsets were the ones the note left out. an offset you do not
  // write down is an offset that gets guessed.
  tierRoof: { fn: compose.tierRoof, register: "temple", params: [i("span", 5, 25, 11)], note: "the swept roof for a body of that span, overhanging three every side. (span+6) square, and ceil((span+6)/2) TALL — so a span 11 roof is 9 tall. whatever goes above it goes at y + that height: the next tierBody (at a smaller span) or, on the last one, the finial. no gap and no overlap" },
  pagodaTier: { fn: compose.pagodaTier, register: "temple", params: [i("span", 7, 27, 11), i("storey", 4, 9, 6)], note: "all three pieces at once as a COMPLETE single-storey hall, podium and roof and finial included. convenient but expensive and it cannot be stacked — for anything taller than one storey use tierPodium + tierBody + tierRoof" },
  // templeGrounds IS NOT IN THE VOCABULARY. it costs 723 blocks at its
  // smallest and 1615 at its default, so every cycle that reached for it
  // spent a whole allowance on a courtyard and had nothing left for the
  // building meant to stand in it. the function stays — the standing gate
  // piece is built from it — but the architect lays grounds from the pieces
  // below, which are affordable, composable, and can be sized to what is
  // left after the building is paid for.

  // ---- town register ------------------------------------------------------
  floorSlab: { fn: town.floorSlab, register: "town", params: [i("w", 2, 29, 8), i("d", 2, 29, 8), mat("m", "concretemid")], note: "a storey plate with a proud edge: the horizontal line between floors" },
  facadeBay: { fn: town.facadeBay, register: "town", params: [i("w", 2, 12, 3), i("h", 2, 8, 3), mat("paint", "panelcream"), bool("lit", true), seed()], note: "one bay of an upper facade, with a window" },
  windowModern: { fn: town.windowModern, register: "town", params: [i("w", 1, 8, 2), i("h", 1, 6, 2), bool("lit", true)], note: "a modern window; lit gives it warm interior glow" },
  shopfront: { fn: town.shopfront, register: "town", params: [i("w", 2, 12, 4), i("h", 2, 6, 3), mat("paint", "panelcream"), seed()], note: "a ground-floor shopfront that pours light onto the pavement" },
  shutterClosed: { fn: town.shutterClosed, register: "town", params: [i("w", 2, 12, 4), i("h", 2, 6, 3), seed()], note: "a rolling shutter, for the shop that is shut" },
  balcony: { fn: town.balcony, register: "town", params: [i("w", 2, 8, 3), seed()], note: "a projecting balcony with a rail" },
  awning: { fn: town.awning, register: "town", params: [i("w", 2, 20, 6), i("reach", 1, 5, 3), mat("a", "vermilion"), mat("b", "plaster")], note: "a striped awning over a frontage" },
  signBoard: { fn: town.signBoard, register: "town", params: [i("w", 3, 20, 8), i("h", 2, 6, 3), seed(), mat("neon", "neonamber")], note: "a horizontal board that cantilevers over the pavement. abstract glyphs, never real writing" },
  verticalBanner: { fn: town.verticalBanner, register: "town", params: [i("w", 2, 5, 3), i("h", 4, 24, 14), seed(), mat("neon", "neonpink")], note: "the tall sign stacked down a building's corner. make one as tall as the building carrying it" },
  lightbox: { fn: town.lightbox, register: "town", params: [i("w", 2, 20, 6), i("h", 1, 4, 2), seed(), mat("neon", "neoncyan")], note: "an illuminated panel; paper a whole face in them" },
  armature: { fn: town.armature, register: "town", params: [i("reach", 2, 5, 3), i("h", 1, 4, 2)], note: "the braced steel a sign hangs off. a sign reads as structure because you can see what holds it up" },
  acUnit: { fn: town.acUnit, register: "town", params: [seed()], note: "a bolted-on air conditioner" },
  pipeRun: { fn: town.pipeRun, register: "town", params: [i("h", 3, 25, 10), seed()], note: "a downpipe running the height of a wall" },
  ladder: { fn: town.ladder, register: "town", params: [i("h", 3, 25, 10)], note: "an external ladder" },
  rooftopUnit: { fn: town.rooftopUnit, register: "town", params: [i("w", 2, 8, 3), i("d", 2, 8, 3), seed()], note: "a shack, tank or plant box on a roof — the irregular silhouette" },
  planter: { fn: town.planter, register: "town", params: [i("w", 1, 6, 2), seed()], note: "a street planter" },
  wireRun: { fn: town.wireRun, register: "town", params: [i("len", 4, 40, 16), i("sag", 0, 4, 2)], note: "a slung cable between two poles" },
  pole: { fn: town.pole, register: "town", params: [i("h", 4, 20, 12), seed()], note: "a utility pole with its crossarms" },
  streetlight: { fn: town.streetlight, register: "town", params: [i("h", 3, 12, 7)], note: "a street lamp on a bent arm" },
  vendingMachine: { fn: town.vendingMachine, register: "town", params: [seed()], note: "a lit vending machine" },
  bicycle: { fn: town.bicycle, register: "town", params: [seed()], note: "a parked bicycle" },
  // ---- eye height, either register ----------------------------------------
  // what a person standing in the place actually sees. ground-level frames
  // came back legible and EMPTY: paving, a wall, a hall, nothing between the
  // camera and the building.
  bench: { fn: clutter.bench, register: "any", params: [i("len", 2, 9, 4), seed()], note: "a plank bench, with a back if it is long enough to want one" },
  hangingLanterns: { fn: clutter.hangingLanterns, register: "any", params: [i("len", 3, 24, 9), seed()], note: "paper lanterns strung on a cord at head height, running along x. hung low they read as a street rather than as roof decoration" },
  threshold: { fn: clutter.threshold, register: "any", params: [i("w", 1, 5, 2), i("h", 2, 5, 3), seed()], note: "a doorway with the room BEHIND it lit, and a noren across the head. the cheapest interior there is, and it says the building is occupied" },
  brazier: { fn: clutter.brazier, register: "any", params: [seed()], note: "a small bowl on a plinth, lit. something warm at the end of an approach" },
  lowWall: { fn: clutter.lowWall, register: "any", params: [i("len", 2, 28, 8), axis(), seed()], note: "a knee wall: divides a court without closing it" },
  stepBank: { fn: clutter.stepBank, register: "any", params: [i("w", 2, 28, 8), axis(), seed()], note: "a change of level across a court. the single most effective thing for stopping paving reading as a slab" },
  paveBed: { fn: clutter.paveBed, register: "any", params: [i("w", 3, 14, 5), i("d", 3, 14, 4), seed()], note: "a planting bed sunk into paving, kerbed" },
  courtFeature: { fn: clutter.courtFeature, register: "any", params: [seed()], note: "the thing in the middle of a court: a tree in a ring, a bowl on a plinth, or a lantern with a bed at its foot. place it at the CENTRE of the court, not at a corner" },
  stall: { fn: town.stall, register: "town", params: [i("w", 2, 12, 5), seed()], note: "a lean-to market stall" },
  crates: { fn: town.crates, register: "town", params: [seed()], note: "stacked goods left outside a shop" },
  streetPaving: { fn: town.streetPaving, register: "town", params: [i("w", 2, 29, 8), i("d", 2, 44, 20), seed()], note: "the road surface" },
  kerb: { fn: town.kerb, register: "town", params: [i("d", 2, 44, 20), seed()], note: "the kerb line between pavement and road" },
  pavement: { fn: town.pavement, register: "town", params: [i("w", 1, 10, 3), i("d", 2, 44, 20), seed()], note: "a footway" },
  torii: { fn: town.torii, register: "any", params: [i("w", 2, 8, 3), i("h", 3, 10, 4)], note: "a vermilion gate. put one down an alley and light it red" },
  alleyShrine: { fn: town.alleyShrine, register: "any", params: [seed()], note: "a small shrine, glimpsed between buildings" },
  // ---- trees, which are buildings ----------------------------------------
  // in the references more than half the frame is tree and rock, and the
  // trees carry the composition. these are built the way a roof is built —
  // a trunk that tapers and forks, canopies laid course by course — so a
  // grove is a piece of architecture rather than ground cover.
  conifer: { fn: trees.coniferTree, register: "any", params: [i("h", 12, 30, 22), seed()], note: "a columnar evergreen: whorls shrinking with height, bare spar on top. plant these in stands on a hillside" },
  broadleaf: { fn: trees.broadleafTree, register: "any", params: [i("h", 10, 22, 16), seed()], note: "a thick bole forking into limbs that fork again, under one wide lumpy dome. the shade tree for a court" },
  blossomCanopy: { fn: trees.blossomTreeBig, register: "any", params: [i("h", 9, 18, 13), seed()], note: "the same architecture in PINK, lower and wider. the single highest-impact object you can plant — put one where it will be seen against dark timber" },
  autumnTree: { fn: trees.autumnTree, register: "any", params: [i("h", 10, 19, 15), seed()], note: "a broadleaf that has turned: ember canopy" },
  weepingTree: { fn: trees.weepingTree, register: "any", params: [i("h", 10, 18, 14), seed()], note: "limbs reaching level then hanging curtains of leaf. plant at a water edge" },
  pineTree: { fn: trees.pineTree, register: "any", params: [i("h", 10, 20, 15), seed()], note: "the windswept specimen: leaning kinked trunk, flat plates of needle. the tree a temple court is built around" },
  cedarTree: { fn: trees.cedarTree, register: "any", params: [i("h", 18, 34, 26), seed()], note: "very tall and narrow, a dark column. line a ridge or an avenue with these" },
  mapleTree: { fn: trees.mapleTree, register: "any", params: [i("h", 7, 14, 10), seed()], note: "small, red, wide for its height. the courtyard specimen" },
  ancientTree: { fn: trees.ancientTree, register: "any", params: [i("h", 13, 24, 18), seed()], note: "gnarled, with buttressed roots. build a shrine beside one" },
  bambooStand: { fn: trees.bambooStand, register: "any", params: [i("count", 8, 40, 26), i("spread", 2, 8, 4), seed()], note: "a THICKET of single-block culms with leaf sprays near their tops — no trunk, which is why it reads as bamboo. plant at water and in gaps between buildings" },

  blossomTree: { fn: town.blossomTree, register: "any", params: [i("h", 3, 12, 5), i("spread", 2, 5, 3), seed()], note: "a pink canopy. stand one in front of signage and it takes the colour" },

  // ---- water --------------------------------------------------------------
  canalWall: { fn: canal.canalWall, register: "any", params: [i("len", 4, 40, 20), i("depth", 1, 6, 3), { name: "side", kind: "side", def: 1 }], note: "a dressed canal edge; side is 1 or -1 for which bank" },
  waterStair: { fn: canal.waterStair, register: "any", params: [i("width", 2, 10, 4), i("depth", 1, 6, 3)], note: "steps down into water" },
  mooringPost: { fn: canal.mooringPost, register: "any", params: [i("h", 2, 6, 3)], note: "a post to tie a boat to" },
  bankPaving: { fn: canal.bankPaving, register: "any", params: [i("len", 4, 40, 20), i("width", 1, 6, 2)], note: "the walkway along a bank" },
  bankRail: { fn: canal.bankRail, register: "any", params: [i("len", 4, 40, 20), i("spacing", 2, 8, 4)], note: "a rail with posts along a bank" },
  lampPost: { fn: canal.lampPost, register: "any", params: [i("h", 3, 8, 4)], note: "a lit post" },
  moonBridge: { fn: canal.moonBridge, register: "any", params: [i("span", 5, 25, 11), i("width", 3, 9, 5), i("rise", 1, 6, 3)], note: "an arched bridge that rises over water" },
  boat: { fn: canal.boat, register: "any", params: [i("len", 3, 9, 5)], note: "a moored boat" },
};

// ---- reading a call off the wire --------------------------------------------

export interface PartCall {
  c: string; // component name
  x: number;
  y: number;
  z: number;
  r: number; // quarter turns about y: 0, 1, 2, 3
  a: (number | string | boolean)[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

// a parameter arrives as whatever the model wrote. coerce it to the thing
// the part actually takes, and CLAMP rather than reject: one number out of
// range should cost a sensible span, not the whole design.
function coerce(p: Param, raw: unknown): number | string | boolean {
  if (raw === undefined || raw === null) return p.def;
  switch (p.kind) {
    case "material": {
      const key = String(raw).toLowerCase();
      return AGENT_KEYS[key] ?? AGENT_KEYS[String(p.def)] ?? AGENT_KEYS.stone;
    }
    case "bool":
      return raw === true || raw === 1 || raw === "true";
    case "axis":
      return String(raw).toLowerCase() === "z" ? "z" : "x";
    case "side":
      return Number(raw) < 0 ? -1 : 1;
    default: {
      const n = Number(raw);
      if (!Number.isFinite(n)) return p.def;
      return clamp(n, p.min ?? 0, p.max ?? 64);
    }
  }
}

// a material param's DEFAULT is written as a name; turn it into an id the
// same way a supplied one is turned into an id
function defaulted(p: Param): number | string | boolean {
  if (p.kind === "material") return AGENT_KEYS[String(p.def)] ?? AGENT_KEYS.stone;
  return p.def;
}

const ROT: Record<number, (c: Cell) => Cell> = {
  0: (c) => c,
  1: (c) => ({ dx: -c.dz, dy: c.dy, dz: c.dx, m: c.m }),
  2: (c) => ({ dx: -c.dx, dy: c.dy, dz: -c.dz, m: c.m }),
  3: (c) => ({ dx: c.dz, dy: c.dy, dz: -c.dx, m: c.m }),
};

// expand one call into cells in the site's local frame. returns null if the
// component is not in the catalogue at all — that is the one thing worth
// rejecting, because it means the design is naming something imaginary.
export function expandCall(call: PartCall): Cell[] | null {
  const entry = CATALOGUE[call.c];
  if (!entry) return null;
  const args = entry.params.map((p, k) => (k < call.a.length ? coerce(p, call.a[k]) : defaulted(p)));
  let out: Part;
  try {
    const made = (entry.fn as (...a: unknown[]) => Part | Build)(...args);
    out = made instanceof Build ? made.ordered : made;
  } catch {
    return null; // a part that throws on its own arguments is not a part we place
  }
  const turn = ROT[((call.r % 4) + 4) % 4];
  return out.map((c) => {
    const t = turn(c);
    return { dx: t.dx + call.x, dy: t.dy + call.y, dz: t.dz + call.z, m: t.m };
  });
}

// read the wire form. the compact array is the one the architect is asked
// for — [name, x, y, z, rot, ...args] — because a composition written as
// objects spends a third of its tokens on punctuation. objects are
// tolerated because a model that ignores the instruction is not a reason to
// throw the design away.
export function readCall(raw: unknown): PartCall | null {
  if (Array.isArray(raw)) {
    if (raw.length < 5 || typeof raw[0] !== "string") return null;
    const [c, x, y, z, r, ...a] = raw as [string, number, number, number, number, ...unknown[]];
    if (![x, y, z, r].every((n) => Number.isFinite(Number(n)))) return null;
    return { c, x: Math.round(Number(x)), y: Math.round(Number(y)), z: Math.round(Number(z)), r: Number(r) | 0, a: a as (number | string | boolean)[] };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const c = String(o.c ?? o.component ?? "");
    if (!c) return null;
    return {
      c,
      x: Math.round(Number(o.x ?? 0)),
      y: Math.round(Number(o.y ?? 0)),
      z: Math.round(Number(o.z ?? 0)),
      r: Number(o.r ?? 0) | 0,
      a: Array.isArray(o.a) ? (o.a as (number | string | boolean)[]) : [],
    };
  }
  return null;
}

// ---- what the architect is told ---------------------------------------------

// the catalogue describes itself, and the description travels in the
// payload, so the vocabulary in the prompt is the vocabulary in the code by
// construction rather than by anyone remembering to update both.
// what a part COSTS, measured by building it at its default size rather
// than estimated. the architect has a block budget and no way to guess that
// templeGrounds is eight hundred stones and a bracketSet is nine; the first
// composition written without these numbers spent its entire allowance on a
// courtyard and had nothing left for the hall that was supposed to stand in
// it. a part whose cost is unknown is a part that gets misused.
function cellsAt(e: Entry, pick: (p: Param) => number | string | boolean): Cell[] {
  try {
    const made = (e.fn as (...a: unknown[]) => Part | Build)(...e.params.map(pick));
    return made instanceof Build ? made.ordered : made;
  } catch {
    return [];
  }
}

const costAt = (e: Entry, pick: (p: Param) => number | string | boolean) => cellsAt(e, pick).length;

// HOW BIG THE PART IS, and where its top is. the architect has to stack
// these vertically and the catalogue told it nothing about height, so it
// guessed: one design put a finial four blocks above the roof it was
// supposed to crown, and it hung there. a part you cannot measure is a part
// you cannot stack.
function sizeOf(e: Entry): { w: number; h: number; d: number; y0: number } | null {
  const cells = cellsAt(e, defaulted);
  if (!cells.length) return null;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const c of cells) {
    x0 = Math.min(x0, c.dx); x1 = Math.max(x1, c.dx);
    y0 = Math.min(y0, c.dy); y1 = Math.max(y1, c.dy);
    z0 = Math.min(z0, c.dz); z1 = Math.max(z1, c.dz);
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, d: z1 - z0 + 1, y0 };
}

// TWO costs, because one is a trap. a part whose price barely moves with its
// span and a part that quadruples look identical when you quote a single
// number, and the difference decides whether a design fits: pagodaTier is a
// thousand blocks at its default span and a quarter of that at its smallest,
// which is the difference between a pagoda and nothing.
function costOf(e: Entry): { def: number; min: number; max: number } {
  return {
    def: costAt(e, defaulted),
    min: costAt(e, (p) => (p.kind === "int" && p.name !== "seed" ? (p.min ?? 1) : defaulted(p))),
    max: costAt(e, (p) => (p.kind === "int" && p.name !== "seed" ? (p.max ?? 32) : defaulted(p))),
  };
}

export function catalogueText(register: "temple" | "town"): string {
  const lines: string[] = [];
  for (const [name, e] of Object.entries(CATALOGUE)) {
    if (e.register !== register && e.register !== "any") continue;
    const sig = e.params
      .map((p) => {
        if (p.kind === "material") return `${p.name}:material=${p.def}`;
        if (p.kind === "bool") return `${p.name}:0|1`;
        if (p.kind === "axis") return `${p.name}:"x"|"z"`;
        if (p.kind === "side") return `${p.name}:1|-1`;
        if (p.name === "seed") return `seed:0-999`;
        return `${p.name}:${p.min}-${p.max}`;
      })
      .join(", ");
    const c = costOf(e);
    // THREE POINTS ON THE CURVE, not two. these parts cost roughly the
    // square of their span, and quoting only the smallest and the default
    // invites a straight line between them: one design picked span 9 for a
    // tier, read across from 86 blocks at span 5 and 409 at span 11, and
    // put its podium and body alone at 546 of a 600 budget — so the roof
    // did not fit and the hall came out open to the sky. the third number
    // is what makes the curve visible.
    const price =
      c.min !== c.def || c.max !== c.def
        ? `~${c.min} smallest / ~${c.def} default / ~${c.max} largest`
        : `~${c.def} blocks`;
    const s = sizeOf(e);
    // the size at default parameters, and where the part's own cells start
    // relative to the y it is placed at, so the next thing up can be put on
    // top of it rather than guessed at
    const size = s ? `, ${s.w}x${s.d} and ${s.h} tall${s.y0 !== 0 ? ` starting at y${s.y0 >= 0 ? "+" : ""}${s.y0}` : ""}` : "";
    lines.push(`${name}(${sig}) [${price}${size}] — ${e.note}`);
  }
  return lines.join("\n");
}

// THE ALLOWANCE TRAVELS WITH THE REQUEST, NOT WITH THE CATALOGUE. it was
// written into the catalogue text, which is the system prompt — so the
// system prompt changed on every single call and not one token of a 12k
// prefix was ever cacheable. measured across fifteen consecutive designs:
// cache_read_input_tokens 0, every time. the vocabulary is the stable part
// and the number is the varying part; they go in different places.
export function scaleText(register: "temple" | "town", budget: number): string {
  if (budget <= 0) return "";
  const lines: string[] = [];
  // THE ALLOWANCE IS A TARGET, NOT A FENCE. the budget was raised from
  // ~900 to 2400/3000 and the first three works after the raise came back
  // at 624, 788 and 579 cells with nothing dropped — the ceiling moved and
  // the designs did not, because nothing ever told the architect that a
  // quarter of its allowance is a small building. it reads the quoted costs
  // exactly and guesses at everything the catalogue leaves unsaid, which is
  // the pattern behind every fault this interface has had.
  {
    const floor = Math.round(budget * 0.6);
    lines.push("");
    lines.push(`SCALE. your allowance for this work is ${budget} blocks. spend it.`);
    lines.push(
      `add the quoted costs of your parts as you go and keep building until the total is at least ~${floor}. ` +
        `a work that lands near ${Math.round(budget * 0.25)} is a shed on a site that could hold a hall.`
    );
    lines.push(
      register === "temple"
        ? `a hall at this allowance is a podium, TWO OR THREE stacked tiers with their roofs, stairs sized to the climb, and grounds around it — walls, gates, lanterns, planting. not one storey and a roof.`
        : `a street at this allowance is FOUR OR FIVE buildings along one frontage, each with its own signage and upper storeys, plus the paving, wires, furniture and trees between them. not two shopfronts.`
    );
    lines.push(
      `ORDER MATTERS: if the total overruns, everything from the first part that does not fit is dropped. put foundations, storeys and roofs first and ornament last, so an overrun costs you lanterns and not a roof.`
    );
  }
  return lines.join("\n");
}

