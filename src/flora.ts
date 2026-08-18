// kodo - flora. the meadow's living layer: thousands of grass tufts,
// wildflowers in drifts, reeds crowding the stillwater banks, moss creeping
// over scars and rubble. all instanced (one draw per family), all swaying
// on the same wind through a shared time uniform, all tinted by the same
// ground patchiness as the terrain so they read as one painted surface.
// ruins get moss, not gloom: new rubble is queued and greens over quietly.

import * as THREE from "three";
import { WINTER, GRID } from "./config";
import { EARTH, SCARMOSS, SWATCH,
  isMeadow,
} from "./palette";
import { BASINS, meadowSampler } from "./terrain";
import type { Wind } from "./wind";
import type { VoxelField } from "./voxels";

// the snow a leaf carries. warmer and softer than the settled course on
// stone: a canopy load catches more sky than a roof does, and a canopy the
// same flat white as a roof reads as plastic.
const SNOW_ON_LEAF = new THREE.Color(0xdfe7f0);

const GRASS_N = 8000;
const FLOWER_N = 2200;
const REED_N = 800;
const MOSS_N = 1200;
const MOSS_POOL = 400; // runtime moss for fresh rubble
const MOSS_DELAY_S = 45; // rubble sits bare this long before greening

const FLOWER_COLORS = [SWATCH.bloomCream, SWATCH.bloomLily, SWATCH.bloomMauve];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// two vertical quads crossed at 90 degrees, base at y=0, normals up so the
// blades take the sun the way the meadow under them does
function crossGeometry(w: number, h: number): THREE.BufferGeometry {
  const hw = w / 2;
  const pos = new Float32Array([
    -hw, 0, 0, hw, 0, 0, hw, h, 0, -hw, h, 0,
    0, 0, -hw, 0, 0, hw, 0, h, hw, 0, h, -hw,
  ]);
  const nrm = new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return geo;
}

export class Flora {
  private uTime = { value: 0 };
  private mossMesh: THREE.InstancedMesh;
  private mossCursor = MOSS_N; // pool region starts after the seeded moss
  private mossQueue: { x: number; y: number; z: number; at: number }[] = [];
  private sheens: { mat: THREE.MeshBasicMaterial; phase: number }[] = [];
  // GROUND THAT GETS PAVED LOSES ITS GRASS. the scatter runs at boot and
  // the plan paves afterwards, so the founding plaza came up through its own
  // tiling and every platform since has had a lawn growing out of it. an
  // instance cannot be removed from an instanced mesh, so it is scaled to
  // nothing, which costs one matrix write and no draw call.
  clearAt(x0: number, z0: number, w: number, d: number) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const touched = new Set<THREE.InstancedMesh>();
    for (const t of this.at) {
      if (t.x < x0 || t.x >= x0 + w || t.z < z0 || t.z >= z0 + d) continue;
      t.mesh.setMatrixAt(t.i, zero);
      touched.add(t.mesh);
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
  }

  private dummy = new THREE.Object3D();
  // where every instance stands, so ground that is paved LATER can take its
  // grass with it. flora scatters at boot and the plan paves after, so the
  // founding plaza came up through its own tiling.
  private at: { mesh: THREE.InstancedMesh; i: number; x: number; z: number }[] = [];
  private color = new THREE.Color();

  constructor(scene: THREE.Scene, field: VoxelField, private wind: Wind) {
    const rand = mulberry32(0xf10ea);
    const shade = meadowSampler.groundShade
      ? meadowSampler.groundShade.bind(meadowSampler)
      : () => 1;

    const makeMesh = (
      geo: THREE.BufferGeometry,
      count: number,
      sway: number
    ): THREE.InstancedMesh => {
      const mat = new THREE.MeshStandardMaterial({
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = this.uTime;
        shader.uniforms.uWind = this.wind.uniform;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\n uniform float uTime;\n uniform vec4 uWind;")
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
             #ifdef USE_INSTANCING
             // one wind for the whole world: the gust rolls across the
             // meadow as a wave, and every blade leans along its direction
             float fPh = instanceMatrix[3][0] * 0.05 + instanceMatrix[3][2] * 0.04;
             float fWave = sin(fPh - uWind.w * 0.6);
             float fGust = uWind.z * (0.55 + 0.45 * fWave) + 0.2 * sin(uWind.w * 3.1 + fPh * 7.0);
             float fLean = fGust * ${sway.toFixed(3)} * max(transformed.y, 0.0);
             transformed.x += fLean * uWind.x;
             transformed.z += fLean * uWind.y;
             #endif`
          );
        // flora is lit like the ground it grows from: force the shading
        // normal to world-up so double-sided blades never flip dark
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <normal_fragment_begin>",
          `#include <normal_fragment_begin>
           normal = normalize(( viewMatrix * vec4(0.0, 1.0, 0.0, 0.0) ).xyz);`
        );
      };
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };

