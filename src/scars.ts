// kodo - erosion scars. when stone is torn away, the freshly exposed
// faces glow ember and cool back to their resting strata tint over ~2h
// (the constitution's scarCoolMs). the scar registry owns those cells'
// colours while they cool; strata's epoch re-tints defer to it and the
// resting colour is re-asked at every pass, so a scar cools into whatever
// age tint its stratum has reached by then. collapse (r2, phase 1d) will
// feed this the same way the dev probe does now.

import { GRID, MAXY } from "./config";
import { blockColor } from "./palette";
import { RULES } from "./rules";
import type { Strata } from "./strata";
import type { VoxelField } from "./voxels";

const EMBER = { r: 0xff, g: 0x7a, b: 0x30 }; // fresh scar heat
const PASS_MS = 1500; // cooling walk cadence

const DIRS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export class Scars {
  private scars = new Map<number, number>(); // cell idx -> born (ms)
  private lastPass = 0;

  constructor(private field: VoxelField, private strata: Strata) {
    // epoch re-tints must not repaint a cooling scar
    strata.isOverridden = (idx) => this.scars.has(idx);
  }

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

  get count(): number {
    return this.scars.size;
  }

  // the colour a cell returns to once cool
  private restingOf(i: number, x: number, y: number, z: number): number {
    if (this.strata.provAt(x, y, z)) return this.strata.restingColor(i);
    return blockColor(this.field.typeAt(x, y, z));
  }

  // mark one exposed cell as freshly torn
  register(x: number, y: number, z: number, now: number) {
    if (!this.field.isSolid(x, y, z)) return;
    const i = this.idx(x, y, z);
    if (this.strata.locked.has(i)) return; // linings keep their own colour
    this.scars.set(i, now);
    this.applyHeat(i, x, y, z, 1);
  }

  // mark every solid face newly exposed by a removal at (x, y, z)
  registerAround(x: number, y: number, z: number, now: number) {
    for (const [dx, dy, dz] of DIRS) {
      if (this.field.isSolid(x + dx, y + dy, z + dz)) {
        this.register(x + dx, y + dy, z + dz, now);
      }
    }
  }

  private applyHeat(i: number, x: number, y: number, z: number, f: number) {
    const rest = this.restingOf(i, x, y, z);
    const rr = (rest >> 16) & 0xff;
    const rg = (rest >> 8) & 0xff;
    const rb = rest & 0xff;
    const k = 0.85 * f;
    const hex =
      ((rr + (EMBER.r - rr) * k) << 16) |
      ((rg + (EMBER.g - rg) * k) << 8) |
      (rb + (EMBER.b - rb) * k);
    this.field.tintAt(x, y, z, hex);
  }

  update(now: number) {
    if (now - this.lastPass < PASS_MS || !this.scars.size) return;
    this.lastPass = now;
    for (const [i, born] of this.scars) {
      const [x, y, z] = this.unpack(i);
      if (!this.field.isSolid(x, y, z) || this.strata.locked.has(i)) {
        this.scars.delete(i); // torn away too, or became hollow lining
        continue;
      }
      const age = now - born;
      if (age >= RULES.scarCoolMs) {
        this.field.tintAt(x, y, z, this.restingOf(i, x, y, z));
        this.scars.delete(i);
        continue;
      }
      // eased cooldown: bright early, a long dull tail
      const f = Math.pow(1 - age / RULES.scarCoolMs, 1.6);
      this.applyHeat(i, x, y, z, f);
    }
  }
}
