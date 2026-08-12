// cathedral - accretion: r1's frontier growth. new stone attaches to a
// weighted random exposed face of the existing mass, biased upward and
// toward the buying wallet's own formation, so the structure climbs like
// slow crystal and each wallet's blocks clot into a recognizable lobe.
// blocks queue and land a few per frame, so a surge of buying reads as a
// growth front, not a teleport.
//
// this module is the placement PRIMITIVE. in phase 1d the tick aggregator
// decides how many blocks to request per tick (floor(netFlow / usdPerBlock));
// until then the synthetic feed calls enqueue directly per buy event with
// the same constant.

import { GRID, MAXY } from "./config";
import { isGeology, MASS } from "./palette";
import { GROW } from "./rules";
import type { Strata } from "./strata";
import type { VoxelField } from "./voxels";

export { GROW };

const DIRS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function hash1(i: number): number {
  let h = i | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^= h >>> 16) >>> 0) / 4294967296;
}

interface Order {
  wallet: number;
  tx: string;
}

export class Growth {
  // cells no accretion may ever fill (burn hollows) or occupy right now
  // (the walker's body); assigned by main
  forbidden?: (x: number, y: number, z: number) => boolean;

  // the air frontier: empty cells adjacent to the structure, as a parallel
  // array + index map so removal is o(1) and weighted sampling is a scan
  private cand: number[] = [];
  private candPos = new Map<number, number>();
  private queue: Order[] = [];
  private salt = 1; // decorrelates the per-pick jitter stream

  constructor(private field: VoxelField, private strata: Strata) {}

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

  // accretion anchors to GEOLOGY only: the market grows its own stone and
  // never swallows the crew's architecture
  private isStruct(x: number, y: number, z: number): boolean {
    return isGeology(this.field.typeAt(x, y, z));
  }

  private isCandidate(x: number, y: number, z: number): boolean {
    if (x < GROW.margin || x >= GRID - GROW.margin) return false;
    if (z < GROW.margin || z >= GRID - GROW.margin) return false;
    if (y < 1 || y >= MAXY - 2) return false;
    if (this.field.isSolid(x, y, z)) return false;
    if (this.forbidden?.(x, y, z)) return false;
    for (const [dx, dy, dz] of DIRS) {
      if (this.isStruct(x + dx, y + dy, z + dz)) return true;
    }
    return false;
  }

  // re-evaluate candidacy of a cell and its neighbours after any world edit
  // (a placement, a break, a burn). keeps the frontier exact.
  refreshAround(x: number, y: number, z: number) {
    this.refreshCell(x, y, z);
    for (const [dx, dy, dz] of DIRS) this.refreshCell(x + dx, y + dy, z + dz);
  }
  private refreshCell(x: number, y: number, z: number) {
    const i = this.idx(x, y, z);
    const has = this.candPos.has(i);
    const should = this.isCandidate(x, y, z);
    if (should && !has) {
      this.candPos.set(i, this.cand.length);
      this.cand.push(i);
    } else if (!should && has) {
      const pos = this.candPos.get(i) as number;
      const last = this.cand[this.cand.length - 1];
      this.cand[pos] = last;
      this.candPos.set(last, pos);
      this.cand.pop();
      this.candPos.delete(i);
    }
  }

  private weightOf(i: number, wallet: number): number {
    const [x, y, z] = this.unpack(i);
    let w = 0;
    let neighbours = 0;
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!this.isStruct(nx, ny, nz)) continue;
      neighbours++;
      w += dy === -1 ? GROW.wBelow : dy === 1 ? GROW.wAbove : GROW.wSide;
      if (wallet >= 0 && this.strata.ownerOf(this.idx(nx, ny, nz)) === wallet) {
        w += GROW.wSameWallet;
      }
    }
    if (neighbours === 0) return 0;
    w += GROW.wCompact * (neighbours - 1);
    // stable-ish organic wobble, decorrelated per pick by the salt
    w *= 1 - GROW.jitter / 2 + hash1(i ^ (this.salt * 2654435761)) * GROW.jitter;
    return w;
  }

  private pick(wallet: number): number | undefined {
    if (!this.cand.length) return undefined;
    this.salt++;
    let total = 0;
    for (const i of this.cand) total += this.weightOf(i, wallet);
    if (total <= 0) return undefined;
    let r = Math.random() * total;
    for (const i of this.cand) {
      r -= this.weightOf(i, wallet);
      if (r <= 0) return i;
    }
    return this.cand[this.cand.length - 1];
  }

  // ---- public --------------------------------------------------------------

  // request n blocks of accretion attributed to a wallet + tx
  enqueue(n: number, wallet: number, tx: string) {
    for (let k = 0; k < n; k++) this.queue.push({ wallet, tx });
  }
  get pending(): number {
    return this.queue.length;
  }
  get frontierSize(): number {
    return this.cand.length;
  }

  // land queued blocks, a few per frame (more while a surge backlogs)
  drain() {
    if (!this.queue.length) return;
    const per = Math.max(1, Math.min(GROW.maxPerFrame, Math.ceil(this.queue.length / 90)));
    for (let k = 0; k < per && this.queue.length; k++) {
      const order = this.queue[0];
      const i = this.pick(order.wallet);
      if (i === undefined) {
        this.queue.shift(); // nowhere to grow (fully entombed); drop the order
        continue;
      }
      const [x, y, z] = this.unpack(i);
      if (!this.field.placeAt(x, y, z, MASS)) {
        // could not commit (defensive); forget this candidate and retry later
        this.refreshCell(x, y, z);
        continue;
      }
      this.queue.shift();
      this.strata.register(x, y, z, order.wallet, order.tx);
      this.refreshAround(x, y, z);
    }
  }
}
