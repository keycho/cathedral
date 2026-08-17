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
import { TIMING, foldStart, foldTick } from "../src/market/law.js";

const PORT = Number(process.env.PORT ?? 8787);
const PASS_MS = Number(process.env.INDEX_INTERVAL_MS ?? 10_000);

// THE PORT IS BOUND BEFORE ANYTHING ELSE IS DECIDED, and "anything else"
// includes opening the store. this module used to bind at the bottom, so
// the listen waited on every top-level await above it — and one of those
// awaits is a chain backfill that replays the token's whole history. a
// host that healthchecks for five minutes gets nothing from a service
// that is still honestly reading the ledger, kills the deploy, and leaves
// no evidence of the difference between slow and dead.
//
// so: bind first, answer immediately, and tell the truth about what is
// still happening behind the answer. the state below is what /health and
// /status read; every stage updates it as it goes.
const boot = {
  phase: "binding", // binding → opening → founding → backfilling → live
  ready: false, // true only when the world is following the chain's head
  error: "",
  at: Date.now(),
  attempts: 0,
  progress: null, // {done, total, label} while a stage can count itself
};

let store = null;
let source = null;
let indexer = null;
let ticker = null;
let launch = null;
// the /snapshot fold, extended lazily as ticks close (see the route)
const fold = foldStart();

const server = createServer(async (req, res) => handle(req, res));
server.listen(PORT, "0.0.0.0", () =>
  console.log(`[market] listening on 0.0.0.0:${PORT} (PORT env ${process.env.PORT ?? "unset"}) — bound before boot`)
);

