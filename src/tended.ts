// cathedral - TENDED GROUND. micro-detail by rule, so the land reads as
// KEPT rather than generated: field plots striped on the gentle mid
// slopes with hedgerow borders and gate gaps, low stone walls tracing
// the contours of the open hills with stiles where feet pass, and a
// broken gravel fringe along every paved edge. all of it is real blocks
// in the field, ground-classified types only, so the market's ledger of
// standing mass never notices the gardening.

import { GRID } from "./config";
import { CLIFF, EARTH, GRASSDRY, GRAVEL, MEADOWDEEP, isMeadow } from "./palette";
import { GENESIS_CELL, coastDistAt } from "./terrain";
import type { UrbanPlan } from "./plan";
import type { VoxelField } from "./voxels";

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function vnoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function tendGround(field: VoxelField, plan: UrbanPlan) {
  const CX = GENESIS_CELL.x;
  const CZ = GENESIS_CELL.z;
  const top = (x: number, z: number) => field.topAt(x, z);
  const surf = (x: number, z: number) => {
    const h = top(x, z);
    return h > 0 ? field.typeAt(x, h - 1, z) : 0;
  };
  // repaint the surface block of a column in place
  const paint = (x: number, z: number, t: number) => {
    const y = top(x, z) - 1;
    if (y < 1) return;
    field.applyRemoteEdit(x, y, z, t);
  };
  // set a block on top of a column (a wall stone, a hedge)
  const cap = (x: number, z: number, t: number) => {
    const y = top(x, z);
    if (y < 2 || field.isSolid(x, y, z)) return;
    field.placeAt(x, y, z, t);
  };
  const open = (x: number, z: number) =>
    top(x, z) > 0 && isMeadow(surf(x, z)) && !plan.isBuiltGround(x, z) && coastDistAt(x, z) > 10;

  // --- field plots: striped, hedged, gated ---------------------------------
  // three plots on the gentle mid slopes at set bearings; each is aligned
  // to the grid — a tilled field is the one place the world is allowed to
  // be rectilinear, because someone MADE it so
  const plots = [
    { a: 1.5, d: 52, w: 16, l: 11 },
    { a: 3.9, d: 56, w: 13, l: 15 },
    { a: 5.35, d: 50, w: 11, l: 9 },
  ];
  for (const p of plots) {
    const px = Math.round(CX + Math.cos(p.a) * p.d);
    const pz = Math.round(CZ + Math.sin(p.a) * p.d);
    const anchor = top(px, pz);
    if (anchor <= 0) continue;
    for (let dx = -(p.w >> 1); dx <= p.w >> 1; dx++) {
      for (let dz = -(p.l >> 1); dz <= p.l >> 1; dz++) {
        const x = px + dx;
        const z = pz + dz;
        if (x < 4 || z < 4 || x > GRID - 5 || z > GRID - 5) continue;
        if (!open(x, z)) continue;
        if (Math.abs(top(x, z) - anchor) > 3) continue; // the plot stays gentle
        const edgeX = Math.abs(dx) === p.w >> 1;
        const edgeZ = Math.abs(dz) === p.l >> 1;
        if (edgeX || edgeZ) {
          // hedgerow border, with a gate gap mid-side
          const gate =
            (edgeZ && Math.abs(dx) < 2 && dz > 0) || (edgeX && Math.abs(dz) < 2 && dx > 0);
          if (!gate && hash2(x * 3.1, z * 2.7) > 0.12) cap(x, z, MEADOWDEEP);
        } else {
          // tilled rows, two blocks wide, running the plot's long axis
          const row = p.w >= p.l ? dz : dx;
          paint(x, z, ((row >> 1) & 1) === 0 ? EARTH : GRASSDRY);
        }
      }
    }
  }

  // --- low walls along the contours ----------------------------------------
  // where the open hillside steps down a course or two, a run of field
  // stone caps the high lip — patchy, chosen by a slow noise so the walls
  // come in reaches rather than ringing every terrace, with stile gaps
  for (let x = 6; x < GRID - 6; x++) {
    for (let z = 6; z < GRID - 6; z++) {
      const dGen = Math.hypot(x - CX, z - CZ);
      if (dGen < 30 || dGen > 88) continue;
      if (!open(x, z)) continue;
      const h = top(x, z);
      const drop =
        Math.max(h - top(x + 1, z), h - top(x - 1, z), h - top(x, z + 1), h - top(x, z - 1));
      if (drop < 2 || drop > 4) continue;
      if (vnoise(x * 0.03 + 55, z * 0.03 + 21) < 0.62) continue; // reaches, not rings
      if (hash2(x * 5.3, z * 7.1) < 0.14) continue; // the stile gaps
      cap(x, z, CLIFF);
    }
  }

  // --- gravel fringe along the paved edges ---------------------------------
  // a path that someone sweeps has a worn border; a painted street edge
  // that jumps straight to grass reads as a texture seam
  for (let x = 4; x < GRID - 4; x++) {
    for (let z = 4; z < GRID - 4; z++) {
      if (!plan.isBuiltGround(x, z)) continue;
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]] as const) {
        if (plan.isBuiltGround(nx, nz)) continue;
        if (top(nx, nz) <= 0 || !isMeadow(surf(nx, nz))) continue;
        if (hash2(nx * 2.9, nz * 3.7) < 0.45) paint(nx, nz, GRAVEL);
      }
    }
  }
}
