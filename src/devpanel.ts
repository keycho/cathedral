// cathedral - the market dev panel (phase 1 tooling; retired when the real
// indexer lands). drives the synthetic feed: event rate, buy/sell bias,
// manual buy / sell / whale / burn, an epoch clock readout with a fast
// mode for judging strata, live counters and the event log. built
// imperatively into #panel; ` or the header collapses it.

import type { Feed, FeedEvent } from "./feed";
import type { Growth } from "./growth";
import { RULES } from "./rules";
import type { Strata } from "./strata";
import type { TickEngine } from "./ticks";

const FAST_TICK_MS = 3_000; // dev compression: 10x time
const UPDATE_MS = 250;

function el(tag: string, cls: string, parent: HTMLElement, text = ""): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}

function fmtUsd(v: number): string {
  return "$" + Math.round(v);
}
function fmtTokens(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "m";
  if (v >= 1e3) return Math.round(v / 1e3) + "k";
  return String(v);
}
function fmtClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export class DevPanel {
  // main wires this to the mason's live status
  crewLine?: () => string;

  private root: HTMLElement;
  private body: HTMLElement;
  private rateOut: HTMLElement;
  private biasOut: HTMLElement;
  private clockOut: HTMLElement;
  private fastBtn: HTMLElement;
  private stormBtn: HTMLElement;
  private statsOut: HTMLElement;
  private logList: HTMLElement;
  private lastUpdate = 0;
  private lastLogged: FeedEvent | null = null;
  private fast = false;

  constructor(
    private feed: Feed,
    private strata: Strata,
    private growth: Growth,
    private ticks: TickEngine
  ) {
    this.root = document.getElementById("panel") as HTMLElement;
    const head = el("div", "pn-head", this.root);
    el("span", "pn-title", head, "market feed");
    el("span", "pn-fold", head, "–");
    this.body = el("div", "pn-body", this.root);
    head.addEventListener("click", () => this.root.classList.toggle("folded"));
    window.addEventListener("keydown", (e) => {
      if (e.code === "Backquote") this.root.classList.toggle("folded");
    });

    // rate (log scale 10 .. 5000 events/hr)
    const rateRow = el("div", "pn-row", this.body);
    el("span", "pn-label", rateRow, "rate");
    this.rateOut = el("span", "pn-value", rateRow);
    const rate = document.createElement("input");
    rate.type = "range";
    rate.min = "0";
    rate.max = "1000";
    rate.value = String(Math.round((Math.log(this.feed.ratePerHour / 10) / Math.log(500)) * 1000));
    rate.addEventListener("input", () => {
      this.feed.setRate(10 * Math.pow(500, Number(rate.value) / 1000));
      this.refreshControls();
    });
    this.body.appendChild(rate);

    // buy/sell bias
    const biasRow = el("div", "pn-row", this.body);
    el("span", "pn-label", biasRow, "bias");
    this.biasOut = el("span", "pn-value", biasRow);
    const bias = document.createElement("input");
    bias.type = "range";
    bias.min = "0";
    bias.max = "100";
    bias.value = String(Math.round(this.feed.buyBias * 100));
    bias.addEventListener("input", () => {
      this.feed.buyBias = Number(bias.value) / 100;
      this.refreshControls();
    });
    this.body.appendChild(bias);

    // manual injections
    const btns = el("div", "pn-btns", this.body);
    for (const kind of ["buy", "sell", "whale", "burn"] as const) {
      const b = el("button", "pn-btn pn-" + kind, btns, kind);
      b.addEventListener("click", () => this.feed.manual(kind));
    }
    // the storm test: 30s of compressed violent market
    const stormRow = el("div", "pn-btns", this.body);
    this.stormBtn = el("button", "pn-btn pn-storm", stormRow, "storm");
    this.stormBtn.addEventListener("click", () => this.feed.storm());

    // the world clock (fast mode compresses ticks 10x, and epochs,
    // collapse and subsidence compress with them; the constitution's
    // cadence is the default)
    const clockRow = el("div", "pn-row", this.body);
    el("span", "pn-label", clockRow, "epoch");
    this.clockOut = el("span", "pn-value", clockRow);
    this.fastBtn = el("button", "pn-btn pn-toggle", clockRow, "fast");
    this.fastBtn.addEventListener("click", () => {
      this.fast = !this.fast;
      this.ticks.setTickMs(this.fast ? FAST_TICK_MS : RULES.tickMs);
      this.fastBtn.classList.toggle("on", this.fast);
    });

    // counters
    this.statsOut = el("div", "pn-stats", this.body);

    // event log
    this.logList = el("div", "pn-log", this.body);

    this.refreshControls();
  }

  private refreshControls() {
    this.rateOut.textContent = this.feed.ratePerHour + " / hr";
    this.biasOut.textContent = "buy " + Math.round(this.feed.buyBias * 100) + "%";
  }

  private line(ev: FeedEvent): string {
    switch (ev.kind) {
      case "buy":
        return "buy " + fmtUsd(ev.amountUsd) + "  " + this.feed.short(ev.wallet);
      case "sell":
        return "sell " + fmtUsd(ev.amountUsd) + "  " + this.feed.short(ev.wallet);
      case "burn":
        return "burn " + fmtTokens(ev.amountTokens);
      case "newHolder":
        return "holder " + this.feed.short(ev.wallet);
    }
  }

  update(now: number) {
    if (now - this.lastUpdate < UPDATE_MS) return;
    this.lastUpdate = now;

    this.clockOut.textContent =
      this.strata.epoch +
      " · tick " +
      this.ticks.tick +
      " · " +
      fmtClock(this.ticks.msToNextEpoch(now));

    const stormMs = this.feed.stormRemaining(performance.now());
    this.stormBtn.textContent = stormMs > 0 ? "storm " + Math.ceil(stormMs / 1000) : "storm";
    this.stormBtn.classList.toggle("on", stormMs > 0);

    // holders = wallets that OWN standing blocks (the pubkey pool is not
    // a holder count; a fresh world has zero holders)
    const crew = this.crewLine ? "\n" + this.crewLine() : "";
    this.statsOut.textContent =
      "blocks " +
      this.strata.blockCount +
      " · holders " +
      this.strata.holderCount +
      " · queued " +
      this.growth.pending +
      crew;

    // re-render the log only when a new event arrived
    const latest = this.feed.log[this.feed.log.length - 1] ?? null;
    if (latest !== this.lastLogged) {
      this.lastLogged = latest;
      this.logList.innerHTML = "";
      const recent = this.feed.log.slice(-9).reverse();
      for (const ev of recent) {
        el("div", "pn-ev pn-" + ev.kind, this.logList, this.line(ev));
      }
    }
  }
}
