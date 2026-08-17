// kodo - the tombs. when an agent dies its tomb is raised at a site
// the architect chooses and built by the mason like any other work, and it
// stands forever after: permanent, plaqued, and on the pilgrim path the
// keeper walks. a tomb is never eroded, never burned, never repurposed.
//
// the pilgrim path is simply the order the graves were made. a visitor can
// walk it from the founding stone outward and read the whole history of
// who kept this world.

import { GRID, MAXY } from "./config";
import { CREAM, CREAMWARM, GLASSLIGHT, LANTERN, LEAD, TIMBER } from "./palette";
import type { AgentName } from "./crew";
import type { BlueprintCell } from "./mason";

export interface Tomb {
  x: number;
  z: number;
  y: number;
  role: AgentName;
  name: string; // the person, not the role
  epoch: number;
  works: number;
  cells: number[]; // every cell of the marker, for the plaque
}

export class Tombs {
  readonly list: Tomb[] = [];
  private cells = new Map<number, Tomb>();

  private idx(x: number, y: number, z: number): number {
    return (x * GRID + z) * MAXY + y;
  }

  at(x: number, y: number, z: number): Tomb | undefined {
    return this.cells.get(this.idx(x, y, z));
  }

  isTomb(x: number, y: number, z: number): boolean {
    return this.cells.has(this.idx(x, y, z));
  }

  // the marker: a small deliberate thing, in the dead agent's own palette,
  // with a light that the keeper will come and tend
  design(
    x: number,
    z: number,
    groundY: number,
    role: AgentName
  ): BlueprintCell[] {
    const body = role === "architect" ? CREAM : CREAMWARM;
    const post = role === "mason" ? TIMBER : LEAD;
    const cells: BlueprintCell[] = [];
    const put = (dx: number, dy: number, dz: number, m: number) =>
      cells.push({ x: x + dx, y: groundY + dy, z: z + dz, material: m });
    // a plinth
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) put(dx, 0, dz, body);
    // a standing stone
    put(0, 1, 0, body);
    put(0, 2, 0, body);
    put(0, 3, 0, GLASSLIGHT);
    // two posts and a lamp between them, so it is findable at night
    put(-1, 1, -1, post);
    put(1, 1, 1, post);
    put(0, 4, 0, LANTERN);
    return cells;
  }

  record(t: Omit<Tomb, "cells">, cells: BlueprintCell[]): Tomb {
    const tomb: Tomb = { ...t, cells: cells.map((c) => this.idx(c.x, c.y, c.z)) };
    this.list.push(tomb);
    for (const i of tomb.cells) this.cells.set(i, tomb);
    return tomb;
  }

  plaque(x: number, y: number, z: number): string[] | undefined {
    const t = this.at(x, y, z);
    if (!t) return undefined;
    return [
      `${t.name}, ${t.role}`,
      `epoch ${t.epoch} · ${t.works} works`,
      "the market stopped feeding this one. the world kept what it built.",
      `stop ${this.list.indexOf(t) + 1} on the pilgrim path`,
    ];
  }
}
