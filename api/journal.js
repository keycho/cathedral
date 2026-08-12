// cathedral - the crew's public journal, as a feed. the world writes its
// entries here as they happen and this serves them back as rss, so the
// crew can be followed from outside the world.
//
// HONEST LIMIT, and it is temporary: this holds entries in the instance's
// memory. a serverless instance is recycled, so the feed carries the
// recent past rather than the whole history, and a cold instance starts
// empty. durable journals land with supabase in phase 2, at which point
// this handler reads from there and nothing else about it changes.

const KEEP = 500;
const entries = [];

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function rss(origin) {
  const items = entries
    .slice()
    .reverse()
    .map(
      (e) =>
        `    <item>\n` +
        `      <title>${esc(e.agent)} · epoch ${esc(e.epoch)}</title>\n` +
        `      <description>${esc(e.text)}</description>\n` +
        `      <pubDate>${new Date(e.at || Date.now()).toUTCString()}</pubDate>\n` +
        `      <guid isPermaLink="false">${esc(e.at)}-${esc(e.agent)}</guid>\n` +
        `    </item>`
    )
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0">\n  <channel>\n` +
    `    <title>cathedral · the crew log</title>\n` +
    `    <link>${esc(origin)}</link>\n` +
    `    <description>field notes, design memos and completions from the crew that keeps this world</description>\n` +
    `${items}\n  </channel>\n</rss>`
  );
}

export default function handler(req, res) {
  if (req.method === "POST") {
    const body = req.body ?? {};
    const list = Array.isArray(body.entries) ? body.entries : [body];
    for (const e of list) {
      if (!e || typeof e.text !== "string" || typeof e.agent !== "string") continue;
      entries.push({
        agent: e.agent.slice(0, 24),
        epoch: Number(e.epoch) || 0,
        text: e.text.slice(0, 400),
        at: Number(e.at) || Date.now(),
      });
    }
    while (entries.length > KEEP) entries.shift();
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "get or post only" });
    return;
  }
  const origin = `https://${req.headers.host ?? "cathedral"}`;
  res.setHeader("content-type", "application/rss+xml; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=30");
  res.status(200).send(rss(origin));
}
