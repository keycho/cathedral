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
  MEADOWDEEP,
  MEADOWMOSS,
  MEADOWOLIVE,
  MEADOWPALE,
  MEADOWSAGE,
  MEADOWSHADE,
  CLAY,
  CLIFF,
  GRASSDRY,
  GRAVEL,
  LICHEN,
  SAND,
  SCREE,
  SCARMOSS,
  STILLWATER,
  isMeadow,
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
// WATER HAS TO BE VISIBLE FROM MORE THAN TWO PLACES. two bowls of twelve
// and ten blocks across a 256 grid is 0.8% of the surface — from orbit it
// was a dark speck, and from most of the map there was no water in frame at
// all. five reaches now, wider, at spread bearings and altitudes, so a wide
// shot almost always has one catching the sky.
export const BASINS = [
  { x: CX - 74, z: CZ + 66, r: 21, wl: 4 },
  { x: CX + 84, z: CZ - 44, r: 17, wl: 4 },
  { x: CX + 38, z: CZ + 92, r: 15, wl: 3 },
  { x: CX - 96, z: CZ - 52, r: 14, wl: 5 },
  { x: CX + 8, z: CZ - 88, r: 12, wl: 4 },
];

// how far into the world's edge a column sits: 0 interior -> 1 at the rim.
// the land tapers there and the haze takes it; no void, just distance.
// THE FRAME WAS THE WORST OF IT. a chebyshev distance makes this a SQUARE,
// and squeezing eleven blocks of fall into the last third of the map made
// ten tight terraces of it — a picture-frame of parallel grey steps running
// the whole way round the world, which is the one shape nothing in geology
// makes. the fall is spread over half the map instead of a third, and the
// metric is bent at two scales: a slow fractal worth about twenty blocks
// that throws whole headlands out past where the edge "should" be, and the
// old fine ripple on top for the coastline.
function rim(x: number, z: number): number {
  const dx = Math.abs(x - CX);
  const dz = Math.abs(z - CZ);
  // half chebyshev, half euclidean: the square corner is what read as made
  const edge = (Math.max(dx, dz) * 0.5 + Math.hypot(dx, dz) * 0.5) / (GRID / 2);
  const coast = (fractal(x * 0.02 + 400, z * 0.02 + 420) - 0.5) * 0.3;
  const ripple = (valueNoise(x * 0.07 + 61, z * 0.07 + 88) - 0.5) * 0.07;
  return sstep(0.54, 1.04, edge + coast + ripple);
}

// ridge crests: folded noise, sharpened, only counted on high ground
function ridge(x: number, z: number): number {
  const n = valueNoise(x * 0.02 + 90, z * 0.02 + 12);
  const crest = 1 - Math.abs(n * 2 - 1);
  return crest * crest;
}

