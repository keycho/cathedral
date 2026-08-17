// kodo - the market service. it runs the indexer on a timer, closes
// ticks off the log, and serves the history to whoever is drawing the world.
//
// it is a plain node http server with no framework because it has four
// routes, and it holds no state of its own: everything it answers with comes
// out of the store, so two of these behind a load balancer cannot disagree.

import { createServer } from "node:http";
import { Indexer } from "./indexer.js";
import { Ticker } from "./ticker.js";
import { audit, repair } from "./reconcile.js";
import { openSource, STANDIN_MINT } from "./source.js";
import { openStore } from "./store.js";
import { TIMING } from "../src/market/law.js";

const PORT = Number(process.env.PORT ?? 8787);
const PASS_MS = Number(process.env.INDEX_INTERVAL_MS ?? 10_000);

const store = await openStore();
const source = openSource();
const indexer = new Indexer(store, source);
const ticker = new Ticker(store);

console.log(`[market] store=${store.kind} source=${source.name} mint=${source.mint}`);
if (source.mint === STANDIN_MINT) {
  // SAY IT OUT LOUD, EVERY START. a world quietly running on a placeholder
  // token while everyone assumes it is following a real one is the single
  // most misleading state this project could be in.
  console.log("[market] THIS IS A STAND-IN TOKEN. no chain is being read.");
}

// when the world is founded. KODO_GENESIS accepts an iso timestamp, a
// millisecond epoch, or a relative "-90m" meaning ninety minutes ago — the
// last of which is how a stand-in world is given a past to be looked at.
function genesisFromEnv(v) {
  if (!v) return null;
  const rel = /^-(\d+)([smhd])$/.exec(v.trim());
  if (rel) {
    const mult = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 }[rel[2]];
    return Date.now() - Number(rel[1]) * mult;
  }
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e12) return n;
  const p = Date.parse(v);
  return Number.isFinite(p) ? p : null;
}

const born = genesisFromEnv(process.env.KODO_GENESIS ?? process.env.CATHEDRAL_GENESIS);
const world = await indexer.ensureWorld(Date.now(), born);
console.log(`[market] world founded ${new Date(world.genesisAt).toISOString()}`);
await indexer.backfill(Date.now(), Math.max(60 * 60_000, Date.now() - world.genesisAt));
await ticker.advance();

let running = false;
async function beat() {
  if (running) return;
  running = true;
  try {
    const p = await indexer.pass();
    const closed = await ticker.advance();
    if (closed.length) {
      const last = closed[closed.length - 1];
      console.log(
        `[market] +${p.inserted} events (${p.duplicates} dup) · closed ${closed.length} tick(s) to #${last.n} · net $${last.netFlowUsd} gross $${last.grossVolumeUsd}`
      );
    }
  } catch (e) {
    // A PASS THAT THROWS MUST NOT STOP THE CLOCK. the source is a network
    // call and networks fail; the next pass re-reads an overlapping window,
    // so a failure costs nothing but the time until the next beat.
    console.error("[market] pass failed:", e.message);
  } finally {
    running = false;
  }
}
setInterval(beat, PASS_MS);

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    // the world is public and cacheable for less than a tick: a client that
    // polls harder than the clock moves is asking for the same answer
    "cache-control": "public, max-age=5",
    "access-control-allow-origin": "*",
  });
  res.end(s);
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/health") {
      return json(res, 200, { ok: true, store: store.kind, source: source.name, indexer: indexer.stats, ticker: ticker.stats });
    }
    // WHAT THE WORLD IS, in one call: enough for a fresh browser to know
    // which tick it is and where to start replaying from.
    if (url.pathname === "/state") {
      const w = (await store.world()) ?? {};
      return json(res, 200, {
        genesisAt: w.genesisAt ?? null,
        mint: w.mint ?? source.mint,
        standIn: (w.mint ?? source.mint) === STANDIN_MINT,
        lastTick: w.lastTick ?? 0,
        negativeRun: w.negativeRun ?? 0,
        tickMs: TIMING.tickMs,
        ticksPerEpoch: TIMING.ticksPerEpoch,
      });
    }
    // THE HISTORY, from a tick the client names. this is the whole
    // reconciliation protocol on the wire: the client says how far it has
    // got, the server hands back everything after it, and the client
    // compares digests rather than trusting the sequence.
    if (url.pathname === "/ticks") {
      const since = Math.max(1, Number(url.searchParams.get("since") ?? 1));
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));
      const ticks = await store.ticksFrom(since, limit);
      return json(res, 200, { since, count: ticks.length, ticks });
    }
    if (url.pathname === "/audit") {
      const from = Math.max(1, Number(url.searchParams.get("from") ?? 1));
      const fix = url.searchParams.get("repair") === "1";
      const out = fix ? await repair(store, ticker, { from }) : await audit(store, { from });
      return json(res, 200, out);
    }
    json(res, 404, { error: "no such route" });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}).listen(PORT, () => console.log(`[market] listening on :${PORT}`));
