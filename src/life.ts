// cathedral - small life. the settlement was architecture and nothing else:
// every object in it had been designed, which meant every object in it was a
// building or a part of one. what a place actually looks like inhabited is
// the stuff nobody designed — a bicycle against a wall, a bucket by a door,
// laundry between two windows, a broom where somebody left it.
//
// none of it is functional and none of it is per-work. it is placed BY RULE
// against the plan's own network: walk the edge of the made ground, and where
// there is a wall on one side and open paving on the other, that is a place
// something gets left. the architect never has to think about it and no
// design has to carry it.
//
// the moving half — smoke, birds, moths — is instanced and animated on the
// same wind field as everything else, so the air reads as one air.

import * as THREE from "three";
import { GRID } from "./config";
import {
  isAgentMaterial,
  LANTERN,
  SCARMOSS,
  STILLWATER,
  STONEDARK,
  SWATCH,
  TIMBERDARK,
  TIMBERLIGHT,
  TIMBERMID,
  VERMILION,
  PLASTER,
} from "./palette";
import type { UrbanPlan } from "./plan";
import type { VoxelField } from "./voxels";
import type { Wind } from "./wind";

export interface LifeReport {
  props: number;
  laundry: number;
  boats: number;
  smoke: number;
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

// ---- the still half: things left lying about --------------------------------

// each returns cells relative to its own foot
type Prop = { dx: number; dy: number; dz: number; m: number }[];

function bucket(seed: number): Prop {
  return [
    { dx: 0, dy: 0, dz: 0, m: TIMBERMID },
    { dx: 0, dy: 1, dz: 0, m: hash2(seed, 3) < 0.5 ? STILLWATER : TIMBERLIGHT },
  ];
}

function broom(seed: number): Prop {
  void seed;
  return [
    { dx: 0, dy: 0, dz: 0, m: TIMBERLIGHT },
    { dx: 0, dy: 1, dz: 0, m: TIMBERDARK },
    { dx: 0, dy: 2, dz: 0, m: TIMBERDARK },
  ];
}

function toolRack(seed: number): Prop {
  const out: Prop = [];
  for (let y = 0; y < 3; y++) out.push({ dx: 0, dy: y, dz: 0, m: TIMBERDARK });
  for (let i = 0; i < 3; i++) {
    if (hash2(seed, i) < 0.7) out.push({ dx: 0, dy: 2, dz: i - 1, m: i % 2 ? TIMBERMID : STONEDARK });
  }
  return out;
}

function handcart(seed: number): Prop {
  const out: Prop = [];
  for (let x = 0; x < 3; x++) {
    out.push({ dx: x, dy: 1, dz: 0, m: TIMBERMID });
    out.push({ dx: x, dy: 1, dz: 1, m: TIMBERMID });
  }
  out.push({ dx: 0, dy: 0, dz: 0, m: TIMBERDARK });
  out.push({ dx: 0, dy: 0, dz: 1, m: TIMBERDARK });
  out.push({ dx: 3, dy: 2, dz: 0, m: TIMBERLIGHT }); // the handle
  if (hash2(seed, 7) < 0.6) out.push({ dx: 1, dy: 2, dz: 0, m: SCARMOSS }); // a load
  return out;
}

function sweptPile(seed: number): Prop {
  const out: Prop = [];
  out.push({ dx: 0, dy: 0, dz: 0, m: SCARMOSS });
  if (hash2(seed, 11) < 0.6) out.push({ dx: 1, dy: 0, dz: 0, m: SCARMOSS });
  return out;
}

function crateStack(seed: number): Prop {
  const out: Prop = [];
  const n = 2 + Math.floor(hash2(seed, 13) * 3);
  for (let i = 0; i < n; i++) {
    out.push({ dx: i % 2, dy: Math.floor(i / 2), dz: 0, m: i % 2 ? TIMBERMID : TIMBERLIGHT });
  }
  return out;
}

function leanBicycle(seed: number): Prop {
  const m = hash2(seed, 17) < 0.5 ? TIMBERDARK : STONEDARK;
  return [
    { dx: 0, dy: 0, dz: 0, m },
    { dx: 0, dy: 0, dz: 2, m },
    { dx: 0, dy: 1, dz: 1, m },
    { dx: 0, dy: 1, dz: 2, m },
    { dx: 0, dy: 2, dz: 2, m },
  ];
}

const PROPS: ((seed: number) => Prop)[] = [
  bucket, broom, toolRack, handcart, sweptPile, crateStack, leanBicycle,
];

export class SmallLife {
  private birds: THREE.InstancedMesh;
  private smoke: THREE.InstancedMesh;
  private birdN = 0;
  private smokeN = 0;
  private t = 0;
  // where each smoke column stands, and each bird's own orbit
  private stacks: { x: number; y: number; z: number }[] = [];
  private flock: { x: number; y: number; z: number; r: number; s: number; p: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const birdMat = new THREE.MeshBasicMaterial({ color: SWATCH.timberDark, side: THREE.DoubleSide });
    this.birds = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.16), birdMat, 90);
    this.birds.count = 0;
    this.birds.frustumCulled = false;
    scene.add(this.birds);

