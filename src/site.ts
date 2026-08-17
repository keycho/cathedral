// kodo - the work site. the world was finished objects appearing one
// block at a time: a stone lands, then another, and at no point does the
// place look like somewhere anybody is BUILDING. a construction site is a
// thing you can recognise from across a valley — the shape of what is
// coming, standing in outline, with scaffolding up the face of what has
// already risen and the yard around it full of the evidence of work.
//
// three layers, none of them touching the voxel field, because the field is
// the world and a scaffold is not part of the world:
//
//   1. the GHOST — the blueprint ahead of the mason, drawn as a translucent
//      shell so a visitor can see what the crew is making before it exists
//   2. the SCAFFOLD — timber staging climbing whatever is currently rising,
//      which is what makes a half-built thing read as half-built rather
//      than as broken
//   3. the YARD — a few stacks and trestles by the mason's approach
//
// all three come down as the work finishes, and they are instanced meshes
// rather than blocks so the whole apparatus costs three draws.

import * as THREE from "three";
import { GRID } from "./config";
import type { Blueprint, BlueprintCell } from "./mason";
import { SWATCH } from "./palette";

const GHOST_MAX = 2600; // an ordinary work is well under this
const SCAFFOLD_MAX = 900;
const GHOST_MARK = 0.3; // the survey mark's size, in blocks
// and only every third one is drawn. the marks are for reading a SHAPE at
// distance, and a shape does not need every cell of a two thousand block
// hall to be dotted — at full density fourteen hundred of them fill the
// frame however small and however faint each one is.
const GHOST_STRIDE = 3;

function box(): THREE.BoxGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

export class WorkSite {
  private ghost: THREE.InstancedMesh;
  private scaffold: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private bp: Blueprint | null = null;
  private cursor = 0;
  private rebuiltAt = -1;

