// kodo - the crew, drawn. they were two coloured boxes each: a body
// and a head, in the role's colour, with a name floating over them. at
// distance that reads as a coloured pillar, and a pillar is not a person —
// the world had four agents in it and no inhabitants.
//
// these are pixel-art figures, drawn here rather than loaded: a small
// palette-indexed grid per role and per pose, painted into a canvas and used
// as a texture. drawing them in code means a successor can be a VARIATION
// rather than a second asset — a different robe, a different hat, the same
// person's job — and it means the palette lock still holds, because every
// colour comes out of the same swatch table as the world.
//
// they are billboarded on the Y axis only. a full billboard turns the plane
// to face the camera in every axis, which tips the figure as the camera
// rises and throws a shadow that lies down with it; turning only about the
// vertical keeps them standing on the ground they are standing on.

import * as THREE from "three";
import { SWATCH } from "./palette";

export type Role = "surveyor" | "architect" | "mason" | "keeper";
export type Pose = "idle" | "walkA" | "walkB" | "work" | "workB";

const W = 16; // the grid a figure is drawn on
const H = 24;
const PX = 6; // canvas pixels per figure pixel
// HALF AS TALL AGAIN. at 1.8 blocks the crew were easy to lose entirely;
// at 2.7 against a four-block storey they are present without being
// giants, and the label rides higher to match.
export const SPRITE_ROW = 0.1125;

// the ink. lower case keys so a row of pixels reads as a row of pixels.
// '.' is air; everything else indexes this table.
type Ink = Record<string, string>;

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

