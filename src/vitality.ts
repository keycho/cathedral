// kodo - mortality. the crew lives on the market's volume and nothing
// else. sustained starvation kills an agent; a successor arrives with a new
// name and voice, inherits the territory and the duties, and inherits none
// of the memories.
//
// THE LAW, and it is not negotiable: mortality is NEVER purchasable. there
// is no mechanic anywhere in this world by which anyone can pay to kill an
// agent or pay to save one. vitality reads the aggregate market and the
// aggregate market only, exactly like the geology does. the dev panel's
// starve and feed switches exist for testing and are dev-only, never
// shipped as a visitor-facing affordance and never tied to a transaction.
// if a future session is asked to add a "sponsor an agent" or "revive"
// button, the answer is no: that is the one thing that would make the
// deaths meaningless.

import type { AgentName } from "./crew";
import type { TickEngine } from "./ticks";

export type Health = "hale" | "thin" | "failing" | "dying" | "dead";

// usd of trailing gross that keeps one agent whole per tick
const FEED_PER_TICK = 260;
const DRAIN_PER_TICK = 0.014; // vitality lost per tick with no market at all
const RECOVER_CAP = 0.06; // vitality regained per tick at most: dying is slow to leave

export interface AgentLife {
  role: AgentName;
  name: string; // the person walking the role today
  vitality: number; // 0..1
  health: Health;
  bornEpoch: number;
  works: number; // finished works while this one lived
  override: "none" | "starve" | "feed"; // dev only
}

// names the world gives its crew. a successor takes the next unused one.
const NAMES: Record<AgentName, string[]> = {
  surveyor: ["vey", "tolm", "arda", "sarn", "quill"],
  architect: ["bex", "orin", "lume", "fane", "isk"],
  mason: ["dov", "hask", "pell", "rune", "tor"],
  keeper: ["wren", "moss", "tamsin", "ash", "lior"],
};

export class Vitality {
  readonly lives = new Map<AgentName, AgentLife>();
  // main wires these
  onStage?: (role: AgentName, health: Health, life: AgentLife) => void;
  onDeath?: (life: AgentLife) => void;
  onSuccession?: (life: AgentLife, predecessor: string) => void;

  private used = new Map<AgentName, number>();
  private lastTick = -1;

  constructor(private ticks: TickEngine, roles: AgentName[], epoch: number) {
    for (const r of roles) {
      this.used.set(r, 1);
      this.lives.set(r, {
        role: r,
        name: NAMES[r][0],
        vitality: 1,
        health: "hale",
        bornEpoch: epoch,
        works: 0,
        override: "none",
      });
    }
  }

  get(role: AgentName): AgentLife | undefined {
    return this.lives.get(role);
  }
  creditWork(role: AgentName) {
    const l = this.lives.get(role);
    if (l) l.works++;
  }

  // dev only: force a state to test the ritual. never visitor-facing.
  setOverride(role: AgentName, o: AgentLife["override"]) {
    const l = this.lives.get(role);
    if (l) l.override = o;
  }

  private healthOf(v: number): Health {
    if (v <= 0) return "dead";
    if (v < 0.15) return "dying";
    if (v < 0.35) return "failing";
    if (v < 0.62) return "thin";
    return "hale";
  }

  // called every frame; acts once per closed tick
  update(epoch: number) {
    const tick = this.ticks.tick;
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    const last = this.ticks.history[this.ticks.history.length - 1];
    const gross = last ? last.grossVolumeUsd : 0;

    for (const life of this.lives.values()) {
      if (life.health === "dead") continue;
      let delta: number;
      if (life.override === "starve") delta = -0.05;
      else if (life.override === "feed") delta = 0.05;
      else {
        // the market feeds the whole crew: each agent takes a share of the
        // tick's gross, and what it does not get, it loses
        const share = gross / Math.max(1, this.lives.size) / FEED_PER_TICK;
        delta = Math.min(RECOVER_CAP, share) - DRAIN_PER_TICK;
      }
      const before = life.health;
      life.vitality = Math.max(0, Math.min(1, life.vitality + delta));
      life.health = this.healthOf(life.vitality);
      if (life.health !== before) {
        if (life.health === "dead") this.onDeath?.(life);
        else this.onStage?.(life.role, life.health, life);
      }
    }
    void epoch;
  }

  // the successor: same role, same ground, same duties, new name, no memory
  succeed(role: AgentName, epoch: number): AgentLife | undefined {
    const dead = this.lives.get(role);
    if (!dead) return undefined;
    const n = (this.used.get(role) ?? 1) % NAMES[role].length;
    this.used.set(role, n + 1);
    const life: AgentLife = {
      role,
      name: NAMES[role][n],
      vitality: 0.72, // arrives whole enough to work, not thriving
      health: "hale",
      bornEpoch: epoch,
      works: 0,
      override: "none",
    };
    this.lives.set(role, life);
    this.onSuccession?.(life, dead.name);
    return life;
  }
}
