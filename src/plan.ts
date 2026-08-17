// kodo - the urban plan. the layer that makes a settlement out of
// buildings.
//
// the world's works used to sit on open meadow like garden furniture: each
// one correctly designed, each one facing nowhere, none of them aware that
// the others existed. that is not a per-blueprint failure and it cannot be
// fixed inside a blueprint — a building cannot decide to be part of a town
// on its own. so the town is a PERSISTENT LAYER that outlives any one
// design: it is established once from the terrain, it is READ by the
// architect before it draws, and it is EXTENDED by whatever gets built.
//
// what it holds:
//
//   THE PLAZA at the founding stone, which everything is measured from.
//   THE PRECINCT on the heights: walled, for the temple register.
//   THE QUARTER on the flats: streeted, for the town register.
//   THE ROUTES between them, which are also the thing a new work has to
//   join — a stair that lands on nothing is a stair to nowhere.
//   THE PARCELS already built, so the next work infills rather than sprawls.
//
// and the law it exists to enforce: NOTHING STANDS ON WILD GROUND. every
// structure gets built ground under it — a cut platform, paving, an edge —
// and the transition from built to wild is visible as a made line rather
// than as a building fading into grass.

import { GRID } from "./config";
import { CONCRETEDARK, CONCRETEMID, CONCRETEPALE, EARTH, MEADOW, SCARMOSS, STONE, STONEDARK, isGeology, isGround, isMeadow } from "./palette";
import { bench, courtFeature, lowWall, paveBed } from "./components/clutter";
import type { VoxelField } from "./voxels";

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export type Quarter = "plaza" | "precinct" | "quarter";

// THE HIERARCHY, DECLARED. every work was medium because nothing in the plan
// said otherwise: the site score picked flat reachable ground and the budget
// picked a size, and a hundred correct decisions made one texture. a place
// reads because ONE thing is obviously more important than everything else
// and the rest is arranged with respect to it.
export type Slot = "great" | "notable" | "ordinary";

export interface SlotSpec {
  kind: Slot;
  // the band a work taken from this slot must land in, in blocks of height
  minHeight: number;
  maxHeight: number;
  // and roughly what it may spend
  budgetScale: number;
}

export const SLOTS: Record<Slot, SlotSpec> = {
  // one. four to five times an ordinary hall, and the thing every view is
  // arranged around.
  great: { kind: "great", minHeight: 48, maxHeight: 90, budgetScale: 3.0 },
  // three or four: a gate, a hall, a bridge, a tower. tall enough to be
  // landmarks at district scale, nowhere near the great work.
  notable: { kind: "notable", minHeight: 18, maxHeight: 32, budgetScale: 1.6 },
  // everything else, and most of the world by count
  ordinary: { kind: "ordinary", minHeight: 5, maxHeight: 16, budgetScale: 1.0 },
};

export interface Street {
  name: string;
  ax: number; // centreline, cells
  az: number;
  bx: number;
  bz: number;
  width: number; // carriageway, kerb to kerb
  axis: "x" | "z"; // the run of the street, for facing
}

export interface Parcel {
  x: number; // footprint corner, cells
  z: number;
  w: number;
  d: number;
  slot?: Slot;
  quarter: Quarter;
  planId: string;
  title: string;
  epoch: number;
}

export interface PlannedSite {
  anchorX: number;
  anchorZ: number;
  quarter: Quarter;
  // WHY here, in words the architect is given: a site is an argument about
  // the settlement, not a coordinate
  reason: string;
  // the cell of built ground this work must reach. a design that does not
  // touch the network is refused.
  joinX: number;
  joinZ: number;
}

const key = (x: number, z: number) => x * GRID + z;

export class UrbanPlan {
  // the living layer, so ground the plan makes stops being meadow in every
  // sense rather than only in its material
  flora?: { clearAt(x0: number, z0: number, w: number, d: number): void };
  readonly plazaX: number;
  readonly plazaZ: number;
  readonly plazaY: number;
  // the two districts, established once from the land itself
  precinct: { x: number; z: number; r: number };
  quarter: { x: number; z: number; r: number };
  readonly parcels: Parcel[] = [];
  // every cell of built ground a new work may join: paving, street, path,
  // platform edge. this is the thing "connect to the existing fabric"
  // actually means.
  private network = new Set<number>();
  private routes: { ax: number; az: number; bx: number; bz: number; name: string }[] = [];
  // STREETS ARE PLAN OBJECTS, NOT A SIDE EFFECT OF PAVING. town works were
  // each given their own levelled pad and each faced whichever way it liked,
  // so a quarter came out as detached shops on separate platforms — the one
  // thing a town is not. a street exists BEFORE the buildings on it: it has
  // a centreline, a width, two frontage lines, and a name, and a work in the
  // quarter is sited against a frontage rather than on open ground.
  readonly streets: Street[] = [];
  // where the great work stands, and the corridors kept clear so it can be
  // seen from the places that matter
  greatWorkAt: { x: number; z: number; y: number; r: number } | null = null;
  readonly sightlines: { ax: number; az: number; bx: number; bz: number; w: number }[] = [];
  // how many notable slots are still unfilled. the plan hands them out
  // rather than letting the site score decide everything is medium.
  private notableLeft = 4;
  private streetsLaid = false;

