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
//   THE KEEL   the slab's underside as a single torn mass: widest at the
//              surface and narrowing from the first courses down — grass
//              lip, dark topsoil, a broad pale sandstone band, warm
//              red-brown rock, then deep stone pulling in to four heavy
//              points. the strata are banded per-FRAGMENT from depth, not
//              per-vertex, so the geology stays crisp at any distance;
//              and the keel carries its own light model — sky ambient,
//              sun graze, and a bounce term standing in for the cloud
//              sea's reflected light — because an underside lit only by
//              physically-honest lights is a silhouette.

import * as THREE from "three";
import { GRID } from "./config";
import { SWATCH } from "./palette";
import type { SkyLight } from "./sky";
import type { VoxelField } from "./voxels";
import { coastDistAt } from "./terrain";

// THE SEA SITS WELL BELOW THE LIP. at -14 it lapped the coast and swallowed
// the entire keel — the work was underwater. at -46 it still ate the
// belly's central sag and every tooth. at -54 the bowl bottoms out in the
// air, the four teeth carry a hand's length of visible spear, and the
// cloud laps at the hanging points — which is where the references put it.
const SEA_Y = -54;

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

// THE GEOLOGY IS DRAWN BY THE FRAGMENT, NOT THE VERTEX. the first strata
// were vertex colours, and across the steep courses at the rim — ten units
// of drop on a single face — four bands smeared into one brown blur: a
// heightfield's vertices can never out-resolve its own slope. the bands are
// now a function of interpolated depth, evaluated per pixel, so the
// topsoil line, the broad sandstone band and the red-brown rock under it
// stay crisp from the coast path and from the full-map orbit alike.
//
// the material is also its own light model. an underside faces down; the
// scene's honest lights leave it a silhouette, which is physically right
// and visually wrong. three terms fix it: sky ambient (the mid sky),
// a sun graze (the low sun does rake the flanks at the golden hours), and
// a bounce term fed from the same colour the cloud sea's bright tops use —
// the cloud is a floor of lit vapour, and a floor that bright throws light
// back up.
const UndersideShader = {
  uniforms: {
    // 0 normal · 1 unlit albedo · 2 magenta coverage — the keel is judged
    // in captures, and a wash-out and a culled face look identical until
    // one of these strips the question down to geometry
    uDebug: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 0.34, -1) },
    uSunColor: { value: new THREE.Color(0xf7c07a) },
    uAmbient: { value: new THREE.Color(0xe8cba4) },
    uBounce: { value: new THREE.Color(0xd9c9a6) },
    uFogColor: { value: new THREE.Color(0xccd0c5) },
    uFogNear: { value: 170 },
    uFogFar: { value: 560 },
    uGrass: { value: new THREE.Color(SWATCH.meadowDeep) },
    uSoil: { value: new THREE.Color(SWATCH.earth) },
    uRoot: { value: new THREE.Color(0x2f2418) },
    uCream: { value: new THREE.Color(SWATCH.creamWarm).multiplyScalar(1.04) },
    uSand: { value: new THREE.Color(SWATCH.sand) },
    uRust: { value: new THREE.Color(SWATCH.clay).lerp(new THREE.Color(0xb0542e), 0.55).multiplyScalar(0.9) },
    uStone: { value: new THREE.Color(SWATCH.stoneDark) },
    uCliff: { value: new THREE.Color(SWATCH.cliff) },
    uDeep: { value: new THREE.Color(SWATCH.cliffDeep) },
    uBed: { value: new THREE.Color(0x2e3238) },
    uEmber: { value: new THREE.Color(0xc2521c) },
  },
  vertexShader: /* glsl */ `
    attribute float depth;
    varying vec3 vWorld;
    varying vec3 vN;
    varying float vDepth;
    void main() {
      vDepth = depth;
      // the mesh sits untransformed at the origin, so object space IS
      // world space and the flat face normals come through unrotated
      vN = normal;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uDebug;
    uniform vec3 uSunDir, uSunColor, uAmbient, uBounce;
    uniform vec3 uFogColor;
    uniform float uFogNear, uFogFar;
    uniform vec3 uGrass, uSoil, uRoot, uCream, uSand, uRust, uStone, uCliff, uDeep, uBed, uEmber;
    varying vec3 vWorld;
    varying vec3 vN;
    varying float vDepth;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.5 * vnoise(p);
      v += 0.25 * vnoise(p * 2.03 + 17.0);
      v += 0.125 * vnoise(p * 4.11 + 43.0);
      return v / 0.875;
    }

    void main() {
      if (uDebug > 1.5) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; }
      vec2 cw = vWorld.xz;

      // the grass and topsoil hug the torn lip; below them the strata run
      // LEVEL, the way sediment does, so a tooth shows dipped horizontal
      // bands rather than rings around its own point
      float dLevel = 6.0 - vWorld.y;
      float d = mix(vDepth, dLevel, smoothstep(2.0, 9.0, vDepth));
      // per-column jitter on every boundary: torn ground, not ruled lines
      d += (fbm(cw * 0.045) - 0.5) * 3.2 * smoothstep(1.0, 5.0, d);
      // and the paint is QUANTISED to whole courses, one colour per
      // block, so the strata read as stacked voxels rather than as a
      // gradient wrapped over the terraces
      d = floor(d) + 0.5;

      // the broad pale band carries thin sediment seams, each layer its own
      // slight cream-to-sand lean
      vec3 cream = mix(uCream, uSand,
        0.2 + 0.5 * vnoise(vec2(dot(cw, vec2(0.021, 0.017)), floor(d * 0.8) * 3.7)));

      vec3 alb = uGrass;
      alb = mix(alb, uSoil, smoothstep(0.9, 1.5, d));
      alb = mix(alb, cream, smoothstep(3.9, 4.8, d));
      alb = mix(alb, uRust, smoothstep(16.2, 17.8, d));
      alb = mix(alb, uStone, smoothstep(24.8, 26.6, d));
      alb = mix(alb, uCliff, smoothstep(30.0, 33.5, d));
      alb = mix(alb, uDeep, smoothstep(38.0, 45.0, d));
      alb = mix(alb, uBed, smoothstep(52.0, 72.0, d));

      // roots reach out of the topsoil a short way down the cut
      float rs = vnoise(vec2(dot(cw, vec2(0.31, 0.27)), 11.0));
      alb = mix(alb, uRoot,
        smoothstep(0.66, 0.8, rs) * (1.0 - smoothstep(2.5, 7.5, d)) * smoothstep(1.1, 1.7, d));

      // sediment striations through the sandstone and rust bands only
      float zone = smoothstep(4.5, 5.4, d) * (1.0 - smoothstep(23.5, 25.5, d));
      float layer = fract(d * 0.5 + fbm(cw * 0.018) * 1.6);
      alb *= 1.0 - (1.0 - smoothstep(0.03, 0.15, abs(layer - 0.5))) * 0.22 * zone;

      // grain per BLOCK, not per fragment, and the dark of depth — but
      // only BELOW the strata band, so the geology keeps its colour and
      // the keel keeps its weight
      alb *= 0.93 + 0.14 * vnoise(floor(cw) * 0.6 + vec2(d * 0.9, -d * 0.7));
      alb *= 1.0 - clamp((d - 26.0) / 90.0, 0.0, 1.0) * 0.45;

      // ember seams in the deep rock: coarse cluster, then a rare vein
      vec3 emb = vec3(0.0);
      if (d > 36.0) {
        float cl = vnoise(cw * 0.021 + 7.0);
        float vein = vnoise(vec2(dot(floor(cw), vec2(0.33, 0.29)), d * 0.5));
        emb = uEmber * smoothstep(0.74, 0.82, cl) * smoothstep(0.84, 0.94, vein) * 0.55;
      }

      // NEVER normalize a vector that might be zero: a degenerate face's
      // normal is (0,0,0), normalize() of it is NaN, and one NaN fragment
      // fed to the bloom blur blacks the whole frame
      float nl = length(vN);
      vec3 N = nl > 0.0001 ? vN / nl : vec3(0.0, -1.0, 0.0);
      float sun = max(0.0, dot(N, normalize(uSunDir)));
      float down = clamp(-N.y, 0.0, 1.0);
      vec3 li = uAmbient * 0.36
              + uSunColor * sun * 1.15
              + uBounce * (0.32 + 0.30 * down);
      // A STEPPED UNDERSIDE SHADOWS ITS OWN FLOORS: every course's
      // ceiling is boxed in by the course outside it, so the down-facing
      // faces get almost none of the cloud's bounce. leaving them lit
      // painted every floor sea-gold, and the keel read as shredded
      // plates with bright water between — the mass dissolved into the
      // cloud it was supposed to tower over.
      // — but only where the floors are BOXED IN by the course outside
      // them. the broad open belly faces nothing but cloud, and cloud is
      // a floor of lit vapour: from below the horizon the root was a
      // black blob until its floors were allowed the bounce back.
      li *= 1.0 - down * 0.72 * (1.0 - smoothstep(30.0, 42.0, d));
      // AND THE KEEL DARKENS WITH DEPTH into its own shadow: the strata
      // band stays lit and legible, the belly's contour courses fall
      // toward silhouette, and the mountain reads as a dark mass against
      // the bright cloud — which is how the references carry their
      // weight. lit pale stone at the centre read as a floating pavilion.
      li *= 1.0 - smoothstep(26.0, 46.0, d) * 0.5;
      vec3 col = alb * li + emb;
      if (uDebug > 0.5) col = alb;

      // HALF FOG ONLY. the keel spans a couple of hundred units front to
      // back, and at full strength the scene fog turned its far half into
      // an unbanded sheet of fog colour — the geology erased at exactly
      // the eye-line the island is judged from. the keel hangs below the
      // haze layer the fog models, so it earns a thinner air.
      float fd = length(vWorld - cameraPosition);
      col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, fd) * 0.55);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// A MOUNTAIN TORN OUT OF THE GROUND, IN THE WORLD'S OWN LANGUAGE. the
// underside is built as TERRACES: one flat block-quantised floor per cell
// with vertical risers between neighbours, because a smooth heightfield —
// however well banded — read as plastic next to a voxel world. the mass is
// CENTRAL: the belly descends from the rim band to its deepest line at the
// island's middle, kissing the cloud, and the four heavy teeth hang from
// that deep zone and spear on through. the earlier build had this
// backwards — teeth toward the corners, and a centre so deep the cloud
// swallowed it, which from the side read as a missing middle.
const RES = 128; // terrace cells across the footprint (2 world units each)
const BAND_DEPTH = 26; // the sheer strata face: as tall as the terrain above
// THE VISIBLE WINDOW IS THE LAW. everything below the cloud's crest line
// simply does not exist in a frame, so the whole mountain-read — band,
// sag, teeth — must happen between the lip and the swell tops, and the
// belly bottoms out a hand above them: deep enough that the crests lap
// the central slabs in the troughs' rhythm, never so deep that the
// silhouette flattens into a ship's hull at the crest line.
const BODY_DEPTH = 42;
const ROCK_VAR = 11;

export class Underside {
  private falls: THREE.ShaderMaterial[] = [];
  private mat: THREE.ShaderMaterial;
  readonly fallSpots: { x: number; z: number; top: number }[] = [];

  constructor(field: VoxelField, scene: THREE.Scene) {
    const half = GRID / 2;
    const CS = GRID / RES; // cell size in world units

    // the four teeth: heavy cones clustered in the CENTRAL deep zone —
    // the mountain's root — spread by angle so the points read separately
    const teeth: { x: number; z: number; depth: number; r: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.55 + (hash1(i * 7.1) - 0.5) * 0.7;
      // clustered around the deep centre, but far enough out that each
      // cone's upper shoulders attach ABOVE the swell tops and show
      // before the spear vanishes into the cloud
      const rad = (0.12 + hash1(i * 3.3) * 0.16) * GRID * 0.5;
      teeth.push({
        x: GRID / 2 + Math.cos(a) * rad,
        z: GRID / 2 + Math.sin(a) * rad,
        depth: 38 + hash1(i * 11.7) * 18,
        // slim enough that each cone crosses the cloud's surface steeply
        // and reads as its own spear — broad cones fattened the whole
        // central dish into the swell band and fed the shredding
        r: 26 + hash1(i * 5.9) * 10,
      });
    }

    // depth of the under-surface below the local lip, at any plan point.
    // "distance from the edge" is now distance from the TORN COAST, so the
    // belly's bowl, the band and the teeth all follow the new outline —
    // bays shallow the keel, peninsulas carry their own strata, and the
    // detached shard grows its own small keel from the same rule.
    const profile = (px: number, pz: number): number => {
      const e = Math.min(1, Math.max(0, coastDistAt(px, pz)) / 104);
      // TWO REGIMES, ONE MASS. the strata band falls sheer — narrowing,
      // but slowly — for its whole height; below it the belly takes over
      // and deepens all the way to the centre lines, so the deepest rock
      // hangs under the island's middle like a root, not at its corners.
      const tear = (fbm2(px * 0.021 + 9, pz * 0.021 + 9) - 0.5) * 0.34;
      const eBand = 0.037 * (1 + tear * 0.6);
      let body: number;
      if (e < eBand) {
        body = (e / eBand) * BAND_DEPTH;
      } else {
        // a MONOTONE bowl with the sag FRONT-LOADED (pow below one): from
        // a grazing eye the rim wall occludes whatever happens far
        // inside, so a back-loaded curve reads as a flat hull no matter
        // how deep the centre goes. most of the descent lands by
        // mid-radius, where the sight-line over the band bottom can still
        // catch it, and the belly line visibly bows down toward the
        // middle before the cloud takes it.
        const s = Math.min(1, (e - eBand) / (1 - eBand));
        body = BAND_DEPTH + (BODY_DEPTH - BAND_DEPTH) * Math.pow(s, 0.58);
      }
      // full-amplitude tearing at the rim and cheek; nearly flat inside.
      // interior noise at course scale fragments the belly's contour
      // steps into scattered shards — the belly wants REGULAR concentric
      // courses descending to the centre, the way a voxel mountain wears
      // its contours, and the tearing belongs to the torn edge alone.
      const rock =
        (fbm2(px * 0.028, pz * 0.028) - 0.5) * 2 * ROCK_VAR *
        Math.min(1, e * 6) * (0.15 + 0.85 * Math.max(0, 1 - e / 0.25));
      let tooth = 0;
      for (const t of teeth) {
        const dd = Math.hypot(px - t.x, pz - t.z) / t.r;
        if (dd < 1) tooth = Math.max(tooth, t.depth * Math.pow(1 - dd, 1.6));
      }
      return Math.max(0, body + rock + tooth);
    };

    // per cell: the lip it hangs from, its block-quantised floor height,
    // and its block-quantised radial push (the torn cheek — the band leans
    // proud of the rim, because from an eye slightly above the lip an
    // inward-sloping face is hidden, and the geology must show frontally)
    type Cell = { y: number; lip: number; ox: number; oz: number } | null;
    const cells: Cell[][] = [];
    for (let iz = 0; iz < RES; iz++) {
      const row: Cell[] = [];
      for (let ix = 0; ix < RES; ix++) {
        const px = (ix + 0.5) * CS;
        const pz = (iz + 0.5) * CS;
        const cd = coastDistAt(px, pz);
        if (cd <= 0) {
          row.push(null); // the void: no floor, no keel
          continue;
        }
        const e = Math.min(1, cd / 104);
        const bx = Math.max(0, Math.min(GRID - 1, Math.round(px - 0.5)));
        const bz = Math.max(0, Math.min(GRID - 1, Math.round(pz - 0.5)));
        // near the coast a cell's own column top IS the coastal lip; the
        // blend to the interior reference happens over the same reach as
        // before, measured from the torn line
        const edgeTop = Math.max(1, field.topAt(bx, bz));
        const lip = edgeTop + (6 - edgeTop) * Math.min(1, e / 0.12);
        const depth = profile(px, pz);
        // the cheek push is a RIM feature and must die with distance from
        // the rim, not with depth: keyed on depth alone, the shoulder's
        // 26-34 range held the window open across the whole interior, and
        // the per-cell rounding of a few units of radial push offset
        // every neighbouring floor by ±1 — thousands of corner pinholes,
        // which from the grazing eye-line smeared into bright streaks of
        // sea through the keel
        const push =
          7.5 * Math.sin(Math.PI * Math.min(depth / 34, 1)) * Math.max(0, 1 - e / 0.22);
        const cx = px - GRID / 2;
        const cz2 = pz - GRID / 2;
        const pl = Math.hypot(cx, cz2) || 1;
        row.push({
          y: Math.round(lip - depth),
          lip,
          ox: Math.round((cx / pl) * push),
          oz: Math.round((cz2 / pl) * push),
        });
      }
      cells.push(row);
    }

    const pos: number[] = [];
    const dep: number[] = [];
    // every vertex carries its depth below the local lip, so the strata
    // paint runs continuously down floors and risers alike
    const tri = (
      v0: readonly [number, number, number, number],
      v1: readonly [number, number, number, number],
      v2: readonly [number, number, number, number]
    ) => {
      pos.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2]);
      dep.push(v0[3], v1[3], v2[3]);
    };
    const quad = (
      a: readonly [number, number, number, number],
      b: readonly [number, number, number, number],
      c: readonly [number, number, number, number],
      d: readonly [number, number, number, number]
    ) => {
      tri(a, c, b);
      tri(b, c, d);
    };

    for (let iz = 0; iz < RES; iz++) {
      for (let ix = 0; ix < RES; ix++) {
        const cell = cells[iz][ix];
        if (!cell) continue; // the void owns this cell
        const x0 = ix * CS - half + cell.ox;
        const x1 = (ix + 1) * CS - half + cell.ox;
        const z0 = iz * CS - half + cell.oz;
        const z1 = (iz + 1) * CS - half + cell.oz;
        const dc = cell.lip - cell.y;
        // the floor, wound to look DOWN — grown half a block on every
        // side so neighbouring floors overlap: cells whose push differs
        // only ALONG their shared edge leave a sliver of daylight at the
        // corner otherwise (their bridge is skipped as zero-area), and a
        // lit crack through a dark keel reads louder than any strata
        quad(
          [x0 - 0.5, cell.y, z0 - 0.5, dc],
          [x0 - 0.5, cell.y, z1 + 0.5, dc],
          [x1 + 0.5, cell.y, z0 - 0.5, dc],
          [x1 + 0.5, cell.y, z1 + 0.5, dc]
        );
        // risers to the +x and +z neighbours: a bridge from this cell's
        // edge to the neighbour's, vertical where only the floors differ,
        // slanted where the cheek push steps. the winding is CHECKED, not
        // derived: the face's cross product is compared with the way it
        // must look — toward the deeper cell's air, or straight down for
        // a push-only step — because hand-deriving winding per side is
        // how a riser ends up invisible from exactly the side that
        // matters.
        const bridge = (
          nb: NonNullable<Cell>,
          ax: number, az: number, bx2: number, bz2: number,
          nax: number, naz: number, nbx2: number, nbz2: number,
          dirx: number, dirz: number
        ) => {
          if (nb.y === cell.y && nb.ox === cell.ox && nb.oz === cell.oz) return;
          // a bridge whose two edges lie on one line is a ZERO-AREA quad:
          // its normal is the zero vector, normalize() of it is NaN, and a
          // single NaN fragment smeared through the bloom blur blacks out
          // the ENTIRE post chain — the whole screen died for two
          // collinear triangles
          if (nb.y === cell.y && (dirx !== 0 ? nb.ox === cell.ox : nb.oz === cell.oz)) return;
          const dn = nb.lip - nb.y;
          const T0 = [ax, cell.y, az, dc] as const;
          const T1 = [bx2, cell.y, bz2, dc] as const;
          const N0 = [nax, nb.y, naz, dn] as const;
          const N1 = [nbx2, nb.y, nbz2, dn] as const;
          const ux = nax - ax;
          const uy = nb.y - cell.y;
          const uz = naz - az;
          const vx = bx2 - ax;
          const vz = bz2 - az;
          const cnx = uy * vz;
          const cny = uz * vx - ux * vz;
          const cnz = -uy * vx;
          let dot: number;
          if (nb.y === cell.y) dot = -cny;
          else {
            const toward = nb.y < cell.y ? 1 : -1;
            dot = cnx * dirx * toward + cnz * dirz * toward;
          }
          if (dot >= 0) quad(T0, T1, N0, N1);
          else quad(T1, T0, N1, N0);
        };
        // the coast skirt: wherever a land cell meets the void, one face
        // from the foot of the voxel cliff (y=0) down to this cell's
        // floor, on the shared edge — the first, tallest course of the
        // band, sealed under the coast wall the mesher already builds.
        // wound outward toward the void, checked the same way as bridges.
        const skirt = (
          ax: number, az: number, bx2: number, bz2: number,
          fx0: number, fz0: number, fx1: number, fz1: number,
          dirx: number, dirz: number
        ) => {
          const T0 = [ax, 0, az, cell.lip] as const;
          const T1 = [bx2, 0, bz2, cell.lip] as const;
          const N0 = [fx0, cell.y, fz0, dc] as const;
          const N1 = [fx1, cell.y, fz1, dc] as const;
          const uy = cell.y;
          const vx = bx2 - ax;
          const vz = bz2 - az;
          const dot = uy * vz * dirx - uy * vx * dirz;
          if (dot >= 0) quad(T0, T1, N0, N1);
          else quad(T1, T0, N1, N0);
        };
        const nbXp = ix + 1 < RES ? cells[iz][ix + 1] : null;
        const nbZp = iz + 1 < RES ? cells[iz + 1][ix] : null;
        const nbXm = ix > 0 ? cells[iz][ix - 1] : null;
        const nbZm = iz > 0 ? cells[iz - 1][ix] : null;
        if (nbXp)
          bridge(
            nbXp,
            x1, z0, x1, z1,
            (ix + 1) * CS - half + nbXp.ox, iz * CS - half + nbXp.oz,
            (ix + 1) * CS - half + nbXp.ox, (iz + 1) * CS - half + nbXp.oz,
            1, 0
          );
        else
          skirt(
            (ix + 1) * CS - half, iz * CS - half, (ix + 1) * CS - half, (iz + 1) * CS - half,
            x1, z0, x1, z1, 1, 0
          );
        if (nbZp)
          bridge(
            nbZp,
            x0, z1, x1, z1,
            ix * CS - half + nbZp.ox, (iz + 1) * CS - half + nbZp.oz,
            (ix + 1) * CS - half + nbZp.ox, (iz + 1) * CS - half + nbZp.oz,
            0, 1
          );
        else
          skirt(
            ix * CS - half, (iz + 1) * CS - half, (ix + 1) * CS - half, (iz + 1) * CS - half,
            x0, z1, x1, z1, 0, 1
          );
        if (!nbXm)
          skirt(
            ix * CS - half, iz * CS - half, ix * CS - half, (iz + 1) * CS - half,
            x0, z0, x0, z1, -1, 0
          );
        if (!nbZm)
          skirt(
            ix * CS - half, iz * CS - half, (ix + 1) * CS - half, iz * CS - half,
            x0, z0, x1, z0, 0, -1
          );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("depth", new THREE.Float32BufferAttribute(dep, 1));
    geo.computeVertexNormals();
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(UndersideShader.uniforms),
      vertexShader: UndersideShader.vertexShader,
      fragmentShader: UndersideShader.fragmentShader,
      // the terraces are a SHELL, not solid voxels, and a bowl's risers
      // face its centre: from outside, every descending step on the near
      // half shows the camera its BACK. single-sided, the whole near
      // half of the belly was culled away and the sea shone through the
      // keel as scattered daylight. backfaces stay unlit by the sun
      // terms, which is exactly right — steps facing away read as the
      // mass's own shadow.
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, this.mat);
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
    // the coast is found, not assumed: any land column with a void
    // neighbour is a candidate lip for a fall
    for (let x = 2; x < GRID - 2; x += 3) {
      for (let z = 2; z < GRID - 2; z += 3) {
        if (field.topAt(x, z) <= 0) continue;
        if (field.topAt(x + 1, z) <= 0) consider(x, z, 1, 0);
        else if (field.topAt(x - 1, z) <= 0) consider(x, z, -1, 0);
        else if (field.topAt(x, z + 1) <= 0) consider(x, z, 0, 1);
        else if (field.topAt(x, z - 1) <= 0) consider(x, z, 0, -1);
      }
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

  // the keel's light follows the sky: ambient from the mid sky, the sun's
  // own colour for the graze, and the bounce fed from the same recipe as
  // the cloud sea's bright tops — the light it throws back up is the light
  // it caught
  debug(v: number) {
    this.mat.uniforms.uDebug.value = v;
  }

  update(t: number, light: SkyLight, fog: THREE.Fog) {
    for (const m of this.falls) m.uniforms.uTime.value = t;
    const u = this.mat.uniforms;
    (u.uSunDir.value as THREE.Vector3).copy(light.sunDir);
    (u.uSunColor.value as THREE.Color).copy(light.sunColor);
    (u.uAmbient.value as THREE.Color).copy(light.mid);
    (u.uBounce.value as THREE.Color).copy(light.horizon).lerp(light.sunColor, 0.25);
    (u.uFogColor.value as THREE.Color).copy(fog.color);
    u.uFogNear.value = fog.near;
    u.uFogFar.value = fog.far;
  }
}
