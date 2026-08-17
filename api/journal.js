// kodo - the crew's public journal, as a feed. the world writes its
// entries here as they happen and this serves them back as rss, so the
// crew can be followed from outside the world.
//
// IT IS DURABLE NOW, and that was the whole reason the log read empty on a
// live domain. this used to hold entries in the serverless instance's
// memory: a visitor's browser posted its crew's notes, the instance that
// received them was recycled minutes later, and the next reader got a
// cold instance holding nothing. worse, every visitor was posting a
// DIFFERENT world's notes, because the crew runs in the browser — so the
// feed was a blur of parallel worlds even while it was warm.
//
// entries go to supabase when the service role key is configured, which
// makes the log one shared history that survives everything. memory stays
// as the fallback so a misconfigured deploy degrades to what it did
// before rather than losing the endpoint entirely.

const KEEP = 500;
const entries = [];

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_KEY ?? "";
const durable = Boolean(SUPABASE_URL && SERVICE_ROLE);

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function put(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/journal`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`journal insert ${res.status}: ${(await res.text()).slice(0, 160)}`);
}

async function read(limit = 200) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/journal?select=agent,epoch,text,source,at&order=at.desc&limit=${limit}`,
    {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) throw new Error(`journal read ${res.status}`);
  return (await res.json()).map((r) => ({
    agent: r.agent,
    epoch: r.epoch,
    text: r.text,
    source: r.source,
    at: Date.parse(r.at),
  }));
}

function rss(origin, list) {
  const items = list
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
    `    <title>kodō · the crew log</title>\n` +
    `    <link>${esc(origin)}</link>\n` +
    `    <description>field notes, design memos and completions from the crew that keeps this world</description>\n` +
    `${items}\n  </channel>\n</rss>`
  );
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    const body = req.body ?? {};
    const list = Array.isArray(body.entries) ? body.entries : [body];
    const clean = [];
    for (const e of list) {
      if (!e || typeof e.text !== "string" || typeof e.agent !== "string") continue;
      clean.push({
        agent: e.agent.slice(0, 24),
        epoch: Number(e.epoch) || 0,
        text: e.text.slice(0, 400),
        // where the words came from: a real model call or the scripted
        // voice. the feed is worth less if you cannot tell them apart.
        source: typeof e.source === "string" ? e.source.slice(0, 24) : "scripted",
        at: Number(e.at) || Date.now(),
      });
    }
    if (!clean.length) return res.status(204).end();
    if (durable) {
      try {
        await put(clean.map((e) => ({ ...e, at: new Date(e.at).toISOString() })));
        return res.status(204).end();
      } catch (err) {
        // fall through to memory rather than drop the entries entirely
        res.setHeader("x-journal-store", `memory (${err.message})`);
      }
    }
    entries.push(...clean);
    while (entries.length > KEEP) entries.shift();
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "get or post only" });
    return;
  }
  let list = entries.slice().reverse();
  let store = "memory";
  if (durable) {
    try {
      list = await read(200);
      store = "supabase";
    } catch {
      // a read failure serves what this instance happens to hold
    }
  }
  const origin = `https://${req.headers.host ?? "kodo"}`;
  // json when asked for it, so the world (and a monitor) can read its own
  // log back without parsing xml
  if ((req.query?.format ?? "") === "json" || (req.headers.accept ?? "").includes("application/json")) {
    res.setHeader("cache-control", "public, max-age=15");
    res.setHeader("x-journal-store", store);
    return res.status(200).json({ store, count: list.length, entries: list });
  }
  res.setHeader("content-type", "application/rss+xml; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=30");
  res.setHeader("x-journal-store", store);
  res.status(200).send(rss(origin, list));
}
