// cathedral - the painterly sky. a camera-following gradient dome, drifting
// cloud sprites, stars, and a slow day cycle with a long golden hour (the
// default and the identity shot). the sky owns the light script: each frame
// it publishes sun direction/colour/intensity, hemisphere light and fog
// colour, and main applies them. night stays deep blue and readable, never
// black, so the world's own lights carry it.

import * as THREE from "three";

const CYCLE_S = 1200; // one full day
const DOME_R = 460; // inside the camera's far plane, following the camera
const REDRAW_S = 0.3; // gradient repaint cadence (colours move glacially)

interface Key {
  t: number; // 0..1 through the day
  top: number; // zenith
  mid: number; // upper sky
  hor: number; // horizon band
  fog: number; // haze + below-horizon
  sun: number; // sun light colour
  sunI: number; // sun intensity
  sunE: number; // sun elevation (unit y component)
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  stars: number; // star opacity
  cloud: number; // cloud tint
  cloudA: number; // cloud opacity
  glow: number; // sun disc opacity
}

// the day, keyed. golden hour holds the start and the wrap, day is bright
// and soft, night is short and indigo. t=0 is where a fresh visitor lands.
const KEYS: Key[] = [
  { t: 0.00, top: 0x7d9bb8, mid: 0xc9b490, hor: 0xf2c98e, fog: 0xd8c4a4, sun: 0xffd9a0, sunI: 2.3, sunE: 0.34, hemiSky: 0xffe2b8, hemiGround: 0x74854e, hemiI: 0.85, stars: 0, cloud: 0xffe8c8, cloudA: 0.5, glow: 0.7 },
  { t: 0.16, top: 0x6f86ad, mid: 0xc8a184, hor: 0xf0b070, fog: 0xd2b394, sun: 0xffc888, sunI: 2.0, sunE: 0.24, hemiSky: 0xf6d0a8, hemiGround: 0x6a7a48, hemiI: 0.75, stars: 0, cloud: 0xffd9b0, cloudA: 0.5, glow: 0.65 },
  { t: 0.24, top: 0x3d4b74, mid: 0x8a6d88, hor: 0xe08a5a, fog: 0xa98a80, sun: 0xff9a58, sunI: 1.15, sunE: 0.14, hemiSky: 0xd8a888, hemiGround: 0x4c5560, hemiI: 0.5, stars: 0.25, cloud: 0x9a7d90, cloudA: 0.45, glow: 0.5 },
  { t: 0.32, top: 0x10142c, mid: 0x1b2340, hor: 0x2e3a58, fog: 0x252c44, sun: 0x9fb6d8, sunI: 0.42, sunE: 0.4, hemiSky: 0x39466a, hemiGround: 0x232a20, hemiI: 0.34, stars: 1, cloud: 0x2c3450, cloudA: 0.3, glow: 0 },
  { t: 0.44, top: 0x10142c, mid: 0x1b2340, hor: 0x2e3a58, fog: 0x252c44, sun: 0x9fb6d8, sunI: 0.42, sunE: 0.4, hemiSky: 0x39466a, hemiGround: 0x232a20, hemiI: 0.34, stars: 1, cloud: 0x2c3450, cloudA: 0.3, glow: 0 },
  { t: 0.54, top: 0x4a5d88, mid: 0xa87d84, hor: 0xf0a878, fog: 0xbf9f92, sun: 0xffb87a, sunI: 1.3, sunE: 0.2, hemiSky: 0xe8c0a0, hemiGround: 0x505c48, hemiI: 0.55, stars: 0.12, cloud: 0xe8b8a8, cloudA: 0.45, glow: 0.55 },
  { t: 0.64, top: 0x79a8d0, mid: 0x93b8d4, hor: 0xe8ddc0, fog: 0xdcdcc4, sun: 0xfff2d8, sunI: 2.5, sunE: 0.62, hemiSky: 0xdfeaf2, hemiGround: 0x7c8c58, hemiI: 0.95, stars: 0, cloud: 0xffffff, cloudA: 0.55, glow: 0.6 },
  { t: 0.82, top: 0x79a8d0, mid: 0x93b8d4, hor: 0xe8ddc0, fog: 0xdcdcc4, sun: 0xfff2d8, sunI: 2.5, sunE: 0.62, hemiSky: 0xdfeaf2, hemiGround: 0x7c8c58, hemiI: 0.95, stars: 0, cloud: 0xffffff, cloudA: 0.55, glow: 0.6 },
  { t: 0.92, top: 0x86a0bc, mid: 0xc2b49a, hor: 0xeecf9e, fog: 0xd8ccae, sun: 0xffe6b8, sunI: 2.4, sunE: 0.44, hemiSky: 0xf2dcc0, hemiGround: 0x788850, hemiI: 0.9, stars: 0, cloud: 0xfff0d8, cloudA: 0.55, glow: 0.65 },
  { t: 1.00, top: 0x7d9bb8, mid: 0xc9b490, hor: 0xf2c98e, fog: 0xd8c4a4, sun: 0xffd9a0, sunI: 2.3, sunE: 0.34, hemiSky: 0xffe2b8, hemiGround: 0x74854e, hemiI: 0.85, stars: 0, cloud: 0xffe8c8, cloudA: 0.5, glow: 0.7 },
];

