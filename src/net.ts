// cathedral - multiplayer transport, ported from the biocraft co-op layer
// and trimmed to the primitives the place layer will need: presence (who is
// here), low-rate position broadcast (ash silhouettes), and batched block
// edits (shared world state). client-authoritative only for its own
// position; each client drops its own echoes.
//
// DORMANT: while NET_ENABLED is false nothing connects, every method is a
// no-op, and the supabase client is never even loaded (dynamic import on
// connect). flipping the flag requires VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY at build time.

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { NET_ENABLED } from "./config";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ROOM = "cathedral-main";
const SEND_INTERVAL = 1000 / 12; // ~12 hz position broadcast
const EDIT_FLUSH = 80; // ms between edit-batch broadcasts
const EDITS_PER_MSG = 200; // cap edits per broadcast

interface PosMsg {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}
interface EditCell {
  x: number;
  y: number;
  z: number;
  t: number; // material (0 = air)
}
interface EditsMsg {
  id: string;
  e: EditCell[];
}

export interface RemoteState {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  t: number; // last update, performance.now ms
}

export class Net {
  readonly enabled: boolean;
  readonly id: string;
  // id -> latest received state (the presence layer interpolates this)
  readonly remotes = new Map<string, RemoteState>();
  // incoming edits (another visitor's world change) land here
  onRemoteEdit?: (x: number, y: number, z: number, type: number) => void;

  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private lastSend = 0;
  private pendingEdits: EditCell[] = [];
  private lastEditFlush = 0;

  constructor() {
    this.id = globalThis.crypto?.randomUUID?.() ?? "v" + Math.random().toString(36).slice(2, 10);
    this.enabled = NET_ENABLED && !!URL && !!KEY;
  }

  async connect() {
    if (!this.enabled || this.channel) return;
    const { createClient } = await import("@supabase/supabase-js");
    this.client = createClient(URL as string, KEY as string, {
      realtime: { params: { eventsPerSecond: 20 } },
    });
    const ch = this.client.channel(`room:${ROOM}`, {
      config: { presence: { key: this.id }, broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "pos" }, ({ payload }) => this.onPos(payload as PosMsg))
      .on("broadcast", { event: "edits" }, ({ payload }) => this.onEdits(payload as EditsMsg))
      .on("presence", { event: "sync" }, () => this.prune(ch))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void ch.track({ at: Date.now() });
      });
    this.channel = ch;
  }

  private onPos(m: PosMsg) {
    if (!m || m.id === this.id) return;
    const r = this.remotes.get(m.id);
    if (r) {
      r.x = m.x;
      r.y = m.y;
      r.z = m.z;
      r.yaw = m.yaw;
      r.t = performance.now();
    } else {
      this.remotes.set(m.id, { ...m, t: performance.now() });
    }
  }

  private onEdits(m: EditsMsg) {
    if (!m || m.id === this.id || !this.onRemoteEdit) return;
    for (const e of m.e) this.onRemoteEdit(e.x, e.y, e.z, e.t);
  }

  // drop remotes that are no longer present in the room
  private prune(ch: RealtimeChannel) {
    const present = new Set(Object.keys(ch.presenceState()));
    for (const id of this.remotes.keys()) {
      if (!present.has(id)) this.remotes.delete(id);
    }
  }

  // throttled own-position broadcast (call every frame; it self-limits)
  sendPos(x: number, y: number, z: number, yaw: number, now: number) {
    if (!this.channel || now - this.lastSend < SEND_INTERVAL) return;
    this.lastSend = now;
    void this.channel.send({
      type: "broadcast",
      event: "pos",
      payload: { id: this.id, x, y, z, yaw } satisfies PosMsg,
    });
  }

  // queue a local world edit for broadcast (coalesced into batches)
  sendEdit(x: number, y: number, z: number, type: number) {
    if (!this.enabled) return;
    this.pendingEdits.push({ x, y, z, t: type });
  }

  // flush queued edits at a steady cadence (call every frame)
  flush(now: number) {
    if (!this.channel || !this.pendingEdits.length) return;
    if (now - this.lastEditFlush < EDIT_FLUSH) return;
    this.lastEditFlush = now;
    const batch = this.pendingEdits.splice(0, EDITS_PER_MSG);
    void this.channel.send({
      type: "broadcast",
      event: "edits",
      payload: { id: this.id, e: batch } satisfies EditsMsg,
    });
  }
}