// A ROBE, A HOOD, A TOOL. the four are meant to be told apart in silhouette
// at fifty blocks, so each one has a different overall shape before it has a
// different colour: the surveyor is upright with a tall staff, the mason is
// stooped under a hod, the keeper carries a lantern out to one side, the
// architect holds a scroll across the body.
//
// every figure is drawn once, facing forward. these are original designs and
// deliberately generic monastics — a hood, a robe, a tool, no marks.
// workB exists only where a role has a second stroke of work (the mason);
// everyone else falls back to their single work pose
const FIGURES: Record<Role, Partial<Record<Pose, string[]>>> = {
  surveyor: {
    idle: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "....t.rrrr......", "....t.rrrrr.....",
      "...ttt.rrrr.....", "....t.rrrrrr....", "....t.rrrrr.....", "....t..rrrr.....",
      "....t..rrrr.....", "....t..rrrr.....", "....t..rrrrr....", "....t...rrrr....",
      "....t...rrrr....", "....t...rrrr....", "....t...rrrr....", "....t..rrrrr....",
      ".......rr.rr....", ".......bb.bb....", "................", "................",
    ],
    walkA: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "....t.rrrr......", "....t.rrrrr.....",
      "...ttt.rrrr.....", "....t.rrrrrr....", "....t.rrrrr.....", "....t..rrrr.....",
      "....t..rrrr.....", "....t..rrrr.....", "....t..rrrrr....", "....t...rrrr....",
      "....t...rrrr....", "....t..rrrrr....", "....t..rrr.rr...", "....t.rrr...r...",
      "......rr....r...", "......bb....b...", "................", "................",
    ],
    walkB: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "....t.rrrr......", "....t.rrrrr.....",
      "...ttt.rrrr.....", "....t.rrrrrr....", "....t.rrrrr.....", "....t..rrrr.....",
      "....t..rrrr.....", "....t..rrrr.....", "....t..rrrrr....", "....t...rrrr....",
      "....t...rrrr....", "....t..rrrrr....", "....t..rr.rrr...", "....t..r...rrr..",
      ".......r.....r..", ".......b.....b..", "................", "................",
    ],
    work: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "..ttttrrrr......", "....t.rrrrr.....",
      "....t.rrrr......", "......rrrrrr....", "......rrrrr.....", ".......rrrr.....",
      ".......rrrr.....", ".......rrrr.....", ".......rrrrr....", "........rrrr....",
      "........rrrr....", "........rrrr....", "........rrrr....", ".......rrrrr....",
      ".......rr.rr....", ".......bb.bb....", "................", "................",
    ],
  },
  architect: {
    idle: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "......rrrr......", ".....rrrrrr.....",
      "....rrrrrrrr....", "....rr.wwww.r...", "....r..wwww..r..", "....r..wwww..r..",
      ".....r.wwww.r...", ".....rrrrrrr....", ".....rrrrrr.....", ".....rrrrrr.....",
      "......rrrrr.....", "......rrrrr.....", "......rrrrr.....", "......rrrrr.....",
      "......rr.rr.....", "......bb.bb.....", "................", "................",
    ],
    walkA: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "......rrrr......", ".....rrrrrr.....",
      "....rrrrrrrr....", "....rr.wwww.r...", "....r..wwww..r..", "....r..wwww..r..",
      ".....r.wwww.r...", ".....rrrrrrr....", ".....rrrrrr.....", ".....rrrrrr.....",
      "......rrrrr.....", "......rrrrr.....", ".....rrr.rr.....", "....rrr...r.....",
      "....rr....r.....", "....bb....b.....", "................", "................",
    ],
    walkB: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "......rrrr......", ".....rrrrrr.....",
      "....rrrrrrrr....", "....rr.wwww.r...", "....r..wwww..r..", "....r..wwww..r..",
      ".....r.wwww.r...", ".....rrrrrrr....", ".....rrrrrr.....", ".....rrrrrr.....",
      "......rrrrr.....", "......rrrrr.....", "......rr.rrr....", "......r...rrr...",
      "......r.....r...", "......b.....b...", "................", "................",
    ],
    work: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "......rrrr......", ".....rrrrrr.....",
      "...wwwwwwwwww...", "...wwwwwwwwww...", "....rrrrrrrr....", ".....rrrrrr.....",
      ".....rrrrrr.....", ".....rrrrrr.....", ".....rrrrrr.....", "......rrrrr.....",
      "......rrrrr.....", "......rrrrr.....", "......rrrrr.....", "......rrrrr.....",
      "......rr.rr.....", "......bb.bb.....", "................", "................",
    ],
  },
  mason: {
    idle: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "....kkkkkk......", "....kkkkkk......",
      "....rrrrrrr.....", "...rrrrrrrr.....", "...rrrrrrr......", "....rrrrrr......",
      "....rrrrrr......", "....rrrrrr......", "....rrrrrrr.....", ".....rrrrrr.....",
      ".....rrrrrr.....", ".....rrrrrr.....", ".....rrrrrr.....", ".....rrrrrr.....",
      ".....rr.rrr.....", ".....bb.bbb.....", "................", "................",
    ],
    walkA: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "....kkkkkk......", "....kkkkkk......",
      "....rrrrrrr.....", "...rrrrrrrr.....", "...rrrrrrr......", "....rrrrrr......",
      "....rrrrrr......", "....rrrrrr......", "....rrrrrrr.....", ".....rrrrrr.....",
      ".....rrrrrr.....", "....rrrr.rr.....", "...rrr....r.....", "...rr.....r.....",
      "...rr.....r.....", "...bb.....b.....", "................", "................",
    ],
    walkB: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "....kkkkkk......", "....kkkkkk......",
      "....rrrrrrr.....", "...rrrrrrrr.....", "...rrrrrrr......", "....rrrrrr......",
      "....rrrrrr......", "....rrrrrr......", "....rrrrrrr.....", ".....rrrrrr.....",
      ".....rrrrrr.....", ".....rr.rrrr....", ".....r....rrr...", ".....r......r...",
      ".....r......r...", ".....b......b...", "................", "................",
    ],
    // the mason at the face: stooped, both arms out, a stone in hand
    work: [
      "................", "................", "......ssss......", ".....shhhhs.....",
      ".....hffffh.....", ".....hffffh.....", "......hhhh......", "....kkkkkkk.....",
      "....kkkkkkk.....", "...rrrrrrrrr....", "..rrrrrrrrrrgg..", "..rrrrrrrrrrgg..",
      "...rrrrrrrr.....", "....rrrrrr......", "....rrrrrr......", "....rrrrrr......",
      "....rrrrrrr.....", ".....rrrrrr.....", ".....rrrrrr.....", ".....rrrrrr.....",
      ".....rr.rrr.....", ".....bb.bbb.....", "................", "................",
    ],
    // and the beat after: the stone set, arms drawn back to the hod — the
    // two frames alternate as each stone lands, so the laying reads as
    // strokes of work rather than one held pose
    workB: [
      "................", "................", "......ssss......", ".....shhhhs.....",
      ".....hffffh.....", ".....hffffh.....", "......hhhh......", "....kkkkkkk.....",
      "....kkkkkkk.....", "...rrrrrrrr.....", "...rrrrrrrrr....", "...rrrrrrrr.....",
      "....rrrrrrrr....", "....rrrrrr......", "....rrrrrr......", "....rrrrrr......",
      "....rrrrrrr.....", ".....rrrrrr.....", ".....rrrrrr.....", ".....rrrrrr.....",
      ".....rr.rrr.....", ".....bb.bbb.....", "................", "................",
    ],
  },
  keeper: {
    idle: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "......rrrr..ll..", ".....rrrrrr.ll..",
      "....rrrrrrrrll..", "....rrrrrrr.ll..", "....rrrrrr..ll..", "....rrrrrr......",
      "....rrrrrr......", "....rrrrrr......", "....rrrrrrr.....", ".....rrrrrr.....",
      ".....rrrrrr.....", ".....rrrrrr.....", ".....rrrrrr.....", ".....rrrrrr.....",
      ".....rr.rrr.....", ".....bb.bbb.....", "................", "................",
    ],
    walkA: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "......rrrr..ll..", ".....rrrrrr.ll..",
      "....rrrrrrrrll..", "....rrrrrrr.ll..", "....rrrrrr..ll..", "....rrrrrr......",
      "....rrrrrr......", "....rrrrrr......", "....rrrrrrr.....", ".....rrrrrr.....",
      ".....rrrrrr.....", "....rrrr.rr.....", "...rrr....r.....", "...rr.....r.....",
      "...rr.....r.....", "...bb.....b.....", "................", "................",
    ],
    walkB: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "......rrrr..ll..", ".....rrrrrr.ll..",
      "....rrrrrrrrll..", "....rrrrrrr.ll..", "....rrrrrr..ll..", "....rrrrrr......",
      "....rrrrrr......", "....rrrrrr......", "....rrrrrrr.....", ".....rrrrrr.....",
      ".....rrrrrr.....", ".....rr.rrrr....", ".....r....rrr...", ".....r......r...",
      ".....r......r...", ".....b......b...", "................", "................",
    ],
    work: [
      "................", "......ssss......", ".....shhhhs.....", ".....hffffh.....",
      ".....hffffh.....", "......hhhh......", "...ll.rrrr..ll..", "...ll rrrrr.ll..",
      "...llrrrrrrrll..", "....rrrrrrr.ll..", "....rrrrrr..ll..", "....rrrrrr......",
      "....rrrrrr......", "....rrrrrr......", "....rrrrrrr.....", ".....rrrrrr.....",
      ".....rrrrrr.....", ".....rrrrrr.....", ".....rrrrrr.....", ".....rrrrrr.....",
      ".....rr.rrr.....", ".....bb.bbb.....", "................", "................",
    ],
  },
};

