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

// THE SEA SITS WELL BELOW THE LIP. at -14 it lapped the coast and swallowed
// the entire keel, which is how the underside could be reworked twice
// without the silhouette changing: the work was underwater. at -46 the
// visible keel is as deep as the terrain above is tall, the belly rounds
// into the cloud, and only the teeth pierce it.
const SEA_Y = -46;

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

// ---- the underside -----------------------------------------------------------

const C_GRASS = new THREE.Color(SWATCH.meadowDeep);
const C_EARTH = new THREE.Color(SWATCH.earth);
const C_CLAY = new THREE.Color(SWATCH.clay);
const C_STONE = new THREE.Color(SWATCH.stoneDark);
const C_CLIFF = new THREE.Color(SWATCH.cliff);
const C_DEEP = new THREE.Color(SWATCH.cliffDeep);
const C_BED = new THREE.Color(0x2e3238);
const C_ROOT = new THREE.Color(0x2f2418);
const C_EMBER = new THREE.Color(0xc2521c);

function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vn2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a * (1 - ux) * (1 - uz) + b * ux * (1 - uz) + c * (1 - ux) * uz + d * ux * uz;
}
function fbm2(x: number, z: number): number {
  return (0.5 * vn2(x, z) + 0.25 * vn2(x * 2.03 + 17, z * 2.03 + 17) + 0.125 * vn2(x * 4.1 + 43, z * 4.1 + 43)) / 0.875;
}

// the strata, banded by depth below the local lip. the deep rock speaks the
// sky islands' language — their keels glow with ember seams, and the
// world's keel, the piece they were all torn from, carries the same cracks.
function strataColor(depth: number, seed: number, root: boolean): THREE.Color {
  const j = (hash1(seed * 3.7) - 0.5) * 2.4;
  const out = new THREE.Color();
  if (root && depth < 6 && hash1(seed * 9.1 + Math.floor(depth)) < 0.6) out.copy(C_ROOT);
  else if (depth < 1.2) out.copy(C_GRASS);
  else if (depth < 3.4 + j * 0.4) out.copy(C_EARTH);
  else if (depth < 7 + j) out.copy(C_CLAY);
  else if (depth < 11 + j) out.copy(C_STONE);
  else if (depth < 19 + j * 1.5) out.copy(C_CLIFF);
  else if (depth < 32 + j * 2) out.copy(C_DEEP);
  else out.copy(C_BED);
  // EMBERS ARE VEINS, NOT A RASH. at five per cent per vertex the keel came
  // back measled with orange — vertex interpolation smears every hit into a
  // glowing blob. they now need a coarse cluster band to be eligible at
  // all, then a rare hit inside it, and they render as cooling rock rather
  // than as lamps.
  if (
    depth > 30 &&
    hash1(Math.floor(seed / 520) * 3.1) < 0.22 &&
    hash1(seed * 13.7 + Math.floor(depth * 0.4)) < 0.03
  ) {
    out.copy(C_EMBER).multiplyScalar(0.78);
  }
  out.multiplyScalar(0.92 + hash1(seed * 1.3 + 7) * 0.16);
  // an underside is in its own shadow: the rock darkens toward the teeth
  out.multiplyScalar(1 - Math.min(depth, 80) / 80 * 0.34);
  return out;
}

// A MOUNTAIN TORN OUT OF THE GROUND. the first underside was a perimeter
// curtain — a thin plate with icicle teeth, which is exactly what it looked
// like from the eye line. this is a full under-SURFACE: a downward
// heightfield spanning the whole footprint, with a carved cliff band at the
// rim, broad shoulders of rock rounding into a belly deeper than the
// terrain above is tall, and FOUR heavy teeth — not many thin ones —
// hanging well into the cloud. the silhouette between teeth is curved rock,
// never flat slab, because the belly is a surface and not a curtain's foot.
const RES = 96; // grid cells across the footprint
const CLIFF_BAND = 13; // the near-vertical carved rim, in units of depth
const BELLY_DEPTH = 58; // the broad body below the cliff band
const ROCK_VAR = 11;

export class Underside {
  private falls: THREE.ShaderMaterial[] = [];
  readonly fallSpots: { x: number; z: number; top: number }[] = [];

