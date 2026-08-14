// cathedral - THE MARKET'S LAW, in one file, in plain javascript, because
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
