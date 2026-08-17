// kodo - erosion: r2 collapse with physics, r2b subsidence. a negative
// tick destabilizes floor(|net| / 50) frontier blocks: each steps through
// damage tiers toward ember, breaks off, tumbles outward and settles at the
// base as PERMANENT walkable rubble carrying the eroded wallet's name.
// selling wallets' own formations give way first. dumps also bite the
// crew's structures (a slice of orders goes to agent blocks; the mason
// repairs before building anything new). after 12 straight negative ticks
// the whole mass sinks one block, cavities and all, exposing old strata at
// the peak.

import { GRID, MAXY } from "./config";
import { audio } from "./audio";
import type { Hollows } from "./hollows";
import type { Kinetics } from "./kinetics";
import { blockColor, isGeology, RUBBLE } from "./palette";
import type { Scars } from "./scars";
import type { Strata } from "./strata";
import type { TickSummary } from "./ticks";
import type { VoxelField } from "./voxels";

const TIER_MS = 900; // time per damage tier before the stone lets go
const CREW_SHARE = 0.15; // slice of collapse orders that bite agent blocks
const ROLL_MAX = 4; // debris rolls outward at most this many cells

interface Falling {
  i: number;
  x: number;
  y: number;
  z: number;
  wallet: number;
  stage: number; // 0..2 damage tiers applied
  nextAt: number;
  agent: boolean;
}

export class Erosion {
  // the crew wires these: a picker for its own damageable cells and a
  // callback when one of its blocks is destroyed (repair queue)
  pickCrewCell?: () => number | undefined;
  onCrewBroken?: (x: number, y: number, z: number, material: number) => void;
  // the surveyor reads where rubble last fell
  lastRubble: { x: number; y: number; z: number }[] = [];
  // reclamation: flora listens so settled rubble mosses over in time
  onRubble?: (x: number, y: number, z: number) => void;

  private destab: Falling[] = [];
  private centroidX = GRID / 2;
  private centroidZ = GRID / 2;

  constructor(
    private field: VoxelField,
    private strata: Strata,
    private scars: Scars,
    private hollows: Hollows,
    private kinetics: Kinetics,
    private refreshGrowth: (x: number, y: number, z: number) => void
  ) {}

  private unpack(i: number): [number, number, number] {
    const y = i % MAXY;
    const xz = (i - y) / MAXY;
    const z = xz % GRID;
    const x = (xz - z) / GRID;
    return [x, y, z];
  }

  // r2: schedule n destabilizations for this tick, staggered across it
  erode(n: number, s: TickSummary, tickMs: number) {
    if (n <= 0) return;
    const now = performance.now();
    let sellerTotal = 0;
    for (const usd of s.sells.values()) sellerTotal += usd;

    const chosen = new Set<number>();
    for (let k = 0; k < n; k++) {
      let target: number | undefined;
      let agent = false;
      // dumps damage the crew's work too
      if (this.pickCrewCell && Math.random() < CREW_SHARE) {
        target = this.pickCrewCell();
        agent = target !== undefined;
      }
      if (target === undefined) target = this.pickGeology(s, sellerTotal, chosen);
      if (target === undefined) break;
      chosen.add(target);
      const [x, y, z] = this.unpack(target);
      this.destab.push({
        i: target,
        x,
        y,
        z,
        wallet: this.strata.ownerOf(target),
        stage: 0,
        nextAt: now + (k / Math.max(1, n)) * tickMs * 0.55,
        agent,
      });
    }
    if (n >= 6) audio.rumble(Math.min(1, n / 40));
  }

