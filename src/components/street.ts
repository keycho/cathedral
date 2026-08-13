// cathedral - the street. one block of the lower town, composed from the
// town register's parts. four buildings sharing a frontage, in four
// different eras, with the alley shrine between two of them, the whole
// road in front of them and everything people leave lying on it.
//
// it is designed at NIGHT. every decision here was made by asking what the
// thing looks like when the only light in the world comes off the signage,
// which is why the buildings are dark, the paints are saturated, the
// shopfronts pour light onto the pavement and the biggest single object on
// the street is a sign.

import { PLASTER, SHUTTER, TILECHARCOAL, TILERIDGE, TIMBERDARK, TIMBERLIGHT, TIMBERMID, STONE, STONEDARK, CONCRETEDARK, CONCRETEMID, CONCRETEPALE, GLASSBLUE, INTERIOR, LANTERN, NEONAMBER, NEONCYAN, NEONEMBER, NEONGREEN, NEONPINK, NEONRED, VERMILION } from "../palette";
import { cell, hash, speckle, type Cell } from "./kit";
import {
  acUnit,
  alleyShrine,
  armature,
  awning,
  balcony,
  bicycle,
  blossomTree,
  crates,
  facadeBay,
  kerb,
  ladder,
  lightbox,
  LitBuild,
  pavement,
  pipeRun,
  planter,
  pole,
  rooftopUnit,
  shopfront,
  shutterClosed,
  signBoard,
  stall,
  streetlight,
  streetPaving,
  torii,
  vendingMachine,
  verticalBanner,
  windowModern,
  wireRun,
  type TownPiece,
} from "./town";

// the whole block's geometry in one place, because every part of it has to
// agree about where the kerb is
const BACK = 0; // the buildings' back wall
const DEPTH = 12; // building depth: the frontage face sits at DEPTH - 1
const FRONT = DEPTH - 1;
const PAVE = DEPTH; // pavement starts here
const PAVE_W = 3;
const KERB = PAVE + PAVE_W; // the kerb line
const ROAD_W = 8;
const FAR_KERB = KERB + 1 + ROAD_W;
const LEN = 44; // along the street

// turn a part authored in the x-y plane (a facade) so it faces the street:
// the part's x becomes z along the frontage and its z becomes depth
const faceStreet = (p: Cell[]): Cell[] => p.map((c) => ({ dx: -c.dz, dy: c.dy, dz: c.dx, m: c.m }));

// ---- the four buildings ----------------------------------------------------

