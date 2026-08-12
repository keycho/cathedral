// cathedral - strata: provenance and epoch tinting. every structure block
// permanently records the wallet, tx and epoch that made it (r1); strata
// are tinted by the epoch they were born in, sage while young, cream as
// they settle, orange in the oldest layers (older is deeper, because older
// is buried). tints are applied through the field's per-instance colours
// and re-walked in small batches whenever the epoch advances.
//
// the epoch is advanced from outside by the tick engine (20 ticks per
// epoch); strata only counts and tints.

import { GRID, MAXY } from "./config";
import type { VoxelField } from "./voxels";

// tint ramp: epochs of age at which a block is fully cream / fully orange
const YOUNG_SPAN = 8; // sage -> cream across the first 8 epochs
const OLD_SPAN = 24; // cream -> orange across the next 24
// lifted a step above the style tokens so lit faces read their tint at
// orbit distance under the dusk sun (the tokens are the identity; these
// are the stage make-up)
const SAGE = { r: 0x9d, g: 0xbd, b: 0x76 };
const CREAM = { r: 0xfa, g: 0xf3, b: 0xe2 };
const ORANGE = { r: 0xde, g: 0x66, b: 0x28 };

export interface Provenance {
  wallet: number; // index into the feed's wallet pool (-1 = the world itself)
  tx: string;
  epoch: number;
}

function hashCell(i: number): number {
  let h = i | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^= h >>> 16) >>> 0) / 4294967296;
}

function mix(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export class Strata {
  epoch = 0;
  // cells whose colour strata must not touch (founding stone, hollow
  // linings); their owners tint them
  readonly locked = new Set<number>();
  // a transient override (an uncooled scar): strata defers to it during
  // re-tints and the scar system restores the resting colour when done
  isOverridden?: (idx: number) => boolean;

  private prov = new Map<number, Provenance>();
  private cells: number[] = []; // registered cells, for random sampling
  private cellPos = new Map<number, number>(); // idx -> position in cells
  private byWallet = new Map<number, number>(); // wallet -> block count
  private retint: number[] = [];
  private retintAt = 0;

  constructor(private field: VoxelField) {}

  idx(x: number, y: number, z: number): number {
    return (x * GRID + z) * MAXY + y;
  }
  private unpack(i: number): [number, number, number] {
    const y = i % MAXY;
    const xz = (i - y) / MAXY;
    const z = xz % GRID;
    const x = (xz - z) / GRID;
    return [x, y, z];
  }

  // ---- provenance ----------------------------------------------------------

  register(x: number, y: number, z: number, wallet: number, tx: string) {
    const i = this.idx(x, y, z);
    this.prov.set(i, { wallet, tx, epoch: this.epoch });
    this.cellPos.set(i, this.cells.length);
    this.cells.push(i);
    if (wallet >= 0) this.byWallet.set(wallet, (this.byWallet.get(wallet) ?? 0) + 1);
    if (!this.locked.has(i)) this.field.tintAt(x, y, z, this.restingColor(i));
  }

  forget(x: number, y: number, z: number) {
    const i = this.idx(x, y, z);
    const p = this.prov.get(i);
    if (!p) return;
    this.prov.delete(i);
    const pos = this.cellPos.get(i);
    if (pos !== undefined) {
      const last = this.cells[this.cells.length - 1];
      this.cells[pos] = last;
      this.cellPos.set(last, pos);
      this.cells.pop();
      this.cellPos.delete(i);
    }
    if (p.wallet >= 0) {
      const n = (this.byWallet.get(p.wallet) ?? 1) - 1;
      if (n <= 0) this.byWallet.delete(p.wallet);
      else this.byWallet.set(p.wallet, n);
    }
    this.locked.delete(i);
  }

  provAt(x: number, y: number, z: number): Provenance | undefined {
    return this.prov.get(this.idx(x, y, z));
  }
  ownerOf(idx: number): number {
    return this.prov.get(idx)?.wallet ?? -2;
  }
  blocksOf(wallet: number): number {
    return this.byWallet.get(wallet) ?? 0;
  }
  get blockCount(): number {
    return this.prov.size;
  }
  get holderCount(): number {
    return this.byWallet.size;
  }
  // a uniformly random registered cell (burn placement samples these)
  sampleCell(rand: number): number | undefined {
    if (!this.cells.length) return undefined;
    return this.cells[Math.min(this.cells.length - 1, Math.floor(rand * this.cells.length))];
  }
  // the registered cells as-is (subsidence copies + sorts before walking)
  cellsSnapshot(): readonly number[] {
    return this.cells;
  }

  lock(x: number, y: number, z: number) {
    this.locked.add(this.idx(x, y, z));
  }

  // subsidence: a block slides one cell down carrying its provenance,
  // birth epoch and lock with it, and is re-tinted at its new home
  transfer(x: number, y: number, z: number, ny: number) {
    const from = this.idx(x, y, z);
    const to = this.idx(x, ny, z);
    const p = this.prov.get(from);
    if (!p) return;
    this.prov.delete(from);
    this.prov.set(to, p);
    const pos = this.cellPos.get(from);
    if (pos !== undefined) {
      this.cells[pos] = to;
      this.cellPos.delete(from);
      this.cellPos.set(to, pos);
    }
    if (this.locked.has(from)) {
      this.locked.delete(from);
      this.locked.add(to);
      return; // its owner repaints it
    }
    this.field.tintAt(x, ny, z, this.restingColor(to));
  }

  // ---- tints ---------------------------------------------------------------

  // the colour a block rests at for its age, with a stable per-cell jitter
  restingColor(idx: number): number {
    const p = this.prov.get(idx);
    const age = p ? this.epoch - p.epoch : 0;
    let c;
    if (age <= YOUNG_SPAN) c = mix(SAGE, CREAM, age / YOUNG_SPAN);
    else c = mix(CREAM, ORANGE, Math.min(1, (age - YOUNG_SPAN) / OLD_SPAN));
    const j = 0.92 + hashCell(idx) * 0.14;
    const r = Math.min(255, c.r * j);
    const g = Math.min(255, c.g * j);
    const b = Math.min(255, c.b * j);
    return (r << 16) | (g << 8) | b;
  }

  // ---- the epoch -----------------------------------------------------------

  // called by the tick engine every 20 ticks
  advanceEpoch() {
    this.epoch++;
    // re-walk every stratum toward its new age colour, in batches
    this.retint = [...this.prov.keys()];
    this.retintAt = 0;
  }

  update(_now: number) {
    // drain the re-tint queue gently (1500 cells/frame; 50k blocks ~ 0.5s)
    const n = Math.min(this.retint.length - this.retintAt, 1500);
    for (let k = 0; k < n; k++) {
      const i = this.retint[this.retintAt++];
      if (this.locked.has(i) || this.isOverridden?.(i)) continue;
      if (!this.prov.has(i)) continue;
      const [x, y, z] = this.unpack(i);
      this.field.tintAt(x, y, z, this.restingColor(i));
    }
    if (this.retintAt >= this.retint.length && this.retint.length) {
      this.retint = [];
      this.retintAt = 0;
    }
  }
}
