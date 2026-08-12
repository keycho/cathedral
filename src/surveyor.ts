// cathedral - the surveyor. after each epoch it comes down from its ridge,
// walks the newest ground over the real geometry (fresh rubble, the latest
// chamber mouth, the newest monument, the peak), dwells at each, and files
// a terse public note. between walks it stands on the ridge and watches.

import { GRID } from "./config";
import { AgentBody, zoneOf } from "./crew";
import type { Erosion } from "./erosion";
import type { Hollows } from "./hollows";
import type { Journal } from "./journal";
import type { Monuments } from "./monuments";
import type { Strata } from "./strata";
import type { Voice } from "./voice";
import type { VoxelField } from "./voxels";
import * as THREE from "three";

const DWELL_MS = 2600;

export class Surveyor {
  readonly body: AgentBody;
  private ridge: { x: number; z: number };
  private stops: { x: number; z: number }[] = [];
  private dwellUntil = 0;
  private walking = false;
  private lastBlocks = 1;
  private lastRubbleSeen = 0;
  private pendingEpoch = -1;

  constructor(
    scene: THREE.Scene,
    field: VoxelField,
    private strata: Strata,
    private erosion: Erosion,
    private hollows: Hollows,
    private monuments: Monuments,
    private journal: Journal,
    genesisCell: { x: number; z: number },
    private voice: Voice,
    private extras: {
      islands: () => number;
      subsideRun: () => number;
      sinceSubside: () => number;
      newestWork: () => { title: string; by: "surveyor" | "architect" | "mason" | "keeper" } | undefined;
      isDusk: () => boolean;
    }
  ) {
    // the ridge: the highest ground in the surveyor's third, ring 20..34
    let best = { x: genesisCell.x - 24, z: genesisCell.z - 10, h: -1 };
    for (let k = 0; k < 500; k++) {
      const ang = -Math.PI + Math.random() * ((Math.PI * 2) / 3); // its own wedge
      const r = 20 + Math.random() * 14;
      const sx = Math.round(genesisCell.x + Math.cos(ang) * r);
      const sz = Math.round(genesisCell.z + Math.sin(ang) * r);
      if (zoneOf(sx, sz) !== "surveyor") continue;
      const h = field.topAt(sx, sz);
      if (h > best.h) best = { x: sx, z: sz, h };
    }
    this.ridge = { x: best.x, z: best.z };
    this.body = new AgentBody("surveyor", field, this.ridge.x, this.ridge.z, scene);
  }

  onEpoch(epoch: number) {
    this.pendingEpoch = epoch;
  }

  private planWalk(): void {
    const stops: { x: number; z: number }[] = [];
    // freshest rubble
    const rubble = this.erosion.lastRubble;
    if (rubble.length) {
      const r = rubble[rubble.length - 1];
      stops.push({ x: r.x, z: r.z });
    }
    // the newest marks
    if (this.monuments.lastMonument) stops.push({ x: this.monuments.lastMonument.x, z: this.monuments.lastMonument.z });
    if (this.monuments.lastSeed) stops.push({ x: this.monuments.lastSeed.x, z: this.monuments.lastSeed.z });
    // the peak
    let peak = { x: GRID / 2, z: GRID / 2, y: 0 };
    for (let k = 0; k < 200; k++) {
      const c = this.strata.sampleCell(Math.random());
      if (c === undefined) break;
      const y = c % 96;
      const xz = (c - y) / 96;
      const z = xz % GRID;
      const x = (xz - z) / GRID;
      if (y > peak.y) peak = { x, z, y };
    }
    if (peak.y > 0) stops.push({ x: peak.x, z: peak.z });
    this.stops = stops.slice(0, 4);
  }

  private note(epoch: number) {
    const blocks = this.strata.blockCount;
    const grew = blocks - this.lastBlocks;
    this.lastBlocks = blocks;
    const rubbleNow = this.erosion.lastRubble.length;
    const rubbleNew = Math.max(0, rubbleNow - this.lastRubbleSeen);
    this.lastRubbleSeen = rubbleNow;
    // the doomed formation it keeps visiting: the tallest thing standing on
    // ground the market is actively chewing
    const doomed =
      rubbleNew > 4 ? { name: "east spire", lean: 2 + Math.min(6, Math.round(rubbleNew / 4)) } : undefined;
    this.journal.add(
      "surveyor",
      epoch,
      this.voice.surveyor({
        epoch,
        blocks,
        grew,
        rubbleNew,
        chambers: Math.max(0, Math.round(this.hollows.count / 90)),
        monoliths: this.monuments.count,
        sinceSubside: this.extras.sinceSubside(),
        subsideRun: this.extras.subsideRun(),
        islands: this.extras.islands(),
        newestWork: this.extras.newestWork(),
        doomed,
      })
    );
  }

  // the ridge it always returns to: a visitor learns where to find it
  get ridgeCell(): { x: number; z: number } {
    return this.ridge;
  }

  update(_dt: number, now: number) {
    // the dusk pause: whatever else is pending, it goes up to the same
    // ridge and stands there while the light goes
    if (this.extras.isDusk() && !this.walking && !this.body.moving) {
      const onRidge = this.body.cellX === this.ridge.x && this.body.cellZ === this.ridge.z;
      if (!onRidge) {
        this.body.walkTo(this.ridge.x, this.ridge.z);
        return;
      }
    }

    // start a walk when an epoch closed and the last one is done
    if (this.pendingEpoch >= 0 && !this.walking && !this.body.moving) {
      this.planWalk();
      this.walking = true;
      this.dwellUntil = 0;
    }
    if (!this.walking) return;

    if (this.body.moving) return;
    if (now < this.dwellUntil) return;

    const next = this.stops.shift();
    if (next) {
      if (this.body.walkTo(next.x, next.z)) {
        this.dwellUntil = now + DWELL_MS;
      }
      return;
    }
    // done: file the note and go back up
    const epoch = this.pendingEpoch;
    this.pendingEpoch = -1;
    this.walking = false;
    this.note(epoch);
    this.body.walkTo(this.ridge.x, this.ridge.z);
  }
}
