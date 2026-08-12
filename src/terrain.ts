// cathedral - the ground. a green basin holding the founding stone, calm
// where the crew builds and wilder toward the horizon: grey cliff crests,
// old craters mossed over, jade water basins, and four ancient spires
// standing far off so every view has a landmark. the world still starts
// empty of structure; the hillside is the stage, everything on it is grown
// by the market or built by the crew.

import * as THREE from "three";
import { GRID } from "./config";
import {
  EARTH,
  EMBERSEAM,
  GENESIS,
  MEADOW,
  CLIFF,
  SCARMOSS,
  STILLWATER,
  SWATCH,
} from "./palette";
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

// --- the land --------------------------------------------------------------

export const GENESIS_CELL = { x: GRID / 2, z: GRID / 2 };
const CX = GRID / 2;
const CZ = GRID / 2;
const PLAZA_H = 6; // the founding plaza's flat height

// landmarks, placed by hand so every compass direction has one
export const SPIRES = [
  { x: CX + 70, z: CZ + 18, h: 20 },
  { x: CX - 64, z: CZ + 52, h: 16 },
  { x: CX - 30, z: CZ - 78, h: 24 },
  { x: CX + 44, z: CZ - 60, h: 14 },
];
export const CRATERS = [
  { x: CX - 88, z: CZ - 16, r: 11, d: 4 },
  { x: CX + 58, z: CZ + 72, r: 9, d: 3 },
  { x: CX + 16, z: CZ + 96, r: 13, d: 5 },
];
// stillwater basins: shallow bowls holding water at a fixed level
export const BASINS = [
  { x: CX - 70, z: CZ + 70, r: 12, wl: 4 },
  { x: CX + 84, z: CZ - 44, r: 10, wl: 4 },
];

// how far into the world's edge a column sits: 0 interior -> 1 at the rim.
// the land tapers there and the haze takes it; no void, just distance.
function rim(x: number, z: number): number {
  const dx = x - CX;
  const dz = z - CZ;
  const edge = Math.max(Math.abs(dx), Math.abs(dz)) / (GRID / 2);
  const wobble = (valueNoise(x * 0.05 + 400, z * 0.05 + 420) - 0.5) * 0.1;
  return sstep(0.62, 0.985, edge + wobble);
}

// ridge crests: folded noise, sharpened, only counted on high ground
function ridge(x: number, z: number): number {
  const n = valueNoise(x * 0.02 + 90, z * 0.02 + 12);
  const crest = 1 - Math.abs(n * 2 - 1);
  return crest * crest;
}

interface Sample {
  h: number;
  top: number; // material of the top block
  water: boolean; // top-of-column is stillwater
  ridgeBoost: number;
}

// the field asks heightAt once and then typeAt for every y of the same
// column; a one-entry memo makes the whole walk cost one sample per column
let memoKey = -1;
let memoVal: Sample | null = null;

function sampleColumn(x: number, z: number): Sample {
  const key = x * GRID + z;
  if (key === memoKey && memoVal) return memoVal;
  memoVal = computeColumn(x, z);
  memoKey = key;
  return memoVal;
}

function computeColumn(x: number, z: number): Sample {
  const dgx = x - CX;
  const dgz = z - CZ;
  const dGen = Math.hypot(dgx, dgz);

  // rolling hillside, damped inside the crew's build ring so the basin stays
  // calm and buildable, full amplitude out toward the horizon
  const amp = 0.45 + 0.55 * sstep(16, 44, dGen);
  const base = 4 + fractal(x * 0.017 + 31, z * 0.017 + 57) * 9 * amp;

  // bare rock crests on the high ground, held off the build ring
  let ridgeBoost = 0;
  if (base > 7.2) {
    const r = ridge(x, z);
    if (r > 0.55) ridgeBoost = (r - 0.55) * 11 * sstep(30, 48, dGen);
  }

  let h = base + ridgeBoost;
  let top = MEADOW;
  let water = false;

  // craters: a mossy bowl with a raised lip
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r + 4) {
      const bowl = 1 - sstep(0, c.r, d);
      h -= c.d * smooth(bowl);
      h += 1.6 * Math.max(0, 1 - Math.abs(d - c.r) / 3);
      if (d < c.r * 0.92) {
        top = SCARMOSS;
        if (d < c.r * 0.55 && hash2(x * 3.1, z * 2.7) < 0.05) top = EMBERSEAM;
      } else if (d < c.r + 2 && hash2(x * 1.9, z * 4.3) < 0.35) {
        top = CLIFF;
      }
    }
  }

  // stillwater basins: floor sunk under a fixed water level, held by a low
  // earthen bank that eases back into the meadow
  for (const b of BASINS) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (d < b.r * 1.6) {
      const core = b.r * 0.78;
      if (d < core) {
        h = b.wl + 1; // blocks 0..wl, water in the top two cells
        top = STILLWATER;
        water = true;
      } else {
        const t = sstep(core, b.r * 1.6, d);
        h = (b.wl + 2) * (1 - t) + h * t;
        if (t < 0.5) top = EARTH; // the bank
      }
    }
  }

  // ancient spires: ragged old towers, part of the ground itself
  for (const s of SPIRES) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < 4.6) {
      const ragged = (hash2(x * 5.7, z * 6.1) - 0.5) * 3;
      if (d < 1.8) h = Math.max(h, base + s.h + ragged);
      else if (d < 3.0) h = Math.max(h, base + s.h * 0.55 + ragged);
      else if (hash2(x * 2.3, z * 3.7) < 0.5) h = Math.max(h, base + 1.5 + ragged * 0.5);
      if (d < 3.0) top = CLIFF;
    }
  }

  // the founding plaza: flat ground for the stone and the crew's yard
  const plaza = sstep(14, 26, dGen);
  h = PLAZA_H * (1 - plaza) + h * plaza;
  if (dGen < 14) top = MEADOW;

  // exposed rock where the crests actually broke through
  if (ridgeBoost > 1.6 && top === MEADOW) top = CLIFF;

  // low wet pockets moss over
  if (top === MEADOW && h < 5.2 && dGen > 30) {
    if (valueNoise(x * 0.045 + 210, z * 0.045 + 77) > 0.72) top = SCARMOSS;
  }

  // the rim: taper into the haze
  const r = rim(x, z);
  if (r > 0) h = h * (1 - r * 0.9) + 2 * r * 0.9;

  return { h: Math.max(1, Math.round(h)), top, water, ridgeBoost };
}

