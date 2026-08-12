// cathedral - the architect. every cycle (6 epochs; hourly at the
// constitution's cadence) it gathers the surveyor's notes, the market's
// tick aggregates and a snapshot of a chosen site, and asks claude for a
// BLUEPRINT: ordered block placements in the crew's materials, with a
// design memo, judged against the style bible. the call runs server-side
// (/api/architect holds the key); the browser never sees a credential.
// every returned cell is validated here against the law (air only, own
// territory only, never geology, never the founding stone, never hollow)
// and clamped to the volume-funded budget before the mason gets it.
//
// when the api is absent (no key set, local dev) the same interface is
// served by the founding blueprint on the first cycle and by a scripted
// generator after that, so the world never stalls.

import * as THREE from "three";
import { GRID, MAXY } from "./config";
import { AgentBody, zoneOf, type AgentName } from "./crew";
import type { Journal } from "./journal";
import type { Blueprint, BlueprintCell, Mason } from "./mason";
import { AGENT_KEYS, CRIMSON, DRESSED, GLASSLIGHT, GOLD, isGeology, LANTERN, TEAL, VIOLET } from "./palette";
import { RULES } from "./rules";
import type { Strata } from "./strata";
import type { TickEngine } from "./ticks";
import type { VoxelField } from "./voxels";

const PATCH = 22; // blueprint frame is a PATCH x PATCH site
const API_TIMEOUT_MS = 45_000;

const ZONES: AgentName[] = ["architect", "surveyor", "mason"];
const ZONE_PALETTES: Record<AgentName, string> = {
  surveyor: "dressed, lantern, gold (ash and lantern: sparse waymarks, light)",
  architect: "dressed, teal, glasslight, stillwater, lantern (teal and glass: formal, terraced, water)",
  mason: "dressed, violet, crimson, lantern (violet and crimson: heavy courses, yards, banners)",
};

interface Site {
  zone: AgentName;
  anchorX: number; // cell of patch origin (corner)
  anchorZ: number;
  groundY: number; // y=0 of the blueprint frame
  heights: number[][]; // [z][x] surface height relative to groundY
  blocked: number[][]; // 1 = geology / hollow / off-zone: never build here
}

export class Architect {
  readonly body: AgentBody;
  lastMode: "claude" | "founding" | "scripted" | "idle" = "idle";
  private planCount = 0;
  private lastPlanEpoch = -999;
  private cycling = false;

  constructor(
    scene: THREE.Scene,
    private field: VoxelField,
    private strata: Strata,
    private ticks: TickEngine,
    private journal: Journal,
    private mason: Mason,
    private isHollow: (x: number, y: number, z: number) => boolean,
    private genesisCell: { x: number; z: number },
    home: { x: number; z: number }
  ) {
    this.body = new AgentBody("architect", field, home.x, home.z, scene);
  }

  onEpoch(epoch: number) {
    const due = epoch - this.lastPlanEpoch >= RULES.architectEpochs || (this.planCount === 0 && epoch >= 1);
    if (due && !this.cycling) {
      this.lastPlanEpoch = epoch;
      void this.cycle(epoch);
    }
  }

  // the volume that funds the crew: gross usd across the trailing budget
  // window's worth of ticks
  private budget(): number {
    const ticksInWindow = Math.round(RULES.crewBudgetWindowMs / RULES.tickMs);
    let gross = 0;
    for (const s of this.ticks.history.slice(-ticksInWindow)) gross += s.grossVolumeUsd;
    return Math.min(RULES.crewBudgetMax, Math.floor(gross / RULES.crewBudgetUsdPerBlock));
  }

  private async cycle(epoch: number) {
    this.cycling = true;
    try {
      // never bury the mason: one plan in hand, one on the bench, no more
      if (this.mason.backlog >= 2) return;
      const funded = this.budget();
      if (funded < RULES.crewBudgetIdleBelow) {
        this.lastMode = "idle";
        this.journal.add("architect", epoch, "the market is quiet. the crew tends what stands.");
        return;
      }
      const zone = ZONES[this.planCount % ZONES.length];
      const site = this.pickSite(zone);
      if (!site) return;

      // walk to survey the site while the design comes together
      this.body.walkTo(site.anchorX + PATCH / 2, site.anchorZ + PATCH / 2);

      let bp: Blueprint | null = await this.askClaude(site, funded, epoch);
      if (bp) this.lastMode = "claude";
      if (!bp && this.planCount === 0) {
        bp = await this.foundingBlueprint(site, funded);
        if (bp) this.lastMode = "founding";
      }
      if (!bp) {
        bp = this.scripted(site, funded);
        this.lastMode = "scripted";
      }
      if (!bp || !bp.cells.length) return;
      this.planCount++;
      this.mason.assign(bp);
    } finally {
      this.cycling = false;
    }
  }

