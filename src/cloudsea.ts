// cathedral - THE CLOUD SEA, AND THE CARVED EDGE. the world is a floating
// slab, and until now it floated in nothing: the full-map orbit — the
// marketing frame — showed a diorama standing in brown void, and from the
// coast at ground level the land simply stopped, a flat extrusion over a
// hole. a floating world is a fine cosmology; a floating world with no
// underneath is an unfinished render.
//
// two meshes fix it:
//
//   THE SEA    an effectively infinite soft cloud layer below the world's
//              underside. it follows the camera so it has no edge, drifts
//              slowly, and takes its colour from the sky's own published
//              light — gold at the golden hour, pale at noon, deep blue at
//              night — because a cloud is nothing but the sky's light with
//              shape in it. the scene fog eats it toward the horizon, which
//              is what joins it to the dome without a seam.
//
//   THE SKIRT  the slab's cut side, dressed as carved earth: topsoil and
//              hanging roots at the lip, a clay band under that, then
//              cliff-grey strata stepping down into bedrock dark. built
//              once from the genesis terrain's own edge heights, per
//              column, with the bands jittered so the cut reads as ground
//              that was carved rather than a wall that was extruded.

import * as THREE from "three";
import { GRID } from "./config";
import { SWATCH } from "./palette";
import type { SkyLight } from "./sky";
import type { VoxelField } from "./voxels";

// the sea's surface sits below the slab's underside; the skirt reaches a
// little past it so the two always overlap and no sliver of void survives
const SEA_Y = -11;
const SKIRT_FOOT = -16;

// ---- the sea -----------------------------------------------------------------

const SeaShader = {
  uniforms: {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector2() },
    uBright: { value: new THREE.Color(0xd9c9a6) },
    uDark: { value: new THREE.Color(0x8f8b7e) },
    // the scene fog's live reach, applied by hand: a ShaderMaterial does
    // not get the built-in fog unless it carries the chunks, and the fog's
    // near/far move with the orbit
    uFogColor: { value: new THREE.Color(0xccd0c5) },
    uFogNear: { value: 170 },
    uFogFar: { value: 560 },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    uniform vec2 uCam;
    varying vec3 vWorld;
    varying float vLift;

    // three octaves of value noise: enough for a cloud top, cheap enough
    // to run in the vertex stage where the rolling shape comes from
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }
    float fbm(vec2 p) {
      float v = 0.0;
      v += 0.5 * vnoise(p);
      v += 0.25 * vnoise(p * 2.03 + 17.0);
      v += 0.125 * vnoise(p * 4.11 + 43.0);
      return v / 0.875;
    }

    void main() {
      // the plane rides the camera; the NOISE is anchored to the world, so
      // the sea does not swim when the orbit moves
      vec3 p = position;
      vec2 world = p.xz + uCam;
      float n = fbm(world * 0.014 + vec2(uTime * 0.010, uTime * 0.006));
      p.y += n * 7.0 - 2.0;
      vLift = n;
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec2 uCam;
    uniform vec3 uBright, uDark, uFogColor;
    uniform float uFogNear, uFogFar;
    varying vec3 vWorld;
    varying float vLift;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }
    float fbm(vec2 p) {
      float v = 0.0;
      v += 0.5 * vnoise(p);
      v += 0.25 * vnoise(p * 2.03 + 17.0);
      v += 0.125 * vnoise(p * 4.11 + 43.0);
      return v / 0.875;
    }

    void main() {
      // finer billow on top of the vertex swell, drifting at its own rate
      float n = fbm(vWorld.xz * 0.05 + vec2(uTime * 0.016, -uTime * 0.011));
      float tone = clamp(vLift * 0.75 + n * 0.45, 0.0, 1.0);
      vec3 col = mix(uDark, uBright, smoothstep(0.30, 0.78, tone));
      // the fog joins the sea to the dome at the horizon
      float d = length(vWorld - cameraPosition);
      float f = smoothstep(uFogNear, uFogFar, d);
      col = mix(col, uFogColor, f);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class CloudSea {
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    // big enough that its edge is beyond the far plane from any allowed
    // camera; segment density is the resolution of the rolling swell
    const geo = new THREE.PlaneGeometry(3200, 3200, 96, 96);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SeaShader.uniforms),
      vertexShader: SeaShader.vertexShader,
      fragmentShader: SeaShader.fragmentShader,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = SEA_Y;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }

  // the sea is the sky's light with shape in it: bright tops take the
  // horizon's colour warmed a little toward the sun, shadowed troughs take
  // the mid sky. at night both go deep blue on their own, because the keys
  // themselves do.
  update(t: number, cam: THREE.Vector3, light: SkyLight, fog: THREE.Fog) {
    const u = this.mat.uniforms;
    u.uTime.value = t;
    this.mesh.position.x = cam.x;
    this.mesh.position.z = cam.z;
    (u.uCam.value as THREE.Vector2).set(cam.x, cam.z);
    (u.uBright.value as THREE.Color).copy(light.horizon).lerp(light.sunColor, 0.25);
    // the troughs need real shadow or the whole sea fogs into one pale
    // sheet at orbit distance and the billow never reads
    (u.uDark.value as THREE.Color).copy(light.mid).multiplyScalar(0.52);
    (u.uFogColor.value as THREE.Color).copy(fog.color);
    u.uFogNear.value = fog.near;
    u.uFogFar.value = fog.far;
  }
}

