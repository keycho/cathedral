// cathedral - THE THRESHOLDS. a world where everything is placed by rule is
// plausible everywhere and deliberate nowhere: each building is correct, each
// road goes where a road should go, and the whole thing reads as generated
// because nothing in it was ever CHOSEN. the fix is not more detail. it is
// composition — a small number of things put in specific places for reasons
// that are about the picture rather than about the simulation.
//
// this file is four of them:
//
//   THE MOTIF      a vermilion gate at every threshold in the world. one
//                  torii is an ornament; eighteen of them, at every point
//                  where you pass from one kind of ground to another, is a
//                  signature — the thing you would draw if someone asked you
//                  to draw this place from memory.
//
//   THE AVENUE     the pilgrim way stops aiming at the middle of the
//                  precinct and aims at the great work, so the road has a
//                  TERMINATED VIEW: walk it and the pagoda is at the end of
//                  it, growing, the whole way.
//
//   THE STAIR      the steepest pitch on a route stops being a ramp of
//                  stepped paving and becomes a flight, with balustrades and
//                  a lantern at each end. a stair says "you are arriving"
//                  in a way that a slope never does.
//
//   THE CROSSING   the deepest gap on a route gets a bridge: a deck held on
//                  piers, railings either side, and the ground allowed to
//                  stay low underneath it instead of being filled in.
//
// the gates are cheap and they are the whole point; the other three exist
// so that walking a road is a sequence of events rather than a distance.

import { GRID } from "./config";
import {
  LANTERN,
  STONE,
  STONEDARK,
  TIMBERDARK,
  VERMILION,
  isGeology,
} from "./palette";
import type { UrbanPlan } from "./plan";
import type { VoxelField } from "./voxels";

export interface Threshold {
  x: number;
  z: number;
  // the axis the two posts are separated along. a gate on a path running
  // north–south has its posts apart in x, and this is the single thing that
  // was easiest to get backwards, so it is named for what it IS rather than
  // for the direction of the road.
  span: "x" | "z";
  w: number; // clear width between the posts
  h: number; // post height above the paving
  kind: string; // for the record and the journal
}

export interface MotifReport {
  gates: number;
  blocks: number;
  stairs: number;
  bridges: number;
  skipped: number;
}

// ---- the gate itself --------------------------------------------------------

// A GATE STANDS ON THE GROUND IT FINDS. a torii composed as a single part
// has one base y, which on a hillside road buries one post and floats the
// other. this builds post by post from each column's own surface up to a
// SHARED lintel height, which is what a real one does — the beam is level
// and the legs are whatever length the ground makes them.
function raiseGate(field: VoxelField, plan: UrbanPlan, t: Threshold): number {
  const half = Math.floor(t.w / 2) + 1;
  const ax = t.span === "x" ? t.x - half : t.x;
  const az = t.span === "z" ? t.z - half : t.z;
  const bx = t.span === "x" ? t.x + half : t.x;
  const bz = t.span === "z" ? t.z + half : t.z;
  for (const [px, pz] of [[ax, az], [bx, bz]] as const) {
    if (px < 6 || px >= GRID - 6 || pz < 6 || pz >= GRID - 6) return 0;
    const g = field.topAt(px, pz);
    if (isGeology(field.typeAt(px, g - 1, pz))) return 0;
  }

  // the ground under a gate is made ground: a gate standing in grass is a
  // prop, and the paving is also what stops the wood growing back into it
  plan.flora?.clearAt(Math.min(ax, bx) - 1, Math.min(az, bz) - 1, Math.abs(bx - ax) + 3, Math.abs(bz - az) + 3);
  plan.pave(Math.min(ax, bx) - 1, Math.min(az, bz) - 1, Math.abs(bx - ax) + 3, Math.abs(bz - az) + 3, STONEDARK);

  const ga = field.topAt(ax, az);
  const gb = field.topAt(bx, bz);
  const beam = Math.max(ga, gb) + t.h;
  let laid = 0;
  const put = (x: number, y: number, z: number, m: number) => {
    if (x < 2 || x >= GRID - 2 || z < 2 || z >= GRID - 2) return;
    if (field.placeAt(x, y, z, m)) laid++;
  };

  // the legs, each from its own ground
  for (let y = ga; y < beam; y++) put(ax, y, az, VERMILION);
  for (let y = gb; y < beam; y++) put(bx, y, bz, VERMILION);

  // the tie beam, the lintel above it, and the overhang that makes the
  // silhouette read as a gate rather than as a doorframe. the lintel runs
  // two blocks wider at each end and the whole thing is two courses deep.
  const dx = t.span === "x" ? 1 : 0;
  const dz = t.span === "z" ? 1 : 0;
  const from = t.span === "x" ? ax : az;
  const to = t.span === "x" ? bx : bz;
  for (let i = from; i <= to; i++) {
    const x = t.span === "x" ? i : t.x;
    const z = t.span === "z" ? i : t.z;
    put(x, beam, z, VERMILION);
  }
  for (let i = from - 2; i <= to + 2; i++) {
    const x = t.span === "x" ? i : t.x;
    const z = t.span === "z" ? i : t.z;
    put(x, beam + 2, z, VERMILION);
    // the lintel's underside is dark, which is what gives the red its edge
    if (i >= from - 1 && i <= to + 1) put(x, beam + 1, z, TIMBERDARK);
  }
  // and the two ends turn UP, the one detail that makes the form
  put(t.span === "x" ? from - 2 : t.x + dz * 0, beam + 3, t.span === "z" ? from - 2 : t.z, VERMILION);
  put(t.span === "x" ? to + 2 : t.x, beam + 3, t.span === "z" ? to + 2 : t.z, VERMILION);
  void dx;

  return laid;
}

