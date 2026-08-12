// cathedral - the drift. meadow seeds and petals riding the air, wrapped in
// a volume that follows the camera so the air is always moving and never
// crowded. density is driven from outside (r6: ambient scales with market
// volume); the level here is just obeyed. (the class keeps its founding
// name; the ash became seeds when the world greened.)

import * as THREE from "three";

const MAX = 900; // particles at level 1
const BOX_W = 110; // wrap volume around the camera
const BOX_H = 52;
const FALL_MIN = 0.12; // u/s - seeds hang, they don't fall
const FALL_VAR = 0.22;
const SWAY = 0.65; // lateral drift amplitude, u/s - gusts carry them

export class AshDrift {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private fall: Float32Array;
  private phase: Float32Array;
  private level01 = 0.3;
  private geo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(MAX * 3);
    this.fall = new Float32Array(MAX);
    this.phase = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * BOX_W;
      this.pos[i * 3 + 1] = Math.random() * BOX_H;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * BOX_W;
      this.fall[i] = FALL_MIN + Math.random() * FALL_VAR;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), BOX_W); // recentered each frame
    const mat = new THREE.PointsMaterial({
      color: 0xf6dfc0,
      size: 0.085,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.setLevel(this.level01);
    scene.add(this.points);
  }

  // 0..1 -> particle count (a little ash always falls)
  setLevel(v: number) {
    this.level01 = Math.max(0, Math.min(1, v));
    const n = Math.round(MAX * (0.12 + 0.88 * this.level01));
    this.geo.setDrawRange(0, n);
  }

  update(dt: number, t: number, center: THREE.Vector3) {
    const n = Math.round(MAX * (0.12 + 0.88 * this.level01));
    const cx = center.x;
    const cy = center.y;
    const cz = center.z;
    for (let i = 0; i < n; i++) {
      let x = this.pos[i * 3];
      let y = this.pos[i * 3 + 1];
      let z = this.pos[i * 3 + 2];
      y -= this.fall[i] * dt;
      x += Math.sin(t * 0.4 + this.phase[i]) * SWAY * dt;
      z += Math.cos(t * 0.31 + this.phase[i] * 1.7) * SWAY * 0.7 * dt;
      // wrap into the box around the camera
      if (y < cy - 6) y += BOX_H;
      if (x < cx - BOX_W / 2) x += BOX_W;
      else if (x > cx + BOX_W / 2) x -= BOX_W;
      if (z < cz - BOX_W / 2) z += BOX_W;
      else if (z > cz + BOX_W / 2) z -= BOX_W;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
    }
    this.geo.boundingSphere?.center.copy(center);
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }
}
