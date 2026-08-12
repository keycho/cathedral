// cathedral - the mason. it executes blueprints exactly, block by block, at
// a watchable pace: walk to the site, set the stone, next. repairs always
// come first: any crew block the market breaks goes back up before new
// work continues. lantern blocks get their light as they are set.

import * as THREE from "three";
import { GRID } from "./config";
import { AgentBody, AGENT_WALLET, CrewWorks, type AgentName } from "./crew";
import type { Journal } from "./journal";
import type { Kinetics } from "./kinetics";
import { blockColor, LANTERN } from "./palette";
import { RULES } from "./rules";
import type { Strata } from "./strata";
import type { VoxelField } from "./voxels";

export interface BlueprintCell {
  x: number;
  y: number;
  z: number;
  material: number;
}
export interface Blueprint {
  planId: string;
  title: string;
  zone: AgentName;
  cells: BlueprintCell[];
}

const REACH = 3.6; // the mason sets stone within this of its feet

export class Mason {
  readonly body: AgentBody;
  paceMs: number = RULES.agentBlockMs; // dev-tunable; the law is the default
  private queue: Blueprint[] = [];
  private cursor = 0;
  private repairs: BlueprintCell[] = [];
  private lastPlace = 0;
  private walkTarget: { x: number; z: number } | null = null;
  private walkFailedAt = 0;

  constructor(
    scene: THREE.Scene,
    private field: VoxelField,
    private strata: Strata,
    private works: CrewWorks,
    private kinetics: Kinetics,
    private journal: Journal,
    home: { x: number; z: number }
  ) {
    this.body = new AgentBody("mason", field, home.x, home.z, scene);
  }

  assign(bp: Blueprint) {
    this.queue.push(bp);
  }
  repair(cell: BlueprintCell) {
    this.repairs.push(cell);
  }
  get busy(): boolean {
    return this.repairs.length > 0 || this.queue.length > 0;
  }
  get backlog(): number {
    return this.queue.length;
  }
  get status(): string {
    if (this.repairs.length) return `mason: repairing ${this.repairs.length}`;
    const bp = this.queue[0];
    if (!bp) return "mason: idle";
    return `mason: ${bp.title} ${this.cursor}/${bp.cells.length}`;
  }

  private nextCell(): BlueprintCell | null {
    if (this.repairs.length) return this.repairs[0];
    const bp = this.queue[0];
    if (!bp) return null;
    if (this.cursor >= bp.cells.length) {
      this.journal.add("mason", this.strata.epoch, `set the last stone of ${bp.title}.`);
      this.queue.shift();
      this.cursor = 0;
      return this.nextCell();
    }
    return bp.cells[this.cursor];
  }

  private advance(placed: boolean) {
    if (this.repairs.length) {
      this.repairs.shift();
      return;
    }
    this.cursor++;
    void placed;
  }

  private inReach(c: BlueprintCell): boolean {
    const wx = c.x - GRID / 2 + 0.5;
    const wz = c.z - GRID / 2 + 0.5;
    return Math.hypot(wx - this.body.x, wz - this.body.z) <= REACH && Math.abs(c.y - this.body.y) <= 4;
  }

  private place(c: BlueprintCell, zone: AgentName, planId: string, title: string, now: number) {
    this.lastPlace = now;
    // the world may have changed since the blueprint was drawn: a filled
    // cell is skipped, not fought
    if (this.field.isSolid(c.x, c.y, c.z)) {
      this.advance(false);
      return;
    }
    this.advance(true);
    this.kinetics.drop(
      c.x,
      c.z,
      blockColor(c.material),
      () => {
        if (!this.field.placeAt(c.x, c.y, c.z, c.material)) return;
        // lock BEFORE registering: register tints unlocked cells with the
        // strata epoch colour, and dressed stone is not geology
        this.strata.lock(c.x, c.y, c.z);
        this.strata.register(c.x, c.y, c.z, AGENT_WALLET, planId);
        this.works.add(c.x, c.y, c.z, c.material, planId, title, zone);
        if (c.material === LANTERN) this.works.addLantern(c.x, c.y, c.z);
      },
      { stopY: c.y, from: 2.6 }
    );
  }

  update(now: number) {
    const c = this.nextCell();
    if (!c) return;

    if (this.inReach(c)) {
      this.walkTarget = null;
      if (now - this.lastPlace >= this.paceMs) {
        const bp = this.queue[0];
        const repairing = this.repairs.length > 0;
        this.place(
          c,
          bp?.zone ?? "mason",
          repairing ? "repair" : bp?.planId ?? "repair",
          repairing ? "a repair" : bp?.title ?? "a repair",
          now
        );
      }
      return;
    }

    // walk to a column beside the stone
    if (this.body.moving) return;
    if (this.walkTarget && this.walkTarget.x === c.x && this.walkTarget.z === c.z) {
      // arrived as close as the route allows; if still out of reach, place
      // anyway after a beat (the mason leans out) rather than stalling
      if (now - this.lastPlace >= this.paceMs * 1.5) {
        const bp = this.queue[0];
        const repairing = this.repairs.length > 0;
        this.place(
          c,
          bp?.zone ?? "mason",
          repairing ? "repair" : bp?.planId ?? "repair",
          repairing ? "a repair" : bp?.title ?? "a repair",
          now
        );
        this.walkTarget = null;
      }
      return;
    }
    if (now - this.walkFailedAt < 2000) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [0, 0]] as const) {
      if (this.body.walkTo(c.x + dx, c.z + dz)) {
        this.walkTarget = { x: c.x, z: c.z };
        return;
      }
    }
    // no route at all: skip this stone so the plan never wedges
    this.walkFailedAt = now;
    this.advance(false);
  }
}
