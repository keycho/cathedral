// kodo - the debug readout. hidden by default and toggled with p: it
// is an instrument for whoever is tuning the world, not an interface for a
// visitor. no tier buttons, no effect switches, no quality menu anywhere in
// the shipping ui: the world ships one configuration and steps down the
// ladder in silence when a machine cannot hold it (see src/quality.ts).

import type * as THREE from "three";

export class PerfHud {
  private root: HTMLElement;
  private line1: HTMLElement;
  private line2: HTMLElement;
  private frames = 0;
  private acc = 0;
  private worst = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private blocks: () => number,
    private step: () => number
  ) {
    this.root = document.getElementById("fps") as HTMLElement;
    this.root.innerHTML = "";
    this.root.classList.add("hidden"); // p reveals it; visitors never see it
    this.line1 = document.createElement("div");
    this.line2 = document.createElement("div");
    this.root.append(this.line1, this.line2);
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyP") this.root.classList.toggle("hidden");
    });
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
      ` <span class="fps-label">pr</span> ${this.renderer.getPixelRatio()}` +
      ` <span class="fps-label">step</span> ${this.step()}`;
    this.frames = 0;
    this.acc = 0;
    this.worst = 0;
  }
}