// ---- where the thresholds are ------------------------------------------------

// EVERY POINT WHERE THE GROUND CHANGES ITS MIND. the plaza's four ways in,
// the length of each route at a walking interval, the head of each street,
// and the mouth of each reserved sightline — which is the one place in the
// world guaranteed to be looking straight at the great work.
export function thresholdsOf(plan: UrbanPlan, field: VoxelField, already: Threshold[] = []): Threshold[] {
  const out: Threshold[] = [];
  const push = (x: number, z: number, span: "x" | "z", w: number, h: number, kind: string) => {
    if (x < 10 || x >= GRID - 10 || z < 10 || z >= GRID - 10) return;
    // never two gates on top of each other: a threshold is a place you pass
    // through once. the test runs against what is ALREADY STANDING as well
    // as against this batch, because the motif is raised again every epoch
    // as the plan grows and would otherwise rebuild the whole set each time.
    for (const o of out) if (Math.hypot(o.x - x, o.z - z) < 7) return;
    for (const o of already) if (Math.hypot(o.x - x, o.z - z) < 7) return;
    out.push({ x: Math.round(x), z: Math.round(z), span, w, h, kind });
  };

  // the plaza's four ways in, the largest gates in the settlement after the
  // great work's own
  const R = 9;
  push(plan.plazaX, plan.plazaZ - R, "x", 6, 7, "plaza gate, north");
  push(plan.plazaX, plan.plazaZ + R, "x", 6, 7, "plaza gate, south");
  push(plan.plazaX - R, plan.plazaZ, "z", 6, 7, "plaza gate, west");
  push(plan.plazaX + R, plan.plazaZ, "z", 6, 7, "plaza gate, east");

  // the routes, at a walking interval. STRIDE IS THE WHOLE DESIGN HERE: too
  // far apart and they are landmarks rather than a rhythm, too close and it
  // is a tunnel. the first pass used eighteen and produced two gates on the
  // pilgrim way and none at all on the market road, because this settlement
  // is fifty blocks across and a stride tuned for a city puts nothing in it.
  // twelve, measured against the routes this world actually has.
  for (const r of plan.routeList()) {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
    const runsX = Math.abs(r.bx - r.ax) >= Math.abs(r.bz - r.az);
    for (let d = 12; d < len - 8; d += 12) {
      const t = d / len;
      push(r.ax + (r.bx - r.ax) * t, r.az + (r.bz - r.az) * t, runsX ? "z" : "x", 4, 5, `way gate, ${r.name}`);
    }
  }

  // THE TWO DISTRICTS ARE PLACES YOU ENTER. the precinct and the quarter
  // have a centre and a radius and nothing marking where one begins — you
  // cross into the temple district by walking, with no moment. four gates on
  // each perimeter turn a radius into a boundary you pass through.
  for (const [d, kind] of [[plan.precinct, "precinct"], [plan.quarter, "quarter"]] as const) {
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      push(d.x + dx * d.r, d.z + dz * d.r, dz !== 0 ? "x" : "z", 5, 6, `${kind} gate`);
    }
  }

  // AND THE NOTABLE WORKS. one great work, four notable, and each of the
  // four gets a gate on the side facing the plaza — so the hierarchy is
  // announced on the ground as well as in the skyline.
  for (const p of plan.parcels) {
    if (p.slot !== "notable") continue;
    const cx = p.x + p.w / 2;
    const cz = p.z + p.d / 2;
    const vx = plan.plazaX - cx;
    const vz = plan.plazaZ - cz;
    const len = Math.hypot(vx, vz) || 1;
    const reach = Math.max(p.w, p.d) / 2 + 4;
    push(cx + (vx / len) * reach, cz + (vz / len) * reach,
      Math.abs(vx) >= Math.abs(vz) ? "z" : "x", 5, 6, `the gate of ${p.title}`);
  }

  // the head and foot of each street in the quarter: a street with a gate at
  // each end is a street, and one without is a strip of paving
  for (const st of plan.streets) {
    const span: "x" | "z" = st.axis === "x" ? "z" : "x";
    push(st.ax, st.az, span, 5, 5, `street gate, ${st.name}`);
    push(st.bx, st.bz, span, 5, 5, `street gate, ${st.name}`);
  }

  // THE SIGHTLINE MOUTHS. these are the best gates in the world and they
  // cost nothing: a reserved corridor already points at the great work, so a
  // gate two thirds of the way down it frames the pagoda for anyone standing
  // at the far end, which is the definition of a framing device.
  for (const l of plan.sightlines) {
    const vx = l.bx - l.ax;
    const vz = l.bz - l.az;
    const len = Math.hypot(vx, vz);
    if (len < 24) continue;
    const t = 0.66;
    const runsX = Math.abs(vx) >= Math.abs(vz);
    push(l.ax + vx * t, l.az + vz * t, runsX ? "z" : "x", 6, 8, "the view gate");
  }
  void field;
  return out;
}