// 1. THE MACHIYA. dark timber post and beam, plaster infill, a tiled roof,
// an overhanging upper floor and a lattice front. the oldest thing on the
// street and the only one that is not trying to shout.
function machiya(b: LitBuild, z0: number, len: number, seed: number) {
  const H1 = 4;
  const H2 = 4;
  const top = H1 + H2;

  // the shell: posts at every second bay, plaster between, back and sides
  for (let z = z0; z < z0 + len; z++) {
    for (let y = 0; y < top; y++) {
      const post = z % 2 === 0;
      b.add("machiya frame", [cell(FRONT, y, z, post ? TIMBERDARK : PLASTER)]);
      b.add("machiya frame", [cell(BACK, y, z, post ? TIMBERDARK : speckle(PLASTER, TIMBERDARK, 0, y, z, 0.2))]);
    }
  }
  for (let x = BACK; x <= FRONT; x++) {
    for (let y = 0; y < top; y++) {
      b.add("machiya frame", [cell(x, y, z0, x % 3 === 0 ? TIMBERDARK : PLASTER)]);
      b.add("machiya frame", [cell(x, y, z0 + len - 1, x % 3 === 0 ? TIMBERDARK : PLASTER)]);
    }
    // the floor between the storeys, and the ceiling of the ground floor
    for (let z = z0 + 1; z < z0 + len - 1; z++) b.add("floor", [cell(x, H1 - 1, z, TIMBERMID)]);
  }

  // the ground floor is a shopfront the whole way: lattice, a noren, light
  for (let z = z0 + 1; z < z0 + len - 1; z += 3) {
    b.add("shopfront", faceStreet(shopfront(3, H1 - 1, TIMBERDARK, seed + z)), FRONT, 0, z);
    b.lamp(FRONT + 1, 2, z + 1, INTERIOR, 6, 0.85);
  }
  // the lattice screen on the upper floor: a timber grid, not a wall
  for (let z = z0 + 1; z < z0 + len - 1; z++) {
    for (let y = H1 + 1; y < top - 1; y++) {
      const open = (z + y) % 2 === 0;
      b.add("lattice screen", [cell(FRONT, y, z, open ? TIMBERLIGHT : INTERIOR)]);
    }
  }

  // THE OVERHANG: the upper floor steps out over the pavement, which is the
  // single move that stops this reading as a box
  for (let z = z0; z < z0 + len; z++) {
    b.add("overhang", [cell(FRONT + 1, H1, z, TIMBERDARK)]);
    b.add("overhang", [cell(FRONT + 1, H1 + 1, z, z % 2 === 0 ? TIMBERDARK : PLASTER)]);
    b.add("overhang", [cell(FRONT + 2, H1, z, TIMBERMID)]); // the eave board
  }

  // the tiled roof, courses stepping in
  for (let c = 0; c < 3; c++) {
    for (let x = BACK - 1 + c; x <= FRONT + 2 - c; x++) {
      for (let z = z0 - 1 + c; z < z0 + len + 1 - c; z++) {
        b.add("tiled roof", [cell(x, top + c, z, c === 2 ? TILERIDGE : TILECHARCOAL)]);
      }
    }
  }

  // a vertical timber banner and a row of paper lanterns under the eave
  b.add("vertical banner", faceStreet(verticalBanner(2, 7, seed, NEONRED)), FRONT + 3, H1 - 1, z0 + 2);
  b.lamp(FRONT + 3, H1 + 2, z0 + 3, NEONRED, 9, 1.1);
  for (let z = z0 + 2; z < z0 + len - 1; z += 3) {
    b.add("paper lantern", [cell(FRONT + 2, H1 - 1, z, LANTERN), cell(FRONT + 2, H1, z, TIMBERDARK)]);
    b.lamp(FRONT + 2, H1 - 1, z, LANTERN, 5, 0.7);
  }
  // the noren curtain over the doorway
  for (let z = z0 + 4; z < z0 + 7; z++) b.add("noren curtain", [cell(FRONT + 1, 3, z, VERMILION)]);

  // and the back, which gets the same treatment as the front
  b.add("pipe run", pipeRun(top, seed + 1), BACK - 1, 0, z0 + 2);
  b.add("ac unit", acUnit(seed + 2), BACK - 1, H1 + 1, z0 + 5);
  b.add("crates", crates(seed + 3), BACK - 2, 0, z0 + 7);
  return top + 3;
}

