// kodo - THE CHAIN, READ DIRECTLY. no provider, no api key, no trust: the
// indexer asks a solana rpc node what happened and decodes the answer
// itself, because every hosted trade api this project could have used is
// either behind cloudflare, behind a key, or free to change its schema
// under us. the rpc's shape is the chain's shape and does not move.
//
// THE ANCHOR IS THE MINT, NOT THE VENUE. signatures are discovered with
// getSignaturesForAddress(mint), which returns every transaction that
// touches the token account — bonding-curve buys today, pool swaps after
// graduation, and whatever comes after that. an indexer anchored on the
// bonding curve would go silent the hour the token graduates and nobody
// would notice until the world stopped growing. this one does not have a
// migration event to catch, because it was never watching the curve.
//
// two decoders read those transactions, in order of certainty:
//
//   1. THE CURVE'S OWN EVENT. pump emits an anchor self-CPI event on every
//      trade: mint, sol amount, token amount, direction, user, timestamp.
//      it is exact, it is signed by the program, and it survives being
//      called through an aggregator — which matters, because most trades
//      arrive as a CPI from a router and the pump program never appears as
//      a top-level instruction at all. a decoder that looked for the
//      program in the instruction list would see a fraction of the volume.
//
//   2. THE POOL'S BALANCE DELTA. after graduation the venue is an amm whose
//      event layout is its own business and may change. so the fallback
//      reads no layout: it takes the pool's own SOL and token balance
//      change out of the transaction meta, which is canonical rpc data. a
//      pool that gained SOL and lost tokens was bought from. this is
//      venue-agnostic by construction and was checked against a real
//      graduated pumpswap trade, where it reproduced that trade's own
//      event exactly.
//
// USD is not on chain. the sol price comes from a public quote and is
// cached; a window that cannot be priced is REFUSED rather than emitted at
// zero, because a tick of zero-dollar trades is a lie the world would
// build on.

import { normalise } from "../src/market/law.js";

export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMPSWAP_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
export const WSOL = "So11111111111111111111111111111111111111112";

// anchor event discriminators, taken off real transactions rather than off
// an idl: the first eight bytes of the base64 in a "Program data:" log
const DISC_TRADE = "bddb7fd34ee661ee"; // pump bonding-curve TradeEvent
const DISC_CREATE = "1b72a94ddeeb6376"; // pump CreateEvent (the launch)

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(buf) {
  let n = 0n;
  for (const b of buf) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of buf) {
    if (b === 0) s = "1" + s;
    else break;
  }
  return s;
}

// ---- the rpc ----------------------------------------------------------------

// a public rpc node will rate-limit a loop that means it no harm, so every
// call goes through one queue with a floor between calls and a backoff on
// 429. slow and complete beats fast and full of holes.
export class Rpc {
  constructor(url, opts = {}) {
    this.url = url;
    this.minGapMs = opts.minGapMs ?? Number(process.env.SOLANA_RPC_GAP_MS ?? 250);
    this.maxRetries = opts.maxRetries ?? 6;
    this.last = 0;
    this.chain = Promise.resolve();
    this.calls = 0;
    this.retries = 0;
  }

