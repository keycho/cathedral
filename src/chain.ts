// kodo - the seam where the world stops making the market up.
//
// phase 1 ran a synthetic feed and a tick engine inside every browser, which
// means every visitor has been watching a different world. that is fine for
// a world nobody shares. it is not what this project is: a world grown by a
// market has to be the SAME world for everyone watching the same token, and
// the only way that is true is if one clock decides and the browsers follow.
//
// this reads the market service's history and drives the existing tick
// engine with it. nothing downstream changes — the rules, the accretion, the
// crew's budget and the architect all read a TickSummary and cannot tell
// where it came from.
//
// DORMANT UNTIL POINTED AT SOMETHING. with no service configured the world
// runs exactly as it did, on the synthetic feed, and this module never
// connects. that is deliberate: the token is a stand-in, and a world that
// silently switched to following a placeholder would be worse than one that
// admits it is synthetic.

import { reconcile } from "./market/law.js";
import type { WireTick } from "./market/law.js";
import type { TickEngine, TickSummary } from "./ticks";

export interface ChainState {
  genesisAt: number | null;
  mint: string;
  standIn: boolean;
  lastTick: number;
  tickMs: number;
  ticksPerEpoch: number;
}

// where the service is, if anywhere. a url in the environment for a real
// deployment, and a query parameter so a session can be pointed at a local
// one without a rebuild.
export function marketUrl(): string | null {
  const fromEnv = (import.meta.env.VITE_MARKET_URL as string | undefined) ?? "";
  const fromQuery =
    typeof location === "undefined" ? "" : (new URLSearchParams(location.search).get("market") ?? "");
  const url = (fromQuery || fromEnv).trim();
  return url ? url.replace(/\/$/, "") : null;
}

// a wire tick carries plain objects; the engine wants Maps. this is the only
// conversion in the whole path, and it lives here rather than in the law
// because the law has to run on a server that has never heard of a Map-based
// TickSummary.
function toSummary(t: WireTick): TickSummary {
  return {
    n: t.n,
    netFlowUsd: t.netFlowUsd,
    grossVolumeUsd: t.grossVolumeUsd,
    uniqueWallets: t.uniqueWallets,
    largestTxUsd: t.largestTxUsd,
    close: t.close,
    // wallets arrive as pubkey strings. the world's per-wallet formations are
    // keyed on a number, so a stable hash of the key is what the geology
    // uses — the same pubkey always lands on the same formation.
    buys: mapOf(t.buys),
    sells: mapOf(t.sells),
  };
}

function mapOf(rec: Record<string, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const [k, v] of Object.entries(rec ?? {})) {
    const w = walletId(k);
    out.set(w, (out.get(w) ?? 0) + v);
  }
  return out;
}

// fnv-1a. a pubkey is 44 characters and the world wants a small integer; the
// only property that matters is that it is STABLE, so a wallet's formation
// survives a reload and a redeploy.
export function walletId(pubkey: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < pubkey.length; i++) {
    h ^= pubkey.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export class ChainFeed {
  state: ChainState | null = null;
  // the ticks this browser has actually applied, kept so it can check itself
  // against the server rather than assume the sequence it received was right
  private applied: WireTick[] = [];
  private timer: number | null = null;
  private failures = 0;
  lastError = "";
  drift: { firstBad: number | null; checked: number } = { firstBad: null, checked: 0 };

  constructor(
    private url: string,
    private ticks: TickEngine,
    private opts: { pollMs?: number; onState?: (s: ChainState) => void } = {}
  ) {}

  async start(): Promise<boolean> {
    const ok = await this.readState();
    if (!ok) return false;
    // THE ENGINE STOPS ROLLING ITS OWN THE MOMENT A SERVER ANSWERS, and not
    // a moment before. handing over on the attempt rather than on the answer
    // would stall the world every time the service was down.
    this.ticks.external = true;
    await this.catchUp();
    const every = this.opts.pollMs ?? Math.max(5_000, Math.floor((this.state?.tickMs ?? 30_000) / 3));
    this.timer = setInterval(() => void this.catchUp(), every) as unknown as number;
    return true;
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.ticks.external = false;
  }

  private async readState(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/state`);
      if (!res.ok) throw new Error(String(res.status));
      this.state = (await res.json()) as ChainState;
      this.opts.onState?.(this.state);
      return true;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  // pull everything after the last tick this browser applied, apply it in
  // order, and then check that what it holds still agrees with the server.
  async catchUp(): Promise<number> {
    const since = (this.applied[this.applied.length - 1]?.n ?? 0) + 1;
    let batch: WireTick[];
    try {
      const res = await fetch(`${this.url}/ticks?since=${since}&limit=200`);
      if (!res.ok) throw new Error(String(res.status));
      batch = ((await res.json()) as { ticks: WireTick[] }).ticks ?? [];
      this.failures = 0;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      // A SERVICE OUTAGE MUST NOT REWIND THE WORLD. the browser holds what it
      // has and waits; it does not fall back to inventing ticks, because a
      // world that fills a gap with guesses is a world that has to be told
      // later that the last ten minutes did not happen.
      if (++this.failures > 20) this.lastError += " (service unreachable)";
      return 0;
    }
    for (const t of batch) {
      this.applied.push(t);
      this.ticks.applyExternal(toSummary(t));
    }
    if (this.applied.length > 600) this.applied.splice(0, this.applied.length - 600);
    if (batch.length) await this.verify();
    return batch.length;
  }

  // the check the whole schema exists to make possible: does what this
  // browser applied still match what the server holds. the answer is a tick
  // NUMBER, not a boolean — the repair is to replay from there.
  private async verify() {
    if (this.applied.length < 4) return;
    const from = this.applied[0].n;
    try {
      const res = await fetch(`${this.url}/ticks?since=${from}&limit=600`);
      if (!res.ok) return;
      const theirs = ((await res.json()) as { ticks: WireTick[] }).ticks ?? [];
      const r = reconcile(this.applied, theirs);
      this.drift = { firstBad: r.firstBad, checked: r.checked };
      if (r.firstBad !== null) {
        // a tick was re-closed on the server after a late trade landed. drop
        // everything from the divergence and take the server's version: the
        // server can prove its answer from the log and this browser cannot.
        const keep = this.applied.filter((t) => t.n < r.firstBad!);
        this.applied = keep;
      }
    } catch {
      // a failed check is not drift; it is a failed check
    }
  }
}

// wire it up, or do not. returns null when there is no service configured,
// which is the shipped state.
export async function connectChain(
  ticks: TickEngine,
  onState?: (s: ChainState) => void
): Promise<ChainFeed | null> {
  const url = marketUrl();
  if (!url) return null;
  const feed = new ChainFeed(url, ticks, { onState });
  const ok = await feed.start();
  return ok ? feed : null;
}
