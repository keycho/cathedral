// cathedral - trees as ARCHITECTURE.
//
// the world's greenery was tufts: a few blocks of foliage scattered on the
// meadow, correct as ground cover and worth nothing as composition. in the
// references more than half of every frame is tree and rock, and the trees
// carry the picture — they have thick trunks that branch, canopies built
// course by course with a silhouette you could recognise from across a
// valley, and they stand in groves rather than sprinkled.
//
// so a tree here is built the way a roof is built. the same rule the kit
// opens with applies: if a form can be described by a single box — or by a
// sphere of leaves on a stick — it is not finished.
//
// what makes these read as different species rather than as one tree in
// six colours:
//
//   THE TRUNK. a conifer's is straight and tapers; a broadleaf's forks at
//   half height into limbs that fork again; a pine's leans and kinks; a
//   bamboo culm is one block and there are thirty of them.
//   THE CANOPY LAW. a conifer is whorls that shrink with height; a
//   broadleaf is one wide dome pierced by its own limbs; a weeping form
//   hangs curtains from the ends of its branches.
//   THE SILHOUETTE. every type has a different width-to-height ratio and a
//   different edge — ragged, rounded, columnar, layered.

import {
  BLOSSOM,
  FOLIAGE,
  FOLIAGESUN,
  TIMBERDARK,
  TIMBERMID,
  VERMILION,
  EMBERSEAM,
  STONEDARK,
} from "../palette";
import { cell, hash, type Part } from "./kit";

// a leaf cell: the sunward tint is used on the upper and outer shell so a
// canopy has a lit side, which is most of what makes it read as volume
const leaf = (dx: number, dy: number, dz: number, m: number, lit: boolean): { dx: number; dy: number; dz: number; m: number } =>
  cell(dx, dy, dz, lit ? sunward(m) : m);

function sunward(m: number): number {
  if (m === FOLIAGE) return FOLIAGESUN;
  return m;
}

// ---- trunks -----------------------------------------------------------------

// a TAPERING TRUNK: thick at the root, thinner with height, with a slight
// lean so no two trees stand to attention
function trunk(h: number, r0: number, seed: number, lean = 0.0, wood = TIMBERDARK): Part {
  const out: Part = [];
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    const r = Math.max(0, r0 * (1 - t * 0.72));
    const ox = Math.round(lean * y);
    const oz = Math.round(lean * y * 0.6);
    const ri = Math.ceil(r);
    for (let dx = -ri; dx <= ri; dx++) {
      for (let dz = -ri; dz <= ri; dz++) {
        if (Math.hypot(dx, dz) > r + 0.35) continue;
        // the bark breaks up with a second timber so a trunk is not one
        // flat column of colour
        const m = hash(dx, y, seed + dz) < 0.24 ? TIMBERMID : wood;
        out.push(cell(ox + dx, y, oz + dz, m));
      }
    }
  }
  return out;
}

// a LIMB: a stepped run from the trunk out and up, tapering to a tip. the
// stepping is the point — a diagonal drawn one block at a time reads as a
// branch, a straight line reads as a plank.
function limb(
  fromY: number,
  ang: number,
  len: number,
  rise: number,
  seed: number,
  wood = TIMBERDARK
): { cells: Part; tip: { x: number; y: number; z: number } } {
  const cells: Part = [];
  let x = 0;
  let z = 0;
  let y = fromY;
  const dx = Math.cos(ang);
  const dz = Math.sin(ang);
  for (let i = 0; i < len; i++) {
    x += dx;
    z += dz;
    y += rise * (1 - i / len) + (hash(i, seed, 3) - 0.5) * 0.3;
    const r = i < len * 0.4 ? 1 : 0;
    for (let ax = -r; ax <= r; ax++)
      for (let az = -r; az <= r; az++)
        cells.push(cell(Math.round(x) + ax, Math.round(y), Math.round(z) + az, wood));
  }
  return { cells, tip: { x: Math.round(x), y: Math.round(y), z: Math.round(z) } };
}

// ---- canopies ---------------------------------------------------------------

