// cathedral - the post stack. the world is rendered, then graded, in this
// order: scene, bloom on the emissives, tone mapping, then one grade pass
// that carries the look (colour lut, depth haze, vignette, grain). the lut
// is where the painterly unification happens: three grades (day, golden
// hour, night) built from the palette's own temperature and blended across
// the sky's cycle, so every material is judged THROUGH the grade rather
// than raw.
//
// the grade is cheap and always on; bloom is the first thing the silent
// ladder takes from a weak machine.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type { Config } from "./quality";
import { STYLE_PRESETS, StyliseShader, buildPaletteLUT, paletteSize } from "./stylise";
import type { StyleMode, StyleParams } from "./stylise";

const LUT_SIZE = 16; // tiled 2d lut: 256x16, bilinear across slices

interface Grade {
  lift: [number, number, number]; // shadows
  gain: [number, number, number]; // highlights
  gamma: number; // midtone bend
  sat: number;
  contrast: number;
}

// the three grades, SPLIT-TONED since the ground went cool: the sun warms
// the highlights and the shade goes blue-green, which is how a mountain
// landscape in this tradition is painted. the old grade crushed blue
// everywhere to make a warm world; that would now mud the cliff stone and
// kill the mist, so the warmth moved into the gain and the shadows lift
// cool instead.
// THE SUBJECT CANNOT BE THE DARKEST THING IN THE FRAME. contrast 1.1 about
// mid grey took a shaded charcoal wall at 0.074 down to 0.054 — the grade
// was crushing the one part of the picture the whole world is built to
// show. the shadows lift higher and stay cool, and the contrast comes off
// enough that the toe is a value rather than a hole. the warmth stays in
// the gain, which is where it was moved to and where it belongs.
const GRADE_GOLDEN: Grade = {
  lift: [0.038, 0.045, 0.062],
  gain: [1.06, 1.005, 0.945],
  gamma: 0.96,
  sat: 1.08,
  contrast: 1.04,
};
const GRADE_DAY: Grade = {
  lift: [0.012, 0.02, 0.038],
  gain: [1.015, 1.02, 1.01],
  gamma: 1.0,
  sat: 1.05,
  contrast: 1.06,
};
// night keeps enough saturation for the town's neon to read as colour
const GRADE_NIGHT: Grade = {
  lift: [0.012, 0.02, 0.055],
  gain: [0.82, 0.9, 1.08],
  gamma: 1.06,
  sat: 0.9,
  contrast: 1.02,
};

