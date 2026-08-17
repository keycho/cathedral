// kodo - the tick engine: the constitution's clock. every 30 seconds
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
  close: number; // the price when the tick closed (0 = no source wired)
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
  // where the closing price comes from (main wires the feed's walk)
  priceSource?: () => number;

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

  // WHEN THE CLOCK IS SOMEWHERE ELSE. once a server is closing ticks off a
  // real chain, this engine must stop rolling its own: two visitors watching
  // the same token cannot each be summarising their own local event stream
  // and expect the same hall to go up. it keeps doing everything else — the
  // rules, the epochs, the subsidence run — driven by summaries handed to it
  // rather than by ones it computed.
  external = false;

  update(now: number) {
    if (this.external) return;
    while (now - this.lastClose >= this.tickMs) {
      this.lastClose += this.tickMs;
      this.close();
    }
  }

  // an authoritative summary, from the market service. it takes exactly the
  // same path a locally closed tick takes — the rules must not be able to
  // tell where a tick came from, or a world grown from the chain would
  // differ from one grown from the feed by more than its numbers.
  applyExternal(s: TickSummary) {
    if (s.n <= this.tick) return; // already applied; the wire repeats itself
    this.tick = s.n;
    this.settle(s);
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
      close: this.priceSource?.() ?? 0,
      buys: a.buys,
      sells: a.sells,
    };
    this.settle(s);
  }

  // everything a closed tick does, whoever closed it
  private settle(s: TickSummary) {
    this.history.push(s);
    // deep enough to cover the crew's funding window even under 10x
    // compression (the budget reads real minutes, not tick counts)
    if (this.history.length > 400) this.history.shift();

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