    // smoke is a stack of soft quads rather than a particle system: it drifts
    // on the same wind as the grass and costs one draw
    const smokeMat = new THREE.MeshBasicMaterial({
      color: SWATCH.mist,
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
    });
    this.smoke = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.5), smokeMat, 260);
    this.smoke.count = 0;
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 3;
    scene.add(this.smoke);
  }

  // THE EDGE OF THE MADE GROUND is where things get left. a column that is
  // paved, with a wall beside it and open ground the other way, is a doorway
  // or a frontage — which is exactly where a bucket or a bicycle ends up.
  // SCATTERING ONCE AT BOOT PLACES NOTHING. every rule here looks for a
  // wall to lean against and at boot there are no walls — the settlement is
  // a plaza and two roads. it runs again each time a work is finished, over
  // that work's own ground, which is also when new places to leave a bucket
  // come into existence.
  scatter(field: VoxelField, plan: UrbanPlan, bounds?: { x0: number; z0: number; x1: number; z1: number }): LifeReport {
    const lo = { x: Math.max(6, bounds?.x0 ?? 6), z: Math.max(6, bounds?.z0 ?? 6) };
    const hi = { x: Math.min(GRID - 6, bounds?.x1 ?? GRID - 6), z: Math.min(GRID - 6, bounds?.z1 ?? GRID - 6) };
    const report: LifeReport = { props: 0, laundry: 0, boats: 0, smoke: 0 };
    // A WALL IS THE TOP OF THE COLUMN NEXT DOOR, not the air above it.
    // topAt returns the first EMPTY cell, so scanning upward from it checked
    // the sky and found no wall anywhere in the settlement: the first
    // measurement came back props 0, laundry 0, boats 0 with a street block
    // and a gate standing in the frame.
    //
    // a neighbour counts as something to lean against when its own surface
    // is at least two blocks above this ground and the crew built it.
    const wallAt = (x: number, z: number, ground: number): number => {
      const top = field.topAt(x, z) - 1;
      if (top < ground + 1) return -1;
      return isAgentMaterial(field.typeAt(x, top, z)) ? top : -1;
    };

    for (let x = lo.x; x < hi.x; x++) {
      for (let z = lo.z; z < hi.z; z++) {
        if (!plan.isBuiltGround(x, z)) continue;
        if (hash2(x * 3.1, z * 7.7) > 0.06) continue; // sparse: this is punctuation
        // is there something to lean against
        const nb = [
          [1, 0], [-1, 0], [0, 1], [0, -1],
        ] as const;
        let against = false;
        const g = field.topAt(x, z);
        for (const [dx, dz] of nb) if (wallAt(x + dx, z + dz, g) >= 0) against = true;
        if (!against) continue;
        const y = g;
        const pick = PROPS[Math.floor(hash2(x * 5.3, z * 2.9) * PROPS.length) % PROPS.length];
        for (const c of pick((x * 31 + z) | 0)) {
          const gx = x + c.dx;
          const gz = z + c.dz;
          if (gx < 4 || gx >= GRID - 4 || gz < 4 || gz >= GRID - 4) continue;
          if (field.placeAt(gx, y + c.dy, gz, c.m)) report.props++;
        }
      }
    }

    // ---- laundry between walls ------------------------------------------
    // a line wants two walls facing each other across a gap of three to
    // seven, which is an alley, which is where laundry actually goes
    for (let x = lo.x + 2; x < hi.x - 2; x += 2) {
      for (let z = lo.z + 2; z < hi.z - 2; z += 2) {
        if (hash2(x * 1.7, z * 9.1) > 0.03) continue;
        // the ground BETWEEN them, not the wall's own column — passing the
        // wall its own height makes the "is it tall enough" test trivially
        // true, and the first run strung 34 lines across the roads at ankle
        // height because every paving stone counted as a wall.
        const floor = field.topAt(x + 2, z + 2);
        const a = wallAt(x, z, floor + 3);
        if (a < 0) continue;
        for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
          for (let gap = 3; gap <= 7; gap++) {
            const bx = x + dx * gap;
            const bz = z + dz * gap;
            const b = wallAt(bx, bz, floor + 3);
            if (b < 0) continue;
            const y = Math.min(a, b) - 1;
            if (y < 2) break;
            for (let i = 1; i < gap; i++) {
              const lx = x + dx * i;
              const lz = z + dz * i;
              const sag = i === Math.floor(gap / 2) ? 1 : 0;
              const m = hash2(lx, lz) < 0.45 ? PLASTER : hash2(lx, lz) < 0.75 ? VERMILION : TIMBERLIGHT;
              if (field.placeAt(lx, y - sag, lz, m)) report.laundry++;
            }
            break;
          }
        }
      }
    }

    // ---- boats at the water's edge --------------------------------------
    for (let x = lo.x + 2; x < hi.x - 2; x += 3) {
      for (let z = lo.z + 2; z < hi.z - 2; z += 3) {
        const y = field.topAt(x, z);
        if (field.typeAt(x, y - 1, z) !== STILLWATER) continue;
        if (hash2(x * 4.1, z * 3.3) > 0.05) continue;
        // only where a shore is close: a boat in open water is not moored
        let shore = false;
        for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
          if (field.typeAt(x + dx, field.topAt(x + dx, z + dz) - 1, z + dz) !== STILLWATER) shore = true;
        }
        if (!shore) continue;
        const along = hash2(x, z) < 0.5;
        for (let i = 0; i < 4; i++) {
          const bx = x + (along ? i : 0);
          const bz = z + (along ? 0 : i);
          if (field.placeAt(bx, y - 1, bz, i === 0 || i === 3 ? TIMBERDARK : TIMBERMID)) report.boats++;
        }
      }
    }

    // ---- the moving half -------------------------------------------------
    // smoke rises from lanterns and kilns: any lantern the crew has lit with
    // built ground under it is somebody's hearth as far as this is concerned
    for (let x = lo.x + 4; x < hi.x - 4; x += 2) {
      for (let z = lo.z + 4; z < hi.z - 4; z += 2) {
        if (!plan.isBuiltGround(x, z)) continue;
        const y = field.topAt(x, z);
        let hot = false;
        for (let dy = 1; dy < 14; dy++) if (field.typeAt(x, y + dy, z) === LANTERN) hot = true;
        if (!hot || hash2(x * 8.3, z * 6.1) > 0.25) continue;
        if (this.stacks.length >= 26) break;
        this.stacks.push({ x: x - GRID / 2 + 0.5, y: y + 5, z: z - GRID / 2 + 0.5 });
      }
    }
    report.smoke = this.stacks.length;

    // and a few birds, circling over the settlement rather than scattered
    for (let i = 0; this.flock.length === 0 && i < 30; i++) {
      const a = hash2(i, 3) * Math.PI * 2;
      const r = 18 + hash2(i, 7) * 60;
      this.flock.push({
        x: plan.plazaX - GRID / 2 + 0.5 + Math.cos(a) * r,
        y: 16 + hash2(i, 11) * 22,
        z: plan.plazaZ - GRID / 2 + 0.5 + Math.sin(a) * r,
        r: 3 + hash2(i, 13) * 7,
        s: 0.25 + hash2(i, 17) * 0.5,
        p: hash2(i, 19) * Math.PI * 2,
      });
    }
    return report;
  }

  update(dt: number, wind: Wind, camera: THREE.Camera) {
    this.t += dt;

    // birds: a slow circle with a flap, always broadside to the camera so a
    // flat quad still reads as a bird
    this.birdN = 0;
    for (const b of this.flock) {
      const a = this.t * b.s + b.p;
      const px = b.x + Math.cos(a) * b.r;
      const pz = b.z + Math.sin(a) * b.r;
      const py = b.y + Math.sin(a * 2.3) * 1.2;
      this.q.setFromAxisAngle(_up, Math.atan2(camera.position.x - px, camera.position.z - pz));
      this.v.set(1, 0.55 + Math.abs(Math.sin(this.t * 9 + b.p)) * 0.9, 1);
      this.m.compose(_p.set(px, py, pz), this.q, this.v);
      this.birds.setMatrixAt(this.birdN++, this.m);
    }
    this.birds.count = this.birdN;
    this.birds.instanceMatrix.needsUpdate = true;

    // smoke: each stack is a short column of quads climbing and drifting
    // downwind, fading as it goes
    // the same wind the grass and the banners obey, so the air reads as one
    // air rather than as three animations
    const wx = wind.dirX * (0.5 + wind.gust);
    const wz = wind.dirZ * (0.5 + wind.gust);
    this.smokeN = 0;
    for (const s of this.stacks) {
      for (let k = 0; k < 8; k++) {
        const age = (this.t * 0.35 + k * 0.125) % 1;
        const rise = age * 7;
        const sc = 0.5 + age * 2.2;
        this.q.setFromAxisAngle(_up, Math.atan2(camera.position.x - s.x, camera.position.z - s.z));
        this.m.compose(
          _p.set(s.x + wx * rise * 0.5, s.y + rise, s.z + wz * rise * 0.5),
          this.q,
          this.v.set(sc, sc, sc)
        );
        this.smoke.setMatrixAt(this.smokeN++, this.m);
        if (this.smokeN >= 260) break;
      }
      if (this.smokeN >= 260) break;
    }
    this.smoke.count = this.smokeN;
    this.smoke.instanceMatrix.needsUpdate = true;
  }

  setVisible(on: boolean) {
    this.birds.visible = on;
    this.smoke.visible = on;
  }
}

const _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
