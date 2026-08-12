// cathedral - kinetics: every block that enters the world ARRIVES. accreted
// stone falls in from above and thuds into place, monuments slam, collapse
// debris tumbles to the base. a pooled set of cube meshes animates the
// falls; a shared particle system puffs dust at every impact; audio gets a
// pre-attenuated thud per landing. when the pool is exhausted the physics
// gives way gracefully: the block lands instantly.

import * as THREE from "three";
import { audio } from "./audio";
import { GRID } from "./config";
import { SWATCH } from "./palette";
import type { VoxelField } from "./voxels";

const POOL = 140; // concurrent falling cubes
const GRAVITY = 26;
const DUST_MAX = 700;
const DUST_LIFE = 1.1; // s
const HEAR = 64; // full silence beyond this distance

interface Faller {
  mesh: THREE.Mesh;
  x: number; // world coords
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: THREE.Vector3;
  landed: (cx: number, cz: number) => void; // cell x/z it came to rest over
  big: boolean; // monument-grade impact
  stopY: number | null; // exact rest height (accretion lands IN its cell)
}

export class Kinetics {
  private free: THREE.Mesh[] = [];
  private active: Faller[] = [];
  private dustGeo: THREE.BufferGeometry;
  private dustPos: Float32Array;
  private dustVel: Float32Array;
  private dustLife: Float32Array;
  private dustCursor = 0;

  constructor(private scene: THREE.Scene, private field: VoxelField, private camera: THREE.PerspectiveCamera) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < POOL; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 })
      );
      m.castShadow = true;
      m.visible = false;
      this.scene.add(m);
      this.free.push(m);
    }

    this.dustPos = new Float32Array(DUST_MAX * 3);
    this.dustVel = new Float32Array(DUST_MAX * 3);
    this.dustLife = new Float32Array(DUST_MAX);
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute("position", new THREE.BufferAttribute(this.dustPos, 3));
    this.dustGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    const points = new THREE.Points(
      this.dustGeo,
      new THREE.PointsMaterial({
        color: SWATCH.dust,
        size: 0.12,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    points.frustumCulled = false;
    this.scene.add(points);
    for (let i = 0; i < DUST_MAX; i++) this.dustPos[i * 3 + 1] = -9999;
  }

  get falling(): number {
    return this.active.length;
  }

  private atten(x: number, y: number, z: number): number {
    const d = this.camera.position.distanceTo(new THREE.Vector3(x, y, z));
    return Math.max(0, 1 - d / HEAR);
  }

  // a puff of dust at a world position
  dust(x: number, y: number, z: number, count: number, spread = 0.5, up = 1.6) {
    for (let k = 0; k < count; k++) {
      const i = this.dustCursor;
      this.dustCursor = (this.dustCursor + 1) % DUST_MAX;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.dustPos[i * 3] = x + Math.cos(a) * r;
      this.dustPos[i * 3 + 1] = y + 0.1;
      this.dustPos[i * 3 + 2] = z + Math.sin(a) * r;
      this.dustVel[i * 3] = Math.cos(a) * (0.5 + Math.random());
      this.dustVel[i * 3 + 1] = up * (0.5 + Math.random() * 0.8);
      this.dustVel[i * 3 + 2] = Math.sin(a) * (0.5 + Math.random());
      this.dustLife[i] = DUST_LIFE * (0.6 + Math.random() * 0.4);
    }
  }

  // drop a block toward a target cell. landed() fires with the cell x/z the
  // stone came to rest over (drift can carry it off its spawn column); the
  // caller commits the voxel there. from is height ABOVE the current
  // surface; drift is an outward push for collapse debris.
  drop(
    cellX: number,
    cellZ: number,
    colorHex: number,
    landed: (cx: number, cz: number) => void,
    opts?: { from?: number; driftX?: number; driftZ?: number; big?: boolean; vy?: number; stopY?: number }
  ) {
    const wx = cellX - GRID / 2 + 0.5;
    const wz = cellZ - GRID / 2 + 0.5;
    const surf = opts?.stopY ?? this.field.surfaceBelow(wx, wz, 95);
    const mesh = this.free.pop();
    if (!mesh) {
      landed(cellX, cellZ); // pool dry: arrive instantly
      const a = this.atten(wx, surf, wz);
      this.dust(wx, surf, wz, 6);
      audio.thud(a * 0.8);
      return;
    }
    (mesh.material as THREE.MeshStandardMaterial).color.setHex(colorHex);
    mesh.visible = true;
    const y = surf + (opts?.from ?? 9 + Math.random() * 4);
    mesh.position.set(wx, y, wz);
    mesh.rotation.set(0, Math.random() * Math.PI, 0);
    this.active.push({
      mesh,
      x: wx,
      y,
      z: wz,
      vx: opts?.driftX ?? 0,
      vy: opts?.vy ?? 0,
      vz: opts?.driftZ ?? 0,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 3
      ),
      landed,
      big: opts?.big ?? false,
      stopY: opts?.stopY ?? null,
    });
  }

  update(dt: number) {
    // falls
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      f.vy -= GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      f.vx *= 1 - 1.4 * dt;
      f.vz *= 1 - 1.4 * dt;
      const floor = f.stopY ?? this.field.surfaceBelow(f.x, f.z, Math.max(2, f.y + 1));
      if (f.y <= floor + 0.5) {
        // rest
        const cx = Math.floor(f.x + GRID / 2);
        const cz = Math.floor(f.z + GRID / 2);
        const a = this.atten(f.x, floor, f.z);
        this.dust(f.x, floor, f.z, f.big ? 30 : 7, f.big ? 1.4 : 0.5, f.big ? 2.6 : 1.6);
        if (f.big) audio.toll(a);
        else audio.thud(a);
        f.mesh.visible = false;
        this.free.push(f.mesh);
        this.active.splice(i, 1);
        f.landed(cx, cz);
        continue;
      }
      f.mesh.position.set(f.x, f.y, f.z);
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.y += f.spin.y * dt;
      f.mesh.rotation.z += f.spin.z * dt;
    }

    // dust
    for (let i = 0; i < DUST_MAX; i++) {
      if (this.dustLife[i] <= 0) continue;
      this.dustLife[i] -= dt;
      if (this.dustLife[i] <= 0) {
        this.dustPos[i * 3 + 1] = -9999;
        continue;
      }
      this.dustVel[i * 3 + 1] -= 2.2 * dt;
      this.dustPos[i * 3] += this.dustVel[i * 3] * dt;
      this.dustPos[i * 3 + 1] += this.dustVel[i * 3 + 1] * dt;
      this.dustPos[i * 3 + 2] += this.dustVel[i * 3 + 2] * dt;
    }
    (this.dustGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }
}
