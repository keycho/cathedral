// cathedral - the crew log: every field note, design memo and completion
// the crew writes, public, on screen. this is the seed of the per-agent
// journals that publish to the site in phase 3.

import { AGENT_COLORS, type AgentName } from "./crew";

const KEEP = 400; // the public log keeps far more than the screen shows
const SHOW = 8;

export interface JournalEntry {
  agent: AgentName;
  epoch: number;
  text: string;
  at: number; // wall clock, so the feed can date an entry
}

export class Journal {
  readonly entries: JournalEntry[] = [];
  private root: HTMLElement;
  private list: HTMLElement;

  constructor() {
    this.root = document.getElementById("journal") as HTMLElement;
    const head = document.createElement("div");
    head.className = "jr-head";
    head.textContent = "crew log";
    this.root.appendChild(head);
    this.list = document.createElement("div");
    this.list.className = "jr-list";
    this.root.appendChild(this.list);
    head.addEventListener("click", () => this.root.classList.toggle("folded"));
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyJ") this.root.classList.toggle("folded");
    });
  }

  // main wires this: every entry is published as it is written
  onEntry?: (e: JournalEntry) => void;

  add(agent: AgentName, epoch: number, text: string) {
    const e: JournalEntry = { agent, epoch, text, at: Date.now() };
    this.entries.push(e);
    if (this.entries.length > KEEP) this.entries.shift();
    this.onEntry?.(e);
    this.render();
  }

  // the public journals, as a feed. the crew's log is meant to be read
  // from outside the world, so it serialises to rss here and the site can
  // serve it. persistence lands with the indexer in phase 2; until then a
  // feed carries the running session's entries.
  rss(origin = ""): string {
    const esc = (t: string) =>
      t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const items = this.entries
      .slice()
      .reverse()
      .map(
        (e) =>
          `    <item>\n` +
          `      <title>${esc(e.agent)} · epoch ${e.epoch}</title>\n` +
          `      <description>${esc(e.text)}</description>\n` +
          `      <pubDate>${new Date(e.at).toUTCString()}</pubDate>\n` +
          `      <guid isPermaLink="false">${e.at}-${esc(e.agent)}</guid>\n` +
          `    </item>`
      )
      .join("\n");
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<rss version="2.0">\n  <channel>\n` +
      `    <title>cathedral · the crew log</title>\n` +
      `    <link>${origin}</link>\n` +
      `    <description>field notes, design memos and completions from the crew that keeps this world</description>\n` +
      `${items}\n  </channel>\n</rss>`
    );
  }

  // the architect reads the surveyor's recent notes
  notesBy(agent: AgentName, n: number): string[] {
    return this.entries
      .filter((e) => e.agent === agent)
      .slice(-n)
      .map((e) => e.text);
  }

  private render() {
    this.list.innerHTML = "";
    for (const e of this.entries.slice(-SHOW)) {
      const row = document.createElement("div");
      row.className = "jr-row";
      const who = document.createElement("span");
      who.className = "jr-who";
      who.textContent = e.agent;
      who.style.color = "#" + AGENT_COLORS[e.agent].toString(16).padStart(6, "0");
      const txt = document.createElement("span");
      txt.className = "jr-text";
      txt.textContent = e.text;
      row.appendChild(who);
      row.appendChild(txt);
      this.list.appendChild(row);
    }
    this.list.scrollTop = this.list.scrollHeight;
  }
}
