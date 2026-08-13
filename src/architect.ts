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
import { AgentBody, zoneOf, type ZoneName } from "./crew";
import type { Journal } from "./journal";
import type { Blueprint, BlueprintCell, Mason } from "./mason";
import {
  AGENT_KEYS,
  LEAD,
  CREAM,
  CREAMWARM,
  GLASSLIGHT,
  isAgentMaterial,
  isGeology,
  isGround,
  LANTERN,
  TILE,
  TIMBER,
  TEAL,
} from "./palette";
import { catalogueText, expandCall, readCall } from "./components/catalogue";
import { Build } from "./components/kit";
import { RULES } from "./rules";
import type { Islands } from "./islands";
import type { Strata } from "./strata";
import type { TickEngine } from "./ticks";
import type { VoxelField } from "./voxels";

const PATCH = 30; // blueprint frame is a PATCH x PATCH site
const API_TIMEOUT_MS = 45_000;
const SKY_Y = 40; // above this is the sky realm: no wedge claims it

const ZONES: ZoneName[] = ["architect", "surveyor", "mason"];
const ZONE_PALETTES: Record<ZoneName, string> = {
  surveyor: "creamwarm, lantern, timber (cairns, waymark lines, observatory perches above the meadow)",
  architect: "cream, teal, glasslight, stillwater, lantern (formal, terraced, water gardens, glass galleries)",
  mason: "creamwarm, timber, tile, lead, lantern (yards, kilns, heavy courses, braced spans)",
};

interface Site {
  zone: ZoneName;
  anchorX: number; // cell of patch origin (corner)
  anchorZ: number;
  groundY: number; // y=0 of the blueprint frame
  heights: number[][]; // [z][x] surface height relative to groundY
  blocked: number[][]; // 1 = geology / hollow / off-zone: never build here
}

export class Architect {
  readonly body: AgentBody;
  lastMode: "claude" | "founding" | "scripted" | "ascent" | "idle" = "idle";
  // the sky realm (wired by main); when islands exist the architect keeps
  // one signature project alive: the ascent that joins the realms
  islands?: Islands;
  // the ascent knows only where it stands and how far it has come; its
  // height is measured from the world, never remembered
  private ascent: {
    anchorX: number;
    anchorZ: number;
    baseY: number;
    lastTop: number; // the height the world stood at when the last stage was drawn
    stage: number;
    done: boolean;
  } | null = null;
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
    // capped at the LARGER of the two register ceilings here; which one
    // actually applies depends on the site, and is decided in capFor
    return Math.min(RULES.crewBudgetTownMax, Math.floor(gross / RULES.crewBudgetUsdPerBlock));
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
      // THE STANDING BUDGET. every funded cycle puts a share aside for the
      // great work and the pot keeps it: a tier is around a thousand
      // blocks, which no single cycle's trailing volume will ever fund, and
      // squeezing it into one cycle's allowance is how a cathedral becomes
      // a shed. what the pot buys is time, not stone — at five seconds a
      // stone the ceiling is about a hundred minutes of continuous laying,
      // so a tier is an afternoon's work rather than a month's.
      this.greatWorkPot = Math.min(
        RULES.greatWorkBlocks,
        this.greatWorkPot + Math.floor(funded * RULES.greatWorkShare)
      );

      // the signature project takes every other funded cycle once the sky
      // has land in it: the ascent rises stage by stage until it crosses
      if (this.planCount % 2 === 1) {
        const asc = this.ascentBlueprint(this.spendGreatWork(), epoch);
        if (asc) {
          this.lastMode = "ascent";
          this.planCount++;
          this.mason.assign(asc);
          return;
        }
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

  private pickSite(zone: ZoneName): Site | null {
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
        // the SAME payload the review harness posts. these were two copies
        // of one object and the copies had already drifted; the catalogue
        // would have drifted next, and a live architect asking for parts it
        // was never told about is a silent way to lose every design.
        body: JSON.stringify(this.payloadFor(site, funded, epoch)),
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const raw = (await res.json()) as {
        title?: string;
        memo?: string;
        parts?: unknown[];
        blocks?: { x: number; y: number; z: number; m: string }[];
      };
      return this.validate(raw, site, funded, epoch, "claude");
    } catch {
      return null;
    }
  }