// a LAYERED DOME, built course by course: each course is a ring of a
// different radius, so the edge is stepped and the volume has a top. the
// outer shell takes the sunward tint.
function dome(cx: number, cy: number, cz: number, rx: number, ry: number, m: number, seed: number): Part {
  const out: Part = [];
  for (let y = -ry; y <= ry; y++) {
    const t = y / ry;
    // fuller above the middle than below: a canopy sits ON its branches
    const r = rx * Math.sqrt(Math.max(0, 1 - t * t)) * (y < 0 ? 0.86 : 1);
    const ri = Math.ceil(r);
    for (let dx = -ri; dx <= ri; dx++) {
      for (let dz = -ri; dz <= ri; dz++) {
        const d = Math.hypot(dx, dz);
        if (d > r) continue;
        // A CANOPY IS A SHELL. filling the volume tripled the block count
        // for cells no eye will ever see — a solid dome and a two-block
        // crust are the same picture from outside, and the crust is a third
        // of the stone. the top courses stay solid so a canopy seen from
        // above is not a bowl.
        const inner = d < r - 2.1 && y < ry - 1 && y > -ry + 1;
        if (inner) continue;
        // the ragged edge: leaves thin out at the rim rather than stopping
        if (d > r - 1 && hash(dx, y, seed + dz) < 0.42) continue;
        const lit = y > ry * 0.15 || d > r - 1.2;
        out.push(leaf(cx + dx, cy + y, cz + dz, m, lit));
      }
    }
  }
  return out;
}

// a WHORL: one flat-ish tier of a conifer, wider at its underside
function whorl(cx: number, cy: number, cz: number, r: number, m: number, seed: number): Part {
  const out: Part = [];
  for (let y = 0; y < 2; y++) {
    const rr = r * (y === 0 ? 1 : 0.62);
    const ri = Math.ceil(rr);
    for (let dx = -ri; dx <= ri; dx++) {
      for (let dz = -ri; dz <= ri; dz++) {
        const d = Math.hypot(dx, dz);
        if (d > rr) continue;
        if (d > rr - 1 && hash(dx, cy + y, seed + dz) < 0.5) continue;
        out.push(leaf(cx + dx, cy + y, cz + dz, m, y === 1 || d > rr - 1.2));
      }
    }
  }
  return out;
}

// ---- the species ------------------------------------------------------------

// 1. CONIFER. columnar, whorls shrinking with height, a bare spar at the top.
export function coniferTree(h = 22, seed = 1): Part {
  const out: Part = [];
  out.push(...trunk(h, 1.6, seed));
  const first = Math.round(h * 0.22);
  const tiers = Math.max(4, Math.round((h - first) / 2.4));
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = first + Math.round((h - first - 2) * t);
    const r = 4.0 * (1 - t * 0.82) + 0.7;
    out.push(...whorl(0, y, 0, r, FOLIAGE, seed + i * 7));
  }
  return out;
}

// 2. BROADLEAF. a thick bole forking into four limbs, one wide dome that
// its own limbs push through.
export function broadleafTree(h = 16, seed = 2, canopy = FOLIAGE): Part {
  const out: Part = [];
  const forkAt = Math.round(h * 0.45);
  out.push(...trunk(forkAt + 2, 2.2, seed));
  const tips: { x: number; y: number; z: number }[] = [];
  const arms = 4 + (Math.floor(hash(seed, 3, 9) * 3) | 0);
  for (let i = 0; i < arms; i++) {
    const ang = (i / arms) * Math.PI * 2 + hash(i, seed, 5) * 0.7;
    const l = limb(forkAt, ang, 4 + Math.round(hash(i, seed, 11) * 3), 1.05, seed + i);
    out.push(...l.cells);
    tips.push(l.tip);
    // a second-order fork on half the limbs, which is what stops a tree
    // reading as a parasol
    if (hash(i, seed, 13) < 0.5) {
      const l2 = limb(l.tip.y, ang + (hash(i, seed, 17) - 0.5) * 1.4, 3, 0.9, seed + i + 40);
      out.push(...l2.cells.map((c) => cell(c.dx + l.tip.x, c.dy, c.dz + l.tip.z, c.m)));
      tips.push({ x: l.tip.x + l2.tip.x, y: l2.tip.y, z: l.tip.z + l2.tip.z });
    }
  }
  const top = forkAt + Math.round(h * 0.42);
  out.push(...dome(0, top, 0, 5.2, 3.0, canopy, seed));
  // a puff at each limb tip so the crown is lumpy rather than one blob
  for (const t of tips) out.push(...dome(t.x, t.y + 1, t.z, 2.0, 1.4, canopy, seed + t.x));
  return out;
}