// WHICH GREEN THIS COLUMN IS. one mid-green over the whole surface read as
// felt — no tonal variation is no form, and the eye had nothing to travel
// over. the choice is made from where the column SITS rather than from
// noise alone, so the variation follows the land: sun-facing slopes go
// yellow-olive, the cool side of a fold goes blue-green, ridge crowns dry to
// sage and pale, hollows hold deep moss. a slow macro noise sits under all
// of it so neighbouring hills are not the same hill.
//
// the slope is read off the base fractal directly rather than off
// neighbouring columns: sampleColumn memoises exactly one column, so asking
// it about a neighbour mid-computation would thrash it.
// THE SURFACE, not the shade of grass. every rule in the old classifier
// chose between greens, so whatever the greens were the ground came back
// four fifths green: a slope steep enough to shed its soil was grassed, a
// ridge crown was grassed, a cut bank was grassed, a shoreline was grassed.
//
// grass is now what is left AFTER the ground has been asked whether it can
// hold any. the questions are the ones a hillside actually answers —
// gradient first, then altitude, then water, then aspect — and only a
// column that survives all four gets to pick a green.
function surfaceFor(x: number, z: number, h: number, amp: number, nearWater: boolean): number {
  const at = (px: number, pz: number) => fractal(px * 0.017 + 31, pz * 0.017 + 57) * 21 * amp;
  // a wide baseline: the height field is rounded to whole blocks, so a
  // gradient measured across two cells quantises into four values and every
  // threshold lands either on all of it or none
  const gx = (at(x + 4, z) - at(x - 4, z)) / 8;
  const gz = (at(x, z + 4) - at(x, z - 4)) / 8;
  const slope = Math.hypot(gx, gz);
  const grain = hash2(x * 0.9 + 3, z * 1.1 + 7);
  const macro = fractal(x * 0.008 + 917, z * 0.008 + 431);

  // 1. WATER'S EDGE. fine ground where it meets the shore, coarse just up
  // the bank — the one transition every landscape has and this one had none
  // of: the meadow ran straight into the jade.
  if (nearWater) return grain < 0.55 ? SAND : GRAVEL;

  // 2. GRADIENT. past about a third of a block of fall per block of run,
  // soil does not stay: bare stone high up, loose scree just below a crest,
  // exposed clay on a lowland cut bank.
  //
  // THE THRESHOLD IS DITHERED, and it has to be. a hard cut on a smooth
  // field bands along that field's level sets — the first version laid its
  // rock in long blue-grey stripes following the contours, which is the
  // concentric-terrace fault over again in a different variable. jittering
  // the slope per column by about a fifth turns a clean edge into a
  // scatter, so stone gives way to grass the way a real hillside does.
  // and the THRESHOLD wanders, not just the value. dithering the slope per
  // column scatters the boundary by one cell, which the eye integrates
  // straight back into a stripe — slope is derived from the same fractal as
  // the height, so its level sets run parallel to the contours and a fixed
  // cut draws them. a coherent noise on the threshold itself moves the whole
  // boundary in twenty block lobes, which reads as one outcrop ending and
  // another starting rather than as a band drawn round the hill.
  const wander = (fractal(x * 0.045 + 511, z * 0.045 + 733) - 0.5) * 0.17;
  const s = slope * (0.86 + grain * 0.28);
  const hj = h + (grain - 0.5) * 3;
  if (s > 0.34 + wander) return hj > 15 ? CLIFF : grain < 0.5 ? CLAY : SCREE;
  if (s > 0.22 + wander * 0.8) return hj > 17 ? SCREE : grain < 0.4 ? CLAY : GRASSDRY;

  // 3. ALTITUDE. a crown is thin ground whatever its gradient.
  if (hj >= 18) return grain < 0.55 ? SCREE : LICHEN;

  // 4. ASPECT. the sun bakes one side to ochre and leaves the other in the
  // damp; the north face carries lichen rather than grass.
  const sun = -gx * 0.8 - gz * 0.3;
  if (sun > 0.05 && macro > 0.5) return grain < 0.72 ? GRASSDRY : MEADOWSAGE;
  if (sun < -0.06 && h > 13) return grain < 0.35 ? LICHEN : MEADOWSHADE;

  return greenFor(h, amp, gx, gz, macro, grain);
}

