// cathedral - chunked voxel field, ported from the biocraft engine and
// stripped to the core. solidity + material per cell on global arrays;
// rendering is split into per-chunk instanced meshes so the renderer
// frustum-culls off-screen chunks (main and shadow passes). break / place /
// raycast / collision all run on the global data, so only the render is
// chunked. no textures: one flat-shaded material, per-instance colour, with
// a per-face brightness + edge-darkening term injected into the shader so
// bare single-colour cubes still read as crisp geology.

import * as THREE from "three";
import { CHUNK, GRID, MAXY } from "./config";
import { ASH, BEDROCK, blockColor, NONE } from "./palette";

const CPS = GRID / CHUNK; // chunks per side
const HEADROOM = 1024; // spare instance slots per chunk; grows on demand

// tiny deterministic hash for per-instance colour jitter
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export interface RayHit {
  hx: number;
  hy: number;
  hz: number;
  px: number;
  py: number;
  pz: number;
  hasPlace: boolean;
}

interface Chunk {
  mesh: THREE.InstancedMesh;
  slotOfVoxel: Map<number, number>;
  free: number[];
  dirty: boolean;
}

// the ground sampler the terrain module provides at construction time
export interface FieldSampler {
  heightAt(x: number, z: number): number; // solid column height at a cell
  typeAt(x: number, z: number, y: number, h: number): number; // material per cell
  // optional per-column brightness for GROUND cells (horizon dissolve);
  // structure blocks are never shaded by it
  groundShade?(x: number, z: number): number;
}

export class VoxelField {
  readonly group = new THREE.Group();
  readonly top: Int16Array;
  // blocks added after generation (the structure: genesis, mass, rubble...)
  placedCount = 0;

  private solid: Uint8Array;
  private btype: Uint8Array;
  private chunks: Chunk[] = [];
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  private groundShade?: (x: number, z: number) => number;

