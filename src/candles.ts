// kodo - the candle row: twelve translucent columns standing at the
// founding plaza's south edge, the market's last minutes rendered as
// glass. eleven closed ticks fade with age; the twelfth forms live,
// swelling and changing colour as the price moves inside the open tick.
// green for a close above its open, ember below. diegetic, not ui: they
// stand in the world, cast their light on the grass, and can be walked
// around like any other stones.

import * as THREE from "three";
import { GRID } from "./config";
import { FALL, RISE, blockColor } from "./palette";
import type { TickEngine } from "./ticks";
import type { VoxelField } from "./voxels";

const COUNT = 12; // eleven closed + one forming
const W = 0.72; // candle body width
const H_MIN = 0.35;
const H_MAX = 7;
const MOVE_SCALE = 160; // body height per unit of relative move

export class Candles {
  private meshes: THREE.Mesh[] = [];
  private mats: THREE.MeshStandardMaterial[] = [];

  constructor(
    scene: THREE.Scene,
    private ticks: TickEngine,
    private price: () => number,
    genesis: THREE.Vector3,
    field: VoxelField
  ) {
    const geo = new THREE.BoxGeometry(W, 1, W);
    geo.translate(0, 0.5, 0); // scale.y grows the body upward from its base
    for (let i = 0; i < COUNT; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: blockColor(RISE),
        emissive: blockColor(RISE),
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.4,
        roughness: 0.4,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      // the row runs west to east south of the plaza, far enough out that
      // decades of accretion don't swallow it; each candle stands on the
      // ground its own column actually has
      const wx = genesis.x - 6.6 + i * 1.2;
      const wz = genesis.z + 19;
      const cellX = Math.round(wx + GRID / 2 - 0.5);
      const cellZ = Math.round(wz + GRID / 2 - 0.5);
      mesh.position.set(wx, field.topAt(cellX, cellZ), wz);
      mesh.scale.y = H_MIN;
      mesh.castShadow = false;
      scene.add(mesh);
      this.meshes.push(mesh);
      this.mats.push(mat);
    }
  }

  private shape(i: number, open: number, close: number, age01: number) {
    const mesh = this.meshes[i];
    const mat = this.mats[i];
    if (!(open > 0) || !(close > 0)) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const rel = Math.abs(close - open) / open;
    mesh.scale.y = Math.min(H_MAX, Math.max(H_MIN, rel * MOVE_SCALE));
    const rise = close >= open;
    const hex = blockColor(rise ? RISE : FALL);
    mat.color.setHex(hex);
    mat.emissive.setHex(hex);
    // the past cools: oldest candles fade toward glass
    mat.opacity = 0.18 + 0.34 * (1 - age01);
    mat.emissiveIntensity = 0.2 + 0.5 * (1 - age01);
  }

  update() {
    const h = this.ticks.history;
    const closed = Math.min(COUNT - 1, h.length);
    // closed candles, oldest first across the row
    for (let k = 0; k < COUNT - 1; k++) {
      const i = h.length - closed + k;
      if (k >= closed || i < 1) {
        this.meshes[k].visible = false;
        continue;
      }
      const open = h[i - 1].close;
      const close = h[i].close;
      const age01 = closed <= 1 ? 0 : 1 - k / (closed - 1);
      this.shape(k, open, close, age01);
    }
    // the forming candle: open = last close, close = the price right now
    const open = h.length ? h[h.length - 1].close : this.price();
    this.shape(COUNT - 1, open, this.price(), 0);
  }
}