function greenFor(h: number, amp: number, gx: number, gz: number, macro: number, grain: number): number {
  // the identity light comes from the west and low, so a face with a
  // negative x gradient is the one turned into it
  const sun = -gx * 0.8 - gz * 0.3;
  void amp;

  // THE THRESHOLDS ARE THE MEASURED QUANTILES, not round numbers. the first
  // set was guessed against distributions that were never checked and four
  // of the six greens never fired once: 73% of the surface came back the
  // base note and the ground still read as felt. sampled over the whole map,
  // macro runs 0.42..0.76 with its median at 0.54 and sun runs -0.29..0.26
  // about zero, so cuts at 0.34 and 0.55 were simply outside the data.
  if (h <= 8.5 && macro < 0.55) return MEADOWMOSS;
  if (h >= 17.5) return grain < 0.45 ? MEADOWSAGE : MEADOWPALE;
  if (sun > 0.09) return grain < 0.7 ? MEADOWOLIVE : MEADOWPALE;
  if (sun < -0.09) return grain < 0.7 ? MEADOWSHADE : MEADOWDEEP;
  if (macro > 0.6) return MEADOWPALE;
  if (macro < 0.49) return MEADOWDEEP;
  return MEADOW;
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

// GEOLOGY DOES NOT KNOW WHERE THE FOUNDING STONE IS. every radial gate in
// this file — the plaza's flat, the amplitude ramp, the radius at which bare
// rock is allowed — was a function of pure distance from the world's centre,
// so each one drew a perfect circle on the ground. stacked and then rounded
// to whole blocks they came out as concentric grey steps, a target painted
// round the settlement.
//
// the gates stay; what they measure is bent. a low-frequency wobble worth
// about ten blocks pushes the "distance" in and out with bearing, so a gate
// that used to trace a circle now wanders like a treeline.
//
// the wobble ramps in from the middle out. the founding plaza has to stay
// genuinely flat — the plan cuts platforms against it and the crew's yard
// sits on it — so inside ten blocks the distance is the true one, and the
// bending is full strength by the time it reaches the gates that matter.
function wobbledRadius(x: number, z: number, d: number): number {
  const w = (fractal(x * 0.013 + 803, z * 0.013 + 517) - 0.5) * 21 * sstep(10, 34, d);
  return Math.max(0, d + w);
}

function computeColumn(x: number, z: number): Sample {
  const dTrue = Math.hypot(x - CX, z - CZ);
  const dGen = wobbledRadius(x, z, dTrue);

  // rolling hillside, damped inside the crew's build ring so the basin stays
  // calm and buildable, full amplitude out toward the horizon
  // THE WORLD WAS FLAT AT ORBIT. six to ten blocks of mean relief across a
  // 256 grid is a plate: at any distance the hills stop being hills, the
  // precinct's "heights" are a metre above the flats, and a wide shot has
  // no silhouette to read. the amplitude roughly doubles, so the fold the
  // precinct is found on is genuinely high ground and the horizon has a
  // shape.
  //
  // the basin the crew builds in is damped harder than before rather than
  // less, because the same multiplier that gives the horizon its shape
  // would otherwise make the founding ground unbuildable.
  const amp = 0.34 + 0.66 * sstep(16, 52, dGen);
  const base = 3 + fractal(x * 0.017 + 31, z * 0.017 + 57) * 21 * amp;

  // how far into the world's edge this column sits, needed here and not
  // only at the end: the rim flattens the land, and a crest that keeps its
  // BARE ROCK after the rim has flattened it leaves a grey pavement ringing
  // the world. the rock and the height have to fade together.
  const edge = rim(x, z);

  // bare rock crests on the high ground, held off the build ring
  let ridgeBoost = 0;
  if (base > 7.2) {
    const r = ridge(x, z);
    if (r > 0.55) ridgeBoost = (r - 0.55) * 16 * sstep(30, 48, dGen) * (1 - edge);
  }

  let h = base + ridgeBoost;
  // is this column within a couple of blocks of open water — the basins are
  // the only standing water in the world and they know their own radius
  let shore = false;
  for (const bb of BASINS) {
    const d = Math.hypot(x - bb.x, z - bb.z);
    if (d >= bb.r * 0.78 && d < bb.r * 0.78 + 3.5) shore = true;
  }
  let top = surfaceFor(x, z, base, amp, shore);
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
        // THE BANK IS THE SHORELINE. it was earth, which overwrote the
        // sand and gravel the surface classifier had just chosen — the
        // shore band came back 0% of the map because the basin painted
        // over it two rules later.
        if (t < 0.5) top = hash2(x * 2.3, z * 3.1) < 0.55 ? SAND : GRAVEL;
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
  if (dGen < 14) top = surfaceFor(x, z, base, amp, false);

  // exposed rock where the crests actually broke through
  if (ridgeBoost > 1.6 && isMeadow(top)) top = CLIFF;

  // low wet pockets moss over
  if (isMeadow(top) && h < 5.2 && dGen > 30) {
    if (valueNoise(x * 0.045 + 210, z * 0.045 + 77) > 0.72) top = SCARMOSS;
  }

  // AND THE CONTOUR LINES THEMSELVES. any smooth field rounded to whole
  // blocks terraces along its own contours; that is unavoidable in a voxel
  // world and it is half of what makes a hillside read. what makes it read
  // as a STAIRCASE is the contours all being the same shape. a coherent
  // ripple of rather less than a block, ramped in past the plaza and kept
  // off the water, moves where each contour falls without adding any
  // per-column speckle, so a terrace keeps a broken edge.
  // the ripple has to be FINER than the terrace it is breaking. between the
  // plaza and the hills the land climbs about four blocks over twenty-five,
  // which is the worst case there is: a shallow smooth cone terraces into
  // rings six blocks wide and perfectly round. a swell eighteen blocks across
  // rides over those rings and leaves them intact — measured, and it did.
  // nine across, worth a whole step at the crest, dissolves them.
  if (!water) h += (fractal(x * 0.1 + 271, z * 0.1 + 349) - 0.5) * 2.2 * sstep(12, 26, dTrue);

  // the rim: taper into the mist. the far shore is not a flat plate either —
  // a single target height meant every column out there rounded to the same
  // number and the outermost band came out as one dead terrace
  if (edge > 0) {
    const shore = 1.4 + fractal(x * 0.03 + 155, z * 0.03 + 241) * 3.2;
    h = h * (1 - edge * 0.9) + shore * edge * 0.9;
  }

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

// the floor beyond the grid is GONE. it was a four-thousand-unit plane of
// flat earth at y=0 — the "brown void" every orbit frame showed below the
// horizon, and the thing that silently covered the first cloud sea, which
// was built eleven units beneath it and never seen. the world does not sit
// on land; it floats on the cloud sea (src/cloudsea.ts), and the slab's
// carved skirt joins the two.

// place the founding stone on the plaza at world center.
// returns the world-space center of the block (for cameras + the glow).
export function placeGenesis(field: VoxelField): THREE.Vector3 {
  const gx = GENESIS_CELL.x;
  const gz = GENESIS_CELL.z;
  const gy = field.topAt(gx, gz);
  field.placeAt(gx, gy, gz, GENESIS);
  return field.worldCenter(gx, gy, gz, new THREE.Vector3());
}
