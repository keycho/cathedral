// cathedral - the sky realm. the world is vertical: meadow below, floating
// islands above, calved from the mass at its milestones. a whale's monolith
// seeds an island over the place it surfaced; a major burn launches a
// hollowed ruin-island with an ember underside; every ~1500 blocks of
// standing mass calves one on its own. island stone is registered geology
// that INHERITS the age of the mass it broke from, so the strata ramp
// reads in the sky too, and the market keeps its rights over it: buys can
// accrete on an island, dumps can pull stones out of the sky, subsidence
// drags the whole realm a block closer to the ground.
//
// undersides are gardens: seed-green fringes, glasslight and lantern
// sparks, ember seams under the ruins, so an island is worth standing
// beneath.

import { GRID, MAXY } from "./config";
import { EMBERSEAM, GLASSLIGHT, LANTERN, MASS, MONUMENT, SEED } from "./palette";
import type { Kinetics } from "./kinetics";
import type { Strata } from "./strata";
import type { VoxelField } from "./voxels";
import { coastDistAt } from "./terrain";
import { audio } from "./audio";

const MILESTONE_BLOCKS = 1500; // standing mass per self-calved island
const SKY_LO = 46; // the island band
const SKY_HI = 66;
// the market's sky stays composed at seven; the archipelago's boot
// satellites sit outside the coast in their own ring and get six more
const MAX_ISLANDS = 13;

