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
import { GENESIS } from "./palette";
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
  private hollow = new Set<number>();
  private lights: { light: THREE.PointLight; phase: number }[] = [];
  private tmp = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private field: VoxelField,
    private strata: Strata,
    private sacred: number // the founding stone's cell index
  ) {}

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

  // radius ~ amountTokens, inside the constitution's bounds
  private radiusFor(amountTokens: number): number {
    const r = Math.cbrt(Math.max(1, amountTokens)) / 24;
    return Math.max(RULES.burnRadiusMin, Math.min(RULES.burnRadiusMax, r));
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
      let enclosed = 0;
      for (const [dx, dy, dz] of DIRS) {
        if (this.field.typeAt(x + dx, y + dy, z + dz) >= GENESIS) enclosed++;
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
          if (this.field.typeAt(x, y, z) < GENESIS) continue; // only mass burns
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
        const j = 0.8 + hash1(ni) * 0.4;
        const hex =
          (Math.min(255, LINING.r * j) << 16) |
          (Math.min(255, LINING.g * j) << 8) |
          Math.min(255, LINING.b * j);
        this.field.tintAt(nx, ny, nz, hex);
      }
    }

    // a warm breathing light inside (pooled; oldest goes dark first)
    const light = new THREE.PointLight(0xe06426, 2.4, r * 3.4 + 4, 1.9);
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

  update(t: number) {
    for (const l of this.lights) {
      l.light.intensity = 2.2 + Math.sin(t * 1.7 + l.phase) * 0.5;
    }
  }
}