export const meadowSampler: FieldSampler = {
  heightAt(x: number, z: number): number {
    return sampleColumn(x, z).h;
  },
  typeAt(x: number, z: number, y: number, h: number): number {
    const s = sampleColumn(x, z);
    if (s.water) {
      // water fills the top two cells of a basin column; earth below
      return y >= h - 2 ? STILLWATER : EARTH;
    }
    if (y === h - 1) return s.top;
    // ridge crests keep rock a little deeper so torn sides read as stone
    if (s.ridgeBoost > 1.6 && y >= h - 3) return CLIFF;
    if (s.top === CLIFF && y >= h - 2) return CLIFF;
    return EARTH;
  },
  // the land's colour varies with where it sits: valley floors hold water
  // and read deep and green, ridgelines catch the mist and go pale and COOL
  // (never bleached warm), and a slow macro noise keeps neighbouring hills
  // from reading identical. this is the layered-hill look: each fold a
  // little further into the air than the one in front of it.
  groundTint(x: number, z: number): [number, number, number] {
    const s = sampleColumn(x, z);
    const macro = fractal(x * 0.006 + 611, z * 0.006 + 133); // region character
    const moisture = 1 - sstep(4.5, 12, s.h); // low ground stays wet
    const dry = sstep(8, 15, s.h);
    // wet: deeper and greener. high: paler and cooler, mist-touched.
    const r = 1 + dry * 0.1 - moisture * 0.12 + (macro - 0.5) * 0.1;
    const g = 1 + moisture * 0.08 + dry * 0.06 + (macro - 0.5) * 0.06;
    const b = 1 - moisture * 0.1 + dry * 0.18 + (macro - 0.5) * 0.06;
    return [r, g, b];
  },
  // painterly ground: broad light-and-dark patches in the grass, a gentle
  // dim across the rim so the edge sinks into mist instead of void
  groundShade(x: number, z: number): number {
    const patch = (fractal(x * 0.011 + 7, z * 0.011 + 3) - 0.5) * 0.2;
    const r = rim(x, z);
    const dither = hash2(x * 1.3 + 9, z * 1.7 + 4);
    // a per-column grain over the whole map, not just the rim: cliff stone
    // covers acres of terrace and without it a whole hillside of rock is
    // one flat value, which is the thing the component law forbids
    const grain = (dither - 0.5) * 0.07;
    const shade = 0.97 + patch + grain - r * (0.3 + dither * 0.05);
    return Math.max(0.62, Math.min(1.08, shade));
  },
};

// the floor beyond the grid: warm earth under the haze, so the world sits
// on land, not on nothing
export function buildVoidFloor(scene: THREE.Scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000, 1, 1),
    new THREE.MeshStandardMaterial({ color: SWATCH.earth, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  floor.receiveShadow = true;
  scene.add(floor);
}

// place the founding stone on the plaza at world center.
// returns the world-space center of the block (for cameras + the glow).
export function placeGenesis(field: VoxelField): THREE.Vector3 {
  const gx = GENESIS_CELL.x;
  const gz = GENESIS_CELL.z;
  const gy = field.topAt(gx, gz);
  field.placeAt(gx, gy, gz, GENESIS);
  return field.worldCenter(gx, gy, gz, new THREE.Vector3());
}
