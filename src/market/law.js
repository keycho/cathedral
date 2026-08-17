// kodo - THE MARKET'S LAW, in one file, in plain javascript, because
// two things now have to obey it: the browser that draws the world and the
// server that decides what the world is.
//
// this is deliberately NOT typescript and deliberately not inside the vite
// app's type graph. the client imports it through a sibling declaration file
// and the node service imports the same bytes off disk. every other way of
// sharing this — a copy in the server, a build step, a published package —
// ends with the two sides disagreeing about what a tick is, and a world
// where the server and the browser disagree about a tick is a world with two
// different histories.
//
// nothing in here touches a clock, a network or a database. it is pure: the
// same events in the same window always produce the same summary, on either
// side, forever. that property is what makes reconciliation possible at all.

// ---- timing ------------------------------------------------------------------

// the constitution's cadence. src/rules.ts imports these rather than
// restating them, so there is one copy of the number that decides what a
// tick is.
export const TIMING = {
  tickMs: 30_000,
  ticksPerEpoch: 20,
};

// which tick a moment belongs to. tick numbers are 1-based and derived from
// wall time against the world's genesis, NOT counted up from whenever a
// process happened to start — a server that restarts must land on the same
// tick number as the one that died, and a browser opened an hour later must
// agree with both.
export function tickAt(tsMs, genesisMs, tickMs = TIMING.tickMs) {
  if (!Number.isFinite(tsMs) || !Number.isFinite(genesisMs)) return 0;
  return Math.floor((tsMs - genesisMs) / tickMs) + 1;
}
export function tickWindow(n, genesisMs, tickMs = TIMING.tickMs) {
  return { from: genesisMs + (n - 1) * tickMs, to: genesisMs + n * tickMs };
}
export function epochOf(tick, ticksPerEpoch = TIMING.ticksPerEpoch) {
  return Math.floor(tick / ticksPerEpoch);
}

// ---- the canonical event -----------------------------------------------------

// EVERY EVENT IS IDENTIFIED BY ITS TRANSACTION. a chain hands the same trade
// back more than once — a poll window overlaps, a reorg replays, a retry
// double-posts — and the only defence that actually works is that the log is
// keyed on something the chain minted. this is why the synthetic feed has
// carried a tx on every event since phase 1: so that when the real one
// arrived, nothing downstream had to change.
export const KINDS = ["buy", "sell", "burn", "newHolder"];

// turn whatever a source hands back into the one shape the world eats. a
// source adapter's ONLY job is to fill this in; everything after it is
// source-agnostic.
export function normalise(raw, source = "unknown") {
  if (!raw || typeof raw !== "object") return null;
  const kind = String(raw.kind ?? "");
  if (!KINDS.includes(kind)) return null;
  const tx = String(raw.tx ?? "").trim();
  if (!tx) return null; // an event without a transaction cannot be deduped
  const at = Number(raw.at);
  if (!Number.isFinite(at)) return null;
  const ev = {
    tx,
    kind,
    at,
    source,
    wallet: raw.wallet === undefined || raw.wallet === null ? null : String(raw.wallet),
    amountUsd: Number.isFinite(Number(raw.amountUsd)) ? Number(raw.amountUsd) : 0,
    amountTokens: Number.isFinite(Number(raw.amountTokens)) ? Number(raw.amountTokens) : 0,
    price: Number.isFinite(Number(raw.price)) ? Number(raw.price) : 0,
  };
  // a swap with no money in it is noise, and it would count toward the
  // unique-wallet number while contributing nothing to the flow
  if ((ev.kind === "buy" || ev.kind === "sell") && !(ev.amountUsd > 0)) return null;
  if (ev.kind === "burn" && !(ev.amountTokens > 0)) return null;
  return ev;
}

// ---- aggregation -------------------------------------------------------------