// what main applies to its lights each frame
export interface SkyLight {
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fog: THREE.Color;
}

function splitHex(c: number): { r: number; g: number; b: number } {
  return { r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255 };
}
function lerpHex(a: number, b: number, t: number): { r: number; g: number; b: number } {
  const A = splitHex(a);
  const B = splitHex(b);
  return { r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t };
}
function css(c: { r: number; g: number; b: number }): string {
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
}
function setColor(out: THREE.Color, c: { r: number; g: number; b: number }) {
  out.setRGB(c.r / 255, c.g / 255, c.b / 255, THREE.SRGBColorSpace);
}

function cloudTexture(seed: number): THREE.CanvasTexture {
  const w = 128;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  let s = seed | 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
  const puffs = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < puffs; i++) {
    const px = w * (0.2 + rand() * 0.6);
    const py = h * (0.35 + rand() * 0.35);
    const pr = h * (0.22 + rand() * 0.24);
    const blob = g.createRadialGradient(px, py, pr * 0.1, px, py, pr);
    blob.addColorStop(0, "rgba(255,255,255,0.85)");
    blob.addColorStop(0.7, "rgba(255,255,255,0.32)");
    blob.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = blob;
    g.fillRect(0, 0, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Sky {
  readonly light: SkyLight = {
    sunDir: new THREE.Vector3(0, 0.34, -1),
    sunColor: new THREE.Color(),
    sunIntensity: 2.3,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 0.85,
    fog: new THREE.Color(),
  };

  private follow = new THREE.Group(); // dome + stars + sun glow, camera-centered
  private dome: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private glowSprite: THREE.Sprite;
  private glowMat: THREE.SpriteMaterial;
  private clouds = new THREE.Group();
  private cloudMats: THREE.SpriteMaterial[] = [];
  private azimuth: number;
  private phaseOffset = 0;
  private sinceDraw = Infinity;
  private lastHot = -1;

  constructor(scene: THREE.Scene, sunAzimuth: number) {
    this.azimuth = sunAzimuth;

    this.canvas = document.createElement("canvas");
    this.canvas.width = 256;
    this.canvas.height = 256;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.wrapS = THREE.RepeatWrapping;

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_R, 32, 24),
      new THREE.MeshBasicMaterial({ map: this.tex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    // texture u = 0.5 faces -z at rotation 0; aim the hot column at the sun
    this.dome.rotation.y = -sunAzimuth - Math.PI / 2;
    this.dome.renderOrder = -2;
    this.follow.add(this.dome);

    // stars: a fixed shell of points, faded in by the script at night
    const STAR_N = 650;
    const sp = new Float32Array(STAR_N * 3);
    for (let i = 0; i < STAR_N; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = 0.06 + Math.random() * 0.94;
      const r = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(a) * r * (DOME_R - 8);
      sp[i * 3 + 1] = y * (DOME_R - 8);
      sp[i * 3 + 2] = Math.sin(a) * r * (DOME_R - 8);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xdfe8ff,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -1;
    this.stars.frustumCulled = false;
    this.follow.add(this.stars);

    // the sun itself: a soft disc riding the light direction
    const gc = document.createElement("canvas");
    gc.width = 128;
    gc.height = 128;
    const gg = gc.getContext("2d") as CanvasRenderingContext2D;
    const grad = gg.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, "rgba(255, 244, 220, 1)");
    grad.addColorStop(0.18, "rgba(255, 226, 176, 0.9)");
    grad.addColorStop(0.5, "rgba(255, 200, 130, 0.28)");
    grad.addColorStop(1, "rgba(255, 190, 120, 0)");
    gg.fillStyle = grad;
    gg.fillRect(0, 0, 128, 128);
    const gt = new THREE.CanvasTexture(gc);
    gt.colorSpace = THREE.SRGBColorSpace;
    this.glowMat = new THREE.SpriteMaterial({
      map: gt,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.glowSprite = new THREE.Sprite(this.glowMat);
    this.glowSprite.scale.set(150, 150, 1);
    this.glowSprite.renderOrder = -1;
    this.follow.add(this.glowSprite);

    scene.add(this.follow);

    // clouds: a slow carousel of soft sprites, world-anchored for parallax
    const variants = [cloudTexture(11), cloudTexture(47), cloudTexture(93)];
    for (const v of variants) {
      this.cloudMats.push(
        new THREE.SpriteMaterial({ map: v, transparent: true, opacity: 0.5, depthWrite: false, fog: false })
      );
    }
    let cs = 0x51ed5;
    const crand = () => {
      cs = (Math.imul(cs, 1664525) + 1013904223) | 0;
      return ((cs >>> 0) % 10000) / 10000;
    };
    for (let i = 0; i < 16; i++) {
      const sprite = new THREE.Sprite(this.cloudMats[i % this.cloudMats.length]);
      const ang = crand() * Math.PI * 2;
      const rad = 190 + crand() * 70;
      sprite.position.set(Math.cos(ang) * rad, 120 + crand() * 70, Math.sin(ang) * rad);
      const w = 80 + crand() * 70;
      sprite.scale.set(w, w * (0.3 + crand() * 0.14), 1);
      this.clouds.add(sprite);
    }
    scene.add(this.clouds);

    this.applyPhase(0);
    this.redraw(0);
  }

  // where the day currently stands, 0..1 (0 = mid golden hour)
  phase01(t: number): number {
    return (t / CYCLE_S + this.phaseOffset) % 1;
  }
  // jump the day to a phase (captures, the panel)
  setPhase01(p: number, t: number) {
    this.phaseOffset = ((p - t / CYCLE_S) % 1 + 1) % 1;
    this.lastHot = -1; // force the repaint through the skip check
    this.applyPhase(this.phase01(t));
    this.redraw(this.phase01(t));
    this.sinceDraw = 0;
  }

  private blend(p: number): Key {
    let a = KEYS[0];
    let b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (p >= KEYS[i].t && p <= KEYS[i + 1].t) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
    const span = Math.max(1e-6, b.t - a.t);
    let u = (p - a.t) / span;
    u = u * u * (3 - 2 * u);
    const L = (x: number, y: number) => x + (y - x) * u;
    const H = (x: number, y: number) => lerpHex(x, y, u);
    const mixHex = (c: { r: number; g: number; b: number }) =>
      ((Math.round(c.r) << 16) | (Math.round(c.g) << 8) | Math.round(c.b)) >>> 0;
    return {
      t: p,
      top: mixHex(H(a.top, b.top)),
      mid: mixHex(H(a.mid, b.mid)),
      hor: mixHex(H(a.hor, b.hor)),
      fog: mixHex(H(a.fog, b.fog)),
      sun: mixHex(H(a.sun, b.sun)),
      sunI: L(a.sunI, b.sunI),
      sunE: L(a.sunE, b.sunE),
      hemiSky: mixHex(H(a.hemiSky, b.hemiSky)),
      hemiGround: mixHex(H(a.hemiGround, b.hemiGround)),
      hemiI: L(a.hemiI, b.hemiI),
      stars: L(a.stars, b.stars),
      cloud: mixHex(H(a.cloud, b.cloud)),
      cloudA: L(a.cloudA, b.cloudA),
      glow: L(a.glow, b.glow),
    };
  }

  private applyPhase(p: number) {
    const k = this.blend(p);
    const e = k.sunE;
    const c = Math.sqrt(Math.max(0.0001, 1 - e * e));
    this.light.sunDir.set(Math.cos(this.azimuth) * c, e, Math.sin(this.azimuth) * c);
    setColor(this.light.sunColor, splitHex(k.sun));
    this.light.sunIntensity = k.sunI;
    setColor(this.light.hemiSky, splitHex(k.hemiSky));
    setColor(this.light.hemiGround, splitHex(k.hemiGround));
    this.light.hemiIntensity = k.hemiI;
    setColor(this.light.fog, splitHex(k.fog));
    this.starMat.opacity = k.stars * 0.9;
    this.glowMat.opacity = k.glow;
    for (const m of this.cloudMats) {
      m.color.setHex(k.cloud);
      m.opacity = k.cloudA;
    }
    // the glow rides the sun direction at the dome's shell
    this.glowSprite.position.copy(this.light.sunDir).multiplyScalar(DOME_R - 30);
  }

  private redraw(p: number) {
    const k = this.blend(p);
    // skip repaints while nothing moved (long holds are most of the day)
    const sig = (k.top ^ (k.hor << 1) ^ (k.fog << 2)) >>> 0;
    if (sig === this.lastHot) return;
    this.lastHot = sig;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const g = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, css(splitHex(k.top)));
    grad.addColorStop(0.34, css(lerpHex(k.top, k.mid, 0.8)));
    grad.addColorStop(0.485, css(lerpHex(k.mid, k.hor, 0.9)));
    grad.addColorStop(0.56, css(lerpHex(k.hor, k.fog, 0.7)));
    grad.addColorStop(0.7, css(splitHex(k.fog)));
    grad.addColorStop(1.0, css(splitHex(k.fog)));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // the sky burns a little hotter around the sun
    if (k.glow > 0.01) {
      const cx = w / 2;
      const cy = h * (0.5 - k.sunE * 0.28);
      const blob = g.createRadialGradient(cx, cy, 6, cx, cy, w * 0.42);
      const sc = lerpHex(k.sun, 0xffffff, 0.2);
      blob.addColorStop(0, `rgba(${Math.round(sc.r)}, ${Math.round(sc.g)}, ${Math.round(sc.b)}, ${0.5 * k.glow})`);
      blob.addColorStop(0.5, `rgba(${Math.round(sc.r)}, ${Math.round(sc.g)}, ${Math.round(sc.b)}, ${0.18 * k.glow})`);
      blob.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.globalCompositeOperation = "lighter";
      g.fillStyle = blob;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "source-over";
    }
    this.tex.needsUpdate = true;
  }

  update(dt: number, t: number, camPos: THREE.Vector3) {
    const p = this.phase01(t);
    this.applyPhase(p);
    this.follow.position.copy(camPos);
    this.clouds.rotation.y += dt * 0.0016;
    this.sinceDraw += dt;
    if (this.sinceDraw >= REDRAW_S) {
      this.sinceDraw = 0;
      this.redraw(p);
    }
  }
}