// ---- the skirt ---------------------------------------------------------------

const C_GRASS = new THREE.Color(SWATCH.meadowDeep);
const C_EARTH = new THREE.Color(SWATCH.earth);
const C_CLAY = new THREE.Color(SWATCH.clay);
const C_STONE = new THREE.Color(SWATCH.stoneDark);
const C_CLIFF = new THREE.Color(SWATCH.cliff);
const C_DEEP = new THREE.Color(SWATCH.cliffDeep);
const C_BED = new THREE.Color(0x2e3238);
const C_ROOT = new THREE.Color(0x2f2418);

function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// which stratum a world height belongs to, banded from the lip down. the
// boundaries jitter per column so the bands read as geology rather than
// as wallpaper.
function strataColor(y: number, top: number, col: number, root: boolean): THREE.Color {
  const j = (hash1(col * 3.7) - 0.5) * 2.2;
  const out = new THREE.Color();
  if (root && y > top - 6 && hash1(col * 9.1 + Math.floor(y)) < 0.6) {
    // a hanging root: a dark streak through the topsoil and clay
    out.copy(C_ROOT);
  } else if (y > top - 1.2) out.copy(C_GRASS);
  else if (y > top - 3.4 + j * 0.4) out.copy(C_EARTH);
  else if (y > top - 7 + j) out.copy(C_CLAY);
  else if (y > top - 10 + j) out.copy(C_STONE);
  else if (y > 1 + j) out.copy(C_CLIFF);
  else if (y > -6 + j) out.copy(C_DEEP);
  else out.copy(C_BED);
  // per-column tone jitter, so adjacent columns never match exactly
  out.multiplyScalar(0.92 + hash1(col * 1.3 + 7) * 0.16);
  return out;
}

// THE CUT SIDE OF THE SLAB, built once from the terrain's own edge. the
// geometry walks each border column at its real genesis height, so the lip
// follows the coast's rises and falls; below it the face steps through the
// strata to bedrock and into the cloud sea. accretion can add stone at the
// rim later — the skirt sits a hair outside the voxel shell, so new growth
// simply stands on top of it.
export function buildSkirt(field: VoxelField, scene: THREE.Scene): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  const half = GRID / 2;
  // more rows near the lip, where the bands are thin
  const ROWS = [0, 1.5, 3.5, 6, 9, 14, 22, 34];

  // walk one edge; ax/az choose the axis, s the fixed side
  const edge = (axis: "x" | "z", side: 0 | 1) => {
    const fixed = side === 0 ? -half : half;
    const nx = axis === "x" ? 0 : side === 0 ? -1 : 1;
    const nz = axis === "z" ? 0 : side === 0 ? -1 : 1;
    for (let c = 0; c < GRID - 1; c++) {
      const cellA = c;
      const cellB = c + 1;
      const topA = topOf(axis, side, cellA);
      const topB = topOf(axis, side, cellB);
      const root = hash1(c * 5.77) < 0.07;
      for (let r = 0; r < ROWS.length - 1; r++) {
        const ya0 = topA - ROWS[r];
        const ya1 = Math.max(topA - ROWS[r + 1], SKIRT_FOOT);
        const yb0 = topB - ROWS[r];
        const yb1 = Math.max(topB - ROWS[r + 1], SKIRT_FOOT);
        if (ya0 <= SKIRT_FOOT && yb0 <= SKIRT_FOOT) continue;
        const wa = axis === "x" ? [cellA - half, fixed] : [fixed, cellA - half];
        const wb = axis === "x" ? [cellB - half, fixed] : [fixed, cellB - half];
        const ca0 = strataColor(ya0, topA, c, root);
        const ca1 = strataColor(ya1, topA, c, root);
        const cb0 = strataColor(yb0, topB, c + 1, root);
        const cb1 = strataColor(yb1, topB, c + 1, root);
        // two triangles, wound to face outward on every side
        const quad =
          (axis === "x" ? side === 1 : side === 0)
            ? [wa, ya0, ca0, wb, yb0, cb0, wa, ya1, ca1, wb, yb0, cb0, wb, yb1, cb1, wa, ya1, ca1]
            : [wb, yb0, cb0, wa, ya0, ca0, wb, yb1, cb1, wa, ya0, ca0, wa, ya1, ca1, wb, yb1, cb1];
        for (let k = 0; k < quad.length; k += 3) {
          const w = quad[k] as number[];
          const y = quad[k + 1] as number;
          const cc = quad[k + 2] as THREE.Color;
          pos.push(w[0], y, w[1]);
          col.push(cc.r, cc.g, cc.b);
          nrm.push(nx, 0, nz);
        }
      }
    }
  };

  const topOf = (axis: "x" | "z", side: 0 | 1, c: number) => {
    const cell = Math.max(0, Math.min(GRID - 1, c));
    const fixedCell = side === 0 ? 0 : GRID - 1;
    return axis === "x" ? field.topAt(cell, fixedCell) : field.topAt(fixedCell, cell);
  };

  edge("x", 0);
  edge("x", 1);
  edge("z", 0);
  edge("z", 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