  // ONE ROUND TRIP FOR MANY QUESTIONS. a busy tick is dozens of
  // transactions, and asking for them one at a time spends the whole tick
  // in latency rather than in work. json-rpc takes an array, so it is asked
  // once. the answers come back keyed by id because a node is not obliged
  // to preserve order.
  batch(method, paramsList) {
    if (!paramsList.length) return Promise.resolve([]);
    const run = async () => {
      const wait = this.minGapMs - (Date.now() - this.last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      this.calls++;
      const out = new Array(paramsList.length).fill(null);
      // A NODE RATE-LIMITS INSIDE THE BATCH, not just around it: a public
      // endpoint asked for fifteen transactions at once answers three and
      // returns "too many requests" for the rest. so the unanswered ids are
      // retried — only the unanswered ones — until they land or the
      // attempts run out. treating a partial answer as a whole one is how
      // an indexer silently loses trades.
      let pending = paramsList.map((_, i) => i);
      for (let attempt = 0; pending.length; attempt++) {
        try {
          const res = await fetch(this.url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              pending.map((i) => ({ jsonrpc: "2.0", id: i, method, params: paramsList[i] }))
            ),
            signal: AbortSignal.timeout(45_000),
          });
          if (res.status === 429 || res.status >= 500) throw new Error(`rpc ${res.status}`);
          const rows = await res.json();
          if (!Array.isArray(rows)) throw new Error("batch: not an array");
          const still = [];
          const answered = new Set();
          for (const r of rows) {
            const i = Number(r.id);
            if (!Number.isInteger(i)) continue;
            answered.add(i);
            if (r.error) still.push(i);
            else out[i] = r.result;
          }
          // an id the node did not mention at all is also unanswered
          for (const i of pending) if (!answered.has(i)) still.push(i);
          if (!still.length) return out;
          if (attempt >= this.maxRetries) {
            throw new Error(`batch: ${still.length} of ${paramsList.length} unanswered`);
          }
          pending = still;
          this.retries++;
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        } catch (e) {
          if (attempt >= this.maxRetries) throw e;
          this.retries++;
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        }
      }
      return out;
    };
    this.chain = this.chain.then(run, run);
    return this.chain;
  }

  call(method, params) {
    // serialise through a promise chain: concurrent callers queue rather
    // than all hitting the node at once
    const run = async () => {
      const wait = this.minGapMs - (Date.now() - this.last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      this.calls++;
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await fetch(this.url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
            signal: AbortSignal.timeout(30_000),
          });
          if (res.status === 429 || res.status >= 500) throw new Error(`rpc ${res.status}`);
          const body = await res.json();
          if (body.error) throw new Error(`rpc: ${body.error.message}`);
          return body.result;
        } catch (e) {
          if (attempt >= this.maxRetries) throw e;
          this.retries++;
          await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        }
      }
    };
    this.chain = this.chain.then(run, run);
    return this.chain;
  }
}

// ---- decoding ---------------------------------------------------------------

// every "Program data:" log in a transaction, as raw bytes
function eventPayloads(tx) {
  const out = [];
  for (const l of tx?.meta?.logMessages ?? []) {
    if (!l.startsWith("Program data:")) continue;
    try {
      out.push(Buffer.from(l.slice(13).trim(), "base64"));
    } catch {
      // a log that is not base64 is not an event
    }
  }
  return out;
}

// THE CURVE'S EVENT, verified field by field against live transactions:
// 8 disc | 32 mint | 8 sol | 8 token | 1 isBuy | 32 user | 8 timestamp | ...
export function decodeTrade(d, mint) {
  if (d.length < 97 || d.subarray(0, 8).toString("hex") !== DISC_TRADE) return null;
  let o = 8;
  const evMint = b58(d.subarray(o, o + 32));
  o += 32;
  // one transaction can carry trades in several tokens; only ours count
  if (mint && evMint !== mint) return null;
  const solLamports = d.readBigUInt64LE(o);
  o += 8;
  const tokenRaw = d.readBigUInt64LE(o);
  o += 8;
  const isBuy = d[o] === 1;
  o += 1;
  const user = b58(d.subarray(o, o + 32));
  o += 32;
  const ts = Number(d.readBigInt64LE(o));
  return { mint: evMint, solLamports, tokenRaw, isBuy, user, at: ts * 1000 };
}

// THE LAUNCH, for genesis: name, symbol, uri, mint, curve, creator.
export function decodeCreate(d) {
  if (d.subarray(0, 8).toString("hex") !== DISC_CREATE) return null;
  let o = 8;
  const str = () => {
    const n = d.readUInt32LE(o);
    o += 4;
    const s = d.subarray(o, o + n).toString("utf8");
    o += n;
    return s;
  };
  const name = str();
  const symbol = str();
  const uri = str();
  const mint = b58(d.subarray(o, o + 32));
  o += 32;
  const bondingCurve = b58(d.subarray(o, o + 32));
  o += 32;
  const user = b58(d.subarray(o, o + 32));
  o += 32;
  const creator = b58(d.subarray(o, o + 32));
  o += 32;
  const ts = Number(d.readBigInt64LE(o));
  return { name, symbol, uri, mint, bondingCurve, user, creator, at: ts * 1000 };
}

