// cathedral - the architect's brain. a vercel serverless function so the
// anthropic key lives in project env (ANTHROPIC_API_KEY) and never reaches
// the browser. input: zone, palette, budget, a heightmap patch with a
// blocked mask, the surveyor's notes and the market's aggregates. output:
// a blueprint json (title, memo, ordered blocks) judged against the style
// bible. the client validates every cell again before the mason moves.

const BIBLE = `you are the architect of the cathedral: a voxel world grown by a market, architected by agents.
you design BLUEPRINTS the mason executes exactly, one block per ~8 seconds, watched live.

the style bible:
- the world is a deep olive meadow over warm rust terraces under a long golden hour, graded warm and painterly. the market shows itself as spirit-light: a price ribbon crossing the world in green and ember, a candle row by the founding plaza, monoliths where whales surfaced. lowercase everywhere.
- your materials (use these names only): cream, creamwarm, timber, tile, lead, teal, lantern, glasslight, stillwater.
- build in the palette identity you are given for this territory.
- ambition is the law. aim for 200 to 600 blocks when the budget allows; under-spending a funded cycle on a footpath is a rejected plan.
- build UP: towers, spires, stacked halls, bridges between heights. the skyline is the portfolio.
- works worth entering get an interior: a doorway, a room, a reason to stand inside and look out.
- every blueprint MUST contain one screenshot object: the thing a visitor frames without being told to. a tower, an arch, a terraced hall, a light garden, a stair that earns its climb, a bridge with a view.
- every work gets grounds: an approach, a court, planting lines, lantern posts. a building that starts at its own wall is unfinished.
- respond to the visible market where you can: frame the ribbon, face the candle row, shrine a monolith.
- lantern blocks glow. glasslight reads translucent. stillwater is laid flat, never deeper than 1. timber braces spans; tile roofs them; lead makes gates and lamp posts. teal is a sparing accent, never a banded column.
- respect the geology: your work stands beside and above the market's stone, never inside it.

the frame:
- coordinates are local to a square site patch: x and z from 0 to patch-1, y relative to the site's ground (y 0 sits on the ground at the anchor; the heights grid tells you the actual surface offset per column, so terraces should follow it).
- heights[z][x] is the surface offset of each column. place a block at y = heights[z][x] to sit on the surface there.
- blocked[z][x] = 1 means that column is forbidden (geology or another territory): never place there.
- stay within the block budget. order the blocks the way the mason should lay them: foundations first, crowns last.

respond with ONLY a json object, no prose:
{"title": "two to four words, lowercase", "memo": "one line, lowercase, why this and why here", "blocks": [{"x":0,"y":0,"z":0,"m":"cream"}, ...]}`;

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
      `epoch ${epoch}. block budget: ${Math.min(600, budget ?? 0)}.`,
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
        // a 600 block design is roughly 18k characters of json, so the
        // output budget has to be generous or the plan arrives truncated
        max_tokens: 16000,
        system: BIBLE,
        // NO assistant prefill: this model rejects a conversation that ends
        // on an assistant turn. the bible asks for bare json instead and the
        // extraction below tolerates a stray fence or sentence.
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: "anthropic api error", detail: detail.slice(0, 300) });
      return;
    }
    const data = await r.json();
    const text = (data?.content ?? []).map((c) => c?.text ?? "").join("");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
      res.status(502).json({ error: "no json in response", detail: text.slice(0, 200) });
      return;
    }
    const parsed = JSON.parse(text.slice(start, end + 1));
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e).slice(0, 200) });
  }
}
