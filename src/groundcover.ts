// kodo - GROUND COVER AT WALK SCALE. the empty planes up close are
// filled by things too small to exist at orbit: grass tufts and flowers
// as crossed quads, fallen leaves, small stones, and — near the paths —
// waymarkers and stumps, so no ten-block walk is featureless. everything
// is seeded deterministically per column and REBUILT around the camera
// as it moves, scaling out to nothing past twenty blocks: the orbit
// frames never see one instance of any of it.

import * as THREE from "three";

// what the season does to a near-field colour: most of the way to the
// settled snow, keeping a trace of the original so the layer still reads as
// growth poking through rather than as scattered polystyrene
function winterise(hex: number): number {
  const c = new THREE.Color(hex);
  return c.lerp(new THREE.Color(0xe4eaf2), 0.72).getHex();
}

import { GRID, WINTER } from "./config";
import { SWATCH, isMeadow } from "./palette";
import type { UrbanPlan } from "./plan";
import type { VoxelField } from "./voxels";

const RANGE = 20; // seed radius around the camera, in blocks
const FADE0 = 13; // full size inside this
const FADE1 = 20; // gone past this

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

// two quads crossed at right angles — the classic tuft
function crossGeo(w: number, h: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const quad = (rot: number) => {
    const c = Math.cos(rot) * w * 0.5;
    const s = Math.sin(rot) * w * 0.5;
    pos.push(-c, 0, -s, c, 0, s, -c, h, -s, c, 0, s, c, h, s, -c, h, -s);
    uv.push(0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1);
  };
  quad(0);
  quad(Math.PI / 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

type Layer = { mesh: THREE.InstancedMesh; n: number; cap: number };

export class GroundCover {
  private layers: Record<string, Layer> = {};
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private lastCx = -9999;
  private lastCz = -9999;
  private frame = 0;

  constructor(scene: THREE.Scene) {
    const add = (key: string, geo: THREE.BufferGeometry, color: number, cap: number, opts?: { flat?: boolean }) => {
      const mat = new THREE.MeshStandardMaterial({
        // NEAR-FIELD COVER IS WHAT A WALKER ACTUALLY SEES, so a green tuft
        // survives the season only in the last twenty blocks — where it is
        // the only thing anyone is looking at. under snow the layer keeps
        // its shapes and loses its colour: what pokes through a covering is
        // stalks and stone, not lawn.
        color: WINTER ? winterise(color) : color,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
        flatShading: opts?.flat ?? false,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.layers[key] = { mesh, n: 0, cap };
    };
    add("tuft", crossGeo(0.4, 0.32), 0x47633a, 2400);
    add("flower", crossGeo(0.24, 0.34), 0xd8a0b4, 320);
    add("stone", new THREE.BoxGeometry(0.34, 0.22, 0.28), SWATCH.stoneGrey, 340, { flat: true });
    add("leaf", new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2), 0x8a6b35, 340);
    add("moss", new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2), 0x2e4726, 260);
    add("petalfall", new THREE.PlaneGeometry(0.22, 0.22).rotateX(-Math.PI / 2), 0xdcb0bc, 260);
    add("marker", new THREE.BoxGeometry(0.4, 1.1, 0.4), SWATCH.stoneDark, 70, { flat: true });
    add("stump", new THREE.BoxGeometry(0.55, 0.45, 0.55), SWATCH.timberDark, 70, { flat: true });
  }

  private put(key: string, x: number, y: number, z: number, yaw: number, s: number, shade = 1) {
    const L = this.layers[key];
    if (L.n >= L.cap) return;
    this.q.setFromAxisAngle(_up, yaw);
    this.m.compose(this.v.set(x, y, z), this.q, _s.set(s, s, s));
    L.mesh.setColorAt(L.n, _c.setScalar(shade));
    L.mesh.setMatrixAt(L.n++, this.m);
  }

  update(camera: THREE.Camera, field: VoxelField, plan: UrbanPlan) {
    // reseed only when the camera crosses into a new column, and at most
    // every few frames — the scatter is deterministic, so the same ground
    // always grows the same tufts
    this.frame++;
    const half = GRID / 2;
    const ccx = Math.round(camera.position.x + half);
    const ccz = Math.round(camera.position.z + half);
    if (ccx === this.lastCx && ccz === this.lastCz && this.frame % 24 !== 0) return;
    this.lastCx = ccx;
    this.lastCz = ccz;

    for (const k in this.layers) this.layers[k].n = 0;
    const camY = camera.position.y;

    for (let dx = -RANGE; dx <= RANGE; dx++) {
      for (let dz = -RANGE; dz <= RANGE; dz++) {
        const x = ccx + dx;
        const z = ccz + dz;
        if (x < 2 || z < 2 || x > GRID - 3 || z > GRID - 3) continue;
        const top = field.topAt(x, z);
        if (top <= 0) continue;
        const wx = x - half + 0.5;
        const wz = z - half + 0.5;
        const d = Math.hypot(wx - camera.position.x, wz - camera.position.z);
        if (d > FADE1) continue;
        // the cover belongs to walk scale in every axis: an orbit camera
        // high above the same column sees none of it
        if (Math.abs(camY - top) > 26) continue;
        const s = 1 - Math.max(0, Math.min(1, (d - FADE0) / (FADE1 - FADE0)));
        if (s < 0.03) continue;
        const surf = field.typeAt(x, top - 1, z);
        if (!isMeadow(surf)) continue;
        const built = plan.isBuiltGround(x, z);
        const h1 = hash2(x * 1.7, z * 2.3);

        if (!built) {
          // grass tufts, one or two per column on most open meadow, each
          // with its own lean of shade so the field never posterises
          if (h1 < 0.55) {
            const n = h1 < 0.16 ? 2 : 1;
            for (let k = 0; k < n; k++) {
              const ox = hash2(x * 3.1 + k, z * 5.7) - 0.5;
              const oz = hash2(x * 7.3, z * 1.9 + k) - 0.5;
              this.put(
                "tuft",
                wx + ox * 0.8, top, wz + oz * 0.8,
                h1 * 9 + k,
                s * (0.7 + hash2(x + k, z) * 0.6),
                0.72 + hash2(x * 2.3 + k, z * 4.1) * 0.5
              );
            }
          } else if (h1 < 0.68) {
            this.put("flower", wx, top, wz, h1 * 31, s * (0.8 + h1));
          } else if (h1 < 0.73) {
            this.put("stone", wx, top + 0.1, wz, h1 * 17, s);
          } else if (h1 < 0.78) {
            this.put("leaf", wx, top + 0.03, wz, h1 * 23, s);
          } else if (h1 < 0.81) {
            this.put("moss", wx, top + 0.02, wz, h1 * 29, s, 0.85 + h1 * 0.3);
          } else if (h1 < 0.84) {
            this.put("petalfall", wx, top + 0.04, wz, h1 * 37, s);
          }
          // near a path, the kept things: a waymarker stone or an old stump
          if (h1 > 0.985 || (h1 > 0.972 && h1 <= 0.985)) {
            let nearPath = false;
            for (const [px, pz] of [[x + 4, z], [x - 4, z], [x, z + 4], [x, z - 4], [x + 3, z + 3], [x - 3, z - 3]] as const) {
              if (plan.isBuiltGround(px, pz)) nearPath = true;
            }
            if (nearPath) {
              if (h1 > 0.985) {
                this.put("marker", wx, top + 0.5, wz, 0, s);
                this.put("stone", wx + 0.1, top + 1.15, wz, h1 * 40, s * 0.8);
              } else {
                this.put("stump", wx, top + 0.2, wz, h1 * 13, s);
              }
            }
          }
        }
      }
    }

    for (const k in this.layers) {
      const L = this.layers[k];
      L.mesh.count = L.n;
      L.mesh.instanceMatrix.needsUpdate = true;
      if (L.mesh.instanceColor) L.mesh.instanceColor.needsUpdate = true;
    }
  }

  setVisible(on: boolean) {
    for (const k in this.layers) this.layers[k].mesh.visible = on;
  }
}

const _up = new THREE.Vector3(0, 1, 0);
const _s = new THREE.Vector3();
const _c = new THREE.Color();
