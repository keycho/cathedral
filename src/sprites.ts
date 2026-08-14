// cathedral - the crew, drawn. they were two coloured boxes each: a body
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
export type Pose = "idle" | "walkA" | "walkB" | "work";

const W = 16; // the grid a figure is drawn on
const H = 24;
const PX = 6; // canvas pixels per figure pixel

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
const FIGURES: Record<Role, Record<Pose, string[]>> = {
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

  constructor(role: Role, seed: number) {
    const ink = inkFor(role, seed);
    const mk = (p: Pose) => {
      const tex = new THREE.CanvasTexture(paint(FIGURES[role][p], ink));
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      // alphaTest rather than transparent: a transparent material does not
      // write depth and does not cast a shadow, and a figure that throws no
      // shadow floats above the ground however well it is drawn
      return new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    };
    this.mats = { idle: mk("idle"), walkA: mk("walkA"), walkB: mk("walkB"), work: mk("work") };
    // 24 rows tall at 0.075 a row is 1.8 blocks: a person against a 4 block
    // storey, which is the proportion the buildings were drawn to
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.075, H * 0.075), this.mats.idle);
    this.mesh.position.y = H * 0.075 * 0.5;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
  }

  // pose and the two-frame walk. the cycle is driven by distance covered
  // rather than by the clock, so a figure's feet match its speed.
  update(dt: number, moving: boolean, working: boolean, camera: THREE.Camera) {
    if (working && !moving) this.pose = "work";
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
    this.mesh.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
  }
}

const _v = new THREE.Vector3();
