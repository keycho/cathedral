// kodo - the clock, moved to the server.
//
// in phase 1 every browser ran its own tick engine over its own synthetic
// feed, which meant every visitor was looking at a different world and
// nobody could be wrong about it. that is fine for a world nobody shares. it
// is not fine for a world grown by a real market: two people watching the
// same token have to see the same hall go up, and the only way that happens
// is if there is exactly one clock and it is not in a browser.
//
// THE TICKER CLOSES WINDOWS, IT DOES NOT LISTEN. the phase-1 engine
// accumulated events as they arrived and closed on a timer, which works
// exactly until the process restarts — then the accumulator is empty and the
// tick it was halfway through is lost forever. this one derives every tick
// from the LOG: tick n is whatever is in the log between two timestamps, so
// a restart recomputes it, a late event corrects it, and running the ticker
// twice produces the same answer.

import { aggregate, epochOf, tickAt, tickDigest, tickWindow, TIMING } from "../src/market/law.js";

export class Ticker {
  constructor(store, opts = {}) {
    this.store = store;
    this.tickMs = opts.tickMs ?? TIMING.tickMs;
    // how far behind the wall clock a tick has to be before it is closed.
    // one tick of grace: the indexer's own window stops a tick short of now,
    // so closing right on the boundary would close over events that have not
    // been written yet.
    this.graceMs = opts.graceMs ?? this.tickMs;
    this.stats = { closed: 0, reclosed: 0, lastN: 0 };
  }

  // close every tick that is fully settled and not yet closed. returns the
  // summaries it wrote, oldest first.
  async advance(nowMs = Date.now()) {
    const w = await this.store.world();
    if (!w?.genesisAt) return [];
    const newest = tickAt(nowMs - this.graceMs, w.genesisAt, this.tickMs) - 1;
    if (newest < 1) return [];

    const out = [];
    let negativeRun = w.negativeRun ?? 0;
    for (let n = (w.lastTick ?? 0) + 1; n <= newest; n++) {
      const summary = await this.closeTick(n, w.genesisAt);
      // the subsidence run is the one piece of state a tick cannot be
      // computed from alone, so it is carried and persisted. it is also why
      // ticks must be closed IN ORDER: closing 7 before 6 would count the
      // run wrong and the mass would settle on the wrong tick.
      if (summary.netFlowUsd < 0) negativeRun++;
      else negativeRun = 0;
      out.push(summary);
      this.stats.closed++;
      this.stats.lastN = n;
    }
    if (out.length) {
      await this.store.putWorld({ lastTick: newest, negativeRun });
    }
    return out;
  }

  // one tick, computed from the log. this is a pure read plus a write: call
  // it again and it writes the same row.
  async closeTick(n, genesisAt) {
    const { from, to } = tickWindow(n, genesisAt, this.tickMs);
    const events = await this.store.eventsBetween(from, to);
    // the closing price is the last price any trade in the window carried.
    // taking it from the source's own quote rather than from a walk we
    // maintain means a restart cannot lose it.
    let close = 0;
    for (const e of events) if (e.price > 0) close = e.price;

    const tick = aggregate(events, n, close);
    const wallets = {};
    for (const [w, usd] of Object.entries(tick.buys)) (wallets[w] ??= { buy: 0, sell: 0 }).buy = usd;
    for (const [w, usd] of Object.entries(tick.sells)) (wallets[w] ??= { buy: 0, sell: 0 }).sell = usd;

    await this.store.putTick(tick, wallets, {
      epoch: epochOf(n),
      from,
      to,
      digest: String(tickDigest(tick)),
      eventCount: events.length,
    });
    await this.store.markTicked(events.map((e) => e.tx), n);
    return tick;
  }

  // RE-CLOSE A RANGE. this is the repair, and it is why the ticker derives
  // rather than accumulates: if a late trade lands inside a window that was
  // already closed, the tick is simply computed again from the log and the
  // corrected row replaces the old one. an accumulating engine has no way to
  // do this at all — the events it summed are gone.
  async reclose(fromN, toN) {
    const w = await this.store.world();
    if (!w?.genesisAt) return [];
    const out = [];
    for (let n = fromN; n <= toN; n++) {
      out.push(await this.closeTick(n, w.genesisAt));
      this.stats.reclosed++;
    }
    return out;
  }
}