// ---- the stair and the crossing ----------------------------------------------

// walk a route and hand back its ground profile, which is what both of the
// remaining devices are found in
function profile(field: VoxelField, ax: number, az: number, bx: number, bz: number) {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
  const pts: { x: number; z: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / Math.max(1, steps);
    const x = Math.round(ax + (bx - ax) * t);
    const z = Math.round(az + (bz - az) * t);
    pts.push({ x, z, y: field.topAt(x, z) });
  }
  return pts;
}

// THE STAIR GOES WHERE THE HILL IS, not where a constant says. the steepest
// window on the route is measured and the flight is cut into it — so on a
// flat world nothing is built and on a steep one the stair lands on the
// pitch that was already making people climb.
function raiseStair(field: VoxelField, plan: UrbanPlan, pts: { x: number; z: number; y: number }[]): number {
  const WIN = 9;
  let best = { i: -1, rise: 0 };
  for (let i = 0; i + WIN < pts.length; i++) {
    const rise = pts[i + WIN].y - pts[i].y;
    if (rise > best.rise) best = { i, rise };
  }
  if (best.i < 0 || best.rise < 5) return 0;

  const a = pts[best.i];
  const b = pts[best.i + WIN];
  const runsX = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
  let laid = 0;
  const put = (x: number, y: number, z: number, m: number) => {
    if (x < 3 || x >= GRID - 3 || z < 3 || z >= GRID - 3) return;
    if (field.placeAt(x, y, z, m)) laid++;
  };

  // the treads: five wide, cut so each one is level across its width, which
  // is the difference between a flight and a ramp with a texture
  for (let s = 0; s <= WIN; s++) {
    const t = s / WIN;
    const cx = Math.round(a.x + (b.x - a.x) * t);
    const cz = Math.round(a.z + (b.z - a.z) * t);
    const y = Math.round(a.y + best.rise * t);
    for (let o = -2; o <= 2; o++) {
      const x = runsX ? cx : cx + o;
      const z = runsX ? cz + o : cz;
      plan.flora?.clearAt(x, z, 1, 1);
      // cut down to the tread and fill up to it: a stair is made ground
      for (let yy = field.topAt(x, z) - 1; yy >= y; yy--) field.breakAt(x, yy, z);
      for (let yy = field.topAt(x, z); yy < y; yy++) put(x, yy, z, STONEDARK);
      put(x, y - 1, z, STONE);
    }
    // the balustrades, one course proud of the tread
    for (const o of [-3, 3]) {
      const x = runsX ? cx : cx + o;
      const z = runsX ? cz + o : cz;
      put(x, y, z, STONE);
      if (s === 0 || s === WIN) {
        put(x, y + 1, z, STONE);
        put(x, y + 2, z, LANTERN); // a lantern at the top and the bottom
      }
    }
  }
  return laid;
}