  private validate(
    raw: { title?: string; memo?: string; parts?: unknown[]; blocks?: { x: number; y: number; z: number; m: string }[] },
    site: Site,
    funded: number,
    epoch: number,
    source: "claude" | "founding" | "scripted" = "scripted"
  ): Blueprint | null {
    // A DESIGN IS A COMPOSITION FIRST. the architect names components and
    // where they go; the parts expand here, through the same Build the
    // mason's own compositions use, so a design gets the kit's dedupe and
    // its foundations-first ordering for free. raw cells are still read
    // when they are all that is offered — the founding blueprint on disk is
    // written that way — but nothing the architect sends should be.
    const ceiling = Math.min(funded, this.capFor(site));
    const local = this.composeParts(raw, ceiling);
    if (!local.length) return null;

    const cells: BlueprintCell[] = [];
    const seen = new Set<number>();
    for (const b of local) {
      if (cells.length >= ceiling) break;
      const lx = b.dx;
      const lz = b.dz;
      const ly = b.dy;
      if (lx < 0 || lx >= PATCH || lz < 0 || lz >= PATCH) continue;
      const material = b.m;
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
    this.journal.add("architect", epoch, `${title}. ${memo}`.trim(), source);
    return { planId: "plan-" + (this.planCount + 1), title, zone: site.zone, cells };
  }

  // the last composition read, so a review can see WHAT was named rather
  // than only how many stones came of it
  lastManifest: { component: string; instances: number }[] = [];
  lastUnknown: string[] = [];
  lastDropped = 0; // parts that would not fit the budget

  // the great work's standing allowance, carried across cycles
  greatWorkPot = 0;
  // draw the pot down for one stage of the great work. an ordinary
  // blueprint never touches this and is never capped by it.
  private spendGreatWork(): number {
    const spend = Math.min(this.greatWorkPot, RULES.greatWorkBlocks);
    this.greatWorkPot -= spend;
    return Math.max(RULES.crewBudgetIdleBelow, spend);
  }

  // turn a design into site-local cells. a composition goes through the
  // kit; a bare cell list is taken as written.
  private composeParts(
    raw: {
      parts?: unknown[];
      blocks?: { x: number; y: number; z: number; m: string }[];
    },
    budget: number
  ): { dx: number; dy: number; dz: number; m: number }[] {
    this.lastManifest = [];
    this.lastUnknown = [];
    this.lastDropped = 0;
    if (Array.isArray(raw?.parts) && raw.parts.length) {
      const b = new Build();
      // THE BUDGET CUTS WHOLE PARTS, NOT LAYERS. cutting the cell list at
      // the budget looked reasonable and was not: the kit hands back cells
      // sorted foundations-first, so a design whose grounds alone spent the
      // whole allowance came out as one flat plane of paving with no
      // building on it — 600 stones, five blocks tall, a car park. parts go
      // down in the order they were composed until the next one will not
      // fit, which leaves a smaller building rather than a bigger floor.
      for (const entry of raw.parts) {
        const call = readCall(entry);
        if (!call) continue;
        const part = expandCall(call);
        if (!part) {
          // a name that is not in the catalogue is the one thing worth
          // reporting: it means the design asked for something imaginary
          if (this.lastUnknown.length < 12) this.lastUnknown.push(call.c);
          continue;
        }
        if (b.count + part.length > budget) {
          this.lastDropped++;
          continue;
        }
        b.add(call.c, part);
      }
      this.lastManifest = b.manifest;
      return b.ordered;
    }
    if (!Array.isArray(raw?.blocks)) return [];
    const out: { dx: number; dy: number; dz: number; m: number }[] = [];
    for (const c of raw.blocks) {
      if (!c || typeof c.x !== "number" || typeof c.y !== "number" || typeof c.z !== "number") continue;
      const m = AGENT_KEYS[String(c.m ?? "dressed").toLowerCase()];
      if (m === undefined) continue;
      out.push({ dx: Math.round(c.x), dy: Math.round(c.y), dz: Math.round(c.z), m });
    }
    return out;
  }

  // ---- the ascent ----------------------------------------------------------

  // one law check for absolute (not patch-local) cells. below SKY_Y the
  // architect stays in its own wedge; the sky realm belongs to no wedge.
  private lawful(x: number, y: number, z: number): boolean {
    if (x < 4 || x >= GRID - 4 || z < 4 || z >= GRID - 4) return false;
    if (y < 1 || y >= MAXY - 2) return false;
    if (x === this.genesisCell.x && z === this.genesisCell.z) return false;
    if (this.field.isSolid(x, y, z)) return false;
    if (this.isHollow(x, y, z)) return false;
    if (y < SKY_Y && zoneOf(x, z) !== "architect") return false;
    return true;
  }

  // the persistent signature project: a spiral stair rising from the
  // architect's wedge, one stage per cycle, then a glasslight-railed
  // crossing onto the nearest island. stunning from below is the point:
  // every stage carries lantern and glasslight the meadow can see.
  private ascentBlueprint(funded: number, epoch: number): Blueprint | null {
    if (!this.islands || this.islands.count === 0) return null;
    if (this.ascent?.done) return null;

    // anchor once: open ground in the architect's own wedge, as near the
    // island's shadow as the wedge allows. the island may hang over any
    // territory; the crossing spans the distance in the sky realm.
    if (!this.ascent) {
      const isl = this.islands.nearestTo(this.genesisCell.x, this.genesisCell.z);
      if (!isl) return null;
      let anchor: { x: number; z: number } | null = null;
      let bd = Infinity;
      for (let k = 0; k < 300; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 40;
        const x = Math.round(this.genesisCell.x + Math.cos(ang) * r);
        const z = Math.round(this.genesisCell.z + Math.sin(ang) * r);
        if (x < 12 || x >= GRID - 12 || z < 12 || z >= GRID - 12) continue;
        if (zoneOf(x, z) !== "architect") continue;
        const h = this.field.topAt(x, z);
        // the ascent starts on open ground, never on the market's stone,
        // another work, or a column standing under an island
        if (h >= SKY_Y) continue;
        if (!isGround(this.field.typeAt(x, h - 1, z))) continue;
        const d = Math.hypot(x - isl.cx, z - isl.cz);
        if (d < bd) {
          bd = d;
          anchor = { x, z };
        }
      }
      if (!anchor) return null;
      const baseY = this.field.topAt(anchor.x, anchor.z);
      this.ascent = { anchorX: anchor.x, anchorZ: anchor.z, baseY, lastTop: baseY - 1, stage: 0, done: false };
    }

    const a = this.ascent;
    // how high the ascent actually stands, measured from the mast's own
    // column: a stage the mason could not finish is drawn again, never
    // skipped over
    const topY = Math.max(a.baseY, this.field.topAt(a.anchorX, a.anchorZ));

    // a stage that did not lift the world is a stage the mason could not
    // build: the footing is wrong, so the architect leaves it standing as
    // it is and starts the ascent again on better ground
    if (a.stage > 0 && topY <= a.lastTop) {
      this.journal.add("architect", epoch, "the stair would not rise there. the ascent begins again on better ground.");
      this.ascent = null;
      return null;
    }
    const isl = this.islands.nearestTo(a.anchorX, a.anchorZ);
    if (!isl) return null;
    const cells: BlueprintCell[] = [];
    const put = (x: number, y: number, z: number, m: number) => {
      // the GREAT WORK's ceiling, not the ordinary one. clamping this to
      // crewBudgetMax made the standing pot pointless: it could hold twelve
      // hundred blocks and still only ever spend six hundred of them.
      if (cells.length >= Math.min(funded, RULES.greatWorkBlocks)) return;
      if (!this.lawful(x, y, z)) return;
      cells.push({ x, y, z, material: m });
    };

    const targetY = isl.baseY + 2; // the island's walking surface
    let title: string;
    if (topY + 1 >= targetY) {
      // the crossing: a two-wide deck with glasslight rails to the island
      const y = targetY;
      const dx = isl.cx - a.anchorX;
      const dz = isl.cz - a.anchorZ;
      const len = Math.max(Math.abs(dx), Math.abs(dz));
      for (let k = 0; k <= len + 2; k++) {
        const x = Math.round(a.anchorX + (dx * k) / Math.max(1, len));
        const z = Math.round(a.anchorZ + (dz * k) / Math.max(1, len));
        if (this.field.isSolid(x, y, z)) {
          // the tower's own crown is solid: step out through it, and stop
          // only once the deck has met the island's stone
          if (k > 3) break;
          continue;
        }
        const px = Math.abs(dx) > Math.abs(dz) ? 0 : 1; // deck runs 2 wide
        put(x, y, z, CREAM);
        put(x + px, y, z + (1 - px), CREAM);
        if (k % 3 === 0) put(x - px, y + 1, z - (1 - px), GLASSLIGHT);
      }
      if (!cells.length) return null; // the span is already there, or blocked
      a.done = true;
      title = "the ascent, the crossing";
      this.journal.add("architect", epoch, "the crossing is laid. the realms are joined.");
    } else {
      // one stage of the spiral: a loop of steps around the mast, +8 rise
      const ring: [number, number][] = [];
      for (let i = -2; i <= 2; i++) ring.push([i, -2]);
      for (let i = -1; i <= 2; i++) ring.push([2, i]);
      for (let i = 1; i >= -2; i--) ring.push([i, 2]);
      for (let i = 1; i >= -1; i--) ring.push([-2, i]);
      if (a.stage === 0) {
        // grounds first: a pad and lantern posts at the foot. the pad
        // follows the ground it sits on, and a column that runs away
        // upward (one standing under an island) is left alone.
        const padY = (x: number, z: number): number | null => {
          const h = this.field.topAt(x, z);
          return Math.abs(h - a.baseY) <= 3 ? h : null;
        };
        for (let dx = -3; dx <= 3; dx++) {
          for (let dz = -3; dz <= 3; dz++) {
            if (Math.abs(dx) !== 3 && Math.abs(dz) !== 3) continue;
            const y = padY(a.anchorX + dx, a.anchorZ + dz);
            if (y !== null) put(a.anchorX + dx, y, a.anchorZ + dz, CREAM);
          }
        }
        for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) {
          const y = padY(a.anchorX + px, a.anchorZ + pz);
          if (y !== null) put(a.anchorX + px, y + 1, a.anchorZ + pz, LANTERN);
        }
      }
      // the mast first, banded in glasslight so the stair glows from the
      // meadow: a stage clipped by a thin budget still lifts the tower, and
      // the next cycle carries on from the height that actually stands
      for (let y = topY + 1; y <= topY + 8; y++) {
        put(a.anchorX, y, a.anchorZ, y % 5 === 0 ? GLASSLIGHT : CREAM);
      }
      put(a.anchorX, topY + 9, a.anchorZ, LANTERN);
      // then the stair winding around it, one step per two cells
      for (let k = 0; k < ring.length; k++) {
        const y = topY + 1 + Math.floor(k / 2);
        put(a.anchorX + ring[k][0], y, a.anchorZ + ring[k][1], k % 5 === 4 ? TEAL : CREAM);
      }
      if (!cells.length) return null; // nothing lawful here; the state stands
      a.stage++;
      a.lastTop = topY;
      const left = targetY - (topY + 8);
      title = `the ascent, stage ${a.stage}`;
      this.journal.add(
        "architect",
        epoch,
        `the ascent climbs. stage ${a.stage}, ${left > 0 ? left + " blocks below the island" : "the island within reach"}.`,
        "ascent"
      );
    }

    if (!cells.length) return null;
    return { planId: "ascent-" + a.stage + (a.done ? "-crossing" : ""), title, zone: "architect", cells };
  }