  constructor(sampler: FieldSampler) {
    this.groundShade = sampler.groundShade?.bind(sampler);
    this.solid = new Uint8Array(GRID * GRID * MAXY);
    this.btype = new Uint8Array(GRID * GRID * MAXY);
    this.top = new Int16Array(GRID * GRID);

    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++) {
        const h = Math.max(1, Math.min(MAXY - 2, sampler.heightAt(x, z)));
        this.top[x * GRID + z] = h;
        for (let y = 0; y < h; y++) {
          const i = this.idx(x, y, z);
          this.solid[i] = 1;
          this.btype[i] = sampler.typeAt(x, z, y, h);
        }
      }
    }

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      flatShading: true,
      roughness: 0.95,
      metalness: 0,
    });
    // voxel "look" injected into the standard shader (no geometry cost,
    // compiled once for the shared chunk material):
    //  - per-face brightness baked into the albedo (top brightest, bottom
    //    darkest, side pairs between) so cubes read as volumes under the
    //    single low sun.
    //  - subtle per-cube edge darkening (cheap contact seams) so packed
    //    blocks stay crisp instead of blurring together.
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\n varying float vFaceShade;\n varying vec2 vVoxUv;"
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vVoxUv = uv;
           vFaceShade = normal.y > 0.5 ? 1.0
             : (normal.y < -0.5 ? 0.55
             : (abs(normal.z) > 0.5 ? 0.80 : 0.70));`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\n varying float vFaceShade;\n varying vec2 vVoxUv;"
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           vec2 vEdge = abs(vVoxUv - 0.5) * 2.0;
           float vAO = 1.0 - smoothstep(0.86, 1.0, max(vEdge.x, vEdge.y)) * 0.16;
           diffuseColor.rgb *= vFaceShade * vAO;`
        );
    };

    for (let cx = 0; cx < CPS; cx++) {
      for (let cz = 0; cz < CPS; cz++) {
        this.buildChunk(cx, cz, geo, mat);
      }
    }
  }

  // ---- addressing ----------------------------------------------------------

  private idx(x: number, y: number, z: number): number {
    return (x * GRID + z) * MAXY + y;
  }
  private inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < GRID && z >= 0 && z < GRID && y >= 0 && y < MAXY;
  }
  private wx(x: number): number {
    return x - GRID / 2 + 0.5;
  }
  private wz(z: number): number {
    return z - GRID / 2 + 0.5;
  }
  private chunkOf(x: number, z: number): number {
    return Math.floor(x / CHUNK) * CPS + Math.floor(z / CHUNK);
  }

  // ---- queries -------------------------------------------------------------

  isSolid(x: number, y: number, z: number): boolean {
    if (!this.inBounds(x, y, z)) return false;
    return this.solid[this.idx(x, y, z)] === 1;
  }
  // solidity at a world-space point (true 3d)
  solidAtWorld(wx: number, wy: number, wz: number): boolean {
    return this.isSolid(Math.floor(wx + GRID / 2), Math.floor(wy), Math.floor(wz + GRID / 2));
  }
  // top surface of the highest solid voxel at/below fromY in this column
  surfaceBelow(wx: number, wz: number, fromY: number): number {
    const vx = Math.floor(wx + GRID / 2);
    const vz = Math.floor(wz + GRID / 2);
    if (vx < 0 || vx >= GRID || vz < 0 || vz >= GRID) return 0;
    let vy = Math.min(MAXY - 1, Math.floor(fromY));
    for (; vy >= 0; vy--) if (this.solid[this.idx(vx, vy, vz)] === 1) return vy + 1;
    return 0;
  }
  topAt(x: number, z: number): number {
    if (x < 0 || x >= GRID || z < 0 || z >= GRID) return 0;
    return this.top[x * GRID + z];
  }
  // material at a cell (NONE if empty / out of bounds)
  typeAt(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z) || this.solid[this.idx(x, y, z)] === 0) return NONE;
    return this.btype[this.idx(x, y, z)];
  }
  private emptyAt(x: number, y: number, z: number): boolean {
    if (y < 0) return false;
    if (x < 0 || x >= GRID || z < 0 || z >= GRID || y >= MAXY) return true;
    return this.solid[this.idx(x, y, z)] === 0;
  }
  private isExposed(x: number, y: number, z: number): boolean {
    if (!this.isSolid(x, y, z)) return false;
    return (
      this.emptyAt(x + 1, y, z) ||
      this.emptyAt(x - 1, y, z) ||
      this.emptyAt(x, y + 1, z) ||
      this.emptyAt(x, y - 1, z) ||
      this.emptyAt(x, y, z + 1) ||
      this.emptyAt(x, y, z - 1)
    );
  }

  // ---- chunked instanced rendering ----------------------------------------

  private buildChunk(cx: number, cz: number, geo: THREE.BufferGeometry, mat: THREE.Material) {
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const exposed: number[] = [];
    for (let x = x0; x < x0 + CHUNK; x++) {
      for (let z = z0; z < z0 + CHUNK; z++) {
        const h = this.top[x * GRID + z];
        for (let y = 0; y < h; y++) {
          if (this.isExposed(x, y, z)) exposed.push(this.idx(x, y, z));
        }
      }
    }
    const capacity = exposed.length + HEADROOM;
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // manual bounds so frustum culling (main + shadow) stays correct
    const cxw = x0 + CHUNK / 2 - GRID / 2;
    const czw = z0 + CHUNK / 2 - GRID / 2;
    mesh.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(cxw, MAXY / 2, czw),
      Math.sqrt(2 * (CHUNK / 2) ** 2 + (MAXY / 2) ** 2) + 2
    );

    const chunk: Chunk = { mesh, slotOfVoxel: new Map(), free: [], dirty: false };
    for (let k = 0; k < exposed.length; k++) this.fillSlot(chunk, k, exposed[k]);
    this.dummy.position.set(0, -9999, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    // free slots in DESCENDING order so pop() hands out the LOWEST first,
    // keeping mesh.count (the rendered range) tight as the structure grows
    for (let k = capacity - 1; k >= exposed.length; k--) {
      mesh.setMatrixAt(k, this.dummy.matrix);
      chunk.free.push(k);
    }
    mesh.count = exposed.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.chunks[cx * CPS + cz] = chunk;
    this.group.add(mesh);
  }

  private fillSlot(chunk: Chunk, slot: number, vi: number) {
    const y = vi % MAXY;
    const xz = (vi - y) / MAXY;
    const z = xz % GRID;
    const x = (xz - z) / GRID;
    this.dummy.position.set(this.wx(x), y + 0.5, this.wz(z));
    this.dummy.scale.set(1, 1, 1);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    chunk.mesh.setMatrixAt(slot, this.dummy.matrix);
    const type = this.btype[vi];
    this.col
      .setHex(blockColor(type))
      .multiplyScalar(0.92 + hash2(x * 3.7 + y, z * 1.9) * 0.16);
    if (this.groundShade && (type === ASH || type === BEDROCK)) {
      this.col.multiplyScalar(this.groundShade(x, z));
    }
    chunk.mesh.setColorAt(slot, this.col);
    chunk.slotOfVoxel.set(vi, slot);
  }

  private addInstance(x: number, y: number, z: number) {
    const ci = this.chunkOf(x, z);
    const chunk = this.chunks[ci];
    const vi = this.idx(x, y, z);
    if (chunk.slotOfVoxel.has(vi)) return;
    let slot = chunk.free.pop();
    if (slot === undefined) {
      this.growChunk(ci); // out of room: enlarge, never drop the block
      slot = chunk.free.pop();
    }
    if (slot === undefined) return; // grow failed (defensive); placeAt rolls back
    this.fillSlot(chunk, slot, vi);
    if (slot >= chunk.mesh.count) chunk.mesh.count = slot + 1;
    chunk.dirty = true;
  }

  // enlarge a chunk's instanced mesh when it runs out of placement slots, so
  // accretion never silently fails to render. on demand: only chunks the
  // market actually fills pay the extra memory. preserves every instance.
  private growChunk(ci: number) {
    const chunk = this.chunks[ci];
    if (!chunk) return;
    const old = chunk.mesh;
    const cap = old.instanceMatrix.count;
    const newCap = cap + HEADROOM;
    const mesh = new THREE.InstancedMesh(old.geometry, old.material as THREE.Material, newCap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.boundingSphere = old.boundingSphere;
    (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(newCap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    if (old.instanceColor) (mesh.instanceColor.array as Float32Array).set(old.instanceColor.array as Float32Array);
    this.dummy.position.set(0, -9999, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (let k = newCap - 1; k >= cap; k--) {
      mesh.setMatrixAt(k, this.dummy.matrix);
      chunk.free.push(k);
    }
    mesh.count = old.count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    this.group.remove(old);
    this.group.add(mesh);
    old.dispose();
    chunk.mesh = mesh;
  }

  private removeInstance(x: number, y: number, z: number) {
    const chunk = this.chunks[this.chunkOf(x, z)];
    const vi = this.idx(x, y, z);
    const slot = chunk.slotOfVoxel.get(vi);
    if (slot === undefined) return;
    this.dummy.position.set(0, -9999, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    chunk.mesh.setMatrixAt(slot, this.dummy.matrix);
    chunk.slotOfVoxel.delete(vi);
    chunk.free.push(slot);
    chunk.dirty = true;
  }

  private flush() {
    for (const c of this.chunks) {
      if (c && c.dirty) {
        c.mesh.instanceMatrix.needsUpdate = true;
        if (c.mesh.instanceColor) c.mesh.instanceColor.needsUpdate = true;
        c.dirty = false;
      }
    }
  }

  // ---- damage states + tinting --------------------------------------------

  // tint a block toward a worn, ember-edged look as it destabilizes.
  // frac01: 1 = intact, 0 = about to break. collapse (r2) walks blocks down
  // this ramp tier by tier before they let go. a rebuilt cell resets.
  // baseHex overrides the ramp's starting colour (epoch-tinted strata decay
  // from their resting tint, not the raw material colour).
  damageAt(x: number, y: number, z: number, frac01: number, baseHex?: number) {
    const chunk = this.chunks[this.chunkOf(x, z)];
    const vi = this.idx(x, y, z);
    const slot = chunk.slotOfVoxel.get(vi);
    if (slot === undefined) return;
    const f = Math.max(0, Math.min(1, frac01));
    const k = 0.45 + 0.55 * f; // brightness retained
    this.col.setHex(baseHex ?? blockColor(this.btype[vi]));
    this.col.setRGB(
      this.col.r * k + (1 - f) * 0.38, // pulls toward ember
      this.col.g * k + (1 - f) * 0.12,
      this.col.b * k
    );
    chunk.mesh.setColorAt(slot, this.col);
    if (chunk.mesh.instanceColor) chunk.mesh.instanceColor.needsUpdate = true;
    chunk.dirty = true;
  }

  // set a block's rendered colour directly (epoch strata tints, scar glow
  // cooling). no-op if the cell has no rendered instance.
  tintAt(x: number, y: number, z: number, hex: number) {
    const chunk = this.chunks[this.chunkOf(x, z)];
    const vi = this.idx(x, y, z);
    const slot = chunk.slotOfVoxel.get(vi);
    if (slot === undefined) return;
    this.col.setHex(hex);
    chunk.mesh.setColorAt(slot, this.col);
    if (chunk.mesh.instanceColor) chunk.mesh.instanceColor.needsUpdate = true;
    chunk.dirty = true;
  }

  // ---- edits ---------------------------------------------------------------

  breakAt(x: number, y: number, z: number): boolean {
    if (!this.isSolid(x, y, z)) return false;
    const prev = this.btype[this.idx(x, y, z)];
    this.solid[this.idx(x, y, z)] = 0;
    this.btype[this.idx(x, y, z)] = NONE;
    this.removeInstance(x, y, z);
    if (this.isSolid(x + 1, y, z)) this.addInstance(x + 1, y, z);
    if (this.isSolid(x - 1, y, z)) this.addInstance(x - 1, y, z);
    if (this.isSolid(x, y + 1, z)) this.addInstance(x, y + 1, z);
    if (this.isSolid(x, y - 1, z)) this.addInstance(x, y - 1, z);
    if (this.isSolid(x, y, z + 1)) this.addInstance(x, y, z + 1);
    if (this.isSolid(x, y, z - 1)) this.addInstance(x, y, z - 1);
    const col = x * GRID + z;
    if (this.top[col] === y + 1) {
      let ny = y - 1;
      while (ny >= 0 && this.solid[this.idx(x, ny, z)] === 0) ny--;
      this.top[col] = ny + 1;
    }
    if (prev !== ASH && prev !== BEDROCK) this.placedCount--;
    this.flush();
    return true;
  }

  placeAt(x: number, y: number, z: number, type: number): boolean {
    if (!this.inBounds(x, y, z) || this.isSolid(x, y, z)) return false;
    const i = this.idx(x, y, z);
    this.solid[i] = 1;
    this.btype[i] = type;
    this.addInstance(x, y, z);
    // safety net: if the instance could not be added (grow failed), roll back
    // so a solid-but-invisible block is never left in the data
    if (!this.chunks[this.chunkOf(x, z)].slotOfVoxel.has(i)) {
      this.solid[i] = 0;
      this.btype[i] = NONE;
      return false;
    }
    const col = x * GRID + z;
    if (y + 1 > this.top[col]) this.top[col] = y + 1;
    if (type !== ASH && type !== BEDROCK) this.placedCount++;
    this.flush();
    return true;
  }

  // force a cell to an authoritative state (NONE = air). used for remote
  // edits and persisted world state, so every visitor sees the same stone.
  applyRemoteEdit(x: number, y: number, z: number, type: number) {
    if (!this.inBounds(x, y, z)) return;
    if (this.isSolid(x, y, z)) this.breakAt(x, y, z);
    if (type !== NONE) this.placeAt(x, y, z, type);
  }

  // ---- raycast (dda) -------------------------------------------------------

  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    reach: number
  ): RayHit | null {
    const px = ox + GRID / 2;
    const py = oy;
    const pz = oz + GRID / 2;
    let vx = Math.floor(px);
    let vy = Math.floor(py);
    let vz = Math.floor(pz);
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const adz = Math.abs(dz);
    const tDeltaX = adx > 1e-8 ? 1 / adx : Infinity;
    const tDeltaY = ady > 1e-8 ? 1 / ady : Infinity;
    const tDeltaZ = adz > 1e-8 ? 1 / adz : Infinity;
    let tMaxX = adx > 1e-8 ? (sx > 0 ? vx + 1 - px : px - vx) / adx : Infinity;
    let tMaxY = ady > 1e-8 ? (sy > 0 ? vy + 1 - py : py - vy) / ady : Infinity;
    let tMaxZ = adz > 1e-8 ? (sz > 0 ? vz + 1 - pz : pz - vz) / adz : Infinity;
    let prevX = vx;
    let prevY = vy;
    let prevZ = vz;
    let hasPrev = false;
    let t = 0;
    const maxIter = Math.ceil(reach) * 3 + 6;
    for (let it = 0; it < maxIter; it++) {
      if (vy >= 0 && vy < MAXY && vx >= 0 && vx < GRID && vz >= 0 && vz < GRID) {
        if (this.solid[this.idx(vx, vy, vz)] === 1) {
          return { hx: vx, hy: vy, hz: vz, px: prevX, py: prevY, pz: prevZ, hasPlace: hasPrev };
        }
      }
      prevX = vx;
      prevY = vy;
      prevZ = vz;
      hasPrev = true;
      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
        vx += sx;
        t = tMaxX;
        tMaxX += tDeltaX;
      } else if (tMaxY <= tMaxZ) {
        vy += sy;
        t = tMaxY;
        tMaxY += tDeltaY;
      } else {
        vz += sz;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
      }
      if (t > reach) return null;
    }
    return null;
  }

  worldCenter(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.wx(x), y + 0.5, this.wz(z));
  }
}