// THE VENUE-AGNOSTIC FALLBACK. no layout is read: the pool's own balances
// move, and the direction follows from which way the SOL went. used after
// graduation, when the venue's event format stops being pump's business.
//
// a router can route one transaction through several pools; each pool that
// moved is its own trade, which is what the chain actually did.
export function decodeByDelta(tx, mint) {
  const meta = tx?.meta;
  if (!meta) return [];
  const keys = (tx.transaction?.message?.accountKeys ?? []).map((k) =>
    typeof k === "string" ? k : k.pubkey
  );
  // token balances, by account index, for our mint and for wrapped sol
  const delta = (m) => {
    const by = new Map();
    for (const b of meta.preTokenBalances ?? [])
      if (b.mint === m)
        by.set(b.accountIndex, { owner: b.owner, pre: BigInt(b.uiTokenAmount.amount), post: 0n });
    for (const b of meta.postTokenBalances ?? [])
      if (b.mint === m) {
        const cur = by.get(b.accountIndex) ?? { owner: b.owner, pre: 0n, post: 0n };
        cur.post = BigInt(b.uiTokenAmount.amount);
        cur.owner = b.owner;
        by.set(b.accountIndex, cur);
      }
    return by;
  };
  const base = delta(mint);
  const quote = delta(WSOL);
  // THE CURVE HOLDS SOL NATIVELY, a pool holds it wrapped. so the quote
  // side has to be read both ways or this reader would be blind to exactly
  // the venue the token is on today — which would also cost the
  // cross-check that proves the curve decoder right.
  const native = new Map();
  for (let i = 0; i < keys.length; i++) {
    const d = BigInt(meta.postBalances?.[i] ?? 0) - BigInt(meta.preBalances?.[i] ?? 0);
    if (d !== 0n) native.set(keys[i], d);
  }
  const out = [];
  // an owner that both holds our token and moved wrapped sol the other way
  // is a venue; the signer is the trader
  const trader = keys[0] ?? null;
  const byOwner = new Map();
  for (const [, v] of base) {
    const d = v.post - v.pre;
    if (d === 0n || !v.owner) continue;
    const cur = byOwner.get(v.owner) ?? { base: 0n, quote: 0n };
    cur.base += d;
    byOwner.set(v.owner, cur);
  }
  for (const [, v] of quote) {
    if (!v.owner || !byOwner.has(v.owner)) continue;
    byOwner.get(v.owner).quote += v.post - v.pre;
  }
  for (const [owner, cur] of byOwner) {
    if (cur.quote === 0n && native.has(owner)) cur.quote += native.get(owner);
  }
  for (const [owner, v] of byOwner) {
    if (owner === trader) continue; // the trader is not the venue
    if (v.base === 0n || v.quote === 0n) continue;
    // a pool that GAINED sol and LOST tokens was bought from
    if (v.quote > 0n && v.base < 0n) {
      out.push({ isBuy: true, solLamports: v.quote, tokenRaw: -v.base, user: trader, venue: owner });
    } else if (v.quote < 0n && v.base > 0n) {
      out.push({ isBuy: false, solLamports: -v.quote, tokenRaw: v.base, user: trader, venue: owner });
    }
  }
  return out;
}

// ---- the sol price ----------------------------------------------------------

// USD is not a chain fact. this derives it from a public quote for the
// token's own pair (price in usd over price in sol), which is the same
// number every venue would give and needs no key. cached, because it moves
// far more slowly than trades arrive.
export class SolPrice {
  constructor(mint, ttlMs = 60_000) {
    this.mint = mint;
    this.ttlMs = ttlMs;
    this.value = 0;
    this.at = 0;
    this.error = "";
  }
  async get() {
    if (this.value && Date.now() - this.at < this.ttlMs) return this.value;
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${this.mint}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`price ${res.status}`);
      const pairs = (await res.json()).pairs ?? [];
      for (const p of pairs) {
        const usd = Number(p.priceUsd);
        const native = Number(p.priceNative);
        if (usd > 0 && native > 0) {
          this.value = usd / native;
          this.at = Date.now();
          this.error = "";
          return this.value;
        }
      }
      throw new Error("no priced pair");
    } catch (e) {
      this.error = e.message;
      // A STALE PRICE IS BETTER THAN NO WORLD, but only for a while: sol
      // does not move enough in an hour to make a tick wrong, and refusing
      // to index because a price api blinked would lose trades forever.
      if (this.value && Date.now() - this.at < 3600_000) return this.value;
      return 0;
    }
  }
}

// ---- the source -------------------------------------------------------------

export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