  // the most weather-beaten stone of the selling wallets gives way first
  private pickGeology(s: TickSummary, sellerTotal: number, taken: Set<number>): number | undefined {
    let best: number | undefined;
    let bestScore = 0;
    for (let k = 0; k < 60; k++) {
      const c = this.strata.sampleCell(Math.random());
      if (c === undefined) break;
      if (taken.has(c)) continue;
      const [x, y, z] = this.unpack(c);
      const type = this.field.typeAt(x, y, z);
      if (!isGeology(type) || type === RUBBLE) continue; // rubble is permanent
      if (this.strata.locked.has(c)) continue; // founding stone, linings
      const faces = this.field.exposedFaces(x, y, z);
      if (faces === 0) continue;
      const owner = this.strata.ownerOf(c);
      const sellerUsd = s.sells.get(owner) ?? 0;
      const sellerBias = sellerTotal > 0 && sellerUsd > 0 ? 3 + (sellerUsd / sellerTotal) * 4 : 1;
      const score = sellerBias * faces * (1 + y / MAXY) * (0.7 + Math.random() * 0.6);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  // r2b: the whole structure sinks one block, bottom-up so every stone has
  // room to settle before the one above it moves
  subside() {
    audio.rumble(1);
    const cells = [...this.strata.cellsSnapshot()].sort((a, b) => a % MAXY - (b % MAXY));
    let moved = 0;
    for (const i of cells) {
      const [x, y, z] = this.unpack(i);
      if (y <= 1) continue;
      if (!this.field.isSolid(x, y, z)) continue;
      if (this.field.isSolid(x, y - 1, z)) continue;
      const type = this.field.typeAt(x, y, z);
      this.field.breakAt(x, y, z);
      this.field.placeAt(x, y - 1, z, type);
      this.strata.transfer(x, y, z, y - 1);
      this.refreshGrowth(x, y, z);
      this.refreshGrowth(x, y - 1, z);
      moved++;
    }
    this.hollows.shiftDown();
    if (moved > 0) {
      // dust ring at the base
      for (let a = 0; a < 20; a++) {
        const ang = (a / 20) * Math.PI * 2;
        const wx = this.centroidX - GRID / 2 + Math.cos(ang) * 8;
        const wz = this.centroidZ - GRID / 2 + Math.sin(ang) * 8;
        this.kinetics.dust(wx, this.field.surfaceBelow(wx, wz, 40), wz, 4, 1.2, 1.2);
      }
    }
  }

  update(now: number) {
    for (let i = this.destab.length - 1; i >= 0; i--) {
      const d = this.destab[i];
      if (now < d.nextAt) continue;
      if (!this.field.isSolid(d.x, d.y, d.z)) {
        this.destab.splice(i, 1); // already gone (burn, subsidence)
        continue;
      }
      if (d.stage < 2) {
        d.stage++;
        d.nextAt = now + TIER_MS;
        const base = d.agent
          ? blockColor(this.field.typeAt(d.x, d.y, d.z))
          : this.strata.restingColor(d.i);
        this.field.damageAt(d.x, d.y, d.z, 1 - d.stage / 3, base);
        continue;
      }
      // the stone lets go
      this.destab.splice(i, 1);
      const type = this.field.typeAt(d.x, d.y, d.z);
      this.field.breakAt(d.x, d.y, d.z);
      this.strata.forget(d.x, d.y, d.z);
      this.hollows.onLiningBroken(d.x, d.y, d.z);
      this.scars.registerAround(d.x, d.y, d.z, now);
      this.refreshGrowth(d.x, d.y, d.z);
      if (d.agent) this.onCrewBroken?.(d.x, d.y, d.z, type);

      // tumble outward from the mass and settle as rubble at the base
      const ang = Math.atan2(d.z - this.centroidZ, d.x - this.centroidX) + (Math.random() - 0.5) * 0.9;
      const speed = 1.6 + Math.random() * 1.8;
      this.kinetics.drop(
        d.x,
        d.z,
        blockColor(RUBBLE),
        (cx, cz) => this.settleRubble(cx, cz, d.wallet),
        {
          from: 0.5,
          vy: 1.5 + Math.random() * 1.5,
          driftX: Math.cos(ang) * speed,
          driftZ: Math.sin(ang) * speed,
        }
      );
    }
  }

  private settleRubble(cx: number, cz: number, wallet: number) {
    // roll outward while the next column is meaningfully lower
    let x = cx;
    let z = cz;
    for (let r = 0; r < ROLL_MAX; r++) {
      const ang = Math.atan2(z - this.centroidZ, x - this.centroidX);
      const nx = Math.round(x + Math.cos(ang));
      const nz = Math.round(z + Math.sin(ang));
      if (nx === x && nz === z) break;
      if (this.field.topAt(nx, nz) <= this.field.topAt(x, z) - 2) {
        x = nx;
        z = nz;
      } else break;
    }
    const y = this.field.topAt(x, z);
    if (y >= MAXY - 2) return;
    if (this.field.placeAt(x, y, z, RUBBLE)) {
      this.strata.register(x, y, z, wallet, "erosion");
      this.refreshGrowth(x, y, z);
      this.lastRubble.push({ x, y, z });
      if (this.lastRubble.length > 40) this.lastRubble.shift();
      this.onRubble?.(x, y, z);
    }
  }
}
