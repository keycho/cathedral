// cathedral - dev edit probe. NOT a gameplay system: visitors never build.
// a dev-build-only tool to poke the field while the market rules are being
// written. left click steps the targeted block through its damage tiers and
// breaks it on the last hit (the same ramp collapse will use); right click
// places a mass block. active only while pointer-locked in a dev build.

import * as THREE from "three";
import { MASS } from "./palette";
import type { VoxelField } from "./voxels";
import type { RayHit } from "./voxels";

const REACH = 8;
const HITS_TO_BREAK = 3; // damage tiers per block

export class EditProbe {
  // main wires this to veto placements that would intersect the walker
  blocked?: (x: number, y: number, z: number) => boolean;

  private outline: THREE.LineSegments;
  private dir = new THREE.Vector3();
  private center = new THREE.Vector3();
  private target: RayHit | null = null;
  private hp = new Map<string, number>();

  constructor(
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private field: VoxelField
  ) {
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04));
    this.outline = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xfaf3e2, transparent: true, opacity: 0.5 })
    );
    this.outline.visible = false;
    scene.add(this.outline);

    window.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("mousedown", (e) => {
      if (!document.pointerLockElement || !this.target) return;
      if (e.button === 0) this.hit();
      else if (e.button === 2) this.place();
    });
  }

  private key(x: number, y: number, z: number): string {
    return x + "," + y + "," + z;
  }

  private hit() {
    const t = this.target;
    if (!t) return;
    const k = this.key(t.hx, t.hy, t.hz);
    const left = (this.hp.get(k) ?? HITS_TO_BREAK) - 1;
    if (left <= 0) {
      this.hp.delete(k);
      this.field.breakAt(t.hx, t.hy, t.hz);
    } else {
      this.hp.set(k, left);
      this.field.damageAt(t.hx, t.hy, t.hz, left / HITS_TO_BREAK);
    }
  }

  private place() {
    const t = this.target;
    if (!t || !t.hasPlace) return;
    if (this.blocked?.(t.px, t.py, t.pz)) return;
    this.field.placeAt(t.px, t.py, t.pz, MASS);
  }

  update() {
    if (!document.pointerLockElement) {
      this.outline.visible = false;
      return;
    }
    this.camera.getWorldDirection(this.dir);
    const o = this.camera.position;
    this.target = this.field.raycast(o.x, o.y, o.z, this.dir.x, this.dir.y, this.dir.z, REACH);
    if (this.target) {
      this.field.worldCenter(this.target.hx, this.target.hy, this.target.hz, this.center);
      this.outline.position.copy(this.center);
      this.outline.visible = true;
    } else {
      this.outline.visible = false;
    }
  }
}
