// kodo - water. the voxel field keeps the water CELLS (a plaque still
// names them, the mason still refuses to build in them, a column still
// holds its level); this module draws the SURFACE over them, which is a
// different problem: a surface has to move, catch the sun, and reflect the
// sky, and a cube cannot do any of that.
//
// how it reflects without a second render: a planar reflection means
// drawing the whole world again into a target, which is exactly the cost
// that got the occlusion pass deleted. the sky is a procedural gradient
// published every frame as four keys, so the water rebuilds that gradient
// analytically from the reflected view ray, adds the sun's specular path
// on top, and mixes the two into the body colour through a fresnel term.
// one draw call, no second pass, and it reflects the real sky including
// the hour of the day.
//
// the surface carries a shore attribute built with the mesh: a cell that
// touches land gets foam, so the water meets the bank instead of ending.

import * as THREE from "three";
import { GRID } from "./config";
import { SWATCH } from "./palette";
import type { Wind } from "./wind";

// the ripple field, shared by the vertex displacement and the fragment
// normal so the highlight sits on the wave it belongs to. the fine octave
// is what makes water read as water: the swell moves the surface, but the
// chop is what breaks the reflection into glints.
const RIPPLE = /* glsl */ `
  // five trains at deliberately unrelated angles and speeds. all of them
  // parallel to the wind gives corduroy, which is the failure mode a sum of
  // sines falls into; spread across the compass they interfere and the
  // surface reads as chop.
  float waveAt(vec2 p, float t, vec2 dir) {
    vec2 c1 = vec2(-dir.y, dir.x);
    vec2 d1 = dir;
    vec2 d2 = normalize(dir * 0.35 + c1 * 0.94);
    vec2 d3 = normalize(dir * -0.72 + c1 * 0.69);
    vec2 d4 = normalize(dir * 0.86 - c1 * 0.51);
    vec2 d5 = normalize(dir * -0.29 - c1 * 0.96);
    float a = sin(dot(p, d1) * 0.83 + t * 1.55);
    float b = sin(dot(p, d2) * 1.21 - t * 1.13) * 0.82;
    float c = sin(dot(p, d3) * 1.97 + t * 2.31) * 0.52;
    float d = sin(dot(p, d4) * 3.11 - t * 2.90) * 0.34;
    float e2 = sin(dot(p, d5) * 4.73 + t * 3.70) * 0.22;
    return (a + b + c + d + e2) * 0.19;
  }
`;

