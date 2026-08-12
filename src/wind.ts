// cathedral - the wind. one vector field the whole world obeys: the grass
// leans with it, the seeds ride it, the banners ripple along it, the clouds
// walk with it. a slow turning direction with gusts rolling through, so the
// air reads as weather rather than as several unrelated animations.
//
// everything that moves reads the same uniform: x/y are the direction, z is
// the current gust strength, w is time. shaders get it for free; cpu-side
// systems call sample().

import * as THREE from "three";

const TURN = 0.017; // rad/s the prevailing direction wanders
const GUST_HZ = 0.11; // slow swell
const GUST_FAST = 0.37; // the ripple inside the swell

export class Wind {
  // shared with every shader that moves: (dirX, dirZ, gust, time)
  readonly uniform = { value: new THREE.Vector4(1, 0, 0.5, 0) };
  private angle = 0.7;

  get dirX(): number {
    return this.uniform.value.x;
  }
  get dirZ(): number {
    return this.uniform.value.y;
  }
  get gust(): number {
    return this.uniform.value.z;
  }

  // the gust at a place: the same rolling wave the shaders see, so cpu
  // motion and gpu motion agree
  sample(t: number, x: number, z: number): number {
    const phase = (x * 0.05 + z * 0.04) - t * 0.6;
    return 0.5 + 0.5 * Math.sin(phase * GUST_HZ * Math.PI * 2) * Math.sin(t * GUST_FAST + phase * 0.3);
  }

  update(dt: number, t: number) {
    this.angle += TURN * dt;
    const g = 0.55 + 0.45 * Math.sin(t * GUST_HZ * Math.PI * 2) * Math.sin(t * GUST_FAST * 0.5);
    this.uniform.value.set(Math.cos(this.angle), Math.sin(this.angle), g, t);
  }
}
