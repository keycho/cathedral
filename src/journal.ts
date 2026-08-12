// cathedral - the crew log: every field note, design memo and completion
// the crew writes, public, on screen. this is the seed of the per-agent
// journals that publish to the site in phase 3.

import { AGENT_COLORS, type AgentName } from "./crew";

const KEEP = 40;
const SHOW = 8;

export interface JournalEntry {
  agent: AgentName;
  epoch: number;
  text: string;
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

  add(agent: AgentName, epoch: number, text: string) {
    this.entries.push({ agent, epoch, text });
    if (this.entries.length > KEEP) this.entries.shift();
    this.render();
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
