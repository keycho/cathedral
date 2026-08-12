// cathedral - waterworks. a canal is the one piece of architecture that
// cannot be built by ADDING blocks: it is a cut. so this file returns three
// things instead of one, a set of cells to place, a set of cells to empty,
// and the columns the water surface should cover, and whoever places it
// applies all three.
//
// the register: stone and timber, which is what both registers share, so a
// canal reads as belonging to the whole world rather than to the town or
// the temple. the bridge over it is the arched kind: a deck that rises to
// its middle and comes back down, because a flat plank over water is not
// architecture and a boat cannot pass under it.

import {
  LANTERN,
  STILLWATER,
  STONE,
  STONEDARK,
  TIMBERDARK,
  TIMBERLIGHT,
  TIMBERMID,
  VERMILION,
} from "../palette";
import { Build, cell, hash, Part, speckle } from "./kit";

export interface Waterworks {
  cells: { dx: number; dy: number; dz: number; m: number }[];
  // the cut, given as COLUMNS rather than cells: each one says how far
  // below the ground datum to start emptying, and whoever applies it clears
  // from there up to that column's own real height. a cut expressed as a
  // fixed box either leaves a knoll standing in the channel or digs a
  // trench through the sky above the low end.
  clear: { dx: number; dz: number; fromDy: number }[];
  water: { dx: number; dz: number; dy: number }[]; // surface columns
  manifest: { component: string; instances: number }[];
  footprint: { w: number; d: number };
}

// ---- parts -----------------------------------------------------------------

// every level in this file is measured from the ground surface: dy 0 is the
// first free cell above the bank, so anything at a negative dy is cut into
// the land. the channel is BED at -depth, water above it, and its kerb
// course sits at 0 where a visitor's feet are.

// the lined face of a channel: coursed stone from the bed up to the kerb,
// with the waterline courses a value darker so the wall reads wet
export function canalWall(len: number, depth: number, side: 1 | -1): Part {
  const out: Part = [];
  for (let i = 0; i < len; i++) {
    for (let y = -depth; y <= -1; y++) {
      const wet = y >= -depth + 2;
      out.push(
        cell(0, y, i, wet ? speckle(STONEDARK, TIMBERDARK, i, y, side, 0.3) : speckle(STONE, STONEDARK, i, y, side, 0.28))
      );
    }
    // the kerb: the course a visitor stands on, a shade lighter than the
    // wet stone under it, which is what makes the edge an EDGE
    out.push(cell(0, 0, i, speckle(STONE, STONEDARK, i, 9, side, 0.2)));
  }
  return out;
}

// steps down to the water, so the canal is somewhere a person can reach
export function waterStair(width: number, depth: number): Part {
  const out: Part = [];
  for (let s = 0; s <= depth; s++) {
    for (let x = 0; x < width; x++) {
      // the tread, and every course under it down to the bed
      for (let y = -depth; y <= -s; y++) out.push(cell(x, y, s, STONE));
    }
  }
  return out;
}

// a mooring post: timber, with a darker collar where the rope sits
export function mooringPost(h = 3): Part {
  const out: Part = [];
  for (let y = 0; y < h; y++) out.push(cell(0, 1 + y, 0, y === h - 2 ? TIMBERDARK : TIMBERMID));
  return out;
}

// the paving of a bank: two courses wide, speckled so it is not one flat
// grey ribbon
export function bankPaving(len: number, width = 2): Part {
  const out: Part = [];
  for (let i = 0; i < len; i++) {
    for (let x = 0; x < width; x++) out.push(cell(x, 0, i, speckle(STONE, STONEDARK, x, i, 5, 0.26)));
  }
  return out;
}

// a rail along the bank: posts with a top rail between them. ONE bank gets
// this and the other does not, on purpose: a continuous course of timber is
// a wall at one block thick, and two of them turn a canal into a trench you
// cannot see the water in.
export function bankRail(len: number, spacing = 4): Part {
  const out: Part = [];
  for (let i = 0; i < len; i++) {
    if (i % spacing === 0) {
      out.push(cell(0, 1, i, TIMBERDARK));
      out.push(cell(0, 2, i, TIMBERDARK));
    }
    out.push(cell(0, 3, i, TIMBERMID)); // the rail runs between the posts
  }
  return out;
}

// a lamp post on the bank
export function lampPost(h = 4): Part {
  const out: Part = [];
  for (let y = 1; y < h; y++) out.push(cell(0, y, 0, STONE));
  out.push(cell(0, h, 0, LANTERN));
  out.push(cell(0, h + 1, 0, STONE));
  return out;
}

