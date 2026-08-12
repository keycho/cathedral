// cathedral - plaques (p7): every block answers for itself. inspect a
// block and its provenance card renders: what it is, the epoch it was
// born, how deep its stratum sits, whose wallet or whose plan made it,
// and the tx that paid for it. walking: aim and press e. orbit: right
// click what the cursor rests on. terrain has no provenance; it was
// always here.

import * as THREE from "three";
import { GRID } from "./config";
import type { CrewWorks } from "./crew";
import {
  blockById,
  EMBERSEAM,
  FALL,
  GENESIS,
  isAgentMaterial,
  isGround,
  MEADOW,
  MONUMENT,
  RUST,
  RISE,
  RUBBLE,
  SCARMOSS,
  SEED,
  STILLWATER,
} from "./palette";
import type { Strata } from "./strata";
import type { VoxelField } from "./voxels";

const SHOW_MS = 7000;
const REACH_WALK = 26;
const REACH_ORBIT = 90;

export class Plaques {
  // main wires this: a wallet index becomes a display name
  describeWallet: (w: number) => string = (w) => String(w);
  // main wires this: a ribbon cell answers with its tick
  ribbonInfo?: (x: number, y: number, z: number) => { n: number; close: number; rise: boolean } | undefined;
  // world furniture answers before any family rule (the shrine)
  special?: (x: number, y: number, z: number) => string[] | undefined;
  // fired whenever a block is inspected (the shrine's tablet listens)
  onInspect?: (x: number, y: number, z: number) => void;

  private el: HTMLElement;
  private hideAt = 0;
  private reassert = false;
  private dir = new THREE.Vector3();
  private ndc = new THREE.Vector3();

  constructor(
    private field: VoxelField,
    private strata: Strata,
    private works: CrewWorks,
    private camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement
  ) {
    this.el = document.getElementById("plaque") as HTMLElement;
    this.el.style.display = "none";

    // walking: e inspects what the crosshair rests on
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyE" || !document.pointerLockElement) return;
      this.camera.getWorldDirection(this.dir);
      const o = this.camera.position;
      this.inspectRay(o.x, o.y, o.z, this.dir.x, this.dir.y, this.dir.z, REACH_WALK);
    });

    // orbit: right click inspects under the cursor (left click walks)
    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 2 || document.pointerLockElement) return;
      this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1, 0.5);
      this.ndc.unproject(this.camera);
      this.dir.copy(this.ndc).sub(this.camera.position).normalize();
      const o = this.camera.position;
      this.inspectRay(o.x, o.y, o.z, this.dir.x, this.dir.y, this.dir.z, REACH_ORBIT);
    });
  }

  private inspectRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, reach: number) {
    const hit = this.field.raycast(ox, oy, oz, dx, dy, dz, reach);
    if (!hit) return;
    this.show(hit.hx, hit.hy, hit.hz);
  }

  private stratumWord(age: number): string {
    if (age < 8) return "young stratum";
    if (age < 32) return "settled stratum";
    return "deep stratum";
  }

  private lines(x: number, y: number, z: number): string[] {
    const type = this.field.typeAt(x, y, z);
    if (type === 0) return [];
    const sp = this.special?.(x, y, z);
    if (sp) return sp;
    const prov = this.strata.provAt(x, y, z);
    const mat = blockById(type)?.name ?? "stone";

    if (isGround(type)) {
      if (type === MEADOW) return [mat, "the old world. it was always here."];
      if (type === SCARMOSS) return [mat, "an old wound, greened over."];
      if (type === RUST) return [mat, "the bones of the land."];
      if (type === EMBERSEAM) return [mat, "heat that never quite left."];
      return [mat, "the old world under the grass."];
    }
    if (type === STILLWATER && !this.works.at(x, y, z)) {
      return [mat, "the sky lives in it."];
    }
    if (type === RISE || type === FALL) {
      const ri = this.ribbonInfo?.(x, y, z);
      return [
        (type === RISE ? "ascent" : "descent") + " · the price ribbon",
        ri ? `tick ${ri.n} closed at $${ri.close.toPrecision(3)}` : "one tick of the chart",
        "the market, walked on",
      ];
    }
    if (type === GENESIS) {
      return ["the founding stone", "epoch 0 · the world's own", prov ? "tx " + prov.tx : ""];
    }

    const age = prov ? this.strata.epoch - prov.epoch : 0;
    const born = prov ? `born epoch ${prov.epoch} · ${age === 0 ? "this epoch" : age + " epochs deep"}` : "";
    const by = prov ? this.describeWallet(prov.wallet) : "";
    const tx = prov && prov.tx ? "tx " + prov.tx.slice(0, 12) : "";

    if (isAgentMaterial(type)) {
      const cb = this.works.at(x, y, z);
      return [
        mat + " · set by the crew",
        cb ? `${cb.title} · the ${cb.zone}'s third` : "crew work",
        born,
        cb ? cb.planId : tx,
      ];
    }
    if (type === RUBBLE) {
      return ["rubble · " + this.stratumWord(age), born, by ? `once ${by}'s stone` : "", "it fell and it stays"];
    }
    if (type === MONUMENT) {
      return ["monolith", born, by ? `raised by ${by}` : "", tx];
    }
    if (type === SEED) {
      return ["seed · " + this.stratumWord(age), born, by ? `planted for ${by}` : "", tx];
    }
    // mass
    return [this.stratumWord(age), born, by ? `grown by ${by}` : "", tx];
  }

  show(x: number, y: number, z: number) {
    this.onInspect?.(x, y, z);
    const lines = this.lines(x, y, z).filter((s) => s.length > 0);
    if (!lines.length) return;
    this.el.innerHTML = "";
    for (let i = 0; i < lines.length; i++) {
      const row = document.createElement("div");
      row.className = i === 0 ? "pq-title" : "pq-line";
      row.textContent = lines[i];
      this.el.appendChild(row);
    }
    const at = document.createElement("div");
    at.className = "pq-at";
    at.textContent = `${x - GRID / 2} ${y} ${z - GRID / 2}`;
    this.el.appendChild(at);
    // belt and suspenders for stubborn compositors (software rasterizers
    // in capture rigs drop late-toggled fixed boxes over the canvas):
    // stylesheet class AND a fresh inline assignment, re-asserted once on
    // the following frame. real browsers need any one of these.
    this.el.classList.add("show");
    this.applyBox();
    this.reassert = true;
    this.hideAt = performance.now() + SHOW_MS;
  }

  private applyBox() {
    this.el.style.cssText =
      "position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:30;" +
      "min-width:220px;max-width:360px;padding:8px 12px 7px;" +
      "background:rgba(11,11,10,0.92);border:1px solid rgba(250,243,226,0.2);" +
      "font-size:16px;line-height:1.3;text-align:center;pointer-events:none;" +
      "user-select:none;display:block";
  }

  update(now: number) {
    if (this.reassert) {
      this.reassert = false;
      this.applyBox();
    }
    if (this.hideAt && now > this.hideAt) {
      this.el.style.display = "none";
      this.el.classList.remove("show");
      this.hideAt = 0;
    }
  }
}