  constructor(field: VoxelField, scene: THREE.Scene) {
    const half = GRID / 2;

    // the four teeth: heavy cones at deterministic spots partway between
    // the centre and the rim, spaced by angle so no side is bare
    const teeth: { x: number; z: number; depth: number; r: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.55 + (hash1(i * 7.1) - 0.5) * 0.7;
      const rad = (0.30 + hash1(i * 3.3) * 0.14) * GRID * 0.5;
      teeth.push({
        x: GRID / 2 + Math.cos(a) * rad,
        z: GRID / 2 + Math.sin(a) * rad,
        depth: 30 + hash1(i * 11.7) * 16,
        r: 34 + hash1(i * 5.9) * 14,
      });
    }

    // the under-surface, vertex by vertex
    const vert = (ix: number, iz: number): { y: number; depth: number; lip: number } => {
      const cx = (ix / RES) * (GRID - 1);
      const cz = (iz / RES) * (GRID - 1);
      // distance from the border, 0 at the rim, 1 at the centre lines
      const e = Math.min(ix, RES - ix, iz, RES - iz) / (RES / 2);
      // the rim ring sits exactly on the terrain's own edge heights, so the
      // surface seals to the voxel shell; inward, the lip stops mattering
      const bx = Math.max(0, Math.min(GRID - 1, Math.round(cx)));
      const bz = Math.max(0, Math.min(GRID - 1, Math.round(cz)));
      const edgeTop = field.topAt(
        Math.min(ix, RES - ix) <= Math.min(iz, RES - iz) ? (ix < RES / 2 ? 0 : GRID - 1) : bx,
        Math.min(iz, RES - iz) < Math.min(ix, RES - ix) ? (iz < RES / 2 ? 0 : GRID - 1) : bz
      );
      const lip = e < 0.06 ? edgeTop : 6;
      // the carved rim: nearly vertical for the first band of depth
      const cliff = Math.min(1, e / 0.045) * CLIFF_BAND;
      // the belly: broad shoulders rounding into a deep body — sin^0.8
      // drops fast off the shoulder and flattens into a curve, which is
      // what keeps the silhouette between teeth round rather than flat
      const belly = Math.pow(Math.sin(Math.min(e * 1.45, 1) * Math.PI * 0.5), 0.8) * BELLY_DEPTH;
      const rock = (fbm2(cx * 0.028, cz * 0.028) - 0.5) * 2 * ROCK_VAR * Math.min(1, e * 6);
      let tooth = 0;
      for (const t of teeth) {
        const d = Math.hypot(cx - t.x, cz - t.z) / t.r;
        if (d < 1) tooth = Math.max(tooth, t.depth * Math.pow(1 - d, 1.6));
      }
      const depth = cliff + belly + rock + tooth;
      return { y: lip - depth, depth, lip };
    };

    const pos: number[] = [];
    const col: number[] = [];
    const grid: { y: number; depth: number; lip: number }[][] = [];
    for (let iz = 0; iz <= RES; iz++) {
      const row: { y: number; depth: number; lip: number }[] = [];
      for (let ix = 0; ix <= RES; ix++) row.push(vert(ix, iz));
      grid.push(row);
    }
    for (let iz = 0; iz < RES; iz++) {
      for (let ix = 0; ix < RES; ix++) {
        const wx = (ix / RES) * (GRID - 1) - half;
        const wz = (iz / RES) * (GRID - 1) - half;
        const wx1 = ((ix + 1) / RES) * (GRID - 1) - half;
        const wz1 = ((iz + 1) / RES) * (GRID - 1) - half;
        const a = grid[iz][ix];
        const b = grid[iz][ix + 1];
        const c = grid[iz + 1][ix];
        const d = grid[iz + 1][ix + 1];
        const root = hash1((ix * 31 + iz) * 5.77) < 0.06;
        const cc = (v: { depth: number }, seed: number) => strataColor(v.depth, seed, root);
        const A = [wx, a.y, wz, cc(a, ix * 131 + iz)] as const;
        const B = [wx1, b.y, wz, cc(b, (ix + 1) * 131 + iz)] as const;
        const C = [wx, c.y, wz1, cc(c, ix * 131 + iz + 1)] as const;
        const D = [wx1, d.y, wz1, cc(d, (ix + 1) * 131 + iz + 1)] as const;
        // wound so the faces look DOWN — this surface is seen from below
        // and from the side, never from above
        const tri = (v0: typeof A, v1: typeof A, v2: typeof A) => {
          pos.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2]);
          col.push(v0[3].r, v0[3].g, v0[3].b, v1[3].r, v1[3].g, v1[3].b, v2[3].r, v2[3].g, v2[3].b);
        };
        tri(A, C, B);
        tri(B, C, D);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);

    this.buildFalls(field, scene);
  }

  // ONE OR TWO WATERFALLS off the rim, pouring into the cloud far below —
  // the spots found, not chosen: the highest border columns on two sides.
  private buildFalls(field: VoxelField, scene: THREE.Scene) {
    const half = GRID / 2;
    const spots: { x: number; z: number; top: number; nx: number; nz: number }[] = [];
    const consider = (x: number, z: number, nx: number, nz: number) => {
      spots.push({ x, z, top: field.topAt(x, z), nx, nz });
    };
    for (let c = 24; c < GRID - 24; c += 4) {
      consider(c, 0, 0, -1);
      consider(c, GRID - 1, 0, 1);
      consider(0, c, -1, 0);
      consider(GRID - 1, c, 1, 0);
    }
    spots.sort((a, b) => b.top - a.top);
    const picked: typeof spots = [];
    for (const sp of spots) {
      if (picked.length >= 2) break;
      if (picked.some((q) => Math.hypot(q.x - sp.x, q.z - sp.z) < 140)) continue;
      picked.push(sp);
    }

    const FallShader = {
      uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color(0xdfe8e6) } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uTint;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        void main() {
          float streak = vnoise(vec2(vUv.x * 6.0, vUv.y * 4.0 - uTime * 1.4));
          streak = smoothstep(0.35, 0.9, streak);
          float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
          float foot = smoothstep(0.0, 0.2, vUv.y);
          float a = (0.22 + streak * 0.6) * edge * foot;
          gl_FragColor = vec4(uTint, a);
        }
      `,
    };

    for (const sp of picked) {
      this.fallSpots.push({ x: sp.x, z: sp.z, top: sp.top });
      const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(FallShader.uniforms),
        vertexShader: FallShader.vertexShader,
        fragmentShader: FallShader.fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.falls.push(mat);
      const w = 6;
      const topY = sp.top - 0.4;
      const footY = SEA_Y + 8;
      const geo = new THREE.PlaneGeometry(w, topY - footY, 1, 10);
      const mesh = new THREE.Mesh(geo, mat);
      const wx = sp.x - half + 0.5;
      const wz = sp.z - half + 0.5;
      mesh.position.set(wx + sp.nx * 1.6, (topY + footY) / 2, wz + sp.nz * 1.6);
      if (sp.nx !== 0) mesh.rotation.y = Math.PI / 2;
      scene.add(mesh);
    }
  }

  update(t: number) {
    for (const m of this.falls) m.uniforms.uTime.value = t;
  }
}
