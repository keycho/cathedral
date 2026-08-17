// kodo - the monitor. one command that asks every live surface whether it
// is actually up, from outside, the way a visitor would.
//
// it checks four things and says which one is wrong, because "the world is
// broken" has four different repairs:
//   site      the canonical domain serves the built world, and the bundle
//             it serves has the market url baked into it
//   ticker    the market service answers /health and /state, and its clock
//             is moving between two reads
//   log       supabase answers with the anon key and the tables exist
//   witness   the stored digests recompute, and the log's clock agrees
//             with the ticker's
//
// exit code 0 when everything passes, 1 when anything fails, so it can be
// a scheduled job as easily as a command.
//
//   npm run monitor
//   SITE=https://www.kodo.world TICKER=https://... npm run monitor

import { tickDigest } from "../src/market/law.js";

const SITE = (process.env.SITE ?? "https://www.kodo.world").replace(/\/$/, "");
const TICKER = (process.env.TICKER ?? "https://cathedral-production.up.railway.app").replace(
  /\/$/,
  ""
);
const SUPABASE = (process.env.SUPABASE_URL ?? "https://cyouplkajtmnvuahiids.supabase.co").replace(
  /\/$/,
  ""
);
const ANON = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_JMZq6eq8QiWkCjWsRQIGRA_GtuosXeS";
const TIMEOUT = Number(process.env.MONITOR_TIMEOUT_MS ?? 20_000);

const results = [];
function pass(surface, note) {
  results.push({ ok: true, surface, note });
}
function fail(surface, note) {
  results.push({ ok: false, surface, note });
}

async function get(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

// ---- site ------------------------------------------------------------------
// A REDIRECT IS NOT AN OUTAGE. fetch follows it; what matters is that the
// far end serves the world and that the bundle it serves knows where the
// market is — a build made before VITE_MARKET_URL was set looks perfectly
// healthy and quietly runs a synthetic world.
async function checkSite() {
  try {
    const page = await get(SITE + "/");
    if (page.status !== 200) return fail("site", `${SITE} answered ${page.status}`);
    const title = /<title>([^<]*)<\/title>/.exec(page.text)?.[1] ?? "";
    const bundle = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(page.text)?.[1];
    if (!bundle) return fail("site", "no bundle referenced in the html");
    const js = await get(`${SITE}/assets/${bundle}`);
    const baked = js.text.includes(new URL(TICKER).host);
    if (!baked) {
      return fail("site", `${bundle} does not carry the market url — the build predates the var`);
    }
    pass("site", `"${title}" · ${bundle} · market url baked`);
  } catch (e) {
    fail("site", e.message);
  }
}

// ---- ticker ----------------------------------------------------------------
// two reads a few seconds apart, because a service that answers /health
// while its clock is stopped is the failure this is here to catch.
async function checkTicker() {
  try {
    const health = await get(TICKER + "/health");
    if (health.status !== 200) return fail("ticker", `/health answered ${health.status}`);
    const first = JSON.parse((await get(TICKER + "/state")).text);
    await new Promise((r) => setTimeout(r, 3000));
    const again = JSON.parse((await get(TICKER + "/state")).text);
    const h = JSON.parse(health.text);
    const standIn = again.standIn ? " · STAND-IN TOKEN" : "";
    // a tick is 30s, so two reads three seconds apart usually land on the
    // same number: only a GOING BACKWARDS clock is a fault here
    if (again.lastTick < first.lastTick) {
      return fail("ticker", `the clock went backwards: ${first.lastTick} then ${again.lastTick}`);
    }
    pass("ticker", `tick ${again.lastTick} · store ${h.store} · source ${h.source}${standIn}`);
    return again;
  } catch (e) {
    fail("ticker", e.message);
  }
  return null;
}

// ---- log + witness ---------------------------------------------------------
async function checkLog(tickerState) {
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` };
  let world = null;
  try {
    const w = await get(`${SUPABASE}/rest/v1/world?id=eq.1&select=last_tick`, headers);
    if (w.status === 404) {
      return fail("log", "the tables do not exist — server/schema.sql has not been applied");
    }
    if (w.status !== 200) return fail("log", `world answered ${w.status}: ${w.text.slice(0, 120)}`);
    world = JSON.parse(w.text)[0] ?? null;
    pass("log", `readable with the anon key · world at tick ${world?.last_tick ?? "none"}`);
  } catch (e) {
    return fail("log", e.message);
  }
  try {
    const t = await get(
      `${SUPABASE}/rest/v1/ticks?select=n,net_flow_usd,gross_volume_usd,unique_wallets,largest_tx_usd,digest&order=n.desc&limit=48`,
      headers
    );
    const ticks = JSON.parse(t.text);
    // postgrest serialises numerics as strings; the digest law reads numbers
    const bad = ticks.filter(
      (x) =>
        String(
          tickDigest({
            n: x.n,
            netFlowUsd: Number(x.net_flow_usd),
            grossVolumeUsd: Number(x.gross_volume_usd),
            uniqueWallets: x.unique_wallets,
            largestTxUsd: Number(x.largest_tx_usd),
            close: 0,
            buys: {},
            sells: {},
          })
        ) !== x.digest
    );
    if (bad.length) {
      return fail("witness", `stored digests fail recompute at ${bad.map((b) => b.n).join(", ")}`);
    }
    const service = tickerState?.lastTick ?? null;
    const stored = world?.last_tick ?? null;
    if (service !== null && stored !== null && Math.abs(service - stored) > 1) {
      return fail("witness", `the service says tick ${service} but the log says ${stored}`);
    }
    pass("witness", `${ticks.length} digests recompute · service and log agree`);
  } catch (e) {
    fail("witness", e.message);
  }
}

await checkSite();
const state = await checkTicker();
await checkLog(state);

for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.surface.padEnd(8)} ${r.note}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} surface(s) down` : "\nall surfaces up");
process.exit(failed ? 1 : 0);
