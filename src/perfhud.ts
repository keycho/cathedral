// cathedral - the perf readout and the bisect harness, in the world. it
// shows what a frame actually costs (fps, frame ms, draw calls, triangles,
// the standing block count) and lets any effect be switched off one at a
// time, on the machine that has to render it. toggle with p.
//
// this exists because a render budget cannot be guessed at: the numbers
// have to come from the hardware the stream and the visitors run on.

import type * as THREE from "three";
import type { Post } from "./post";
import { qualityFor, rememberTier, type Effects, type Quality, type Tier } from "./quality";

const FX_KEYS: (keyof Effects)[] = ["gtao", "bloom", "grade", "haze"];

export class PerfHud {
  private root: HTMLElement;
  private line1: HTMLElement;
  private line2: HTMLElement;
  private tierRow: HTMLElement;
  private fxRow: HTMLElement;
  private shadows = true;
  private pr: number;
  private frames = 0;
  private acc = 0;
  private worst = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private post: Post,
    private quality: Quality,
    private blocks: () => number,
    private onTier: (t: Tier) => void,
    private onEffects: (fx: Effects) => void,
    private onShadows: (on: boolean) => void,
    private onPixelRatio: (pr: number) => void
  ) {
    this.pr = quality.pixelRatio;
    this.root = document.getElementById("fps") as HTMLElement;
    this.root.innerHTML = "";
    this.root.classList.remove("hidden"); // performance is the priority: show it
    this.line1 = document.createElement("div");
    this.line2 = document.createElement("div");
    this.tierRow = document.createElement("div");
    this.tierRow.className = "pf-row";
    this.fxRow = document.createElement("div");
    this.fxRow.className = "pf-row";
    this.root.append(this.line1, this.line2, this.tierRow, this.fxRow);

    for (const t of ["low", "medium", "high"] as Tier[]) {
      const b = document.createElement("button");
      b.className = "pf-btn";
      b.textContent = t;
      b.addEventListener("click", () => {
        const q = qualityFor(t);
        rememberTier(t);
        this.quality = q;
        this.pr = q.pixelRatio; // the tier brings its own resolution
        this.onTier(t);
        this.paintButtons();
      });
      this.tierRow.appendChild(b);
    }

    // resolution is its own axis, never baked into a tier
    for (const pr of [1, 1.5, 2]) {
      const b = document.createElement("button");
      b.className = "pf-btn";
      b.textContent = "pr" + pr;
      b.addEventListener("click", () => {
        this.pr = pr;
        this.onPixelRatio(pr);
        this.paintButtons();
      });
      this.tierRow.appendChild(b);
    }

    // the shadow pass draws the world a second time: its own switch
    const shadowBtn = document.createElement("button");
    shadowBtn.className = "pf-btn on";
    shadowBtn.textContent = "shadows";
    shadowBtn.addEventListener("click", () => {
      this.shadows = !this.shadows;
      shadowBtn.classList.toggle("on", this.shadows);
      this.onShadows(this.shadows);
    });
    this.fxRow.appendChild(shadowBtn);

    for (const k of FX_KEYS) {
      const b = document.createElement("button");
      b.className = "pf-btn";
      b.textContent = k;
      b.addEventListener("click", () => {
        const fx = { ...this.post.effects, [k]: !this.post.effects[k] };
        // the haze lives inside the grade pass: no grade, no haze
        if (k === "haze" && fx.haze) fx.grade = true;
        if (k === "grade" && !fx.grade) fx.haze = false;
        this.onEffects(fx);
        this.paintButtons();
      });
      this.fxRow.appendChild(b);
    }
    this.paintButtons();

    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyP") this.root.classList.toggle("hidden");
    });
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.paintButtons();
  }

  private paintButtons() {
    const tiers = this.tierRow.children;
    for (let i = 0; i < tiers.length; i++) {
      const b = tiers[i] as HTMLElement;
      const t = b.textContent ?? "";
      if (t.startsWith("pr")) b.classList.toggle("on", t === "pr" + this.pr);
      else b.classList.toggle("on", t === this.quality.tier);
    }
    const fx = this.post.effects;
    const items = this.fxRow.children;
    // the first button in the row is the shadow switch; the rest are fx
    for (let i = 1; i < items.length; i++) {
      const b = items[i] as HTMLElement;
      b.classList.toggle("on", !!fx[FX_KEYS[i - 1]]);
    }
  }

  update(dt: number) {
    this.frames++;
    this.acc += dt;
    this.worst = Math.max(this.worst, dt);
    if (this.acc < 0.5) return;
    const fps = this.frames / this.acc;
    const ms = (this.acc / this.frames) * 1000;
    const info = this.renderer.info.render;
    this.line1.innerHTML =
      `<span class="fps-label">fps</span> <span id="fps-num">${Math.round(fps)}</span>` +
      ` <span class="fps-label">ms</span> ${ms.toFixed(1)}` +
      ` <span class="fps-label">worst</span> ${(this.worst * 1000).toFixed(0)}`;
    this.line2.innerHTML =
      `<span class="fps-label">draws</span> ${info.calls}` +
      ` <span class="fps-label">tris</span> ${(info.triangles / 1000).toFixed(0)}k` +
      ` <span class="fps-label">blocks</span> ${this.blocks()}` +
      ` <span class="fps-label">pr</span> ${this.renderer.getPixelRatio()}`;
    this.frames = 0;
    this.acc = 0;
    this.worst = 0;
  }
}
