// cathedral - the urban plan. the layer that makes a settlement out of
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
import { CONCRETEMID, EARTH, STONE, STONEDARK, isGeology } from "./palette";
import type { VoxelField } from "./voxels";

export type Quarter = "plaza" | "precinct" | "quarter";

export interface Parcel {
  x: number; // footprint corner, cells
  z: number;
  w: number;
  d: number;
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
    laid += this.pave(this.plazaX - 6, this.plazaZ - 6, 13, 13, STONE);
    for (const r of this.routes) laid += this.road(r.ax, r.az, r.bx, r.bz);
    // the precinct's own wall line and the quarter's kerb are laid as the
    // districts are built into, not up front: an empty walled field reads
    // worse than open meadow.
    return laid;
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

  // ---- reading the plan ----------------------------------------------------

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

  record(p: Parcel) {
    this.parcels.push(p);
  }

  // ---- what the architect is told ------------------------------------------

  // the plan in words. the architect gets this every cycle alongside its
  // site, so it is siting INTO a settlement it can see rather than onto a
  // patch of grass it cannot place.
  brief(site: PlannedSite): string {
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
    ].join("\n");
  }
}
