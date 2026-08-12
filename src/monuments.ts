// cathedral - the market's marks. r4: a single tx past the whale threshold
// immediately slams a two-block bright monolith onto the highest point of
// the frontier, with a toll. r5: a new holder plants a seed block on empty
// ground within 20 blocks of the mass; accretion can take it from there.
// both are event-immediate by law.

import { GRID, MAXY } from "./config";
import type { Growth } from "./growth";
import type { Kinetics } from "./kinetics";
import { blockColor, isGeology, MONUMENT, SEED } from "./palette";
import { RULES } from "./rules";
import type { Strata } from "./strata";
import type { VoxelField } from "./voxels";

export class Monuments {
  count = 0;
  seeds = 0;
  // the surveyor visits the latest marks
  lastMonument: { x: number; y: number; z: number } | null = null;
  lastSeed: { x: number; y: number; z: number } | null = null;

  constructor(
    private field: VoxelField,
    private strata: Strata,
    private growth: Growth,
    private kinetics: Kinetics
  ) {}

  // r4: find the highest geology cell with two cells of sky and raise the
  // monolith there, one slammed block at a time
  raise(wallet: number, tx: string) {
    let best: { x: number; y: number; z: number } | null = null;
    for (let k = 0; k < 400; k++) {
      const c = this.strata.sampleCell(Math.random());
      if (c === undefined) break;
      const y = c % MAXY;
      const xz = (c - y) / MAXY;
      const z = xz % GRID;
      const x = (xz - z) / GRID;
      if (!isGeology(this.field.typeAt(x, y, z))) continue;
      if (y + 3 >= MAXY - 1) continue;
      if (this.field.isSolid(x, y + 1, z) || this.field.isSolid(x, y + 2, z)) continue;
      if (!best || y > best.y) best = { x, y, z };
    }
    if (!best) return;
    const site = best;
    const place = (dy: number) => {
      const py = site.y + 1 + dy;
      if (this.field.placeAt(site.x, py, site.z, MONUMENT)) {
        // lock BEFORE register: register tints unlocked cells with the
        // strata colour and a monolith is bright by law
        this.strata.lock(site.x, py, site.z);
        this.strata.register(site.x, py, site.z, wallet, tx);
        this.growth.refreshAround(site.x, py, site.z);
      }
    };
    this.kinetics.drop(site.x, site.z, blockColor(MONUMENT), () => place(0), {
      stopY: site.y + 1,
      from: 22,
      vy: -6,
      big: true,
    });
    setTimeout(() => {
      this.kinetics.drop(site.x, site.z, blockColor(MONUMENT), () => place(1), {
        stopY: site.y + 2,
        from: 24,
        vy: -6,
        big: true,
      });
    }, 300);
    this.count++;
    this.lastMonument = { x: site.x, y: site.y + 2, z: site.z };
  }

  // r5: a seed on open ground near the mass
  plant(wallet: number, tx: string) {
    for (let k = 0; k < 40; k++) {
      const c = this.strata.sampleCell(Math.random());
      if (c === undefined) return;
      const y0 = c % MAXY;
      const xz = (c - y0) / MAXY;
      const cz = xz % GRID;
      const cx = (xz - cz) / GRID;
      const ang = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * (RULES.seedRadius - 4);
      const x = Math.round(cx + Math.cos(ang) * dist);
      const z = Math.round(cz + Math.sin(ang) * dist);
      if (x < 10 || x >= GRID - 10 || z < 10 || z >= GRID - 10) continue;
      const y = this.field.topAt(x, z);
      if (y >= MAXY - 3) continue;
      // open ground: nothing but terrain here and a clear cell above
      if (isGeology(this.field.typeAt(x, y - 1, z))) continue;
      if (this.field.isSolid(x, y, z)) continue;
      let crowded = false;
      for (let dx = -1; dx <= 1 && !crowded; dx++)
        for (let dz = -1; dz <= 1 && !crowded; dz++)
          if (isGeology(this.field.typeAt(x + dx, this.field.topAt(x + dx, z + dz) - 1, z + dz)))
            crowded = true;
      if (crowded) continue;
      this.kinetics.drop(
        x,
        z,
        blockColor(SEED),
        () => {
          if (this.field.placeAt(x, y, z, SEED)) {
            this.strata.register(x, y, z, wallet, tx);
            this.growth.refreshAround(x, y, z);
            this.seeds++;
            this.lastSeed = { x, y, z };
          }
        },
        { stopY: y, from: 12 }
      );
      return;
    }
  }
}