export class SolanaSource {
  constructor(mint, opts = {}) {
    this.mint = mint;
    // THE PUBLIC ENDPOINT IS A DEMO, NOT A DEPENDENCY. it rate-limits per
    // ip both around and INSIDE a batch, so a busy token indexed through it
    // will spend a tick retrying instead of reading. everything here works
    // against it — that is how this decoder was verified — but a world that
    // has to keep up needs its own rpc.
    this.rpcUrl = opts.rpcUrl || PUBLIC_RPC;
    this.publicRpc = this.rpcUrl === PUBLIC_RPC;
    if (this.publicRpc) {
      console.log(
        "[market] no SOLANA_RPC_URL: using the public endpoint, which rate-limits. set one before this world has to keep up."
      );
    }
    // PACE TO THE ENDPOINT, NOT TO THE WORST CASE. the public node answers
    // maybe five transactions a batch and throttles per ip; a paid one
    // takes fifty at a time and does not. the difference decides whether a
    // world's first boot — which replays every trade since the launch —
    // takes seconds or hours, and a boot that takes hours reads to a host
    // exactly like a boot that hung.
    this.rpc = new Rpc(this.rpcUrl, {
      minGapMs: this.publicRpc ? 250 : 20,
      ...opts,
    });
    this.price = new SolPrice(mint);
    this.decimals = opts.decimals ?? 6;
    // transactions are immutable once finalised, so a signature only ever
    // needs fetching once however many overlapping windows ask for it —
    // which is what makes the indexer's deliberate overlap affordable
    this.txCache = new Map();
    this.txCacheMax = opts.txCacheMax ?? 4000;
    // public nodes rate-limit inside a batch; a paid rpc handles far more.
    // SOLANA_RPC_BATCH raises it when the endpoint can take it.
    this.batchSize =
      opts.batchSize ?? Number(process.env.SOLANA_RPC_BATCH ?? (this.publicRpc ? 5 : 50));
    this.sigCache = []; // {signature, blockTime}, newest first
    this.stats = {
      windows: 0,
      sigsSeen: 0,
      txFetched: 0,
      cacheHits: 0,
      byCurve: 0,
      byDelta: 0,
      undecoded: 0,
      rejected: 0,
      priceUsd: 0,
      publicRpc: this.publicRpc,
      rpcCalls: 0,
      rpcRetries: 0,
    };
    this.genesisInfo = null;
  }
  get name() {
    return "solana";
  }

  // SIGNATURES ARE APPEND-ONLY, so they are fetched once and kept. the
  // first version re-paged the whole history on every window, which is
  // quadratic in the age of the world: a backfill over an afternoon spent
  // its life re-reading the morning. this keeps one descending index and
  // only ever asks for what it does not have — new signatures at the head,
  // older ones at the tail when a window reaches past what it holds.
  async signaturesBack(untilMs) {
    // the head: everything newer than the newest we know
    const newest = this.sigCache[0]?.signature ?? null;
    if (newest) {
      const fresh = [];
      let before = null;
      for (let page = 0; page < 20; page++) {
        const opts = { limit: 1000, until: newest };
        if (before) opts.before = before;
        const rows = (await this.rpc.call("getSignaturesForAddress", [this.mint, opts])) ?? [];
        if (!rows.length) break;
        fresh.push(...rows);
        if (rows.length < 1000) break;
        before = rows[rows.length - 1].signature;
      }
      if (fresh.length) {
        this.sigCache.unshift(
          ...fresh.filter((r) => !r.err).map((r) => ({ signature: r.signature, blockTime: r.blockTime }))
        );
      }
    }
    // the tail: page back only while the window reaches past what we hold
    let oldest = this.sigCache[this.sigCache.length - 1];
    for (let page = 0; page < 40; page++) {
      if (this.sigCache.length && oldest?.blockTime && oldest.blockTime * 1000 < untilMs) break;
      const opts = { limit: 1000 };
      if (oldest) opts.before = oldest.signature;
      const rows = (await this.rpc.call("getSignaturesForAddress", [this.mint, opts])) ?? [];
      if (!rows.length) break;
      this.sigCache.push(
        ...rows.filter((r) => !r.err).map((r) => ({ signature: r.signature, blockTime: r.blockTime }))
      );
      oldest = { signature: rows[rows.length - 1].signature, blockTime: rows[rows.length - 1].blockTime };
      if (rows.length < 1000) break; // the mint's whole history is held
    }
    this.stats.sigsSeen = this.sigCache.length;
    return this.sigCache;
  }