// 3. BLOSSOM. lower, wider, and pink — the canopy the references lean on.
export function blossomTreeBig(h = 13, seed = 3): Part {
  return broadleafTree(h, seed, BLOSSOM);
}

// 4. AUTUMN. the same architecture in ember, for a stand that has turned.
export function autumnTree(h = 15, seed = 4): Part {
  // EMBERSEAM, not NEONAMBER. amber is a SIGN colour and it is in the
  // emissive table — an autumn wood built out of it would glow in the dark,
  // which is a striking mistake to leave in a forest.
  return broadleafTree(h, seed, EMBERSEAM);
}

// 5. BAMBOO STAND. thirty single-block culms with leaf sprays near their
// tops. no trunk at all, which is exactly why it reads as bamboo.
export function bambooStand(count = 26, spread = 4, seed = 5): Part {
  const out: Part = [];
  for (let i = 0; i < count; i++) {
    const ang = hash(i, seed, 2) * Math.PI * 2;
    const rad = Math.sqrt(hash(i, seed, 4)) * spread;
    const x = Math.round(Math.cos(ang) * rad);
    const z = Math.round(Math.sin(ang) * rad);
    const h = 9 + Math.round(hash(i, seed, 6) * 9);
    for (let y = 0; y < h; y++) {
      // the node bands, one block of lighter cane every four
      out.push(cell(x, y, z, y % 4 === 3 ? FOLIAGESUN : TIMBERMID));
    }
    for (let k = 0; k < 4; k++) {
      const ly = h - 1 - k * 2;
      if (ly < 3) break;
      const dx = k % 2 === 0 ? 1 : -1;
      out.push(leaf(x + dx, ly, z, FOLIAGE, true));
      out.push(leaf(x, ly, z + (k < 2 ? 1 : -1), FOLIAGE, k < 2));
    }
  }
  return out;
}

// 6. WEEPING. limbs that reach out level and then hang curtains of leaf.
export function weepingTree(h = 14, seed = 6): Part {
  const out: Part = [];
  const forkAt = Math.round(h * 0.6);
  out.push(...trunk(forkAt + 1, 1.9, seed));
  const arms = 6;
  for (let i = 0; i < arms; i++) {
    const ang = (i / arms) * Math.PI * 2 + hash(i, seed, 3) * 0.5;
    const l = limb(forkAt, ang, 5 + Math.round(hash(i, seed, 7) * 2), 0.35, seed + i);
    out.push(...l.cells);
    // the curtain: a fall of leaf from the tip, longest at the outside
    const fall = 5 + Math.round(hash(i, seed, 9) * 4);
    for (let k = 0; k < fall; k++) {
      out.push(leaf(l.tip.x, l.tip.y - k, l.tip.z, FOLIAGE, k < 2));
      if (k > 0 && hash(k, seed, i) < 0.6)
        out.push(leaf(l.tip.x - Math.sign(Math.cos(ang)), l.tip.y - k, l.tip.z, FOLIAGE, false));
    }
  }
  out.push(...dome(0, forkAt + 2, 0, 4.0, 1.9, FOLIAGE, seed));
  return out;
}

// 7. PINE. the windswept one: a leaning kinked trunk, few limbs, flat
// plates of needle. the specimen tree of a temple court.
export function pineTree(h = 15, seed = 7): Part {
  const out: Part = [];
  const lean = 0.16;
  out.push(...trunk(h, 1.7, seed, lean));
  const bx = Math.round(lean * h);
  const bz = Math.round(lean * h * 0.6);
  const plates = 3 + (Math.floor(hash(seed, 5, 2) * 2) | 0);
  for (let i = 0; i < plates; i++) {
    const t = i / plates;
    const ang = hash(i, seed, 8) * Math.PI * 2;
    const fromY = Math.round(h * (0.45 + t * 0.5));
    const l = limb(fromY, ang, 4 + Math.round(hash(i, seed, 12) * 3), 0.5, seed + i);
    out.push(...l.cells.map((c) => cell(c.dx + Math.round(lean * fromY), c.dy, c.dz + Math.round(lean * fromY * 0.6), c.m)));
    // a FLAT plate of needle, two courses, wide and thin: the shape that
    // makes a pine a pine
    const px = l.tip.x + Math.round(lean * fromY);
    const pz = l.tip.z + Math.round(lean * fromY * 0.6);
    for (let y = 0; y < 2; y++) {
      const r = 2.7 - y * 0.8;
      const ri = Math.ceil(r);
      for (let dx = -ri; dx <= ri; dx++)
        for (let dz = -ri; dz <= ri; dz++) {
          const d = Math.hypot(dx, dz);
          if (d > r) continue;
          if (d > r - 1 && hash(dx, y, seed + dz) < 0.45) continue;
          out.push(leaf(px + dx, l.tip.y + y, pz + dz, FOLIAGE, y === 1));
        }
    }
  }
  out.push(...dome(bx, h + 1, bz, 2.5, 1.5, FOLIAGE, seed + 21));
  return out;
}