  constructor(private field: VoxelField, genesis: { x: number; z: number }, flatsY: number) {
    this.plazaX = genesis.x;
    this.plazaZ = genesis.z;
    this.plazaY = field.topAt(genesis.x, genesis.z);

    // THE PRECINCT goes uphill and THE QUARTER goes downhill, found by
    // walking the land rather than by picking numbers: sample a ring at
    // middle distance and take the highest and lowest workable ground.
    let hi = { x: genesis.x, z: genesis.z, y: -1 };
    let lo = { x: genesis.x, z: genesis.z, y: 999 };
    for (let a = 0; a < 48; a++) {
      const ang = (a / 48) * Math.PI * 2;
      for (const r of [26, 34, 42]) {
        const x = Math.round(genesis.x + Math.cos(ang) * r);
        const z = Math.round(genesis.z + Math.sin(ang) * r);
        if (x < 20 || x > GRID - 20 || z < 20 || z > GRID - 20) continue;
        const y = field.topAt(x, z);
        const under = field.typeAt(x, y - 1, z);
        if (isGeology(under)) continue;
        if (y > hi.y) hi = { x, z, y };
        if (y < lo.y) lo = { x, z, y };
      }
    }
    this.precinct = { x: hi.x, z: hi.z, r: 22 };
    this.quarter = { x: lo.x, z: lo.z, r: 24 };
    void flatsY;

    this.routes = [
      { ax: this.plazaX, az: this.plazaZ, bx: this.precinct.x, bz: this.precinct.z, name: "the pilgrim way, plaza to precinct" },
      { ax: this.plazaX, az: this.plazaZ, bx: this.quarter.x, bz: this.quarter.z, name: "the market road, plaza to quarter" },
    ];
  }

  // ---- founding the settlement ---------------------------------------------

