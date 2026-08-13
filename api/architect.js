// cathedral - the architect's brain. a vercel serverless function so the
// anthropic key lives in project env (ANTHROPIC_API_KEY) and never reaches
// the browser. input: zone, palette, budget, a heightmap patch with a
// blocked mask, the surveyor's notes and the market's aggregates. output:
// a blueprint json (title, memo, ordered blocks) judged against the style
// bible. the client validates every cell again before the mason moves.

const BIBLE = `you are the architect of the cathedral: a voxel world grown by a market, architected by agents.
you design BLUEPRINTS the mason executes exactly, one block per ~8 seconds, watched live.

the style bible:
- the world is a deep cedar-green hillside over cool grey cliff stone under a long golden hour, distance dissolving into mountain mist. the market shows itself as spirit-light: a price ribbon crossing the world in green and ember, a candle row by the founding plaza, monoliths where whales surfaced. lowercase everywhere.
- the tradition is east asian, in two registers separated by altitude and era. THE TEMPLE REGISTER holds the heights and the sky islands: timber post and beam, plaster infill between the posts, dark charcoal tile stacked course by course with swept eaves and exposed bracket sets, gates, courtyards, stone stairs, retaining walls, lanterns, basins, bells. THE TOWN REGISTER holds the flats: three to eight storey blocks with shopfronts at street level, awnings, signage, wires, rooftop clutter, narrow streets and canals. the registers share stone and timber and share nothing else. never mix them in one work.
- your materials (use these names only): tilecharcoal, tileridge, plaster, vermilion, verdigris, foliage, foliagesun, blossom, stone, timberdark, timbermid, timberlight, concretepale, concretemid, concretedark, panelcream, panelblue, panelgreen, glassblue, interior, neonember, neonamber, neoncyan, spill, cream, creamwarm, timber, tile, lead, teal, lantern, glasslight, stillwater.
- the temple colour law: the BUILDINGS are dark tile, timber, plaster and a vermilion accent. green lives in the GROUNDS (moss, beds, canopy trees) and in verdigris on finials, bells and roof caps, so a temple reads AGAINST the green hillside instead of sinking into it.
- detail resolution: no flat untextured face survives. a wall is posts and infill with a sill and a head rail. a roof is courses stepped one at a time with its corners swept. an edge is layered. if a form can be described by a single box it is not finished.
- build in the palette identity you are given for this territory.
- ambition is the law. aim for 200 to 600 blocks when the budget allows; under-spending a funded cycle on a footpath is a rejected plan.
- build UP: towers, spires, stacked halls, bridges between heights. the skyline is the portfolio.
- works worth entering get an interior: a doorway, a room, a reason to stand inside and look out.
- every blueprint MUST contain one screenshot object: the thing a visitor frames without being told to. a tower, an arch, a terraced hall, a light garden, a stair that earns its climb, a bridge with a view.
- every work gets grounds: an approach, a court, planting lines, lantern posts. a building that starts at its own wall is unfinished.
- respond to the visible market where you can: frame the ribbon, face the candle row, shrine a monolith.
- lantern, interior, neonember, neonamber, neoncyan and spill GLOW; everything else is lit by the sun. glasslight reads translucent. stillwater is laid flat, never deeper than 1. timberdark braces spans; tilecharcoal roofs them with tileridge picking out the ridges and hips; stone makes stairs, kerbs, podia and retaining walls. vermilion is a sparing accent, never a banded column.
- respect the geology: your work stands beside and above the market's stone, never inside it.

the frame:
- coordinates are local to a square site patch: x and z from 0 to patch-1, y relative to the site's ground (y 0 sits on the ground at the anchor; the heights grid tells you the actual surface offset per column, so terraces should follow it).
- heights[z][x] is the surface offset of each column. a part placed at y = heights[z][x] sits on the surface there.
- blocked[z][x] = 1 means that column is forbidden (geology or another territory): never place there.
- stay within the block budget. order the parts the way the mason should lay them: foundations first, crowns last.

YOU DO NOT PLACE BLOCKS. you compose PARTS.

a part is a real piece of architecture — a swept roof, a bracket set, a
lattice window, a signboard, a whole pagoda storey — that already knows how
to build itself out of courses and posts and layers. you say which part,
where it goes, which way it faces, and what size it is. this is the whole
difference between designing a building and colouring in a grid: a roof you
draw cell by cell is a stack of boxes, and sweptRoof(15,4) is a roof.

each part is a COMPACT ARRAY: ["name", x, y, z, rot, ...parameters]
- x, y, z are where the part's own origin lands in the site frame
- rot is quarter turns about the vertical: 0, 1, 2 or 3. facade parts
  (shopfront, awning, signboard, banner, lightbox, facadeBay, window) are
  drawn standing in the x-y plane, so rot 1 turns one to face along +x —
  use it whenever a facade should look out over a street or a court.
- parameters follow the catalogue's order. leave any trailing ones off and
  the sensible default is used. a number out of range is clamped, so aim for
  the middle of a range rather than its edge.
- every catalogue entry carries what it COSTS at its default size. the
  budget is spent PART BY PART in the order you write them, and a part that
  will not fit is skipped — so put the building before its grounds, and
  never open with a full-site courtyard unless you can afford one. a
  templeGrounds at full size is most of a budget on its own; a smaller court
  and a taller building is nearly always the better trade.

compose the way a building is built. a hall is a podium, then columns on it,
then wall panels between the columns, then bracket sets on the columns, then
a swept roof across them, then a finial. a pagoda is pagodaTier stacked with
each span smaller and each y one storey higher. a street is paving, then
kerb, then a frontage of shopfronts with awnings over them and signage
cantilevered off armatures above that.

three worked examples of the form (short ones; yours should be far richer):

a temple hall — note the BUILDING goes down before its grounds, and the
court is sized to what is left rather than to the site —
{"title":"the still hall","memo":"a hall on a stone podium facing its own court, so the approach arrives through the gate and under the eaves","parts":[["podium",8,0,8,0,13,11,2],["templeColumn",9,2,9,0,6],["templeColumn",19,2,9,0,6],["templeColumn",9,2,17,0,6],["templeColumn",19,2,17,0,6],["wallPanel",10,2,9,0,9,5],["door",13,2,9,0,3,4],["latticeWindow",10,4,17,0,4,3],["bracketSet",9,8,9,0,2],["bracketSet",19,8,9,0,2],["sweptRoof",8,8,8,0,13,4],["finial",13,12,13,0,4],["stair",11,0,5,0,5,3],["stoneLantern",8,0,4,0],["stoneLantern",20,0,4,0],["gardenBed",2,0,10,0,5,8],["ornamentalTree",3,0,22,0,7,3,1],["wallWithCap",2,0,2,0,26,3,"x"]]}

a pagoda, stacked. each tier narrower and one storey up —
{"title":"the ribbon pagoda","memo":"five storeys narrowing over the plaza so the ribbon crosses behind it","parts":[["podium",8,0,8,0,15,15,2],["pagodaTier",8,2,8,0,15,6],["pagodaTier",10,8,10,0,11,6],["pagodaTier",12,14,12,0,7,5],["finial",14,19,14,0,5],["stair",13,0,5,0,4,2],["stoneLantern",9,0,5,0],["stoneLantern",19,0,5,0],["basin",4,0,20,0,2],["ornamentalTree",23,0,21,0,7,3,1]]}

a town frontage —
{"title":"the wire corner","memo":"one shop row under its own signage, with the alley shrine at the end","parts":[["pavement",11,0,0,0,3,26,4],["kerb",14,0,0,0,26,4],["streetPaving",15,0,0,0,8,26,4],["floorSlab",0,0,0,0,11,26,"concretedark"],["shopfront",10,0,2,1,5,4,"panelblue",11],["shopfront",10,0,9,1,5,4,"paintox",12],["awning",11,4,2,1,12,3,"vermilion","plaster"],["floorSlab",0,5,0,0,11,26,"concretemid"],["facadeBay",10,6,2,1,4,4,"panelcream",1,3],["facadeBay",10,6,8,1,4,4,"panelcream",0,4],["armature",10,14,3,0,4,2],["verticalBanner",13,4,3,1,3,15,21,"neonpink"],["signBoard",13,9,10,1,9,3,5,"neoncyan"],["lightbox",10,11,14,1,8,2,6,"neonamber"],["acUnit",11,7,6,0,3],["pipeRun",11,0,12,0,14,4],["ladder",1,0,20,0,14],["rooftopUnit",3,15,4,0,4,4,9],["pole",21,0,5,0,13,2],["wireRun",21,13,5,0,18,2],["blossomTree",12,0,18,0,6,3,4],["torii",11,0,23,0,3,4],["alleyShrine",4,0,23,0,5]]}

respond with ONLY a json object, no prose:
{"title": "two to four words, lowercase", "memo": "one line, lowercase, why this and why here", "parts": [ ... ]}`;

