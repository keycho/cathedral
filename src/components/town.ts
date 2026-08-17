// kodo - the town register. the flats, at night, which is the state
// this register was designed for: the buildings read DARK and the light is
// the subject. a shopfront is not a lit box, it is a lamp pointed at a
// street, and the street is what you are actually looking at.
//
// the laws this file exists to enforce:
//
// 1. SIGNAGE IS STRUCTURE. signs project off facades on armatures, stack
//    down building corners, hang across the street on wires and cantilever
//    over the pavement. some are as large as the building carrying them.
//    the lettering is ABSTRACT: stroke patterns that read as writing and
//    are not writing, never real text and never a real mark.
// 2. ERA MIXING ALONG ONE FRONTAGE. a dark timber machiya stands beside a
//    painted modern block beside a stone western facade, because that is
//    what a real street is: a row of decisions made in different decades.
// 3. THIRTY PERCENT BOX, SEVENTY PERCENT ORNAMENT. the box is scaffolding
//    for the awnings, lightboxes, units, shutters, pipes, downspouts,
//    planters, wires, dishes, ladders, vents and bracing. the backs and
//    undersides get the same treatment as the fronts.
// 4. EMISSIVES SPILL. a sign here is a light source: the composition
//    reports its emitters, and whoever places the block bakes their colour
//    onto the surrounding stone and paving. a neon that does not land on
//    anything is a sticker.
// 5. IRREGULAR SILHOUETTE. overhanging upper floors, setbacks, rooftop
//    shacks and gardens, lean-tos, and clutter filling every gap. nothing
//    in this register is a clean rectangular block.

import {
  ASPHALT,
  BLOSSOM,
  CONCRETEDARK,
  CONCRETEMID,
  CONCRETEPALE,
  FOLIAGE,
  GLASSBLUE,
  INTERIOR,
  LANTERN,
  NEONAMBER,
  NEONCYAN,
  NEONEMBER,
  NEONGREEN,
  NEONPINK,
  NEONRED,
  PAINTCOBALT,
  PAINTMUSTARD,
  PAINTOX,
  PAINTPLUM,
  PAINTTEAL,
  SHUTTER,
  SIGNWHITE,
  SPILL,
  STONE,
  STONEDARK,
  TILECHARCOAL,
  TILERIDGE,
  TIMBERDARK,
  TIMBERLIGHT,
  TIMBERMID,
  VERMILION,
} from "../palette";
import { Build, cell, hash, Part, speckle } from "./kit";

// an emitter: a light this composition puts into the world, so the placer
// can bake its spill onto everything around it
export interface Emitter {
  dx: number;
  dy: number;
  dz: number;
  color: number; // the swatch it throws
  reach: number; // blocks
  power: number;
}

export interface TownPiece {
  cells: { dx: number; dy: number; dz: number; m: number }[];
  emitters: Emitter[];
  // the columns a wet film lies on, and how wet each one is
  wet: { dx: number; dz: number; wet: number }[];
  manifest: { component: string; instances: number }[];
  footprint: { w: number; d: number };
  height: number;
}

// a build that also collects the lights it puts up
export class LitBuild extends Build {
  readonly lights: Emitter[] = [];
  lamp(dx: number, dy: number, dz: number, color: number, reach = 7, power = 1): this {
    this.lights.push({ dx, dy, dz, color, reach, power });
    return this;
  }
}

export const NEONS = [NEONPINK, NEONCYAN, NEONAMBER, NEONEMBER, NEONGREEN, NEONRED];
export const PAINTS = [PAINTOX, PAINTMUSTARD, PAINTTEAL, PAINTCOBALT, PAINTPLUM];

// ---- signage ---------------------------------------------------------------

// ONE abstract glyph, in a w x h cell box. strokes, not noise: a stem and
// two or three crossbars with a foot, which is what makes a mark read as
// writing without being any writing. the seed makes it stable per sign.
function glyph(w: number, h: number, seed: number): boolean[][] {
  const g: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  const r = (k: number) => hash(seed, k, 7);
  const stem = 1 + Math.floor(r(1) * Math.max(1, w - 2));
  for (let y = 0; y < h; y++) g[y][stem] = true; // the vertical stroke
  const bars = 2 + Math.floor(r(2) * 2);
  for (let b = 0; b < bars; b++) {
    const y = Math.min(h - 1, Math.floor(((b + 0.5) / bars) * h + r(10 + b) * 0.9));
    const from = Math.floor(r(20 + b) * stem);
    const to = Math.min(w - 1, stem + 1 + Math.floor(r(30 + b) * (w - stem - 1)));
    for (let x = from; x <= to; x++) g[y][x] = true;
  }
  // a foot or a hook, so no two glyphs share a silhouette
  if (r(4) > 0.4) for (let x = 0; x < w; x++) g[h - 1][x] = true;
  if (r(5) > 0.55) for (let y = Math.floor(h / 2); y < h; y++) g[y][Math.max(0, stem - 1)] = true;
  return g;
}

