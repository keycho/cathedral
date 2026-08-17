// kodo - the price ribbon: the market's chart rendered as terrain. a
// line of glowing blocks snakes the world's spine, one column per closed
// tick, ascents in spirit green and descents in ember. the newest tick
// anchors at the east end and the line grows westward as history accrues,
// so a young world carries a short bright thread and an old one a full
// canyon-crossing road. slope is limited to one block per column, which
// bends the chart's spikes into something a visitor can physically walk.
//
// ribbon blocks belong to the ribbon alone: they are never registered in
// strata, so erosion, subsidence and burns pass them by, and the whole
// line is torn down and relaid from history at every tick close.

import { GRID, MAXY } from "./config";
import { FALL, RISE } from "./palette";
import type { TickEngine } from "./ticks";
import type { VoxelField } from "./voxels";

const N = 200; // most recent ticks shown
const X_EAST = 228; // cell where the newest tick stands
const X_WEST = X_EAST - (N - 1);
const Y_LO = 9; // chart band floor
const Y_SPAN = 16; // band height
const CX = GRID / 2;
const CZ = GRID / 2;

export interface RibbonInfo {
  n: number; // tick number
  close: number;
  rise: boolean;
}

// the spine: a wander in z as a pure function of x, held clear of the
// founding plaza
function zSpine(x: number): number {
  let z = CZ + 8 + Math.sin(x * 0.055) * 22 + Math.sin(x * 0.021 + 1.7) * 9;
  const dx = x - CX;
  if (Math.abs(dx) < 18) {
    // ease around the plaza's north side rather than through the stone
    const push = (18 - Math.abs(dx)) / 18;
    if (z < CZ + 9) z = CZ + 9 + push * 4;
  }
  return Math.round(Math.max(4, Math.min(GRID - 5, z)));
}

export class Ribbon {
  private cells = new Set<number>();
  private info = new Map<number, RibbonInfo>();

  constructor(private field: VoxelField, private ticks: TickEngine) {}

  private idx(x: number, y: number, z: number): number {
    return (x * GRID + z) * MAXY + y;
  }
  private unpack(i: number): [number, number, number] {
    const y = i % MAXY;
    const xz = (i - y) / MAXY;
    const z = xz % GRID;
    const x = (xz - z) / GRID;
    return [x, y, z];
  }

  isRibbon(x: number, y: number, z: number): boolean {
    return this.cells.has(this.idx(x, y, z));
  }
  infoAt(x: number, y: number, z: number): RibbonInfo | undefined {
    return this.info.get(this.idx(x, y, z));
  }
  get length(): number {
    return this.cells.size;
  }

  // tear the line down and relay it from tick history
  rebuild() {
    for (const i of this.cells) {
      const [x, y, z] = this.unpack(i);
      const t = this.field.typeAt(x, y, z);
      if (t === RISE || t === FALL) this.field.breakAt(x, y, z);
    }
    this.cells.clear();
    this.info.clear();

    const h = this.ticks.history;
    if (h.length < 2) return;
    const M = Math.min(N, h.length);
    const tail = h.slice(-M);
    if (tail.some((s) => !(s.close > 0))) return; // no price source wired

    // normalize the window into the chart band, padded so the line never
    // pins flat against its floor or ceiling
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of tail) {
      lo = Math.min(lo, s.close);
      hi = Math.max(hi, s.close);
    }
    const pad = Math.max((hi - lo) * 0.08, hi * 0.002);
    lo -= pad;
    hi += pad;
    const span = Math.max(1e-12, hi - lo);

    let prevY = -1;
    for (let i = 0; i < M; i++) {
      const s = tail[i];
      const x = X_WEST + (N - M) + i;
      const z = zSpine(x);
      const want = Y_LO + Math.round(((s.close - lo) / span) * Y_SPAN);
      // walkable: one block of rise or fall per column, so spikes become
      // climbs instead of cliffs
      let y = prevY < 0 ? want : Math.max(prevY - 1, Math.min(prevY + 1, want));
      // never bury the line in ground or grown mass; it rides over. the
      // walk chain follows the actual laid height so steps stay climbable.
      while (y < MAXY - 2 && this.field.isSolid(x, y, z)) y++;
      prevY = y;
      if (y >= MAXY - 2) continue;
      const rise = i === 0 ? true : s.close >= tail[i - 1].close;
      if (this.field.placeAt(x, y, z, rise ? RISE : FALL)) {
        const id = this.idx(x, y, z);
        this.cells.add(id);
        this.info.set(id, { n: s.n, close: s.close, rise });
      }
    }
  }
}