// the base ink per role. r is the robe, s the hood's crown, h the hood, f the
// face in shadow under it, b the feet, t/k/l/w/g the role's own tool.
function inkFor(role: Role, seed: number): Ink {
  // A SUCCESSOR IS A VARIATION, NOT A REPAINT. the same job, a different
  // person: the robe shifts hue a little, the hood may be the darker or the
  // lighter of the pair, and the trim changes. enough that an arrival is
  // visibly new, not so much that the role stops reading.
  const jitter = (base: number, amt: number) => {
    const c = new THREE.Color(base);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const r1 = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const r2 = ((Math.sin(seed * 78.233) * 43758.5453) % 1 + 1) % 1;
    c.setHSL((hsl.h + (r1 - 0.5) * amt + 1) % 1, hsl.s * (0.8 + r2 * 0.4), hsl.l * (0.86 + r1 * 0.28));
    return `#${c.getHexString()}`;
  };
  const robe = {
    surveyor: SWATCH.creamWarm,
    architect: SWATCH.teal,
    mason: SWATCH.timberMid,
    keeper: SWATCH.vermilion,
  }[role];
  return {
    r: jitter(robe, 0.06),
    s: jitter(robe, 0.06),
    h: hex(SWATCH.timberDark),
    f: hex(SWATCH.earth),
    b: hex(SWATCH.timberDark),
    t: hex(SWATCH.timberMid), // the surveyor's staff
    k: hex(SWATCH.stoneGrey), // the mason's hod
    l: hex(SWATCH.lantern), // the keeper's lantern
    w: hex(SWATCH.plasterBone), // the architect's scroll
    g: hex(SWATCH.stoneGrey), // a stone in the hand
  };
}

