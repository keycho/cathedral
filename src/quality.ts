// cathedral - ONE configuration, and a ladder it climbs down in silence.
//
// there is no quality menu. a visitor arriving at a world should see the
// world, not a settings screen, and a 24/7 stream cannot depend on someone
// picking the right option. so the world ships one good setting and, if the
// machine cannot hold the frame, it quietly gives things up in an order we
// chose in advance. the visitor is never told and never asked.
//
// the frame budget that matters: 60fps at orbit AND walking, on a normal
// laptop gpu, on the aged world.

export interface Config {
  pixelRatio: number;
  bloom: boolean; // emissive halo
  grade: boolean; // lut + vignette + haze
  haze: boolean; // depth scattering, inside the grade pass
  shadowMapSize: number;
  shadowRadius: number;
  shadowFrustum: number; // half-width of the sun's shadow camera
  shadowEvery: number; // refresh the map every n frames
  driftLayers: number;
  stars: number;
}

// step 0 is the world as designed. every step below it is a concession,
// ordered cheapest-loss-first: resolution and shadow detail go before the
// look does, and the grade is the last thing to leave because it carries
// the world's colour.
//
// NOTE: no ground-truth occlusion at any step. it costs a full extra scene
// pass (the depth/normal prepass renders every chunk again), which is a
// third of the frame, and it washes out the sun's own shadows. the contact
// darkening is not worth a third of the budget.
const LADDER: Config[] = [
  {
    pixelRatio: 2,
    bloom: true,
    grade: true,
    haze: true,
    shadowMapSize: 2048,
    shadowRadius: 3,
    shadowFrustum: 48,
    shadowEvery: 2,
    driftLayers: 3,
    stars: 1500,
  },
  {
    pixelRatio: 1.5,
    bloom: true,
    grade: true,
    haze: true,
    shadowMapSize: 1024,
    shadowRadius: 2,
    shadowFrustum: 44,
    shadowEvery: 3,
    driftLayers: 2,
    stars: 900,
  },
  {
    pixelRatio: 1.25,
    bloom: false,
    grade: true,
    haze: true,
    shadowMapSize: 1024,
    shadowRadius: 2,
    shadowFrustum: 40,
    shadowEvery: 4,
    driftLayers: 2,
    stars: 600,
  },
  {
    pixelRatio: 1,
    bloom: false,
    grade: false,
    haze: false,
    shadowMapSize: 1024,
    shadowRadius: 2,
    shadowFrustum: 36,
    shadowEvery: 6,
    driftLayers: 1,
    stars: 400,
  },
];

export const STEPS = LADDER.length;

// a phone starts one step down: not because it was measured there, but
// because arriving at 30fps and climbing down is a worse first second than
// arriving already trimmed.
export function startStep(): number {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile) return 2;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (cores <= 4) return 1;
  return 0;
}

export function configAt(step: number): Config {
  return { ...LADDER[Math.max(0, Math.min(LADDER.length - 1, step))] };
}

// the watchdog. it watches the frame, not the machine's opinion of itself,
// and it only ever steps DOWN: a world that oscillates between settings is
// worse than one that settles a notch low.
export class AutoQuality {
  private step: number;
  private samples: number[] = [];
  private lastChange = 0;
  private startedAt = 0;

  constructor(private onStep: (c: Config, step: number) => void) {
    this.step = startStep();
  }

  begin(now: number) {
    this.startedAt = now;
    this.lastChange = now;
    this.onStep(configAt(this.step), this.step);
  }

  get current(): number {
    return this.step;
  }

  // called every frame with the frame's duration in seconds
  update(dt: number, now: number) {
    // the first seconds are the aged boot and the shader warm-up: nothing
    // measured there says anything about the steady frame
    if (now - this.startedAt < 6000) return;
    this.samples.push(dt);
    if (this.samples.length < 90) return;
    // the median frame, so one stall never costs the world its look
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.samples.length = 0;
    if (this.step >= STEPS - 1) return;
    if (now - this.lastChange < 4000) return;
    // 60fps is 16.7ms. a median past 20ms is a machine that is not holding
    // the frame, and it gets a quieter world without being asked.
    if (median > 0.02) {
      this.step++;
      this.lastChange = now;
      this.onStep(configAt(this.step), this.step);
    }
  }
}
