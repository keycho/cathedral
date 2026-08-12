// cathedral - the architect's brain. a vercel serverless function so the
// anthropic key lives in project env (ANTHROPIC_API_KEY) and never reaches
// the browser. input: zone, palette, budget, a heightmap patch with a
// blocked mask, the surveyor's notes and the market's aggregates. output:
// a blueprint json (title, memo, ordered blocks) judged against the style
// bible. the client validates every cell again before the mason moves.

const BIBLE = `you are the architect of the cathedral: a voxel world grown by a market, architected by agents.
you design BLUEPRINTS the mason executes exactly, one block per ~8 seconds, watched live.

the style bible:
- the world is warm black, ashfall dusk, long shadows. lowercase everywhere.
- your materials (use these names only): dressed, teal, violet, lantern, glasslight, crimson, gold, stillwater.
- build in the palette identity you are given for this territory.
- every blueprint MUST contain at least one thing a visitor would screenshot: a tower, an arch, a terraced hall, a plaza, a light garden, a stair that earns its climb. utilitarian-only plans are rejected.
- paths and walls exist to carry a visitor to the thing worth seeing.
- lantern blocks glow. glasslight reads translucent against the dusk. stillwater is laid flat, never deeper than 1.
- respect the geology: your work stands beside and above the market's stone, never inside it.

the frame:
- coordinates are local to a square site patch: x and z from 0 to patch-1, y relative to the site's ground (y 0 sits on the ground at the anchor; the heights grid tells you the actual surface offset per column, so terraces should follow it).
- heights[z][x] is the surface offset of each column. place a block at y = heights[z][x] to sit on the surface there.
- blocked[z][x] = 1 means that column is forbidden (geology or another territory): never place there.
- stay within the block budget. order the blocks the way the mason should lay them: foundations first, crowns last.

respond with ONLY a json object, no prose:
{"title": "two to four words, lowercase", "memo": "one line, lowercase, why this and why here", "blocks": [{"x":0,"y":0,"z":0,"m":"dressed"}, ...]}`;

let lastCall = 0;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "post only" });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(503).json({ error: "no key configured" });
    return;
  }
  // one design per 90s per instance: the cadence is epochs, not spam
  const now = Date.now();
  if (now - lastCall < 90_000) {
    res.status(429).json({ error: "the architect is still drawing" });
    return;
  }
  lastCall = now;

  try {
    const { zone, palette, budget, patch, heights, blocked, notes, aggregates, epoch } = req.body ?? {};
    const user = [
      `territory: the ${zone}'s third. palette identity: ${palette}.`,
      `epoch ${epoch}. block budget: ${Math.min(400, budget ?? 0)}.`,
      `site patch: ${patch}x${patch}.`,
      `heights[z][x]: ${JSON.stringify(heights)}`,
      `blocked[z][x]: ${JSON.stringify(blocked)}`,
      `the surveyor's recent notes:`,
      ...(Array.isArray(notes) ? notes.map((n) => `- ${n}`) : []),
      `market aggregates (last ticks): ${JSON.stringify(aggregates)}`,
      `design one blueprint for this site.`,
    ].join("\n");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 8000,
        system: BIBLE,
        messages: [
          { role: "user", content: user },
          { role: "assistant", content: "{" },
        ],
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: "anthropic api error", detail: detail.slice(0, 300) });
      return;
    }
    const data = await r.json();
    const text = "{" + (data?.content?.[0]?.text ?? "");
    const end = text.lastIndexOf("}");
    if (end < 0) {
      res.status(502).json({ error: "no json in response" });
      return;
    }
    const parsed = JSON.parse(text.slice(0, end + 1));
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e).slice(0, 200) });
  }
}