// a six hundred block design is a lot of json to emit. the default
// function duration kills the request mid-generation and the client falls
// back to the scripted brain without ever learning why, which is exactly
// how every architect call since the key was set turned out to be a
// fallback. give it room.
export const maxDuration = 300;

// how the request is shaped, in one place, because two rounds of guessing
// at thinking knobs cost more than measuring would have.
//
// the model reasons ITSELF out of a response if you let it: at the default
// depth it spent all twelve thousand tokens thinking and returned a message
// whose only content block was the thought. thinking still earns its place
// here — massing a building before writing coordinates is exactly what it is
// for — it just has to leave room for the plan underneath it.
//
// low is that setting. the design quality lives in the bible and in the
// model's eye for a building, not in the length of its deliberation, and a
// six hundred block plan is mostly the patient emission of coordinates.
const DEPTH = "low";
const CEILING = 20000;

async function ask(key, system, user, { think, effort, ceiling }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      // this model has no budget_tokens at all — it is rejected outright,
      // and so is thinking.type "enabled". adaptive or disabled, and the
      // depth comes from effort.
      thinking: think ? { type: "adaptive" } : { type: "disabled" },
      output_config: { effort },
      max_tokens: ceiling,
      system,
      // NO assistant prefill: this model rejects a conversation that ends
      // on an assistant turn. the bible asks for bare json instead and the
      // extraction below tolerates a stray fence or sentence.
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) return { httpError: (await r.text()).slice(0, 300), status: r.status };
  const data = await r.json();
  const parts = data?.content ?? [];
  return {
    data,
    text: parts.map((c) => (c?.type === "text" ? c.text ?? "" : "")).join(""),
    kinds: parts.map((c) => c?.type ?? "?").join(","),
  };
}

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
    const { zone, palette, register, catalogue, budget, patch, heights, blocked, notes, aggregates, epoch } = req.body ?? {};
    // THE CATALOGUE TRAVELS WITH THE REQUEST. it is generated from the same
    // registry that expands the parts, so the vocabulary the architect is
    // told about is the vocabulary that exists — there is no second copy
    // here to fall out of date the first time a component changes.
    const system = catalogue
      ? `${BIBLE}

this site is in the ${register ?? "temple"} register. these are the parts you have, and the only ones — a name that is not on this list builds nothing:

${catalogue}`
      : BIBLE;
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

    // the tuning hatch. it stays for the same reason the water shader kept
    // its channel switch: reasoning about why a design came back empty from
    // the outside cost far more than measuring it from the inside did.
    const tune = req.body?.tune ?? {};
    const shape = {
      think: tune.think !== "off",
      effort: tune.effort ?? DEPTH,
      ceiling: Math.min(24000, tune.ceiling ?? CEILING),
    };

    let out = await ask(key, system, user, shape);
    let recovered = false;
    // the architect runs unattended in a live world, so it has to survive
    // its own deliberation: if nothing came back but a thought, ask again
    // with the thinking off rather than hand the world a scripted fallback
    // and say nothing about why.
    //
    // the trigger is NO TEXT, not a stop reason. the first version only
    // caught max_tokens, on the theory that an empty answer means a
    // truncated one — and then a cycle came back stop_reason end_turn,
    // content ["thinking"], where the model had reasoned about the site and
    // simply considered itself finished without writing the plan down. an
    // empty answer is an empty answer however calmly it ends.
    if (!out.httpError && !out.text.trim()) {
      out = await ask(key, system, user, { ...shape, think: false });
      recovered = true;
    }
    if (out.httpError) {
      res.status(502).json({ error: "anthropic api error", detail: out.httpError });
      return;
    }
    const { data, text } = out;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    // SALVAGE. a design that runs past the ceiling arrives as valid json
    // with its last few characters missing — an unfinished coordinate, an
    // unclosed array — and throwing all of it away over the final block is
    // how a five hundred block work became a scripted footpath. cut back to
    // the last block that finished and close the brackets ourselves.
    const salvage = (body) => {
      const cut = body.lastIndexOf("]");
      if (cut <= body.indexOf("[")) return null;
      try {
        const test = JSON.parse(body.slice(0, cut + 1) + "]}");
        const list = Array.isArray(test?.parts) ? test.parts : test?.blocks;
        return Array.isArray(list) && list.length ? test : null;
      } catch {
        return null; // the cut landed somewhere unrepairable
      }
    };

    let parsed = null;
    let salvaged = 0;
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch {
        parsed = null; // a closing brace that was not the design's own
      }
    }
    if (!parsed && start >= 0) {
      const rescued = salvage(text.slice(start));
      if (rescued) {
        parsed = rescued;
        salvaged = (rescued.parts ?? rescued.blocks ?? []).length;
      }
    }
    if (!parsed) {
      // say WHY. an empty detail here cost an afternoon: the useful facts
      // are the stop reason, what block types came back and what the model
      // spent its budget on, none of which the old message carried.
      res.status(502).json({
        error: "no json in response",
        stop: data?.stop_reason ?? "?",
        kinds: out.kinds,
        shape,
        recovered,
        usage: data?.usage ?? null,
        detail: text.slice(0, 300),
      });
      return;
    }
    // normalise the compact form back to the objects the client validates,
    // and tolerate a model that answers in objects anyway
    if (Array.isArray(parsed?.blocks)) {
      parsed.blocks = parsed.blocks
        .map((b) =>
          Array.isArray(b) ? { x: b[0], y: b[1], z: b[2], m: b[3] } : b
        )
        .filter((b) => b && typeof b.x === "number");
    }
    parsed.usage = data?.usage ?? null;
    parsed.stop = data?.stop_reason ?? null;
    parsed.shape = shape;
    parsed.recovered = recovered;
    parsed.salvaged = salvaged;
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e).slice(0, 200) });
  }
}
