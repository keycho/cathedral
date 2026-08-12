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
import {
  AGENT_KEYS,
  CRIMSON,
  DARKIRON,
  DRESSED,
  DRESSEDWARM,
  GLASSLIGHT,
  GOLD,
  isAgentMaterial,
  isGeology,
  LANTERN,
  TEAL,
  VIOLET,
} from "./palette";
import { RULES } from "./rules";
import type { Strata } from "./strata";
import type { TickEngine } from "./ticks";
import type { VoxelField } from "./voxels";

const PATCH = 30; // blueprint frame is a PATCH x PATCH site
const API_TIMEOUT_MS = 45_000;

const ZONES: AgentName[] = ["architect", "surveyor", "mason"];
const ZONE_PALETTES: Record<AgentName, string> = {
  surveyor: "dressedwarm, lantern, gold (cairns, waymark lines, observatory perches above the meadow)",
  architect: "dressed, teal, glasslight, stillwater, lantern (formal, terraced, water gardens, glass galleries)",
  mason: "dressedwarm, violet, crimson, darkiron, lantern (yards, kilns, heavy courses, braced spans)",
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
  // window. the window is wall-time, so compressed ticks widen the count
  // (10 minutes of a 10x world is 200 ticks, not 20).
  private budget(): number {
    const ticksInWindow = Math.max(1, Math.round(RULES.crewBudgetWindowMs / this.ticks.tickLenMs));
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
          if (!isGeology(under) && !isAgentMaterial(under)) openCells++;
        }
      }
      const score = openCells - (maxH - minH) * 2 - r * 0.4;
      if (!best || score > best.score) best = { x: ax, z: az, score };
      // a fully qualified site is open AND wholly inside its territory,
      // so validation never trims the blueprint at a wedge border
      const cornersIn =
        zoneOf(ax, az) === zone &&
        zoneOf(ax + PATCH - 1, az) === zone &&
        zoneOf(ax, az + PATCH - 1) === zone &&
        zoneOf(ax + PATCH - 1, az + PATCH - 1) === zone;
      if (openCells >= probes * 0.72 && cornersIn && (!bestOpen || score > bestOpen.score)) {
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
        const t = this.field.typeAt(x, h - 1, z);
        const taken = isGeology(t) || isAgentMaterial(t);
        const offZone = zoneOf(x, z) !== zone;
        br.push(taken || offZone ? 1 : 0);
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

  // ---- simulated history ---------------------------------------------------

  // stage a pre-authored finished work for a zone: pick a site and run the
  // exact validation the live path runs. the caller (simulated history)
  // lays it instantly through the mason. the journal keeps its memo.
  async prepareCompleted(url: string, zone: AgentName): Promise<Blueprint | null> {
    try {
      const site = this.pickSite(zone);
      if (!site) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      const raw = await res.json();
      const bp = this.validate(raw, site, RULES.crewBudgetMax, this.strata.epoch);
      if (bp) this.planCount++;
      return bp;
    } catch {
      return null;
    }
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

  // the scripted generator honours the bible's mandate: a work, not a
  // decoration. a hollow tower a visitor can enter, a walled court with
  // lantern posts, an approach under an arch, all in the zone's palette.
  private scripted(site: Site, funded: number): Blueprint {
    const cells: { x: number; y: number; z: number; m: string }[] = [];
    const put = (x: number, y: number, z: number, m: number) => {
      const name = Object.keys(AGENT_KEYS).find((k) => AGENT_KEYS[k] === m) ?? "dressed";
      cells.push({ x, y, z, m: name });
    };
    const accent = site.zone === "architect" ? TEAL : site.zone === "mason" ? VIOLET : GOLD;
    const banner = site.zone === "mason" ? CRIMSON : GOLD;
    const body = site.zone === "architect" ? DRESSED : DRESSEDWARM;
    const post = site.zone === "mason" ? DARKIRON : DRESSED;
    const c = PATCH / 2;
    const hAt = (x: number, z: number) =>
      site.heights[Math.max(0, Math.min(PATCH - 1, z))][Math.max(0, Math.min(PATCH - 1, x))];
    const big = funded >= 220;
    const base = hAt(c, c);

    // grounds first: a paved court south of the tower, posts at its
    // corners, and an approach path running in under an arch
    const courtR = 4;
    const courtZ = c + 5;
    for (let dx = -courtR; dx <= courtR; dx++) {
      for (const dz of [-courtR, courtR]) {
        put(c + dx, hAt(c + dx, courtZ + dz), courtZ + dz, body);
        put(c + dz, hAt(c + dz, courtZ + dx), courtZ + dx, body);
      }
    }
    for (const [px, pz] of [
      [c - courtR, courtZ - courtR],
      [c + courtR, courtZ - courtR],
      [c - courtR, courtZ + courtR],
      [c + courtR, courtZ + courtR],
    ] as const) {
      const gy = hAt(px, pz);
      put(px, gy + 1, pz, post);
      put(px, gy + 2, pz, LANTERN);
    }
    for (let k = 1; k <= 5; k++) {
      put(c, hAt(c, courtZ + courtR + k), courtZ + courtR + k, body);
    }
    // the arch over the approach
    const az = courtZ + courtR + 2;
    const ay = hAt(c, az);
    for (let y = 1; y <= 3; y++) {
      put(c - 1, ay + y, az, post);
      put(c + 1, ay + y, az, post);
    }
    put(c - 1, ay + 4, az, accent);
    put(c, ay + 4, az, accent);
    put(c + 1, ay + 4, az, accent);

    // the screenshot object: a hollow 5x5 tower with a doorway onto the
    // court, a glasslight band, and a lantern crown
    const th = big ? 13 : 8;
    for (let y = 0; y < th; y++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          if (!edge) continue; // the interior stays open
          if (dx === 0 && dz === 2 && y < 3) continue; // the doorway, south
          const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
          let m = body;
          if (corner && y % 4 === 3) m = accent;
          if (!corner && y === Math.floor(th * 0.6)) m = GLASSLIGHT; // the band
          put(c + dx, base + 1 + y, c + dz, m);
        }
      }
    }
    // a floor to stand on and a threshold
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) put(c + dx, base, c + dz, body);
    }
    put(c, base, c + 2, accent);
    // the crown
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        put(c + dx, base + 1 + th, c + dz, (dx + dz + 200) % 2 === 0 ? LANTERN : banner);
      }
    }
    put(c, base + 2 + th, c, site.zone === "architect" ? GLASSLIGHT : LANTERN);

    const raw = {
      title: big ? "a court and its tower" : "a waymark court",
      memo: "grounds to arrive through, a doorway to stand in, a crown to find from far off.",
      blocks: cells,
    };
    return (
      this.validate(raw, site, funded, this.strata.epoch) ?? {
        planId: "plan-" + (this.planCount + 1),
        title: "a waymark court",
        zone: site.zone,
        cells: [],
      }
    );
  }
}