    const place = (
      mesh: THREE.InstancedMesh,
      x: number,
      z: number,
      y: number,
      s: number,
      hexColor: number,
      hslJitter: number
    ) => {
      const i = mesh.count;
      if (i >= mesh.instanceMatrix.count) return;
      this.dummy.position.set(
        x - GRID / 2 + 0.5 + (rand() - 0.5) * 0.7,
        y,
        z - GRID / 2 + 0.5 + (rand() - 0.5) * 0.7
      );
      this.dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      this.dummy.scale.set(s, s * (0.8 + rand() * 0.5), s);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      this.color.setHex(hexColor);
      this.color.offsetHSL((rand() - 0.5) * hslJitter, 0, (rand() - 0.5) * 0.08);
      this.color.multiplyScalar(shade(x, z));
      // WINTER TAKES THE CANOPIES. a white ground under green trees is not
      // a snowy world, it is a snowy lawn — the canopies are most of the
      // colour in any frame with a hillside in it, so the season has to
      // reach them or it has not happened.
      //
      // it is a LOAD, not a repaint: the leaf keeps its own hue underneath
      // and the covering varies leaf to leaf, so a canopy reads as laden
      // rather than as a white blob. the warm groves keep more of
      // themselves on purpose — an ember maple holding its colour through
      // the snow is the one warm note the season leaves standing, and the
      // brief asks for exactly that.
      if (WINTER) {
        const warm = this.color.r > this.color.g * 1.05;
        const load = (warm ? 0.3 : 0.66) * (0.7 + rand() * 0.6);
        this.color.lerp(SNOW_ON_LEAF, Math.min(0.86, load));
      }
      mesh.setColorAt(i, this.color);
      this.at.push({ mesh, i, x, z });
      mesh.count = i + 1;
    };

    const topOf = (x: number, z: number) => field.topAt(x, z);
    const topType = (x: number, z: number) => {
      const h = field.topAt(x, z);
      return h > 0 ? field.typeAt(x, h - 1, z) : 0;
    };
    const cell = () => 2 + Math.floor(rand() * (GRID - 4));

    // grass: everywhere the meadow is
    // A TUFT IS ANKLE HEIGHT. at 0.7 with a scale up to 1.3 the grass stood
    // most of a metre tall, which was invisible until the crew stopped being
    // pillars and became figures to measure it against — then the meadow was
    // chest high on a mason.
    const grass = makeMesh(crossGeometry(0.5, 0.42), GRASS_N, 0.05);
    for (let tries = 0; tries < GRASS_N * 4 && grass.count < GRASS_N; tries++) {
      const x = cell();
      const z = cell();
      if (!isMeadow(topType(x, z))) continue;
      place(grass, x, z, topOf(x, z), 0.6 + rand() * 0.5, SWATCH.grass, 0.05);
    }