// a VERTICAL BANNER: the tall sign that stacks down a building's corner.
// a DARK panel with lit strokes on it, not a lit panel with dark strokes.
// at one block per mark, a glowing ground is a white rectangle and the
// writing disappears into it; the colour has to come from the strokes.
export function verticalBanner(w: number, h: number, seed: number, neon = NEONPINK): Part {
  const out: Part = [];
  const chars = Math.max(1, Math.floor(h / (w + 1)));
  const ch = Math.floor(h / chars);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out.push(cell(x, h - 1 - y, 0, CONCRETEDARK));
  }
  for (let c = 0; c < chars; c++) {
    const g = glyph(w, ch - 1, seed * 31 + c);
    for (let y = 0; y < ch - 1; y++) {
      for (let x = 0; x < w; x++) {
        if (g[y][x]) out.push(cell(x, h - 1 - (c * ch + y), 0, neon));
      }
    }
  }
  // the frame: a lit edge, which is the one place a white tube belongs
  for (let y = -1; y <= h; y++) {
    out.push(cell(-1, y, 0, SIGNWHITE));
    out.push(cell(w, y, 0, SIGNWHITE));
  }
  return out;
}

// a HORIZONTAL SIGNBOARD, the kind that cantilevers over a pavement
export function signBoard(w: number, h: number, seed: number, neon = NEONAMBER): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) out.push(cell(x, y, 0, CONCRETEDARK));
  const chars = Math.max(1, Math.floor(w / (h + 1)));
  const cw = Math.floor(w / chars);
  for (let c = 0; c < chars; c++) {
    const g = glyph(cw - 1, h, seed * 17 + c);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < cw - 1; x++) if (g[y][x]) out.push(cell(c * cw + x, h - 1 - y, 0, neon));
    }
  }
  // the lit underline takes THE SIGN'S OWN COLOUR. it used to be a white
  // tube, and because it runs the full width it was the largest lit shape
  // on the board — so every sign on the street, whatever colour its glyphs
  // were, was read as a white bar with something written on it.
  for (let x = -1; x <= w; x++) {
    out.push(cell(x, -1, 0, neon));
    out.push(cell(x, h, 0, SHUTTER));
  }
  return out;
}

// a LIGHTBOX: a small illuminated panel, the unit a shopfront is papered in
export function lightbox(w: number, h: number, seed: number, neon = NEONCYAN): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      const r = hash(x, y, seed);
      out.push(cell(x, y, 0, r < 0.42 ? neon : r < 0.55 ? SIGNWHITE : CONCRETEDARK));
    }
  return out;
}

// an ARMATURE: the steel a sign hangs off. the reason a sign reads as
// structure is that you can see what is holding it up.
export function armature(reach: number, h: number): Part {
  const out: Part = [];
  for (let i = 0; i < reach; i++) {
    out.push(cell(i, 0, 0, SHUTTER));
    out.push(cell(i, h, 0, SHUTTER));
  }
  for (let y = 0; y <= h; y++) out.push(cell(reach - 1, y, 0, SHUTTER));
  // the diagonal brace, which is the part that says "this was bolted on"
  for (let k = 1; k < Math.min(reach, h); k++) out.push(cell(k, h - k, 0, SHUTTER));
  return out;
}

// ---- facade parts ----------------------------------------------------------

// a FLOOR SLAB with a proud edge: the horizontal line that separates storeys
export function floorSlab(w: number, d: number, m = CONCRETEMID): Part {
  const out: Part = [];
  for (let x = -1; x <= w; x++) for (let z = -1; z <= d; z++) out.push(cell(x, 0, z, m));
  return out;
}

// a FACADE BAY: the repeating vertical unit of a modern block. a pier, a
// spandrel under the window, glazing, and a head. never a flat wall.
export function facadeBay(w: number, h: number, paint: number, lit: boolean, seed: number): Part {
  const out: Part = [];
  for (let y = 0; y < h; y++) {
    out.push(cell(0, y, 0, CONCRETEDARK)); // the pier
    for (let x = 1; x < w; x++) {
      if (y === 0) out.push(cell(x, y, 0, CONCRETEMID)); // the spandrel
      else if (y === h - 1) out.push(cell(x, y, 0, speckle(paint, CONCRETEDARK, x, y, seed, 0.2)));
      else out.push(cell(x, y, 0, lit ? INTERIOR : GLASSBLUE));
    }
  }
  return out;
}

