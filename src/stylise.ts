// cathedral - THE STYLISATION STAGE. the world renders clean and modern: a
// correct physically-lit voxel scene at whatever resolution the monitor
// happens to have, with smooth gradients and sixteen million colours. that is
// a rendering, and a rendering is a picture of a technology. what this world
// wants is a PROCESSING SIGNATURE — the thing that makes a frame identifiable
// as coming from here and nowhere else, before you have read a single
// building in it.
//
// five parts, in this order, and the order is the whole design:
//
//   1. NO GRAIN. it used to be first, in the grade, so it would be pixelated
//      WITH the image rather than dusted over the top of finished chunky
//      pixels. that was the right place for it and it still read as noise ON
//      the picture rather than texture IN it, worst across a flat sky and
//      dark ground. the treatments below are what carry the signature, and a
//      treatment that has to be turned down to be bearable is carrying
//      nothing — so it is gone rather than lowered.
//   2. PIXELATION. the whole scene renders at a fraction of the output and is
//      blown back up with no smoothing. this is the primary treatment and it
//      is also the only one that makes the frame CHEAPER: at divisor three
//      the renderer shades a ninth of the pixels.
//   3. COLOUR QUANTISATION, to a palette derived from this world's own
//      swatch file rather than to a generic posterisation. that is the
//      difference between "an image with fewer colours" and "an image made
//      of this place's colours".
//   4. ORDERED DITHER at the low resolution, so the palette's gaps are
//      crossed by a visible woven pattern instead of by banding.
//   5. a very subtle CHROMATIC OFFSET on high-contrast edges, which is the
//      only part of this that pretends to be a lens.

import * as THREE from "three";
import { SWATCH } from "./palette";

// ---- the palette -------------------------------------------------------------

// THE ANCHORS. twelve colours that between them account for essentially every
// pixel of a frame of this world: the ground note and its cool fold, the
// canopy, the dry slopes, the rock, the earth, the dressed stone, the roof,
// the timber, the accent, the light, and the water. they are read from the
// swatch rather than retyped, so a palette change upstream reaches the
// stylisation without anyone remembering to come here.
const ANCHORS: [string, number][] = [
  ["meadow", SWATCH.meadow],
  ["meadowShade", SWATCH.meadowShade],
  ["foliageDeep", SWATCH.foliageDeep],
  ["grassDry", SWATCH.grassDry],
  ["cliff", SWATCH.cliff],
  ["clay", SWATCH.clay],
  ["cream", SWATCH.cream],
  ["tileCharcoal", SWATCH.tileCharcoal],
  ["timber", SWATCH.timber],
  ["vermilion", SWATCH.vermilion],
  ["lantern", SWATCH.lantern],
  ["stillwater", SWATCH.stillwater],
];

// THE AIR LADDER, and its length is the one thing in this file that was
// measured rather than reasoned about.
//
// the first version had six neutrals evenly spaced from near-black to paper.
// snapped against three real frames of this world it put FORTY PER CENT of
// every pixel onto a single entry, and the measured luma distribution says
// why: 57% of the frame sits between 0.6 and 0.9 — sky, haze, lit stone —
// and 0.0% of it is above 0.9. six even steps put one entry in the band that
// holds most of the picture and one in a band that holds none of it, which
// is exactly the white plate the sky came back as.
//
// twelve now, as two interleaved ladders — warm for the sun side, cool for
// the haze and the shade, which is the same split-tone the grade carries —
// weighted so eight of them land above 0.45.
// ...and the upper half of that ladder was still WRONG, for a reason the
// first measurement could not see. it counted how many entries served the
// busy band and not what colour they were: 0xd9ddd4 is four per cent
// saturated, so a sky with real chroma in it snapped to a grey plate however
// many greys were on offer. the band that holds most of the frame is the
// SKY, and it was being served by neutrals.
//
// so the ladder splits. neutrals keep the shadow end, where a frame really
// is close to colourless, and the light end is a sky ladder taken from the
// sky's own swatch — the golden horizon at half saturation, its paler steps,
// and the cool upper air.
const NEUTRALS = [
  0x1e2229, // the deepest shadow the grade reaches
  0x3a352e, // warm earth in shade
  0x53585c, // cool mid shadow
  0x6b6355, // warm mid
  0x968c79, // the last genuinely neutral step before the light
];