// 2. THE MODERN BLOCK. six storeys of painted concrete, a setback at the
// fifth, balconies, and the biggest sign on the street stacked down its
// corner. this is the building the street is lit by.
function modernBlock(b: LitBuild, z0: number, len: number, paint: number, seed: number) {
  const STOREY = 3;
  const FLOORS = 6;
  const SETBACK = 4; // the floor the building steps back at
  const top = STOREY * FLOORS;

  for (let f = 0; f < FLOORS; f++) {
    const y0 = f * STOREY;
    // the setback: the upper floors are shorter, so the silhouette breaks
    const zA = f >= SETBACK ? z0 + 2 : z0;
    const zB = f >= SETBACK ? z0 + len - 2 : z0 + len;
    const front = f >= SETBACK ? FRONT - 2 : FRONT;

    // the slab edge between storeys, proud of the face
    for (let x = BACK; x <= front + 1; x++) for (let z = zA - 1; z <= zB; z++) b.add("floor slab", [cell(x, y0, z, CONCRETEMID)]);

    for (let z = zA; z < zB; z++) {
      for (let y = y0 + 1; y < y0 + STOREY; y++) {
        b.add("facade", [cell(BACK, y, z, speckle(CONCRETEDARK, CONCRETEMID, 0, y, z, 0.24))]);
      }
    }
    for (let x = BACK; x <= front; x++) {
      for (let y = y0 + 1; y < y0 + STOREY; y++) {
        b.add("facade", [cell(x, y, zA, speckle(paint, CONCRETEDARK, x, y, f, 0.22))]);
        b.add("facade", [cell(x, y, zB - 1, speckle(paint, CONCRETEDARK, x, y, f + 9, 0.22))]);
      }
    }
    // the street face, bay by bay
    if (f === 0) {
      for (let z = zA + 1; z < zB - 1; z += 4) {
        if (hash(z, f, seed) < 0.72) {
          b.add("shopfront", faceStreet(shopfront(4, STOREY, paint, seed + z)), front, y0, z);
          b.lamp(front + 1, y0 + 2, z + 2, INTERIOR, 8, 1.0);
        } else {
          b.add("shutter (closed)", faceStreet(shutterClosed(4, STOREY, seed + z)), front, y0, z);
        }
      }
    } else {
      for (let z = zA; z < zB; z += 3) {
        const lit = hash(z, f, seed + 4) < 0.55;
        b.add("facade bay", faceStreet(facadeBay(3, STOREY - 1, paint, lit, seed + f)), front, y0 + 1, z);
        if (lit) b.lamp(front + 1, y0 + 2, z + 1, INTERIOR, 5, 0.5);
        if (hash(z, f, seed + 7) < 0.4) b.add("balcony", balcony(3, seed + z).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m })), front + 1, y0 + 1, z);
      }
    }
  }

  // THE SIGN. eighteen blocks tall, stacked down the corner, on its own
  // steel. it is as large as the building's whole street face and that is
  // the point: on this street signage is structure.
  const bannerH = 18;
  b.add("armature", armature(3, 2).map((c) => ({ dx: c.dx, dy: c.dy, dz: c.dz, m: c.m })), FRONT, top - 4, z0 + 1);
  b.add("vertical banner", faceStreet(verticalBanner(3, bannerH, seed + 11, NEONPINK)), FRONT + 2, top - bannerH - 2, z0 + 1);
  for (let k = 0; k < 4; k++) b.lamp(FRONT + 3, top - 3 - k * 5, z0 + 2, NEONPINK, 13, 1.3);

  // a second sign cantilevered over the pavement, at the height of a face
  b.add("armature", armature(3, 2), FRONT, 8, z0 + len - 4);
  b.add("sign board", faceStreet(signBoard(8, 3, seed + 3, NEONCYAN)), FRONT + 3, 8, z0 + len - 9);
  b.lamp(FRONT + 3, 9, z0 + len - 6, NEONCYAN, 11, 1.2);

  // the clutter: units, pipes, a ladder, and the roof
  for (let f = 1; f < FLOORS; f++) {
    if (hash(f, seed, 21) < 0.75) b.add("ac unit", acUnit(seed + f), FRONT + 1, f * STOREY + 1, z0 + 2 + ((f * 5) % (len - 4)));
    if (hash(f, seed, 22) < 0.5) b.add("ac unit", acUnit(seed + f + 30), BACK - 1, f * STOREY + 1, z0 + 3 + ((f * 3) % (len - 5)));
  }
  b.add("pipe run", pipeRun(top, seed + 5), FRONT + 1, 0, z0 + len - 2);
  b.add("pipe run", pipeRun(top, seed + 6), BACK - 1, 0, z0 + 1);
  b.add("ladder", ladder(top - 2), BACK - 1, 2, z0 + len - 5);
  // the parapet, then what stands above it
  for (let x = BACK; x <= FRONT - 2; x++) for (let z = z0 + 2; z < z0 + len - 2; z++) b.add("parapet", [cell(x, top, z, CONCRETEDARK)]);
  b.add("rooftop unit", rooftopUnit(4, 4, seed + 8), BACK + 2, top + 1, z0 + 3);
  b.add("rooftop unit", rooftopUnit(3, 3, seed + 9), BACK + 5, top + 1, z0 + 8);
  return top + 8;
}