export interface Island {
  cx: number;
  cz: number;
  baseY: number; // underside apex sits below this
  r: number;
  kind: "whale" | "ruin" | "milestone";
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export class Islands {
  readonly list: Island[] = [];
  // fired the moment an island exists, so whatever hangs off it (a fall, a
  // garden, a light) is built with the land rather than swept for later
  onCalved?: (isle: Island) => void;
  private milestonesCalved = 0;

  constructor(
    private field: VoxelField,
    private strata: Strata,
    private kinetics: Kinetics,
    private refreshGrowth: (x: number, y: number, z: number) => void
  ) {}

  get count(): number {
    return this.list.length;
  }

  nearestTo(x: number, z: number): Island | null {
    let best: Island | null = null;
    let bd = Infinity;
    for (const i of this.list) {
      const d = Math.hypot(i.cx - x, i.cz - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  // a whale's monolith seeds an island above where it surfaced
  calveWhale(x: number, z: number) {
    this.calve(x, z, 5 + Math.random() * 3, "whale");
  }

  // a major burn launches a hollowed ruin-island near the wound
  calveRuin(x: number, z: number) {
    this.calve(x, z, 6 + Math.random() * 3, "ruin");
  }

  // the mass calves on its own as it grows
  maybeMilestone(blockCount: number, nearX: number, nearZ: number) {
    const due = Math.floor(blockCount / MILESTONE_BLOCKS);
    if (due <= this.milestonesCalved) return;
    this.milestonesCalved++;
    // a milestone always finds its sky: try a few positions before giving up
    const before = this.list.length;
    for (let tries = 0; tries < 5 && this.list.length === before; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const d = 18 + Math.random() * 30;
      this.calve(nearX + Math.cos(ang) * d, nearZ + Math.sin(ang) * d, 6 + Math.random() * 4, "milestone");
    }
  }

  // island ages are drawn from the standing mass: the sky inherits the
  // strata it broke away from
  private donorEpochs(n: number): number[] {
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      const c = this.strata.sampleCell(Math.random());
      if (c === undefined) break;
      const [x, y, z] = this.unpack(c);
      const p = this.strata.provAt(x, y, z);
      if (p) out.push(p.epoch);
    }
    if (!out.length) out.push(Math.max(0, this.strata.epoch - 10));
    return out;
  }

  private unpack(i: number): [number, number, number] {
    const y = i % MAXY;
    const xz = (i - y) / MAXY;
    const z = xz % GRID;
    const x = (xz - z) / GRID;
    return [x, y, z];
  }

  // THE ARCHIPELAGO. four satellites seeded at boot in the void ring
  // beyond the torn coast — varying size, varying altitude, the highest
  // joining the band the market calves into, so everything in the sky
  // reads as one composition. positions are marched out from the coast
  // along set bearings (the shard's own bearing is left clear), and a
  // seat is only taken if it is genuinely in the void.
  seedArchipelago() {
    const seats = [
      { a: 2.3, out: 24, r: 13, y: 12 }, // low and broad, a slung crossing away
      { a: 3.5, out: 16, r: 9, y: 44 }, // mid sky
      { a: 4.6, out: 20, r: 11, y: 56 }, // high, in the market's own band
      { a: 5.9, out: 26, r: 7, y: 10 }, // a low outlying stone
      { a: 1.55, out: 30, r: 10, y: 38 }, // the once-empty eastern quadrant
      { a: 0.18, out: 36, r: 8, y: 24 }, // and the gap past the shard's wake
    ];
    for (const s of seats) {
      // march to the coast along this bearing, then step out past it
      let R = 60;
      while (R < 150 && coastDistAt(GRID / 2 + Math.cos(s.a) * R, GRID / 2 + Math.sin(s.a) * R) > 0) R += 2;
      const cx = Math.round(GRID / 2 + Math.cos(s.a) * (R + s.out));
      const cz = Math.round(GRID / 2 + Math.sin(s.a) * (R + s.out));
      if (cx < 12 || cz < 12 || cx > GRID - 13 || cz > GRID - 13) continue;
      if (coastDistAt(cx, cz) > -(s.r + 3)) continue; // not clear of the land
      this.build(cx, cz, s.r, s.y, "milestone");
    }
  }

  private calve(fx: number, fz: number, r: number, kind: Island["kind"]) {
    if (this.list.length >= MAX_ISLANDS) return;
    const cx = Math.round(Math.max(24, Math.min(GRID - 25, fx)));
    const cz = Math.round(Math.max(24, Math.min(GRID - 25, fz)));
    // keep the sky composed: no island shadows another
    for (const i of this.list) {
      if (Math.hypot(i.cx - cx, i.cz - cz) < (i.r + r) * 1.6) return;
    }
    const baseY = Math.round(SKY_LO + Math.random() * (SKY_HI - SKY_LO - r));
    this.build(cx, cz, r, baseY, kind);
  }

  private build(cx: number, cz: number, r: number, baseY: number, kind: Island["kind"]) {
    const donors = this.donorEpochs(48);
    const R = Math.ceil(r);
    let placed = 0;

    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const x = cx + dx;
        const z = cz + dz;
        const d = Math.hypot(dx, dz) / r;
        if (d > 1) continue;
        const wobble = 0.85 + hash2(x * 2.1, z * 1.7) * 0.3;
        const lens = (1 - d * d) * wobble;
        const up = Math.max(1, Math.round(lens * 2.2)); // low top relief
        const down = Math.max(1, Math.round(lens * (r * 0.55))); // deep keel
        for (let y = baseY - down; y < baseY + up; y++) {
          if (y < 2 || y >= MAXY - 2) continue;
          if (this.field.isSolid(x, y, z)) continue;
          const bottom = y === baseY - down;
          const top = y === baseY + up - 1;
          let type = MASS;
          let lock = false;
          if (bottom) {
            // the gardened, glowing underside
            const h = hash2(x * 3.3, z * 4.7);
            if (kind === "ruin") {
              type = h < 0.4 ? EMBERSEAM : MASS;
              lock = h < 0.4;
            } else if (h < 0.14) {
              type = LANTERN;
              lock = true;
            } else if (h < 0.3) {
              type = GLASSLIGHT;
              lock = true;
            }
          } else if (top && d > 0.55 && hash2(x * 1.3, z * 2.9) < 0.5) {
            type = SEED; // the green fringe
          }
          if (!this.field.placeAt(x, y, z, type)) continue;
          if (lock) {
            this.strata.lock(x, y, z);
            this.strata.register(x, y, z, -1, "island-" + kind);
          } else {
            const epoch = donors[Math.floor(Math.random() * donors.length)];
            this.strata.registerAged(x, y, z, -1, "island-" + kind, epoch);
          }
          this.refreshGrowth(x, y, z);
          placed++;
        }
      }
    }
    if (!placed) return;
    // a whale island carries its monolith into the sky
    if (kind === "whale") {
      const ty = baseY + 2;
      if (!this.field.isSolid(cx, ty, cz) && this.field.placeAt(cx, ty, cz, MONUMENT)) {
        this.strata.lock(cx, ty, cz);
        this.strata.register(cx, ty, cz, -1, "island-crown");
        this.refreshGrowth(cx, ty, cz);
      }
    }
    const isle: Island = { cx, cz, baseY, r, kind };
    this.list.push(isle);
    this.onCalved?.(isle);
    // the sky shudders when land is born in it
    const wx = cx - GRID / 2 + 0.5;
    const wz = cz - GRID / 2 + 0.5;
    this.kinetics.dust(wx, baseY - Math.round(r * 0.55), wz, 40, r * 0.8, 1.2);
    audio.rumble(0.7);
  }
}
