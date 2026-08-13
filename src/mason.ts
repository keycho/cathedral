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
import type { Voice } from "./voice";
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
  // stones the mason could not walk to on this pass, and how many passes
  // they have survived. the count is what makes this terminate.
  private deferred: BlueprintCell[] = [];
  private deferPass = 0;
  private lastPlace = 0;
  private repairsDone = 0;
  // set after the retry passes are spent: the last stranded stones are laid
  // without a route rather than left out
  private reachAnyway = false;
  private stepsWalked = 0;
  // main wires this: a finished work is a fact other systems care about
  onFinished?: (bp: Blueprint) => void;
  private walkTarget: { x: number; z: number } | null = null;
  private walkFailedAt = 0;

  constructor(
    scene: THREE.Scene,
    private field: VoxelField,
    private strata: Strata,
    private works: CrewWorks,
    private kinetics: Kinetics,
    private journal: Journal,
    home: { x: number; z: number },
    private voice?: Voice
  ) {
    this.body = new AgentBody("mason", field, home.x, home.z, scene);
  }

  assign(bp: Blueprint) {
    this.queue.push(bp);
  }
  repair(cell: BlueprintCell) {
    this.repairs.push(cell);
  }

  // simulated history: a finished work appears whole, laid exactly the way
  // the live path lays it (lock before register, lanterns lit), with no
  // walking and no pace. returns blocks actually set.
  placeInstant(bp: Blueprint): number {
    let placed = 0;
    for (const c of bp.cells) {
      if (!this.field.placeAt(c.x, c.y, c.z, c.material)) continue;
      this.strata.lock(c.x, c.y, c.z);
      this.strata.register(c.x, c.y, c.z, AGENT_WALLET, bp.planId);
      this.works.add(c.x, c.y, c.z, c.material, bp.planId, bp.title, bp.zone);
      if (c.material === LANTERN) this.works.addLantern(c.x, c.y, c.z);
      placed++;
    }
    return placed;
  }
  get busy(): boolean {
    return this.repairs.length > 0 || this.queue.length > 0;
  }
  get backlog(): number {
    return this.queue.length;
  }
  // HOW FAR BEHIND THE CREW ACTUALLY IS, in stones rather than in
  // blueprints. the architect's throttle counted blueprints, which stopped
  // meaning anything when one work went from six hundred blocks to three
  // thousand: two queued works used to be twenty minutes of laying and are
  // now eight hours of it.
  get queuedBlocks(): number {
    let n = this.repairs.length;
    for (let i = 0; i < this.queue.length; i++) {
      n += this.queue[i].cells.length - (i === 0 ? this.cursor : 0);
    }
    return n;
  }

  // THE CREW WORKS HARDER WHEN IT IS BEHIND. one stone every five seconds
  // is 720 an hour, and the raised ceiling designs up to 3000 for a single
  // work — so at the cap the world runs four hours behind one building and
  // permanently behind the market. the pace is not the point though; being
  // watchable is. so the interval is left alone and the crew sets more
  // stones per beat the deeper the queue gets, which reads as a gang
  // working a face rather than as a fast-forward.
  //
  // below the threshold nothing changes, and because a queue shrinks past
  // it on the way down, every work FINISHES at one stone a beat — the last
  // few hundred stones of anything are laid where you can watch them.
  private batchSize(): number {
    const behind = this.queuedBlocks;
    if (behind <= RULES.masonWatchableBacklog) return 1;
    return Math.min(RULES.masonBatchMax, Math.ceil(behind / RULES.masonWatchableBacklog));
  }
  // what the crew is on, for anything that wants to DRAW the work rather
  // than do it: the ghost of what is coming and the staging up what has
  // risen both need the same two facts
  get current(): { bp: Blueprint | null; cursor: number } {
    return { bp: this.queue[0] ?? null, cursor: this.cursor };
  }
  // what the crew could not reach on this pass. a review number rather than
  // a mechanism: "deferred, never dropped" is only a claim until something
  // can be seen going into the deferral and coming back out of it.
  get stranded(): { waiting: number; passes: number; reaching: boolean } {
    return { waiting: this.deferred.length, passes: this.deferPass, reaching: this.reachAnyway };
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
    if (this.cursor >= bp.cells.length && this.deferred.length) {
      // THE RETRY PASS. the work has risen since these were skipped, so
      // most of them are reachable now. two passes, and then whatever is
      // still stranded is set from wherever the mason can get to — a
      // finished court with one stone placed at arm's length is a court; a
      // court with a hole in it is not.
      const again = this.deferred;
      this.deferred = [];
      this.deferPass++;
      bp.cells.push(...again);
      if (this.deferPass >= 3) this.reachAnyway = true;
    }
    if (this.cursor >= bp.cells.length) {
      const line = this.voice
        ? this.voice.mason({ title: bp.title, set: bp.cells.length, repairs: this.repairsDone, steps: this.stepsWalked, planId: bp.planId })
        : `set the last stone of ${bp.title}.`;
      this.repairsDone = 0;
      this.stepsWalked = 0;
      this.journal.add("mason", this.strata.epoch, line);
      this.onFinished?.(bp);
      this.queue.shift();
      this.cursor = 0;
      this.deferred = [];
      this.deferPass = 0;
      this.reachAnyway = false;
      return this.nextCell();
    }
    return bp.cells[this.cursor];
  }

  private advance(placed: boolean) {
    if (this.repairs.length) {
      this.repairs.shift();
      this.repairsDone++;
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
        // as many as the backlog earns, and only ones the mason can
        // actually touch from where it stands — the batch is a faster
        // crew, not a longer arm
        let n = this.batchSize();
        while (n-- > 0) {
          const cell = this.nextCell();
          if (!cell || !this.inReach(cell)) break;
          const bp = this.queue[0];
          const repairing = this.repairs.length > 0;
          this.place(
            cell,
            bp?.zone ?? "mason",
            repairing ? "repair" : bp?.planId ?? "repair",
            repairing ? "a repair" : bp?.title ?? "a repair",
            now
          );
        }
      }
      return;
    }

    // walk to a column beside the stone
    if (this.body.moving) return;

    // already standing at the foot of the work: a stone overhead is set
    // from here rather than walked to, so a tower rises past the mason's
    // own reach instead of stalling on a walk it has already made
    const fx = c.x - GRID / 2 + 0.5;
    const fz = c.z - GRID / 2 + 0.5;
    if (Math.hypot(fx - this.body.x, fz - this.body.z) <= REACH) {
      this.walkTarget = { x: c.x, z: c.z };
    }

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
    if (this.reachAnyway) {
      if (now - this.lastPlace >= this.paceMs * 1.5) {
        const bp = this.queue[0];
        const repairing = this.repairs.length > 0;
        this.place(c, bp?.zone ?? "mason", repairing ? "repair" : bp?.planId ?? "repair",
          repairing ? "a repair" : bp?.title ?? "a repair", now);
      }
      return;
    }
    if (now - this.walkFailedAt < 2000) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [0, 0]] as const) {
      if (this.body.walkTo(c.x + dx, c.z + dz)) {
        this.walkTarget = { x: c.x, z: c.z };
        this.stepsWalked++;
        return;
      }
    }
    // A STONE WITH NO ROUTE IS DEFERRED, NEVER DROPPED. skipping it kept
    // the plan from wedging and quietly vetoed whole forms: an enclosed
    // court, a walled garden, a room with one door, anything across water —
    // every design whose inside cannot be walked to lost exactly the cells
    // that made it that shape, and came back as a wall with a hole in it.
    //
    // it goes to the back of the work instead. by the time the rest has
    // risen the route usually exists, because the thing that was missing
    // was often the stair or the bridge still queued behind it.
    this.walkFailedAt = now;
    this.deferred.push(c);
    this.advance(false);
  }
}
