// cathedral - ROPE BRIDGES. an archipelago is one composition only if its
// pieces are joined: where a gap is genuinely crossable — the sheared
// headland to its detached shard, a low satellite to the coast — a rope
// bridge swings across it. spans are found, not placed: the headland
// crossing is discovered by marching the shear's own bearing until the
// land breaks and resumes, and a satellite is only slung to the coast if
// the drop is one a rope could actually hold.

import * as THREE from "three";
import { GRID } from "./config";
import { SWATCH } from "./palette";
import { HEADLAND_A, coastDistAt } from "./terrain";
import type { VoxelField } from "./voxels";
import type { Island } from "./islands";

const MAX_SPAN = 36; // longest gap a rope crosses to the coast
const ISLE_SPAN = 46; // and a little further stone to stone — a journey
const MAX_DROP = 16; // steepest slope one is slung across

function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  return pts;
}

export function buildRopeBridge(scene: THREE.Scene, a: THREE.Vector3, b: THREE.Vector3) {
  const span = a.distanceTo(b);
  const sag = Math.min(4.5, span * 0.11);
  const n = Math.max(8, Math.round(span / 1.4));
  const pts = catenary(a, b, sag, n);
  const group = new THREE.Group();

  const planks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.7, 0.14, 0.72),
    new THREE.MeshStandardMaterial({ color: SWATCH.timberLight, roughness: 1 }),
    n
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3().lerpVectors(pts[i], pts[i + 1], 0.5);
    dir.subVectors(pts[i + 1], pts[i]).normalize();
    q.setFromUnitVectors(Z, dir);
    m.compose(p, q, new THREE.Vector3(1, 1, 1));
    planks.setMatrixAt(i, m);
  }
  planks.instanceMatrix.needsUpdate = true;
  group.add(planks);

  // hand ropes slung outside and above the planks, sagging a little more
  const side = new THREE.Vector3().subVectors(b, a).normalize().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x3c3226, roughness: 1 });
  for (const s of [-0.8, 0.8]) {
    const lift = new THREE.Vector3(0, 0.95, 0);
    const rope = catenary(
      a.clone().addScaledVector(side, s).add(lift),
      b.clone().addScaledVector(side, s).add(lift),
      sag * 1.15,
      n
    );
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rope), n, 0.05, 4),
      ropeMat
    );
    group.add(tube);
  }

  // end posts, one pair each side
  const postGeo = new THREE.BoxGeometry(0.24, 1.3, 0.24);
  const postMat = new THREE.MeshStandardMaterial({ color: SWATCH.timberDark, roughness: 1 });
  for (const end of [a, b]) {
    for (const s of [-0.8, 0.8]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.copy(end).addScaledVector(side, s).add(new THREE.Vector3(0, 0.55, 0));
      group.add(post);
    }
  }
  scene.add(group);
}

// find and sling every crossing the archipelago offers
export function buildArchipelagoBridges(scene: THREE.Scene, field: VoxelField, isles: Island[]) {
  const half = GRID / 2;
  const top = (x: number, z: number) =>
    new THREE.Vector3(x - half + 0.5, Math.max(1, field.topAt(x, z)) + 0.1, z - half + 0.5);

  // 1. the headland to its shard: march the shear's bearing, note where
  // the land breaks and where it resumes — those lips are the crossing
  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (let r = 56; r < 160; r += 1) {
    const x = Math.round(GRID / 2 + Math.cos(HEADLAND_A) * r);
    const z = Math.round(GRID / 2 + Math.sin(HEADLAND_A) * r);
    if (x < 1 || z < 1 || x > GRID - 2 || z > GRID - 2) break;
    if (field.topAt(x, z) > 0) cur.push([x, z]);
    else if (cur.length) {
      segs.push(cur);
      cur = [];
    }
  }
  if (cur.length) segs.push(cur);
  if (segs.length >= 2) {
    const aEnd = segs[0][segs[0].length - 1];
    const bStart = segs[1][0];
    const A = top(aEnd[0], aEnd[1]);
    const B = top(bStart[0], bStart[1]);
    if (A.distanceTo(B) <= MAX_SPAN) buildRopeBridge(scene, A, B);
  }

  // 2. satellites: slung to the nearest coast along the line toward the
  // world's centre, but only when the drop is honest
  for (const isle of isles) {
    if (coastDistAt(isle.cx, isle.cz) > 0) continue; // over land: the market's sky
    const ang = Math.atan2(GRID / 2 - isle.cz, GRID / 2 - isle.cx);
    const rx = Math.round(isle.cx + Math.cos(ang) * (isle.r - 1));
    const rz = Math.round(isle.cz + Math.sin(ang) * (isle.r - 1));
    if (field.topAt(rx, rz) <= 0) continue;
    let coast: [number, number] | null = null;
    for (let d = isle.r + 1; d < isle.r + MAX_SPAN; d++) {
      const x = Math.round(isle.cx + Math.cos(ang) * d);
      const z = Math.round(isle.cz + Math.sin(ang) * d);
      if (x < 1 || z < 1 || x > GRID - 2 || z > GRID - 2) break;
      if (coastDistAt(x, z) > 0 && field.topAt(x, z) > 0) {
        coast = [x, z];
        break;
      }
    }
    if (!coast) continue;
    const A = top(rx, rz);
    const B = top(coast[0], coast[1]);
    if (Math.abs(A.y - B.y) > MAX_DROP) continue;
    if (A.distanceTo(B) > MAX_SPAN) continue;
    buildRopeBridge(scene, A, B);
  }

  // 3. stone to stone: the longer slings between satellites themselves,
  // so reaching the outer archipelago is a journey of legs, not one hop
  for (let i = 0; i < isles.length; i++) {
    for (let j = i + 1; j < isles.length; j++) {
      const A = isles[i];
      const B = isles[j];
      if (coastDistAt(A.cx, A.cz) > 0 || coastDistAt(B.cx, B.cz) > 0) continue;
      const d = Math.hypot(A.cx - B.cx, A.cz - B.cz);
      if (d > ISLE_SPAN + A.r + B.r || d < A.r + B.r + 4) continue;
      const ang = Math.atan2(B.cz - A.cz, B.cx - A.cx);
      const ax = Math.round(A.cx + Math.cos(ang) * (A.r - 1));
      const az = Math.round(A.cz + Math.sin(ang) * (A.r - 1));
      const bx2 = Math.round(B.cx - Math.cos(ang) * (B.r - 1));
      const bz2 = Math.round(B.cz - Math.sin(ang) * (B.r - 1));
      if (field.topAt(ax, az) <= 0 || field.topAt(bx2, bz2) <= 0) continue;
      const P = top(ax, az);
      const Q = top(bx2, bz2);
      if (Math.abs(P.y - Q.y) > MAX_DROP || P.distanceTo(Q) > ISLE_SPAN) continue;
      buildRopeBridge(scene, P, Q);
    }
  }
}