  // the plaza and the two roads out of it, laid once so there is something
  // for the first work to join. without this the first design has no fabric
  // to extend and the rule that it must extend one is unsatisfiable.
  found(): number {
    let laid = 0;
    // AN AVENUE HAS SOMETHING AT THE END OF IT. the pilgrim way ran to the
    // middle of the precinct, which is a coordinate rather than a thing —
    // so walking it terminated on whatever building happened to have been
    // sited near the centre, and usually on grass. it now aims at the great
    // work, which means the pagoda is at the end of the road, growing, for
    // the whole length of the walk. this is the cheapest framing device
    // there is and it is the one that changes the most.
    if (this.greatWorkAt) {
      this.routes[0].bx = this.greatWorkAt.x;
      this.routes[0].bz = this.greatWorkAt.z;
      this.routes[0].name = "the pilgrim way, plaza to the great work";
    }
    laid += this.pave(this.plazaX - 6, this.plazaZ - 6, 13, 13, STONE);
    // THE PILGRIM WAY EARNS ITS NAME: route length over area. the way to
    // the great work goes by switchbacks — three waypoints swung
    // alternately off the direct line — so the approach is a climb with
    // turns and reveals rather than a straight march, and the world walks
    // longer than it measures. the market road stays direct: commerce is
    // in a hurry, pilgrims are not.
    const way = this.routes[0];
    const wdx = way.bx - way.ax;
    const wdz = way.bz - way.az;
    const wl = Math.hypot(wdx, wdz) || 1;
    const px = -wdz / wl;
    const pz = wdx / wl;
    const swing = Math.min(16, wl * 0.3);
    let lx = way.ax;
    let lz = way.az;
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const side = (k % 2 === 0 ? -1 : 1) * swing * (k === 2 ? 1 : 0.7);
      const nx = Math.round(way.ax + wdx * t + px * side);
      const nz = Math.round(way.az + wdz * t + pz * side);
      laid += this.road(lx, lz, nx, nz);
      lx = nx;
      lz = nz;
    }
    laid += this.road(lx, lz, way.bx, way.bz);
    for (let i = 1; i < this.routes.length; i++) {
      const r = this.routes[i];
      laid += this.road(r.ax, r.az, r.bx, r.bz);
    }
    // the precinct's own wall line and the quarter's kerb are laid as the
    // districts are built into, not up front: an empty walled field reads
    // worse than open meadow.
    return laid;
  }

  // THE QUARTER'S STREETS, laid the first time anything is built there. not
  // at founding: an empty gridded field reads worse than open meadow, and
  // the quarter's position is only known once the land has been walked.
  //
  // two of them, crossing, so the quarter has a corner — a single street is
  // a row and a crossing is a place. they are laid as real carriageway with
  // a kerb line either side, which is what the frontages are measured from.
  layStreets(): number {
    if (this.streetsLaid) return 0;
    this.streetsLaid = true;
    const q = this.quarter;
    const half = Math.round(q.r * 0.8);
    this.streets.push(
      { name: "the long street", ax: q.x - half, az: q.z, bx: q.x + half, bz: q.z, width: 5, axis: "x" },
      { name: "the cross lane", ax: q.x, az: q.z - half, bx: q.x, bz: q.z + half, width: 4, axis: "z" }
    );
    let laid = 0;
    for (const st of this.streets) {
      const steps = Math.max(Math.abs(st.bx - st.ax), Math.abs(st.bz - st.az));
      const w = st.width >> 1;
      for (let i = 0; i <= steps; i++) {
        const t = i / Math.max(1, steps);
        const cx = Math.round(st.ax + (st.bx - st.ax) * t);
        const cz = Math.round(st.az + (st.bz - st.az) * t);
        if (st.axis === "x") {
          laid += this.pave(cx, cz - w, 1, st.width, CONCRETEDARK);
          for (const side of [-w - 1, w + 1]) this.pave(cx, cz + side, 1, 1, CONCRETEPALE);
        } else {
          laid += this.pave(cx - w, cz, st.width, 1, CONCRETEDARK);
          for (const side of [-w - 1, w + 1]) this.pave(cx + side, cz, 1, 1, CONCRETEPALE);
        }
      }
    }
    return laid;
  }

  // which frontage a site belongs to, and which way a building on it faces.
  // this is what makes a row a row: every work on the long street is told
  // the same line to build its shopfronts along.
  frontageFor(x0: number, z0: number, w: number, d: number): { street: Street; side: 1 | -1; line: number } | null {
    const cx = x0 + w / 2;
    const cz = z0 + d / 2;
    let best: { street: Street; side: 1 | -1; line: number; d: number } | null = null;
    for (const st of this.streets) {
      const half = st.width / 2 + 1;
      if (st.axis === "x") {
        if (cx < Math.min(st.ax, st.bx) - 6 || cx > Math.max(st.ax, st.bx) + 6) continue;
        const side: 1 | -1 = cz >= st.az ? 1 : -1;
        const line = Math.round(st.az + side * half);
        const dist = Math.abs(cz - line);
        if (!best || dist < best.d) best = { street: st, side, line, d: dist };
      } else {
        if (cz < Math.min(st.az, st.bz) - 6 || cz > Math.max(st.az, st.bz) + 6) continue;
        const side: 1 | -1 = cx >= st.ax ? 1 : -1;
        const line = Math.round(st.ax + side * half);
        const dist = Math.abs(cx - line);
        if (!best || dist < best.d) best = { street: st, side, line, d: dist };
      }
    }
    return best && best.d <= 18 ? { street: best.street, side: best.side, line: best.line } : null;
  }

  // a path of built ground between two points, bresenham-ish and three wide
  private road(ax: number, az: number, bx: number, bz: number): number {
    let laid = 0;
    const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      const x = Math.round(ax + (bx - ax) * t);
      const z = Math.round(az + (bz - az) * t);
      laid += this.pave(x - 1, z - 1, 3, 3, STONEDARK);
    }
    return laid;
  }

  // lay built ground: level it to its own median and surface it. this is
  // the "never directly on meadow" rule, applied.
  pave(x0: number, z0: number, w: number, d: number, surface = STONE): number {
    this.flora?.clearAt(x0, z0, w, d);
    const tops: number[] = [];
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) tops.push(this.field.topAt(x0 + x, z0 + z));
    if (!tops.length) return 0;
    tops.sort((a, b) => a - b);
    const y = tops[Math.floor(tops.length / 2)];
    let laid = 0;
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        const gx = x0 + x;
        const gz = z0 + z;
        if (gx < 4 || gx >= GRID - 4 || gz < 4 || gz >= GRID - 4) continue;
        for (let yy = this.field.topAt(gx, gz) - 1; yy >= y; yy--) this.field.breakAt(gx, yy, gz);
        for (let yy = this.field.topAt(gx, gz); yy < y; yy++) this.field.placeAt(gx, yy, gz, EARTH);
        // PAVING REPLACES THE GROUND, IT DOES NOT LAND ON IT. placeAt only
        // fills air, so on a column that needed no cut and no fill the
        // surface call was a silent no-op — and the flattest ground in the
        // world is the founding plaza, which is also the most built on. a
        // whole 24x24 platform came back as untouched meadow: every work on
        // level ground has been standing directly on grass this entire time,
        // which is the one thing the plan exists to prevent.
        //
        // geology is never replaced, and neither is anything the crew built.
        const top = this.field.topAt(gx, gz) - 1;
        const under = this.field.typeAt(gx, top, gz);
        if (top === y - 1 && isGround(under) && !isGeology(under)) this.field.breakAt(gx, top, gz);
        if (this.field.placeAt(gx, y - 1, gz, surface)) laid++;
        this.network.add(key(gx, gz));
      }
    }
    return laid;
  }

  // THE PLATFORM a work stands on, with its edge. the edge is the point:
  // built ground that fades into grass reads as a building dropped on a
  // lawn, and a retaining course reads as ground someone MADE.
  platform(x0: number, z0: number, w: number, d: number, quarter: Quarter): { groundY: number; laid: number } {
    const surface = quarter === "quarter" ? CONCRETEMID : STONE;
    const laid = this.pave(x0 - 1, z0 - 1, w + 2, d + 2, surface);
    const groundY = this.field.topAt(x0 + (w >> 1), z0 + (d >> 1));
    // TWO courses, not one. a single course is a change of colour and reads
    // as a path; two is a retaining edge, which is what says somebody CUT
    // this ground rather than found it.
    const skirt = (gx: number, gz: number) => {
      if (gx < 4 || gx >= GRID - 4 || gz < 4 || gz >= GRID - 4) return;
      this.field.placeAt(gx, groundY - 1, gz, STONEDARK);
      this.field.placeAt(gx, groundY - 2, gz, STONEDARK);
      this.network.add(key(gx, gz));
    };
    for (let x = -2; x <= w + 1; x++) for (const z of [-2, d + 1]) skirt(x0 + x, z0 + z);
    for (let z = -2; z <= d + 1; z++) for (const x of [-2, w + 1]) skirt(x0 + x, z0 + z);
    return { groundY, laid };
  }

  // THE COURT IS CUT TO THE BUILDING, NOT TO THE SITE. the platform has to
  // be laid BEFORE the design exists — the architect needs level ground to
  // draw on and a height map to read — so it is cut to the whole site, and
  // a 24x24 apron under a 15x15 hall is nine hundred stones of empty
  // paving. at orbit fifteen of those read as car parks.
  //
  // once the design is validated its footprint IS known, so the apron is
  // trimmed back to it. what falls outside does not revert to wilderness:
  // it stays levelled, stays in the network, and grasses over — which is a
  // cut terrace, exactly the made ground the plan wants, and it keeps the
  // visible wild/built edge the platform was for.
  //
  // what stays inside is broken up. a court that is one material at one
  // level is a slab whatever size it is: this lays a darker border band, a
  // scatter of the second stone through the field, and planting beds in the
  // corners the building does not reach.
  trimPlatform(
    x0: number,
    z0: number,
    w: number,
    d: number,
    columns: Set<number>,
    quarter: Quarter
  ): { kept: number; grassed: number } {
    const surface = quarter === "quarter" ? CONCRETEMID : STONE;
    // A BOUNDING BOX IS NOT A FOOTPRINT. an L of buildings round two sides
    // of a court has a box that covers the whole platform, so trimming to
    // one reclaimed 14% and left the aprons. this dilates the columns the
    // work ACTUALLY stands on, so an empty corner is an empty corner
    // however the work is shaped.
    const margin = 3;
    const near = new Set<number>();
    for (const c of columns) {
      const cx = Math.floor(c / GRID);
      const cz = c % GRID;
      for (let dx = -margin; dx <= margin; dx++) {
        for (let dz = -margin; dz <= margin; dz++) {
          if (dx * dx + dz * dz > margin * margin + 1) continue;
          near.add((cx + dx) * GRID + (cz + dz));
        }
      }
    }
    let kept = 0;
    let grassed = 0;
    let kx0 = Infinity;
    let kx1 = -Infinity;
    let kz0 = Infinity;
    let kz1 = -Infinity;
    for (let gx = x0; gx < x0 + w; gx++) {
      for (let gz = z0; gz < z0 + d; gz++) {
        if (gx < 4 || gx >= GRID - 4 || gz < 4 || gz >= GRID - 4) continue;
        const y = this.field.topAt(gx, gz) - 1;
        const t = this.field.typeAt(gx, y, gz);
        // only the paving this plan laid is touched; anything the design
        // built on top of it, and any ground it never surfaced, is left
        if (t !== surface && t !== STONE && t !== CONCRETEMID) continue;
        if (!near.has(gx * GRID + gz)) {
          this.field.breakAt(gx, y, gz);
          // a reclaimed terrace takes the green of the ground around it,
          // not the one flat note the family replaced
          this.field.placeAt(gx, y, gz, this.greenNear(gx, gz));
          grassed++;
          continue;
        }
        kept++;
        kx0 = Math.min(kx0, gx); kx1 = Math.max(kx1, gx);
        kz0 = Math.min(kz0, gz); kz1 = Math.max(kz1, gz);
        // the court's edge: a darker band wherever the paving meets what is
        // no longer paved, which follows the dilated shape rather than a
        // rectangle drawn round it
        const rim =
          !near.has((gx - 1) * GRID + gz) || !near.has((gx + 1) * GRID + gz) ||
          !near.has(gx * GRID + gz - 1) || !near.has(gx * GRID + gz + 1);
        this.field.breakAt(gx, y, gz);
        if (rim) {
          this.field.placeAt(gx, y, gz, STONEDARK);
          continue;
        }
        // and a coarse variation through the field, so the court has a
        // grain rather than a colour
        const n = Math.abs(Math.sin(gx * 12.9898 + gz * 78.233) * 43758.5453) % 1;
        if (n < 0.16) this.field.placeAt(gx, y, gz, STONEDARK);
        // moss between the stones in the precinct, a pale slab in the town
        else if (n > 0.93) this.field.placeAt(gx, y, gz, quarter === "quarter" ? CONCRETEPALE : SCARMOSS);
        else this.field.placeAt(gx, y, gz, surface);
      }
    }
    if (!kept) return { kept, grassed };
    this.furnishCourt(kx0, kz0, kx1, kz1, columns);
    // the retaining edge moves with the court
    const skirtY = this.field.topAt((kx0 + kx1) >> 1, (kz0 + kz1) >> 1);
    const skirt = (gx: number, gz: number) => {
      if (gx < 4 || gx >= GRID - 4 || gz < 4 || gz >= GRID - 4) return;
      this.field.placeAt(gx, skirtY - 1, gz, STONEDARK);
      this.field.placeAt(gx, skirtY - 2, gz, STONEDARK);
      this.network.add(key(gx, gz));
    };
    for (let gx = kx0 - 1; gx <= kx1 + 1; gx++) for (const gz of [kz0 - 1, kz1 + 1]) skirt(gx, gz);
    for (let gz = kz0 - 1; gz <= kz1 + 1; gz++) for (const gx of [kx0 - 1, kx1 + 1]) skirt(gx, gz);
    return { kept, grassed };
  }

  // A COURT OVER ABOUT EIGHT BLOCKS IS A SLAB whatever it is made of. the
  // trim leaves an open area around a work and open paving at that size is
  // exactly the grey apron the trim was meant to stop — smaller, but still
  // flat, still empty, still the thing the eye slides off.
  //
  // this is laid by RULE rather than designed, because the thing that knows
  // a court is too big is the thing that laid it, and the architect is not
  // in the room by the time the footprint is known. it goes only where the
  // work itself put nothing, so it can never land on a design.
  private furnishCourt(x0: number, z0: number, x1: number, z1: number, columns: Set<number>): void {
    const w = x1 - x0 + 1;
    const d = z1 - z0 + 1;
    if (w < 9 && d < 9) return;
    const free = (gx: number, gz: number, r = 1) => {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (columns.has((gx + dx) * GRID + (gz + dz))) return false;
        }
      }
      return true;
    };
    const put = (part: { dx: number; dy: number; dz: number; m: number }[], ax: number, az: number) => {
      const y = this.field.topAt(ax, az);
      for (const c of part) {
        const gx = ax + c.dx;
        const gz = az + c.dz;
        if (gx < 4 || gx >= GRID - 4 || gz < 4 || gz >= GRID - 4) continue;
        if (columns.has(gx * GRID + gz)) continue;
        if (c.dy === 0) this.field.breakAt(gx, y - 1, gz);
        this.field.placeAt(gx, y + c.dy - (c.dy === 0 ? 1 : 0), gz, c.m);
      }
    };
    const seed = (x0 * 31 + z0 * 17) | 0;
    // the thing in the middle, wherever the middle happens to be clear
    const cx = (x0 + x1) >> 1;
    const cz = (z0 + z1) >> 1;
    for (let attempt = 0; attempt < 24; attempt++) {
      const ax = cx + Math.round((hash2(seed, attempt) - 0.5) * w * 0.5);
      const az = cz + Math.round((hash2(attempt, seed) - 0.5) * d * 0.5);
      if (!free(ax, az, 3)) continue;
      put(courtFeature(seed + attempt), ax, az);
      break;
    }
    // beds and a bench in the corners the work does not reach into
    for (let k = 0; k < 6; k++) {
      const ax = x0 + 1 + Math.floor(hash2(seed + k, 3.1) * Math.max(1, w - 6));
      const az = z0 + 1 + Math.floor(hash2(4.7, seed + k) * Math.max(1, d - 6));
      if (!free(ax, az, 3)) continue;
      const roll = hash2(seed + k * 3, 9.3);
      if (roll < 0.45) put(paveBed(3 + Math.floor(roll * 6), 3, seed + k), ax, az);
      else if (roll < 0.72) put(bench(4, seed + k), ax, az);
      else put(lowWall(4 + Math.floor(roll * 5), roll < 0.86 ? "x" : "z", seed + k), ax, az);
    }
  }

  // the commonest green among the columns just outside a patch, so ground
  // handed back to the wild matches the wild it is handed back to
  private greenNear(x: number, z: number): number {
    const tally = new Map<number, number>();
    for (let dx = -6; dx <= 6; dx += 3) {
      for (let dz = -6; dz <= 6; dz += 3) {
        const t = this.field.typeAt(x + dx, this.field.topAt(x + dx, z + dz) - 1, z + dz);
        if (isMeadow(t)) tally.set(t, (tally.get(t) ?? 0) + 1);
      }
    }
    let best = MEADOW;
    let n = 0;
    for (const [t, k] of tally) if (k > n) { best = t; n = k; }
    return best;
  }

  // WHERE THE GREAT WORK GOES, and the corridors that keep it visible.
  // called once, at founding: the highest workable ground in the precinct,
  // which is also the ground the precinct was chosen for.
  siteGreatWork(): { x: number; z: number; y: number; r: number } {
    // the fallback is the precinct's own centre at its REAL height. the
    // first version seeded y at -1 and every candidate failed the roughness
    // gate, so the great work was sited at y = -1 and the whole tower was
    // built from below the ground.
    let best = { x: this.precinct.x, z: this.precinct.z, y: this.field.topAt(this.precinct.x, this.precinct.z), rough: 1e9 };
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2;
      for (const r of [0, 5, 9, 13]) {
        const x = Math.round(this.precinct.x + Math.cos(ang) * r);
        const z = Math.round(this.precinct.z + Math.sin(ang) * r);
        if (x < 30 || x > GRID - 30 || z < 30 || z > GRID - 30) continue;
        const y = this.field.topAt(x, z);
        const under = this.field.typeAt(x, y - 1, z);
        if (isGeology(under)) continue;
        // it needs a flat enough shoulder to stand a 30 block footprint on
        let rough = 0;
        for (let dx = -12; dx <= 12; dx += 6) {
          for (let dz = -12; dz <= 12; dz += 6) rough += Math.abs(this.field.topAt(x + dx, z + dz) - y);
        }
        // roughness is a PREFERENCE, not a gate. at the raised terrain
        // amplitude a hard cut at 26 rejected every candidate in the
        // precinct, which is how the fallback came to be used at all. the
        // flattest high shoulder wins; if they are all rough, the best of
        // them still wins.
        const score = y - rough * 0.35;
        const bestScore = best.y - Math.min(best.rough, 60) * 0.35;
        if (score > bestScore) best = { x, z, y, rough };
      }
    }
    this.greatWorkAt = { x: best.x, z: best.z, y: best.y, r: 20 };

    // SIGHTLINES. a hero nobody can see is not a hero. three corridors are
    // reserved from the great work outward — to the plaza, to the quarter,
    // and back down its own approach — and nothing plants or sites inside
    // them. this is the cheapest possible version of the idea and it is the
    // one that matters: it stops the wood and the next twenty buildings
    // closing the only views that were ever going to be composed.
    this.sightlines.push(
      { ax: best.x, az: best.z, bx: this.plazaX, bz: this.plazaZ, w: 7 },
      { ax: best.x, az: best.z, bx: this.quarter.x, bz: this.quarter.z, w: 6 },
      { ax: best.x, az: best.z, bx: best.x, bz: best.z + 46, w: 8 }
    );
    return this.greatWorkAt;
  }

  // is this column inside a reserved corridor. the test is distance to the
  // segment rather than to its endpoints, or the corridor would only be
  // reserved at its two ends.
  inSightline(x: number, z: number): boolean {
    for (const l of this.sightlines) {
      const vx = l.bx - l.ax;
      const vz = l.bz - l.az;
      const len2 = vx * vx + vz * vz;
      if (len2 < 1) continue;
      let t = ((x - l.ax) * vx + (z - l.az) * vz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = l.ax + vx * t;
      const pz = l.az + vz * t;
      if (Math.hypot(x - px, z - pz) <= l.w) return true;
    }
    return false;
  }

  // which slot the next work takes. the great work is claimed by the plan
  // itself at founding; notable slots are handed out to the first few sites
  // that are far enough apart to read as separate landmarks.
  //
  // THIS IS A QUERY, NOT A CLAIM. a site is proposed several times before
  // anything is built on it — the review harness snapshots one, a cycle
  // picks one and the endpoint refuses the design, the mason's yard is full
  // and the cycle returns — and a decrement on every proposal spends all
  // four notable slots on works that were never drawn. the count comes down
  // in record(), where a building actually exists.
  proposeSlot(x: number, z: number): Slot {
    if (this.notableLeft <= 0) return "ordinary";
    // and they have to be far enough apart to read as separate landmarks
    // rather than as one big lump with three heads
    for (const p of this.parcels) {
      if (p.slot !== "notable") continue;
      if (Math.hypot(p.x + p.w / 2 - x, p.z + p.d / 2 - z) < 34) return "ordinary";
    }
    return "notable";
  }
  get notableRemaining(): number {
    return this.notableLeft;
  }

  // ---- reading the plan ----------------------------------------------------

  // THE PLAZA IS COMMON GROUND. the three territories are angular wedges
  // radiating from the world's centre, and the world's centre is the
  // founding stone — so every patch near the plaza straddles two or three
  // of them, fails the "wholly inside one territory" test, and cannot be
  // sited on by anybody. that is why the density gradient came back with a
  // hole in the middle: not because the plan preferred the edge, but
  // because the centre was the one place the territory law forbade.
  //
  // a civic core cut into three pie slices is not a civic core. inside this
  // radius the wedges do not apply and any agent may build.
  static readonly COMMON_R = 24;
  isCommonGround(x: number, z: number): boolean {
    return Math.hypot(x - this.plazaX, z - this.plazaZ) <= UrbanPlan.COMMON_R;
  }

  // the routes, for anything that wants to line them — the avenue planting
  // reads them so a road is a made thing rather than a strip of paving
  routeList() {
    return this.routes;
  }

  // THE PLAN'S DISTRICTS OUTRANK THE AGENTS' WEDGES. the precinct sits
  // wherever the highest workable ground happened to be, which lands it
  // inside one agent's third — so only that agent could ever build there,
  // and on a rotation the other two simply found nothing and their cycles
  // were skipped. twelve consecutive site picks produced plaza and quarter
  // and never once the precinct.
  //
  // the wedges divide the WILD, which is what they were for. a district is
  // the settlement's own ground and any of the crew may build in it.
  isDistrictGround(x: number, z: number): boolean {
    return (
      Math.hypot(x - this.precinct.x, z - this.precinct.z) <= this.precinct.r ||
      Math.hypot(x - this.quarter.x, z - this.quarter.z) <= this.quarter.r
    );
  }

  isBuiltGround(x: number, z: number): boolean {
    return this.network.has(key(x, z));
  }

  // does this footprint TOUCH the settlement? a work that does not is an
  // object in a field, which is the thing the plan exists to prevent.
  touchesFabric(x0: number, z0: number, w: number, d: number): boolean {
    for (let x = -2; x <= w + 1; x++) {
      for (let z = -2; z <= d + 1; z++) {
        if (this.network.has(key(x0 + x, z0 + z))) return true;
      }
    }
    return false;
  }

  // how much is already built within r of a point: the density gradient the
  // architect infills against
  densityAt(x: number, z: number, r = 24): number {
    let n = 0;
    for (const p of this.parcels) {
      const dx = p.x + p.w / 2 - x;
      const dz = p.z + p.d / 2 - z;
      if (Math.hypot(dx, dz) <= r) n++;
    }
    return n;
  }

  quarterOf(x: number, z: number): Quarter {
    const dPre = Math.hypot(x - this.precinct.x, z - this.precinct.z);
    const dQtr = Math.hypot(x - this.quarter.x, z - this.quarter.z);
    const dPlz = Math.hypot(x - this.plazaX, z - this.plazaZ);
    if (dPlz < 12) return "plaza";
    return dPre <= dQtr ? "precinct" : "quarter";
  }

  // WHAT THE SETTLEMENT IS ALREADY CALLED. three works came back "the
  // lantern row" and three more "the terraced light hall" in a single run,
  // because nothing in the payload ever told the architect what it had
  // already named — and a model given the same brief on a similar site
  // reaches for the same words, which is not a fault, it is the absence of
  // a fact.
  titles(limit = 24): string[] {
    return this.parcels.slice(-limit).map((p) => p.title).filter(Boolean);
  }

  record(p: Parcel) {
    this.parcels.push(p);
    // a notable slot is spent when a notable building EXISTS, which is here
    if (p.slot === "notable" && this.notableLeft > 0) this.notableLeft--;
  }

  // THE STREET, IN THE PATCH'S OWN COORDINATES. "there is a street nearby"
  // is not actionable; "your frontage is the line z=7, build along it facing
  // -z" is. every work on the long street gets the same line, which is the
  // whole difference between a row and four detached shops.
  private frontageLines(site: PlannedSite, patch: number): string[] {
    // THE QUARTER ONLY. the streets are the town's, and the frontage brief
    // is written in the town's vocabulary — a precinct hall told to put its
    // shopfronts on a line is being handed the wrong register's instruction
    // by the layer whose whole job is keeping them apart.
    if (site.quarter !== "quarter") return [];
    const f = this.frontageFor(site.anchorX, site.anchorZ, patch, patch);
    if (!f) return [];
    const st = f.street;
    const local = st.axis === "x" ? f.line - site.anchorZ : f.line - site.anchorX;
    if (local < 0 || local >= patch) return [];
    const facing = st.axis === "x" ? (f.side > 0 ? "-z" : "+z") : f.side > 0 ? "-x" : "+x";
    return [
      ``,
      `THE STREET: your site fronts ${st.name}, which runs along ${st.axis} and is ${st.width} wide.`,
      st.axis === "x"
        ? `- YOUR FRONTAGE IS THE LINE z = ${local} in your patch. put the shopfronts, awnings and signage on it, facing ${facing}. what is behind them is back-of-house.`
        : `- YOUR FRONTAGE IS THE LINE x = ${local} in your patch. put the shopfronts, awnings and signage on it, facing ${facing}. what is behind them is back-of-house.`,
      `- build the frontage CONTINUOUS along that line: party walls between buildings, no gaps. the neighbours are doing the same, so the row reads as one street.`,
    ];
  }

  // ---- what the architect is told ------------------------------------------

  // the plan in words. the architect gets this every cycle alongside its
  // site, so it is siting INTO a settlement it can see rather than onto a
  // patch of grass it cannot place.
  brief(site: PlannedSite, patch = 30): string {
    const rel = (x: number, z: number) => {
      const dx = x - this.plazaX;
      const dz = z - this.plazaZ;
      const dist = Math.round(Math.hypot(dx, dz));
      const dir =
        Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "east" : "west") : dz > 0 ? "south" : "north";
      return `${dist} blocks ${dir} of the founding stone`;
    };
    const near = this.parcels
      .filter((p) => Math.hypot(p.x + p.w / 2 - site.anchorX, p.z + p.d / 2 - site.anchorZ) < 30)
      .slice(-6)
      .map((p) => `  - "${p.title}" (${p.quarter}), ${rel(p.x + p.w / 2, p.z + p.d / 2)}`);
    return [
      `THE SETTLEMENT SO FAR (${this.parcels.length} works standing):`,
      `- the founding plaza is the centre; everything is measured from it.`,
      `- the temple precinct sits on the heights, ${rel(this.precinct.x, this.precinct.z)}.`,
      `- the town quarter sits on the flats, ${rel(this.quarter.x, this.quarter.z)}.`,
      ...this.routes.map((r) => `- ${r.name}.`),
      ``,
      `YOUR SITE is in the ${site.quarter}, ${rel(site.anchorX, site.anchorZ)}.`,
      `it was chosen because: ${site.reason}.`,
      near.length ? `what already stands within thirty blocks:` : `nothing stands within thirty blocks yet; this work sets the line others will follow.`,
      ...near,
      ``,
      `THE SITING LAW:`,
      `- the ground under your site is ALREADY BUILT: it has been cut level and paved for you, and its rim is walled. do not lay another slab over the whole footprint; build ON it.`,
      `- your work must REACH THE EXISTING FABRIC. there is made ground at local (${site.joinX}, ${site.joinZ}) in your patch — run your approach, stair or path to it. a design that touches nothing is an object in a field.`,
      `- face what is already there. a building that turns its back on the street it stands beside is worse than one badly proportioned.`,
      ...this.frontageLines(site, patch),
    ].join("\n");
  }
}
