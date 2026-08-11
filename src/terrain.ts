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

// --- the plain -------------------------------------------------------------

export const GENESIS_CELL = { x: GRID / 2, z: GRID / 2 };

export const plainSampler: FieldSampler = {
  heightAt(x: number, z: number): number {
    // gentle dunes, 2..6 blocks
    const n = fractal(x * 0.022 + 31, z * 0.022 + 57);
    let h = 2 + n * 4;
    // taper to a single layer near the rim so the plain dissolves into the
    // void instead of ending in a cliff
    const dx = x - GRID / 2;
    const dz = z - GRID / 2;
    const edge = Math.max(Math.abs(dx), Math.abs(dz)) / (GRID / 2);
    if (edge > 0.82) h = h * Math.max(0, (1 - edge) / 0.18) + 1;
    return Math.max(1, Math.round(h));
  },
  typeAt(_x: number, _z: number, y: number, h: number): number {
    return y === h - 1 ? ASH : BEDROCK;
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
