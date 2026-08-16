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

// the sea's surface sits below the slab's lip; the underside keel reaches
// well past it, so the deepest teeth hang into the cloud and vanish there
const SEA_Y = -14;

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
function vn1(n: number): number {
  const i = Math.floor(n);
  const f = n - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

// the strata, banded from the lip down and jittered per column so the cut
// reads as geology rather than wallpaper. deep rock picks up the sky
// islands' language: their keels glow with ember seams, and the world's
// keel — the piece they were all torn from — carries the same warm cracks.
function strataColor(depth: number, col: number, root: boolean): THREE.Color {
  const j = (hash1(col * 3.7) - 0.5) * 2.2;
  const out = new THREE.Color();
  if (root && depth < 6 && hash1(col * 9.1 + Math.floor(depth)) < 0.6) out.copy(C_ROOT);
  else if (depth < 1.2) out.copy(C_GRASS);
  else if (depth < 3.4 + j * 0.4) out.copy(C_EARTH);
  else if (depth < 7 + j) out.copy(C_CLAY);
  else if (depth < 10 + j) out.copy(C_STONE);
  else if (depth < 16 + j) out.copy(C_CLIFF);
  else if (depth < 24 + j) out.copy(C_DEEP);
  else out.copy(C_BED);
  if (depth > 18 && hash1(col * 13.7 + Math.floor(depth * 0.6)) < 0.055) out.copy(C_EMBER);
  out.multiplyScalar(0.92 + hash1(col * 1.3 + 7) * 0.16);
  // the keel darkens toward its teeth — an underside is in its own shadow,
  // and without this the deep rock caught the hemisphere light and read as
  // a pale boat hull rather than torn earth
  out.multiplyScalar(1 - Math.min(depth, 34) / 34 * 0.3);
  return out;
}

// A TORN-OUT PIECE OF EARTH, NOT A PLATE. the first cut was a vertical wall
// to a flat foot, which is a plinth; a floating island's silhouette is a
// TAPER — the ground narrowing through strata into hanging rock teeth, the
// same keel shape the sky islands already carry (theirs run to more than
// half their radius deep). the perimeter walks the terrain's own edge
// heights; every boundary point carries its own keel depth, so between a
// shallow point and a deep one the shell pinches into a tooth on its own.
const ROWS = [0, 1.5, 3.5, 6, 9, 13, 18, 24, 31, 39, 48];
const KEEL_REACH = 46; // the deepest tooth, below the terrain lip

export class Underside {
  private falls: THREE.ShaderMaterial[] = [];
  // where the water pours, for cameras that want to look at it
  readonly fallSpots: { x: number; z: number; top: number }[] = [];

  constructor(field: VoxelField, scene: THREE.Scene) {
    const pos: number[] = [];
    const col: number[] = [];
    const half = GRID / 2;

    // per-boundary keel depth and inward reach, indexed by a running
    // perimeter coordinate so all four edges share one noise field
    const depthAt = (perim: number) => {
      let d = 15 + vn1(perim * 0.11) * 20;
      if (hash1(perim * 7.3) < 0.11) d += 12 + hash1(perim * 2.9) * 16; // a tooth
      return Math.min(d, KEEL_REACH);
    };
    const reachAt = (perim: number) => 16 + vn1(perim * 0.07 + 51) * 20;

    const edge = (axis: "x" | "z", side: 0 | 1, perim0: number) => {
      const fixed = side === 0 ? -half : half;
      const fixedCell = side === 0 ? 0 : GRID - 1;
      const inwardSign = side === 0 ? 1 : -1;
      for (let c = 0; c < GRID - 1; c++) {
        const pa = perim0 + c;
        const pb = perim0 + c + 1;
        const topA = axis === "x" ? field.topAt(c, fixedCell) : field.topAt(fixedCell, c);
        const topB = axis === "x" ? field.topAt(c + 1, fixedCell) : field.topAt(fixedCell, c + 1);
        const dA = depthAt(pa);
        const dB = depthAt(pb);
        const rA = reachAt(pa);
        const rB = reachAt(pb);
        const root = hash1(pa * 5.77) < 0.07;
        for (let r = 0; r < ROWS.length - 1; r++) {
          const put = (
            cell: number, top: number, D: number, reach: number, perim: number, row: number
          ): [number, number, number, THREE.Color] => {
            const nominal = ROWS[row];
            const depth = Math.min(nominal, D);
            const y = top - depth;
            // the taper: lateral pull toward the centre grows with depth,
            // so the wall becomes a keel rather than a plinth. it is tuned
            // against the band the SEA leaves VISIBLE — the first version
            // saved its slope for depths the cloud swallows, and from the
            // full-map orbit the slab still read flat-bottomed.
            const inward = Math.min(46, Math.pow(depth / 30, 1.3) * reach);
            const along = cell - half;
            const wx = axis === "x" ? along : fixed + inwardSign * inward;
            const wz = axis === "x" ? fixed + inwardSign * inward : along;
            return [wx, y, wz, strataColor(depth, perim, root)];
          };
          const a0 = put(c, topA, dA, rA, pa, r);
          const a1 = put(c, topA, dA, rA, pa, r + 1);
          const b0 = put(c + 1, topB, dB, rB, pb, r);
          const b1 = put(c + 1, topB, dB, rB, pb, r + 1);
          // frozen rows collapse to zero-area quads and vanish on their own
          const tri = (v0: typeof a0, v1: typeof a0, v2: typeof a0) => {
            pos.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2]);
            col.push(v0[3].r, v0[3].g, v0[3].b, v1[3].r, v1[3].g, v1[3].b, v2[3].r, v2[3].g, v2[3].b);
          };
          if (axis === "x" ? side === 1 : side === 0) {
            tri(a0, b0, a1);
            tri(b0, b1, a1);
          } else {
            tri(b0, a0, b1);
            tri(a0, a1, b1);
          }
        }
      }
    };

    edge("x", 0, 0);
    edge("x", 1, GRID);
    edge("z", 0, GRID * 2);
    edge("z", 1, GRID * 3);

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

  // ONE OR TWO WATERFALLS off the edge, pouring into the cloud. the spots
  // are found, not chosen: the highest border columns on two different
  // sides, which is where a stream would actually spill.
  private buildFalls(field: VoxelField, scene: THREE.Scene) {
    const half = GRID / 2;
    const spots: { x: number; z: number; top: number; nx: number; nz: number }[] = [];
    const consider = (x: number, z: number, nx: number, nz: number) => {
      const top = field.topAt(x, z);
      spots.push({ x, z, top, nx, nz });
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
          // long streaks falling fast; the fall thins at the edges and
          // dissolves at the foot, where it enters the cloud
          float streak = vnoise(vec2(vUv.x * 6.0, vUv.y * 3.0 - uTime * 1.6));
          streak = smoothstep(0.35, 0.9, streak);
          float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
          float foot = smoothstep(0.0, 0.28, vUv.y);
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
      const w = 5;
      const topY = sp.top - 0.4;
      const geo = new THREE.PlaneGeometry(w, topY - (SEA_Y + 3), 1, 8);
      const mesh = new THREE.Mesh(geo, mat);
      const wx = sp.x - half + 0.5;
      const wz = sp.z - half + 0.5;
      // stand just off the rim face, leaning slightly outward as it falls
      mesh.position.set(wx + sp.nx * 1.4, (topY + SEA_Y + 3) / 2, wz + sp.nz * 1.4);
      if (sp.nx !== 0) mesh.rotation.y = Math.PI / 2;
      mesh.rotation.x = (sp.nz !== 0 ? sp.nz : sp.nx) * -0.045 * (sp.nx !== 0 ? -1 : 1);
      scene.add(mesh);
    }
  }

  update(t: number) {
    for (const m of this.falls) m.uniforms.uTime.value = t;
  }
}