const VERT = /* glsl */ `
  #include <fog_pars_vertex>
  attribute float shore;
  uniform vec4 wind;      // dirX, dirZ, gust, time
  uniform float amp;
  varying vec3 vWorld;
  varying float vShore;
  ${RIPPLE}
  void main() {
    vShore = shore;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float t = wind.w;
    vec2 dir = normalize(wind.xy + vec2(0.001));
    // the shore is held still: a wave that lifts at the bank shows the gap
    float a = amp * mix(1.0, 0.25, shore) * (0.6 + 0.6 * wind.z);
    // the swell only ever rises. the surface sits a hair above the top
    // water cube, so a trough that dipped would fight it for the pixel;
    // clamped upward, the trough simply rests on the block.
    wp.y += max(0.0, waveAt(wp.xz, t, dir) + 0.5) * a;
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    vFogDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 body;        // the water's own colour
  uniform vec3 deepBody;    // its colour where it is away from the bank
  // the sky's four published bands. NOT named fogColor: three's own fog
  // chunk owns that uniform and this shader includes it.
  uniform vec3 zenith, midSky, horizon, hazeBand;
  uniform vec3 sunColor, sunDir;
  uniform float sunPower, sunGain, foamGain, normalStrength, dbg;
  uniform vec4 wind;
  uniform float amp;
  varying vec3 vWorld;
  varying float vShore;
  ${RIPPLE}

  // the sky dome's own gradient, rebuilt from the keys it publishes: this
  // is what makes the reflection read as THIS sky at THIS hour
  vec3 skyAt(vec3 dir) {
    float y = clamp(dir.y, -1.0, 1.0);
    float up = clamp(y, 0.0, 1.0);
    vec3 c = mix(horizon, midSky, smoothstep(0.0, 0.34, up));
    c = mix(c, zenith, smoothstep(0.3, 0.85, up));
    // below the horizon the dome shows its haze band, and so does the water
    c = mix(hazeBand, c, smoothstep(-0.12, 0.06, y));
    return c;
  }

  void main() {
    float t = wind.w;
    vec2 dir = normalize(wind.xy + vec2(0.001));
    // the normal comes from the same wave the vertex rode, differenced, so
    // the highlight tracks the crest instead of drifting off it. it is
    // tilted MUCH harder than the geometry is displaced, and deliberately:
    // a surface that only leans six degrees reflects one band of sky
    // uniformly and reads as poured glass. water reads as water because
    // the reflection is broken, not because it is present.
    float e = 0.5;
    float a = mix(1.0, 0.3, vShore) * (0.6 + 0.6 * wind.z) * normalStrength;
    float h = waveAt(vWorld.xz, t, dir);
    float hx = waveAt(vWorld.xz + vec2(e, 0.0), t, dir);
    float hz = waveAt(vWorld.xz + vec2(0.0, e), t, dir);
    vec3 n = normalize(vec3(-(hx - h) * a / e, 1.0, -(hz - h) * a / e));

    vec3 view = normalize(cameraPosition - vWorld);
    vec3 refl = reflect(-view, n);
    vec3 sky = skyAt(refl);

    // schlick, with water's real normal reflectance. looking down you see
    // water; the sky arrives at a glancing angle or on a crest that turns
    // to face it.
    float cosT = clamp(dot(n, view), 0.0, 1.0);
    float f = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
    vec3 water = mix(deepBody, body, vShore);
    vec3 col = mix(water, sky, f);

    // the glitter path: the sun's disc smeared across the chop. added
    // AFTER the fresnel mix, because a highlight is light arriving, not a
    // reflectance of the water's own colour.
    float spec = pow(max(dot(refl, normalize(sunDir)), 0.0), sunPower);
    col += sunColor * spec * sunGain;

    // foam where the surface meets the bank, moving with the swell so the
    // edge breathes instead of sitting there as a painted line. it is
    // brightest where the swell is actually up against the bank, which is
    // what keeps it from reading as a white outline drawn round the pool.
    float lap = 0.5 + 0.5 * sin(dot(vWorld.xz, dir) * 1.1 + t * 1.9);
    float swell = smoothstep(-0.15, 0.5, h);
    float foam = smoothstep(0.62, 1.0, vShore) * (0.2 + 0.8 * lap) * swell;
    col = mix(col, mix(body, vec3(1.0), 0.86), foam * foamGain);

    // the channel switch: 1 fresnel, 2 normal, 3 sky, 4 shore, 5 view,
    // 6 body. it stays because reasoning about why water looks wrong from
    // a screenshot cost more than measuring it did.
    if (dbg > 0.5) {
      if (dbg < 1.5) col = vec3(f);
      else if (dbg < 2.5) col = n * 0.5 + 0.5;
      else if (dbg < 3.5) col = sky;
      else if (dbg < 4.5) col = vec3(vShore);
      else if (dbg < 5.5) col = view * 0.5 + 0.5;
      else col = water;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export interface WaterSurface {
  mesh: THREE.Mesh;
  quads: number;
}

export class Water {
  readonly group = new THREE.Group();
  readonly mat: THREE.ShaderMaterial;
  private meshes: THREE.Mesh[] = [];
  private falls: Waterfall[] = [];

  constructor(private wind: Wind) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          wind: { value: new THREE.Vector4(1, 0, 0.5, 0) },
          amp: { value: 0.13 },
          // the shading normal leans far harder than the geometry does
          normalStrength: { value: 0.62 },
          body: { value: new THREE.Color(SWATCH.stillwater) },
          deepBody: { value: new THREE.Color(SWATCH.stillwater).multiplyScalar(0.62) },
          zenith: { value: new THREE.Color(0x6c81a4) },
          midSky: { value: new THREE.Color(0xe8cba4) },
          horizon: { value: new THREE.Color(0xd9a468) },
          hazeBand: { value: new THREE.Color(SWATCH.haze) },
          sunColor: { value: new THREE.Color(0xf7c07a) },
          sunDir: { value: new THREE.Vector3(0, 0.4, -1) },
          sunPower: { value: 220 },
          sunGain: { value: 0.9 },
          foamGain: { value: 0.34 },
          dbg: { value: 0 },
        },
      ]),
      fog: true,
    });
    // the shared uniform object is replaced by the merge, so point it at
    // the wind field's live vector rather than copying it every frame
    this.mat.uniforms.wind = this.wind.uniform;
    this.group.add(new THREE.Group());
  }

  // build a surface over a set of water columns. cells are grid coords and
  // the level is the world y the surface sits at.
  addSurface(cells: { x: number; z: number; y: number }[]): WaterSurface | null {
    if (!cells.length) return null;
    const has = new Set<number>();
    for (const c of cells) has.add(c.x * GRID + c.z);

    const pos: number[] = [];
    const shore: number[] = [];
    const idx: number[] = [];
    let v = 0;
    for (const c of cells) {
      const wx = c.x - GRID / 2;
      const wz = c.z - GRID / 2;
      const y = c.y;
      // how much land this cell touches: 0 open water, 1 a corner of the bank
      let land = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!has.has((c.x + dx) * GRID + (c.z + dz))) land++;
      }
      const s = Math.min(1, land / 2);
      pos.push(wx, y, wz, wx + 1, y, wz, wx + 1, y, wz + 1, wx, y, wz + 1);
      for (let k = 0; k < 4; k++) shore.push(s);
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("shore", new THREE.Float32BufferAttribute(shore, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.meshes.push(mesh);
    return { mesh, quads: cells.length };
  }

  addFall(fall: Waterfall) {
    this.falls.push(fall);
    this.group.add(fall.group);
  }

  get fallCount(): number {
    return this.falls.length;
  }
  get surfaceCount(): number {
    return this.meshes.length;
  }

  // the sky publishes its keys every frame; the water reflects them
  setSky(
    zenith: THREE.Color,
    mid: THREE.Color,
    horizon: THREE.Color,
    fog: THREE.Color,
    sunColor: THREE.Color,
    sunDir: THREE.Vector3,
    sunIntensity: number
  ) {
    const u = this.mat.uniforms;
    (u.zenith.value as THREE.Color).copy(zenith);
    (u.midSky.value as THREE.Color).copy(mid);
    (u.horizon.value as THREE.Color).copy(horizon);
    (u.hazeBand.value as THREE.Color).copy(fog);
    (u.sunColor.value as THREE.Color).copy(sunColor);
    (u.sunDir.value as THREE.Vector3).copy(sunDir);
    // at night the glitter path belongs to the moon: dimmer and wider
    u.sunGain.value = 0.6 + sunIntensity * 0.9;
    u.sunPower.value = sunIntensity > 1 ? 220 : 90;
    for (const f of this.falls) f.setSky(fog, sunColor);
  }

  update(dt: number, t: number) {
    for (const f of this.falls) f.update(dt, t);
  }
}

// ---------------------------------------------------------------------------
// WET PAVING. the same physics as the pool, pointed at a different problem:
// a street after rain reflects the SIGNAGE, and the sky trick cannot do
// that because the signs are not in the sky. so the surface is handed the
// emitters directly and reflects each one's mirror image below the road.
// the smear is long and vertical because the view is grazing, which is the
// entire look. still one draw call, still no second render.
// ---------------------------------------------------------------------------

const MAX_EMITTERS = 12;

const WET_VERT = /* glsl */ `
  #include <fog_pars_vertex>
  attribute float shore;
  varying vec3 vWorld;
  varying float vWet;
  void main() {
    vWet = shore; // here the attribute carries wetness, not shoreline
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const WET_FRAG = /* glsl */ `
  precision highp float;
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 zenith, midSky, horizon, hazeBand;
  uniform vec4 emPos[${MAX_EMITTERS}];   // xyz + reach
  uniform vec3 emCol[${MAX_EMITTERS}];
  uniform int emCount;
  uniform float wetness, sharp, gain, time;
  varying vec3 vWorld;
  varying float vWet;

  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  vec3 skyAt(vec3 dir) {
    float up = clamp(dir.y, 0.0, 1.0);
    vec3 c = mix(horizon, midSky, smoothstep(0.0, 0.34, up));
    c = mix(c, zenith, smoothstep(0.3, 0.85, up));
    return mix(hazeBand, c, smoothstep(-0.12, 0.06, dir.y));
  }

  void main() {
    // a road is not a mirror. the normal is perturbed by a coarse puddle
    // field so the reflection breaks into patches, which is what separates
    // wet tarmac from polished glass.
    vec2 p = vWorld.xz;
    float n1 = h21(floor(p * 0.7));
    float n2 = h21(floor(p * 1.9) + 31.0);
    // the film covers MORE of the road than it did. the old thresholds left
    // most of the surface below the puddle cutoff, and everything the signs
    // contribute is scaled by puddle, so most of the road was reflecting
    // nothing at all.
    float puddle = smoothstep(0.28, 0.82, n1 * 0.65 + n2 * 0.35) * vWet;
    vec3 n = normalize(vec3((n2 - 0.5) * 0.12 * (1.0 - puddle), 1.0, (n1 - 0.5) * 0.12 * (1.0 - puddle)));

    vec3 view = normalize(cameraPosition - vWorld);
    vec3 refl = reflect(-view, n);
    float cosT = clamp(dot(n, view), 0.0, 1.0);
    float f = (0.02 + 0.98 * pow(1.0 - cosT, 5.0)) * mix(0.25, 1.0, puddle);

    vec3 col = skyAt(refl) * f * 0.4;
    // and the signs, each one mirrored under the road
    for (int i = 0; i < ${MAX_EMITTERS}; i++) {
      if (i >= emCount) break;
      vec3 e = emPos[i].xyz;
      float reach = emPos[i].w;
      vec3 mir = vec3(e.x, 2.0 * vWorld.y - e.y, e.z);
      vec3 toM = normalize(mir - vWorld);
      float aim = max(dot(refl, toM), 0.0);
      // TWO LOBES, and the broad one is the whole effect. a single lobe at
      // an exponent of ninety is a mirror, and a mirror of a one-block sign
      // seen from across a street is a pinpoint you cannot find — which is
      // why the road came back flat grey under a frontage of neon. a wet
      // road is not a mirror: it is a bright core smeared into a streak by
      // the roughness around it. the tight lobe is the core, the broad one
      // is the smear, and the smear is what you actually see.
      float s = pow(aim, sharp) + 0.6 * pow(aim, 5.0);
      float d = length(e.xz - p);
      float falloff = 1.0 - smoothstep(0.0, reach * 3.4, d);
      // the smear flickers a little, because a sign is a tube and a road
      // is not still
      float flick = 0.9 + 0.1 * sin(time * 2.1 + float(i) * 2.3);
      col += emCol[i] * s * falloff * gain * mix(0.5, 1.0, puddle) * flick;
    }
    gl_FragColor = vec4(col * wetness, clamp(f * 0.5 + puddle * 0.45, 0.0, 0.92));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export interface WetEmitter {
  x: number;
  y: number;
  z: number;
  reach: number;
  color: THREE.Color;
}

export class WetPaving {
  readonly group = new THREE.Group();
  readonly mat: THREE.ShaderMaterial;
  // RAIN IS THE ONE THING THAT MAKES A WET STREET HONEST. the film was
  // always at full wetness because the town is always at night; in the rain
  // it goes further, and in the dry it can back off, which is what makes the
  // rain read as a change rather than as more of the same.
  set rainWetness(v: number) {
    this.mat.uniforms.wetness.value = 0.72 + v * 0.5;
    this.mat.uniforms.gain.value = 1.45 + v * 0.9;
  }

  constructor() {
    const pos: THREE.Vector4[] = [];
    const cols: THREE.Color[] = [];
    for (let i = 0; i < MAX_EMITTERS; i++) {
      pos.push(new THREE.Vector4());
      cols.push(new THREE.Color());
    }
    this.mat = new THREE.ShaderMaterial({
      vertexShader: WET_VERT,
      fragmentShader: WET_FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          zenith: { value: new THREE.Color(0x131b31) },
          midSky: { value: new THREE.Color(0x1a2440) },
          horizon: { value: new THREE.Color(0x27324e) },
          hazeBand: { value: new THREE.Color(SWATCH.haze) },
          emPos: { value: pos },
          emCol: { value: cols },
          emCount: { value: 0 },
          wetness: { value: 1 },
          // the tight lobe is now only the CORE of the smear, so it does
          // not have to be a mirror; the broad lobe beside it carries the
          // streak. see WET_FRAG.
          sharp: { value: 42 },
          gain: { value: 1.45 },
          time: { value: 0 },
        },
      ]),
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.mat.uniforms.emPos.value = pos;
    this.mat.uniforms.emCol.value = cols;
  }

  // the columns to lay film over. wet 0..1 per column: a pavement under an
  // awning stays dry and the middle of the road does not.
  addSurface(cells: { x: number; z: number; y: number; wet: number }[]) {
    if (!cells.length) return;
    const pos: number[] = [];
    const wet: number[] = [];
    const idx: number[] = [];
    let v = 0;
    for (const c of cells) {
      const wx = c.x - GRID / 2;
      const wz = c.z - GRID / 2;
      const y = c.y;
      pos.push(wx, y, wz, wx + 1, y, wz, wx + 1, y, wz + 1, wx, y, wz + 1);
      for (let k = 0; k < 4; k++) wet.push(c.wet);
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("shore", new THREE.Float32BufferAttribute(wet, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.renderOrder = 2;
    this.group.add(mesh);
  }

  // the brightest emitters only: a road can hold a dozen reflections before
  // it stops being a road and starts being a disco floor
  setEmitters(list: WetEmitter[]) {
    const use = list.slice(0, MAX_EMITTERS);
    const pos = this.mat.uniforms.emPos.value as THREE.Vector4[];
    const cols = this.mat.uniforms.emCol.value as THREE.Color[];
    for (let i = 0; i < use.length; i++) {
      pos[i].set(use[i].x, use[i].y, use[i].z, use[i].reach);
      cols[i].copy(use[i].color);
    }
    this.mat.uniforms.emCount.value = use.length;
  }

  // the road reflects the night sky it is under, and dries out by day
  setSky(zenith: THREE.Color, mid: THREE.Color, horizon: THREE.Color, fog: THREE.Color, dayness: number, t: number) {
    const u = this.mat.uniforms;
    (u.zenith.value as THREE.Color).copy(zenith);
    (u.midSky.value as THREE.Color).copy(mid);
    (u.horizon.value as THREE.Color).copy(horizon);
    (u.hazeBand.value as THREE.Color).copy(fog);
    u.time.value = t;
    // by day the film is still there but the signs cannot compete with the
    // sun, so the whole effect eases off rather than switching
    u.gain.value = 0.25 + (1 - dayness) * 0.85;
    u.wetness.value = 0.45 + (1 - dayness) * 0.55;
  }
}

// ---------------------------------------------------------------------------
// a waterfall. a scrolling ribbon from a lip to wherever it stops being
// water: on an island it stops being water in mid-air, and the mist it
// becomes is the point of the whole thing.
// ---------------------------------------------------------------------------

// a plane's v runs 0 at the BOTTOM. a fall is authored from the lip down,
// so every shader here works in vDrop: 0 at the lip, 1 where it is gone.
const FALL_VERT = /* glsl */ `
  uniform vec4 wind;   // dirX, dirZ, gust, time
  uniform float spread, drift;
  varying vec2 vUv;
  varying float vDrop;
  void main() {
    vUv = uv;
    vDrop = 1.0 - uv.y;
    vec3 p = position;
    // a fall widens as it goes and the wind takes it sideways. a plumb
    // line of constant width is a pipe, not a waterfall.
    p.x *= 1.0 + spread * vDrop * vDrop;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    float sway = sin(wind.w * 0.6 + vDrop * 2.2) * 0.35 + 1.0;
    wp.xz += wind.xy * drift * vDrop * vDrop * (0.5 + 0.5 * wind.z) * sway;
    vec4 mv = viewMatrix * wp;
    gl_Position = projectionMatrix * mv;
  }
`;

const FALL_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 water, foam, fogColor, sunColor;
  uniform float time, speed, fade;
  varying vec2 vUv;
  varying float vDrop;

  float h21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  // vertical streaks scrolling DOWN, each column on its own speed and
  // phase, so the sheet reads as falling water rather than as a texture
  // sliding behind a window
  float streaks(float u, float drop, float t) {
    float col = floor(u * 9.0);
    float off = h21(vec2(col, 3.0));
    float y = fract(drop * 1.6 - t * (0.8 + off * 0.7) + off);
    float s = smoothstep(0.0, 0.3, y) * smoothstep(1.0, 0.55, y);
    return s * (0.5 + 0.5 * h21(vec2(col, floor(y * 4.0))));
  }

  void main() {
    float t = time * speed;
    float s = streaks(vUv.x, vDrop, t);
    // the lip breaks white, the body is water, and the tail stops being
    // water at all: it turns to the colour of the air and lets the sky
    // through, which is the entire reason to stand under one of these
    float lip = smoothstep(0.10, 0.0, vDrop);
    float tail = smoothstep(1.0 - fade, 1.0, vDrop);
    vec3 col = mix(water, foam, clamp(s * 0.5 + lip * 0.85, 0.0, 1.0));
    col = mix(col, fogColor, tail * 0.96);
    col += sunColor * s * 0.09;
    float alpha = (0.13 + 0.42 * s) * (1.0 - tail * 0.9);
    // the sheet thins as it falls and never shows a straight side
    alpha *= mix(1.0, 0.55, vDrop);
    alpha *= smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Waterfall {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private mist: THREE.Sprite[] = [];
  private mistMat: THREE.SpriteMaterial;

  // x/z world position of the lip, the y it falls FROM, the y it stops at,
  // and how wide the sheet is
  constructor(
    x: number,
    topY: number,
    z: number,
    bottomY: number,
    width = 3,
    private mistScale = 1,
    wind?: Wind
  ) {
    const h = Math.max(2, topY - bottomY);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: FALL_VERT,
      fragmentShader: FALL_FRAG,
      uniforms: {
        water: { value: new THREE.Color(SWATCH.stillwater).lerp(new THREE.Color(SWATCH.mist), 0.35) },
        foam: { value: new THREE.Color(0xffffff) },
        fogColor: { value: new THREE.Color(SWATCH.haze) },
        sunColor: { value: new THREE.Color(SWATCH.sunGolden) },
        time: { value: 0 },
        speed: { value: 0.55 },
        // a fall into open air dissolves early; one into a pool runs to it
        fade: { value: 0.55 },
        spread: { value: 0.45 },
        drift: { value: 1.3 },
        wind: { value: wind ? wind.uniform.value : new THREE.Vector4(1, 0, 0.5, 0) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    if (wind) this.mat.uniforms.wind = wind.uniform;

    // three sheets at unrelated angles so the fall has body from every
    // side and never shows the seam of a two-plane cross
    for (const rot of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h, 1, 12), this.mat);
      m.position.set(x, bottomY + h / 2, z);
      m.rotation.y = rot;
      m.renderOrder = 2;
      m.frustumCulled = false;
      this.group.add(m);
    }

    // the mist it becomes. sprites, because the cloud it falls into is
    // sprites too and they have to belong to each other.
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, "rgba(255,255,255,0.55)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.2)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mistMat = new THREE.SpriteMaterial({
      map: tex,
      color: SWATCH.mist,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      fog: false,
    });
    // the mist gathers where the sheet STOPS BEING WATER, which is up in
    // the last third of the drop, not at the notional bottom. put it at the
    // bottom and the fall reads as a pipe that ends and a cloud that
    // happens to be under it.
    const MIST_N = 6;
    for (let i = 0; i < MIST_N; i++) {
      const sp = new THREE.Sprite(this.mistMat.clone());
      const a = (i / MIST_N) * Math.PI * 2 * 1.7;
      const down = 0.52 + (i / MIST_N) * 0.5; // through the dissolve and past it
      const spread = width * (0.4 + down * 1.3);
      sp.position.set(
        x + Math.cos(a) * spread,
        bottomY + h * (1 - down),
        z + Math.sin(a) * spread
      );
      const w = (width * (1.5 + down * 1.9)) * this.mistScale;
      sp.scale.set(w, w * 0.62, 1);
      sp.renderOrder = 3;
      this.group.add(sp);
      this.mist.push(sp);
      this.mistBase.push(sp.position.clone());
      this.mistSize.push(w);
    }
  }

  private mistBase: THREE.Vector3[] = [];
  private mistSize: number[] = [];

  // a fall that ends in open air fades most of its length away
  intoAir(): this {
    this.mat.uniforms.fade.value = 0.62;
    return this;
  }
  intoPool(): this {
    this.mat.uniforms.fade.value = 0.2;
    return this;
  }

  setSky(fog: THREE.Color, sunColor: THREE.Color) {
    (this.mat.uniforms.fogColor.value as THREE.Color).copy(fog);
    (this.mat.uniforms.sunColor.value as THREE.Color).copy(sunColor);
  }

  update(_dt: number, t: number) {
    this.mat.uniforms.time.value = t;
    // the mist breathes and wanders, so a still frame is never a still frame
    for (let i = 0; i < this.mist.length; i++) {
      const s = this.mist[i];
      const base = this.mistBase[i];
      const p = t * 0.42 + i * 1.3;
      const k = 1 + Math.sin(p) * 0.16;
      const w = this.mistSize[i] * k;
      s.scale.set(w, w * 0.62, 1);
      s.position.set(
        base.x + Math.sin(p * 0.6) * 1.4,
        base.y + Math.sin(p * 0.45 + 1.7) * 0.9,
        base.z + Math.cos(p * 0.53) * 1.4
      );
      s.material.opacity = 0.13 + 0.13 * (0.5 + 0.5 * Math.sin(p * 0.7));
    }
  }
}