// 3. THE WESTERN STONE. three storeys, a cornice, pilasters and arched
// heads: the block somebody built in a decade that wanted to look european.
function westernStone(b: LitBuild, z0: number, len: number, seed: number) {
  const STOREY = 4;
  const FLOORS = 3;
  const top = STOREY * FLOORS;

  for (let f = 0; f < FLOORS; f++) {
    const y0 = f * STOREY;
    // the string course between floors, proud
    for (let x = BACK; x <= FRONT + 1; x++) for (let z = z0 - 1; z <= z0 + len; z++) b.add("string course", [cell(x, y0, z, STONE)]);
    for (let z = z0; z < z0 + len; z++) {
      for (let y = y0 + 1; y < y0 + STOREY; y++) {
        b.add("stone wall", [cell(BACK, y, z, speckle(STONEDARK, STONE, 0, y, z, 0.3))]);
        // the pilasters that break the street face into bays
        const pilaster = (z - z0) % 4 === 0;
        b.add("stone wall", [cell(FRONT, y, z, pilaster ? STONE : speckle(STONEDARK, STONE, 1, y, z, 0.26))]);
      }
    }
    for (let x = BACK; x <= FRONT; x++)
      for (let y = y0 + 1; y < y0 + STOREY; y++) {
        b.add("stone wall", [cell(x, y, z0, speckle(STONE, STONEDARK, x, y, f, 0.3))]);
        b.add("stone wall", [cell(x, y, z0 + len - 1, speckle(STONE, STONEDARK, x, y, f + 5, 0.3))]);
      }

    if (f === 0) {
      for (let z = z0 + 1; z < z0 + len - 2; z += 4) {
        b.add("shopfront", faceStreet(shopfront(3, STOREY - 1, STONE, seed + z)), FRONT, y0, z);
        b.lamp(FRONT + 1, y0 + 2, z + 1, INTERIOR, 7, 0.9);
      }
    } else {
      for (let z = z0 + 1; z < z0 + len - 2; z += 4) {
        const lit = hash(z, f, seed + 2) < 0.5;
        b.add("window (modern)", faceStreet(windowModern(2, STOREY - 2, lit)), FRONT, y0 + 1, z);
        // the arched head over it: two blocks stepping in
        b.add("arch head", [cell(FRONT, y0 + STOREY - 1, z, STONE), cell(FRONT, y0 + STOREY - 1, z + 1, STONE)]);
        if (lit) b.lamp(FRONT + 1, y0 + 2, z, INTERIOR, 5, 0.45);
      }
    }
  }
  // the cornice: three courses stepping OUT, which is the whole point of
  // this era and the reason its silhouette is different from its neighbours
  for (let c = 0; c < 3; c++) {
    for (let x = BACK - c; x <= FRONT + c; x++)
      for (let z = z0 - c; z < z0 + len + c; z++) b.add("cornice", [cell(x, top + c, z, c === 2 ? STONEDARK : STONE)]);
  }

  // an awning the full length of the frontage, and a board over it
  b.add("awning", awning(len - 2, 3, VERMILION, PLASTER).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m })), FRONT + 1, 4, z0 + 1);
  b.add("armature", armature(3, 2), FRONT, 6, z0 + 3);
  b.add("sign board", faceStreet(signBoard(10, 3, seed + 4, NEONAMBER)), FRONT + 3, 6, z0 + 2);
  b.lamp(FRONT + 3, 7, z0 + 6, NEONAMBER, 11, 1.15);
  b.add("pipe run", pipeRun(top, seed + 7), FRONT + 1, 0, z0 + len - 1);
  b.add("rooftop unit", rooftopUnit(3, 3, seed + 12), BACK + 2, top + 3, z0 + 2);
  return top + 6;
}