// the arched bridge. the deck rises to a crown and comes back down, the
// arch under it is picked out course by course, and the parapet is posts
// with a rail, never a solid wall.
export function moonBridge(span: number, width = 5, rise = 3): Part {
  const out: Part = [];
  const c = (span - 1) / 2;
  const deckAt = (i: number) => {
    const t = 1 - Math.abs(i - c) / (c + 0.001);
    return Math.round(rise * Math.sin((t * Math.PI) / 2));
  };
  for (let i = 0; i < span; i++) {
    const y = deckAt(i);
    for (let x = 0; x < width; x++) {
      // the deck: timber planks over a stone arch, alternating so it reads
      // as boards and not as a ramp
      out.push(cell(x, y, i, i % 2 === 0 ? TIMBERLIGHT : TIMBERMID));
    }
    // the arch beneath, dropping away from the deck to the abutments
    const under = Math.max(0, y - 1);
    for (let y2 = under; y2 < y; y2++) {
      out.push(cell(0, y2, i, STONE));
      out.push(cell(width - 1, y2, i, STONE));
    }
    // the springing: solid stone where the bridge meets its bank
    if (i < 2 || i >= span - 2) {
      for (let x = 0; x < width; x++) for (let y2 = -2; y2 < y; y2++) out.push(cell(x, y2, i, speckle(STONE, STONEDARK, x, y2, i, 0.24)));
    }
    // the parapet: posts and a rail, with a vermilion newel at each end
    if (i % 2 === 0) {
      out.push(cell(0, y + 1, i, TIMBERDARK));
      out.push(cell(width - 1, y + 1, i, TIMBERDARK));
    }
    out.push(cell(0, y + 2, i, i === 0 || i === span - 1 ? VERMILION : TIMBERMID));
    out.push(cell(width - 1, y + 2, i, i === 0 || i === span - 1 ? VERMILION : TIMBERMID));
  }
  // the newel lamps: the bridge is the thing you find at night
  for (const i of [0, span - 1]) {
    out.push(cell(0, deckAt(i) + 3, i, LANTERN));
    out.push(cell(width - 1, deckAt(i) + 3, i, LANTERN));
  }
  return out;
}

// a moored boat: a hull of timber with a raised stem and stern and a pole
export function boat(len = 5): Part {
  const out: Part = [];
  for (let i = 0; i < len; i++) {
    out.push(cell(0, 0, i, TIMBERDARK));
    out.push(cell(1, 0, i, TIMBERMID));
    if (i === 0 || i === len - 1) {
      out.push(cell(0, 1, i, TIMBERDARK));
      out.push(cell(1, 1, i, TIMBERDARK));
    }
  }
  out.push(cell(1, 1, 2, TIMBERLIGHT)); // the pole leaning in the well
  out.push(cell(1, 2, 2, TIMBERLIGHT));
  return out;
}

// ---- the composition -------------------------------------------------------

// one reach of canal: a straight channel with lined banks, a landing stair,
// mooring posts, lantern posts, a moored boat and an arched bridge across
// it. the demonstration piece, and the unit the town is later cut from.
export function canalReach(len = 34, waterW = 4, depth = 3): Waterworks {
  const b = new Build();
  const clear: { dx: number; dz: number; fromDy: number }[] = [];
  const water: { dx: number; dz: number; dy: number }[] = [];
  const bankL = 1; // the lined wall on the near side
  const bankR = bankL + waterW + 1; // and on the far side

  for (let i = 0; i < len; i++) {
    // the cut. the channel is emptied from the bed up, and the two bank
    // strips from the ground datum up: a reach that only clears the air
    // above the water leaves its own walls nowhere to stand.
    for (let x = bankL; x <= bankR; x++) clear.push({ dx: x, dz: i, fromDy: -depth });
    for (const x of [bankL - 2, bankL - 1, bankR + 1, bankR + 2]) clear.push({ dx: x, dz: i, fromDy: 0 });

    for (let x = bankL + 1; x < bankR; x++) {
      // the bed, then the water standing on it, its surface one course
      // below the kerb so the canal reads SUNK and not poured on the grass
      b.add("canal bed", [cell(x, -depth, i, speckle(STONEDARK, TIMBERDARK, x, i, 3, 0.35))]);
      for (let y = -depth + 1; y <= -1; y++) b.add("canal water", [cell(x, y, i, STILLWATER)]);
      water.push({ dx: x, dz: i, dy: 0.004 });
    }
  }

  // the lined banks
  b.add("canal wall", canalWall(len, depth, -1), bankL, 0, 0);
  b.add("canal wall", canalWall(len, depth, 1), bankR, 0, 0);

  // a landing: steps down to the water on the near bank, cut into the wall
  const landingAt = Math.floor(len * 0.24);
  const stairPart = waterStair(4, depth).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m }));
  b.add("water stair", stairPart, bankL, 0, landingAt);

  // paving on both banks; the rail on ONE of them, so the other stays a
  // quay you can see the water from
  b.add("bank paving", bankPaving(len, 2), bankL - 2, 0, 0);
  b.add("bank paving", bankPaving(len, 2), bankR + 1, 0, 0);
  b.add("bank rail", bankRail(len, 4), bankR + 2, 0, 0);
  for (let i = 3; i < len - 3; i += 7) {
    b.add("mooring post", mooringPost(2), bankL, 0, i);
    b.add("mooring post", mooringPost(2), bankR, 0, i + 3);
  }
  for (let i = 5; i < len - 4; i += 11) {
    b.add("lamp post", lampPost(4), bankL - 2, 0, i);
    b.add("lamp post", lampPost(4), bankR + 2, 0, i + 5);
  }

  // the bridge, across the channel at its far third. it starts on the bank
  // paving and lands on the bank paving, so it is a crossing and not a raft.
  const bridgeAt = Math.floor(len * 0.62);
  const arch = moonBridge(waterW + 6, 5, 3).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m }));
  b.add("arched bridge", arch, bankL - 2, 0, bridgeAt);

  // a boat tied up at the landing, because a canal with no boat on it is a
  // drain. it floats: its hull sits at the waterline.
  b.add("moored boat", boat(5), bankL + 1, -1, landingAt + 5);

  return {
    cells: b.ordered,
    clear,
    water,
    manifest: b.manifest,
    footprint: { w: waterW + 6, d: len },
  };
}

// keep the linter honest about the helper the parts share
void hash;