  constructor(scene: THREE.Scene) {
    // the ghost is deliberately NOT a wireframe: an outline of every cell in
    // a two thousand block work is a solid mass of lines. a flat translucent
    // shell reads as "a thing that is coming" and stays legible at distance.
    const ghostMat = new THREE.MeshBasicMaterial({
      // NOT WHITE AND NOT BRIGHT. a basic material ignores the light, so a
      // near-white ghost is full-bright against a dark building at golden
      // hour and blows out whatever it covers. a cool blue-grey reads as
      // "drawn, not yet built" and sits UNDER the architecture in value.
      color: SWATCH.bounceShade,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.ghost = new THREE.InstancedMesh(box(), ghostMat, GHOST_MAX);
    this.ghost.count = 0;
    this.ghost.frustumCulled = false;
    this.ghost.renderOrder = 2;
    scene.add(this.ghost);

    const scaffMat = new THREE.MeshLambertMaterial({ color: SWATCH.timberMid });
    this.scaffold = new THREE.InstancedMesh(box(), scaffMat, SCAFFOLD_MAX);
    this.scaffold.count = 0;
    this.scaffold.frustumCulled = false;
    this.scaffold.castShadow = true;
    scene.add(this.scaffold);
  }

  // the mason hands over what it is working on and how far in it is
  show(bp: Blueprint | null, cursor: number) {
    if (!bp) {
      this.bp = null;
      this.ghost.count = 0;
      this.scaffold.count = 0;
      return;
    }
    const moved = bp !== this.bp || Math.abs(cursor - this.cursor) >= 12;
    this.bp = bp;
    this.cursor = cursor;
    // rebuilding an instanced buffer every frame for a thing that changes
    // once every five seconds is the kind of cost that does not show up in
    // a draw call count and shows up in the frame time
    if (!moved) return;
    this.rebuild();
  }

  private rebuild() {
    const bp = this.bp;
    if (!bp) return;
    this.rebuiltAt = this.cursor;

    // ---- the ghost: the SHELL of what is not yet laid ---------------------
    // filling every remaining cell came back as a solid white cloud. a
    // translucent box is fine; fifteen hundred of them stacked along the
    // view ray accumulate alpha until the whole mass is opaque, which is
    // the opposite of what a ghost is for — the shape of the thing was
    // completely hidden inside its own transparency.
    //
    // only the cells on the OUTER SURFACE of the remaining volume are
    // drawn, so the view ray crosses one or two rather than thirty, and
    // what is left reads as the outline of a building that is coming.
    const left = new Set<number>();
    for (let i = this.cursor; i < bp.cells.length; i++) {
      const c = bp.cells[i];
      left.add((c.x * GRID + c.z) * 128 + c.y);
    }
    const key = (x: number, y: number, z: number) => (x * GRID + z) * 128 + y;
    let g = 0;
    for (let i = this.cursor; i < bp.cells.length && g < GHOST_MAX; i++) {
      const c = bp.cells[i];
      const buried =
        left.has(key(c.x + 1, c.y, c.z)) &&
        left.has(key(c.x - 1, c.y, c.z)) &&
        left.has(key(c.x, c.y + 1, c.z)) &&
        left.has(key(c.x, c.y - 1, c.z)) &&
        left.has(key(c.x, c.y, c.z + 1)) &&
        left.has(key(c.x, c.y, c.z - 1));
      if (buried) continue;
      if (i % GHOST_STRIDE !== 0) continue;
      // AND EACH MARK IS SMALL. culling the buried cells barely helped,
      // because a voxel building is mostly shell already — the near wall,
      // the far wall and the roof still stack three deep along the view ray
      // and three panes at a fifth opacity is a white smear.
      //
      // a third of a block, centred in its cell, reads as a SURVEY MARK
      // rather than as a pane: the marks outline the thing that is coming
      // and you can see straight through the outline, which is the whole
      // point of drawing it in the first place.
      this.m.makeScale(GHOST_MARK, GHOST_MARK, GHOST_MARK);
      this.m.setPosition(c.x - GRID / 2 + 0.5, c.y + 0.5, c.z - GRID / 2 + 0.5);
      this.ghost.setMatrixAt(g++, this.m);
    }
    this.ghost.count = g;
    this.ghost.instanceMatrix.needsUpdate = true;

    // ---- the scaffold: staging up the face of what is rising -------------
    // it follows the WORK rather than being designed: the footprint of what
    // has been laid so far, its perimeter, up to the height reached. that is
    // what a scaffold is, and it means no design has to ask for one.
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, maxY = -1e9, minY = 1e9;
    for (let i = 0; i < this.cursor && i < bp.cells.length; i++) {
      const c = bp.cells[i];
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.z < minZ) minZ = c.z;
      if (c.z > maxZ) maxZ = c.z;
      if (c.y > maxY) maxY = c.y;
      if (c.y < minY) minY = c.y;
    }
    let s = 0;
    if (maxY - minY >= 3 && maxX > minX) {
      const top = maxY + 1;
      // full size again: the matrix is shared and the ghost left a third
      // scale in it, which would have built the staging out of matchsticks
      this.m.identity();
      const put = (x: number, y: number, z: number) => {
        if (s >= SCAFFOLD_MAX) return;
        this.m.setPosition(x - GRID / 2 + 0.5, y + 0.5, z - GRID / 2 + 0.5);
        this.scaffold.setMatrixAt(s++, this.m);
      };
      // standards at the corners and every four along, ledgers every three
      // courses: the pattern reads as staging from any distance and costs
      // almost nothing
      for (let x = minX - 1; x <= maxX + 1; x += 4) {
        for (const z of [minZ - 1, maxZ + 1]) {
          for (let y = minY; y <= top; y++) put(x, y, z);
        }
      }
      for (let z = minZ - 1; z <= maxZ + 1; z += 4) {
        for (const x of [minX - 1, maxX + 1]) {
          for (let y = minY; y <= top; y++) put(x, y, z);
        }
      }
      for (let y = minY + 2; y <= top; y += 3) {
        for (let x = minX - 1; x <= maxX + 1; x++) {
          put(x, y, minZ - 1);
          put(x, y, maxZ + 1);
        }
        for (let z = minZ; z < maxZ + 1; z++) {
          put(minX - 1, y, z);
          put(maxX + 1, y, z);
        }
      }
    }
    this.scaffold.count = s;
    this.scaffold.instanceMatrix.needsUpdate = true;
  }

  get stats(): { ghost: number; scaffold: number; at: number } {
    return { ghost: this.ghost.count, scaffold: this.scaffold.count, at: this.rebuiltAt };
  }

  // the whole apparatus, on or off — capture mode wants a finished world
  setVisible(on: boolean) {
    this.ghost.visible = on;
    this.scaffold.visible = on;
  }
}

export type { BlueprintCell };