// a MODERN WINDOW punched in a painted wall, with a sill and a head
export function windowModern(w: number, h: number, lit: boolean): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++) {
    out.push(cell(x, -1, 0, CONCRETEPALE)); // the sill, proud
    out.push(cell(x, h, 0, CONCRETEDARK)); // the head
    for (let y = 0; y < h; y++) out.push(cell(x, y, 0, lit ? INTERIOR : GLASSBLUE));
  }
  return out;
}

// a BALCONY: a slab, a rail, and the things people leave on balconies
export function balcony(w: number, seed: number): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++) {
    out.push(cell(x, 0, 0, CONCRETEMID));
    out.push(cell(x, 0, 1, CONCRETEPALE));
    out.push(cell(x, 1, 1, SHUTTER)); // the rail
    if (hash(x, seed, 3) < 0.3) out.push(cell(x, 1, 0, TIMBERMID)); // something left out
  }
  return out;
}

// an AWNING: a striped canopy on a frame, sloping out over the pavement
export function awning(w: number, reach: number, a: number, b: number): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++) {
    for (let i = 0; i < reach; i++) {
      out.push(cell(x, -Math.floor(i / 2), i, x % 2 === 0 ? a : b));
    }
    // the arm underneath, so the canopy is carried and not floating
    out.push(cell(x, -Math.floor(reach / 2) - 1, reach - 1, SHUTTER));
  }
  return out;
}

// a SHOPFRONT: the ground floor. a stall face, a lit interior behind glass,
// a threshold and a shutter box overhead. this is where the street's light
// actually comes from.
export function shopfront(w: number, h: number, paint: number, seed: number): Part {
  const out: Part = [];
  void paint;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const isDoor = x > w * 0.34 && x < w * 0.66;
      if (y === 0) out.push(cell(x, y, 0, STONEDARK)); // the threshold course
      else if (y === h - 1) out.push(cell(x, y, 0, SHUTTER)); // the shutter box
      else if (isDoor && y < 3) out.push(cell(x, y, 0, SPILL)); // the doorway, throwing light
      else if (x % 3 === 0) out.push(cell(x, y, 0, TIMBERDARK)); // the mullion
      else out.push(cell(x, y, 0, INTERIOR)); // lit glazing
    }
    // the stallboard the goods sit on
    if (hash(x, seed, 11) < 0.5) out.push(cell(x, 1, 1, TIMBERLIGHT));
  }
  return out;
}

// a ROLLING SHUTTER, half down, because half the shops on a street are shut
export function shutterClosed(w: number, h: number, seed: number): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) out.push(cell(x, y, 0, speckle(SHUTTER, CONCRETEDARK, x, y, seed, 0.3)));
  return out;
}

// ---- the seventy percent ---------------------------------------------------

// an AC UNIT on a bracket, and there are always more of these than you think
export function acUnit(seed: number): Part {
  const out: Part = [];
  for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) out.push(cell(0, y, z, SHUTTER));
  out.push(cell(1, 0, 0, SHUTTER)); // the bracket
  out.push(cell(1, 0, 1, SHUTTER));
  if (hash(seed, 1, 2) < 0.5) out.push(cell(0, -1, 1, CONCRETEDARK)); // its drip
  return out;
}

// a PIPE RUN down a facade, with a bend and a bracket
export function pipeRun(h: number, seed: number): Part {
  const out: Part = [];
  const bend = Math.floor(h * (0.3 + hash(seed, 2, 5) * 0.4));
  for (let y = 0; y < h; y++) {
    out.push(cell(0, y, 0, SHUTTER));
    if (y === bend) out.push(cell(1, y, 0, SHUTTER));
    if (y % 4 === 2) out.push(cell(0, y, 1, CONCRETEDARK)); // a bracket into the wall
  }
  return out;
}

// a LADDER up the side or the back
export function ladder(h: number): Part {
  const out: Part = [];
  for (let y = 0; y < h; y++) {
    out.push(cell(0, y, 0, SHUTTER));
    out.push(cell(0, y, 2, SHUTTER));
    if (y % 2 === 0) out.push(cell(0, y, 1, SHUTTER));
  }
  return out;
}

