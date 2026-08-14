// types for law.js, which is plain javascript on purpose — see the note at
// the top of that file. this declaration is what lets the vite app import it
// without the server needing a build step to read the same bytes.

export interface MarketEvent {
  tx: string;
  kind: "buy" | "sell" | "burn" | "newHolder";
  at: number;
  source: string;
  wallet: string | null;
  amountUsd: number;
  amountTokens: number;
  price: number;
}

export interface WireTick {
  n: number;
  netFlowUsd: number;
  grossVolumeUsd: number;
  uniqueWallets: number;
  largestTxUsd: number;
  close: number;
  buys: Record<string, number>;
  sells: Record<string, number>;
}

export interface Reconciliation {
  ok: boolean;
  checked: number;
  firstBad: number | null;
  missing: number[];
  extra: number[];
  mineDigest: string;
  theirsDigest: string;
}

export const TIMING: { tickMs: number; ticksPerEpoch: number };
export const KINDS: readonly string[];

export function tickAt(tsMs: number, genesisMs: number, tickMs?: number): number;
export function tickWindow(n: number, genesisMs: number, tickMs?: number): { from: number; to: number };
export function epochOf(tick: number, ticksPerEpoch?: number): number;
export function normalise(raw: unknown, source?: string): MarketEvent | null;
export function aggregate(events: MarketEvent[], n: number, closePrice?: number): WireTick;
export function tickDigest(t: WireTick): number;
export function chainDigest(ticks: WireTick[]): string;
export function reconcile(mine: WireTick[], theirs: WireTick[]): Reconciliation;
export function findGaps(ticks: WireTick[]): number[];
