// cathedral - weather and season. the world had one sky and one climate: a
// long golden hour that never changed its mind. a place you watch for hours
// needs the sky to DO something, and it needs the doing to mean something —
// so the weather is on a clock and its violence is the market's.
//
// four states, and each one is a different picture of the same world:
//
//   clear   the world as designed
//   rain    surfaces darken, the wet paving catches every light twice, the
//           air streaks, and the eaves drip
//   snow    tile and ground and branches take a white course, and the whole
//           palette is muffled toward the sky's own grey
//   fog     the valley pool, already built, tied into the cycle at dawn
//
// and a season underneath it, which is slower and only touches the woods and
// the drift in the air.
//
// the market decides the intensity, not the state: a storm is what selling
// pressure looks like from inside the world. quiet days are clear. that
// mapping is the whole reason weather belongs in this project rather than
// being set dressing.

import * as THREE from "three";
import { GRID } from "./config";
import { SWATCH } from "./palette";
import type { Wind } from "./wind";

export type Sky = "clear" | "rain" | "snow" | "fog";
export type Season = "spring" | "summer" | "autumn" | "winter";

const DROPS = 1400;
const FLAKES = 900;

export class Weather {
  state: Sky = "clear";
  season: Season = "spring";
  // 0..1. the market moves this; the state only says what KIND of weather
  intensity = 0;

  private rain: THREE.InstancedMesh;
  private snow: THREE.InstancedMesh;
  private drift: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private p = new THREE.Vector3();
  private t = 0;
  private seed: Float32Array;
  private held = 0; // seconds in the current state

  constructor(scene: THREE.Scene) {
    // rain is a long thin quad falling fast; at any real speed a drop is a
    // streak rather than a dot, which is also why it can be so few of them
    const rainMat = new THREE.MeshBasicMaterial({
      color: SWATCH.mist,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.rain = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 2.2), rainMat, DROPS);
    this.rain.count = 0;
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    const snowMat = new THREE.MeshBasicMaterial({
      color: 0xf2f4f2,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.snow = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.13), snowMat, FLAKES);
    this.snow.count = 0;
    this.snow.frustumCulled = false;
    scene.add(this.snow);

    // the seasonal drift: petals in spring, leaves in autumn. same mesh,
    // different colour, because it is the same motion.
    const driftMat = new THREE.MeshBasicMaterial({
      color: SWATCH.blossom,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.drift = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.2), driftMat, 420);
    this.drift.count = 0;
    this.drift.frustumCulled = false;
    scene.add(this.drift);

    // one seed per particle: position in a column above the camera, and a
    // phase, so nothing has to be stored per frame
    this.seed = new Float32Array(DROPS * 4);
    for (let i = 0; i < DROPS; i++) {
      this.seed[i * 4] = Math.random();
      this.seed[i * 4 + 1] = Math.random();
      this.seed[i * 4 + 2] = Math.random();
      this.seed[i * 4 + 3] = Math.random();
    }
  }

  // THE MARKET IS THE WEATHER'S TEMPER. the state comes off a clock so the
  // day has a shape whatever the market does; how hard it comes down is the
  // selling pressure. a storm on a red hour is the world agreeing with the
  // tape, and a clear sky on a quiet one is the same agreement.
  drive(dt: number, phase01: number, sellPressure: number, epoch: number) {
    this.held += dt;
    // dawn belongs to the fog: it is already built and it is the best thing
    // the sky does
    const dawn = phase01 > 0.54 && phase01 < 0.63;
    if (dawn && this.state !== "fog" && this.held > 20) {
      this.state = "fog";
      this.held = 0;
    } else if (!dawn && this.state === "fog") {
      this.state = "clear";
      this.held = 0;
    } else if (!dawn && this.held > 210) {
      // a state holds for a few minutes and then the clock rolls it. the
      // roll is seeded on the epoch so two visitors on the same world see
      // the same weather.
      const r = ((Math.sin(epoch * 12.9898 + Math.floor(this.t / 210) * 78.233) * 43758.5453) % 1 + 1) % 1;
      const winter = this.season === "winter";
      this.state = r < 0.52 ? "clear" : r < (winter ? 0.62 : 0.86) ? "rain" : winter ? "snow" : "rain";
      this.held = 0;
    }
    // the season turns on the epoch, four epochs to a season
    this.season = (["spring", "summer", "autumn", "winter"] as Season[])[Math.floor(epoch / 4) % 4];
    if (this.season === "winter" && this.state === "rain") this.state = "snow";

    const want = this.state === "clear" || this.state === "fog" ? 0 : 0.25 + sellPressure * 0.75;
    this.intensity += (want - this.intensity) * Math.min(1, dt * 0.35);
  }