    // wildflowers: drifts, not confetti - clusters seeded on the meadow
    const flowers = makeMesh(crossGeometry(0.26, 0.32), FLOWER_N, 0.04);
    for (let c = 0; c < 200 && flowers.count < FLOWER_N; c++) {
      const x = cell();
      const z = cell();
      if (!isMeadow(topType(x, z))) continue;
      const hue = FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)];
      const n = 8 + Math.floor(rand() * 9);
      for (let i = 0; i < n && flowers.count < FLOWER_N; i++) {
        const fx = Math.round(x + (rand() - 0.5) * 5);
        const fz = Math.round(z + (rand() - 0.5) * 5);
        if (fx < 2 || fz < 2 || fx > GRID - 3 || fz > GRID - 3) continue;
        if (!isMeadow(topType(fx, fz))) continue;
        place(flowers, fx, fz, topOf(fx, fz), 0.8 + rand() * 0.5, hue, 0.02);
      }
    }

    // reeds: crowding the stillwater banks
    const reeds = makeMesh(crossGeometry(0.2, 1.5), REED_N, 0.09);
    for (const b of BASINS) {
      const per = Math.floor(REED_N / BASINS.length);
      for (let tries = 0, placed = 0; tries < per * 6 && placed < per; tries++) {
        const a = rand() * Math.PI * 2;
        const d = b.r * (0.72 + rand() * 0.55);
        const x = Math.round(b.x + Math.cos(a) * d);
        const z = Math.round(b.z + Math.sin(a) * d);
        if (x < 2 || z < 2 || x > GRID - 3 || z > GRID - 3) continue;
        const tt = topType(x, z);
        if (tt !== EARTH && !isMeadow(tt)) continue;
        const y = topOf(x, z);
        if (y < b.wl || y > b.wl + 3) continue;
        place(reeds, x, z, y, 0.7 + rand() * 0.6, SWATCH.reed, 0.04);
        placed++;
      }
    }

    // moss: flat pads over the scars, plus a pool for rubble yet to fall
    const mossGeo = new THREE.PlaneGeometry(0.9, 0.9);
    mossGeo.rotateX(-Math.PI / 2);
    this.mossMesh = makeMesh(mossGeo, MOSS_N + MOSS_POOL, 0);
    // the pool draws past the seeded pads, so every slot must start collapsed
    this.dummy.position.set(0, -10, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(0.001, 0.001, 0.001);
    this.dummy.updateMatrix();
    for (let i = 0; i < MOSS_N + MOSS_POOL; i++) this.mossMesh.setMatrixAt(i, this.dummy.matrix);
    const scarCells: { x: number; z: number }[] = [];
    for (let x = 2; x < GRID - 2; x++) {
      for (let z = 2; z < GRID - 2; z++) {
        if (topType(x, z) === SCARMOSS) scarCells.push({ x, z });
      }
    }
    for (let i = 0; i < MOSS_N && scarCells.length; i++) {
      const c = scarCells[Math.floor(rand() * scarCells.length)];
      place(this.mossMesh, c.x, c.z, topOf(c.x, c.z) + 0.02, 0.7 + rand() * 0.7, SWATCH.moss, 0.04);
    }

    // stillwater sheen: a faint breathing gloss over each basin
    for (const b of BASINS) {
      const mat = new THREE.MeshBasicMaterial({
        color: SWATCH.glasslight,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(b.r * 0.8, 24), mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(b.x - GRID / 2 + 0.5, b.wl + 1.04, b.z - GRID / 2 + 0.5);
      scene.add(disc);
      this.sheens.push({ mat, phase: rand() * Math.PI * 2 });
    }
  }

  // ruin reclamation: call when rubble settles; a pad of moss creeps over
  // it after a while. the pool wraps, oldest pads move to newest rubble.
  mossRubble(x: number, y: number, z: number) {
    this.mossQueue.push({ x, y, z, at: this.uTime.value });
  }

  update(t: number) {
    this.uTime.value = t;
    for (const s of this.sheens) {
      s.mat.opacity = 0.09 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.7 + s.phase));
    }
    while (this.mossQueue.length && t - this.mossQueue[0].at > MOSS_DELAY_S) {
      const q = this.mossQueue.shift() as { x: number; y: number; z: number; at: number };
      const i = this.mossCursor;
      this.mossCursor = this.mossCursor + 1 >= MOSS_N + MOSS_POOL ? MOSS_N : this.mossCursor + 1;
      this.dummy.position.set(q.x - GRID / 2 + 0.5, q.y + 1.02, q.z - GRID / 2 + 0.5);
      this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      const s = 0.7 + Math.random() * 0.5;
      this.dummy.scale.set(s, 1, s);
      this.dummy.updateMatrix();
      this.mossMesh.setMatrixAt(i, this.dummy.matrix);
      this.color.setHex(SWATCH.moss).offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
      this.mossMesh.setColorAt(i, this.color);
      if (this.mossMesh.count < i + 1) this.mossMesh.count = i + 1;
      this.mossMesh.instanceMatrix.needsUpdate = true;
      if (this.mossMesh.instanceColor) this.mossMesh.instanceColor.needsUpdate = true;
    }
  }
}