  // ---- site + snapshot -----------------------------------------------------

  private pickSite(zone: AgentName): Site | null {
    // the mass grows with age: seek open ground from the near ring out to
    // well past a large world's edge, requiring genuinely buildable sites
    // (an aged mass swallows the near ring entirely)
    let best: { x: number; z: number; score: number } | null = null;
    let bestOpen: { x: number; z: number; score: number } | null = null;
    const probes = 64; // 8x8 sampling of the patch
    for (let k = 0; k < 140; k++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 34;
      const cx = Math.round(this.genesisCell.x + Math.cos(ang) * r);
      const cz = Math.round(this.genesisCell.z + Math.sin(ang) * r);
      const ax = cx - PATCH / 2;
      const az = cz - PATCH / 2;
      if (ax < 8 || ax + PATCH >= GRID - 8 || az < 8 || az + PATCH >= GRID - 8) continue;
      if (zoneOf(cx, cz) !== zone) continue;
      let minH = Infinity;
      let maxH = 0;
      let openCells = 0;
      for (let dz = 0; dz < PATCH; dz += 3) {
        for (let dx = 0; dx < PATCH; dx += 3) {
          const h = this.field.topAt(ax + dx, az + dz);
          minH = Math.min(minH, h);
          maxH = Math.max(maxH, h);
          const under = this.field.typeAt(ax + dx, h - 1, az + dz);
          if (!isGeology(under)) openCells++;
        }
      }
      const score = openCells - (maxH - minH) * 2 - r * 0.4;
      if (!best || score > best.score) best = { x: ax, z: az, score };
      if (openCells >= probes * 0.72 && (!bestOpen || score > bestOpen.score)) {
        bestOpen = { x: ax, z: az, score };
      }
    }
    best = bestOpen ?? best;
    if (!best) return null;

    const groundY = this.field.topAt(best.x + PATCH / 2, best.z + PATCH / 2);
    const heights: number[][] = [];
    const blocked: number[][] = [];
    for (let dz = 0; dz < PATCH; dz++) {
      const hr: number[] = [];
      const br: number[] = [];
      for (let dx = 0; dx < PATCH; dx++) {
        const x = best.x + dx;
        const z = best.z + dz;
        const h = this.field.topAt(x, z);
        hr.push(h - groundY);
        const geo = isGeology(this.field.typeAt(x, h - 1, z));
        const offZone = zoneOf(x, z) !== zone;
        br.push(geo || offZone ? 1 : 0);
      }
      heights.push(hr);
      blocked.push(br);
    }
    return { zone, anchorX: best.x, anchorZ: best.z, groundY, heights, blocked };
  }

  // ---- the claude call -----------------------------------------------------

