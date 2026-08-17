// kodo - where trades come from. one interface, two implementations:
// a stand-in token that exists today, and the real one that does not yet.
//
// A SOURCE ANSWERS ONE QUESTION: what happened between these two moments.
// not "what is new since I last asked" — that phrasing is what makes an
// indexer lose events, because "since I last asked" is a fact about the
// indexer and the chain does not know it. a time window is a fact about the
// world, so the same window always has the same answer and asking twice is
// free.
//
// THE STAND-IN IS DETERMINISTIC, and that is the whole reason it is written
// this way rather than as a random walk. reconciliation is the feature being
// built; a source whose answers change between calls cannot be used to test
// whether two parties agree, because they would be right to disagree. this
// one is a pure function of (mint, window), so the indexer can be run twice
// over the same hour and must produce an identical log — which is exactly
// the property the real chain has and the phase-1 browser feed does not.

import { normalise } from "../src/market/law.js";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// a stand-in mint. it is deliberately obvious rather than a plausible
// looking address: nobody should ever be unsure whether this world is
// running against a real token.
export const STANDIN_MINT = "stand1nKodoPlaceholderMintNotRea1Yet";

function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function rngFrom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sig(seed) {
  const r = rngFrom(seed);
  let out = "";
  for (let i = 0; i < 44; i++) out += BASE58[Math.floor(r() * BASE58.length)];
  return out;
}
function pubkey(i) {
  const r = rngFrom(hash32("kodo-holder-" + i));
  let out = "";
  for (let k = 0; k < 44; k++) out += BASE58[Math.floor(r() * BASE58.length)];
  return out;
}

// ---- the stand-in ------------------------------------------------------------

// a pumpfun-shaped token with a life: a launch spike, a drift, and the
// occasional whale. the shape matters more than the numbers — the world's
// rules key off net flow, gross volume and single-transaction size, so a
// stand-in that only ever produced small even trades would exercise the
// pipeline without ever exercising the world.
const SLICE_MS = 5_000; // trades are generated per five-second slice

export class StandInSource {
  constructor(mint = STANDIN_MINT, opts = {}) {
    this.mint = mint;
    this.holders = opts.holders ?? 180;
    this.baseRate = opts.tradesPerMinute ?? 22;
    this.seed = hash32(mint);
  }
  get name() {
    return "standin";
  }

  // every slice is generated from (mint, slice index) alone, so the answer
  // for a window never depends on when it was asked or on what was asked
  // before it
  async fetchWindow(fromMs, toMs) {
    const out = [];
    const first = Math.floor(fromMs / SLICE_MS);
    const last = Math.ceil(toMs / SLICE_MS);
    for (let s = first; s < last; s++) {
      for (const ev of this.slice(s)) {
        if (ev.at >= fromMs && ev.at < toMs) out.push(ev);
      }
    }
    out.sort((a, b) => a.at - b.at || (a.tx < b.tx ? -1 : 1));
    return out;
  }

  slice(sliceIndex) {
    const r = rngFrom((this.seed ^ Math.imul(sliceIndex, 0x9e3779b1)) >>> 0);
    const base = sliceIndex * SLICE_MS;
    // the rate breathes on a slow cycle, so ticks are not all the same size
    const swell = 0.55 + 0.9 * (0.5 + 0.5 * Math.sin(sliceIndex / 41));
    const n = Math.floor((this.baseRate / 12) * swell + r() * 1.6);
    // and the bias wanders, so the world gets runs of accretion and runs of
    // collapse rather than a permanent grey middle
    const bias = 0.5 + 0.22 * Math.sin(sliceIndex / 97) + 0.1 * Math.sin(sliceIndex / 13);
    const price = 0.0042 * (1 + 0.35 * Math.sin(sliceIndex / 220));
    const out = [];
    for (let i = 0; i < n; i++) {
      const at = base + Math.floor(r() * SLICE_MS);
      const who = Math.floor(r() * this.holders);
      const roll = r();
      const txSeed = (this.seed ^ Math.imul(sliceIndex, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35)) >>> 0;
      if (roll < 0.02) {
        out.push({ kind: "newHolder", at, wallet: pubkey(this.holders + sliceIndex * 3 + i), tx: sig(txSeed) });
        continue;
      }
      if (roll < 0.035) {
        out.push({ kind: "burn", at, amountTokens: 1000 + Math.floor(r() * 90_000), tx: sig(txSeed) });
        continue;
      }
      // a lognormal-ish size: most trades are small, a few are not, and one
      // in a few hundred is a whale big enough to raise a monument
      const u = r();
      const usd = u > 0.995 ? 900 + r() * 4200 : Math.exp(1.6 + r() * 2.9);
      out.push({
        kind: r() < bias ? "buy" : "sell",
        at,
        wallet: pubkey(who),
        amountUsd: Math.round(usd * 100) / 100,
        price,
        tx: sig(txSeed),
      });
    }
    return out.map((e) => normalise(e, "standin")).filter(Boolean);
  }
}

// ---- the real one ------------------------------------------------------------

// the shape the live adapter will have. it is here now, unimplemented on
// purpose, so that the seam it plugs into is the one that has actually been
// exercised — the stand-in and the real source answer the same question with
// the same signature, and swapping them is a line in openSource.
export class HttpSource {
  constructor(mint, endpoint, apiKey) {
    this.mint = mint;
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }
  get name() {
    return "http";
  }

  async fetchWindow(fromMs, toMs) {
    const url = new URL(this.endpoint);
    url.searchParams.set("mint", this.mint);
    url.searchParams.set("from", String(fromMs));
    url.searchParams.set("to", String(toMs));
    const res = await fetch(url, {
      headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
    });
    if (!res.ok) throw new Error(`source ${res.status}`);
    const body = await res.json();
    const rows = Array.isArray(body) ? body : (body.trades ?? body.data ?? []);
    // the mapping from a provider's row to the world's event is the ONLY
    // provider-specific code in the entire pipeline. everything downstream
    // of normalise() has never heard of whoever is serving this.
    return rows
      .map((t) =>
        normalise(
          {
            tx: t.signature ?? t.tx ?? t.txHash,
            kind: t.type === "buy" || t.isBuy ? "buy" : t.type === "sell" || t.isSell ? "sell" : t.type,
            at: typeof t.timestamp === "number" ? (t.timestamp < 2e10 ? t.timestamp * 1000 : t.timestamp) : Date.parse(t.time),
            wallet: t.owner ?? t.wallet ?? t.trader,
            amountUsd: t.usd ?? t.amountUsd ?? t.volumeUsd,
            amountTokens: t.tokens ?? t.amountTokens,
            price: t.price ?? t.priceUsd,
          },
          "chain"
        )
      )
      .filter(Boolean);
  }
}

export function openSource(env = process.env) {
  const mint = (env.KODO_MINT ?? env.CATHEDRAL_MINT) || STANDIN_MINT;
  if (env.MARKET_ENDPOINT && mint !== STANDIN_MINT) {
    return new HttpSource(mint, env.MARKET_ENDPOINT, env.MARKET_API_KEY);
  }
  return new StandInSource(mint);
}