// THE RULES ARE APPLIED TO THE SUMMARY, NOT TO THE EVENTS. this is the
// constitution's own wording and it is the reason the world can be rebuilt
// from a hundred rows instead of a million: a tick is the unit of history.
//
// buys and sells come back as plain objects rather than Maps because this
// crosses a wire. the client turns them back into Maps at the seam.
export function aggregate(events, n, closePrice = 0) {
  let net = 0;
  let gross = 0;
  let largest = 0;
  const wallets = new Set();
  const buys = {};
  const sells = {};
  for (const ev of events) {
    if (ev.kind !== "buy" && ev.kind !== "sell") continue;
    const usd = ev.amountUsd;
    net += ev.kind === "buy" ? usd : -usd;
    gross += usd;
    if (usd > largest) largest = usd;
    const w = ev.wallet ?? "?";
    wallets.add(w);
    const side = ev.kind === "buy" ? buys : sells;
    side[w] = (side[w] ?? 0) + usd;
  }
  return {
    n,
    netFlowUsd: round2(net),
    grossVolumeUsd: round2(gross),
    uniqueWallets: wallets.size,
    largestTxUsd: round2(largest),
    close: closePrice,
    buys,
    sells,
  };
}

function round2(v) {
  // the wire and the database both round; if the summary did not, a
  // recomputed tick would differ from a stored one in the fourteenth decimal
  // and reconciliation would report drift on every row it checked.
  return Math.round(v * 100) / 100;
}

// ---- reconciliation ----------------------------------------------------------

// A CHECKSUM OVER THE SEQUENCE, not over the world. the world is a quarter
// of a million voxels and hashing it would answer a question nobody asked;
// what has to match is the HISTORY, because the world is a pure function of
// it. if two parties agree on every tick summary in order, they will agree
// on every block, and if they disagree this says at which tick.
//
// fnv-1a over the fields the rules actually read. anything the rules ignore
// is deliberately not in here — a differing close price on a tick nobody
// built from is not drift.
export function tickDigest(t) {
  const s = [
    t.n,
    t.netFlowUsd.toFixed(2),
    t.grossVolumeUsd.toFixed(2),
    t.uniqueWallets,
    t.largestTxUsd.toFixed(2),
  ].join("|");
  return fnv1a(s);
}

export function chainDigest(ticks) {
  let h = 0x811c9dc5;
  for (const t of ticks) h = mix(h, tickDigest(t));
  return hex(h);
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function mix(a, b) {
  let h = (a ^ b) >>> 0;
  h = Math.imul(h, 0x01000193) >>> 0;
  return h >>> 0;
}
function hex(h) {
  return (h >>> 0).toString(16).padStart(8, "0");
}

// compare two tick sequences and say WHERE they diverge rather than whether.
// a boolean answer to "does the client match the server" is useless: the
// repair is to replay from the first bad tick, so that number is the whole
// output.
export function reconcile(mine, theirs) {
  const byN = new Map();
  for (const t of theirs) byN.set(t.n, t);
  const missing = [];
  let firstBad = null;
  let checked = 0;
  for (const t of mine) {
    const other = byN.get(t.n);
    if (!other) { missing.push(t.n); continue; }
    checked++;
    if (tickDigest(t) !== tickDigest(other)) {
      if (firstBad === null) firstBad = t.n;
    }
    byN.delete(t.n);
  }
  const extra = [...byN.keys()].sort((a, b) => a - b);
  return {
    ok: firstBad === null && missing.length === 0 && extra.length === 0,
    checked,
    firstBad,
    missing,
    extra,
    mineDigest: chainDigest(mine),
    theirsDigest: chainDigest(theirs),
  };
}

// GAPS ARE NOT DRIFT, and telling them apart matters: a missing tick means
// the indexer was down for that window and the log can be backfilled, while
// a differing tick means two parties computed different answers from the
// same events and something is actually wrong.
export function findGaps(ticks) {
  const ns = ticks.map((t) => t.n).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < ns.length; i++) {
    if (ns[i] === ns[i - 1]) continue;
    for (let k = ns[i - 1] + 1; k < ns[i]; k++) gaps.push(k);
  }
  return gaps;
}

