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
const GRADE_GOLDEN: Grade = {
  lift: [0.012, 0.02, 0.04],
  gain: [1.06, 1.005, 0.945],
  gamma: 0.96,
  sat: 1.08,
  contrast: 1.1,
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
    hazeStrength: { value: 0.44 },
    hazeStart: { value: 0.26 }, // fraction of the far plane where haze begins
    cameraNear: { value: 0.1 },
    cameraFar: { value: 500 },
    vignette: { value: 0.35 },
    grain: { value: 0.035 },
    uTime: { value: 0 },
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

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 col = src.rgb;

      // depth haze: distance dissolves into mountain mist, so layered hills
      // read like a painted backdrop instead of a wall of detail
      float d = linearDepth(vUv);
      // the sky dome carries its own gradient: haze belongs to the land in
      // front of it, so it ramps in over the distance and lets go before
      // the dome's shell
      float haze = smoothstep(hazeStart, 0.72, d) * hazeStrength;
      haze *= 1.0 - smoothstep(0.76, 0.86, d);
      col = mix(col, hazeColor, haze);

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

    this.build();
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

    if (this.fx.grade) {
      this.grade.uniforms.hazeStrength.value = this.fx.haze ? 0.44 : 0;
      this.composer.addPass(this.grade);
    }
  }

  apply(cfg: Config) {
    this.fx = { bloom: cfg.bloom, grade: cfg.grade, haze: cfg.haze };
    this.build();
  }

  get effects(): { bloom: boolean; grade: boolean; haze: boolean } {
    return { ...this.fx };
  }

  // nothing on top of the scene render: main draws straight to the screen
  // and skips the composer's buffers entirely
  get bypass(): boolean {
    return !this.fx.bloom && !this.fx.grade;
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
  }

  setSize(w: number, h: number) {
    const pr = this.renderer.getPixelRatio();
    this.composer.setSize(w, h);
    this.depth.image.width = Math.floor(w * pr);
    this.depth.image.height = Math.floor(h * pr);
    this.depth.needsUpdate = true;
    this.bloom?.setSize(w, h);
    this.grade.uniforms.cameraNear.value = this.camera.near;
    this.grade.uniforms.cameraFar.value = this.camera.far;
  }

  render() {
    this.composer.render();
  }
}

