// cathedral - first-person walker with true 3d voxel collision, ported from
// the biocraft engine. the visitor is an aabb tested against per-voxel
// solidity (not column tops), so hollows, overhangs and rubble caves are all
// walkable. supported by any voxel below the feet, blocked by voxels on any
// side, head-blocked above. swim / jetpack / third-person are gone; a plain
// fly toggle (g) remains for inspection.

import * as THREE from "three";
import { GRID, WORLD } from "./config";
import type { VoxelField } from "./voxels";

const R = 0.3; // half-width of the visitor box
const HEIGHT = 1.8; // feet to top of head
const EYE = 1.62;
const WALK = 5.2;
const SPRINT = 8.6;
const GRAVITY = 24;
const JUMP = 8.2;
const STEP = 1.05; // auto step-up height
const SENS = 0.0022;
const PITCH_MAX = Math.PI / 2 - 0.05;
const BOUND = WORLD / 2 - 1.5;
const FLY_SPEED = 10;

export class FirstPerson {
  pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  velY = 0;
  grounded = true;
  locked = false;
  fly = false;

  private keys = new Set<string>();
  private field: VoxelField;
  private camera: THREE.PerspectiveCamera;

  constructor(field: VoxelField, camera: THREE.PerspectiveCamera, spawnX: number, spawnZ: number, yaw = 0) {
    this.field = field;
    this.camera = camera;
    this.yaw = yaw;
    this.pos.set(spawnX, field.surfaceBelow(spawnX, spawnZ, 60), spawnZ);

    window.addEventListener("keydown", (e) => {
      if (!this.locked) return;
      if (e.code === "KeyG" && !e.repeat) {
        this.fly = !this.fly;
        this.velY = 0;
      }
      this.keys.add(e.code);
      if (e.code === "Space") e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    document.addEventListener("pointerlockchange", () => {
      this.locked = !!document.pointerLockElement;
      if (!this.locked) this.keys.clear();
    });
    window.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * SENS;
      this.pitch -= e.movementY * SENS;
      this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch));
    });
  }

  requestLock() {
    document.body.requestPointerLock();
  }

  private clamp(v: number): number {
    return Math.max(-BOUND, Math.min(BOUND, v));
  }
  private cell(w: number): number {
    return Math.floor(w + GRID / 2);
  }

  // does the visitor box at (x, feet, z) overlap any solid voxel?
  private collides(x: number, feet: number, z: number): boolean {
    const x0 = this.cell(x - R);
    const x1 = this.cell(x + R);
    const z0 = this.cell(z - R);
    const z1 = this.cell(z + R);
    const y0 = Math.floor(feet + 0.02);
    const y1 = Math.floor(feet + HEIGHT - 0.02);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++)
        for (let cz = z0; cz <= z1; cz++) if (this.field.isSolid(cx, cy, cz)) return true;
    return false;
  }
  // solid directly under the feet?
  private footOn(x: number, feet: number, z: number): boolean {
    const x0 = this.cell(x - R);
    const x1 = this.cell(x + R);
    const z0 = this.cell(z - R);
    const z1 = this.cell(z + R);
    const cy = Math.floor(feet - 0.08);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) if (this.field.isSolid(cx, cy, cz)) return true;
    return false;
  }
  // top of the highest solid voxel at/below fromY under the visitor footprint
  private floorUnder(x: number, z: number, fromY: number): number {
    const x0 = this.cell(x - R);
    const x1 = this.cell(x + R);
    const z0 = this.cell(z - R);
    const z1 = this.cell(z + R);
    for (let cy = Math.floor(fromY + 0.02); cy >= 0; cy--)
      for (let cx = x0; cx <= x1; cx++)
        for (let cz = z0; cz <= z1; cz++) if (this.field.isSolid(cx, cy, cz)) return cy + 1;
    return 0;
  }

  private moveAxis(amount: number, isX: boolean) {
    if (amount === 0) return;
    const tx = this.clamp(isX ? this.pos.x + amount : this.pos.x);
    const tz = this.clamp(isX ? this.pos.z : this.pos.z + amount);
    if (!this.collides(tx, this.pos.y, tz)) {
      this.pos.x = tx;
      this.pos.z = tz;
      return;
    }
    // auto step-up over a low ledge (rubble is meant to be climbed)
    const up = this.pos.y + STEP;
    if (!this.collides(tx, up, tz) && !this.collides(this.pos.x, up, this.pos.z)) {
      this.pos.x = tx;
      this.pos.z = tz;
      this.pos.y = this.floorUnder(this.pos.x, this.pos.z, up + 0.5);
    }
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    const space = this.keys.has("Space");
    const shift = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");

    // horizontal
    const fwd = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const str = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    let dx = -Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * str;
    let dz = -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * str;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
      const speed = (shift && !this.fly ? SPRINT : WALK) * dt;
      this.moveAxis(dx * speed, true);
      this.moveAxis(dz * speed, false);
    }

    // vertical
    if (this.fly) {
      let vy = 0;
      if (space) vy += FLY_SPEED;
      if (shift) vy -= FLY_SPEED;
      const ny = this.pos.y + vy * dt;
      if (!this.collides(this.pos.x, ny, this.pos.z)) this.pos.y = ny;
      this.velY = 0;
      this.grounded = true;
    } else {
      const onGround = this.velY <= 0 && this.footOn(this.pos.x, this.pos.y, this.pos.z);
      if (onGround) {
        this.pos.y = this.floorUnder(this.pos.x, this.pos.z, this.pos.y + 0.1);
        this.velY = 0;
        this.grounded = true;
        if (space) {
          this.velY = JUMP;
          this.grounded = false;
        }
      } else {
        this.grounded = false;
        this.velY -= GRAVITY * dt;
        const ny = this.pos.y + this.velY * dt;
        if (this.velY <= 0) {
          const fl = this.floorUnder(this.pos.x, this.pos.z, this.pos.y + 0.1);
          if (ny <= fl) {
            this.pos.y = fl;
            this.velY = 0;
            this.grounded = true;
          } else {
            this.pos.y = ny;
          }
        } else if (this.collides(this.pos.x, ny, this.pos.z)) {
          this.velY = 0; // head-block
        } else {
          this.pos.y = ny;
        }
      }
    }

    this.syncCamera();
  }

  syncCamera() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }
}
