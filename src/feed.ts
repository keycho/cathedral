// cathedral - the synthetic market. emits the exact event shapes the real
// indexer will emit in phase 2 (buy / sell / burn / newHolder, every event
// carrying a txRef), on an exponential timer whose rate and buy/sell bias
// are live-adjustable from the dev panel. wallets are stable fake pubkeys
// from a fixed seed, so per-wallet formations survive reloads; traffic
// itself varies run to run.

export type FeedEvent =
  | { kind: "buy"; amountUsd: number; wallet: number; tx: string }
  | { kind: "sell"; amountUsd: number; wallet: number; tx: string }
  | { kind: "burn"; amountTokens: number; tx: string }
  | { kind: "newHolder"; wallet: number; tx: string };

const POOL_SEED = 0xca7d1a1; // fixed: pubkeys are stable across reloads
const INITIAL_HOLDERS = 40;
const P_NEW_HOLDER = 0.05;
const P_BURN = 0.02;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// box-muller normal from a uniform source
function randn(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class Feed {
  // live controls (the dev panel writes these)
  ratePerHour = 180; // 10 .. 5000
  buyBias = 0.62; // p(buy) among swap events
  running = true;

  // the wallet pool: index -> stable pubkey
  private pubkeys: string[] = [];
  private poolRng = mulberry32(POOL_SEED); // ONLY for minting pubkeys
  private rng = mulberry32((Date.now() ^ 0x5eed) >>> 0); // traffic varies
  private nextAt = 0;
  private listeners: ((ev: FeedEvent) => void)[] = [];

  // rolling gross volume (r6 drives ambient from this)
  private volume: { t: number; usd: number }[] = [];
  // recent events for the panel log
  readonly log: FeedEvent[] = [];

  constructor() {
    for (let i = 0; i < INITIAL_HOLDERS; i++) this.mintPubkey();
  }

  private mintPubkey(): number {
    let k = "";
    for (let c = 0; c < 44; c++) k += BASE58[Math.floor(this.poolRng() * BASE58.length)];
    this.pubkeys.push(k);
    return this.pubkeys.length - 1;
  }

  pubkey(i: number): string {
    return this.pubkeys[i] ?? "unknown";
  }
  short(i: number): string {
    const k = this.pubkeys[i];
    return k ? k.slice(0, 4) + ".." + k.slice(-4) : "??";
  }
  get holderCount(): number {
    return this.pubkeys.length;
  }

  private txRef(): string {
    let s = "";
    for (let c = 0; c < 20; c++) s += BASE58[Math.floor(this.rng() * BASE58.length)];
    return s;
  }

  // zipf-ish: low indices (early wallets) trade the most
  private pickWallet(): number {
    const n = this.pubkeys.length;
    const u = this.rng();
    const i = Math.floor(Math.pow(u, 1.9) * n);
    return Math.min(n - 1, i);
  }

  private swapUsd(): number {
    // lognormal, median ~$55, occasionally organic whales past $1000
    const usd = Math.exp(4.0 + randn(this.rng) * 1.05);
    return Math.round(Math.max(3, Math.min(4000, usd)));
  }

  private burnTokens(): number {
    return Math.round(Math.exp(12.3 + randn(this.rng) * 0.9)); // ~2e5 median
  }

  on(fn: (ev: FeedEvent) => void) {
    this.listeners.push(fn);
  }

  private emit(ev: FeedEvent) {
    this.log.push(ev);
    if (this.log.length > 32) this.log.shift();
    if (ev.kind === "buy" || ev.kind === "sell") {
      this.volume.push({ t: performance.now(), usd: ev.amountUsd });
    }
    for (const fn of this.listeners) fn(ev);
  }

  // gross usd traded in the trailing minute
  grossPerMin(now: number): number {
    while (this.volume.length && now - this.volume[0].t > 60_000) this.volume.shift();
    let s = 0;
    for (const v of this.volume) s += v.usd;
    return s;
  }

  // ---- the timer -----------------------------------------------------------

  private schedule(now: number) {
    const perSec = Math.max(1, this.ratePerHour) / 3600;
    const gap = -Math.log(1 - Math.max(1e-9, this.rng())) / perSec;
    this.nextAt = now + Math.max(40, Math.min(600_000, gap * 1000));
  }

  update(now: number) {
    if (!this.running) return;
    if (this.nextAt === 0) this.schedule(now);
    let fired = 0;
    while (now >= this.nextAt && fired < 24) {
      this.fire();
      this.schedule(this.nextAt);
      fired++;
    }
    if (fired >= 24) this.nextAt = now; // never spiral after a stall
  }

  private fire() {
    const roll = this.rng();
    if (roll < P_NEW_HOLDER) {
      const w = this.mintPubkey();
      this.emit({ kind: "newHolder", wallet: w, tx: this.txRef() });
      // a new holder announces itself with a first buy
      this.emit({ kind: "buy", amountUsd: this.swapUsd(), wallet: w, tx: this.txRef() });
      return;
    }
    if (roll < P_NEW_HOLDER + P_BURN) {
      this.emit({ kind: "burn", amountTokens: this.burnTokens(), tx: this.txRef() });
      return;
    }
    const buy = this.rng() < this.buyBias;
    const ev: FeedEvent = buy
      ? { kind: "buy", amountUsd: this.swapUsd(), wallet: this.pickWallet(), tx: this.txRef() }
      : { kind: "sell", amountUsd: this.swapUsd(), wallet: this.pickWallet(), tx: this.txRef() };
    this.emit(ev);
  }

  // ---- manual injections (the dev panel's buttons) -------------------------

  manual(kind: "buy" | "sell" | "whale" | "burn") {
    switch (kind) {
      case "buy":
        this.emit({ kind: "buy", amountUsd: 150 + Math.round(this.rng() * 300), wallet: this.pickWallet(), tx: this.txRef() });
        break;
      case "sell":
        this.emit({ kind: "sell", amountUsd: 150 + Math.round(this.rng() * 300), wallet: this.pickWallet(), tx: this.txRef() });
        break;
      case "whale":
        // a single tx past the constitution's whale threshold
        this.emit({ kind: "buy", amountUsd: 1200 + Math.round(this.rng() * 1600), wallet: this.pickWallet(), tx: this.txRef() });
        break;
      case "burn":
        this.emit({ kind: "burn", amountTokens: Math.round(this.burnTokens() * 1.5), tx: this.txRef() });
        break;
    }
  }
}