// THE CROSSING. the deepest gap the route passes over — a basin, a stream
// cut, a saddle between two shoulders — gets a deck rather than a filled
// embankment. the plan's paving would otherwise level the whole thing to its
// own median, which is how a valley quietly becomes a causeway.
function raiseBridge(field: VoxelField, plan: UrbanPlan, pts: { x: number; z: number; y: number }[]): number {
  // the gap is measured against the LINE between its ends, not against sea
  // level: a dip on a hillside is still a dip.
  let best = { i: -1, j: -1, depth: 0 };
  for (let i = 0; i < pts.length - 5; i++) {
    for (let j = i + 5; j < Math.min(pts.length, i + 26); j++) {
      let depth = 0;
      let ok = true;
      for (let k = i + 1; k < j; k++) {
        const t = (k - i) / (j - i);
        const line = pts[i].y + (pts[j].y - pts[i].y) * t;
        const d = line - pts[k].y;
        if (d < 2) { ok = false; break; } // the whole span has to be a gap
        depth = Math.max(depth, d);
      }
      if (ok && depth > best.depth) best = { i, j, depth };
    }
  }
  if (best.i < 0 || best.depth < 3) return 0;

  const a = pts[best.i];
  const b = pts[best.j];
  const runsX = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
  const n = best.j - best.i;
  let laid = 0;
  const put = (x: number, y: number, z: number, m: number) => {
    if (x < 3 || x >= GRID - 3 || z < 3 || z >= GRID - 3) return;
    if (field.placeAt(x, y, z, m)) laid++;
  };

  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const p = pts[best.i + s];
    // A BRIDGE HAS A CAMBER. a flat deck between two banks reads as a plank;
    // a rise of a couple of blocks in the middle reads as a bridge, and it
    // is the shape every one of these is built with.
    const y = Math.round(a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * 2.2);
    for (let o = -2; o <= 2; o++) {
      const x = runsX ? p.x : p.x + o;
      const z = runsX ? p.z + o : p.z;
      plan.flora?.clearAt(x, z, 1, 1);
      put(x, y - 1, z, TIMBERDARK);
    }
    // railings, and the red again: this is the same motif as the gates and
    // it is meant to be recognised as such
    for (const o of [-3, 3]) {
      const x = runsX ? p.x : p.x + o;
      const z = runsX ? p.z + o : p.z;
      put(x, y - 1, z, TIMBERDARK);
      if (s % 2 === 0) put(x, y, z, VERMILION);
    }
    // piers, at intervals, down to whatever is under the span
    if (s % 4 === 0 && s > 0 && s < n) {
      for (const o of [-2, 2]) {
        const x = runsX ? p.x : p.x + o;
        const z = runsX ? p.z + o : p.z;
        for (let yy = field.topAt(x, z); yy < y - 1; yy++) put(x, yy, z, STONEDARK);
      }
    }
  }
  return laid;
}

// ---- the pass ----------------------------------------------------------------

// THE MOTIF IS NOT A ONE-SHOT. raising it once at founding put seven gates
// in the world, because at founding the quarter has no streets yet — they
// are laid lazily the first time anything is built there — and there are no
// notable works to announce. a motif that only exists on the ground that
// existed at boot is not the world's signature, it is the plaza's.
//
// so it keeps a record of what it has already raised and is run again each
// epoch. new thresholds appear as the plan grows; nothing is built twice.
export class Motif {
  private built: Threshold[] = [];
  private devicesDone = false;
  readonly report: MotifReport = { gates: 0, blocks: 0, stairs: 0, bridges: 0, skipped: 0 };

  raise(field: VoxelField, plan: UrbanPlan): number {
    let laidTotal = 0;

    // the framing devices go in FIRST and ONCE: both of them move the
    // ground, and a gate placed before them would end up buried in a stair
    // or standing in the air over a bridge deck. they are found from the
    // terrain, which does not change, so there is nothing to re-run.
    if (!this.devicesDone) {
      this.devicesDone = true;
      for (const r of plan.routeList()) {
        const pts = profile(field, r.ax, r.az, r.bx, r.bz);
        const bridge = raiseBridge(field, plan, pts);
        if (bridge > 0) { this.report.bridges++; this.report.blocks += bridge; laidTotal += bridge; }
        const stair = raiseStair(field, plan, pts);
        if (stair > 0) { this.report.stairs++; this.report.blocks += stair; laidTotal += stair; }
      }
    }

    for (const t of thresholdsOf(plan, field, this.built)) {
      const laid = raiseGate(field, plan, t);
      if (laid > 0) {
        this.report.gates++;
        this.report.blocks += laid;
        laidTotal += laid;
        this.built.push(t);
      } else {
        this.report.skipped++;
        // a threshold that could not be built is still CLAIMED, or every
        // epoch retries the same unbuildable spot for the life of the world
        this.built.push(t);
      }
    }
    return laidTotal;
  }

  get gates(): readonly Threshold[] {
    return this.built;
  }
}