  update(dt: number, camera: THREE.Camera, wind: Wind) {
    this.t += dt;
    const wx = wind.dirX * (0.6 + wind.gust);
    const wz = wind.dirZ * (0.6 + wind.gust);
    camera.getWorldPosition(this.p);
    camera.getWorldDirection(_d);
    const yaw = Math.atan2(-_d.x, -_d.z);

    // rain and snow fall in a COLUMN AROUND THE CAMERA rather than over the
    // world: a field of drops covering a 256 grid is a quarter of a million
    // particles to put forty in frame, and the ones out of frame are not
    // doing anything.
    const box = 34;
    const n = Math.floor((this.state === "rain" ? DROPS : this.state === "snow" ? FLAKES : 0) * this.intensity);
    const mesh = this.state === "snow" ? this.snow : this.rain;
    const other = this.state === "snow" ? this.rain : this.snow;
    other.count = 0;
    const fall = this.state === "snow" ? 2.4 : 26;
    const span = this.state === "snow" ? 26 : 30;
    for (let i = 0; i < n; i++) {
      const s0 = this.seed[i * 4];
      const s1 = this.seed[i * 4 + 1];
      const s2 = this.seed[i * 4 + 2];
      const s3 = this.seed[i * 4 + 3];
      const drop = (this.t * fall * (0.7 + s3 * 0.6) + s1 * span) % span;
      const y = this.p.y + 16 - drop;
      const sway = this.state === "snow" ? Math.sin(this.t * 1.4 + s2 * 9) * 1.4 : 0;
      // FACING THE CAMERA, which this was not: the yaw was computed from the
      // camera's position minus the camera's own position, which is zero
      // forever, so every drop faced due north and a streak seen edge-on is
      // a floating speck. one yaw serves them all — they are within twenty
      // blocks of the lens.
      this.q.setFromAxisAngle(_up, yaw);
      this.v.set(1, 1, 1);
      this.m.compose(
        _t.set(
          this.p.x + (s0 - 0.5) * box + sway + wx * drop * 0.35,
          y,
          this.p.z + (s2 - 0.5) * box + wz * drop * 0.35
        ),
        this.q,
        this.v
      );
      mesh.setMatrixAt(i, this.m);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    other.instanceMatrix.needsUpdate = true;

    // the seasonal drift, which is not weather: it falls in spring and
    // autumn whatever the sky is doing
    const drifting = this.season === "spring" || this.season === "autumn";
    const dn = drifting ? 420 : 0;
    (this.drift.material as THREE.MeshBasicMaterial).color.setHex(
      this.season === "spring" ? SWATCH.blossom : SWATCH.tile
    );
    for (let i = 0; i < dn; i++) {
      const s0 = this.seed[i * 4];
      const s1 = this.seed[i * 4 + 1];
      const s2 = this.seed[i * 4 + 2];
      const drop = (this.t * 1.1 + s1 * 24) % 24;
      this.q.setFromAxisAngle(_up, yaw + this.t * 0.7 + s2 * 6);
      this.m.compose(
        _t.set(
          this.p.x + (s0 - 0.5) * box + Math.sin(this.t * 0.9 + s2 * 7) * 2.2 + wx * drop * 0.5,
          this.p.y + 12 - drop,
          this.p.z + (s2 - 0.5) * box + wz * drop * 0.5
        ),
        this.q,
        this.v.set(1, 1, 1)
      );
      this.drift.setMatrixAt(i, this.m);
    }
    this.drift.count = dn;
    this.drift.instanceMatrix.needsUpdate = true;
  }

  // what the rest of the world needs to know: how wet the ground is, how
  // much white is on it, and how far the palette should be pulled toward
  // the sky. the water shader and the grade read these.
  get wetness(): number {
    return this.state === "rain" ? this.intensity : 0;
  }
  get snowCover(): number {
    return this.state === "snow" ? this.intensity : 0;
  }
  get muffle(): number {
    return this.state === "snow" ? this.intensity * 0.6 : this.state === "rain" ? this.intensity * 0.25 : 0;
  }

  setVisible(on: boolean) {
    this.rain.visible = on;
    this.snow.visible = on;
    this.drift.visible = on;
  }
}

const _up = new THREE.Vector3(0, 1, 0);
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
void GRID;
