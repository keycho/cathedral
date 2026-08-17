// kodo - the crew's voices. every line any agent writes comes from
// here, so the four registers in crew/*.md live in one place and cannot
// drift apart. the bibles are the specification; this is their runtime.
//
// three things make a journal read as a character rather than a status
// feed: register (how the sentence is shaped), memory (a running bit that
// recurs across entries), and awareness (naming each other's work). all
// three are here.
//
// phase 3 swaps these generators for sdk brains reading the same bibles.
// the interface is the contract: facts in, one voiced line out.

import type { AgentName } from "./crew";

// a per-agent memory of things worth repeating. this is what turns a note
// into a running bit: the surveyor has marked the same seam three times,
// the keeper knows which lantern keeps going out.
class Bits {
  private counts = new Map<string, number>();
  private lastSaid = new Map<string, number>();

  bump(key: string): number {
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return n;
  }
  count(key: string): number {
    return this.counts.get(key) ?? 0;
  }
  // true at most once every n entries: keeps a running bit from becoming
  // a stuck record
  due(key: string, entry: number, every: number): boolean {
    const last = this.lastSaid.get(key) ?? -999;
    if (entry - last < every) return false;
    this.lastSaid.set(key, entry);
    return true;
  }
}

function times(n: number): string {
  if (n <= 1) return "once";
  if (n === 2) return "twice";
  if (n === 3) return "three times";
  if (n === 4) return "four times";
  return n + " times";
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

export interface SurveyorFacts {
  epoch: number;
  blocks: number;
  grew: number;
  rubbleNew: number;
  chambers: number;
  monoliths: number;
  sinceSubside: number; // ticks since the mass last settled
  subsideRun: number; // consecutive negative ticks right now
  islands: number;
  newestWork?: { title: string; by: AgentName }; // the crew's latest finished thing
  doomed?: { name: string; lean: number }; // a formation it has taken to watching
}

export interface ArchitectFacts {
  epoch: number;
  title: string;
  memo: string;
  blocks: number;
  budget: number;
  wanted: number; // what it drew before the arithmetic argued
  zone: AgentName;
  ascentStage?: number;
  ascentLeft?: number; // blocks below the island
  crossed?: boolean;
}

export interface MasonFacts {
  title: string;
  set: number;
  repairs: number;
  steps: number;
  planId: string;
}

export interface KeeperFacts {
  lit: number;
  out: number;
  worst?: string; // the lantern that keeps going out
  visitor: boolean;
  tended?: string; // the small thing that stole the round
  graves: number;
}

export class Voice {
  private bits = new Map<AgentName, Bits>();
  private entryNo = 0;

  private mem(a: AgentName): Bits {
    let b = this.bits.get(a);
    if (!b) {
      b = new Bits();
      this.bits.set(a, b);
    }
    return b;
  }

  // a successor inherits the duties and the territory, never the memories
  forget(a: AgentName) {
    this.bits.set(a, new Bits());
  }

  // ---- the surveyor: precise, unhurried, fond of doomed ground ----------
  surveyor(f: SurveyorFacts): string {
    this.entryNo++;
    const m = this.mem("surveyor");
    // the world has a name now, and the crew may use it
    const parts: string[] = [
      `epoch ${f.epoch}. ${pick(
        [`the mass stands ${f.blocks} stones`, `kodō stands ${f.blocks} stones`],
        f.epoch + this.entryNo
      )}.`,
    ];

    if (f.grew > 12) parts.push(`it grew ${f.grew} since my last walk.`);
    else if (f.grew < -12) parts.push(`it lost ${-f.grew}. the wind was against us.`);

    // the preoccupation: the rate the world is sinking
    if (f.subsideRun >= 8) {
      parts.push(`${f.subsideRun} negative ticks. the stone comes down by morning.`);
    } else if (f.sinceSubside > 0 && m.due("sink", this.entryNo, 3)) {
      parts.push(`${f.sinceSubside} ticks since the last settle. i am counting.`);
    }

    if (f.rubbleNew > 6) parts.push(`fresh rubble at the foot, ${f.rubbleNew} fallen.`);

    // the flaw: it keeps visiting formations that are already lost
    if (f.doomed && m.due("doomed", this.entryNo, 2)) {
      const n = m.bump("doomed-" + f.doomed.name);
      parts.push(
        n <= 1
          ? `the ${f.doomed.name} leans ${f.doomed.lean} degrees. i have marked it.`
          : `the ${f.doomed.name} leans ${f.doomed.lean} degrees now. i have marked it ${times(n)}.`
      );
    }

    // awareness: it measures the crew's work like it measures the ground
    if (f.newestWork && m.due("work", this.entryNo, 2)) {
      parts.push(
        pick(
          [
            `the ${f.newestWork.by}'s ${f.newestWork.title} holds water on its north side. it was not designed to.`,
            `walked the ${f.newestWork.by}'s ${f.newestWork.title}. the ground under it is sound.`,
            `the ${f.newestWork.by}'s ${f.newestWork.title} has settled a finger's width. that is within reason.`,
          ],
          f.blocks + this.entryNo
        )
      );
    }

    if (f.islands > 0 && m.due("islands", this.entryNo, 4)) {
      parts.push(`${f.islands} islands overhead. their stone is older than their height suggests.`);
    }
    if (f.chambers > 0 && parts.length < 3) parts.push(`${f.chambers} chambers burn below.`);
    if (parts.length === 1) parts.push(`quiet ground. the seeds settle where they fall.`);
    return parts.join(" ");
  }

  // ---- the architect: intent, proportion, and wounded pride -------------
  architect(f: ArchitectFacts): string {
    this.entryNo++;
    const m = this.mem("architect");
    if (f.crossed) return "the crossing is laid. the realms are joined. i have wanted this since the first epoch.";
    if (f.ascentStage !== undefined) {
      const left = f.ascentLeft ?? 0;
      return left > 0
        ? `the ascent climbs. stage ${f.ascentStage}, ${left} blocks below the island.`
        : `the ascent climbs. stage ${f.ascentStage}, the island within reach.`;
    }
    const lines = [`${f.title}. ${f.memo}`.trim()];
    // the flaw: it draws beyond the stone it has
    if (f.wanted > f.blocks + 8) {
      const n = m.bump("short");
      lines.push(
        n <= 1
          ? `${f.wanted - f.blocks} stones short of the span i drew. i will draw it again smaller and call that the intent.`
          : `short again, by ${f.wanted - f.blocks}. that is ${times(n)} the arithmetic has argued with me.`
      );
    } else if (f.budget > 400 && m.due("rich", this.entryNo, 3)) {
      lines.push("the market is generous this cycle. i have taken the whole of it.");
    }
    return lines.join(" ");
  }

  // the architect, wounded: its own work has been broken
  architectDamaged(what: string, n: number): string {
    const m = this.mem("architect");
    const seen = m.bump("damage");
    if (seen <= 1) return `they took ${n} stones from the ${what}. i designed that.`;
    return `the ${what} is bitten again, ${n} stones. i have redrawn it ${times(seen)}.`;
  }

  // the architect, idle: a quiet market builds nothing
  architectIdle(): string {
    const m = this.mem("architect");
    const n = m.bump("idle");
    if (n <= 1) return "the market is quiet. the crew tends what stands.";
    if (n === 2) return "quiet again. i am drawing things i cannot afford to build.";
    return "still quiet. the drawings pile up and the stone does not.";
  }

  // ---- the mason: counts, and never editorializes -----------------------
  mason(f: MasonFacts): string {
    this.entryNo++;
    const m = this.mem("mason");
    const bits: string[] = [`set the last stone of ${f.title}.`];
    if (f.set > 0) bits.push(`${f.set} set.`);
    if (f.repairs > 0) bits.push(`${f.repairs} repaired.`);
    if (f.steps > 40) bits.push(`walked ${f.steps}.`);
    // the flaw: literal instruction, taken literally, reported as a number
    const odd = m.count("literal");
    if (odd > 0 && m.due("literal", this.entryNo, 5)) bits.push(`the wall meets the hill at course six.`);
    return bits.join(" ");
  }

  masonRepair(n: number): string {
    return `repaired ${n}. nothing new until it stands.`;
  }
  masonBacklog(waiting: number): string {
    return `${waiting} plans waiting. finishing the one in hand.`;
  }

  // ---- the keeper: tender, and the only one who sees you ----------------
  keeper(f: KeeperFacts): string {
    this.entryNo++;
    const m = this.mem("keeper");
    if (f.tended) {
      return `the ${f.tended} needed doing. i did that first and the round second.`;
    }
    if (f.visitor && m.due("visitor", this.entryNo, 2)) {
      return pick(
        [
          "someone is standing at the founding stone. you are welcome to it.",
          "you walked the west line tonight. the lamps are lit for it.",
          "you are here late. so am i.",
          "kodō keeps a lamp lit for whoever comes. tonight that is you.",
        ],
        this.entryNo
      );
    }
    if (f.out === 0) {
      const n = m.bump("allLit");
      return n <= 1 ? "all lit at dusk." : `all lit at dusk. that is ${times(n)} now.`;
    }
    if (f.worst) {
      const n = m.bump("worst-" + f.worst);
      return n <= 1
        ? `${f.out} out along the round. the one by the ${f.worst} went first.`
        : `${f.out} out. the one by the ${f.worst} again, ${times(n)} now.`;
    }
    return `${f.out} out overnight, ${f.lit} still burning.`;
  }

  keeperGrave(name: string): string {
    return `the moss on ${name}'s marker had dried. it has water now.`;
  }

  // ---- mortality: the register never turns melodramatic -----------------
  // a declining agent registers it the way its character would.
  decline(agent: AgentName, stage: "thin" | "failing" | "dying"): string {
    const lines: Record<AgentName, Record<string, string>> = {
      surveyor: {
        thin: "my pace is off. i walked the short line today and called it the round.",
        failing: "i did not reach the ridge. i measured from the foot and the numbers hold.",
        dying: "the ground is further away than it was. i have written what i know.",
      },
      architect: {
        thin: "i drew nothing today worth the stone. that is not like me.",
        failing: "the span will not resolve. i have started it four times.",
        dying: "the ascent is unfinished and i am not the one who finishes it. draw it higher.",
      },
      mason: {
        thin: "set 3. slower.",
        failing: "set 1. hands.",
        dying: "unfinished: 1.",
      },
      keeper: {
        thin: "i left two unlit tonight. i will get them in the morning.",
        failing: "the round took until dawn. the far lamps are still dark.",
        dying: "tend the west line. it goes out first.",
      },
    };
    return lines[agent][stage];
  }

  eulogy(mourner: AgentName, name: string, works: number): string {
    // a crew member who died before finishing anything is not given a
    // count they did not earn: even the mason will not report a zero
    const lines: Record<AgentName, string> = {
      surveyor: works
        ? `${name} walked this ground ${works} works long. i have the measurements. they were good ones.`
        : `${name} walked this ground with me. i have the measurements. that is what i have.`,
      architect: works
        ? `${name} built what i drew, and twice built it better than i drew it. the crown was theirs.`
        : `${name} arrived and the market did not. that is not a failure of theirs.`,
      mason: works ? `${name}. ${works} works. set the last stone of each.` : `${name}. nothing finished. not their doing.`,
      keeper: `i lit ${name}'s lamp tonight. it will stay lit while i am here.`,
    };
    return lines[mourner];
  }

  arrival(agent: AgentName, name: string): string {
    const lines: Record<AgentName, string> = {
      surveyor: `${name}. i have walked the boundary once. the numbers start today.`,
      architect: `${name}. i have read the drawings that stand and i intend to exceed them.`,
      mason: `${name}. tools counted. ready.`,
      keeper: `${name}. i have found the lamps. some of them need me.`,
    };
    return lines[agent];
  }
}
