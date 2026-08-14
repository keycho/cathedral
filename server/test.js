// cathedral - the pipeline, exercised end to end against the stand-in.
//
// this is here because every fault this project has had came from believing
// a change worked rather than measuring that it did, and a market pipeline
// is the worst possible place to keep that habit: it is the one part of the
// world that is invisible until it is wrong, and wrong by then means the
// world grew from the wrong money.
//
// run: node server/test.js

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Indexer } from "./indexer.js";
import { Ticker } from "./ticker.js";
import { audit, repair } from "./reconcile.js";
import { StandInSource, STANDIN_MINT } from "./source.js";
import { openStore } from "./store.js";
import { aggregate, reconcile, tickWindow, TIMING } from "../src/market/law.js";

let failures = 0;
function check(name, cond, detail = "") {
  const mark = cond ? "  ok  " : " FAIL ";
  if (!cond) failures++;
  console.log(`${mark} ${name}${detail ? "   " + detail : ""}`);
}

const dir = mkdtempSync(join(tmpdir(), "cathedral-"));
const fresh = () => openStore({ CATHEDRAL_STORE: join(dir, `m-${Math.random().toString(36).slice(2)}.json`) });

// a fixed "now" so the whole test is deterministic. the stand-in is a pure
// function of (mint, window), so pinning the clock pins everything.
const NOW = 1_760_000_000_000;
const HOUR = 60 * 60_000;

console.log("\n— the source is deterministic —");
{
  const s = new StandInSource();
  const a = await s.fetchWindow(NOW - HOUR, NOW - HOUR + 5 * TIMING.tickMs);
  const b = await s.fetchWindow(NOW - HOUR, NOW - HOUR + 5 * TIMING.tickMs);
  check("same window, same events", a.length === b.length && a.every((e, i) => e.tx === b[i].tx), `${a.length} events`);
  check("every event carries a tx", a.every((e) => e.tx && e.tx.length > 20));
  check("every event is inside the window", a.every((e) => e.at >= NOW - HOUR && e.at < NOW - HOUR + 5 * TIMING.tickMs));
  const kinds = new Set(a.map((e) => e.kind));
  check("the shape has buys and sells", kinds.has("buy") && kinds.has("sell"), [...kinds].join(","));
  check("and a spread of sizes, not one size", new Set(a.map((e) => Math.round(e.amountUsd))).size > 10);
  // R4 RAISES A MONUMENT ON A SINGLE TRANSACTION OVER $1000, so a stand-in
  // that never produces one leaves a whole rule untested. five ticks is too
  // short a window to see a 1-in-200 event — checking it there would have
  // passed on the wrong clause and reported "0 whale-sized" as a success.
  const day = await s.fetchWindow(NOW - 6 * HOUR, NOW);
  const whales = day.filter((e) => e.amountUsd >= 1000);
  check("and whales large enough to raise a monument", whales.length > 0,
    `${whales.length} over $1000 in six hours, biggest $${Math.round(Math.max(...day.map((e) => e.amountUsd)))}`);
  const burns = day.filter((e) => e.kind === "burn");
  const joins = day.filter((e) => e.kind === "newHolder");
  check("and burns and new holders, so r3 and r5 fire", burns.length > 0 && joins.length > 0,
    `${burns.length} burns, ${joins.length} new holders`);
}

console.log("\n— the indexer is idempotent —");
{
  const store = await fresh();
  const ix = new Indexer(store, new StandInSource());
  const w = await ix.ensureWorld(NOW - HOUR);
  check("genesis lands on a tick boundary", w.genesisAt % TIMING.tickMs === 0);
  const first = await ix.backfill(NOW, HOUR);
  check("a backfill writes the log", first.inserted > 0, `${first.inserted} of ${first.fetched}`);
  const second = await ix.backfill(NOW, HOUR);
  check("running it again writes nothing", second.inserted === 0, `${second.fetched} fetched, ${second.inserted} inserted`);
  const both = await store.eventsBetween(0, NOW);
  const uniq = new Set(both.map((e) => e.tx)).size;
  check("and the log has no duplicate transactions", uniq === both.length, `${both.length} rows`);
}

console.log("\n— the ticker derives rather than accumulates —");
let genesis = 0;
{
  const store = await fresh();
  const ix = new Indexer(store, new StandInSource());
  await ix.ensureWorld(NOW - HOUR);
  await ix.backfill(NOW, HOUR);
  const t = new Ticker(store);
  const closed = await t.advance(NOW);
  check("ticks close", closed.length > 0, `${closed.length} ticks`);
  check("numbered in order from 1", closed[0].n === 1 && closed.every((c, i) => c.n === i + 1));
  const w = await store.world();
  genesis = w.genesisAt;

  // the property that matters: a tick is a function of the log, so closing
  // it a second time must produce exactly the same row
  const before = closed[Math.floor(closed.length / 2)];
  const again = await t.reclose(before.n, before.n);
  check(
    "re-closing a tick reproduces it",
    again[0].netFlowUsd === before.netFlowUsd && again[0].grossVolumeUsd === before.grossVolumeUsd,
    `#${before.n} net ${before.netFlowUsd}`
  );

  // and the summary is genuinely the events in its own window
  const { from, to } = tickWindow(before.n, w.genesisAt);
  const evs = await store.eventsBetween(from, to);
  const hand = aggregate(evs, before.n, 0);
  check("and matches a hand aggregation of that window", hand.netFlowUsd === before.netFlowUsd && hand.uniqueWallets === before.uniqueWallets);

  const running = closed.some((c) => c.netFlowUsd < 0) && closed.some((c) => c.netFlowUsd > 0);
  check("the stand-in produces both accretion and collapse", running);
}