// 8. CEDAR. very tall, narrow, a dark column for a ridgeline.
export function cedarTree(h = 26, seed = 8): Part {
  const out: Part = [];
  out.push(...trunk(h, 1.9, seed));
  const first = Math.round(h * 0.18);
  const tiers = Math.round((h - first) / 2);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = first + Math.round((h - first - 1) * t);
    const r = 2.8 * (1 - t * 0.6) + 0.6;
    out.push(...whorl(0, y, 0, r, FOLIAGE, seed + i * 5));
  }
  return out;
}

// 9. MAPLE. small, red, wide for its height — the courtyard specimen.
export function mapleTree(h = 10, seed = 9): Part {
  const out: Part = [];
  const forkAt = Math.round(h * 0.4);
  out.push(...trunk(forkAt + 1, 1.5, seed));
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + hash(i, seed, 3) * 0.6;
    const l = limb(forkAt, ang, 3, 1.1, seed + i);
    out.push(...l.cells);
    out.push(...dome(l.tip.x, l.tip.y + 1, l.tip.z, 2.3, 1.5, VERMILION, seed + i * 3));
  }
  out.push(...dome(0, forkAt + 3, 0, 3.8, 2.0, VERMILION, seed));
  return out;
}

// 10. ANCIENT. a gnarled specimen with a hollow buttressed root, the one
// you build a shrine beside.
export function ancientTree(h = 18, seed = 10): Part {
  const out: Part = [];
  // buttress roots: four stone-dark flares at the base
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.4;
    for (let k = 1; k <= 3; k++) {
      const x = Math.round(Math.cos(ang) * k);
      const z = Math.round(Math.sin(ang) * k);
      for (let y = 0; y < 4 - k; y++) out.push(cell(x, y, z, y === 0 ? STONEDARK : TIMBERDARK));
    }
  }
  out.push(...trunk(Math.round(h * 0.55), 2.6, seed, 0.05));
  const forkAt = Math.round(h * 0.5);
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + hash(i, seed, 2) * 0.8;
    const l = limb(forkAt, ang, 5 + Math.round(hash(i, seed, 6) * 4), 0.8, seed + i);
    out.push(...l.cells);
    out.push(...dome(l.tip.x, l.tip.y + 1, l.tip.z, 2.6, 1.7, FOLIAGE, seed + i * 5));
  }
  out.push(...dome(0, forkAt + 5, 0, 4.6, 2.6, FOLIAGE, seed + 31));
  return out;
}

// the roster. HEIGHTS ARE SIZED AGAINST THE BUILDINGS: a hall stands 15 to
// 25, and a mature tree wants to be roughly two thirds of that, because in
// the references the trees FLANK and FRAME the architecture — they never
// bury it. the first pass had canopies taller and wider than the halls they
// stood beside and the town read as undergrowth. cedar is the one that may
// overtop a roof, and it is deliberately the narrowest.
//
// `accent` marks the ones that are not living green. they are seasonal
// punctuation, not the wood.
export const TREES: { name: string; fn: (h: number, seed: number) => Part; h: [number, number]; accent?: boolean }[] = [
  { name: "conifer", fn: coniferTree, h: [11, 16] },
  { name: "broadleaf", fn: (h, s) => broadleafTree(h, s), h: [9, 14] },
  { name: "blossom", fn: blossomTreeBig, h: [8, 12], accent: true },
  { name: "autumn", fn: autumnTree, h: [8, 13], accent: true },
  { name: "weeping", fn: weepingTree, h: [8, 13] },
  { name: "pine", fn: pineTree, h: [9, 14] },
  { name: "cedar", fn: cedarTree, h: [14, 20] },
  { name: "maple", fn: mapleTree, h: [6, 10], accent: true },
  { name: "ancient", fn: ancientTree, h: [11, 16] },
];