  private async askClaude(site: Site, funded: number, epoch: number): Promise<Blueprint | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      const res = await fetch("/api/architect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          zone: site.zone,
          palette: ZONE_PALETTES[site.zone],
          budget: Math.min(funded, RULES.crewBudgetMax),
          patch: PATCH,
          heights: site.heights,
          blocked: site.blocked,
          notes: this.journal.notesBy("surveyor", 5),
          aggregates: this.ticks.history.slice(-10).map((s) => ({
            tick: s.n,
            net: Math.round(s.netFlowUsd),
            gross: Math.round(s.grossVolumeUsd),
            wallets: s.uniqueWallets,
          })),
          epoch,
        }),
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const raw = (await res.json()) as {
        title?: string;
        memo?: string;
        blocks?: { x: number; y: number; z: number; m: string }[];
      };
      return this.validate(raw, site, funded, epoch);
    } catch {
      return null;
    }
  }

  private validate(
    raw: { title?: string; memo?: string; blocks?: { x: number; y: number; z: number; m: string }[] },
    site: Site,
    funded: number,
    epoch: number
  ): Blueprint | null {
    if (!raw || !Array.isArray(raw.blocks) || !raw.blocks.length) return null;
    const cells: BlueprintCell[] = [];
    const seen = new Set<number>();
    for (const b of raw.blocks) {
      if (cells.length >= Math.min(funded, RULES.crewBudgetMax)) break;
      if (!b || typeof b.x !== "number" || typeof b.y !== "number" || typeof b.z !== "number") continue;
      const lx = Math.round(b.x);
      const lz = Math.round(b.z);
      const ly = Math.round(b.y);
      if (lx < 0 || lx >= PATCH || lz < 0 || lz >= PATCH) continue;
      const material = AGENT_KEYS[String(b.m ?? "dressed").toLowerCase()];
      if (material === undefined) continue;
      const x = site.anchorX + lx;
      const z = site.anchorZ + lz;
      const y = site.groundY + ly;
      if (y < 1 || y >= MAXY - 2) continue;
      if (zoneOf(x, z) !== site.zone) continue;
      if (x === this.genesisCell.x && z === this.genesisCell.z) continue;
      if (this.field.isSolid(x, y, z)) continue; // air only, never geology
      if (this.isHollow(x, y, z)) continue; // never inside a burn
      const key = (x * GRID + z) * MAXY + y;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push({ x, y, z, material });
    }
    if (!cells.length) return null;
    const title = (raw.title ?? "untitled work").toLowerCase().slice(0, 48);
    const memo = (raw.memo ?? "").toLowerCase().slice(0, 160);
    this.journal.add("architect", epoch, `${title}. ${memo}`.trim());
    return { planId: "plan-" + (this.planCount + 1), title, zone: site.zone, cells };
  }

  // ---- fallbacks -----------------------------------------------------------

  private async foundingBlueprint(site: Site, funded: number): Promise<Blueprint | null> {
    try {
      const res = await fetch("./blueprints/founding.json");
      if (!res.ok) return null;
      const raw = await res.json();
      return this.validate(raw, site, funded, this.strata.epoch);
    } catch {
      return null;
    }
  }

  // the scripted generator honours the bible's mandate: there is always a
  // tower or an arch worth looking at, in the zone's own palette
  private scripted(site: Site, funded: number): Blueprint {
    const cells: { x: number; y: number; z: number; m: string }[] = [];
    const put = (x: number, y: number, z: number, m: number) => {
      const name = Object.keys(AGENT_KEYS).find((k) => AGENT_KEYS[k] === m) ?? "dressed";
      cells.push({ x, y, z, m: name });
    };
    const accent = site.zone === "architect" ? TEAL : site.zone === "mason" ? VIOLET : GOLD;
    const banner = site.zone === "mason" ? CRIMSON : GOLD;
    const c = PATCH / 2;
    const hAt = (x: number, z: number) => site.heights[Math.max(0, Math.min(PATCH - 1, z))][Math.max(0, Math.min(PATCH - 1, x))];

    // a tower with a lantern crown
    const th = funded > 120 ? 9 : 6;
    const base = hAt(c, c);
    for (let y = 0; y < th; y++) {
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        put(c + dx, base + y, c + dz, y % 4 === 3 ? accent : DRESSED);
      }
    }
    put(c, base + th, c, LANTERN);
    put(c + 1, base + th, c + 1, site.zone === "architect" ? GLASSLIGHT : banner);
    // an arch facing the founding stone
    const ax = c - 4;
    for (let y = 0; y < 4; y++) {
      put(ax, hAt(ax, c) + y, c - 1, DRESSED);
      put(ax, hAt(ax, c + 1) + y, c + 2, DRESSED);
    }
    put(ax, hAt(ax, c) + 4, c, accent);
    put(ax, hAt(ax, c) + 4, c + 1, accent);
    put(ax, hAt(ax, c) + 4, c - 1, DRESSED);
    put(ax, hAt(ax, c) + 4, c + 2, DRESSED);
    // waymark lanterns
    for (const [dx, dz] of [[-6, -5], [5, 6], [-5, 6], [6, -5]] as const) {
      put(c + dx, hAt(c + dx, c + dz), c + dz, DRESSED);
      put(c + dx, hAt(c + dx, c + dz) + 1, c + dz, LANTERN);
    }
    const raw = {
      title: "a waymark tower",
      memo: "a tower to find your way back to, and an arch to pass under.",
      blocks: cells,
    };
    return (
      this.validate(raw, site, funded, this.strata.epoch) ?? {
        planId: "plan-" + (this.planCount + 1),
        title: "a waymark tower",
        zone: site.zone,
        cells: [],
      }
    );
  }
}
