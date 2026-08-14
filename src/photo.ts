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
  // seventeen blocks at head height in a town is arm's length from a
  // shopfront: the frame came back as one wall with a strip of sky. far
  // enough back that a building fits in the lens, and the search below turns
  // rather than climbs when even that is blocked.
  street: {
    name: "street",
    note: "head height, in the street, looking along it",
    radius: 26, polar: 0.07, azimuth: 0.72, lift: 3, fov: 62, dof: "subtle",
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
  frame(preset: keyof typeof FRAMINGS | Framing, cellX: number, cellZ: number, azimuth?: number) {
    const f = typeof preset === "string" ? FRAMINGS[preset] : preset;
    if (!f) return null;
    const groundY = this.field.topAt(cellX, cellZ);
    this.rig.target.set(cellX - 128 + 0.5, groundY + f.lift, cellZ - 128 + 0.5);
    this.rig.radius = f.radius;
    this.rig.azimuth = azimuth ?? f.azimuth;
    // THE CAMERA HAS TO BE SOMEWHERE THERE IS AIR. the street preset came
    // back as a solid black plate: at a seventeen block radius and almost no
    // polar the rig puts the eye level with its target and seventeen blocks
    // out, which in a town is inside a building. a preset is a wish about
    // where to stand, not a guarantee that anything is standing there.
    //
    // the polar opens until the eye clears, so a shot that would have been
    // taken from inside a wall is taken from just above the roofline instead
    // of not at all. the azimuth is left alone: turning would point the
    // camera at something other than its subject, and rising will not.
    this.rig.polar = f.polar;
    // AIR AT THE EYE IS NOT A SHOT. the old search asked one question — is
    // there stone where the camera is standing — and a one block gap between
    // two buildings answers yes. so the street preset kept coming back
    // technically clear and compositionally a wall: the eye had air, and
    // everything in front of it was a shopfront a metre away.
    //
    // the test is now whether the SUBJECT IS VISIBLE, which is what a framing
    // is actually asking for, and the search turns before it climbs. turning
    // is free on an orbit rig — the camera looks at its target from wherever
    // it stands, so walking round the subject keeps the subject centred and
    // only changes what is between the two. climbing leaves the street
    // altogether, so it is the last resort rather than the first.
    const baseAz = this.rig.azimuth;
    let placed = this.standable();
    if (!placed) {
      // round the subject, alternating either way, so the shot stays as near
      // the intended angle as the obstruction allows
      for (let i = 1; i <= 10 && !placed; i++) {
        for (const dir of [1, -1]) {
          this.rig.azimuth = baseAz + dir * i * 0.32;
          if (this.standable()) { placed = true; break; }
        }
      }
    }
    if (!placed) {
      // then, and only then, back off and rise. it gives up rather than
      // climbing forever: the first version rose in twenty-six steps and
      // ended level with the sky islands, because it asked topAt whether the
      // eye was above the ground and topAt answers with the highest solid in
      // the column — which under an island is the island.
      this.rig.azimuth = baseAz;
      for (let step = 0; step < 9 && !placed; step++) {
        this.rig.polar += 0.055;
        if (step >= 3) this.rig.radius *= 1.1;
        placed = this.standable();
      }
    }
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

  // A PLACE TO STAND is air at the eye AND a view of the subject from it.
  // the second half is the one that was missing, and it is the half that
  // decides whether there is a picture.
  private standable(): boolean {
    if (!this.clear(this.rig.radius, this.rig.polar)) return false;
    return this.sees();
  }

  // march from the eye toward the target. the subject does not have to be
  // fully unobstructed — something in the near corner of a street shot is
  // what makes it a street shot — but the LAST stretch has to be open, or
  // the frame is whatever is standing in the way.
  private sees(): boolean {
    const ch = Math.cos(this.rig.polar) * this.rig.radius;
    const ex = this.rig.target.x + Math.cos(this.rig.azimuth) * ch;
    const ey = this.rig.target.y + Math.sin(this.rig.polar) * this.rig.radius;
    const ez = this.rig.target.z + Math.sin(this.rig.azimuth) * ch;
    const steps = Math.max(8, Math.round(this.rig.radius * 2));
    let blocked = 0;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.round(ex + (this.rig.target.x - ex) * t + 128 - 0.5);
      const y = Math.round(ey + (this.rig.target.y - ey) * t);
      const z = Math.round(ez + (this.rig.target.z - ez) * t + 128 - 0.5);
      if (y < 1) return false;
      if (this.field.isSolid(x, y, z)) {
        blocked++;
        // a solid in the first quarter of the ray is a wall against the lens
        if (t < 0.25) return false;
      }
    }
    // AND THE TOLERANCE HAS TO BE SMALL. a third of the ray blocked let a
    // whole column stand dead centre of the frame and still call the shot
    // clear: the ray IS the line to the subject, so anything sitting on it
    // is sitting on the subject. eight per cent is a railing or a lantern
    // post, which is foreground; more than that is an obstruction.
    return blocked / steps < 0.08;
  }

  // is there air where this radius and polar would put the eye — and a
  // clear metre around it, so the near plane is not buried in a wall
  private clear(radius: number, polar: number): boolean {
    const ch = Math.cos(polar) * radius;
    const px = this.rig.target.x + Math.cos(this.rig.azimuth) * ch;
    const py = this.rig.target.y + Math.sin(polar) * radius;
    const pz = this.rig.target.z + Math.sin(this.rig.azimuth) * ch;
    const cx = Math.round(px + 128 - 0.5);
    const cz = Math.round(pz + 128 - 0.5);
    const cy = Math.round(py);
    if (cx < 2 || cx > 253 || cz < 2 || cz > 253 || cy < 1) return true;
    // SOLIDITY, NOT ALTITUDE. asking whether the eye is above the column's
    // top means asking about whatever happens to be flying over it, and
    // under a sky island the answer is "no" forever. what matters is whether
    // there is stone where the camera is standing.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const dy of [0, -1, 1]) {
          if (this.field.isSolid(cx + dx, cy + dy, cz + dz)) return false;
        }
      }
    }
    return true;
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
