// cathedral - compositions. the architect never places blocks freehand: it
// chooses a composition and the composition assembles parts from the kit.
// this file holds the first one, the gate piece: a single tier of the great
// work, with the grounds that make it a place rather than an object.
//
// the proportions of the tier are the pagoda's contract, so tier two and
// tier seven are the same composition with a smaller span and a higher
// floor. the great work is this function, called forever.

import { Build, type Cell } from "./kit";
import {
  basin,
  bell,
  bracketSet,
  courtyardPaving,
  door,
  finial,
  gardenBed,
  gate,
  latticeWindow,
  ornamentalTree,
  podium,
  retainingWall,
  stair,
  stoneLantern,
  sweptRoof,
  templeColumn,
  wallPanel,
  wallWithCap,
} from "./temple";
import { beam, ring } from "./kit";
import { TIMBERDARK, TIMBERMID } from "../palette";

export interface Composed {
  cells: Cell[];
  manifest: { component: string; instances: number }[];
  footprint: { w: number; d: number };
  height: number;
}

// ---- the tier, in three stackable pieces -----------------------------------
//
// pagodaTier below builds a WHOLE small building — its own podium, roof and
// finial — which made it useless twice over: it cost more than a full
// budget at any span, and two of them stacked put a podium in mid-air, so
// the one thing its name promised was the one thing it could not do.
//
// these three are the real storeys. each is authored from its own corner at
// the origin and extends in +x, +y and +z, and each one's note says exactly
// where the next sits relative to it, because a part you cannot place
// without guessing is not usable:
//
//   tierPodium(span, courses)  is (span+4) square and `courses` tall
//   tierBody(span, storey)     is span square, storey+3 tall, and sits at
//                              (x+2, y+courses, z+2) on that podium
//   tierRoof(span)             is (span+6) square and sits at
//                              (x-1, y+storey+3, z-1) on that body
//
// stack a second storey by putting another tierBody on the roof at a
// smaller span, and crown the last one with finial.

// the stone base and the flight that climbs it
export function tierPodium(span = 11, courses = 2): Build {
  const b = new Build();
  const podW = span + 4;
  b.add("podium", podium(podW, podW, courses));
  b.add("stair", stair(5, courses), Math.floor(podW / 2) - 2, 0, podW);
  return b;
}

// the storey itself: posts, plaster between them, the openings, the beam
// course that ties the post heads, and the brackets that carry the eave
export function tierBody(span = 11, storey = 6): Build {
  const b = new Build();
  const h = storey;
  for (let i = 0; i < span; i += 2) {
    b.add("column", templeColumn(h), i, 0, 0);
    b.add("column", templeColumn(h), i, 0, span - 1);
  }
  for (let i = 2; i < span - 2; i += 2) {
    b.add("column", templeColumn(h), 0, 0, i);
    b.add("column", templeColumn(h), span - 1, 0, i);
  }
  for (let i = 0; i < span - 1; i += 2) {
    b.add("wall panel", wallPanel(3, h - 1), i, 1, 0);
    b.add("wall panel", wallPanel(3, h - 1), i, 1, span - 1);
    const w = wallPanel(3, h - 1).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m }));
    b.add("wall panel", w, 0, 1, i);
    b.add("wall panel", w, span - 1, 1, i);
  }
  b.add("door", door(2, 3), Math.floor(span / 2) - 1, 2, span - 1);
  b.add("window (lattice)", latticeWindow(3, 3), 1, 3, 0);
  b.add("window (lattice)", latticeWindow(3, 3), span - 4, 3, 0);
  const side = latticeWindow(3, 3).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m }));
  b.add("window (lattice)", side, 0, 3, 1);
  b.add("window (lattice)", side, span - 1, 3, span - 4);

  const top = h;
  b.add("beam", ring(span, span, 0, TIMBERMID), 0, top, 0);
  b.add("beam", beam(0, 1, span - 1, 1, top, TIMBERDARK));
  for (let i = 0; i < span; i += 2) {
    const north = bracketSet(2).map((c) => ({ dx: i, dy: c.dy, dz: -c.dx, m: c.m }));
    const south = bracketSet(2).map((c) => ({ dx: i, dy: c.dy, dz: c.dx, m: c.m }));
    b.add("bracket set", north, 0, top + 1, 0);
    b.add("bracket set", south, 0, top + 1, span - 1);
    const west = bracketSet(2).map((c) => ({ dx: -c.dx, dy: c.dy, dz: i, m: c.m }));
    const east = bracketSet(2).map((c) => ({ dx: c.dx, dy: c.dy, dz: i, m: c.m }));
    b.add("bracket set", west, 0, top + 1, 0);
    b.add("bracket set", east, span - 1, top + 1, 0);
  }
  return b;
}

