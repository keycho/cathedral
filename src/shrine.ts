// cathedral - the shrine of epochs. the time-lapse made diegetic: a small
// arc of dressed posts beside the founding stone holding a glasslight
// tablet. inspect the tablet and the world replays its own history in
// light: every stratum flashes gold in the order of its birth epoch, a
// wave of memory passing from the oldest stone to the newest, then
// settling back into its resting colour. the shrine is the world's own
// furniture, not the crew's work.

import { GRID, MAXY } from "./config";
import { DRESSED, GLASSLIGHT, LANTERN } from "./palette";
import type { Strata } from "./strata";
import type { VoxelField } from "./voxels";
import { audio } from "./audio";

const FLASH = 0xffe9a8; // the memory colour
const EPOCH_MS = 420; // replay pace: one epoch cohort per this
const HOLD_MS = 1300; // how long a cohort holds its flash

interface Cohort {
  epoch: number;
  cells: number[];
  flashedAt: number; // 0 = not yet
}

export class Shrine {
  private parts = new Set<number>();
  private tablet = -1;
  private playing: Cohort[] | null = null;
  private playCursor = 0;
  private lastFlash = 0;

  constructor(
    private field: VoxelField,
    private strata: Strata,
    genesisCell: { x: number; z: number }
  ) {
    const gx = genesisCell.x;
    const gz = genesisCell.z;
    const place = (x: number, z: number, types: number[]) => {
      const y0 = this.field.topAt(x, z);
      for (let k = 0; k < types.length; k++) {
        const y = y0 + k;
        if (!this.field.placeAt(x, y, z, types[k])) return -1;
        this.strata.lock(x, y, z);
        this.strata.register(x, y, z, -1, "shrine");
        this.parts.add(this.idx(x, y, z));
      }
      return this.idx(x, y0 + types.length - 1, z);
    };
    // three posts in an arc northwest of the stone, the middle one lit
    place(gx - 6, gz - 3, [DRESSED, DRESSED]);
    place(gx - 5, gz - 5, [DRESSED, DRESSED, LANTERN]);
    place(gx - 3, gz - 6, [DRESSED, DRESSED]);
    // the tablet: a glasslight face on a dressed base
    this.tablet = place(gx - 4, gz - 4, [DRESSED, GLASSLIGHT]);
  }

  private idx(x: number, y: number, z: number): number {
    return (x * GRID + z) * MAXY + y;
  }
  private unpack(i: number): [number, number, number] {
    const y = i % MAXY;
    const xz = (i - y) / MAXY;
    const z = xz % GRID;
    const x = (xz - z) / GRID;
    return [x, y, z];
  }

  isPart(x: number, y: number, z: number): boolean {
    return this.parts.has(this.idx(x, y, z));
  }
  isTablet(x: number, y: number, z: number): boolean {
    return this.idx(x, y, z) === this.tablet;
  }

  plaque(x: number, y: number, z: number): string[] {
    if (this.isTablet(x, y, z)) {
      return [
        "the shrine of epochs",
        this.playing ? "the world is remembering" : "the world remembers itself",
        "inspect the tablet and watch the past return",
      ];
    }
    return ["the shrine of epochs", "the world's own furniture. it was set at the founding."];
  }

  // the replay: cohorts by birth epoch, oldest first
  play(now: number) {
    if (this.playing) return;
    const byEpoch = new Map<number, number[]>();
    this.strata.forEachProv((i, p) => {
      if (this.strata.locked.has(i)) return; // lit things keep their light
      const arr = byEpoch.get(p.epoch);
      if (arr) arr.push(i);
      else byEpoch.set(p.epoch, [i]);
    });
    if (!byEpoch.size) return;
    this.playing = [...byEpoch.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([epoch, cells]) => ({ epoch, cells, flashedAt: 0 }));
    this.playCursor = 0;
    this.lastFlash = now - EPOCH_MS; // the first cohort lights immediately
    audio.toll(0.25);
  }

  get isPlaying(): boolean {
    return !!this.playing;
  }

  update(now: number) {
    if (!this.playing) return;
    // light the next cohort on pace
    if (this.playCursor < this.playing.length && now - this.lastFlash >= EPOCH_MS) {
      this.lastFlash = now;
      const c = this.playing[this.playCursor++];
      c.flashedAt = now;
      for (const i of c.cells) {
        const [x, y, z] = this.unpack(i);
        this.field.tintAt(x, y, z, FLASH);
      }
    }
    // settle cohorts whose light has held long enough
    let allSettled = this.playCursor >= this.playing.length;
    for (const c of this.playing) {
      if (c.flashedAt === 0) {
        allSettled = false;
        continue;
      }
      if (c.flashedAt > 0 && now - c.flashedAt >= HOLD_MS) {
        for (const i of c.cells) {
          const [x, y, z] = this.unpack(i);
          if (!this.strata.locked.has(i) && !this.strata.isOverridden?.(i)) {
            this.field.tintAt(x, y, z, this.strata.restingColor(i));
          }
        }
        c.flashedAt = -1; // settled
      } else if (c.flashedAt > 0) {
        allSettled = false;
      }
    }
    if (allSettled) {
      this.playing = null;
      this.strata.retintAll(); // belt and braces: every stone back to rest
    }
  }
}