// a ROOFTOP UNIT: a shack, a tank, a dish, an aerial. the silhouette above
// the parapet is what stops a block being a box.
export function rooftopUnit(w: number, d: number, seed: number): Part {
  const out: Part = [];
  const h = 2 + Math.floor(hash(seed, 3, 1) * 2);
  for (let x = 0; x < w; x++)
    for (let z = 0; z < d; z++)
      for (let y = 0; y < h; y++) {
        const shell = x === 0 || z === 0 || x === w - 1 || z === d - 1 || y === h - 1;
        if (shell) out.push(cell(x, y, z, y === h - 1 ? SHUTTER : speckle(CONCRETEDARK, SHUTTER, x, y, z, 0.25)));
      }
  // the water tank on its legs
  for (let y = 0; y < 2; y++) out.push(cell(w, h + y, 0, SHUTTER));
  out.push(cell(w, h - 1, 0, SHUTTER));
  // a dish
  if (hash(seed, 4, 9) < 0.6) {
    out.push(cell(1, h, 1, CONCRETEPALE));
    out.push(cell(1, h + 1, 1, CONCRETEPALE));
  }
  // an aerial
  for (let y = 0; y < 3 + Math.floor(hash(seed, 5, 2) * 3); y++) out.push(cell(w - 1, h + y, d - 1, SHUTTER));
  return out;
}

// a PLANTER, and the things that grow out of the gaps
export function planter(w: number, seed: number): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++) {
    out.push(cell(x, 0, 0, speckle(CONCRETEDARK, STONEDARK, x, seed, 1, 0.3)));
    if (hash(x, seed, 6) < 0.75) out.push(cell(x, 1, 0, FOLIAGE));
  }
  return out;
}

// a WIRE run between two poles, sagging. the wires over a street are half
// of what makes it read as a place people live.
export function wireRun(len: number, sag = 2): Part {
  const out: Part = [];
  for (let i = 0; i < len; i++) {
    const t = (i / (len - 1)) * 2 - 1;
    const y = -Math.round((1 - t * t) * sag);
    out.push(cell(0, y, i, TIMBERDARK));
  }
  return out;
}

// a POLE with its crossarms, transformer and the cables leaving it
export function pole(h: number, seed: number): Part {
  const out: Part = [];
  for (let y = 0; y < h; y++) out.push(cell(0, y, 0, speckle(CONCRETEDARK, SHUTTER, 0, y, seed, 0.2)));
  for (const yy of [h - 1, h - 3]) {
    for (let z = -2; z <= 2; z++) out.push(cell(0, yy, z, SHUTTER));
  }
  out.push(cell(1, h - 5, 0, SHUTTER)); // the transformer
  out.push(cell(1, h - 4, 0, SHUTTER));
  return out;
}

// a STREETLIGHT: a pole, an arm, and a lamp at the end of it
export function streetlight(h: number): Part {
  const out: Part = [];
  for (let y = 0; y < h; y++) out.push(cell(0, y, 0, CONCRETEDARK));
  out.push(cell(0, h, 0, SHUTTER));
  out.push(cell(1, h, 0, SHUTTER));
  out.push(cell(2, h, 0, LANTERN));
  return out;
}

// a VENDING MACHINE: lit, humming, and the single most reliable light on a
// quiet street
export function vendingMachine(seed: number): Part {
  const out: Part = [];
  const neon = NEONS[Math.floor(hash(seed, 7, 3) * NEONS.length)];
  for (let y = 0; y < 3; y++) {
    out.push(cell(0, y, 0, y === 2 ? neon : SIGNWHITE));
    out.push(cell(1, y, 0, y === 2 ? neon : SIGNWHITE));
    out.push(cell(0, y, 1, CONCRETEDARK));
    out.push(cell(1, y, 1, CONCRETEDARK));
  }
  return out;
}

// a BICYCLE, leaned against something
export function bicycle(seed: number): Part {
  const out: Part = [];
  const m = hash(seed, 8, 4) < 0.5 ? SHUTTER : TIMBERDARK;
  out.push(cell(0, 0, 0, m));
  out.push(cell(0, 0, 2, m));
  out.push(cell(0, 1, 1, m));
  out.push(cell(0, 1, 2, m));
  out.push(cell(0, 2, 2, m)); // the bars
  return out;
}

// a STALL under an awning: a counter, stools, and stacked goods
export function stall(w: number, seed: number): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++) {
    out.push(cell(x, 1, 0, TIMBERLIGHT)); // the counter
    out.push(cell(x, 0, 0, TIMBERDARK));
    if (hash(x, seed, 12) < 0.5) out.push(cell(x, 1, 2, TIMBERMID)); // a stool
    if (hash(x, seed, 13) < 0.35) out.push(cell(x, 2, 0, VERMILION)); // stacked goods
  }
  out.push(cell(0, 2, 0, LANTERN)); // the lamp over the counter
  return out;
}

