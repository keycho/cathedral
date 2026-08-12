// cathedral - burn hollows (r3's carve + treatment). a burn eats a rough
// sphere out of the mass: the removed cells become permanent hollow that
// never re-accretes, the surviving cells that face the cavity are locked as
// lining and tinted a dim rust, and a pooled warm light breathes inside so
// interiors read as ember-lit chambers. the founding stone is sacred and
// is never carved. rule-side sizing (radius from amountTokens) uses the
// constitution's bounds; the full burn rule wires through the tick engine
// in phase 1d.

import * as THREE from "three";
import { GRID, MAXY } from "./config";
import { isGeology } from "./palette";
import { RULES } from "./rules";
import type { Strata } from "./strata";
import type { VoxelField } from "./voxels";

const LIGHT_CAP = 6; // pooled interior lights (linings persist regardless)
const LINING = { r: 0x8a, g: 0x38, b: 0x14 }; // dim rust the light warms

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

export class Hollows {
  // main wires this: a ceiling block breaking loose during a burn (it
  // tumbles into the cavity and settles as rubble on its floor)
  onRoofFall?: (x: number, y: number, z: number) => void;

  private hollow = new Set<number>();
  private lining = new Set<number>();
  private lights: { light: THREE.PointLight; phase: number }[] = [];
  private tmp = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private field: VoxelField,
    private strata: Strata,
    private sacred: number // the founding stone's cell index
  ) {}

  // the founding stone moves when the mass subsides; its sanctity follows
  setSacred(idx: number) {
    this.sacred = idx;
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

  isHollow(x: number, y: number, z: number): boolean {
    return this.hollow.has(this.idx(x, y, z));
  }
  get count(): number {
    return this.hollow.size;
  }

  // radius ~ amountTokens, inside the constitution's bounds, and never
  // larger than the mass can hold: a hollow is a chamber INSIDE the stone,
  // so the geometric cap scales with the structure's own bulk
  private radiusFor(amountTokens: number): number {
    const byTokens = Math.max(
      RULES.burnRadiusMin,
      Math.min(RULES.burnRadiusMax, Math.cbrt(Math.max(1, amountTokens)) / 24)
    );
    const byMass = Math.cbrt(Math.max(1, this.strata.blockCount)) * 0.5;
    return Math.max(1.2, Math.min(byTokens, byMass));
  }

  // carve a hollow for a burn. returns cells removed (0 = nothing to carve
  // yet; the mass is too small to hold a chamber). onCellRemoved lets the
  // caller keep other systems (frontier) exact per cell.
  burn(amountTokens: number, onCellRemoved: (x: number, y: number, z: number) => void): number {
    // centre: the most enclosed of a few dozen sampled structure cells
    let center = -1;
    let best = -1;
    for (let s = 0; s < 48; s++) {
      const c = this.strata.sampleCell(Math.random());
      if (c === undefined) break;
      if (c === this.sacred || this.hollow.has(c)) continue;
      const [x, y, z] = this.unpack(c);
      if (!isGeology(this.field.typeAt(x, y, z))) continue; // crew cells never burn
      let enclosed = 0;
      for (const [dx, dy, dz] of DIRS) {
        if (isGeology(this.field.typeAt(x + dx, y + dy, z + dz))) enclosed++;
      }
      if (enclosed > best) {
        best = enclosed;
        center = c;
      }
    }
    if (center < 0) return 0;

    const [cx, cy, cz] = this.unpack(center);
    const r = this.radiusFor(amountTokens);
    const R = Math.ceil(r);
    const removed: number[] = [];
    for (let x = cx - R; x <= cx + R; x++) {
      for (let y = Math.max(1, cy - R); y <= Math.min(MAXY - 2, cy + R); y++) {
        for (let z = cz - R; z <= cz + R; z++) {
          const i = this.idx(x, y, z);
          if (i === this.sacred || this.hollow.has(i)) continue;
          // knobbly edge: each cell sees a slightly different radius
          const re = r * (0.9 + hash1(i) * 0.2);
          const dx = x - cx;
          const dy = y - cy;
          const dz = z - cz;
          if (dx * dx + dy * dy + dz * dz > re * re) continue;
          if (!isGeology(this.field.typeAt(x, y, z))) continue; // only mass burns
          this.field.breakAt(x, y, z);
          this.strata.forget(x, y, z);
          this.hollow.add(i);
          removed.push(i);
          onCellRemoved(x, y, z);
        }
      }
    }
    if (!removed.length) return 0;

    // lining: every surviving solid face of the cavity, locked + dim rust
    for (const i of removed) {
      const [x, y, z] = this.unpack(i);
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (!this.field.isSolid(nx, ny, nz)) continue;
        const ni = this.idx(nx, ny, nz);
        if (ni === this.sacred) continue;
        this.strata.locked.add(ni);
        this.lining.add(ni);
        this.paintLining(nx, ny, nz);
      }
    }

    // the roof gives: a share of ceiling lining collapses inward, tumbling
    // to the cavity floor as rubble, so every burn reads as a cave-in
    if (this.onRoofFall) {
      const ceiling: number[] = [];
      for (const i of removed) {
        const [x, y, z] = this.unpack(i);
        const above = this.idx(x, y + 1, z);
        if (this.lining.has(above) && this.field.isSolid(x, y + 1, z)) ceiling.push(above);
      }
      for (const i of ceiling) {
        if (Math.random() > 0.3) continue;
        const [x, y, z] = this.unpack(i);
        if (i === this.sacred) continue;
        this.lining.delete(i);
        this.field.breakAt(x, y, z);
        this.strata.forget(x, y, z);
        this.onRoofFall(x, y, z);
      }
    }

    // a warm breathing light inside (pooled; oldest goes dark first)
    const light = new THREE.PointLight(0xe06426, 3.6, r * 3.8 + 5, 1.8);
    this.field.worldCenter(cx, cy, cz, this.tmp);
    light.position.copy(this.tmp);
    this.scene.add(light);
    this.lights.push({ light, phase: Math.random() * Math.PI * 2 });
    if (this.lights.length > LIGHT_CAP) {
      const old = this.lights.shift();
      if (old) this.scene.remove(old.light);
    }
    return removed.length;
  }

  private paintLining(x: number, y: number, z: number) {
    const i = this.idx(x, y, z);
    const j = 0.8 + hash1(i) * 0.4;
    const hex =
      (Math.min(255, LINING.r * j) << 16) |
      (Math.min(255, LINING.g * j) << 8) |
      Math.min(255, LINING.b * j);
    // pushed into the hot range: every burn mouth is a pool of warmth
    this.field.tintAt(x, y, z, hex, 1.45);
  }

  // subsidence: the cavities sink with the mass. hollow and lining cells
  // shift one down unless the cell below is inside the ground; linings are
  // repainted at their new homes (the transfer kept them locked).
  shiftDown() {
    const shift = (set: Set<number>): Set<number> => {
      const out = new Set<number>();
      for (const i of set) {
        const [x, y, z] = this.unpack(i);
        if (y > 1 && !this.field.isSolid(x, y - 1, z)) out.add(this.idx(x, y - 1, z));
        else out.add(i);
      }
      return out;
    };
    this.hollow = shift(this.hollow);
    // linings follow their blocks: a lining cell that is still solid keeps
    // its index; one whose block slid down follows it
    const next = new Set<number>();
    for (const i of this.lining) {
      const [x, y, z] = this.unpack(i);
      if (this.field.isSolid(x, y, z)) {
        next.add(i);
        this.paintLining(x, y, z);
      } else if (y > 1 && this.field.isSolid(x, y - 1, z)) {
        next.add(this.idx(x, y - 1, z));
        this.paintLining(x, y - 1, z);
      }
    }
    this.lining = next;
    for (const l of this.lights) l.light.position.y -= 1;
  }

  // erosion tearing a lining block away: drop its membership so the cell
  // does not stay locked as air
  onLiningBroken(x: number, y: number, z: number) {
    this.lining.delete(this.idx(x, y, z));
  }

  // rubble landing on a cavity floor makes that cell solid ground again
  fillHollowCell(x: number, y: number, z: number) {
    this.hollow.delete(this.idx(x, y, z));
  }

  update(t: number) {
    for (const l of this.lights) {
      l.light.intensity = 3.3 + Math.sin(t * 1.7 + l.phase) * 0.7;
    }
  }
}
