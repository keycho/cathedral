// kodo - where the log lives. supabase when it is configured, a
// file-backed store when it is not.
//
// THE FALLBACK IS NOT A TOY. it exists because the pipeline has to be
// runnable and testable before any credential exists — an indexer that can
// only be exercised against production is an indexer nobody exercises — and
// because the honest state of this project is that the token is a stand-in.
// both stores implement exactly the same six operations, and the ticker and
// the reconciler cannot tell them apart.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// ---- the file store ----------------------------------------------------------

class FileStore {
  constructor(path) {
    this.path = path;
    this.db = { events: {}, ticks: {}, tickWallets: {}, world: null };
    if (existsSync(path)) {
      try {
        this.db = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        // a corrupt file is a fresh world, not a crash loop. the log is
        // rebuildable from the chain; refusing to start is not a service.
      }
    }
    this.db.events ??= {};
    this.db.ticks ??= {};
    this.db.tickWallets ??= {};
  }
  flush() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.db));
  }
  get kind() {
    return "file";
  }

  async putEvents(events) {
    let inserted = 0;
    for (const ev of events) {
      if (this.db.events[ev.tx]) continue; // the tx is the dedupe, always
      this.db.events[ev.tx] = { ...ev, tick: null };
      inserted++;
    }
    this.flush();
    return inserted;
  }

  async eventsBetween(fromMs, toMs) {
    return Object.values(this.db.events)
      .filter((e) => e.at >= fromMs && e.at < toMs)
      .sort((a, b) => a.at - b.at || (a.tx < b.tx ? -1 : 1));
  }

  // the most recently indexed transactions, for /status to prove itself against
  async recentEventTxs(n = 10) {
    return Object.values(this.db.events)
      .sort((a, b) => b.at - a.at)
      .slice(0, n)
      .map((e) => e.tx);
  }

  async markTicked(txs, n) {
    for (const tx of txs) if (this.db.events[tx]) this.db.events[tx].tick = n;
    this.flush();
  }

  async putTick(tick, wallets, meta) {
    this.db.ticks[tick.n] = { ...tick, ...meta };
    this.db.tickWallets[tick.n] = wallets;
    this.flush();
  }

  async ticksFrom(n, limit = 500) {
    return Object.values(this.db.ticks)
      .filter((t) => t.n >= n)
      .sort((a, b) => a.n - b.n)
      .slice(0, limit);
  }

  async world() {
    return this.db.world;
  }
  async putWorld(w) {
    this.db.world = { ...(this.db.world ?? {}), ...w };
    this.flush();
    return this.db.world;
  }
}

// ---- the supabase store ------------------------------------------------------

class SupabaseStore {
  constructor(client) {
    this.sb = client;
  }
  get kind() {
    return "supabase";
  }

  async putEvents(events) {
    if (!events.length) return 0;
    // ON CONFLICT DO NOTHING, at the database, not in the application. the
    // indexer's windows overlap on purpose — a window that only ever moves
    // forward loses whatever landed late — so the same trade arrives many
    // times and the primary key is the only thing that has to be right.
    const rows = events.map((e) => ({
      tx: e.tx,
      kind: e.kind,
      at: new Date(e.at).toISOString(),
      wallet: e.wallet,
      amount_usd: e.amountUsd,
      amount_tokens: e.amountTokens,
      price: e.price,
      source: e.source,
    }));
    const { data, error } = await this.sb
      .from("events")
      .upsert(rows, { onConflict: "tx", ignoreDuplicates: true })
      .select("tx");
    if (error) throw new Error(`putEvents: ${error.message}`);
    return data?.length ?? 0;
  }

