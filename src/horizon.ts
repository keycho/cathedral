// cathedral - THE HORIZON REALM. three or four great island silhouettes
// far beyond the playable world, standing in the atmospheric haze:
// unreachable, low-detail, purely compositional. the world stops reading
// as the entire universe and starts reading as one island of many — the
// oldest trick in landscape painting, a further range behind the subject.
// they wear the scene's own fog (standard material, no shader), so they
// are exactly as present as the air allows from wherever the camera is.

import * as THREE from "three";
import { SEA_Y } from "./cloudsea";

function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// a faceted mountain: a displaced cone over a low slab skirt, everything
// flat-shaded so even a silhouette keeps the world's chunk in its outline
function mountainGeo(r: number, h: number, seed: number): THREE.BufferGeometry {
  const cone = new THREE.ConeGeometry(r, h, 9, 3);
  cone.translate(0, h * 0.5, 0);
  const pos = cone.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const w = 0.78 + hash1(seed * 37 + Math.round(a * 4.7)) * 0.5;
    pos.setX(i, x * w);
    pos.setZ(i, z * w);
    pos.setY(i, pos.getY(i) * (0.9 + hash1(seed * 51 + i) * 0.2));
  }
  cone.computeVertexNormals();
  const skirt = new THREE.CylinderGeometry(r * 1.18, r * 1.28, 16, 9, 1);
  skirt.translate(0, 8, 0);
  const g = new THREE.BufferGeometry();
  // merge by hand: two position streams, one draw
  const a1 = cone.getAttribute("position");
  const a2 = skirt.getAttribute("position");
  const i1 = cone.getIndex()!;
  const i2 = skirt.getIndex()!;
  const merged = new Float32Array((a1.count + a2.count) * 3);
  merged.set(a1.array as Float32Array, 0);
  merged.set(a2.array as Float32Array, a1.count * 3);
  const idx = new Uint16Array(i1.count + i2.count);
  idx.set(i1.array as Uint16Array, 0);
  for (let k = 0; k < i2.count; k++) idx[i1.count + k] = (i2.array as Uint16Array)[k] + a1.count;
  g.setAttribute("position", new THREE.BufferAttribute(merged, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

// bearings avoid the sheared headland (0.85), so the wound in the coast
// keeps its long empty view, and they are spread so the canonical south
// approach sees the range FLANKING the world instead of hiding behind
// it; the largest reads as a distant mountain island off the north-west
// heights are set against the sea-fog band: a peak must clear it by a
// real margin to exist at all from a low eye — the first cut was a
// ninety-pixel whisper lost in the horizon gold
const ISLES = [
  { a: 1.6, d: 560, r: 100, h: 125, seed: 11 },
  { a: 3.5, d: 520, r: 84, h: 95, seed: 23 },
  { a: 4.5, d: 610, r: 150, h: 240, seed: 31 },
  { a: 5.35, d: 470, r: 62, h: 70, seed: 47 },
];

// REAL FOG ERASED THEM ENTIRELY: at five hundred units the linear fog is
// at or past its far plane, and a silhouette that is 100% fog is not
// there. so they opt out of the fog and become a matte painting instead:
// their colour IS the live fog colour, pulled a fifth of the way toward
// dark slate, so they read as the faintest possible range at any hour —
// golden haze at dusk, blue murk at night — and never pop.
export class HorizonIsles {
  private mat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({ color: 0x8a8a80, fog: false });
    for (const s of ISLES) {
      const m = new THREE.Mesh(mountainGeo(s.r, s.h, s.seed), this.mat);
      m.position.set(Math.cos(s.a) * s.d, SEA_Y - 4, Math.sin(s.a) * s.d);
      m.rotation.y = s.seed * 1.3;
      m.castShadow = false;
      m.receiveShadow = false;
      scene.add(m);
    }
  }

  update(fog: THREE.Fog) {
    this.mat.color.copy(fog.color).lerp(_slate, 0.42);
  }
}

const _slate = new THREE.Color(0x3a4450);
