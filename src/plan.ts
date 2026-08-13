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
import { CONCRETEMID, CONCRETEPALE, EARTH, MEADOW, SCARMOSS, STONE, STONEDARK, isGeology, isGround, isMeadow } from "./palette";
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
