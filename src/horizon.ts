// cathedral - THE HORIZON REALM. distant island silhouettes standing in
// the haze beyond the playable world: unreachable, coarse, purely
// compositional — the world reads as one island of many. they speak the
// world's own profile language, because the first attempt (smooth
// low-poly cones) read as paper tents floating in front of the sky: each
// is a mass of COARSE VOXEL COLUMNS over a torn radial coastline, flat-
// ish on top, tapering keel below with a few hanging teeth, and the
// largest carries a peak with the suggestion of a structure on it.
//
// they are a matte painting, deliberately: real fog at their distance is
// past its far plane and would erase them. instead their value is taken
// from THE SKY'S OWN GRADIENT at their altitude band, darkened and
// warmed, then converged toward the sky by each island's depth — the far
// one is a whisper, the near one has edges, and none is ever LIGHTER
// than the air behind it, which is the mistake that reads as "in front
// of the atmosphere".

import * as THREE from "three";
import { SEA_Y } from "./cloudsea";
import type { SkyLight } from "./sky";

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const B = 5; // coarse voxel size — chunky is right at six hundred out

interface Seat {
  a: number; // bearing
  d: number; // distance from origin
  r: number; // footprint radius
  h: number; // height scale
  conv: number; // convergence toward the sky: 0 = defined, 1 = gone
  peak?: boolean; // the mountain island carries a peak and a structure
  seed: number;
}

// depth layers: one close enough to have edges, two in the middle air,
// one barely there — a single uniform distance reads as a painted ring
const SEATS: Seat[] = [
  { a: 5.35, d: 400, r: 62, h: 74, conv: 0.2, seed: 47 },
  { a: 1.6, d: 520, r: 96, h: 104, conv: 0.4, seed: 11 },
  { a: 4.5, d: 590, r: 148, h: 205, conv: 0.35, peak: true, seed: 31 },
  { a: 3.5, d: 700, r: 108, h: 118, conv: 0.75, seed: 23 },
];

function isleMesh(s: Seat, mat: THREE.Material): THREE.InstancedMesh {
  type Col = { x: number; z: number; top: number; keel: number };
  const cols: Col[] = [];
  const N = Math.ceil((s.r * 2) / B) + 2;
  const px0 = -(N / 2) * B;
  // the peak sits off-centre, the way the great work does at home
  const pkx = s.r * 0.22;
  const pkz = -s.r * 0.14;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const px = px0 + i * B;
      const pz = px0 + j * B;
      const ang = Math.atan2(pz, px);
      const d = Math.hypot(px, pz);
      // the torn coastline, in the same angular-harmonic language as home
      const R =
        s.r *
        (0.68 +
          Math.sin(ang * 2 + s.seed) * 0.1 +
          Math.sin(ang * 3 - s.seed * 1.3) * 0.08 +
          Math.sin(ang * 5 + s.seed * 2.2) * 0.055 +
          hash2(i * 3.1 + s.seed, j * 2.7) * 0.09);
      const cd = R - d;
      if (cd <= 0) continue;
      const e = Math.min(1, cd / (s.r * 0.7));
      const hcol = hash2(i * 7.7 + s.seed * 3, j * 5.3);
      // flat-ish top, a gentle rise inland, coarse steps
      let top = s.h * 0.2 + e * s.h * 0.12 + hcol * B * 0.5;
      if (s.peak) {
        const pd = Math.hypot(px - pkx, pz - pkz) / (s.r * 0.52);
        if (pd < 1) top += Math.pow(1 - pd, 1.5) * s.h * 0.75;
      }
      // the keel: rim band, belly deepening inland, and hanging teeth
      let keel = -(6 + e * s.h * 0.42 + hcol * 5);
      if (e > 0.35 && hash2(i * 13.7 + s.seed, j * 11.3) < 0.05) {
        keel -= s.h * (0.22 + hcol * 0.26);
      }
      cols.push({ x: px, z: pz, top: Math.round(top / 3) * 3, keel: Math.round(keel / 3) * 3 });
    }
  }
  // the structure on the peak: three tapering courses, a tower's ghost
  const extra: { x: number; z: number; y: number; sx: number; sy: number }[] = [];
  if (s.peak) {
    let peakTop = 0;
    for (const c of cols) if (c.top > peakTop) peakTop = c.top;
    extra.push({ x: pkx, z: pkz, y: peakTop + 7, sx: 9, sy: 14 });
    extra.push({ x: pkx, z: pkz, y: peakTop + 18, sx: 6, sy: 10 });
    extra.push({ x: pkx, z: pkz, y: peakTop + 26, sx: 3.5, sy: 8 });
  }

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(B, 1, B),
    mat,
    cols.length + extra.length
  );
  const m = new THREE.Matrix4();
  let n = 0;
  for (const c of cols) {
    const hgt = c.top - c.keel;
    m.makeScale(1, hgt, 1);
    m.setPosition(c.x, (c.top + c.keel) / 2, c.z);
    mesh.setMatrixAt(n++, m);
  }
  for (const t of extra) {
    m.makeScale(t.sx / B, t.sy, t.sx / B);
    m.setPosition(t.x, t.y, t.z);
    mesh.setMatrixAt(n++, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export class HorizonIsles {
  private mats: THREE.MeshBasicMaterial[] = [];
  private convs: number[] = [];

  constructor(scene: THREE.Scene) {
    for (const s of SEATS) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x8a8a80, fog: false });
      this.mats.push(mat);
      this.convs.push(s.conv);
      const mesh = isleMesh(s, mat);
      mesh.position.set(Math.cos(s.a) * s.d, SEA_Y + 2, Math.sin(s.a) * s.d);
      scene.add(mesh);
    }
  }

  // value law: start from the sky at their band (horizon leaning into the
  // low mids), darken by an eighth and warm it, then let each island
  // converge toward the raw sky by its depth. darker than the air always,
  // by less the further away — never lighter, never crossing.
  update(light: SkyLight) {
    // the band leans harder into the mid sky than the horizon: at the
    // golden hours the horizon is pure amber, and an amber island against
    // an amber sky is a shape with no edge — the greyer mid keeps the
    // silhouette a LANDMASS while the darkening keeps it behind the air
    _skyBand.copy(light.horizon).lerp(light.mid, 0.45);
    // the eight-tenths here is not taste, it is survival: the stylise
    // pass contrast-gates its palette snap at exactly edges like these,
    // and a five-percent difference gets snapped onto the same sky rung
    // as the air itself — the island must be different ENOUGH to keep its
    // own colour through quantisation
    _base
      .copy(_skyBand)
      .multiplyScalar(0.78)
      .multiply(_warm);
    for (let i = 0; i < this.mats.length; i++) {
      this.mats[i].color.copy(_base).lerp(_skyBand, this.convs[i]);
    }
  }
}

const _skyBand = new THREE.Color();
const _base = new THREE.Color();
const _warm = new THREE.Color(1.02, 0.99, 0.95);
