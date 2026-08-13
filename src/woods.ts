// cathedral - the woods. trees as world furniture rather than as a design
// decision: groves on the hillsides, avenues along the plan's roads, bamboo
// at the water's edge.
//
// the architect can also PLANT trees — every species is in the catalogue —
// but a world where trees only exist where a building was designed is a
// world of landscaped plots in a bare field. the wild has to be wooded
// before the settlement is, or the settlement has nothing to be carved out
// of. so this runs at boot, before the crew has built anything, and it
// deliberately avoids made ground: the plan's paving stays clear, and what
// grows is what the town will later be cut into.

import { GRID } from "./config";
import { isGeology, isGround, STILLWATER } from "./palette";
import type { UrbanPlan } from "./plan";
import { TREES, bambooStand } from "./components/trees";
import type { VoxelField } from "./voxels";

export interface WoodsReport {
  planted: number;
  blocks: number;
  bySpecies: Record<string, number>;
}

// a deterministic shuffle of candidate points, so a world's woods are the
// same woods every boot
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

// is this column somewhere a tree may stand: real ground, not geology, not
// paving, not water, and not so steep the trunk hangs in the air
function plantable(field: VoxelField, plan: UrbanPlan | null, x: number, z: number): boolean {
  if (x < 10 || x >= GRID - 10 || z < 10 || z >= GRID - 10) return false;
  if (plan?.isBuiltGround(x, z)) return false;
  const y = field.topAt(x, z);
  if (y < 2) return false;
  const under = field.typeAt(x, y - 1, z);
  if (isGeology(under) || !isGround(under)) return false;
  // level enough: the four neighbours within two blocks of this one
  for (const [dx, dz] of [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ] as const) {
    if (Math.abs(field.topAt(x + dx, z + dz) - y) > 2) return false;
  }
  return true;
}

function nearWater(field: VoxelField, x: number, z: number): boolean {
  for (let dx = -4; dx <= 4; dx += 2)
    for (let dz = -4; dz <= 4; dz += 2) {
      const y = field.topAt(x + dx, z + dz);
      if (field.typeAt(x + dx, y - 1, z + dz) === STILLWATER) return true;
    }
  return false;
}

// plant the wild. groves cluster: a seed point picks a species and then
// drops six to fourteen of it in a scatter around itself, because a wood is
// made of stands and a world where every neighbouring tree is a different
// species reads as an arboretum.
export function plantWoods(
  field: VoxelField,
  plan: UrbanPlan | null,
  opts: { groves?: number; avenue?: boolean } = {}
): WoodsReport {
  const groves = opts.groves ?? 26;
  const bySpecies: Record<string, number> = {};
  let planted = 0;
  let blocks = 0;

  const put = (name: string, cells: { dx: number; dy: number; dz: number; m: number }[], x: number, z: number) => {
    const y = field.topAt(x, z);
    let n = 0;
    for (const c of cells) {
      const gx = x + c.dx;
      const gz = z + c.dz;
      const gy = y + c.dy;
      if (gx < 2 || gx >= GRID - 2 || gz < 2 || gz >= GRID - 2) continue;
      if (gy < 1 || gy > 92) continue;
      if (field.placeAt(gx, gy, gz, c.m)) n++;
    }
    if (n) {
      planted++;
      blocks += n;
      bySpecies[name] = (bySpecies[name] ?? 0) + 1;
    }
  };

  // ---- groves ---------------------------------------------------------------
  for (let g = 0; g < groves; g++) {
    // a seed point, deterministic per grove index
    let sx = 0;
    let sz = 0;
    let found = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const a = hash2(g * 7.3, attempt * 3.1) * Math.PI * 2;
      const r = 24 + hash2(g * 1.7, attempt * 5.9) * 90;
      const cx = Math.round(GRID / 2 + Math.cos(a) * r);
      const cz = Math.round(GRID / 2 + Math.sin(a) * r);
      if (!plantable(field, plan, cx, cz)) continue;
      sx = cx;
      sz = cz;
      found = true;
      break;
    }
    if (!found) continue;

    // bamboo takes the waterside; everything else is chosen by altitude, so
    // cedar and conifer crown the heights and broadleaf holds the flats
    const y = field.topAt(sx, sz);
    const water = nearWater(field, sx, sz);
    let pick: (typeof TREES)[number];
    if (water) {
      // a bamboo thicket IS the grove: one call, many culms
      const cells = bambooStand(20 + Math.floor(hash2(g, 11) * 18), 4, g);
      put("bamboo", cells, sx, sz);
      // and a weeping form at its edge
      const w = TREES.find((t) => t.name === "weeping")!;
      put(w.name, w.fn(13, g + 3), sx + 6, sz + 2);
      continue;
    }
    const high = y > 12;
    const candidates = high
      ? TREES.filter((t) => ["conifer", "cedar", "pine", "ancient"].includes(t.name))
      : TREES.filter((t) => ["broadleaf", "blossom", "autumn", "maple", "weeping"].includes(t.name));
    pick = candidates[Math.floor(hash2(g * 2.9, 13) * candidates.length) % candidates.length];

    const count = 6 + Math.floor(hash2(g, 17) * 9);
    for (let k = 0; k < count; k++) {
      const a = hash2(g * 3.7, k * 2.3) * Math.PI * 2;
      const r = Math.sqrt(hash2(g, k * 4.1)) * 13;
      const x = Math.round(sx + Math.cos(a) * r);
      const z = Math.round(sz + Math.sin(a) * r);
      if (!plantable(field, plan, x, z)) continue;
      const [lo, hi] = pick.h;
      const h = Math.round(lo + hash2(x, z) * (hi - lo));
      put(pick.name, pick.fn(h, (x * 31 + z) | 0), x, z);
    }
  }

  // ---- avenues --------------------------------------------------------------
  // cedar down the plan's roads, set back so the road stays walkable. an
  // avenue is the cheapest way to make a route read as a made thing.
  if (plan && opts.avenue !== false) {
    const cedar = TREES.find((t) => t.name === "cedar")!;
    for (const r of plan.routeList()) {
      const steps = Math.max(Math.abs(r.bx - r.ax), Math.abs(r.bz - r.az));
      for (let i = 6; i < steps - 4; i += 9) {
        const t = i / steps;
        const cx = Math.round(r.ax + (r.bx - r.ax) * t);
        const cz = Math.round(r.az + (r.bz - r.az) * t);
        // perpendicular offset, both sides
        const nx = -(r.bz - r.az) / Math.max(1, steps);
        const nz = (r.bx - r.ax) / Math.max(1, steps);
        for (const side of [-1, 1]) {
          const x = Math.round(cx + nx * 4 * side);
          const z = Math.round(cz + nz * 4 * side);
          if (!plantable(field, plan, x, z)) continue;
          put(cedar.name, cedar.fn(20 + Math.round(hash2(x, z) * 8), (x * 17 + z) | 0), x, z);
        }
      }
    }
  }

  return { planted, blocks, bySpecies };
}
