// kodo - THE WITNESS. the browser does not have to take the market
// service's word for the history: the log lives in supabase behind
// row-level security that lets anyone READ and only the service role
// write. this layer reads the ticks straight from the database with the
// public anon key and checks two things — that every stored tick's digest
// matches a recompute from its own rule-visible fields (integrity), and
// that the world row's clock agrees with the service this browser is
// following (agreement). it changes nothing downstream; it is a witness,
// not a second driver, and with ?witness=off it never speaks at all.

import { tickDigest } from "./market/law.js";

// the anon key is publishable by design: it can read what row-level
// security lets the public read, and nothing else. the service role key
// never appears in client code or VITE_ vars.
const DEFAULT_URL = "https://cyouplkajtmnvuahiids.supabase.co";
const DEFAULT_ANON = "sb_publishable_JMZq6eq8QiWkCjWsRQIGRA_GtuosXeS";

export interface WitnessReport {
  at: number;
  reachable: boolean;
  ticksSeen: number;
  digestBad: number[]; // tick numbers whose stored digest fails recompute
  worldLastTick: number | null;
  serviceLastTick: number | null;
  agree: boolean | null; // null when no service is being followed
  error: string;
}

export function witnessConfig(): { url: string; key: string } | null {
  const q =
    typeof location === "undefined"
      ? null
      : new URLSearchParams(location.search).get("witness");
  if (q === "off") return null;
  const url = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? DEFAULT_URL).replace(
    /\/$/,
    ""
  );
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? DEFAULT_ANON;
  return url && key ? { url, key } : null;
}

export class Witness {
  report: WitnessReport = {
    at: 0,
    reachable: false,
    ticksSeen: 0,
    digestBad: [],
    worldLastTick: null,
    serviceLastTick: null,
    agree: null,
    error: "",
  };
  private timer: number | null = null;

  constructor(
    private cfg: { url: string; key: string },
    private serviceLastTick: () => number | null
  ) {}

  start(pollMs = 60_000) {
    void this.check();
    this.timer = setInterval(() => void this.check(), pollMs) as unknown as number;
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private async get(path: string): Promise<unknown> {
    const res = await fetch(`${this.cfg.url}/rest/v1/${path}`, {
      headers: { apikey: this.cfg.key, Authorization: `Bearer ${this.cfg.key}` },
    });
    if (!res.ok) throw new Error(`${res.status} on ${path.split("?")[0]}`);
    return res.json();
  }

  async check(): Promise<WitnessReport> {
    const r: WitnessReport = {
      at: Date.now(),
      reachable: false,
      ticksSeen: 0,
      digestBad: [],
      worldLastTick: null,
      serviceLastTick: this.serviceLastTick(),
      agree: null,
      error: "",
    };
    try {
      const world = (await this.get("world?id=eq.1&select=last_tick")) as {
        last_tick: number;
      }[];
      const ticks = (await this.get(
        "ticks?select=n,net_flow_usd,gross_volume_usd,unique_wallets,largest_tx_usd,digest&order=n.desc&limit=48"
      )) as {
        n: number;
        net_flow_usd: string | number;
        gross_volume_usd: string | number;
        unique_wallets: number;
        largest_tx_usd: string | number;
        digest: string;
      }[];
      r.reachable = true;
      r.worldLastTick = world[0]?.last_tick ?? null;
      r.ticksSeen = ticks.length;
      for (const t of ticks) {
        // postgrest serialises numerics as strings; the digest law reads
        // numbers. Number() first, or every digest "fails".
        // the digest law reads exactly five fields; the rest of the wire
        // shape is supplied empty to satisfy the type, not the math
        const again = String(
          tickDigest({
            n: t.n,
            netFlowUsd: Number(t.net_flow_usd),
            grossVolumeUsd: Number(t.gross_volume_usd),
            uniqueWallets: t.unique_wallets,
            largestTxUsd: Number(t.largest_tx_usd),
            close: 0,
            buys: {},
            sells: {},
          })
        );
        if (again !== t.digest) r.digestBad.push(t.n);
      }
      if (r.serviceLastTick !== null && r.worldLastTick !== null) {
        // the service can run one window ahead of its last durable write
        r.agree = Math.abs(r.serviceLastTick - r.worldLastTick) <= 1;
      }
      if (r.digestBad.length) {
        console.warn("[kodo] witness: stored digests fail recompute at ticks", r.digestBad);
      }
      if (r.agree === false) {
        console.warn(
          `[kodo] witness: the service says tick ${r.serviceLastTick} but the log says ${r.worldLastTick}`
        );
      }
    } catch (e) {
      r.error = e instanceof Error ? e.message : String(e);
    }
    this.report = r;
    return r;
  }
}