  async getTx(signature) {
    const hit = this.txCache.get(signature);
    if (hit) {
      this.stats.cacheHits++;
      return hit;
    }
    const tx = await this.rpc.call("getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    this.stats.txFetched++;
    if (this.txCache.size >= this.txCacheMax) {
      // oldest-first eviction; insertion order is chain order closely enough
      const k = this.txCache.keys().next().value;
      this.txCache.delete(k);
    }
    this.txCache.set(signature, tx);
    return tx;
  }

  // THE LAUNCH, found by walking to the very first transaction that touched
  // the mint. it is the founding stone: the world's tick 1 is this moment.
  async genesis() {
    if (this.genesisInfo) return this.genesisInfo;
    let before = null;
    let oldest = null;
    for (let page = 0; page < 40; page++) {
      const params = [this.mint, before ? { limit: 1000, before } : { limit: 1000 }];
      const rows = (await this.rpc.call("getSignaturesForAddress", params)) ?? [];
      if (!rows.length) break;
      oldest = rows[rows.length - 1];
      if (rows.length < 1000) break;
      before = oldest.signature;
    }
    if (!oldest) return null;
    const tx = await this.getTx(oldest.signature);
    for (const d of eventPayloads(tx)) {
      const c = decodeCreate(d);
      if (c && c.mint === this.mint) {
        this.genesisInfo = { ...c, signature: oldest.signature, slot: tx.slot };
        return this.genesisInfo;
      }
    }
    // the create event should be there; if it is not, the first transaction
    // is still the honest founding moment
    this.genesisInfo = {
      mint: this.mint,
      signature: oldest.signature,
      at: (oldest.blockTime ?? 0) * 1000,
      slot: tx?.slot ?? 0,
      name: "",
      symbol: "",
      creator: "",
      bondingCurve: "",
      partial: true,
    };
    return this.genesisInfo;
  }

  // the one question a source answers: what happened between two moments.
  async fetchWindow(fromMs, toMs) {
    this.stats.windows++;
    const solUsd = await this.price.get();
    this.stats.priceUsd = solUsd;
    if (!solUsd) {
      // REFUSE RATHER THAN LIE. a window priced at zero would close a tick
      // saying nothing happened, and the world would build on that.
      throw new Error("no sol price: refusing to price a window at zero");
    }
    const sigs = (await this.signaturesBack(fromMs)).filter(
      (s) => s.blockTime && s.blockTime * 1000 >= fromMs && s.blockTime * 1000 < toMs
    );
    // fetch everything this window needs and is not already holding, in
    // batches, before decoding any of it
    const missing = sigs.filter((s) => !this.txCache.has(s.signature)).map((s) => s.signature);
    // A SILENT BOOT LOOKS LIKE A HUNG ONE. a first start replays every
    // trade since the launch, and the only thing distinguishing that from
    // a wedged process, from outside, is whether it says so.
    const loud = missing.length > 200;
    if (loud) {
      console.log(`[market] reading ${missing.length} transactions from the chain…`);
    }
    for (let i = 0; i < missing.length; i += this.batchSize) {
      if (loud && i && i % (this.batchSize * 20) === 0) {
        console.log(`[market]   ${i}/${missing.length}`);
      }
      const slice = missing.slice(i, i + this.batchSize);
      const got = await this.rpc.batch(
        "getTransaction",
        slice.map((sig) => [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }])
      );
      for (let k = 0; k < slice.length; k++) {
        if (!got[k]) continue;
        this.stats.txFetched++;
        if (this.txCache.size >= this.txCacheMax) {
          this.txCache.delete(this.txCache.keys().next().value);
        }
        this.txCache.set(slice[k], got[k]);
      }
    }
    const events = [];
    for (const s of sigs) {
      const tx = await this.getTx(s.signature);
      if (!tx || tx.meta?.err) continue;
      const at = (tx.blockTime ?? s.blockTime) * 1000;
      const payloads = eventPayloads(tx);
      let found = 0;
      for (const d of payloads) {
        const t = decodeTrade(d, this.mint);
        if (!t) continue;
        found++;
        this.stats.byCurve++;
        events.push(this.toEvent(t, s.signature, at, solUsd, found));
      }
      if (found) continue;
      // no curve event: either this is a pool swap after graduation, or it
      // is not a trade at all (a transfer, an account creation). the delta
      // reader decides, and it needs no venue-specific knowledge.
      const byDelta = decodeByDelta(tx, this.mint);
      for (let i = 0; i < byDelta.length; i++) {
        this.stats.byDelta++;
        events.push(this.toEvent(byDelta[i], s.signature, at, solUsd, i + 1));
      }
      if (!byDelta.length) this.stats.undecoded++;
    }
    // NORMALISE REJECTS, AND A REJECTION IS A NULL. a dust trade that
    // rounds to no dollars at all is noise the law refuses on purpose —
    // it would count toward the unique-wallet number while contributing
    // nothing to the flow — and pushing that refusal into the list
    // unfiltered crashes the sort on the first one. the chain produces
    // them: sub-cent trades happen.
    const clean = events.filter(Boolean);
    this.stats.rejected += events.length - clean.length;
    clean.sort((a, b) => a.at - b.at || (a.tx < b.tx ? -1 : 1));
    this.stats.rpcCalls = this.rpc.calls;
    this.stats.rpcRetries = this.rpc.retries;
    return clean;
  }