// the swept roof that overhangs a body of that span by three every side
export function tierRoof(span = 11): Build {
  const b = new Build();
  const roofSpan = span + 6;
  b.add("roof (swept)", sweptRoof(roofSpan, Math.ceil(roofSpan / 2)));
  return b;
}

// one tier of the great work. span is the body's width in blocks; the roof
// reaches four blocks wider on every side, which is what makes a pagoda
// read as a pagoda from a distance.
export function pagodaTier(span = 11, storey = 6): Build {
  const b = new Build();
  const podW = span + 4;
  const half = Math.floor(podW / 2);
  const bodyOff = 2; // the body sits inset on its podium

  // 1. the podium it stands on, and the stair that climbs it
  b.add("podium", podium(podW, podW, 2));
  b.add("stair", stair(5, 2), half - 2, 0, podW);

  // 2. the frame: a post at every second bay, all four faces
  const h = storey;
  for (let i = 0; i < span; i += 2) {
    b.add("column", templeColumn(h), bodyOff + i, 2, bodyOff);
    b.add("column", templeColumn(h), bodyOff + i, 2, bodyOff + span - 1);
  }
  for (let i = 2; i < span - 2; i += 2) {
    b.add("column", templeColumn(h), bodyOff, 2, bodyOff + i);
    b.add("column", templeColumn(h), bodyOff + span - 1, 2, bodyOff + i);
  }

  // 3. the walls between the posts, on all four faces
  for (let i = 0; i < span - 1; i += 2) {
    b.add("wall panel", wallPanel(3, h - 1), bodyOff + i, 3, bodyOff);
    b.add("wall panel", wallPanel(3, h - 1), bodyOff + i, 3, bodyOff + span - 1);
  }
  for (let i = 0; i < span - 1; i += 2) {
    const w = wallPanel(3, h - 1).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m }));
    b.add("wall panel", w, bodyOff, 3, bodyOff + i);
    b.add("wall panel", w, bodyOff + span - 1, 3, bodyOff + i);
  }

  // 4. the openings: a door on the approach face, lattice on the others
  b.add("door", door(2, 3), bodyOff + Math.floor(span / 2) - 1, 4, bodyOff + span - 1);
  b.add("window (lattice)", latticeWindow(3, 3), bodyOff + 1, 5, bodyOff);
  b.add("window (lattice)", latticeWindow(3, 3), bodyOff + span - 4, 5, bodyOff);
  const side = latticeWindow(3, 3).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m }));
  b.add("window (lattice)", side, bodyOff, 5, bodyOff + 1);
  b.add("window (lattice)", side, bodyOff + span - 1, 5, bodyOff + span - 4);

  // 5. the beam course that ties the posts together at their heads
  const top = 2 + h;
  b.add("beam", ring(span, span, 0, TIMBERMID), bodyOff, top, bodyOff);
  b.add("beam", beam(bodyOff, bodyOff + 1, bodyOff + span - 1, bodyOff + 1, top, TIMBERDARK));

  // 6. the bracket sets: one at every post head, reaching out to carry the
  // eave. the register's signature detail.
  for (let i = 0; i < span; i += 2) {
    const north = bracketSet(2).map((c) => ({ dx: c.dx * 0 + i, dy: c.dy, dz: -c.dx, m: c.m }));
    const south = bracketSet(2).map((c) => ({ dx: i, dy: c.dy, dz: c.dx, m: c.m }));
    b.add("bracket set", north, bodyOff, top + 1, bodyOff);
    b.add("bracket set", south, bodyOff, top + 1, bodyOff + span - 1);
    const west = bracketSet(2).map((c) => ({ dx: -c.dx, dy: c.dy, dz: i, m: c.m }));
    const east = bracketSet(2).map((c) => ({ dx: c.dx, dy: c.dy, dz: i, m: c.m }));
    b.add("bracket set", west, bodyOff, top + 1, bodyOff);
    b.add("bracket set", east, bodyOff + span - 1, top + 1, bodyOff);
  }

  // 7. the roof: courses stepped one at a time, corners swept, hips picked
  // out, and it overhangs the body by three on every side
  const roofSpan = span + 6;
  const roofOff = bodyOff - 3;
  b.add("roof (swept)", sweptRoof(roofSpan, Math.ceil(roofSpan / 2)), roofOff, top + 3, roofOff);

  // 8. the finial, the one green the building is allowed
  b.add("finial", finial(4), bodyOff + Math.floor(span / 2), top + 3 + Math.ceil(roofSpan / 2), bodyOff + Math.floor(span / 2));

  return b;
}