// 4. THE NARROW INFILL. four storeys crammed into six, its whole street
// face papered in lightboxes, an external ladder and a lean-to at the
// bottom. the thirty percent box, seventy percent ornament rule at its
// most literal.
function narrowInfill(b: LitBuild, z0: number, len: number, paint: number, seed: number) {
  const STOREY = 3;
  const FLOORS = 5;
  const top = STOREY * FLOORS;

  for (let y = 0; y < top; y++) {
    for (let z = z0; z < z0 + len; z++) {
      b.add("facade", [cell(FRONT, y, z, speckle(paint, CONCRETEDARK, 1, y, z, 0.28))]);
      b.add("facade", [cell(BACK, y, z, speckle(CONCRETEDARK, CONCRETEMID, 0, y, z, 0.3))]);
    }
    for (let x = BACK; x <= FRONT; x++) {
      b.add("facade", [cell(x, y, z0, speckle(paint, CONCRETEDARK, x, y, 3, 0.24))]);
      b.add("facade", [cell(x, y, z0 + len - 1, speckle(paint, CONCRETEDARK, x, y, 4, 0.24))]);
    }
    if (y % STOREY === 0) for (let x = BACK; x <= FRONT + 1; x++) for (let z = z0 - 1; z <= z0 + len; z++) b.add("floor slab", [cell(x, y, z, CONCRETEMID)]);
  }

  // the ground floor: a lean-to over a stall, not a shopfront
  b.add("stall", stall(len - 2, seed).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m })), FRONT + 1, 0, z0 + 1);
  b.add("awning", awning(len - 2, 3, NEONGREEN, PLASTER).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m })), FRONT + 1, 4, z0 + 1);
  b.lamp(FRONT + 2, 3, z0 + 3, LANTERN, 6, 0.8);

  // the whole face papered in lightboxes, on their own steel
  const NEONS4 = [NEONCYAN, NEONPINK, NEONAMBER, NEONGREEN, NEONEMBER];
  for (let f = 1; f < FLOORS; f++) {
    const y0 = f * STOREY + 1;
    const neon = NEONS4[f % NEONS4.length];
    b.add("lightbox", faceStreet(lightbox(len - 2, 2, seed + f, neon)), FRONT + 1, y0, z0 + 1);
    b.add("armature", armature(2, 1), FRONT, y0, z0 + 1);
    b.lamp(FRONT + 2, y0, z0 + Math.floor(len / 2), neon, 10, 1.15);
    if (hash(f, seed, 31) < 0.7) b.add("ac unit", acUnit(seed + f), BACK - 1, y0, z0 + 1 + (f % (len - 2)));
  }
  b.add("ladder", ladder(top), BACK - 1, 1, z0 + 1);
  b.add("pipe run", pipeRun(top, seed + 3), BACK - 1, 0, z0 + len - 2);
  for (let x = BACK; x <= FRONT; x++) for (let z = z0; z < z0 + len; z++) b.add("parapet", [cell(x, top, z, CONCRETEDARK)]);
  b.add("rooftop unit", rooftopUnit(3, 3, seed + 14), BACK + 1, top + 1, z0 + 1);
  return top + 6;
}

// ---- the block -------------------------------------------------------------