  // THE PROOF, and it is not self-referential. every trade is indexed off
  // the curve's own signed event; this re-derives the SAME transactions the
  // other way — from the venue's balance movements in the transaction meta,
  // which no program authored — and requires the two to agree on direction,
  // SOL amount and token amount. two independent readings of the same
  // on-chain bytes agreeing is what "matches the explorer" actually means,
  // and it is checkable by anyone with the signature.
  //
  // a mismatch is reported, never smoothed: the whole point is to be the
  // party that notices.
  async verify(signatures) {
    const rows = [];
    for (const signature of signatures) {
      const bare = signature.split(":")[0];
      const tx = await this.getTx(bare);
      if (!tx || tx.meta?.err) {
        rows.push({ signature: bare, ok: false, why: "no such confirmed transaction" });
        continue;
      }
      const curve = eventPayloads(tx)
        .map((d) => decodeTrade(d, this.mint))
        .filter(Boolean);
      const delta = decodeByDelta(tx, this.mint);
      if (!curve.length) {
        rows.push({
          signature: bare,
          ok: delta.length > 0,
          why: delta.length ? "pool trade, delta-derived only" : "not a trade in this mint",
          venue: delta[0]?.venue ?? null,
        });
        continue;
      }
      // compare like for like: totals per direction, so a router splitting
      // one order across venues still reconciles
      const sum = (list, buy) =>
        list
          .filter((t) => t.isBuy === buy)
          .reduce((a, t) => ({ sol: a.sol + t.solLamports, tok: a.tok + t.tokenRaw }), {
            sol: 0n,
            tok: 0n,
          });
      let ok = true;
      const detail = [];
      for (const buy of [true, false]) {
        const c = sum(curve, buy);
        const d = sum(delta, buy);
        if (c.sol === 0n && d.sol === 0n) continue;
        // the venue's lamports also carry the protocol and creator fees,
        // which the event reports separately; a percent of tolerance covers
        // the fee split without hiding a real disagreement
        const near = (a, b) => {
          if (a === b) return true;
          const hi = a > b ? a : b;
          const lo = a > b ? b : a;
          return hi > 0n && (hi - lo) * 100n <= hi * 3n;
        };
        const solOk = near(c.sol, d.sol);
        const tokOk = near(c.tok, d.tok);
        if (!solOk || !tokOk) ok = false;
        detail.push({
          side: buy ? "buy" : "sell",
          eventSol: c.sol.toString(),
          deltaSol: d.sol.toString(),
          eventTokens: c.tok.toString(),
          deltaTokens: d.tok.toString(),
          solOk,
          tokOk,
        });
      }
      rows.push({ signature: bare, ok, trades: curve.length, detail });
    }
    return rows;
  }

  toEvent(t, signature, at, solUsd, nth) {
    const sol = Number(t.solLamports) / 1e9;
    const tokens = Number(t.tokenRaw) / 10 ** this.decimals;
    const usd = sol * solUsd;
    return normalise(
      {
        // ONE TRANSACTION CAN CARRY MORE THAN ONE TRADE (a router splitting
        // an order across pools). the primary key is the transaction, so a
        // second trade in the same signature needs its own key or the
        // database would silently drop it as a duplicate.
        tx: nth > 1 ? `${signature}:${nth}` : signature,
        kind: t.isBuy ? "buy" : "sell",
        at,
        wallet: t.user,
        amountUsd: Math.round(usd * 100) / 100,
        amountTokens: tokens,
        price: tokens > 0 ? usd / tokens : 0,
      },
      "solana"
    );
  }
}