// the grounds. forty percent of the work by law, because nothing in this
// world sits on bare ground: a walled court, a gate to arrive through, a
// path, lanterns, a basin, a bell, beds and trees.
export function templeGrounds(courtW = 29, courtD = 27, buildingAt = { x: 7, z: 6 }, buildingW = 15): Build {
  const b = new Build();

  // the court itself, minus the footprint the tier will stand on
  const paving = courtyardPaving(courtW, courtD).filter(
    (c) =>
      !(
        c.dx >= buildingAt.x - 1 &&
        c.dx < buildingAt.x + buildingW + 1 &&
        c.dz >= buildingAt.z - 1 &&
        c.dz < buildingAt.z + buildingW + 1
      )
  );
  b.add("courtyard paving", paving);

  // the wall around it, with its tile cap, broken where the gate stands
  b.add("wall + tile cap", wallWithCap(courtW, 3, "x"), 0, 1, 0);
  const rear = wallWithCap(courtW, 3, "x");
  b.add("wall + tile cap", rear.filter((c) => c.dx < 12 || c.dx > 17), 0, 1, courtD - 1);
  b.add("wall + tile cap", wallWithCap(courtD, 3, "z"), 0, 1, 0);
  b.add("wall + tile cap", wallWithCap(courtD, 3, "z"), courtW - 1, 1, 0);

  // the gate on the approach, and the path that runs from it to the stair
  b.add("gate", gate(6, 5), 12, 1, courtD - 1);
  for (let z = courtD - 2; z > buildingAt.z + buildingW; z--) {
    for (let x = 13; x <= 16; x++) b.add("path", [{ dx: x, dy: 1, dz: z, m: paving[0].m }]);
  }

  // the terrace this court sits on: a retaining wall along its front
  b.add("retaining wall", retainingWall(courtW, 3, "x"), 0, -3, courtD + 1);

  // lanterns down the approach and at the corners of the court
  for (const [lx, lz] of [
    [11, courtD - 4],
    [18, courtD - 4],
    [11, courtD - 10],
    [18, courtD - 10],
    [2, 2],
    [courtW - 3, 2],
  ] as const) {
    b.add("stone lantern", stoneLantern(), lx, 1, lz);
  }

  // water, a bell, beds and trees: the grounds' green
  b.add("basin", basin(2), 3, 1, courtD - 8);
  b.add("bell", bell(), courtW - 6, 1, 4);
  b.add("garden bed", gardenBed(6, 5), 2, 1, courtD - 16);
  b.add("garden bed", gardenBed(5, 6), courtW - 8, 1, courtD - 12);
  b.add("ornamental tree", ornamentalTree(5, 2, false), 4, 1, 5);
  b.add("ornamental tree", ornamentalTree(6, 3, false), courtW - 5, 1, courtD - 6);
  b.add("ornamental tree", ornamentalTree(4, 2, true), 6, 1, courtD - 13); // the season's one
  b.add("ornamental tree", ornamentalTree(5, 2, false), courtW - 4, 1, 9);

  return b;
}

// the gate piece: one tier standing in its grounds, as one build
export function firstTierWithGrounds(): Composed {
  const courtW = 29;
  const courtD = 27;
  const buildingAt = { x: 7, z: 6 };
  const span = 11;

  const grounds = templeGrounds(courtW, courtD, buildingAt, span + 4);
  const tier = pagodaTier(span, 6);

  const all = new Build();
  for (const c of grounds.ordered) all.add("_", [c]);
  for (const c of tier.ordered) all.add("_", [c], buildingAt.x, 1, buildingAt.z);
  all.used.delete("_");
  for (const [k, v] of grounds.used) all.used.set(k, (all.used.get(k) ?? 0) + v);
  for (const [k, v] of tier.used) all.used.set(k, (all.used.get(k) ?? 0) + v);

  const cells = all.ordered;
  let height = 0;
  for (const c of cells) height = Math.max(height, c.dy);
  return {
    cells,
    manifest: all.manifest,
    footprint: { w: courtW, d: courtD },
    height,
  };
}