  async eventsBetween(fromMs, toMs) {
    const { data, error } = await this.sb
      .from("events")
      .select("*")
      .gte("at", new Date(fromMs).toISOString())
      .lt("at", new Date(toMs).toISOString())
      .order("at", { ascending: true });
    if (error) throw new Error(`eventsBetween: ${error.message}`);
    return (data ?? []).map((r) => ({
      tx: r.tx,
      kind: r.kind,
      at: Date.parse(r.at),
      wallet: r.wallet,
      amountUsd: Number(r.amount_usd),
      amountTokens: Number(r.amount_tokens),
      price: Number(r.price),
      source: r.source,
    }));
  }

  async recentEventTxs(n = 10) {
    const { data, error } = await this.sb
      .from("events")
      .select("tx")
      .order("at", { ascending: false })
      .limit(n);
    if (error) throw new Error(`recentEventTxs: ${error.message}`);
    return (data ?? []).map((r) => r.tx);
  }

  async markTicked(txs, n) {
    if (!txs.length) return;
    const { error } = await this.sb.from("events").update({ tick: n }).in("tx", txs);
    if (error) throw new Error(`markTicked: ${error.message}`);
  }

  async putTick(tick, wallets, meta) {
    const { error } = await this.sb.from("ticks").upsert(
      {
        n: tick.n,
        epoch: meta.epoch,
        opened_at: new Date(meta.from).toISOString(),
        closed_at: new Date(meta.to).toISOString(),
        net_flow_usd: tick.netFlowUsd,
        gross_volume_usd: tick.grossVolumeUsd,
        unique_wallets: tick.uniqueWallets,
        largest_tx_usd: tick.largestTxUsd,
        close_price: tick.close,
        digest: meta.digest,
        event_count: meta.eventCount,
      },
      { onConflict: "n" }
    );
    if (error) throw new Error(`putTick: ${error.message}`);
    const rows = Object.entries(wallets).map(([wallet, v]) => ({
      n: tick.n,
      wallet,
      buy_usd: v.buy ?? 0,
      sell_usd: v.sell ?? 0,
    }));
    if (rows.length) {
      const { error: e2 } = await this.sb.from("tick_wallets").upsert(rows, { onConflict: "n,wallet" });
      if (e2) throw new Error(`putTick wallets: ${e2.message}`);
    }
  }

  async ticksFrom(n, limit = 500) {
    const { data, error } = await this.sb
      .from("ticks")
      .select("*")
      .gte("n", n)
      .order("n", { ascending: true })
      .limit(limit);
    if (error) throw new Error(`ticksFrom: ${error.message}`);
    return (data ?? []).map((r) => ({
      n: r.n,
      epoch: r.epoch,
      netFlowUsd: Number(r.net_flow_usd),
      grossVolumeUsd: Number(r.gross_volume_usd),
      uniqueWallets: r.unique_wallets,
      largestTxUsd: Number(r.largest_tx_usd),
      close: Number(r.close_price),
      digest: r.digest,
      buys: {},
      sells: {},
    }));
  }

  async world() {
    const { data, error } = await this.sb.from("world").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(`world: ${error.message}`);
    if (!data) return null;
    return {
      genesisAt: Date.parse(data.genesis_at),
      mint: data.mint,
      lastTick: data.last_tick,
      negativeRun: data.negative_run,
      chainDigest: data.chain_digest,
    };
  }

  async putWorld(w) {
    const current = (await this.world()) ?? {};
    const merged = { ...current, ...w };
    const { error } = await this.sb.from("world").upsert(
      {
        id: 1,
        genesis_at: new Date(merged.genesisAt).toISOString(),
        mint: merged.mint,
        last_tick: merged.lastTick ?? 0,
        negative_run: merged.negativeRun ?? 0,
        chain_digest: merged.chainDigest ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw new Error(`putWorld: ${error.message}`);
    return merged;
  }
}

// ---- the choice --------------------------------------------------------------

export async function openStore(env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE ?? env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    const { createClient } = await import("@supabase/supabase-js");
    return new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  }
  return new FileStore(env.KODO_STORE ?? env.CATHEDRAL_STORE ?? ".kodo/market.json");
}
