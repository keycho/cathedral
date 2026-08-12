// cathedral - simulated history. a bootstrap that replays N epochs of
// synthetic market life so a dev or genesis-preview world LOOKS aged:
// every block registers under the simulated epoch it was born in (orange
// bedrock, cream mid-strata, fresh sage crowns), rubble aprons accumulate
// through simulated bears, burns and monuments land where the timeline
// put them. the live clock resumes exactly where the simulation ends. a
// world fast-forwarded any other way reads monochrome, because real age
// spread is what the strata ramp renders.

import type { Growth } from "./growth";
import type { Hollows } from "./hollows";
import { isGeology, RUBBLE } from "./palette";
import { RULES } from "./rules";
import type { Strata } from "./strata";
import type { TickEngine } from "./ticks";
import type { VoxelField } from "./voxels";
import { GRID, MAXY } from "./config";

export interface HistoryDeps {
  field: VoxelField;
  strata: Strata;
  growth: Growth;
  hollows: Hollows;
  ticks: TickEngine;
  raiseMonument: (wallet: number, tx: string) => void;
  plantSeed: (wallet: number, tx: string) => void;
  // the live walk's current price: the simulated series is scaled to end
  // here, so the ribbon runs seamlessly from the past into the present
  endPrice?: number;
}

function unpack(i: number): [number, number, number] {
  const y = i % MAXY;
  const xz = (i - y) / MAXY;
  const z = xz % GRID;
  const x = (xz - z) / GRID;
  return [x, y, z];
}

// instant erosion for the simulation: no physics, no scars (old scars have
// long cooled), just the rubble where it would have settled
function erodeInstant(deps: HistoryDeps, n: number) {
  const { field, strata, growth } = deps;
  for (let k = 0; k < n; k++) {
    let victim: number | undefined;
    for (let s = 0; s < 40; s++) {
      const c = strata.sampleCell(Math.random());
      if (c === undefined) return;
      const [x, y, z] = unpack(c);
      const t = field.typeAt(x, y, z);
      if (!isGeology(t) || t === RUBBLE) continue;
      if (strata.locked.has(c)) continue;
      if (field.exposedFaces(x, y, z) === 0) continue;
      victim = c;
      break;
    }
    if (victim === undefined) return;
    const [x, y, z] = unpack(victim);
    const wallet = strata.ownerOf(victim);
    field.breakAt(x, y, z);
    strata.forget(x, y, z);
    growth.refreshAround(x, y, z);
    // settle at the foot, outward from center
    const ang = Math.atan2(z - GRID / 2, x - GRID / 2) + (Math.random() - 0.5) * 0.8;
    let rx = x;
    let rz = z;
    for (let r = 0; r < 6; r++) {
      const nx = Math.round(rx + Math.cos(ang));
      const nz = Math.round(rz + Math.sin(ang));
      if (field.topAt(nx, nz) <= field.topAt(rx, rz) - 2) {
        rx = nx;
        rz = nz;
      } else break;
    }
    const ry = field.topAt(rx, rz);
    if (ry < MAXY - 2 && field.placeAt(rx, ry, rz, RUBBLE)) {
      strata.register(rx, ry, rz, wallet, "erosion");
      growth.refreshAround(rx, ry, rz);
    }
  }
}

// replay `epochs` of life. returns blocks standing when the past catches
// up to the present.
export function simulateHistory(deps: HistoryDeps, epochs: number): number {
  const { strata, growth, ticks, hollows } = deps;
  const startEpoch = strata.epoch;
  const savedDropper = growth.dropper;
  growth.dropper = undefined; // the past does not fall in block by block

  const wallet = () => Math.floor(Math.pow(Math.random(), 1.9) * 40);

  // a market with moods: multi-epoch regimes so strata bands read
  let mood = 1; // 1 bull, 0 chop, -1 bear
  let moodLeft = 0;
  const epochGross: number[] = [];
  // the simulated price: one close per simulated tick, drifting with the
  // mood, so the ribbon and candles wake up carrying the same past the
  // strata do
  const closes: number[] = [];
  let price = 1;

  for (let e = 0; e < epochs; e++) {
    strata.epoch = startEpoch + e; // births carry the simulated epoch
    if (moodLeft <= 0) {
      const roll = Math.random();
      mood = roll < 0.52 ? 1 : roll < 0.82 ? 0 : -1;
      moodLeft = 2 + Math.floor(Math.random() * 5);
    }
    moodLeft--;

    const drift = mood === 1 ? 1.0035 : mood === 0 ? 1.0 : 0.9955;
    for (let t = 0; t < RULES.ticksPerEpoch; t++) {
      price *= drift * (1 + (Math.random() - 0.5) * 0.016);
      closes.push(price);
    }

    let gross = 0;
    if (mood >= 0) {
      const grown = mood === 1 ? 45 + Math.floor(Math.random() * 90) : 8 + Math.floor(Math.random() * 22);
      gross += grown * RULES.usdPerBlock;
      // a handful of buyers share each epoch's growth
      let left = grown;
      while (left > 0) {
        const part = Math.min(left, 4 + Math.floor(Math.random() * 14));
        growth.enqueue(part, wallet(), "history-" + (startEpoch + e));
        left -= part;
      }
      while (growth.pending > 0) growth.drain();
    }
    if (mood === -1) {
      const eroded = 10 + Math.floor(Math.random() * 26);
      gross += eroded * RULES.usdPerBlock;
      erodeInstant(deps, eroded);
    }
    epochGross.push(gross);
    // the rarer marks of a long life
    if (Math.random() < 0.06) {
      hollows.burn(2e5 + Math.random() * 2e6, (x, y, z) => growth.refreshAround(x, y, z));
    }
    if (Math.random() < 0.05) deps.raiseMonument(wallet(), "history-whale");
    if (Math.random() < 0.1) deps.plantSeed(wallet(), "history-holder");
  }

  strata.epoch = startEpoch + epochs;
  ticks.tick = strata.epoch * RULES.ticksPerEpoch; // the live clock resumes here

  // the simulated market also funds the crew and hands the ribbon its
  // chart: seed the tick record with the trailing epochs' volume (so an
  // aged world does not wake up broke) and the price walk's tail (so the
  // ribbon and candles wake up mid-story). the series is scaled to end at
  // the live price, making past and present one line.
  const windowTicks = Math.max(1, Math.round(RULES.crewBudgetWindowMs / ticks.tickLenMs));
  const tail = epochGross.slice(-Math.max(1, Math.ceil(windowTicks / RULES.ticksPerEpoch)));
  const perTick = tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length) / RULES.ticksPerEpoch;
  const seedN = Math.min(Math.max(windowTicks, 240), 400, closes.length);
  const closeTail = closes.slice(-seedN);
  const scale = deps.endPrice && closeTail.length ? deps.endPrice / closeTail[closeTail.length - 1] : 1;
  for (let k = 0; k < seedN; k++) {
    ticks.history.push({
      n: ticks.tick - seedN + k + 1,
      netFlowUsd: 0,
      grossVolumeUsd: k >= seedN - windowTicks ? perTick : 0,
      uniqueWallets: 0,
      largestTxUsd: 0,
      close: closeTail[k] * scale,
      buys: new Map(),
      sells: new Map(),
    });
  }

  strata.retintAll(); // every stratum takes its true age colour
  growth.dropper = savedDropper;
  return strata.blockCount;
}
