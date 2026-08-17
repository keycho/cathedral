// cathedral - the crew's foundations: embodied avatars with vt323 name
// floats, pathfinding over the real column geometry, the three territory
// wedges with their border posts, and the registry of every block the crew
// has laid (which is also what a dump can damage and the mason repairs).

import * as THREE from "three";
import { GRID, MAXY } from "./config";
import { CREAM, SWATCH } from "./palette";
import type { Strata } from "./strata";
import { CrewSprite, SPRITE_ROW, type Role } from "./sprites";
import type { VoxelField } from "./voxels";

export type AgentName = "surveyor" | "architect" | "mason" | "keeper";
export const AGENT_WALLET = -3; // provenance wallet id for all crew work

export const AGENT_COLORS: Record<AgentName, number> = {
  surveyor: SWATCH.crewSurveyor,
  architect: SWATCH.crewArchitect,
  mason: SWATCH.crewMason,
  keeper: SWATCH.lantern, // the one who carries the light
};

// territory wedges around the founding stone (see style.md). angles from
// atan2(dz, dx) in (-pi, pi].
export type ZoneName = "surveyor" | "architect" | "mason";

// the keeper holds no wedge: it walks all three
export function zoneOf(x: number, z: number): ZoneName {
  const a = Math.atan2(z - GRID / 2, x - GRID / 2);
  if (a >= -Math.PI / 3 && a < Math.PI / 3) return "architect";
  if (a >= Math.PI / 3 && a < Math.PI) return "mason";
  return "surveyor";
}

// ---- avatars ---------------------------------------------------------------

const WALK_SPEED = 2.3;

interface NameSprite extends THREE.Sprite {
  setName?: (n: string) => void;
}

