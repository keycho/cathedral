// cathedral - the keeper. the fourth agent, and the only one that holds no
// territory: it walks all three. at dusk it begins its round of the
// lanterns, relights what went dark, waters the moss on the grave markers,
// and greets anyone standing in the world. it neglects the round whenever
// something small needs it more, which is the whole of its character.
//
// the keeper is what makes idle time read as life: the crew is never all
// standing still, because someone is always walking the lamps.

import * as THREE from "three";
import { GRID } from "./config";
import { AgentBody } from "./crew";
import type { CrewWorks } from "./crew";
import type { Journal } from "./journal";
import type { Tombs } from "./tombs";
import type { VoxelField } from "./voxels";
import type { Voice } from "./voice";

const DWELL_MS = 2200; // a beat at each lamp
const GREET_RADIUS = 14; // how near a visitor has to be to be seen
const ROUND_GAP_MS = 40_000; // between rounds when the world is bright

interface Stop {
  x: number;
  z: number;
  kind: "lantern" | "grave" | "garden";
  name: string;
}

export class Keeper {
  readonly body: AgentBody;
  // fired when the keeper tends a lamp on its round, so the world can show
  // the relight — a spark at the lantern — rather than only journal it
  onTend?: (x: number, z: number) => void;
  private stops: Stop[] = [];
  private dwellUntil = 0;
  private walking = false;
  private lastRound = 0;
  private outTonight = 0;
  private litTonight = 0;
  private greetedAt = 0;
  private current: Stop | null = null;

  constructor(
    scene: THREE.Scene,
    field: VoxelField,
    private works: CrewWorks,
    private journal: Journal,
    private voice: Voice,
    private tombs: Tombs | null,
    private genesisCell: { x: number; z: number },
    private epochOf: () => number,
    private isNight: () => boolean,
    private visitorAt: () => { x: number; z: number } | null,
    home: { x: number; z: number }
  ) {
    this.body = new AgentBody("keeper", field, home.x, home.z, scene);
  }

  // the round: every lantern the crew has set, the graves, then home
  private planRound() {
    const stops: Stop[] = [];
    for (const l of this.works.lanternCells().slice(0, 10)) {
      stops.push({ x: l.x, z: l.z, kind: "lantern", name: this.lampName(l.x, l.z) });
    }
    if (this.tombs) {
      for (const t of this.tombs.list) stops.push({ x: t.x, z: t.z, kind: "grave", name: t.name });
    }
    // the keeper walks them in the order it meets them, not the order they
    // were built: nearest first from where it stands
    stops.sort(
      (a, b) =>
        Math.hypot(a.x - this.body.cellX, a.z - this.body.cellZ) -
        Math.hypot(b.x - this.body.cellX, b.z - this.body.cellZ)
    );
    this.stops = stops.slice(0, 8);
    this.outTonight = 0;
    this.litTonight = 0;
  }

  // lamps are individuals to the keeper, named for where they stand
  private lampName(x: number, z: number): string {
    const dx = x - this.genesisCell.x;
    const dz = z - this.genesisCell.z;
    if (Math.hypot(dx, dz) < 12) return "founding stone";
    if (Math.abs(dx) > Math.abs(dz)) return dx < 0 ? "west line" : "east gate";
    return dz < 0 ? "north cairn" : "south yard";
  }

  get status(): string {
    if (this.walking && this.current) return `keeper: the ${this.current.name}`;
    return this.isNight() ? "keeper: on the round" : "keeper: tending";
  }

  update(_dt: number, now: number) {
    // a visitor near the keeper is always worth a word, round or no round
    const v = this.visitorAt();
    if (v && now - this.greetedAt > 45_000) {
      const d = Math.hypot(v.x - this.body.cellX, v.z - this.body.cellZ);
      if (d < GREET_RADIUS) {
        this.greetedAt = now;
        this.journal.add(
          "keeper",
          this.epochOf(),
          this.voice.keeper({ lit: this.litTonight, out: this.outTonight, visitor: true, graves: this.tombs?.list.length ?? 0 })
        );
      }
    }

    if (!this.walking) {
      // the round begins at dusk, or on a long gap if the day is bright
      const due = this.isNight() || now - this.lastRound > ROUND_GAP_MS;
      if (!due || this.body.moving) return;
      this.planRound();
      if (!this.stops.length) return;
      this.walking = true;
      this.lastRound = now;
      this.dwellUntil = 0;
      return;
    }

    if (this.body.moving) return;
    if (now < this.dwellUntil) return;

    const next = this.stops.shift();
    if (next) {
      this.current = next;
      if (this.body.walkTo(next.x, next.z)) {
        this.dwellUntil = now + DWELL_MS;
        // the flaw: a grave marker that needs tending takes the whole round
        if (next.kind === "grave" && Math.random() < 0.5) {
          this.stops.length = 0;
          this.journal.add("keeper", this.epochOf(), this.voice.keeperGrave(next.name));
        } else if (next.kind === "lantern") {
          // some lamps are found dark — and the relight is SEEN, not only
          // journalled: a spark at the lamp as the keeper reaches it
          if (Math.random() < 0.3) this.outTonight++;
          else this.litTonight++;
          this.onTend?.(next.x, next.z);
        }
      }
      return;
    }

    // the round is done: file it and go back to the stone
    this.walking = false;
    this.current = null;
    const worst = this.outTonight > 0 ? this.lampName(this.genesisCell.x - 20, this.genesisCell.z) : undefined;
    this.journal.add(
      "keeper",
      this.epochOf(),
      this.voice.keeper({
        lit: this.litTonight,
        out: this.outTonight,
        worst,
        visitor: false,
        graves: this.tombs?.list.length ?? 0,
      })
    );
    this.body.walkTo(this.genesisCell.x + 3, this.genesisCell.z - 2);
  }

  // rituals: the crew gathers when the market marks the world
  gatherAt(x: number, z: number) {
    this.stops.length = 0;
    this.walking = false;
    this.body.walkTo(
      Math.max(2, Math.min(GRID - 3, x + 2)),
      Math.max(2, Math.min(GRID - 3, z + 1))
    );
  }
}
