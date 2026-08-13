// cathedral - value glyphs: the market's numbers made briefly visible in
// the air. when a buy's stone lands, its dollar value floats up from the
// impact in spirit green; when a dump bites the mass, the outflow rises
// in ember from the wound. pooled canvas sprites in the hud's own
// terminal face, so the world's one ui voice speaks in the world too.

import * as THREE from "three";
import { GRID } from "./config";

const POOL = 24;
const LIFE_S = 2.8;
const RISE_U = 2.6; // world units a glyph floats up over its life

interface Slot {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  age: number; // >= LIFE_S = free
  baseY: number;
}

export class Glyphs {
  private slots: Slot[] = [];
  private cursor = 0;
  // a capture plate is a photograph of the WORLD, and a floating "+$40" is
  // the market talking over it. off, the sprites stop spawning and the ones
  // already in the air are cleared, so a screenshot taken a frame later is
  // clean rather than clean-in-a-few-seconds.
  enabled = true;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < POOL; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(3.6, 0.9, 1);
      sprite.visible = false;
      scene.add(sprite);
      this.slots.push({ sprite, mat, canvas, tex, age: LIFE_S, baseY: 0 });
    }
  }

  // cell coordinates in, floating text out
  spawn(cx: number, cy: number, cz: number, text: string, rise: boolean) {
    if (!this.enabled) return;
    const s = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % POOL;
    const g = s.canvas.getContext("2d") as CanvasRenderingContext2D;
    g.clearRect(0, 0, 256, 64);
    g.font = "44px 'VT323', monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const color = rise ? "#a8e6a0" : "#ff7a4e";
    g.shadowColor = color;
    g.shadowBlur = 14;
    g.fillStyle = color;
    g.fillText(text, 128, 34);
    s.tex.needsUpdate = true;
    s.baseY = cy + 1.4;
    s.sprite.position.set(cx - GRID / 2 + 0.5, s.baseY, cz - GRID / 2 + 0.5);
    s.sprite.visible = true;
    s.age = 0;
  }

  // take every sprite out of the air at once
  clear() {
    for (const s of this.slots) {
      s.age = LIFE_S;
      s.mat.opacity = 0;
      s.sprite.visible = false;
    }
  }

  update(dt: number) {
    for (const s of this.slots) {
      if (s.age >= LIFE_S) continue;
      s.age += dt;
      const t01 = Math.min(1, s.age / LIFE_S);
      s.sprite.position.y = s.baseY + t01 * RISE_U;
      s.mat.opacity = t01 < 0.12 ? t01 / 0.12 : 1 - (t01 - 0.12) / 0.88;
      if (t01 >= 1) s.sprite.visible = false;
    }
  }
}