// CRATES and bins stacked outside a shopfront
export function crates(seed: number): Part {
  const out: Part = [];
  const n = 2 + Math.floor(hash(seed, 9, 6) * 3);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash(seed, i, 14) * 2);
    const z = Math.floor(hash(seed, i, 15) * 2);
    const h = 1 + Math.floor(hash(seed, i, 16) * 2);
    for (let y = 0; y < h; y++) out.push(cell(x, y, z, y % 2 ? TIMBERMID : TIMBERLIGHT));
  }
  return out;
}

// ---- the street ------------------------------------------------------------

// STREET PAVING: asphalt, with the drains and the patches that make it
// asphalt and not a grey rectangle
export function streetPaving(w: number, d: number, seed: number): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++)
    for (let z = 0; z < d; z++) {
      let m = speckle(ASPHALT, CONCRETEDARK, x, z, seed, 0.18);
      if ((x + z * 3) % 17 === 0) m = STONEDARK; // a patch
      out.push(cell(x, 0, z, m));
    }
  return out;
}

// a KERB with its gutter and the occasional drain
export function kerb(d: number, seed: number): Part {
  const out: Part = [];
  for (let z = 0; z < d; z++) {
    out.push(cell(0, 0, z, z % 9 === 4 ? SHUTTER : speckle(STONE, STONEDARK, 0, z, seed, 0.3)));
  }
  return out;
}

// PAVEMENT: flagged, with tactile bands at the crossings
export function pavement(w: number, d: number, seed: number): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++)
    for (let z = 0; z < d; z++) out.push(cell(x, 0, z, speckle(CONCRETEPALE, CONCRETEMID, x, z, seed, 0.28)));
  return out;
}

// ---- the seam at street scale ----------------------------------------------

// a TORII, small, the kind that stands in a gap between two shopfronts
export function torii(w: number, h: number): Part {
  const out: Part = [];
  for (let y = 0; y < h; y++) {
    out.push(cell(0, y, 0, VERMILION));
    out.push(cell(w - 1, y, 0, VERMILION));
  }
  for (let x = -1; x <= w; x++) out.push(cell(x, h, 0, VERMILION)); // the tie beam
  for (let x = -2; x <= w + 1; x++) out.push(cell(x, h + 2, 0, VERMILION)); // the lintel
  for (let x = -1; x <= w; x++) out.push(cell(x, h + 1, 0, VERMILION));
  return out;
}

// a SHRINE at the end of an alley: a stone base, a small tiled roof, a pair
// of lanterns and the red of the torii repeated. this is the temple
// register reaching down into the town, at the scale it actually happens.
export function alleyShrine(seed: number): Part {
  const out: Part = [];
  for (let x = 0; x < 3; x++) for (let z = 0; z < 2; z++) out.push(cell(x, 0, z, STONE));
  for (let x = 0; x < 3; x++) {
    out.push(cell(x, 1, 0, TIMBERDARK));
    out.push(cell(x, 2, 0, VERMILION));
    out.push(cell(x, 3, 0, TILECHARCOAL));
  }
  for (let x = -1; x <= 3; x++) out.push(cell(x, 4, 0, TILECHARCOAL));
  for (let x = 0; x < 3; x++) out.push(cell(x, 5, 0, TILERIDGE));
  out.push(cell(-1, 1, 0, LANTERN));
  out.push(cell(3, 1, 0, LANTERN));
  void seed;
  return out;
}

// a BLOSSOM TREE, and in this register it is a LIGHT: the canopy is lit
// from below by whatever neon it stands in front of, so the underside
// carries the colour and the mass above it stays pink.
export function blossomTree(h: number, spread: number, seed: number): Part {
  const out: Part = [];
  for (let y = 0; y < h; y++) out.push(cell(0, y, 0, y > h - 3 ? TIMBERMID : TIMBERDARK));
  // two or three canopy layers with broken edges
  for (let layer = 0; layer < 3; layer++) {
    const r = spread - layer * 0.6;
    const y = h - 1 + layer;
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
        const d = Math.hypot(dx, dz);
        if (d > r) continue;
        if (d > r - 1 && hash(dx, dz, seed + layer) < 0.42) continue;
        out.push(cell(dx, y, dz, BLOSSOM));
      }
    }
  }
  return out;
}