const SKY = [
  0x8ea3b8, // cool upper air
  0xaec6d2, // pale cool sky
  0xc2c8bd, // day horizon, near neutral by nature
  0xd9a468, // THE GOLDEN HORIZON ITSELF, 52% saturated
  0xe0bc86, // a step up from it, still 40%
  0xdcd5bd, // the warm pale band above the burn
  0xf0d9a4, // the brightest the sky gets, and still gold rather than white
];

type RGB = [number, number, number];
const toRGB = (hex: number): RGB => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// A RAMP IS NOT A BRIGHTNESS SLIDER. a lit scene shows every material across
// its whole range — the same cream wall is a highlight on one face and a deep
// shadow on the next — so a palette of base swatch values alone has nowhere to
// put two thirds of the frame and everything shaded collapses to black. each
// anchor gets a ramp, and the ramp is built the way a painter builds one:
// shadows go COOLER and hold their saturation, highlights go WARMER and lose
// it. that is also exactly what the grade does, so the two agree.
function ramp(base: RGB, steps: number): RGB[] {
  const out: RGB[] = [];
  const lum = base[0] * 0.2126 + base[1] * 0.7152 + base[2] * 0.0722;
  for (let i = 0; i < steps; i++) {
    // -1 .. +1 across the ramp, 0 being the swatch itself
    const t = steps === 1 ? 0 : (i / (steps - 1)) * 2 - 1;
    if (t < 0) {
      // A SHADOW STEP THAT GOES TOO DARK IS A WASTED ENTRY. at 0.38 of value
      // the deepest step of all twelve anchors converged on the same
      // near-black, so twelve entries were doing one entry's work and three
      // of them were never selected at all. 0.55 keeps them apart.
      const k = 1 + t * 0.45;
      out.push([
        clamp01(base[0] * k + 0.012 * -t),
        clamp01(base[1] * k + 0.022 * -t),
        clamp01(base[2] * k + 0.055 * -t),
      ]);
    } else {
      const k = 1 + t * 0.5;
      // toward its own luma as it climbs: a highlight is less saturated
      const d = t * 0.34;
      out.push([
        clamp01((base[0] * (1 - d) + lum * d) * k + 0.055 * t),
        clamp01((base[1] * (1 - d) + lum * d) * k + 0.036 * t),
        clamp01((base[2] * (1 - d) + lum * d) * k + 0.008 * t),
      ]);
    }
  }
  return out;
}

// the palette itself. `steps` is the tunable: 2 gives 30 colours, 3 gives 42,
// 4 gives 54 — the middle of which is where the brief asked to start.
export function buildPalette(steps = 3): RGB[] {
  const out: RGB[] = [];
  for (const [, hex] of ANCHORS) out.push(...ramp(toRGB(hex), Math.max(1, Math.min(5, steps))));
  for (const n of NEUTRALS) out.push(toRGB(n));
  for (const n of SKY) out.push(toRGB(n));
  return out;
}

export function paletteSize(steps = 3): number {
  return ANCHORS.length * Math.max(1, Math.min(5, steps)) + NEUTRALS.length + SKY.length;
}

// the palette as hex, so a harness can measure how well it actually covers a
// frame of this world rather than how well it reads on a swatch card
export function paletteHex(steps = 3): string[] {
  return buildPalette(steps).map(
    (c) => "#" + c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")
  );
}

// ---- the lookup --------------------------------------------------------------