export function streetBlock(): TownPiece {
  const b = new LitBuild();
  const seed = 7;

  // 1. the ground the whole thing stands on, laid first so everything else
  // covers it: pavement, kerb, road, far kerb, far pavement
  b.add("pavement", pavement(PAVE_W, LEN, seed), PAVE, 0, 0);
  b.add("kerb", kerb(LEN, seed), KERB, 0, 0);
  b.add("street paving", streetPaving(ROAD_W, LEN, seed), KERB + 1, 0, 0);
  b.add("kerb", kerb(LEN, seed + 1), FAR_KERB, 0, 0);
  b.add("pavement", pavement(3, LEN, seed + 2), FAR_KERB + 1, 0, 0);
  // the crossing, painted across the road
  for (let x = KERB + 1; x < FAR_KERB; x++)
    for (let z = 20; z < 26; z++) if (z % 2 === 0) b.add("crossing", [cell(x, 0, z, CONCRETEPALE)]);
  // the far side's low wall, so the street is a room and not a strip
  for (let z = 0; z < LEN; z++)
    for (let y = 1; y <= 2; y++)
      b.add("boundary wall", [cell(FAR_KERB + 4, y, z, speckle(CONCRETEMID, CONCRETEDARK, 4, y, z, 0.3))]);

  // 2. the frontage, in four eras, with the alley between the second and
  // the third
  const heights: number[] = [];
  heights.push(machiya(b, 0, 12, seed));
  heights.push(modernBlock(b, 12, 12, 0x8e3b32, seed + 40));
  // THE ALLEY: four blocks of gap with the torii and the shrine down it.
  // the temple register reaching into the town at street scale, and it is
  // meant to recur: every town block gets one of these.
  b.add("torii", faceStreet(torii(3, 4)), FRONT + 1, 0, 25);
  b.add("alley shrine", alleyShrine(seed).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m })), 3, 0, 25);
  b.lamp(4, 2, 26, NEONRED, 9, 1.2);
  b.lamp(FRONT + 1, 3, 26, NEONRED, 7, 1.0);
  for (let x = 2; x <= FRONT; x++)
    for (let z = 24; z < 28; z++) b.add("alley paving", [cell(x, 0, z, speckle(STONEDARK, CONCRETEDARK, x, z, 2, 0.3))]);
  heights.push(westernStone(b, 28, 10, seed + 60));
  heights.push(narrowInfill(b, 38, 6, 0x2f6b6a, seed + 80));

  // 3. the wires. poles on the far pavement, cables to the building tops,
  // and one enormous sign hung across the road on them.
  const poleZ = [6, 22, 38];
  for (const z of poleZ) {
    b.add("wire + pole", pole(14, seed + z), FAR_KERB + 2, 1, z);
  }
  for (let k = 0; k < poleZ.length - 1; k++) {
    const a = poleZ[k];
    const c = poleZ[k + 1];
    b.add("wire + pole", wireRun(c - a, 2), FAR_KERB + 2, 14, a);
    // and a cable across the street to the buildings
    for (let x = FRONT + 2; x < FAR_KERB + 2; x++) {
      const t = (x - FRONT - 2) / (FAR_KERB - FRONT);
      b.add("wire + pole", [cell(x, 13 - Math.round(Math.sin(t * Math.PI) * 2), a, TIMBERDARK)]);
    }
  }
  // the sign strung over the road between two poles
  b.add("sign board", signBoard(9, 3, seed + 21, NEONEMBER).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m })), KERB + 2, 10, 20);
  for (let x = KERB + 2; x <= KERB + 4; x++) b.add("armature", [cell(x, 13, 20, SHUTTER), cell(x, 13, 28, SHUTTER)]);
  b.lamp(KERB + 3, 11, 24, NEONEMBER, 14, 1.3);

  // 4. the street's own furniture and everything left on it
  for (const z of [4, 17, 31, 41]) b.add("streetlight", streetlight(7).map((c) => ({ dx: -c.dz, dy: c.dy, dz: c.dx, m: c.m })), PAVE + 2, 1, z);
  for (const z of [5, 18, 32]) b.lamp(PAVE + 1, 8, z, LANTERN, 9, 0.9);
  b.add("vending machine", vendingMachine(seed), PAVE, 1, 9);
  b.lamp(PAVE, 2, 9, NEONCYAN, 6, 0.9);
  b.add("vending machine", vendingMachine(seed + 3), PAVE, 1, 35);
  b.lamp(PAVE, 2, 35, NEONAMBER, 6, 0.9);
  for (const z of [3, 8, 20, 33, 42]) b.add("bicycle", bicycle(seed + z), PAVE + 1, 1, z);
  for (const z of [14, 30]) b.add("crates", crates(seed + z), PAVE + 1, 1, z);
  for (const z of [11, 27, 40]) b.add("planter", planter(2, seed + z).map((c) => ({ dx: c.dz, dy: c.dy, dz: c.dx, m: c.m })), PAVE + 2, 1, z);
  // barriers along the kerb where the road bends
  for (let z = 12; z < 18; z++) if (z % 2 === 0) b.add("barrier", [cell(KERB, 1, z, SHUTTER), cell(KERB, 2, z, CONCRETEPALE)]);

  // 5. the blossom trees. in this register they are LIGHTS: they stand in
  // front of the signage and take its colour on their undersides, which is
  // the single highest-impact object on the street.
  b.add("blossom tree", blossomTree(5, 3.2, seed + 5), PAVE + 1, 1, 15);
  b.add("blossom tree", blossomTree(6, 3.6, seed + 6), PAVE + 1, 1, 29);
  b.add("blossom tree", blossomTree(4, 2.6, seed + 7), FAR_KERB + 2, 1, 12);

  // the columns the wet film lies on. the road is wettest, the pavements
  // hold puddles at the kerb, and the ground under an awning stays dry.
  const wet: { dx: number; dz: number; wet: number }[] = [];
  for (let z = 0; z < LEN; z++) {
    for (let x = PAVE; x < KERB; x++) wet.push({ dx: x, dz: z, wet: x === KERB - 1 ? 0.7 : 0.34 });
    for (let x = KERB; x <= FAR_KERB; x++) wet.push({ dx: x, dz: z, wet: 1 });
    for (let x = FAR_KERB + 1; x < FAR_KERB + 4; x++) wet.push({ dx: x, dz: z, wet: 0.4 });
  }

  // the ordered cells, and the tallest thing standing
  const cells = b.ordered;
  let height = 0;
  for (const c of cells) height = Math.max(height, c.dy);
  void heights;
  void GLASSBLUE;
  void TIMBERLIGHT;
  return {
    cells,
    emitters: b.lights,
    wet,
    manifest: b.manifest,
    footprint: { w: FAR_KERB + 6, d: LEN },
    height,
  };
}
