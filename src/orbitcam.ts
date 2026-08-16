// cathedral - the orbit rig: the default view, the stream shot, and the
// mobile view. a slow automatic drift around a target; dragging takes the
// wheel (and pauses the drift for a few seconds), scroll zooms. it never
// fights the walker: main only updates the rig while the pointer is not
// locked.

import * as THREE from "three";

const AUTO_RATE = 0.05; // rad/s idle drift
const AUTO_RESUME = 5; // s after the last drag before drifting again
const VDRIFT_RATE = 0.045; // rad/s of slow vertical wander while idle
const VDRIFT_LOW = 0.16; // the wander's floor and ceiling
const VDRIFT_HIGH = 0.72;
const DRAG_SENS = 0.005;
const ZOOM_SENS = 0.0012;
const R_MIN = 6;
// FAR ENOUGH TO FRAME THE WHOLE WORLD WITH SKY AROUND IT. ninety kept the
// camera inside the bowl, and the full-map shot — the marketing frame — was
// simply impossible. at 70 degrees of fov the 256-cell world needs about
// three hundred; a little more buys the margin of air the frame wants.
const R_MAX = 340;
const POLAR_MIN = 0.12; // rad above the horizon
const POLAR_MAX = 1.35;

export class OrbitRig {
  readonly target = new THREE.Vector3();
  radius = 24;
  azimuth = 0.8;
  polar = 0.42;

  private idleFor = Infinity; // s since the last drag
  private driftT = 0; // clock for the idle vertical wander
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointerdown", (e) => {
      if (document.pointerLockElement) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.dragging || document.pointerLockElement) return;
      this.azimuth -= (e.clientX - this.lastX) * DRAG_SENS;
      this.polar = Math.max(
        POLAR_MIN,
        Math.min(POLAR_MAX, this.polar + (e.clientY - this.lastY) * DRAG_SENS)
      );
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.idleFor = 0;
    });
    window.addEventListener("pointerup", () => (this.dragging = false));
    window.addEventListener("pointercancel", () => (this.dragging = false));
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (document.pointerLockElement) return;
        this.radius = Math.max(
          R_MIN,
          Math.min(R_MAX, this.radius * (1 + e.deltaY * ZOOM_SENS))
        );
        this.idleFor = 0;
        e.preventDefault();
      },
      { passive: false }
    );
  }

  // re-seed the rig from wherever the camera is, so leaving walk mode hands
  // over without a cut
  seedFrom(camera: THREE.PerspectiveCamera) {
    const d = camera.position.clone().sub(this.target);
    const r = d.length();
    if (r < 1) return;
    this.radius = Math.max(R_MIN, Math.min(R_MAX, r));
    this.azimuth = Math.atan2(d.z, d.x);
    this.polar = Math.max(POLAR_MIN, Math.min(POLAR_MAX, Math.asin(d.y / r)));
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    this.idleFor += dt;
    if (this.idleFor > AUTO_RESUME) {
      this.azimuth += AUTO_RATE * dt;
      // a slow vertical wander: the eye sinks toward the meadow, rises for
      // the overview, and back, so idle orbits see the world at every height
      this.driftT += dt;
      const mid = (VDRIFT_LOW + VDRIFT_HIGH) / 2;
      const span = (VDRIFT_HIGH - VDRIFT_LOW) / 2;
      const want = mid + Math.sin(this.driftT * VDRIFT_RATE) * span;
      this.polar += (want - this.polar) * Math.min(1, dt * 0.25);
    }
    const ch = Math.cos(this.polar) * this.radius;
    camera.position.set(
      this.target.x + Math.cos(this.azimuth) * ch,
      this.target.y + Math.sin(this.polar) * this.radius,
      this.target.z + Math.sin(this.azimuth) * ch
    );
    camera.lookAt(this.target);
  }
}