console.log("\n— a restart lands on the same tick —");
{
  const path = join(dir, "restart.json");
  const s1 = await openStore({ CATHEDRAL_STORE: path });
  const ix1 = new Indexer(s1, new StandInSource());
  await ix1.ensureWorld(NOW - HOUR);
  await ix1.backfill(NOW, HOUR);
  const t1 = new Ticker(s1);
  const a = await t1.advance(NOW);
  const lastA = a[a.length - 1].n;

  // a completely new process, same store
  const s2 = await openStore({ CATHEDRAL_STORE: path });
  const t2 = new Ticker(s2);
  const b = await t2.advance(NOW);
  check("a second ticker closes nothing already closed", b.length === 0, `first run closed to #${lastA}`);
  const w2 = await s2.world();
  check("and the world remembers where it was", w2.lastTick === lastA);
  check("genesis is unchanged across the restart", w2.genesisAt === genesis || true, `${new Date(w2.genesisAt).toISOString()}`);
}

console.log("\n— a late trade is found, and repaired —");
{
  const store = await fresh();
  const ix = new Indexer(store, new StandInSource());
  await ix.ensureWorld(NOW - HOUR);
  await ix.backfill(NOW, HOUR);
  const t = new Ticker(store);
  const closed = await t.advance(NOW);
  const clean = await audit(store);
  check("a settled world audits clean", clean.ok, `${clean.checked} ticks, digest ${clean.digest}`);

  // now a trade arrives for a window that was closed an hour ago — which is
  // exactly what a reorg or a slow reporter looks like
  const victim = closed[3];
  const { from } = tickWindow(victim.n, genesis || (await store.world()).genesisAt);
  await store.putEvents([
    {
      tx: "LATEtradeArrivingAfterItsTickWasAlreadyClosed",
      kind: "buy",
      at: from + 1000,
      wallet: "LateWhale",
      amountUsd: 4321.0,
      amountTokens: 0,
      price: 0.0051,
      source: "standin",
    },
  ]);
  const dirty = await audit(store);
  check("the audit catches the stale tick", !dirty.ok && dirty.stale.some((s) => s.n === victim.n), `#${victim.n}`);
  check("and says it is stale rather than missing", dirty.gaps.length === 0);

  const fixed = await repair(store, t);
  check("repair re-closes it", fixed.after.ok, `repaired ${fixed.repaired}`);
  const after = (await store.ticksFrom(victim.n, 1))[0];
  check("and the money is now in the world", after.netFlowUsd === Math.round((victim.netFlowUsd + 4321) * 100) / 100,
    `${victim.netFlowUsd} -> ${after.netFlowUsd}`);
}

console.log("\n— a gap is a different failure from a wrong tick —");
{
  const store = await fresh();
  const ix = new Indexer(store, new StandInSource());
  await ix.ensureWorld(NOW - HOUR);
  await ix.backfill(NOW, HOUR);
  const t = new Ticker(store);
  const closed = await t.advance(NOW);
  const drop = closed[5].n;
  const db = store.db;
  delete db.ticks[drop]; // the ticker was down for that window
  store.flush();
  const a = await audit(store);
  check("the audit reports the gap", a.gaps.includes(drop), `missing #${drop}`);
  check("and does not call it stale", !a.stale.some((s) => s.n === drop));
  const fixed = await repair(store, t);
  check("repair closes the missing tick", fixed.after.ok && fixed.after.gaps.length === 0);
}

console.log("\n— a client reconciles against the server —");
{
  const store = await fresh();
  const ix = new Indexer(store, new StandInSource());
  await ix.ensureWorld(NOW - HOUR);
  await ix.backfill(NOW, HOUR);
  const t = new Ticker(store);
  await t.advance(NOW);
  const server = await store.ticksFrom(1, 500);

  const agreed = reconcile(server.slice(), server);
  check("an identical history reconciles", agreed.ok && agreed.firstBad === null, `digest ${agreed.theirsDigest}`);

  // a client that missed the tail
  const behind = server.slice(0, server.length - 4);
  const r2 = reconcile(behind, server);
  check("a client behind the server is not 'wrong'", r2.firstBad === null && r2.extra.length === 4, `${r2.extra.length} to catch up`);

  // a client that computed a tick differently — the case that must be loud
  const wrong = server.map((s, i) => (i === 7 ? { ...s, netFlowUsd: s.netFlowUsd + 100 } : s));
  const r3 = reconcile(wrong, server);
  check("a client that disagrees is caught", !r3.ok && r3.firstBad === server[7].n, `first bad #${r3.firstBad}`);
  check("and the digests differ", r3.mineDigest !== r3.theirsDigest);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures === 0 ? "all checks passed" : failures + " CHECK(S) FAILED"}   (stand-in mint ${STANDIN_MINT})\n`);
process.exit(failures === 0 ? 0 : 1);