function buildLUT(g: Grade): THREE.DataTexture {
  const n = LUT_SIZE;
  const w = n * n;
  const h = n;
  const data = new Uint8Array(w * h * 4);
  const lum = [0.2126, 0.7152, 0.0722];
  for (let b = 0; b < n; b++) {
    for (let gI = 0; gI < n; gI++) {
      for (let r = 0; r < n; r++) {
        const c = [r / (n - 1), gI / (n - 1), b / (n - 1)];
        // contrast about mid grey, then gamma, then lift/gain per channel
        const out = c.map((v, i) => {
          let x = (v - 0.5) * g.contrast + 0.5;
          x = Math.pow(Math.max(0, x), g.gamma);
          x = g.lift[i] + x * (g.gain[i] - g.lift[i] * 0);
          return x;
        });
        const l = out[0] * lum[0] + out[1] * lum[1] + out[2] * lum[2];
        const sat = out.map((v) => l + (v - l) * g.sat);
        const px = ((gI * w + b * n + r) * 4) | 0;
        data[px] = Math.max(0, Math.min(255, Math.round(sat[0] * 255)));
        data[px + 1] = Math.max(0, Math.min(255, Math.round(sat[1] * 255)));
        data[px + 2] = Math.max(0, Math.min(255, Math.round(sat[2] * 255)));
        data[px + 3] = 255;
      }
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    lutA: { value: null as THREE.Texture | null },
    lutB: { value: null as THREE.Texture | null },
    lutMix: { value: 0 },
    lutStrength: { value: 0.7 },
    hazeColor: { value: new THREE.Color(0xccd0c5) },
    // THE HAZE IS THE SECOND ONE. the scene carries a linear fog as well, and
    // the two compound — measured together they took nearly half the
    // contrast out of the middle ground before the grade ran. this one now
    // begins past the far side of the world rather than at the next ridge,
    // so the settlement reads and only the hills beyond it dissolve.
    hazeStrength: { value: 0.30 },
    hazeStart: { value: 0.44 }, // fraction of the far plane where haze begins
    cameraNear: { value: 0.1 },
    cameraFar: { value: 500 },
    vignette: { value: 0.35 },
    grain: { value: 0.035 },
    uTime: { value: 0 },
    // the valley mist. world position is reconstructed from depth against
    // a camera ray basis main hands us each frame, so mist can pool BY
    // ALTITUDE: it fills the low ground and the water and leaves the
    // ridges and the temples standing out of it.
    mistColor: { value: new THREE.Color(0xd6dcd8) },
    mistStrength: { value: 0 },
    mistTop: { value: 12 }, // world y the pool thins out at
    mistDepth: { value: 9 }, // how many blocks it takes to thin
    // DEPTH OF FIELD. this is what makes a reference diorama read as a
    // diorama rather than as a game screenshot: a sharp band of midground
    // with the near and the far let go. it runs INSIDE the grade rather than
    // as its own pass — the grade already carries the depth texture, and a
    // separate pass would mean another full-screen target for a dozen taps.
    dofStrength: { value: 0 }, // 0 = off; the whole effect scales on this
    dofFocus: { value: 0.06 }, // linear depth the sharp band sits at
    dofRange: { value: 0.05 }, // how far either side stays sharp
    dofMaxPx: { value: 3.2 }, // blur radius in pixels at full circle
    texel: { value: new THREE.Vector2(1 / 1600, 1 / 900) },
    camPos: { value: new THREE.Vector3() },
    rayF: { value: new THREE.Vector3(0, 0, -1) }, // forward * far
    rayR: { value: new THREE.Vector3(1, 0, 0) }, // right * far * tan * aspect
    rayU: { value: new THREE.Vector3(0, 1, 0) }, // up * far * tan
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D lutA;
    uniform sampler2D lutB;
    uniform float lutMix, lutStrength, hazeStrength, hazeStart;
    uniform float cameraNear, cameraFar, vignette, grain, uTime;
    uniform vec3 hazeColor;
    uniform vec3 mistColor, camPos, rayF, rayR, rayU;
    uniform float mistStrength, mistTop, mistDepth;
    uniform float dofStrength, dofFocus, dofRange, dofMaxPx;
    uniform vec2 texel;
    varying vec2 vUv;

    vec3 sampleLUT(sampler2D lut, vec3 c) {
      float sz = ${LUT_SIZE}.0;
      c = clamp(c, 0.0, 1.0);
      float b = c.b * (sz - 1.0);
      float b0 = floor(b);
      float b1 = min(b0 + 1.0, sz - 1.0);
      float f = b - b0;
      float u = (c.r * (sz - 1.0) + 0.5) / (sz * sz);
      float v = (c.g * (sz - 1.0) + 0.5) / sz;
      vec3 s0 = texture2D(lut, vec2(u + b0 / sz, v)).rgb;
      vec3 s1 = texture2D(lut, vec2(u + b1 / sz, v)).rgb;
      return mix(s0, s1, f);
    }

    float linearDepth(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      float z = perspectiveDepthToViewZ(d, cameraNear, cameraFar);
      return viewZToOrthographicDepth(z, cameraNear, cameraFar);
    }

    // the circle of confusion: zero across the focal band, opening toward
    // the camera and toward the horizon. the near side opens FASTER, which
    // is what a real lens does and what keeps a foreground branch soft
    // without dissolving the hill behind the subject.
    float coc(float d) {
      float far = smoothstep(dofFocus + dofRange, dofFocus + dofRange + 0.34, d);
      float near = 1.0 - smoothstep(max(dofFocus - dofRange - 0.055, 0.0), dofFocus - dofRange, d);
      return clamp(max(far, near * 1.35), 0.0, 1.0);
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 col = src.rgb;

      // the defocus, before anything is graded: blurring a graded image
      // smears the grade's own contrast into the bokeh
      if (dofStrength > 0.001) {
        float c = coc(linearDepth(vUv)) * dofStrength;
        if (c > 0.01) {
          // a golden-angle spiral: twelve taps land evenly on the disc with
          // no ring artefact and no sample table
          vec3 sum = col;
          float wsum = 1.0;
          float r = c * dofMaxPx;
          for (int i = 0; i < 12; i++) {
            float fi = float(i);
            float a = fi * 2.3999632;
            float rad = sqrt((fi + 0.5) / 12.0) * r;
            vec2 off = vec2(cos(a), sin(a)) * rad * texel;
            // a sample from well in FRONT of the focal plane must not bleed
            // onto a sharp subject, or the building grows a halo
            float dn = linearDepth(vUv + off);
            float w = coc(dn) * dofStrength >= c * 0.35 ? 1.0 : 0.25;
            sum += texture2D(tDiffuse, vUv + off).rgb * w;
            wsum += w;
          }
          col = mix(col, sum / wsum, clamp(c, 0.0, 1.0));
        }
      }

      // depth haze: distance dissolves into mountain mist, so layered hills
      // read like a painted backdrop instead of a wall of detail
      float d = linearDepth(vUv);
      // the sky dome carries its own gradient: haze belongs to the land in
      // front of it, so it ramps in over the distance and lets go before
      // the dome's shell
      float haze = smoothstep(hazeStart, 0.72, d) * hazeStrength;
      haze *= 1.0 - smoothstep(0.76, 0.86, d);
      col = mix(col, hazeColor, haze);

      // the valley mist, at dawn. this is the one effect that had to know
      // WHERE it is rather than only how far: mist that ignores altitude
      // is just more haze. the world point behind this pixel is rebuilt
      // from the depth and the camera's ray basis, and the pool thickens
      // toward the valley floor, so a temple on a shoulder stands clear of
      // the same mist the water below is drowned in.
      if (mistStrength > 0.001 && d < 0.985) {
        vec2 ndc = vUv * 2.0 - 1.0;
        vec3 world = camPos + (rayF + rayR * ndc.x + rayU * ndc.y) * d;
        float pool = 1.0 - smoothstep(mistTop - mistDepth, mistTop, world.y);
        // and it needs air to gather in: nothing pools on your boots
        float reach = smoothstep(0.02, 0.30, d);
        col = mix(col, mistColor, clamp(pool * reach * mistStrength, 0.0, 0.92));
      }

      // the grade
      vec3 graded = mix(sampleLUT(lutA, col), sampleLUT(lutB, col), lutMix);
      col = mix(col, graded, lutStrength);

      // vignette
      vec2 q = (vUv - 0.5) * 2.0;
      col *= 1.0 - vignette * dot(q, q) * 0.35;

      // film grain: enough to kill the sterile plastic read, no more
      float n = fract(sin(dot(vUv * (1.0 + fract(uTime)), vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * grain;

      gl_FragColor = vec4(col, src.a);
    }
  `,
};

export class Post {
  readonly composer: EffectComposer;
  private grade: ShaderPass;
  private bloom: UnrealBloomPass | null = null;
  private depth: THREE.DepthTexture;
  private luts: { day: THREE.DataTexture; golden: THREE.DataTexture; night: THREE.DataTexture };
  private fx: { bloom: boolean; grade: boolean; haze: boolean };
  private scene: THREE.Scene;
  // THE STYLISATION. everything upstream of this pass renders at the reduced
  // resolution — the scene, the bloom, the grade and its grain — and this is
  // the pass that blows it back up. that is what makes the pixelation cost
  // NEGATIVE: at divisor three the renderer shades a ninth of the pixels it
  // used to, so the primary treatment is also the cheapest frame in the
  // project.
  private stylise: ShaderPass;
  private style: StyleParams = { ...STYLE_PRESETS.off };
  private styleMode: StyleMode | "custom" = "off";
  private paletteSteps = -1;
  // A DEPTH-FREE TARGET FOR THE GRADE TO LAND IN, and the reason it exists is
  // the sharpest lesson this pass had to teach.
  //
  // both of the composer's ping-pong buffers carry the SAME depth texture on
  // purpose: the number of buffer swaps in a frame can be odd, so the scene
  // lands in a different buffer on alternate frames, and sharing the depth is
  // what lets the grade find it either way. that was fine while the grade was
  // the last pass, because the last pass renders to the SCREEN — no
  // framebuffer, nothing to collide with.
  //
  // putting the stylisation after it made the grade write into a buffer
  // instead, and that buffer has the depth texture the grade is sampling
  // bound to it. the driver calls that a feedback loop and drops the draw
  // call: measured as three completely black frames, with the reason sitting
  // in the webgl log the whole time.
  //
  // so the grade writes here — its own target, colour only — and the
  // stylisation reads it. no parity to reason about and nothing shared.
  private tail: THREE.WebGLRenderTarget;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    cfg: Config
  ) {
    this.fx = { bloom: cfg.bloom, grade: cfg.grade, haze: cfg.haze };
    this.scene = scene;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const w = Math.floor(size.x * pr);
    const h = Math.floor(size.y * pr);

    this.depth = new THREE.DepthTexture(w, h);
    this.depth.type = THREE.UnsignedIntType;
    const target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      depthTexture: this.depth,
      depthBuffer: true,
    });
    this.composer = new EffectComposer(renderer, target);
    // both ping-pong buffers share the one depth texture, so the grade can
    // always read the scene's depth no matter which buffer it lands in
    this.composer.renderTarget2.depthTexture = this.depth;

    this.luts = { day: buildLUT(GRADE_DAY), golden: buildLUT(GRADE_GOLDEN), night: buildLUT(GRADE_NIGHT) };
    this.grade = new ShaderPass(GradeShader);
    this.grade.material.depthTest = false;
    this.grade.material.depthWrite = false;
    this.grade.uniforms.tDepth.value = this.depth;
    this.grade.uniforms.lutA.value = this.luts.golden;
    this.grade.uniforms.lutB.value = this.luts.golden;
    this.grade.uniforms.cameraNear.value = camera.near;
    this.grade.uniforms.cameraFar.value = camera.far;

    this.tail = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });

    this.stylise = new ShaderPass(StyliseShader);
    this.stylise.material.depthTest = false;
    this.stylise.material.depthWrite = false;
    this.setStyle("off");

    this.build();
  }

  // ---- the stylisation seam ------------------------------------------------

  // the three strengths, and every parameter behind them. the presets are
  // where to start; the setters are there because the only way to pick a
  // strength is to look at the same frame at several of them.
  setStyle(mode: StyleMode) {
    this.tune({ ...STYLE_PRESETS[mode] });
    // after the tune, not before: tune marks the state "custom" and a preset
    // is not custom
    this.styleMode = mode;
  }

  tune(p: Partial<StyleParams>) {
    Object.assign(this.style, p);
    this.style.divisor = Math.max(1, Math.min(8, Math.round(this.style.divisor)));
    if (p.rampSteps !== undefined || this.paletteSteps < 0) {
      // rebuilding the cube is a third of a millisecond, but it is still
      // pointless to do it on every slider drag
      if (this.style.rampSteps !== this.paletteSteps) {
        this.paletteSteps = this.style.rampSteps;
        (this.stylise.uniforms.tPalette.value as THREE.DataTexture | null)?.dispose();
        this.stylise.uniforms.tPalette.value = buildPaletteLUT(this.style.rampSteps);
      }
    }
    const u = this.stylise.uniforms;
    u.paletteMix.value = this.style.paletteMix;
    u.ditherAmount.value = this.style.ditherAmount;
    u.chroma.value = this.style.chroma;
    u.chromaEdge.value = this.style.chromaEdge;
    if (Object.keys(p).length && this.styleMode !== "off") this.styleMode = "custom";
    // the divisor changes the size of every buffer in the chain, so it has
    // to go all the way back through setSize rather than being a uniform
    const size = this.renderer.getSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
    this.applyDofScale();
    this.build();
  }

  get styleParams(): StyleParams & { mode: string; colours: number; renderedAt: string } {
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const d = this.style.divisor;
    return {
      ...this.style,
      mode: this.styleMode,
      colours: paletteSize(this.style.rampSteps),
      renderedAt: `${Math.max(1, Math.floor((size.x * pr) / d))}x${Math.max(1, Math.floor((size.y * pr) / d))}`,
    };
  }

  // DITHER COUNTS. it was left out of this test, so ?dither=0.08 on its own
  // never put the pass in the chain at all and came back looking exactly like
  // an untouched frame — which is indistinguishable from "the dither does
  // nothing", and is how a working stage gets mistaken for a broken one.
  private get styling(): boolean {
    return (
      this.style.divisor > 1 ||
      this.style.paletteMix > 0.001 ||
      this.style.chroma > 0.001 ||
      this.style.ditherAmount > 0.0001
    );
  }

  // (re)assemble the chain for the current effect set. a pass that is off
  // is never constructed, so a machine that cannot afford the occlusion
  // never pays for its render targets either.
  private build() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const w = Math.floor(size.x * pr);
    const h = Math.floor(size.y * pr);

    this.composer.passes.length = 0;
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (this.fx.bloom) {
      // bloom on the emissives only: the threshold sits above anything the
      // lit world reaches, so only lanterns, glasslight, the ribbon, the
      // candles and the founding stone halo
      if (!this.bloom) this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.75, 0.96);
      this.composer.addPass(this.bloom);
    }

    this.composer.addPass(new OutputPass());
    // the grade and the stylisation are NOT composer passes. they are driven
    // by hand in render() so the grade can always write into its own
    // depth-free target — see the note on `tail`.
    this.grade.uniforms.hazeStrength.value = this.fx.haze ? 0.30 : 0;
  }

  // the resolution the scene is actually rendered at, which is the output
  // divided by the stylisation's divisor
  private lowSize(w: number, h: number): { lw: number; lh: number } {
    const pr = this.renderer.getPixelRatio();
    const d = this.style.divisor;
    return {
      lw: Math.max(1, Math.floor((w * pr) / d)),
      lh: Math.max(1, Math.floor((h * pr) / d)),
    };
  }

  // FOCUS ON A POINT IN THE WORLD, not on a depth number. every caller
  // knows what it is looking at — the rig knows its target, photo mode
  // knows its subject — and none of them know what that is in linear
  // depth, so the conversion lives here.
  focusOn(worldPoint: THREE.Vector3, opts: { strength?: number; range?: number; maxPx?: number } = {}) {
    const d = this.camera.position.distanceTo(worldPoint);
    const lin = Math.max(0, Math.min(1, (d - this.camera.near) / (this.camera.far - this.camera.near)));
    this.grade.uniforms.dofFocus.value = lin;
    if (opts.strength !== undefined) this.grade.uniforms.dofStrength.value = opts.strength;
    if (opts.range !== undefined) this.grade.uniforms.dofRange.value = opts.range;
    if (opts.maxPx !== undefined) { this.dofBasePx = opts.maxPx; this.applyDofScale(); }
  }

  // the two presets. subtle is what the world runs on — enough to separate
  // a foreground tree from the hall behind it and no more; diorama is the
  // photo-mode setting, where the miniature read is the whole point.
  private dofBasePx = 0;
  dof(mode: "off" | "subtle" | "diorama") {
    const u = this.grade.uniforms;
    if (mode === "off") { u.dofStrength.value = 0; this.dofBasePx = 0; }
    else if (mode === "subtle") { u.dofStrength.value = 0.55; u.dofRange.value = 0.075; this.dofBasePx = 2.6; }
    else { u.dofStrength.value = 1.0; u.dofRange.value = 0.03; this.dofBasePx = 5.4; }
    this.applyDofScale();
  }

  // THE BLUR RADIUS IS IN PIXELS, AND THE PIXELS GOT BIGGER. the defocus runs
  // inside the grade, which now renders at the reduced resolution — so a
  // radius tuned by eye at native scale covers three times as much of the
  // frame at divisor three. it is divided back down, which is also the only
  // way "subtle" means the same thing at every strength.
  private applyDofScale() {
    this.grade.uniforms.dofMaxPx.value = this.dofBasePx / this.style.divisor;
  }

  get dofMode(): number {
    return this.grade.uniforms.dofStrength.value as number;
  }

  apply(cfg: Config) {
    this.fx = { bloom: cfg.bloom, grade: cfg.grade, haze: cfg.haze };
    this.build();
  }

  get effects(): { bloom: boolean; grade: boolean; haze: boolean } {
    return { ...this.fx };
  }

  // nothing on top of the scene render: main draws straight to the screen
  // and skips the composer's buffers entirely. the stylisation counts — it is
  // the one pass that changes the SIZE of the render, so bypassing it does
  // not merely drop an effect, it silently un-pixelates the world.
  get bypass(): boolean {
    return !this.fx.bloom && !this.fx.grade && !this.styling;
  }

  // the sky hands the grade its phase and its air colour every frame
  setPhase(phase01: number, haze: THREE.Color, t: number) {
    const u = this.grade.uniforms;
    u.uTime.value = t;
    u.hazeColor.value.copy(haze);
    // golden 0.9..0.2, dusk to night 0.24..0.5, day 0.6..0.85
    const p = phase01;
    let a: THREE.DataTexture;
    let b: THREE.DataTexture;
    let m: number;
    if (p < 0.22) {
      a = this.luts.golden;
      b = this.luts.golden;
      m = 0;
    } else if (p < 0.34) {
      a = this.luts.golden;
      b = this.luts.night;
      m = (p - 0.22) / 0.12;
    } else if (p < 0.5) {
      a = this.luts.night;
      b = this.luts.night;
      m = 0;
    } else if (p < 0.64) {
      a = this.luts.night;
      b = this.luts.day;
      m = (p - 0.5) / 0.14;
    } else if (p < 0.82) {
      a = this.luts.day;
      b = this.luts.day;
      m = 0;
    } else {
      a = this.luts.day;
      b = this.luts.golden;
      m = (p - 0.82) / 0.18;
    }
    u.lutA.value = a;
    u.lutB.value = b;
    u.lutMix.value = m;

    // the valley mist belongs to DAWN. it gathers through the small hours,
    // stands thickest as the light comes back, and is burnt off by the time
    // the sun is properly up. a thin memory of it holds through the night
    // so the low ground never reads empty.
    let mist = 0;
    if (p >= 0.34 && p < 0.5) mist = 0.16 + 0.2 * ((p - 0.34) / 0.16); // the small hours
    else if (p >= 0.5 && p < 0.58) mist = 0.36 + 0.42 * ((p - 0.5) / 0.08); // first light
    else if (p >= 0.58 && p < 0.7) mist = 0.78 * (1 - (p - 0.58) / 0.12); // burning off
    else if (p >= 0.26 && p < 0.34) mist = 0.16 * ((p - 0.26) / 0.08); // gathering at dusk
    u.mistStrength.value = mist;
  }

  // the camera's ray basis, so the grade can rebuild a world position from
  // its depth buffer. main calls this after the camera has been moved.
  setCameraBasis(camera: THREE.PerspectiveCamera) {
    const u = this.grade.uniforms;
    const far = camera.far;
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const f = u.rayF.value as THREE.Vector3;
    const r = u.rayR.value as THREE.Vector3;
    const up = u.rayU.value as THREE.Vector3;
    camera.getWorldDirection(f);
    r.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    r.multiplyScalar(far * tan * camera.aspect);
    up.multiplyScalar(far * tan);
    f.multiplyScalar(far);
    (u.camPos.value as THREE.Vector3).copy(camera.position);
  }

  setSize(w: number, h: number) {
    // EVERY BUFFER IN THE CHAIN IS THE LOW SIZE, not the canvas size. this is
    // the difference between a pixelation that costs a full-resolution render
    // plus a downsample, and one that never renders the pixels at all. the
    // depth texture, the bloom's mip chain and the depth-of-field's texel all
    // follow it, and the depth-of-field's blur radius is in PIXELS — so a
    // radius tuned at native resolution would be three times too wide at
    // divisor three if it were left alone.
    const { lw, lh } = this.lowSize(w, h);
    this.grade.uniforms.texel.value.set(1 / lw, 1 / lh);
    // THE COMPOSER APPLIES THE PIXEL RATIO ITSELF. it multiplies whatever it
    // is given by the ratio it read from the renderer at construction, so
    // handing it numbers that already carry the ratio squares it — invisible
    // at ratio one, and a quarter-resolution world on any retina display.
    this.composer.setSize(Math.max(1, Math.floor(w / this.style.divisor)), Math.max(1, Math.floor(h / this.style.divisor)));
    this.tail.setSize(lw, lh);
    this.depth.image.width = lw;
    this.depth.image.height = lh;
    this.depth.needsUpdate = true;
    this.bloom?.setSize(lw, lh);
    (this.stylise.uniforms.lowRes.value as THREE.Vector2).set(lw, lh);
    this.grade.uniforms.cameraNear.value = this.camera.near;
    this.grade.uniforms.cameraFar.value = this.camera.far;
  }

  // THE TAIL IS DRIVEN BY HAND. the composer runs the scene, the bloom and
  // the tone map; the grade and the stylisation are stepped explicitly after
  // it so the grade always lands in a target that does not carry the depth
  // texture it is reading. a ShaderPass only ever touches `.texture` on the
  // buffer it is handed, so a bare wrapper is a legitimate source.
  render() {
    const styling = this.styling;
    const grading = this.fx.grade;
    // when there is no tail at all the composer goes straight to the screen,
    // exactly as it used to
    this.composer.renderToScreen = !grading && !styling;
    this.composer.render();
    if (!grading && !styling) return;

    // every swapping pass leaves its result in readBuffer, so this is the
    // composer's output whatever the parity worked out to be
    let src: THREE.Texture = this.composer.readBuffer.texture;
    if (grading) {
      this.grade.renderToScreen = !styling;
      this.grade.render(this.renderer, this.tail, { texture: src } as unknown as THREE.WebGLRenderTarget, 0, false);
      src = this.tail.texture;
    }
    if (styling) {
      this.stylise.renderToScreen = true;
      this.stylise.render(
        this.renderer,
        null as unknown as THREE.WebGLRenderTarget,
        { texture: src } as unknown as THREE.WebGLRenderTarget,
        0,
        false
      );
    }
  }
}

