// kodo - the indexer. it pulls windows of trades from a source,
// normalises them into the world's one event shape, and writes them to the
// log. that is all it does, and the restraint is the design: an indexer that
// also decides what the world does is an indexer you cannot re-run.
//
// TWO PROPERTIES, and everything here exists to hold them:
//
//   IDEMPOTENT   running it twice over the same window writes the same log.
//                the transaction id is the primary key and the insert is a
//                conflict-ignore, so a re-run is free rather than doubling
//                the world's money.
//
//   LOSSLESS     the window it asks for OVERLAPS the one before it. a
//                pointer that only moves forward loses whatever landed late
//                or arrived out of order, and a chain does both. the overlap
//                costs a few duplicate rows that the primary key eats, and
//                buys back the events that a strictly-forward cursor drops
//                on the floor without ever telling you.

import { tickAt, TIMING } from "../src/market/law.js";

// how far back each pass re-reads. a minute of overlap covers a source that
// reports a trade late, a clock that is a little out, and a restart that
// happens mid-window.
const OVERLAP_MS = 60_000;
// and how far back a cold start reaches, so a world that has been down for a
// while catches up rather than pretending the gap did not happen
const COLD_START_MS = 15 * 60_000;

export class Indexer {
  constructor(store, source, opts = {}) {
    this.store = store;
    this.source = source;
    this.overlapMs = opts.overlapMs ?? OVERLAP_MS;
    this.coldStartMs = opts.coldStartMs ?? COLD_START_MS;
    this.stats = { passes: 0, fetched: 0, inserted: 0, duplicates: 0, lastAt: 0 };
  }

  // THE WORLD HAS TO BE BORN BEFORE IT CAN TICK. genesis is written once and
  // never again: every tick number in the world's history is measured from
  // it, so moving it would renumber the past.
  async ensureWorld(nowMs, genesisOverride = null) {
    let w = await this.store.world();
    if (w?.genesisAt) return w;
    // A WORLD CAN BE BORN BEFORE THE PROCESS THAT INDEXES IT. pointing this
    // at a token that already has a history and starting genesis at "now"
    // would throw that history away — the world would begin at the moment a
    // server happened to boot, which is a fact about the server. an explicit
    // genesis is how a world is founded at the token's launch instead.
    //
    // it is snapped to a tick boundary either way, so tick 1 begins on a
    // round number.
    const born = Number.isFinite(genesisOverride) ? genesisOverride : nowMs;
    const genesisAt = Math.floor(born / TIMING.tickMs) * TIMING.tickMs;
    w = await this.store.putWorld({
      genesisAt,
      mint: this.source.mint,
      lastTick: 0,
      negativeRun: 0,
      chainDigest: "",
    });
    return w;
  }

  // one pass: read a window, write what is new. the window's END is held
  // back by one tick length, because the source cannot be trusted to have
  // finished reporting the moment that just happened — and a tick closed
  // over a half-reported window is a tick that will never agree with a
  // recompute.
  async pass(nowMs = Date.now()) {
    const w = await this.ensureWorld(nowMs);
    const settled = nowMs - TIMING.tickMs;
    const from = Math.max(w.genesisAt, (this.stats.lastAt || nowMs - this.coldStartMs) - this.overlapMs);
    const to = settled;
    if (to <= from) return { from, to, fetched: 0, inserted: 0 };

    const raw = await this.source.fetchWindow(from, to);
    const events = raw.filter((e) => e && e.at >= w.genesisAt);
    const inserted = await this.store.putEvents(events);

    this.stats.passes++;
    this.stats.fetched += events.length;
    this.stats.inserted += inserted;
    this.stats.duplicates += events.length - inserted;
    this.stats.lastAt = to;
    return {
      from,
      to,
      fetched: events.length,
      inserted,
      duplicates: events.length - inserted,
      tickAtEnd: tickAt(to, w.genesisAt),
    };
  }

  // catch a cold or lapsed world up to now, one window at a time rather than
  // in one enormous query
  async backfill(nowMs = Date.now(), spanMs = 60 * 60_000) {
    const w = await this.ensureWorld(nowMs);
    const start = Math.max(w.genesisAt, nowMs - spanMs);
    const step = 5 * TIMING.tickMs;
    let inserted = 0;
    let fetched = 0;
    for (let t = start; t < nowMs - TIMING.tickMs; t += step) {
      const to = Math.min(t + step, nowMs - TIMING.tickMs);
      const raw = await this.source.fetchWindow(t, to);
      const events = raw.filter((e) => e && e.at >= w.genesisAt);
      fetched += events.length;
      inserted += await this.store.putEvents(events);
    }
    this.stats.lastAt = nowMs - TIMING.tickMs;
    return { from: start, to: nowMs - TIMING.tickMs, fetched, inserted };
  }
}