// SNAPPING TO A PALETTE IS A NEAREST-NEIGHBOUR SEARCH, and doing it in the
// shader means forty-odd texture fetches for every pixel of the output — and
// the output is the FULL resolution, so at divisor three that search runs nine
// times for every pixel it can possibly affect. the whole search is baked into
// a lookup instead: a 32x32x32 cube where every cell already holds the palette
// colour nearest to it. one fetch, exact, and the cost is a third of a
// millisecond at boot.
const LUT_N = 32;

export function buildPaletteLUT(steps = 3): THREE.DataTexture {
  const pal = buildPalette(steps);
  const w = LUT_N * LUT_N;
  const h = LUT_N;
  const data = new Uint8Array(w * h * 4);
  for (let b = 0; b < LUT_N; b++) {
    for (let g = 0; g < LUT_N; g++) {
      for (let r = 0; r < LUT_N; r++) {
        const cr = r / (LUT_N - 1);
        const cg = g / (LUT_N - 1);
        const cb = b / (LUT_N - 1);
        let best = 0;
        let bestD = 1e9;
        for (let i = 0; i < pal.length; i++) {
          const p = pal[i];
          // weighted toward green, because that is where the eye lives and
          // because this world is mostly hillside
          const dr = (p[0] - cr) * 0.9;
          const dg = (p[1] - cg) * 1.35;
          const db = (p[2] - cb) * 0.75;
          const d = dr * dr + dg * dg + db * db;
          if (d < bestD) { bestD = d; best = i; }
        }
        const p = pal[best];
        const px = ((g * w + b * LUT_N + r) * 4) | 0;
        data[px] = Math.round(p[0] * 255);
        data[px + 1] = Math.round(p[1] * 255);
        data[px + 2] = Math.round(p[2] * 255);
        data[px + 3] = 255;
      }
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  // NEAREST IN ALL THREE AXES. a linear filter between two palette entries
  // hands back a colour that is in neither of them, which is precisely the
  // thing a quantisation is for removing — the slice blend is done away with
  // in the shader for the same reason.
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ---- the pass ----------------------------------------------------------------

export const StyliseShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tPalette: { value: null as THREE.Texture | null },
    // NO DITHER HERE. it moved to the grade, which has the two things the
    // dither needs — the low-resolution raster, and a depth read that
    // works, for masking the weave out of the sky. this pass measurably
    // could not sample the depth texture (same texture, same uniform, real
    // values in the grade, the clear value here, in the same frame) and a
    // mask balanced on an unexplained driver behaviour is not shippable.
    // ditherAmount remains in StyleParams; post.tune routes it to the
    // grade's uniform.
    // the resolution the scene was actually rendered at. every coordinate in
    // this shader is computed against THIS and not against the output, which
    // is what keeps the dither woven at the pixel scale instead of at the
    // monitor's.
    lowRes: { value: new THREE.Vector2(480, 270) },
    paletteMix: { value: 0 }, // 0 = untouched, 1 = fully snapped
    ditherAmount: { value: 0 }, // in units of colour, before the snap
    chroma: { value: 0 }, // low-res texels of red/blue separation on an edge
    chromaEdge: { value: 0.16 }, // the luma step an edge has to clear
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tPalette;
    uniform vec2 lowRes;
    uniform float paletteMix, chroma, chromaEdge;
    varying vec2 vUv;

    // EVERY READ IS SNAPPED TO THE LOW GRID. the upscale is done here rather
    // than left to the texture's magnification filter, so it is nearest
    // whatever the render target was configured with and so the same
    // coordinate can be reused for the dither index.
    vec3 tap(vec2 offsetTexels) {
      vec2 g = floor(vUv * lowRes + offsetTexels) + 0.5;
      return texture2D(tDiffuse, g / lowRes).rgb;
    }

    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }


    // the palette cube. no interpolation between slices: an interpolated
    // lookup returns a colour that is not in the palette.
    vec3 snap(vec3 c) {
      float sz = ${LUT_N}.0;
      c = clamp(c, 0.0, 1.0);
      float r = floor(c.r * (sz - 1.0) + 0.5);
      float g = floor(c.g * (sz - 1.0) + 0.5);
      float b = floor(c.b * (sz - 1.0) + 0.5);
      float u = (b * sz + r + 0.5) / (sz * sz);
      float v = (g + 0.5) / sz;
      return texture2D(tPalette, vec2(u, v)).rgb;
    }

    void main() {
      vec3 col = tap(vec2(0.0));

      // THE CHROMATIC OFFSET, and it is deliberately a WHOLE PIXEL or none.
      // a sub-texel shift on a nearest-sampled image is not a shift at all —
      // it lands back in the same cell — so the separation is rounded, which
      // is also the only version of this that looks like it belongs in a
      // pixelated frame rather than like a blurred photograph.
      if (chroma > 0.001) {
        float l0 = luma(tap(vec2(-1.0, 0.0)));
        float l1 = luma(tap(vec2(1.0, 0.0)));
        float edge = smoothstep(chromaEdge, chromaEdge + 0.30, abs(l1 - l0));
        float k = floor(edge * chroma + 0.5);
        if (k > 0.0) {
          col.r = tap(vec2(k, 0.0)).r;
          col.b = tap(vec2(-k, 0.0)).b;
        }
      }

      // THE DITHER GOES IN BEFORE THE SNAP. after it, it is just noise on a
      // flat colour; before it, it is what decides which of two palette
      // entries a pixel falls to, which is the whole mechanism — a woven
      // texture across a gradient instead of a hard band.
      //
      // AND IT STAYS OUT OF THE SKY. across world geometry the weave lands
      // on real transitions — a wall meeting its eave, a slope turning —
      // and reads as texture; across the sky's smooth gradient it flips
      // fifteen per cent of the cells against their neighbours and reads as
      // exactly the grain that was just removed. the sky is found by DEPTH,
      // not by frame position: the dome sits past 0.8 of the far plane, the
      // same band the grade's haze already lets go at, so the mask holds
      // whatever the camera is doing — a top-third cut would put grain back
      // in the sky the moment the horizon dropped.


      // and the snap, mixed rather than absolute, so the strength is one
      // number the whole way from off to full
      if (paletteMix > 0.001) col = mix(col, snap(col), paletteMix);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// ---- the three strengths -----------------------------------------------------

export interface StyleParams {
  divisor: number; // integer render divisor. 1 = native, 3 = about 480p at 1440
  paletteMix: number;
  ditherAmount: number;
  chroma: number;
  chromaEdge: number;
  rampSteps: number; // 2 = 30 colours, 3 = 42, 4 = 54
}

export type StyleMode = "off" | "subtle" | "strong";

// the divisor is an INTEGER on purpose: a fractional upscale gives some
// output pixels two source pixels and others three, and the eye reads the
// unevenness as a moiré crawling over every straight edge in the world.
// THE DITHER HAS TO CLEAR THE GAP IT IS CROSSING. measured against three real
// frames, the three entries carrying the sky sit about 0.10 of luma apart —
// so a dither amplitude well under that cannot reach the next colour and the
// band stays a band. ramp 3 (48 colours) is the setting: ramp 4 costs twelve
// more entries and measured the same error, with more of them never selected.
export const STYLE_PRESETS: Record<StyleMode, StyleParams> = {
  off: { divisor: 1, paletteMix: 0, ditherAmount: 0, chroma: 0, chromaEdge: 0.16, rampSteps: 3 },
  subtle: { divisor: 2, paletteMix: 0.55, ditherAmount: 0.055, chroma: 0.6, chromaEdge: 0.2, rampSteps: 3 },
  strong: { divisor: 3, paletteMix: 1.0, ditherAmount: 0.105, chroma: 1.0, chromaEdge: 0.13, rampSteps: 3 },
};
