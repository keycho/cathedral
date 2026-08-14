// cathedral - reconciliation. two questions, and they are different
// questions even though a naive check answers both with "no":
//
//   IS THE STORED HISTORY WHAT THE LOG SAYS?   recompute every tick from the
//   events and compare to the row that was written. a mismatch means a tick
//   was closed over an incomplete window and a late trade has since landed —
//   which is not a fault, it is the normal condition of an indexer, and the
//   repair is to re-close it.
//
//   DOES A CLIENT AGREE WITH THE SERVER?       compare tick digests in order
//   and report the FIRST divergence. a boolean is useless here: the repair
//   is to replay from the bad tick, so that number is the entire answer.
//
// the second question is answered by law.js's reconcile(), which the browser
// imports too — the client checks itself against the server using the same
// code the server checks itself with.

import { aggregate, chainDigest, findGaps, tickDigest, tickWindow } from "../src/market/law.js";

// walk the stored ticks, recompute each from the log, and report every row
// that no longer matches what its own events say.
export async function audit(store, opts = {}) {
  const w = await store.world();
  if (!w?.genesisAt) return { ok: true, checked: 0, stale: [], gaps: [], digest: "" };
  const from = opts.from ?? 1;
  const ticks = await store.ticksFrom(from, opts.limit ?? 500);
  const stale = [];
  for (const stored of ticks) {
    const { from: a, to: b } = tickWindow(stored.n, w.genesisAt);
    const events = await store.eventsBetween(a, b);
    let close = 0;
    for (const e of events) if (e.price > 0) close = e.price;
    const fresh = aggregate(events, stored.n, close);
    const want = String(tickDigest(fresh));
    const have = String(stored.digest ?? tickDigest(stored));
    if (want !== have) {
      stale.push({
        n: stored.n,
        stored: { net: stored.netFlowUsd, gross: stored.grossVolumeUsd, wallets: stored.uniqueWallets },
        recomputed: { net: fresh.netFlowUsd, gross: fresh.grossVolumeUsd, wallets: fresh.uniqueWallets },
      });
    }
  }
  // a MISSING tick is a different failure from a wrong one: it means the
  // ticker never ran for that window, and the repair is to close it rather
  // than to re-close it. saying which is which is the point of this function.
  const gaps = findGaps(ticks);
  return {
    ok: stale.length === 0 && gaps.length === 0,
    checked: ticks.length,
    stale,
    gaps,
    digest: chainDigest(ticks),
  };
}

// find and fix. the ticker's reclose is the repair for a stale row and also
// for a gap, because both are answered by "compute this tick from the log".
export async function repair(store, ticker, opts = {}) {
  const first = await audit(store, opts);
  if (first.ok) return { repaired: 0, before: first, after: first };
  const targets = new Set([...first.stale.map((s) => s.n), ...first.gaps]);
  for (const n of [...targets].sort((a, b) => a - b)) await ticker.reclose(n, n);
  const after = await audit(store, opts);
  return { repaired: targets.size, before: first, after };
}