function makeNameSprite(name: string, colorHex: number): NameSprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const draw = () => {
    const g = canvas.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, 256, 64);
    g.font = "40px VT323, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const c = new THREE.Color(colorHex);
    g.fillStyle = `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
    g.fillText(current, 128, 34);
    tex.needsUpdate = true;
  };
  let current = name;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.92 })
  );
  sprite.scale.set(2.6, 0.65, 1);
  (sprite as NameSprite).setName = (n: string) => {
    current = n;
    draw();
  };
  draw();
  // vt323 may land after first paint; redraw once fonts settle
  document.fonts?.ready.then(draw).catch(() => undefined);
  return sprite;
}

// each agent's presence light: the keeper carries the warmest flame, the
// architect the coolest — findable and TELLABLE from orbit by temperature
const GLOW_TINT: Record<AgentName, number> = {
  keeper: 0xffa050,
  mason: 0xe8b070,
  surveyor: 0xf0d8a8,
  architect: 0x8fd0cc,
};

// a soft radial disc, drawn once and shared by every glow and shadow
let _radialTex: THREE.CanvasTexture | null = null;
function radialTex(): THREE.CanvasTexture {
  if (_radialTex) return _radialTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _radialTex = new THREE.CanvasTexture(cv);
  return _radialTex;
}

export class Avatar {
  readonly group = new THREE.Group();
  private sprite: CrewSprite;
  private label: NameSprite;
  private working = false;
  private shadowMat: THREE.MeshBasicMaterial;
  private motes: THREE.Points;
  private motePos: Float32Array;
  private moteN = 0;
  private moteTimer = 0;
  private halfH: number;

  // THE CREW WERE TWO BOXES EACH. a body and a head in the role's colour,
  // which at any distance reads as a coloured pillar — the world had four
  // agents in it and no inhabitants. they are drawn figures now: a robe, a
  // hood, and the tool of the job, told apart in silhouette before they are
  // told apart by colour.
  constructor(name: string, role: AgentName = "mason", seed = 0) {
    const color = AGENT_COLORS[role];
    this.sprite = new CrewSprite(role as Role, seed);
    this.halfH = 24 * SPRITE_ROW * 0.5;
    this.label = makeNameSprite(name, color);
    this.label.position.y = this.halfH * 2 + 0.25;
    this.group.add(this.sprite.mesh, this.label);

    // a soft shadow that tracks the feet: a figure that throws no ground
    // contact floats however well it is drawn
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: radialTex(),
      color: 0x000000,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    shadow.renderOrder = 1;
    this.group.add(shadow);

    // the presence glow: an additive halo plus a small real light, so the
    // eye can find every crew member from orbit by their temperature
    const tint = GLOW_TINT[role];
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTex(),
        color: tint,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.set(2.6, 2.6, 1);
    halo.position.y = this.halfH;
    this.group.add(halo);
    const lamp = new THREE.PointLight(tint, 0.5, 7, 1.8);
    lamp.position.y = this.halfH + 0.4;
    this.group.add(lamp);

    // walking motes: a short trail of warm dust kicked up behind the glide
    this.motePos = new Float32Array(6 * 3);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute("position", new THREE.BufferAttribute(this.motePos, 3));
    this.motes = new THREE.Points(
      mg,
      new THREE.PointsMaterial({
        map: radialTex(),
        color: tint,
        size: 0.22,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.motes.frustumCulled = false;
    this.motes.visible = false;
    this.group.add(this.motes);
  }

  // the mason is the only one with a working pose, and only it knows when
  setWorking(on: boolean) {
    this.working = on;
  }

  // a stone landed: flip the work frame, so the laying reads as strokes
  pulseWork() {
    this.sprite.workTick++;
  }

  // the walker's velocity, handed to the sprite for its lean
  setLean(vx: number, vz: number) {
    this.sprite.setLean(vx, vz);
  }

  // billboarding needs the camera, which the body does not have: main hands
  // it down once a frame
  face(dt: number, moving: boolean, camera: THREE.Camera) {
    this.sprite.update(dt, moving, this.working, camera);
  }

  // a capture plate is a photograph of the world, and a name tag floating
  // over a mason's head is the interface talking over it. the crew stay in
  // frame — they belong there — but they stop introducing themselves.
  showLabel(on: boolean) {
    this.label.visible = on;
  }

  // a successor inherits the role and the colour, never the name
  setName(n: string) {
    this.label.setName?.(n);
  }

  // the bob stays, gently: a drawn figure with a two frame walk still wants
  // a little vertical or it slides rather than steps. the shadow answers
  // it — a touch fainter at the top of the glide — and the motes trail
  // only while there is a walk to trail behind.
  bob(t: number, moving: boolean) {
    const amp = moving ? 0.07 : 0.015;
    const rate = moving ? 9 : 1.6;
    const lift = Math.abs(Math.sin(t * rate)) * amp;
    this.sprite.mesh.position.y = this.halfH + lift;
    this.shadowMat.opacity = 0.34 - lift * 1.2;

    this.moteTimer += 1 / 60;
    if (moving && this.moteTimer > 0.13) {
      this.moteTimer = 0;
      const i = (this.moteN++ % 6) * 3;
      this.motePos[i] = (Math.sin(t * 13.7) - 0.5) * 0.3;
      this.motePos[i + 1] = 0.15 + Math.abs(Math.sin(t * 7.3)) * 0.25;
      this.motePos[i + 2] = (Math.cos(t * 11.3) - 0.5) * 0.3;
      this.motes.geometry.getAttribute("position").needsUpdate = true;
      this.motes.visible = true;
    }
    if (!moving) this.motes.visible = false;
  }
}

// ---- pathfinding over columns ---------------------------------------------

const STEP_UP = 1.05;
const DROP_MAX = 3;
const EXPAND_CAP = 5000;

// a* on column tops, 4-neighbour. returns cell waypoints or null.
export function pathfind(
  field: VoxelField,
  sx: number,
  sz: number,
  tx: number,
  tz: number
): { x: number; z: number }[] | null {
  if (sx === tx && sz === tz) return [];
  const key = (x: number, z: number) => x * GRID + z;
  const open: { x: number; z: number; g: number; f: number }[] = [];
  const gScore = new Map<number, number>();
  const from = new Map<number, number>();
  const h = (x: number, z: number) => Math.abs(x - tx) + Math.abs(z - tz);
  open.push({ x: sx, z: sz, g: 0, f: h(sx, sz) });
  gScore.set(key(sx, sz), 0);
  let expanded = 0;

  while (open.length && expanded < EXPAND_CAP) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    expanded++;
    if (cur.x === tx && cur.z === tz) {
      const path: { x: number; z: number }[] = [];
      let k = key(tx, tz);
      let px = tx;
      let pz = tz;
      while (!(px === sx && pz === sz)) {
        path.push({ x: px, z: pz });
        const pk = from.get(k);
        if (pk === undefined) break;
        px = Math.floor(pk / GRID);
        pz = pk % GRID;
        k = pk;
      }
      return path.reverse();
    }
    const curTop = field.topAt(cur.x, cur.z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cur.x + dx;
      const nz = cur.z + dz;
      if (nx < 4 || nx >= GRID - 4 || nz < 4 || nz >= GRID - 4) continue;
      const nTop = field.topAt(nx, nz);
      const dh = nTop - curTop;
      if (dh > STEP_UP || dh < -DROP_MAX) continue;
      if (nTop >= MAXY - 3) continue;
      const g = cur.g + 1 + Math.abs(dh) * 1.4;
      const nk = key(nx, nz);
      if (g < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, g);
        from.set(nk, key(cur.x, cur.z));
        open.push({ x: nx, z: nz, g, f: g + h(nx, nz) });
      }
    }
  }
  return null;
}

// ---- an embodied agent -----------------------------------------------------

export class AgentBody {
  readonly avatar: Avatar;
  // world-space position (feet)
  x: number;
  y: number;
  z: number;
  private path: { x: number; z: number }[] = [];

  constructor(readonly name: AgentName, private field: VoxelField, cellX: number, cellZ: number, scene: THREE.Scene, personName?: string) {
    this.avatar = new Avatar(personName ?? name, name);
    this.x = cellX - GRID / 2 + 0.5;
    this.z = cellZ - GRID / 2 + 0.5;
    this.y = field.surfaceBelow(this.x, this.z, 60);
    scene.add(this.avatar.group);
  }

  // the person walking the role today
  setPersonName(n: string) {
    this.avatar.setName(n);
  }

  get cellX(): number {
    return Math.floor(this.x + GRID / 2);
  }
  get cellZ(): number {
    return Math.floor(this.z + GRID / 2);
  }
  get moving(): boolean {
    return this.path.length > 0;
  }

  // returns false if no route exists over the current geometry
  walkTo(cellX: number, cellZ: number): boolean {
    const p = pathfind(this.field, this.cellX, this.cellZ, cellX, cellZ);
    if (!p) return false;
    this.path = p;
    return true;
  }
  halt() {
    this.path.length = 0;
  }

  update(dt: number, t: number, camera?: THREE.Camera) {
    if (this.path.length) {
      const next = this.path[0];
      const wx = next.x - GRID / 2 + 0.5;
      const wz = next.z - GRID / 2 + 0.5;
      const dx = wx - this.x;
      const dz = wz - this.z;
      const d = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      if (d <= step) {
        this.x = wx;
        this.z = wz;
        this.path.shift();
      } else {
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
        // NOT THE GROUP. a drawn figure has no facing to turn — it is
        // always looking at the camera — and rotating its parent turns the
        // billboard off its own axis, so the crew walked sideways into the
        // view. the walk direction becomes a LEAN instead of a rotation.
        this.avatar.setLean(dx / d, dz / d);
      }
      const floor = this.field.surfaceBelow(this.x, this.z, this.y + 2.5);
      this.y += (floor - this.y) * Math.min(1, dt * 12);
    }
    if (!this.moving) this.avatar.setLean(0, 0);
    this.avatar.group.position.set(this.x, this.y, this.z);
    this.avatar.bob(t, this.moving);
    if (camera) this.avatar.face(dt, this.moving, camera);
  }
}

// ---- the crew's works ------------------------------------------------------

export interface CrewBlock {
  material: number;
  planId: string;
  title: string; // the work it belongs to (plaques name it)
  zone: AgentName;
}

export class CrewWorks {
  readonly blocks = new Map<number, CrewBlock>();
  private cellList: number[] = [];
  private cellPos = new Map<number, number>();
  private lanterns: THREE.PointLight[] = [];
  private lanternCellList: { x: number; z: number }[] = [];
  private lanternDim = 1;

  constructor(private scene: THREE.Scene, private field: VoxelField, private strata: Strata) {}

  private idx(x: number, y: number, z: number): number {
    return (x * GRID + z) * MAXY + y;
  }

  add(x: number, y: number, z: number, material: number, planId: string, title: string, zone: AgentName) {
    const i = this.idx(x, y, z);
    this.blocks.set(i, { material, planId, title, zone });
    this.cellPos.set(i, this.cellList.length);
    this.cellList.push(i);
  }

  at(x: number, y: number, z: number): CrewBlock | undefined {
    return this.blocks.get(this.idx(x, y, z));
  }

  remove(x: number, y: number, z: number): CrewBlock | undefined {
    const i = this.idx(x, y, z);
    const b = this.blocks.get(i);
    if (!b) return undefined;
    this.blocks.delete(i);
    const pos = this.cellPos.get(i);
    if (pos !== undefined) {
      const last = this.cellList[this.cellList.length - 1];
      this.cellList[pos] = last;
      this.cellPos.set(last, pos);
      this.cellList.pop();
      this.cellPos.delete(i);
    }
    return b;
  }

  isCrewCell(x: number, y: number, z: number): boolean {
    return this.blocks.has(this.idx(x, y, z));
  }
  get count(): number {
    return this.cellList.length;
  }
  // a random crew cell (erosion's dump damage samples this)
  sample(): number | undefined {
    if (!this.cellList.length) return undefined;
    return this.cellList[Math.floor(Math.random() * this.cellList.length)];
  }

  // lantern blocks carry their own light (pooled)
  // the keeper walks these: every lamp the crew has set, as cells
  lanternCells(): { x: number; z: number }[] {
    return this.lanternCellList;
  }

  // the crew's lamps burn low while a marker stands: the world's version
  // of flags at half mast
  dimLanterns(k: number) {
    this.lanternDim = k;
    for (const l of this.lanterns) l.intensity = 3.0 * k;
  }

  addLantern(x: number, y: number, z: number) {
    this.lanternCellList.push({ x, z });
    if (this.lanternCellList.length > 24) this.lanternCellList.shift();
    const l = new THREE.PointLight(SWATCH.lantern, 3.0 * this.lanternDim, 10, 1.8);
    l.position.set(x - GRID / 2 + 0.5, y + 1.1, z - GRID / 2 + 0.5);
    this.scene.add(l);
    this.lanterns.push(l);
    if (this.lanterns.length > 12) {
      const old = this.lanterns.shift();
      if (old) this.scene.remove(old);
    }
  }

  // territory border posts: dressed stones along the three wedge lines
  placeBorders(genesisCell: { x: number; z: number }) {
    for (const ang of [-Math.PI / 3, Math.PI / 3, Math.PI]) {
      for (let r = 12; r <= 30; r += 6) {
        const x = Math.round(genesisCell.x + Math.cos(ang) * r);
        const z = Math.round(genesisCell.z + Math.sin(ang) * r);
        if (x < 6 || x >= GRID - 6 || z < 6 || z >= GRID - 6) continue;
        const y = this.field.topAt(x, z);
        if (y >= MAXY - 3 || this.field.isSolid(x, y, z)) continue;
        if (this.field.placeAt(x, y, z, CREAM)) {
          this.strata.lock(x, y, z); // before register: posts keep their cut colour
          this.strata.register(x, y, z, AGENT_WALLET, "border");
          this.add(x, y, z, CREAM, "border", "the territory line", zoneOf(x, z));
        }
      }
    }
  }
}
