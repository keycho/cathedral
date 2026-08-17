// kodo - the stream director. the orbit camera drifts on its own, but
// when something happens that a viewer should not miss, the director takes
// the wheel and frames it. drama outranks progress: a dying agent's walk
// beats a wall going up, a gathering beats a whale, a tomb being raised
// beats everything.
//
// it never fights the walker: while a visitor holds the pointer lock the
// director stands down entirely.

import * as THREE from "three";
import { GRID } from "./config";
import type { OrbitRig } from "./orbitcam";

export type Beat =
  | "tomb" // a grave being raised
  | "death" // the moment itself
  | "dying" // an agent's last walks
  | "gathering" // the crew standing together
  | "crossing" // the ascent meeting an island
  | "monolith" // a whale surfaced
  | "storm" // the market turning violent
  | "build"; // ordinary progress

// how long the director holds a beat, and how hard it outranks the others
const WEIGHT: Record<Beat, { hold: number; rank: number; radius: number; polar: number }> = {
  tomb: { hold: 26, rank: 100, radius: 18, polar: 0.16 },
  death: { hold: 20, rank: 95, radius: 14, polar: 0.12 },
  dying: { hold: 16, rank: 70, radius: 16, polar: 0.14 },
  gathering: { hold: 22, rank: 80, radius: 22, polar: 0.2 },
  crossing: { hold: 20, rank: 60, radius: 44, polar: 0.22 },
  monolith: { hold: 12, rank: 45, radius: 26, polar: 0.24 },
  storm: { hold: 14, rank: 40, radius: 60, polar: 0.3 },
  build: { hold: 10, rank: 10, radius: 20, polar: 0.22 },
};

interface Shot {
  beat: Beat;
  until: number;
  rank: number;
  subject: () => THREE.Vector3 | null; // followed live: a walking agent stays framed
}

export class Director {
  enabled = true;
  private shot: Shot | null = null;
  private tmp = new THREE.Vector3();
  private home = new THREE.Vector3();
  private homeRadius = 64;
  private homePolar = 0.34;

  constructor(private rig: OrbitRig) {}

  // the resting frame the director returns to
  setHome(target: THREE.Vector3, radius: number, polar: number) {
    this.home.copy(target);
    this.homeRadius = radius;
    this.homePolar = polar;
  }

  // a cell-space subject, for one-off events
  cut(beat: Beat, cellX: number, cellZ: number, cellY: number, now: number) {
    const p = new THREE.Vector3(cellX - GRID / 2 + 0.5, cellY, cellZ - GRID / 2 + 0.5);
    this.cutTo(beat, () => p, now);
  }

  // a live subject, for anything that moves (an agent's last walk)
  cutTo(beat: Beat, subject: () => THREE.Vector3 | null, now: number) {
    if (!this.enabled) return;
    const w = WEIGHT[beat];
    // a running shot is only interrupted by a bigger story
    if (this.shot && now < this.shot.until && w.rank <= this.shot.rank) return;
    this.shot = { beat, until: now + w.hold * 1000, rank: w.rank, subject };
  }

  get current(): Beat | null {
    return this.shot?.beat ?? null;
  }

  update(dt: number, now: number, walking: boolean) {
    if (!this.enabled || walking) {
      this.shot = null;
      return;
    }
    if (!this.shot) return;
    if (now > this.shot.until) {
      this.shot = null;
      // ease back to the resting frame
      this.rig.target.lerp(this.home, 0.02);
      this.rig.radius += (this.homeRadius - this.rig.radius) * 0.02;
      this.rig.polar += (this.homePolar - this.rig.polar) * 0.02;
      return;
    }
    const p = this.shot.subject();
    if (!p) {
      this.shot = null;
      return;
    }
    const w = WEIGHT[this.shot.beat];
    // move the eye rather than cut it: a stream should never snap
    const k = Math.min(1, dt * 1.6);
    this.tmp.copy(p);
    this.tmp.y += 2;
    this.rig.target.lerp(this.tmp, k);
    this.rig.radius += (w.radius - this.rig.radius) * k * 0.6;
    this.rig.polar += (w.polar - this.rig.polar) * k * 0.6;
  }
}