async function openEverything() {
  boot.phase = "opening";
  store = await openStore();
  source = openSource();
  indexer = new Indexer(store, source);
  ticker = new Ticker(store);
  console.log(`[market] store=${store.kind} source=${source.name} mint=${source.mint}`);
  if (source.mint === STANDIN_MINT) {
    // SAY IT OUT LOUD, EVERY START. a world quietly running on a placeholder
    // token while everyone assumes it is following a real one is the single
    // most misleading state this project could be in.
    console.log("[market] THIS IS A STAND-IN TOKEN. no chain is being read.");
  }
  // the source counts its own work; the boot reads it so a backfill can
  // report progress rather than merely take time. assigned unconditionally
  // — testing the hook first only ever tested whether it was already set,
  // which it never is, so the progress stayed null through every backfill.
  source.onProgress = (p) => {
    boot.progress = p;
  };
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

// THE BOOT RUNS BEHIND THE OPEN PORT, and narrates itself while it does.
// the phases are honest about which is which: opening the store, finding
// the founding transaction, replaying the ledger, and finally following
// the chain's head. only the last of those is "ready".
async function bootUp() {
  boot.attempts++;
  boot.error = "";
  boot.ready = false;
  try {
    if (!store) await openEverything();
    // THE WORLD'S TICK 1 IS THE TOKEN'S BIRTH. when the source can name the
    // launch — and reading the chain directly, it can — genesis is not a
    // configured guess but the block time of the transaction that created
    // the mint. the founding stone is that transaction, and it carries its
    // real signature into the world where anyone can check it.
    boot.phase = "founding";
    let born = genesisFromEnv(process.env.KODO_GENESIS ?? process.env.CATHEDRAL_GENESIS);
    if (source.genesis) {
      try {
        launch = await source.genesis();
        if (launch?.at) {
          born = launch.at;
          console.log(
            `[market] the founding stone is ${launch.signature} — ${launch.name || "the mint"} created ${new Date(launch.at).toISOString()}`
          );
        }
      } catch (e) {
        console.error(`[market] could not read the launch: ${e.message}`);
      }
    }
    const world = await indexer.ensureWorld(Date.now(), born);
    console.log(`[market] world founded ${new Date(world.genesisAt).toISOString()}`);
    boot.phase = "backfilling";
    await indexer.backfill(Date.now(), Math.max(60 * 60_000, Date.now() - world.genesisAt));
    await ticker.advance();
    // LIVE means the replay has caught the head and the beat is following
    // it, which is a different claim from "the process started".
    boot.phase = "live";
    boot.ready = true;
    boot.progress = null;
    boot.at = Date.now();
    console.log(`[market] caught up — following the chain at tick ${ticker.stats.lastN}`);
    return true;
  } catch (e) {
    boot.phase = "failed";
    boot.ready = false;
    boot.error = e.message;
    console.error(`[market] boot failed: ${e.message}`);
    // KEEP TRYING. the usual cause is a dependency that is not ready yet
    // rather than one that is wrong forever, and a service that retries is
    // one nobody has to redeploy by hand once the schema lands.
    setTimeout(() => void bootUp(), 15_000);
    return false;
  }
}

let running = false;
async function beat() {
  if (running || !boot.ready) return;
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

async function handle(req, res) {
  const url = new URL(req.url, "http://x");
  try {
    // THE WORLD IS SERVED FROM A DIFFERENT ORIGIN THAN THE LOG. every
    // answer already carries allow-origin *, which covers the plain GETs
    // the client makes; this answers the preflight too, so a future header
    // on one of those fetches cannot silently break the feed on the real
    // domain. the log is public and read-only over http — there is nothing
    // here that a narrower origin list would protect.
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      });
      return res.end();
    }
    if (url.pathname === "/health") {
      // A HEALTHCHECK IS A LIVENESS QUESTION, and the honest answer while
      // replaying the ledger is "yes, and working". a platform healthcheck
      // that reads 503 during a long backfill kills the deploy that was
      // about to succeed — so only a FAILED boot answers unhealthy.
      //
      // READY IS A SEPARATE CLAIM from healthy, and it is the one that
      // matters to the world: it means the replay has caught the chain's
      // head and the beat is following it. a client can be trusted with
      // the difference — "the world is catching up" is true, on-register,
      // and better than a blank screen or a lie.
      return json(res, boot.phase === "failed" ? 503 : 200, {
        ok: boot.phase !== "failed",
        ready: boot.ready,
        phase: boot.phase,
        progress: boot.progress,
        bootError: boot.error,
        bootAttempts: boot.attempts,
        uptimeS: Math.round(process.uptime()),
        store: store?.kind ?? null,
        source: source?.name ?? null,
        standIn: source ? source.mint === STANDIN_MINT : null,
        indexer: indexer?.stats ?? null,
        ticker: ticker?.stats ?? null,
      });
    }
    // EVERY OTHER ROUTE READS THE STORE, and the store opens behind the
    // port. a request that arrives in that window gets an answer saying so
    // rather than a stack trace: the phase is the whole explanation, and a
    // client that polls will simply find the world a moment later.
    if (!store) {
      return json(res, 503, {
        ready: false,
        phase: boot.phase,
        error: boot.error || "the world is still opening",
      });
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
        // the world may still be reading its own past. the client polls
        // this already, so it learns here whether what it is following is
        // the head or a replay still in progress — and can say so.
        ready: boot.ready,
        phase: boot.phase,
        tradesHonoured: source.stats?.eventsSeen ?? null,
        // the founding stone, so the world can plaque it with the real
        // signature rather than with a story about one
        launch: launch
          ? {
              signature: launch.signature,
              at: launch.at,
              slot: launch.slot,
              name: launch.name,
              symbol: launch.symbol,
              creator: launch.creator,
              bondingCurve: launch.bondingCurve,
            }
          : null,
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
    // THE SNAPSHOT: the whole log folded into where the world has got to,
    // so an old world does not make every fresh browser replay from tick 1.
    // the fold is kept in memory and extended incrementally — each request
    // costs only the ticks closed since the last one — and it survives
    // nothing: a restarted service refolds from the store, and lands on the
    // same answer, because the fold is pure arithmetic on the log.
    if (url.pathname === "/snapshot") {
      const w = (await store.world()) ?? {};
      const last = w.lastTick ?? 0;
      while (fold.atTick < last) {
        const batch = await store.ticksFrom(fold.atTick + 1, 1000);
        if (!batch.length) break;
        for (const t of batch) foldTick(fold, t);
        if (batch.length < 1000) break;
      }
      // the wire caps the wallet list: the big holders keep their names,
      // the long tail is folded into one honest remainder entry so the
      // total mass still adds up on the other side.
      const entries = Object.entries(fold.wallets).sort((a, b) => b[1].blocks - a[1].blocks);
      const wallets = {};
      let rest = { buyUsd: 0, blocks: 0 };
      for (let i = 0; i < entries.length; i++) {
        if (i < 512) wallets[entries[i][0]] = entries[i][1];
        else {
          rest.buyUsd += entries[i][1].buyUsd;
          rest.blocks += entries[i][1].blocks;
        }
      }
      if (rest.blocks > 0 || rest.buyUsd > 0) wallets["kodo:rest"] = rest;
      // THE CREW IS FUNDED BY TRAILING VOLUME, so a seeded world needs the
      // recent ticks as well as the mass. the fold jumps the clock to its
      // own tick and leaves the history empty behind it — which left the
      // architect reading a budget of zero and reporting "the market is
      // quiet" on a token doing real volume. these are for the aggregates
      // only; the mass they would accrete is already in the fold.
      const recentTicks = await store.ticksFrom(Math.max(1, fold.atTick - 60), 60);
      return json(res, 200, {
        genesisAt: w.genesisAt ?? null,
        mint: w.mint ?? source.mint,
        standIn: (w.mint ?? source.mint) === STANDIN_MINT,
        atTick: fold.atTick,
        ticksSeen: fold.ticksSeen,
        negativeRun: fold.negativeRun,
        subsides: fold.subsides,
        netFlowUsd: fold.netFlowUsd,
        grossVolumeUsd: fold.grossVolumeUsd,
        blocksAccreted: fold.blocksAccreted,
        blocksEroded: fold.blocksEroded,
        standing: fold.standing,
        recentTicks,
        walletsTotal: entries.length,
        wallets,
      });
    }
    // THE PROOF, IN PUBLIC. anyone can ask this service to show its work:
    // the last N trades it indexed, each re-derived from the transaction's
    // own balance movements — a reading no program authored — and compared
    // against the program event it was indexed from. two independent
    // readings of the same on-chain bytes agreeing is what matching the
    // explorer means, and every signature here is checkable by hand.
    if (url.pathname === "/status") {
      const n = Math.min(50, Math.max(1, Number(url.searchParams.get("n") ?? 10)));
      const w = (await store.world()) ?? {};
      const recent = await store.ticksFrom(Math.max(1, (w.lastTick ?? 0) - 3), 4);
      // WHERE THE REPLAY HAS GOT TO, against where the chain actually is.
      // "tick 40" means nothing on its own; "tick 40 of 118" is the whole
      // answer to whether this world is behind and by how much.
      const tickMs = TIMING.tickMs;
      const head =
        w.genesisAt != null ? Math.floor((Date.now() - w.genesisAt) / tickMs) + 1 : null;
      const at = w.lastTick ?? 0;
      const out = {
        world: {
          mint: w.mint ?? source.mint,
          standIn: (w.mint ?? source.mint) === STANDIN_MINT,
          genesisAt: w.genesisAt ?? null,
          lastTick: at,
          store: store.kind,
          source: source.name,
          uptimeS: Math.round(process.uptime()),
        },
        catchUp: {
          ready: boot.ready,
          phase: boot.phase,
          progress: boot.progress,
          tick: at,
          chainHeadTick: head,
          ticksBehind: head === null ? null : Math.max(0, head - at),
          tradesHonoured: source.stats?.eventsSeen ?? null,
        },
        launch,
        indexer: indexer.stats,
        ticker: ticker.stats,
        sourceStats: source.stats ?? null,
        recentTicks: recent.map((t) => ({
          n: t.n,
          netFlowUsd: t.netFlowUsd,
          grossVolumeUsd: t.grossVolumeUsd,
          uniqueWallets: t.uniqueWallets,
        })),
        verification: null,
      };
      if (source.verify && store.recentEventTxs) {
        const txs = await store.recentEventTxs(n);
        const rows = await source.verify(txs);
        out.verification = {
          checked: rows.length,
          matched: rows.filter((r) => r.ok).length,
          method: "program event vs transaction balance deltas, independently derived",
          rows,
        };
      }
      return json(res, 200, out);
    }
    if (url.pathname === "/audit") {
      const from = Math.max(1, Number(url.searchParams.get("from") ?? 1));
      const fix = url.searchParams.get("repair") === "1";
      const out = fix ? await repair(store, ticker, { from }) : await audit(store, { from });
      // a repair can re-close a past tick with different numbers, which
      // stales the memoized snapshot fold; refold from the top next ask
      if (fix) Object.assign(fold, foldStart());
      return json(res, 200, out);
    }
    json(res, 404, { error: "no such route" });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}

// the boot runs behind the already-open port
void bootUp();
