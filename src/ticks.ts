// cathedral - the tick engine: the constitution's clock. every 30 seconds
// the raw feed collapses into one summary (netFlowUsd, grossVolumeUsd,
// uniqueWallets, largestTxUsd, per-wallet buy/sell usd) and the rules are
// applied to the summary, not to raw events: r1 accretion on positive net,
// r2 collapse on negative, r2b subsidence after 12 negative ticks in a
// row. epochs advance every 20 ticks. r4 monuments and r5 seeds stay
// event-immediate by law; r3 burns carve as they land.

import type { FeedEvent } from "./feed";
import { RULES } from "./rules";

export interface TickSummary {
  n: number; // tick number (1-based at close)
  netFlowUsd: number;
  grossVolumeUsd: number;
  uniqueWallets: number;
  largestTxUsd: number;
  buys: Map<number, number>; // wallet -> usd this tick
  sells: Map<number, number>;
}

interface Acc {
  net: number;
  gross: number;
  wallets: Set<number>;
  largest: number;
  buys: Map<number, number>;
  sells: Map<number, number>;
}

function freshAcc(): Acc {
  return { net: 0, gross: 0, wallets: new Set(), largest: 0, buys: new Map(), sells: new Map() };
}

export class TickEngine {
  tick = 0;
  negativeRun = 0; // consecutive negative ticks (r2b)
  // recent summaries (the architect reads these as market aggregates)
  readonly history: TickSummary[] = [];

  onTick?: (s: TickSummary) => void;
  onEpoch?: (epoch: number) => void;
  onSubside?: () => void;

  private tickMs: number = RULES.tickMs;
  private lastClose = performance.now();
  private acc = freshAcc();

  ingest(ev: FeedEvent) {
    if (ev.kind !== "buy" && ev.kind !== "sell") return;
    const signed = ev.kind === "buy" ? ev.amountUsd : -ev.amountUsd;
    this.acc.net += signed;
    this.acc.gross += ev.amountUsd;
    this.acc.wallets.add(ev.wallet);
    this.acc.largest = Math.max(this.acc.largest, ev.amountUsd);
    const side = ev.kind === "buy" ? this.acc.buys : this.acc.sells;
    side.set(ev.wallet, (side.get(ev.wallet) ?? 0) + ev.amountUsd);
  }

  // dev compression: shorter ticks shorten epochs and subsidence runs with
  // them. the constitution's cadence is the default.
  setTickMs(ms: number) {
    this.tickMs = ms;
    this.lastClose = performance.now();
  }
  get tickLenMs(): number {
    return this.tickMs;
  }
  get epoch(): number {
    return Math.floor(this.tick / RULES.ticksPerEpoch);
  }
  msToNextTick(now: number): number {
    return Math.max(0, this.tickMs - (now - this.lastClose));
  }
  msToNextEpoch(now: number): number {
    const ticksLeft = RULES.ticksPerEpoch - (this.tick % RULES.ticksPerEpoch) - 1;
    return ticksLeft * this.tickMs + this.msToNextTick(now);
  }

  update(now: number) {
    while (now - this.lastClose >= this.tickMs) {
      this.lastClose += this.tickMs;
      this.close();
    }
  }

  private close() {
    const a = this.acc;
    this.acc = freshAcc();
    this.tick++;
    const s: TickSummary = {
      n: this.tick,
      netFlowUsd: a.net,
      grossVolumeUsd: a.gross,
      uniqueWallets: a.wallets.size,
      largestTxUsd: a.largest,
      buys: a.buys,
      sells: a.sells,
    };
    this.history.push(s);
    if (this.history.length > 40) this.history.shift();

    if (s.netFlowUsd < 0) this.negativeRun++;
    else this.negativeRun = 0;

    this.onTick?.(s);

    if (this.negativeRun >= RULES.subsidenceTicks) {
      this.negativeRun = 0; // the run restarts after the mass settles
      this.onSubside?.();
    }
    if (this.tick % RULES.ticksPerEpoch === 0) {
      this.onEpoch?.(this.epoch);
    }
  }
}

// r1's attribution: distribute n blocks across buying wallets proportional
// to usd (largest remainder), so a wallet's formation grows with its buying
export function distributeBlocks(n: number, buys: Map<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  if (n <= 0 || !buys.size) return out;
  let total = 0;
  for (const usd of buys.values()) total += usd;
  if (total <= 0) return out;
  const shares: { w: number; whole: number; frac: number }[] = [];
  let assigned = 0;
  for (const [w, usd] of buys) {
    const exact = (n * usd) / total;
    const whole = Math.floor(exact);
    shares.push({ w, whole, frac: exact - whole });
    assigned += whole;
  }
  shares.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < shares.length && assigned < n; i++) {
    shares[i].whole++;
    assigned++;
  }
  for (const s of shares) if (s.whole > 0) out.set(s.w, s.whole);
  return out;
}