// ---- the snapshot fold -------------------------------------------------
//
// AN OLD WORLD MUST NOT MAKE EVERY FRESH BROWSER REPLAY THE WHOLE LOG. the
// client pulls ticks from 1 and applies them in batches, which is correct
// and gets slower every day the world ages. but r1 and r2 are arithmetic on
// the rule-visible fields, so the server can run the same sums the browser
// would — cumulative per-wallet blocks, the clock, the negative run — and
// hand the result over in one call, with replay kept for the tail. the fold
// lives in the law because both sides have to agree on what the sums are.
//
// what the fold carries is the GEOLOGY: how many blocks each wallet's
// buying has accreted, net of what selling eroded. it does not carry the
// voxel field itself — the browser is the only party that holds one — so a
// seeded world regrows its architecture from the seeded mass forward
// rather than reconstructing every past epoch's works stone by stone.

// mirrors RULES.usdPerBlock in src/rules.ts, frozen at genesis
export const USD_PER_BLOCK = 50;
// mirrors RULES.subsidenceTicks
export const SUBSIDENCE_TICKS = 12;

export function foldStart() {
  return {
    atTick: 0, // last tick folded in
    ticksSeen: 0, // how many ticks actually contributed (gaps excluded)
    negativeRun: 0, // consecutive negative ticks at atTick (r2b state)
    subsides: 0, // how many times the run reached the subsidence threshold
    netFlowUsd: 0,
    grossVolumeUsd: 0,
    blocksAccreted: 0, // r1 total
    blocksEroded: 0, // r2 total
    wallets: {}, // pubkey -> { buyUsd, blocks }
  };
}

// apply one wire tick to the fold, in ascending n order. mutates and
// returns the fold so a server can keep one and extend it incrementally.
export function foldTick(f, t) {
  if (t.n <= f.atTick) return f; // the wire repeats itself
  f.atTick = t.n;
  f.ticksSeen++;
  f.netFlowUsd = round2(f.netFlowUsd + t.netFlowUsd);
  f.grossVolumeUsd = round2(f.grossVolumeUsd + t.grossVolumeUsd);
  if (t.netFlowUsd < 0) {
    f.negativeRun++;
    f.blocksEroded += Math.floor(-t.netFlowUsd / USD_PER_BLOCK);
  } else {
    f.negativeRun = 0;
  }
  if (f.negativeRun >= SUBSIDENCE_TICKS) {
    // r2b: the run restarts after the mass settles, same as the engine
    f.negativeRun = 0;
    f.subsides++;
  }
  for (const [w, usd] of Object.entries(t.buys ?? {})) {
    const cur = f.wallets[w] ?? (f.wallets[w] = { buyUsd: 0, blocks: 0 });
    cur.buyUsd = round2(cur.buyUsd + usd);
  }
  if (t.netFlowUsd > 0) {
    const n = Math.floor(t.netFlowUsd / USD_PER_BLOCK);
    f.blocksAccreted += n;
    for (const [w, count] of distributeUsd(n, t.buys ?? {})) {
      f.wallets[w].blocks += count;
    }
  }
  return f;
}

// r1's attribution over the wire shape: n blocks across buying wallets
// proportional to usd, largest remainder. mirrors distributeBlocks in
// src/ticks.ts, which works on hashed wallet ids; this one keeps the
// pubkeys because the fold crosses the wire. ties break on the key so the
// answer is the same whoever runs it.
export function distributeUsd(n, buys) {
  const out = new Map();
  const entries = Object.entries(buys);
  if (n <= 0 || !entries.length) return out;
  let total = 0;
  for (const [, usd] of entries) total += usd;
  if (total <= 0) return out;
  const shares = [];
  let assigned = 0;
  for (const [w, usd] of entries) {
    const exact = (n * usd) / total;
    const whole = Math.floor(exact);
    shares.push({ w, whole, frac: exact - whole });
    assigned += whole;
  }
  shares.sort((a, b) => b.frac - a.frac || (a.w < b.w ? -1 : 1));
  for (let i = 0; i < shares.length && assigned < n; i++) {
    shares[i].whole++;
    assigned++;
  }
  for (const s of shares) if (s.whole > 0) out.set(s.w, s.whole);
  return out;
}
