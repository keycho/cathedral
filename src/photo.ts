// cathedral - photo mode. the world already knows how to look like itself;
// this is the part that knows how to be PHOTOGRAPHED.
//
// three things, none of them new rendering: framing presets that put the
// camera where a picture is rather than where a game camera drifts to, a
// shutter that takes the plate with the chrome down and the grade settled,
// and the diorama look — a long lens on a short focal band, which is what
// makes a miniature read as a miniature.
//
// the presets are deliberately opinionated. a "street level" preset that
// puts the eye at head height and then points it at the middle of a
// building is not a street shot; it has to stand IN the street, along it,
// with something close on one side. the earlier capture set had a
// ground-level frame at radius 26 that came back from inside a blossom
// canopy, which is what a preset written as three numbers rather than as a
// picture gets you.

import * as THREE from "three";
import type { OrbitRig } from "./orbitcam";
import type { Post } from "./post";
import type { VoxelField } from "./voxels";

export interface Framing {
  name: string;
  note: string;
  // where the camera sits relative to its subject
  radius: number;
  polar: number; // 0 = level with the subject, 1.4 = almost overhead
  azimuth: number;
  lift: number; // how far above the subject's own ground the aim sits
  fov: number;
  dof: "off" | "subtle" | "diorama";
}

// A LONG LENS IS HALF OF THE DIORAMA. at 70 degrees everything converges
// hard and the world reads as a place you are standing in; at 30 the
// perspective flattens, the hills stack, and the same geometry reads as a
// model on a table. the reference images are all long lenses.
export const FRAMINGS: Record<string, Framing> = {
  orbit: {
    name: "orbit",
    note: "the whole settlement, the working shot",
    radius: 150, polar: 0.42, azimuth: 2.3, lift: 8, fov: 70, dof: "off",
  },
  diorama: {
    name: "diorama",
    note: "long lens, short focal band: the settlement as a model on a table",
    radius: 168, polar: 0.55, azimuth: 2.15, lift: 10, fov: 30, dof: "diorama",
  },
  approach: {
    name: "approach",
    note: "mid distance, low, the way you would walk up to it",
    radius: 62, polar: 0.16, azimuth: 1.15, lift: 5, fov: 46, dof: "subtle",
  },
  // THE ONE THAT KEPT FAILING. standing in the street means the camera is
  // low, close, and looking ALONG the frontage rather than at it — so the
  // buildings run away from the eye and the near one frames the shot. the
  // near clip comes in because at this range the old 0.1 was letting the
  // camera sit inside a wall.
  street: {
    name: "street",
    note: "head height, in the street, looking along it",
    radius: 17, polar: 0.045, azimuth: 0.72, lift: 2, fov: 62, dof: "subtle",
  },
  gate: {
    name: "gate",
    note: "close on one work, three quarters, the portrait",
    radius: 34, polar: 0.2, azimuth: 1.05, lift: 6, fov: 40, dof: "diorama",
  },
};

export class Photo {
  private savedFov = 70;
  active = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private rig: OrbitRig,
    private post: Post,
    private field: VoxelField,
    private chrome: (on: boolean) => void
  ) {}

  // frame a subject given in CELL coordinates; the rig works in world space
  // centred on the grid, and every caller so far has got that conversion
  // wrong at least once
  frame(preset: keyof typeof FRAMINGS | Framing, cellX: number, cellZ: number) {
    const f = typeof preset === "string" ? FRAMINGS[preset] : preset;
    if (!f) return null;
    const groundY = this.field.topAt(cellX, cellZ);
    this.rig.target.set(cellX - 128 + 0.5, groundY + f.lift, cellZ - 128 + 0.5);
    this.rig.radius = f.radius;
    this.rig.polar = f.polar;
    this.rig.azimuth = f.azimuth;
    if (this.camera.fov !== f.fov) {
      this.camera.fov = f.fov;
      // a long lens needs its near plane back or the close side of a street
      // clips; a wide one needs it forward or the ground plane z-fights
      this.camera.near = f.fov < 45 ? 0.6 : 0.1;
      this.camera.updateProjectionMatrix();
    }
    this.post.dof(f.dof);
    return f;
  }

  enter() {
    if (this.active) return;
    this.active = true;
    this.savedFov = this.camera.fov;
    this.chrome(true);
  }

  leave() {
    if (!this.active) return;
    this.active = false;
    this.camera.fov = this.savedFov;
    this.camera.near = 0.1;
    this.camera.updateProjectionMatrix();
    this.post.dof("off");
    this.chrome(false);
  }

  // THE SHUTTER. two problems, both of which produce a black jpeg if you
  // ignore them.
  //
  // the first is timing: a plate taken the instant a key is pressed catches
  // the grade mid-crossfade, the shadow map one frame stale and the
  // kinetics mid-drop. so it settles first.
  //
  // the second is the drawing buffer. the context is not created with
  // preserveDrawingBuffer — turning that on costs every frame for the sake
  // of the occasional one — so the canvas is empty by the time an ordinary
  // async callback gets to it. the read therefore happens INSIDE the render
  // loop, immediately after the frame is drawn: main calls afterRender and
  // that is the one moment the buffer is guaranteed to hold a picture.
  private pending: ((b: Blob | null) => void) | null = null;

  async shutter(settleMs = 420): Promise<Blob | null> {
    const wasChrome = this.active;
    if (!wasChrome) this.chrome(true);
    await new Promise((r) => setTimeout(r, settleMs));
    const blob = await new Promise<Blob | null>((resolve) => {
      this.pending = resolve;
      // if the loop is not running for some reason, do not hang the caller
      setTimeout(() => {
        if (this.pending === resolve) {
          this.pending = null;
          resolve(null);
        }
      }, 4000);
    });
    if (!wasChrome) this.chrome(false);
    return blob;
  }

  // called by the render loop with the frame still on the canvas
  afterRender(renderer: THREE.WebGLRenderer) {
    if (!this.pending) return;
    const done = this.pending;
    this.pending = null;
    renderer.domElement.toBlob((b) => done(b), "image/jpeg", 0.94);
  }
}
