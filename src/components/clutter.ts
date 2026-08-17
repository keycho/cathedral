// kodo - eye height. the register files build the architecture; this
// one builds what is at the height of a person standing in it.
//
// the frames that came back from ground level were legible and empty: a
// paved court, a wall, a hall, and nothing between the camera and the
// building. a settlement is read at eye height by the things that are NOT
// architecture — a bench, a stack of crates, a doorway with a light on
// behind it, a lantern hung low enough to sit in front of a wall rather
// than above it. they cost twenty blocks each and they are most of what
// makes a place look inhabited.
//
// the other half of this file is the opposite problem: a court over about
// eight blocks across is a slab whatever it is made of. steps, beds, a knee
// wall and something in the middle to look at are what turn one into a
// place, and they are laid by rule rather than designed, because the thing
// that knows a court is too big is the thing that laid it.

import {
  BLOSSOM,
  CONCRETEMID,
  FOLIAGE,
  FOLIAGESUN,
  INTERIOR,
  LANTERN,
  PLASTER,
  SCARMOSS,
  STONE,
  STONEDARK,
  TIMBERDARK,
  TIMBERLIGHT,
  TIMBERMID,
  VERMILION,
} from "../palette";
import { cell, type Part } from "./kit";

function hash(a: number, b: number, c = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

// ---- things at eye height --------------------------------------------------

// a BENCH: a plank on legs, with a back if it is long enough to want one
export function bench(len: number, seed: number): Part {
  const out: Part = [];
  const n = Math.max(2, Math.min(9, len));
  const backed = hash(seed, 1, 2) < 0.6;
  for (let x = 0; x < n; x++) {
    out.push(cell(x, 1, 0, TIMBERLIGHT));
    if (x === 0 || x === n - 1) out.push(cell(x, 0, 0, TIMBERDARK));
    if (backed) out.push(cell(x, 2, 1, TIMBERMID));
  }
  return out;
}

// PAPER LANTERNS ON A CORD, strung low. hung at eave height they read as
// part of the roof; hung at head height they read as a street.
export function hangingLanterns(len: number, seed: number): Part {
  const out: Part = [];
  for (let x = 0; x < len; x++) {
    out.push(cell(x, 3, 0, TIMBERDARK)); // the cord
    if (x % 2 === 0 && hash(seed, x, 3) < 0.8) {
      out.push(cell(x, 2, 0, LANTERN));
      if (hash(seed, x, 4) < 0.3) out.push(cell(x, 1, 0, VERMILION));
    }
  }
  return out;
}

// A THRESHOLD: a doorway with the room behind it LIT. this is the cheapest
// interior there is — four blocks of glow behind a frame — and it does the
// thing an interior is for, which is to say that the building is occupied.
export function threshold(w: number, h: number, seed: number): Part {
  const out: Part = [];
  const wide = Math.max(1, Math.min(5, w));
  const tall = Math.max(2, Math.min(5, h));
  for (let y = 0; y < tall; y++) {
    out.push(cell(-1, y, 0, TIMBERDARK));
    out.push(cell(wide, y, 0, TIMBERDARK));
    // the room behind, one course back
    for (let x = 0; x < wide; x++) out.push(cell(x, y, 1, INTERIOR));
  }
  for (let x = -1; x <= wide; x++) out.push(cell(x, tall, 0, TIMBERMID)); // the lintel
  // a noren curtain across the top of the opening, which is what stops it
  // reading as a hole
  if (hash(seed, 2, 5) < 0.75) {
    for (let x = 0; x < wide; x++) {
      out.push(cell(x, tall - 1, 0, hash(seed, x, 6) < 0.5 ? VERMILION : PLASTER));
    }
  }
  return out;
}

// A BRAZIER or water bowl on a plinth: something small and warm to put at
// the end of an approach
export function brazier(seed: number): Part {
  const out: Part = [];
  out.push(cell(0, 0, 0, STONEDARK));
  out.push(cell(0, 1, 0, STONE));
  out.push(cell(0, 2, 0, hash(seed, 3, 7) < 0.5 ? LANTERN : SCARMOSS));
  return out;
}

// ---- breaking a court ------------------------------------------------------

// A LOW WALL, knee height, for dividing a court without closing it
export function lowWall(len: number, axis: "x" | "z", seed: number): Part {
  const out: Part = [];
  for (let i = 0; i < len; i++) {
    const x = axis === "x" ? i : 0;
    const z = axis === "x" ? 0 : i;
    out.push(cell(x, 0, z, STONE));
    if (hash(seed, i, 8) < 0.85) out.push(cell(x, 1, z, STONEDARK));
  }
  return out;
}

// A STEP BANK: a change of level across a court, which is the single most
// effective thing there is for stopping one reading as a slab
export function stepBank(w: number, axis: "x" | "z", seed: number): Part {
  const out: Part = [];
  for (let i = 0; i < w; i++) {
    const x = axis === "x" ? i : 0;
    const z = axis === "x" ? 0 : i;
    out.push(cell(x, 0, z, STONE));
    out.push(cell(axis === "x" ? i : 1, 1, axis === "x" ? 1 : i, hash(seed, i, 9) < 0.8 ? STONE : STONEDARK));
  }
  return out;
}

// A PLANTING BED sunk into paving: moss, low green, the odd bloom
export function paveBed(w: number, d: number, seed: number): Part {
  const out: Part = [];
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
      if (edge) {
        out.push(cell(x, 0, z, STONEDARK));
        continue;
      }
      const r = hash(seed + x, z, 10);
      out.push(cell(x, 0, z, r < 0.55 ? SCARMOSS : r < 0.85 ? FOLIAGE : FOLIAGESUN));
      if (r > 0.94) out.push(cell(x, 1, z, hash(seed, x + z, 11) < 0.5 ? FOLIAGESUN : BLOSSOM));
    }
  }
  return out;
}

// THE THING IN THE MIDDLE. every court wants one: a tree in a ring, a bowl
// on a plinth, a lantern with a bed round its foot. which one is not
// important; having one is.
export function courtFeature(seed: number): Part {
  const out: Part = [];
  const kind = Math.floor(hash(seed, 4, 12) * 3);
  // the ring of kerb every version stands in
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      const d = Math.abs(x) + Math.abs(z);
      if (d === 3) out.push(cell(x, 0, z, STONEDARK));
      else if (d < 3) out.push(cell(x, 0, z, kind === 0 ? SCARMOSS : CONCRETEMID));
    }
  }
  if (kind === 0) {
    // a tree in the ring
    for (let y = 1; y <= 4; y++) out.push(cell(0, y, 0, TIMBERDARK));
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      out.push(cell(dx, 5, dz, FOLIAGE));
      if (dx === 0 && dz === 0) out.push(cell(0, 6, 0, FOLIAGESUN));
    }
  } else if (kind === 1) {
    // a bowl on a plinth
    out.push(cell(0, 1, 0, STONE));
    out.push(cell(0, 2, 0, STONE));
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) out.push(cell(dx, 2, dz, STONEDARK));
    out.push(cell(0, 3, 0, LANTERN));
  } else {
    // a lantern post with a bed at its foot
    for (let y = 1; y <= 3; y++) out.push(cell(0, y, 0, STONEDARK));
    out.push(cell(0, 4, 0, LANTERN));
    for (const [dx, dz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const) out.push(cell(dx, 0, dz, SCARMOSS));
  }
  return out;
}
