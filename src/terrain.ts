// cathedral - the ground. a near-void ash plain, gently rolling so the low
// sun drags long shadows across it, tapering toward the void at the rim.
// the world starts empty except this terrain; everything else is grown by
// the market or built by the crew.

import * as THREE from "three";
import { GRID } from "./config";
import { ASH, BEDROCK, GENESIS } from "./palette";
import type { FieldSampler, VoxelField } from "./voxels";

// --- small value-noise kit (deterministic, no deps) ------------------------
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fractal(x: number, y: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
function sstep(e0: number, e1: number, x: number): number {
  let t = (x - e0) / (e1 - e0);
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

// --- the plain -------------------------------------------------------------

export const GENESIS_CELL = { x: GRID / 2, z: GRID / 2 };

// how far into the dissolve band a column sits: 0 interior -> 1 at the rim.
// the band starts early and eases, so the silhouette never reads as ragged
// chunks against the void; heights flatten and colours sink into the dark
// across the same ramp.
function rim(x: number, z: number): number {
  const dx = x - GRID / 2;
  const dz = z - GRID / 2;
  const edge = Math.max(Math.abs(dx), Math.abs(dz)) / (GRID / 2);
  // a little noise so the dissolve contour wanders instead of tracing a square
  const wobble = (valueNoise(x * 0.05 + 400, z * 0.05 + 420) - 0.5) * 0.1;
  return sstep(0.6, 0.98, edge + wobble);
}

export const plainSampler: FieldSampler = {
  heightAt(x: number, z: number): number {
    // gentle dunes, 2..6 blocks, flattening across the dissolve band
    const n = fractal(x * 0.022 + 31, z * 0.022 + 57);
    const h = 2 + n * 4;
    const r = rim(x, z);
    return Math.max(1, Math.round(h * (1 - r) + 1 * r));
  },
  typeAt(_x: number, _z: number, y: number, h: number): number {
    return y === h - 1 ? ASH : BEDROCK;
  },
  // rim columns fade toward the void floor; dithered so the falloff reads
  // as haze rather than banding
  groundShade(x: number, z: number): number {
    const r = rim(x, z);
    if (r <= 0) return 1;
    const dither = hash2(x * 1.3 + 9, z * 1.7 + 4) * 0.1;
    return Math.max(0.16, 1 - r * (0.82 + dither));
  },
};

// the void floor: an oversized near-black plane under and beyond the voxel
// grid, so the plain reads as ash flats fading into nothing
export function buildVoidFloor(scene: THREE.Scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x0d0c0a, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  floor.receiveShadow = true;
  scene.add(floor);
}

// place the founding stone on the plain's surface at world center.
// returns the world-space center of the block (for cameras + the glow).
export function placeGenesis(field: VoxelField): THREE.Vector3 {
  const gx = GENESIS_CELL.x;
  const gz = GENESIS_CELL.z;
  const gy = field.topAt(gx, gz);
  field.placeAt(gx, gy, gz, GENESIS);
  return field.worldCenter(gx, gy, gz, new THREE.Vector3());
}