function paint(rows: string[], ink: Ink): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = W * PX;
  cv.height = H * PX;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < Math.min(H, rows.length); y++) {
    const row = rows[y];
    for (let x = 0; x < Math.min(W, row.length); x++) {
      const ch = row[x];
      const col = ink[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x * PX, y * PX, PX, PX);
    }
  }
  return cv;
}

export class CrewSprite {
  readonly mesh: THREE.Mesh;
  private mats: Record<Pose, THREE.MeshLambertMaterial>;
  private pose: Pose = "idle";
  private phase = 0;
  private tt: number;
  private leanX = 0;
  private leanZ = 0;
  // incremented by the owner as each stone lands: the work pose alternates
  // on the stones themselves, not on the clock
  workTick = 0;

  constructor(role: Role, seed: number) {
    const ink = inkFor(role, seed);
    this.tt = seed * 1.7;
    const mk = (p: Pose) => {
      const rows = FIGURES[role][p] ?? FIGURES[role].work!;
      const tex = new THREE.CanvasTexture(paint(rows, ink));
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      // alphaTest rather than transparent: a transparent material does not
      // write depth and does not cast a shadow, and a figure that throws no
      // shadow floats above the ground however well it is drawn
      return new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    };
    this.mats = {
      idle: mk("idle"), walkA: mk("walkA"), walkB: mk("walkB"),
      work: mk("work"), workB: mk("workB"),
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(W * SPRITE_ROW, H * SPRITE_ROW), this.mats.idle);
    this.mesh.position.y = H * SPRITE_ROW * 0.5;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
  }

  // the walker's velocity, for the lean into travel
  setLean(vx: number, vz: number) {
    this.leanX = vx;
    this.leanZ = vz;
  }

  // pose and the two-frame walk. the cycle is driven by distance covered
  // rather than by the clock, so a figure's feet match its speed.
  update(dt: number, moving: boolean, working: boolean, camera: THREE.Camera) {
    this.tt += dt;
    if (working && !moving) this.pose = this.workTick % 2 === 0 ? "work" : "workB";
    else if (!moving) this.pose = "idle";
    else {
      this.phase += dt * 5.2;
      this.pose = Math.floor(this.phase) % 2 === 0 ? "walkA" : "walkB";
    }
    const want = this.mats[this.pose];
    if (this.mesh.material !== want) this.mesh.material = want;

    // Y-AXIS BILLBOARD ONLY. facing the camera in every axis tips the
    // figure as the camera rises and lays its shadow down with it; turning
    // about the vertical keeps it standing on the ground it stands on.
    const p = this.mesh.getWorldPosition(_v);
    const ry = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    this.mesh.rotation.y = ry;

    // NOTHING IS EVER PERFECTLY STILL: a breath in the shoulders always,
    // and a lean into the direction of travel — projected onto the
    // billboard's own axis so the tilt reads from wherever the camera is
    this.mesh.scale.y = 1 + Math.sin(this.tt * 1.8) * (moving ? 0.006 : 0.014);
    const side = this.leanX * Math.cos(ry) - this.leanZ * Math.sin(ry);
    const sway = moving ? 0 : Math.sin(this.tt * 0.7) * 0.015;
    this.mesh.rotation.z = -side * 0.09 + sway;
  }
}

const _v = new THREE.Vector3();