  // ---- simulated history ---------------------------------------------------

  // stage a pre-authored finished work for a zone: pick a site and run the
  // exact validation the live path runs. the caller (simulated history)
  // lays it instantly through the mason. the journal keeps its memo.
  async prepareCompleted(url: string, zone: ZoneName): Promise<Blueprint | null> {
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

  // ---- the brain seam ------------------------------------------------------

  // the payload the architect would post for a fresh site in a zone. handed
  // out so a brain that lives outside the browser (the deployed endpoint
  // during a review, an sdk agent in phase 3) can answer it.
  snapshotSite(zone: ZoneName, epoch: number): { site: Site; payload: unknown } | null {
    const site = this.pickSite(zone);
    if (!site) return null;
    const funded = Math.max(RULES.crewBudgetIdleBelow, this.budget());
    return { site, payload: this.payloadFor(site, funded, epoch) };
  }

  // the height the flats give way to the heights: the median of the world's
  // own surface, sampled once and kept.
  //
  // this was the founding stone's column plus five, which is how every site
  // in the world came back as town register — the genesis cell has a
  // monument standing on it, so topAt there reports the top of the monument
  // (24) and no site on the hillside (7 to 14) could clear it. measure the
  // GROUND, and measure it everywhere, not at the one cell guaranteed to
  // have a building on it.
  private registerOf(site: Site): "temple" | "town" {
    return site.groundY <= this.flatsLine() ? "town" : "temple";
  }
  // a street gets a bigger allowance than a hall, because it is a bigger
  // object made of smaller parts
  private capFor(site: Site): number {
    return this.registerOf(site) === "town" ? RULES.crewBudgetTownMax : RULES.crewBudgetMax;
  }

  private flatsY?: number;
  private flatsLine(): number {
    if (this.flatsY !== undefined) return this.flatsY;
    const h: number[] = [];
    for (let x = 8; x < GRID - 8; x += 4) for (let z = 8; z < GRID - 8; z += 4) h.push(this.field.topAt(x, z));
    h.sort((a, b) => a - b);
    this.flatsY = h.length ? h[Math.floor(h.length / 2)] : 8;
    return this.flatsY;
  }

  // everything the brain is told about a site, in ONE place.
  private payloadFor(site: Site, funded: number, epoch: number) {
    // WHICH REGISTER THIS SITE IS IN, decided by altitude, because that is
    // the line the two registers were drawn along: the town is the flats,
    // the temple is everything that climbs away from them. the architect is
    // handed one vocabulary, not both, so it cannot mix them in one work.
    const register = this.registerOf(site);
    return {
      zone: site.zone,
      palette: ZONE_PALETTES[site.zone],
      register,
      catalogue: catalogueText(register),
      budget: Math.min(funded, this.capFor(site)),
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
    };
  }

  // a design from that brain, validated against exactly the same law the
  // live path applies, then handed to the mason
  acceptBlueprint(
    raw: { title?: string; memo?: string; parts?: unknown[]; blocks?: { x: number; y: number; z: number; m: string }[] },
    site: Site,
    epoch: number,
    source: "claude" | "founding" | "scripted" = "claude"
  ): Blueprint | null {
    const funded = Math.max(RULES.crewBudgetIdleBelow, this.budget());
    const bp = this.validate(raw, site, funded, epoch, source);
    if (!bp) return null;
    this.planCount++;
    this.lastMode = source;
    this.mason.assign(bp);
    return bp;
  }

  // ---- fallbacks -----------------------------------------------------------

  private async foundingBlueprint(site: Site, funded: number): Promise<Blueprint | null> {
    try {
      const res = await fetch("./blueprints/founding.json");
      if (!res.ok) return null;
      const raw = await res.json();
      return this.validate(raw, site, funded, this.strata.epoch, "founding");
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
    const accent = site.zone === "architect" ? TEAL : site.zone === "mason" ? TILE : TIMBER;
    const banner = site.zone === "mason" ? TILE : CREAMWARM;
    const body = site.zone === "architect" ? CREAM : CREAMWARM;
    const post = site.zone === "mason" ? LEAD : CREAM;
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
