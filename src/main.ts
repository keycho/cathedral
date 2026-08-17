// cathedral - entry. assembles the systems: renderer, the long golden hour,
// the voxel field with its meadow, the founding stone, and the two ways of
// seeing: the orbit rig (default, stream shot, mobile) and the first-person
// walker (click to enter, esc to leave).

import * as THREE from "three";
import { AshDrift } from "./ash";
import {
  DEV_EDIT,
  DEV_TOOLS,
  FOG_FAR,
  FOG_NEAR,
  GRID,
  HAZE,
  MAXY,
  SUN_COLOR,
  SUN_INTENSITY,
} from "./config";
import { DevPanel } from "./devpanel";
import { EditProbe } from "./editor";
import { Erosion } from "./erosion";
import { Feed } from "./feed";
import { FirstPerson } from "./firstperson";
import { GROW, Growth } from "./growth";
import { simulateHistory } from "./history";
import { Hollows } from "./hollows";
import { Islands } from "./islands";
import { Kinetics } from "./kinetics";
import { Monuments } from "./monuments";
import { Shrine } from "./shrine";
import { Net } from "./net";
import { OrbitRig } from "./orbitcam";
import { Post } from "./post";
import { WorkSite } from "./site";
import { SmallLife } from "./life";
import { Weather } from "./weather";
import { FRAMINGS, Photo } from "./photo";
import { PerfHud } from "./perfhud";
import { AutoQuality, configAt, startStep, type Config } from "./quality";
import { Architect } from "./architect";
import { audio } from "./audio";
import { CrewWorks, zoneOf as zoneOfCell, type AgentBody } from "./crew";
import { Journal } from "./journal";
import { Mason } from "./mason";
import {
  blockColor,
  EARTH,
  GENESIS as GENESIS_ID,
  GLASSLIGHT,
  INTERIOR,
  isGround,
  LANTERN,
  MASS,
  MATERIALS,
  NEONAMBER,
  NEONCYAN,
  NEONEMBER,
  NEONGREEN,
  NEONPINK,
  NEONRED,
  RUBBLE,
  SIGNWHITE,
  SPILL,
  STILLWATER,
  SWATCH,
} from "./palette";
import { Candles } from "./candles";
import { Glyphs } from "./glyphs";
import { Plaques } from "./plaques";
import { Ribbon } from "./ribbon";
import { Surveyor } from "./surveyor";
import { Director } from "./director";
import { Keeper } from "./keeper";
import { Tombs } from "./tombs";
import { Vitality } from "./vitality";
import { Voice } from "./voice";
import { firstTierWithGrounds } from "./components/compose";
import { canalReach } from "./components/canal";
import { streetBlock } from "./components/street";
import { RULES } from "./rules";
import { Scars } from "./scars";
import { Sky } from "./sky";
import { Strata } from "./strata";
import { Flora } from "./flora";
import { UrbanPlan } from "./plan";
import { plantWoods } from "./woods";
import { greatWorkPagoda } from "./components/greatwork";
import { Motif } from "./threshold";
import { CloudSea, Underside } from "./cloudsea";
import { connectChain } from "./chain";
import type { ChainFeed } from "./chain";
import { paletteHex } from "./stylise";
import { Water, Waterfall, WetPaving } from "./water";
import { Wind } from "./wind";
import { BASINS, GENESIS_CELL, meadowSampler, placeGenesis } from "./terrain";
import { buildArchipelagoBridges } from "./bridges";
import { HorizonIsles } from "./horizon";
import { tendGround } from "./tended";
import { GroundCover } from "./groundcover";
import { distributeBlocks, TickEngine } from "./ticks";
import { VoxelField } from "./voxels";

// ---------------------------------------------------------------------------
// renderer
// ---------------------------------------------------------------------------
const canvas = document.getElementById("scene") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
// ONE configuration. no menu, no tiers: the world ships as designed and
// quietly steps down a ladder if the machine cannot hold the frame.
let quality: Config = configAt(startStep());
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// pulled well down: the sky was blowing to white and the meadow was
// washing out. highlights hold detail here and the grade does the rest.
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// the sun crawls through a 20 minute day and the world changes a block at
// a time: re-rendering every shadow every frame is pure waste
renderer.shadowMap.autoUpdate = false;
// the composer calls render once per pass and three resets its counters on
// every call, so the readout was reporting the last fullscreen quad rather
// than the scene. we reset once per frame ourselves and read the whole
// frame's total, which is comparable across every tier.
renderer.info.autoReset = false;

// scratch vector for the focal point, so the render loop allocates nothing
const dofAim = new THREE.Vector3();
// PHOTO MODE IS BUILT LATE and used early. it needs captureMode, which needs
// the crew, which does not exist until most of this file has run — but the
// render loop calls into it from its very first frame. a const declared
// between the two is a dead zone the loop walks into and the whole world
// fails to boot with "cannot access before initialization".
let photo: Photo | undefined;
// same story as photo: built late, called from the loop's first frame
let workSite: WorkSite | undefined;
let life: SmallLife | undefined;
let weather: Weather | undefined;

const scene = new THREE.Scene();
scene.background = new THREE.Color(HAZE);
scene.fog = new THREE.Fog(HAZE, FOG_NEAR, FOG_FAR);

// the far plane covers the full-map orbit: at the new maximum radius the
// far rim sits around seven hundred units out, and a plane that used to
// end at five hundred would slice the world's own corner off the frame
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  // far enough that the horizon range survives the camera standing on the
  // world's far side: the isles sit ~600 from the origin, which is 850+
  // from an eye-line across the map — at 760 they were silently clipped
  1150
);
scene.add(camera);

// ---------------------------------------------------------------------------
// the long golden hour - warm low sun, soft shadows, warm bounce
// ---------------------------------------------------------------------------
const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
sun.castShadow = true;
sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
// the shadow camera only needs to cover what the eye can see: a tighter
// frustum culls whole chunks out of the shadow pass, which is the pass
// that draws the entire meadow a second time
let SH = quality.shadowFrustum; // re-centered on the camera each frame
sun.shadow.camera.left = -SH;
sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH;
sun.shadow.camera.bottom = -SH;
// biases sized for 1-unit voxels: a single block must still drag its long
// shadow (a large normal bias silently erases exactly that)
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.35;
sun.shadow.radius = quality.shadowRadius; // soft edges cost fill: the tier owns it
scene.add(sun);
scene.add(sun.target);
// capture-rig handle: the shadow state has to be inspectable from outside
(renderer as unknown as { __sunProbe: THREE.DirectionalLight }).__sunProbe = sun;

// shadows are violet-grey, never black: a low ambient in the shadow tint
// fills what the sun cannot reach, so every frame keeps shape in the dark
// raised, because the one surface a directional fill can never reach is the
// UNDERSIDE OF AN EAVE — and a pagoda is mostly eaves.
const shadowFill = new THREE.AmbientLight(SWATCH.shadowTint, 0.68);
scene.add(shadowFill);

// the sun rides a fixed azimuth; the sky's day script raises and lowers it
const SUN_AZ = Math.atan2(-0.42, -0.66);
const SUN_DIST = 180;

// the painterly sky: gradient dome, drifting clouds, stars, and the slow
// day cycle with its long golden hour. it publishes the light script;
// the lights below are its instruments.
const sky = new Sky(scene, SUN_AZ);

// warm bounce: bright sky light over meadow-green ground fill, so shadows
// stay soft and painterly instead of harsh
// raised with the toe. an ambient lifts a dark surface and a lit one by the
// same amount, which puts a floor under the black without giving the tower
// back any SHAPE; the hemisphere is proportional to how much sky a face can
// see, so it separates a tier wall from the eave above it — which is what
// "tile courses read" actually asks for.
const hemi = new THREE.HemisphereLight(SWATCH.bounceWarm, SWATCH.meadowDeep, 0.88);
scene.add(hemi);

// THE ANTI-KEY, and it was neither anti nor a key. a cool fill from "the far
// side" was pinned to a fixed position while the sun rides the day script, so
// most of the cycle it was somewhere between a second key and nothing — and
// at 0.14 it could not have lifted a shadow either way.
//
// this matters most for the ONE THING the whole world is arranged around. the
// great work is tall, dark-tiled and backlit at the hour the stream runs on,
// which is the exact recipe for a silhouette: measured on the hero frame, 21%
// of the tower was under 0.10 luma and 10% under 0.05, with a darkest pixel
// of #020205 — a hero with no material in it at all.
//
// the fill now tracks OPPOSITE the sun every frame, lifted above the horizon
// so it reaches the undersides of eaves rather than raking across them. it
// casts no shadows: it is there to put a floor under the dark side, not to
// add a second set of them.
const fill = new THREE.DirectionalLight(SWATCH.bounceCool, 0.52);
fill.position.set(120, 60, 90);
scene.add(fill);
scene.add(fill.target);

// the viewer's fill, eased right back now the world carries daylight
const viewFill = new THREE.DirectionalLight(SWATCH.bounceWarm, 0.16);
scene.add(viewFill);
scene.add(viewFill.target);

// ---------------------------------------------------------------------------
// the world: ash plain + founding stone
// ---------------------------------------------------------------------------
const field = new VoxelField(meadowSampler);
scene.add(field.group);

const genesis = placeGenesis(field);

// one wind field: the grass, the seeds, the clouds and the banners all
// obey it, so the air reads as weather and not as separate animations
const wind = new Wind();

// the living layer: grass, wildflowers, reeds, moss, all on the same wind
const flora = new Flora(scene, field, wind);

// water. the field keeps the water cells; this draws the SURFACE over them,
// which is the part that has to move, catch the sun and hold the sky.
const water = new Water(wind);
scene.add(water.group);
// the wet film the town's paving carries. it reflects the SIGNAGE, which
// the sky trick cannot do, so it is handed the emitters directly.
const wet = new WetPaving();
scene.add(wet.group);
{
  // every column whose top block is water, in one sweep. built from the
  // field rather than from the basin table, so a canal cut later is picked
  // up by the same pass without anyone remembering to register it.
  const cells: { x: number; z: number; y: number }[] = [];
  for (let x = 0; x < GRID; x++) {
    for (let z = 0; z < GRID; z++) {
      const h = field.topAt(x, z);
      if (h > 0 && field.typeAt(x, h - 1, z) === STILLWATER) {
        // the surface sits a hair above the top water cube and only ever
        // swells upward from there
        cells.push({ x, z, y: h + 0.004 });
      }
    }
  }
  water.addSurface(cells);
}

// strata: provenance + epoch tints. the founding stone is the world's own,
// locked so no tint pass ever touches it.
const strata = new Strata(field);
const genesisY = Math.floor(genesis.y);
strata.lock(GENESIS_CELL.x, genesisY, GENESIS_CELL.z);
strata.register(GENESIS_CELL.x, genesisY, GENESIS_CELL.z, -1, "genesis");

// kinetics: everything that enters the world falls in and thuds
const kinetics = new Kinetics(scene, field, camera);

// accretion: the frontier opens on the founding stone's faces, and every
// grown block arrives from above
const growth = new Growth(field, strata);
growth.refreshAround(GENESIS_CELL.x, genesisY, GENESIS_CELL.z);
growth.dropper = (x, y, z, commit) =>
  kinetics.drop(x, z, blockColor(MASS), () => commit(), { stopY: y, from: 8 + Math.random() * 4 });

// burn hollows: permanent carved chambers, ember-lit. the founding stone
// is sacred and can never burn.
const hollows = new Hollows(scene, field, strata, strata.idx(GENESIS_CELL.x, genesisY, GENESIS_CELL.z));

// erosion scars: freshly torn faces glow ember and cool over ~2h
const scars = new Scars(field, strata);

// collapse + subsidence (r2, r2b)
const erosion = new Erosion(field, strata, scars, hollows, kinetics, (x, y, z) =>
  growth.refreshAround(x, y, z)
);

// the market's marks (r4 monuments, r5 seeds)
const monuments = new Monuments(field, strata, growth, kinetics);

// the sky realm: islands calved from the mass at its milestones
const islands = new Islands(field, strata, kinetics, (x, y, z) => growth.refreshAround(x, y, z));

// an island's underside is the half of it the ground can see, so one of
// them spills. the fall runs off the keel and stops being water in mid-air:
// it goes to mist before it reaches anything, which is the whole reason to
// stand underneath. capped low on purpose. a sky full of waterfalls is a
// fountain display, and one is a landmark.
// two for the market's sky, and room for one the archipelago brings
const MAX_FALLS = 3;
islands.onCalved = (isle) => {
  if (water.fallCount >= MAX_FALLS || isle.r < 5 || isle.kind === "ruin") return;
  const ang = Math.PI * 0.75;
  const ex = Math.round(isle.cx + Math.cos(ang) * (isle.r - 1.2));
  const ez = Math.round(isle.cz + Math.sin(ang) * (isle.r - 1.2));
  // the water has to come FROM somewhere. a short pool is cut into the
  // island's crown and the fall runs off its lip; a sheet that starts in
  // mid-air under a garden reads as a pipe.
  const pool: { x: number; z: number; y: number }[] = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (dx * dx + dz * dz > 5) continue;
      const px = ex + dx;
      const pz = ez + dz;
      const h = field.topAt(px, pz);
      if (h <= isle.baseY) continue; // only on the crown, never off the edge
      field.placeAt(px, h, pz, STILLWATER);
      strata.lock(px, h, pz);
      pool.push({ x: px, z: pz, y: h + 1.004 });
    }
  }
  if (pool.length < 4) return;
  water.addSurface(pool);
  const wx = ex - GRID / 2 + 0.5;
  const wz = ez - GRID / 2 + 0.5;
  const lip = field.topAt(ex, ez);
  const fall = new Waterfall(wx, lip, wz, lip - (12 + isle.r), 2.4, 1.15, wind).intoAir();
  water.addFall(fall);
};

// THE ARCHIPELAGO: satellites seeded in the void ring beyond the torn
// coast before anything else joins the sky, then every honest crossing —
// the sheared headland to its shard, the low satellites to the coast —
// gets its rope bridge
islands.seedArchipelago();
buildArchipelagoBridges(scene, field, islands.list);
const horizonIsles = new HorizonIsles(scene);

// the shrine of epochs: the world's own furniture beside the stone
const shrine = new Shrine(field, strata, GENESIS_CELL);

// a burn's roof gives: ceiling stones tumble into the cavity and settle as
// rubble on its floor
hollows.onRoofFall = (x, y, z) => {
  kinetics.drop(
    x,
    z,
    blockColor(RUBBLE),
    (cx, cz) => {
      const ry = field.surfaceBelow(cx - GRID / 2 + 0.5, cz - GRID / 2 + 0.5, y);
      if (field.placeAt(cx, ry, cz, RUBBLE)) {
        hollows.fillHollowCell(cx, ry, cz);
        strata.register(cx, ry, cz, -1, "burn");
        growth.refreshAround(cx, ry, cz);
      }
    },
    { from: 0.4, vy: 0.5 }
  );
};

// the market never entombs a visitor, and hollow never re-accretes
const insideWalker = (x: number, y: number, z: number): boolean => {
  const wx = x - GRID / 2 + 0.5;
  const wz = z - GRID / 2 + 0.5;
  return (
    Math.abs(wx - fp.pos.x) < 0.85 &&
    Math.abs(wz - fp.pos.z) < 0.85 &&
    y >= Math.floor(fp.pos.y) &&
    y <= Math.floor(fp.pos.y + 1.7)
  );
};
growth.forbidden = (x, y, z) => hollows.isHollow(x, y, z) || insideWalker(x, y, z);

// ---------------------------------------------------------------------------
// the market drives the geology through the constitution's clock: raw
// events aggregate into 30s ticks; r1 accretion and r2 collapse apply on
// tick close; r2b subsidence fires after 12 negative ticks; epochs advance
// every 20 ticks. r3 burns carve as they land and r4/r5 are
// event-immediate by law.
// ---------------------------------------------------------------------------
const feed = new Feed();
const ticks = new TickEngine();
ticks.priceSource = () => feed.price;
let ambientTarget = 0.15;

// the market as visible data: the walkable price ribbon, the candle row
// at the plaza's edge, and value glyphs riding the impacts
const ribbon = new Ribbon(field, ticks);
const candles = new Candles(scene, ticks, () => feed.price, genesis, field);
const glyphs = new Glyphs(scene);
growth.onNote = (x, y, z, note) => glyphs.spawn(x, y, z, note, true);

feed.on((ev) => {
  switch (ev.kind) {
    case "buy":
      ticks.ingest(ev);
      // r4: a whale tx raises its monolith immediately; a great whale's
      // monolith seeds an island above the place it surfaced
      if (ev.amountUsd > RULES.whaleUsd) {
        monuments.raise(ev.wallet, ev.tx);
        // the ritual: a whale surfacing brings the crew to the stone
        if (monuments.lastMonument) {
          const m = monuments.lastMonument;
          keeper.gatherAt(m.x, m.z);
          surveyor.body.walkTo(m.x + 2, m.z - 1);
          architect.body.walkTo(m.x - 2, m.z + 1);
          director.cut("gathering", m.x, m.z, m.y, performance.now());
        }
        if (ev.amountUsd > RULES.whaleUsd * 2.5 && monuments.lastMonument) {
          islands.calveWhale(monuments.lastMonument.x, monuments.lastMonument.z);
        }
      }
      break;
    case "sell":
      ticks.ingest(ev);
      break;
    case "burn": {
      const carved = hollows.burn(ev.amountTokens, (x, y, z) => growth.refreshAround(x, y, z));
      if (carved > 0) audio.rumble(Math.min(1, carved / 150));
      // a major burn launches a hollowed ruin-island over the wound
      if (carved > 110 && hollows.lastBurn) {
        islands.calveRuin(hollows.lastBurn.x, hollows.lastBurn.z);
      }
      break;
    }
    case "newHolder":
      monuments.plant(ev.wallet, ev.tx); // r5
      break;
  }
});

// ---------------------------------------------------------------------------
// the crew: embodied agents, their log, their works, their territories
// ---------------------------------------------------------------------------
const journal = new Journal();
// the four registers live in crew/*.md and run through here
const voice = new Voice();
// the crew log is public: entries are posted to the feed as they are
// written (batched, and silent when the endpoint is absent in dev)
let feedQueue: { agent: string; epoch: number; text: string; at: number }[] = [];
let feedFlushAt = 0;
journal.onEntry = (e) => feedQueue.push({ agent: e.agent, epoch: e.epoch, text: e.text, at: e.at });
const tombs = new Tombs();
const works = new CrewWorks(scene, field, strata);
works.placeBorders(GENESIS_CELL);
let lastFinished: { title: string; by: "surveyor" | "architect" | "mason" | "keeper" } | undefined;
let lastSubsideTick = 0;
const surveyor = new Surveyor(
  scene,
  field,
  strata,
  erosion,
  hollows,
  monuments,
  journal,
  GENESIS_CELL,
  voice,
  {
    islands: () => islands.count,
    subsideRun: () => ticks.negativeRun,
    sinceSubside: () => ticks.tick - lastSubsideTick,
    newestWork: () => lastFinished,
    // the dusk pause: the long golden hour tipping over into evening
    isDusk: () => {
      const p = sky.phase01(clock.elapsedTime);
      return p > 0.2 && p < 0.32;
    },
  }
);
const mason = new Mason(
  scene,
  field,
  strata,
  works,
  kinetics,
  journal,
  { x: GENESIS_CELL.x + 5, z: GENESIS_CELL.z + 13 },
  voice
);
// THE URBAN PLAN. established once from the land — plaza at the founding
// stone, precinct on the high ground, quarter on the low — and then read
// and extended by every cycle. it is what turns a set of correct buildings
// into a settlement; without it each work is sited on the emptiest field it
// can find, which is precisely how they end up scattered.
const plan = new UrbanPlan(field, GENESIS_CELL, genesisY);
// the plan takes the grass with it when it paves
plan.flora = flora;

// THE HERO IS SITED BEFORE THE ROADS ARE LAID. it was sited after, which
// meant the pilgrim way had already been paved to the middle of the precinct
// and could not be aimed at the one thing in the world worth aiming a road
// at. the siting reads the land and the plaza only — it does not need the
// fabric — so it can come first, and then the avenue terminates on it.
const greatSite = plan.siteGreatWork();
plan.found();

const greatWork = greatWorkPagoda(7, 21, 3);
{
  const gx = greatSite.x - Math.floor(greatWork.footprint / 2);
  const gz = greatSite.z - Math.floor(greatWork.footprint / 2);
  plan.platform(gx, gz, greatWork.footprint, greatWork.footprint, "precinct");
  const gy = field.topAt(greatSite.x, greatSite.z);
  const cells = greatWork.build.ordered.map((c) => ({
    x: gx + c.dx,
    y: gy + c.dy,
    z: gz + c.dz,
    material: c.m,
  }));
  mason.placeInstant({ planId: "great-work", title: "the great work", zone: "architect", cells });
  plan.record({
    x: gx, z: gz, w: greatWork.footprint, d: greatWork.footprint,
    quarter: "precinct", planId: "great-work", title: "the great work", epoch: 0, slot: "great",
  });
}

// THE WORLD GETS AN UNDERNEATH. the slab's cut side is dressed as carved
// earth from the terrain's own edge heights, and the cloud sea rolls
// beneath it — the full-map orbit frames a world floating on cloud rather
// than in void, and the coast at ground level ends at a cliff instead of
// at nothing.
const underside = new Underside(field, scene);
const cloudSea = new CloudSea(scene);

// THE MOTIF, AND THE THREE DEVICES. a vermilion gate at every threshold in
// the world — the plaza's four ways in, the length of each route, the head of
// each street, the mouth of each reserved view — plus a flight on the
// steepest pitch and a deck over the deepest gap. this is what stops the
// world reading as generated: not more detail, but a small number of things
// put in specific places for reasons that are about the picture.
const motif = new Motif();
motif.raise(field, plan);

// THE WILD IS WOODED BEFORE THE SETTLEMENT IS. a world where trees exist
// only where a building was designed is a world of landscaped plots in a
// bare field — the references are more than half tree and rock, and the
// trees carry the composition. groves cluster by species and by altitude,
// bamboo takes the waterside, cedar lines the plan's roads. it runs after
// the plan so the paving stays clear: what grows here is what the town
// gets carved out of.
// the grove count is readable from the url so a before/after measurement is
// a page load rather than a rebuild: ?trees=0 boots the same world bare.
const groveCount = Number(new URLSearchParams(location.search).get("trees") ?? 26);
// ?trees=0 has to mean NO trees, avenues included, or the "before" half of a
// before/after measurement still has cedars down every road in it
const woods = plantWoods(field, plan, { groves: groveCount, avenue: groveCount > 0 });

const architect = new Architect(
  scene,
  field,
  strata,
  ticks,
  journal,
  mason,
  (x, y, z) => hollows.isHollow(x, y, z),
  GENESIS_CELL,
  plan,
  { x: GENESIS_CELL.x + 14, z: GENESIS_CELL.z + 2 }
);
architect.islands = islands; // the signature project watches the sky

// settled rubble greens over in time: ruins read reclaimed, not grim
erosion.onRubble = (x, y, z) => flora.mossRubble(x, y, z);

mason.onFinished = (bp) => {
  lastFinished = { title: bp.title, by: bp.zone };
  vitality.creditWork("mason");
  vitality.creditWork("architect");
  if (bp.planId.startsWith("tomb-")) {
    const t = tombs.list[tombs.list.length - 1];
    if (t) director.cut("tomb", t.x, t.z, t.y + 3, performance.now());
  }
};

// the keeper: the fourth agent, holding no territory and walking all of
// it. it needs the tombs (its round includes the graves) and the visitor.
const keeper = new Keeper(
  scene,
  field,
  works,
  journal,
  voice,
  tombs,
  GENESIS_CELL,
  () => strata.epoch,
  () => {
    const p = sky.phase01(clock.elapsedTime);
    return p > 0.26 && p < 0.56; // dusk through night: the lamps matter
  },
  () => (walking ? { x: Math.floor(fp.pos.x + GRID / 2), z: Math.floor(fp.pos.z + GRID / 2) } : null),
  { x: GENESIS_CELL.x + 3, z: GENESIS_CELL.z - 2 }
);
// the relight, seen: a warm spark at each lamp the keeper tends
keeper.onTend = (x, z) => {
  const y = field.topAt(x, z);
  kinetics.dust(x - GRID / 2 + 0.5, y + 1.5, z - GRID / 2 + 0.5, 8, 0.8, 0.5);
};

let mourningUntil = 0;
// mortality. the crew lives on the market's volume and nothing else, and
// no mechanic anywhere lets anyone pay to kill or save one of them.
const vitality = new Vitality(ticks, ["surveyor", "architect", "mason", "keeper"], strata.epoch);
const bodyOf = (role: string): AgentBody | null =>
  role === "surveyor" ? surveyor.body : role === "architect" ? architect.body : role === "mason" ? mason.body : keeper.body;

vitality.onStage = (role, health) => {
  if (health === "hale") return;
  journal.add(role, strata.epoch, voice.decline(role, health as "thin" | "failing" | "dying"));
  if (health === "dying") {
    const b = bodyOf(role);
    if (b) director.cutTo("dying", () => new THREE.Vector3(b.x, b.y + 1, b.z), performance.now());
  }
};

vitality.onDeath = (life) => {
  const now = performance.now();
  const b = bodyOf(life.role);
  if (b) director.cut("death", Math.floor(b.x + GRID / 2), Math.floor(b.z + GRID / 2), b.y, now);
  journal.add(life.role, strata.epoch, `${life.name} does not answer the round.`);

  // the architect chooses the ground; the mason raises the marker
  const site = tombSite(life.role);
  const cells = tombs.design(site.x, site.z, field.topAt(site.x, site.z), life.role);
  const tomb = tombs.record(
    { x: site.x, z: site.z, y: field.topAt(site.x, site.z), role: life.role, name: life.name, epoch: strata.epoch, works: life.works },
    cells
  );
  mason.assign({ planId: "tomb-" + tomb.name, title: `${tomb.name}'s marker`, zone: "mason", cells });
  director.cut("tomb", site.x, site.z, field.topAt(site.x, site.z) + 2, now + 1);

  // the survivors write, each in their own register
  for (const other of ["surveyor", "architect", "mason", "keeper"] as const) {
    if (other === life.role) continue;
    const l = vitality.get(other);
    if (!l || l.health === "dead") continue;
    journal.add(other, strata.epoch, voice.eulogy(other, life.name, life.works));
  }

  // the flags lower for a day: the crew's lamps burn low while it stands
  works.dimLanterns(0.35);
  mourningUntil = now + 1200_000 * 0.25; // a quarter of a day cycle
  // and the successor arrives after the marker is raised
  setTimeout(() => {
    const next = vitality.succeed(life.role, strata.epoch);
    if (!next) return;
    voice.forget(life.role); // the duties carry over, the memories do not
    const nb = bodyOf(life.role);
    nb?.setPersonName(next.name);
    journal.add(life.role, strata.epoch, voice.arrival(life.role, next.name));
  }, 45_000);
};

// the tomb ground: open ground in the dead agent's own third, near the
// pilgrim path so the graves read as one walk
function tombSite(role: string): { x: number; z: number } {
  const start = tombs.list.length;
  for (let k = 0; k < 300; k++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 14 + ((start * 3) % 10) + Math.random() * 16;
    const x = Math.round(GENESIS_CELL.x + Math.cos(ang) * r);
    const z = Math.round(GENESIS_CELL.z + Math.sin(ang) * r);
    if (x < 6 || z < 6 || x > GRID - 7 || z > GRID - 7) continue;
    if (role !== "keeper" && zoneOfCell(x, z) !== role) continue;
    const h = field.topAt(x, z);
    if (h < 2 || field.isSolid(x, h, z)) continue;
    return { x, z };
  }
  return { x: GENESIS_CELL.x + 8, z: GENESIS_CELL.z - 8 };
}

// dumps bite the crew's work; the mason puts it back before building new
erosion.pickCrewCell = () => works.sample();
erosion.onCrewBroken = (x, y, z, material) => {
  const b = works.remove(x, y, z);
  mason.repair({ x, y, z, material: b?.material ?? material });
};

ticks.onTick = (s) => {
  // r1: positive net flow accretes, attributed proportionally to buyers.
  // each buyer's first landed stone announces its dollar value.
  if (s.netFlowUsd > 0) {
    const n = Math.floor(s.netFlowUsd / RULES.usdPerBlock);
    for (const [wallet, count] of distributeBlocks(n, s.buys)) {
      const usd = Math.round(s.buys.get(wallet) ?? 0);
      growth.enqueue(count, wallet, "tick-" + s.n, usd > 0 ? "+$" + usd : undefined);
    }
  }
  // r2: negative net flow destabilizes the frontier, sellers first; the
  // outflow rises in ember from the mass it bites
  if (s.netFlowUsd < 0) {
    erosion.erode(Math.floor(-s.netFlowUsd / RULES.usdPerBlock), s, ticks.tickLenMs);
    const c = strata.sampleCell(Math.random());
    if (c !== undefined) {
      const cy = c % MAXY;
      const cxz = (c - cy) / MAXY;
      const cz = cxz % GRID;
      const cx = (cxz - cz) / GRID;
      glyphs.spawn(cx, cy, cz, "-$" + Math.round(-s.netFlowUsd), false);
    }
  }
  // the chart advances one column
  ribbon.rebuild();
  // the mass calves an island at each standing-blocks milestone
  islands.maybeMilestone(strata.blockCount, GENESIS_CELL.x, GENESIS_CELL.z);
  // r6: ambient breathes with the tick's gross volume
  ambientTarget = Math.max(0.12, 1 - Math.exp(-s.grossVolumeUsd / 1200));
};
ticks.onEpoch = (epoch) => {
  strata.advanceEpoch();
  surveyor.onEpoch(epoch);
  architect.onEpoch(epoch);
  // the motif follows the settlement. a gate goes up wherever a new
  // threshold has appeared since the last epoch — the quarter's streets when
  // they are first laid, a notable work when one is finished — and nothing
  // that already stands is built twice.
  motif.raise(field, plan);
};

// r2b: the mass settles one block; the founding stone's sanctity, glow and
// the orbit's eye follow it down
ticks.onSubside = () => {
  erosion.subside();
  for (let y = MAXY - 1; y >= 1; y--) {
    if (field.typeAt(GENESIS_CELL.x, y, GENESIS_CELL.z) === GENESIS_ID) {
      genesis.setY(y + 0.5);
      core.position.copy(genesis);
      glow.position.copy(genesis).add(new THREE.Vector3(0, 1.4, 0));
      rig.target.copy(genesis);
      hollows.setSacred(strata.idx(GENESIS_CELL.x, y, GENESIS_CELL.z));
      break;
    }
  }
};

const panel = new DevPanel(feed, strata, growth, ticks);
panel.crewLine = () => mason.status;

// simulated history: age a dev world 50 epochs so the strata ramp has a
// real past to render (blocks carry the simulated epoch they were born in),
// then let the crew's finished works stand in it, staggered through the
// past so their plaques carry believable ages
const runHistory = async (epochs = 50) => {
  simulateHistory(
    {
      field,
      strata,
      growth,
      hollows,
      ticks,
      raiseMonument: (w, tx) => monuments.raise(w, tx),
      plantSeed: (w, tx) => monuments.plant(w, tx),
      endPrice: feed.price,
    },
    epochs
  );
  const finalEpoch = strata.epoch;
  const finished: { url: string; zone: "architect" | "surveyor" | "mason"; at: number }[] = [
    { url: "./blueprints/founding.json", zone: "architect", at: Math.max(1, finalEpoch - 30) },
    { url: "./blueprints/ember-gate.json", zone: "mason", at: Math.max(1, finalEpoch - 22) },
    { url: "./blueprints/reed-hall.json", zone: "surveyor", at: Math.max(1, finalEpoch - 12) },
    { url: "./blueprints/high-terrace.json", zone: "architect", at: Math.max(1, finalEpoch - 4) },
  ];
  for (const w of finished) {
    strata.epoch = w.at;
    const bp = await architect.prepareCompleted(w.url, w.zone);
    if (bp) mason.placeInstant(bp);
  }
  strata.epoch = finalEpoch;
  // the aged mass has passed its milestones: the sky already has land
  for (let k = 0; k < 3; k++) {
    islands.maybeMilestone(strata.blockCount, GENESIS_CELL.x, GENESIS_CELL.z);
  }
  ribbon.rebuild(); // the aged world wakes up carrying its chart
  // an aged world has grown a hill over the founding stone: pull the eye
  // back so the first frame a visitor sees is the world, not the inside
  // of the mass
  let crown = genesisY;
  for (let y = MAXY - 2; y > genesisY; y--) {
    if (field.typeAt(GENESIS_CELL.x, y, GENESIS_CELL.z) !== 0) {
      crown = y;
      break;
    }
  }
  rig.target.set(genesis.x, crown + 4, genesis.z);
  rig.radius = 64;
  rig.polar = 0.34;
  return strata.blockCount;
};
panel.onHistory = () => void runHistory(50);
// THE GATE PIECE: one structure composed from the component library, put
// down where it can be judged. it is not wired into the architect's cycle
// and it does not fill the world: it is called by hand for review.
const buildGatePiece = (cellX = GENESIS_CELL.x + 30, cellZ = GENESIS_CELL.z - 34) => {
  const work = firstTierWithGrounds();
  const groundY = field.topAt(cellX + Math.floor(work.footprint.w / 2), cellZ + Math.floor(work.footprint.d / 2));
  const cells = work.cells.map((c) => ({
    x: cellX + c.dx,
    y: groundY + c.dy,
    z: cellZ + c.dz,
    material: c.m,
  }));
  const placed = mason.placeInstant({
    planId: "great-work-tier-1",
    title: "the first tier",
    zone: "architect",
    cells,
  });
  journal.add(
    "architect",
    strata.epoch,
    "the first tier of the great work. it will carry six more, and none of them are the last.",
    "scripted"
  );
  return { placed, designed: cells.length, manifest: work.manifest, height: work.height, at: { x: cellX, z: cellZ, groundY } };
};

// THE CANAL REACH. also review-only, and also not wired into the cycle. a
// canal is the one piece of architecture that is a CUT before it is a
// build, so it applies three things: the void it empties, the stone it
// lines that void with, and the water surface that covers the result.
const buildCanalReach = (cellX = GENESIS_CELL.x - 44, cellZ = GENESIS_CELL.z + 6) => {
  const work = canalReach(34, 4, 3);
  // the canal follows the ground's own level. it takes the LOWEST column it
  // crosses, because water does not climb: a reach cut at the mean height
  // would leave one end of it standing in the air.
  let groundY = 999;
  for (let i = 0; i < work.footprint.d; i++) {
    for (let x = -1; x <= work.footprint.w; x++) {
      groundY = Math.min(groundY, field.topAt(cellX + x, cellZ + i));
    }
  }
  // the cut first, then the lining, or the lining is what gets emptied.
  // each column is emptied from its own floor to its own real top, so a
  // knoll in the middle of the reach is taken out with it.
  let cleared = 0;
  for (const c of work.clear) {
    const gx = cellX + c.dx;
    const gz = cellZ + c.dz;
    const from = groundY + c.fromDy;
    for (let y = field.topAt(gx, gz) - 1; y >= from; y--) {
      if (field.breakAt(gx, y, gz)) cleared++;
    }
  }
  const cells = work.cells.map((c) => ({
    x: cellX + c.dx,
    y: groundY + c.dy,
    z: cellZ + c.dz,
    material: c.m,
  }));
  const placed = mason.placeInstant({
    planId: "canal-reach-1",
    title: "the first reach",
    zone: "mason",
    cells,
  });
  water.addSurface(work.water.map((w) => ({ x: cellX + w.dx, z: cellZ + w.dz, y: groundY + w.dy })));
  journal.add(
    "mason",
    strata.epoch,
    "cut a reach and lined it. water finds its own level, which is more than i can say for the ground.",
    "scripted"
  );
  return {
    placed,
    designed: cells.length,
    cleared,
    manifest: work.manifest,
    at: { x: cellX, z: cellZ, groundY },
  };
};

// the town's own lamps. held here so the frame loop can ride their
// intensity on the day cycle: full after dark, drowned by the sun before it.
const streetLamps: THREE.PointLight[] = [];

// THE STREET BLOCK. the town register's gate piece: four buildings in four
// eras sharing one frontage, the road in front of them, and everything
// people leave on it. review-only, like the tier and the reach.
//
// three things happen here that no other placement does. the site is
// LEVELLED, because a street is flat and a town levels its ground. the
// emitters are BAKED, because a sign that does not land on anything is a
// sticker. and a wet film is laid over the road, because the reflection of
// the signage in the tarmac is half of what this register is.
const buildStreetBlock = (cellX = GENESIS_CELL.x - 78, cellZ = GENESIS_CELL.z + 22) => {
  const work = streetBlock();
  const W = work.footprint.w;
  const D = work.footprint.d;

  // 1. level the site. the median of the columns it covers, so the street
  // sits in the land rather than on it.
  const tops: number[] = [];
  for (let x = -1; x <= W; x++) for (let z = -1; z <= D; z++) tops.push(field.topAt(cellX + x, cellZ + z));
  tops.sort((a, b) => a - b);
  const groundY = tops[Math.floor(tops.length / 2)];
  let cut = 0;
  let fill = 0;
  for (let x = -2; x <= W + 1; x++) {
    for (let z = -2; z <= D + 1; z++) {
      const gx = cellX + x;
      const gz = cellZ + z;
      for (let y = field.topAt(gx, gz) - 1; y >= groundY; y--) if (field.breakAt(gx, y, gz)) cut++;
      for (let y = field.topAt(gx, gz); y < groundY; y++) if (field.placeAt(gx, y, gz, EARTH)) fill++;
    }
  }

  // 2. the block itself
  const cells = work.cells.map((c) => ({
    x: cellX + c.dx,
    y: groundY + c.dy,
    z: cellZ + c.dz,
    material: c.m,
  }));
  const placed = mason.placeInstant({
    planId: "street-block-1",
    title: "the first street",
    zone: "mason",
    cells,
  });

  // 3. THE SPILL BAKE. every emitter throws its colour onto the surfaces
  // near it, accumulated in linear light and written straight to the
  // instance colours. where it piles up past 1.0 the surface itself starts
  // to glow, which is what a wall under a sign actually does.
  const HOTM = new Set([
    LANTERN, INTERIOR, GLASSLIGHT, SPILL, SIGNWHITE,
    NEONEMBER, NEONAMBER, NEONCYAN, NEONPINK, NEONRED, NEONGREEN,
  ]);
  const lamps = work.emitters.map((e) => ({
    x: cellX + e.dx,
    y: groundY + e.dy,
    z: cellZ + e.dz,
    reach: e.reach,
    power: e.power,
    col: new THREE.Color(blockColor(e.color)),
  }));
  // the bake is a HUE SHIFT, not a brightness one, and that distinction is
  // the whole fix. adding the lamp's colour to the albedo made a wall under
  // four pink signs into a pink wall — correct at midnight, and at noon a
  // wide magenta stain smeared across a mustard facade in full sunlight,
  // because a baked colour does not know what time it is.
  //
  // what IS true at every hour is the hue: a wall beside a pink sign is a
  // wall whose plaster leans pink. so the surface is mixed toward the
  // lamp's colour AT ITS OWN BRIGHTNESS, never past a third of the way, and
  // its value never moves. the GLOW is done below with real lights, which
  // the sun drowns out by itself.
  const LEAN = 0.34; // the furthest a surface may be pulled toward a lamp
  const base = new THREE.Color();
  let touched = 0;
  for (const c of cells) {
    if (HOTM.has(c.material)) continue;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const l of lamps) {
      const dx = l.x - c.x;
      const dy = l.y - c.y;
      const dz = l.z - c.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > l.reach * l.reach) continue;
      const f = l.power * Math.pow(1 - Math.sqrt(d2) / l.reach, 1.7);
      r += l.col.r * f;
      g += l.col.g * f;
      b += l.col.b * f;
    }
    const sum = r + g + b;
    if (sum < 0.02) continue;
    // the accumulated light's own hue, normalised off its brightness
    const hr = r / sum;
    const hg = g / sum;
    const hb = b / sum;
    base.setHex(blockColor(c.material));
    const luma = base.r * 0.2126 + base.g * 0.7152 + base.b * 0.0722;
    const k = Math.min(LEAN, sum * 0.5);
    field.tintLinearAt(
      c.x,
      c.y,
      c.z,
      base.r + (hr * 3 * luma - base.r) * k,
      base.g + (hg * 3 * luma - base.g) * k,
      base.b + (hb * 3 * luma - base.b) * k
    );
    touched++;
  }

  // 3b. THE LAMPS THEMSELVES. eight of them, the biggest signs only, with
  // no shadows and a short range. a point light is the one thing here that
  // knows what time it is: at night it pools colour down a facade and
  // across the tarmac, and at noon the sun simply drowns it. the bake
  // cannot do that and the emission cannot do that.
  for (const l of streetLamps) scene.remove(l);
  streetLamps.length = 0;
  // SPACED, not just strongest. taking the top eight by output handed four
  // of the eight slots to the four lamps stacked down one pink banner, so
  // half the street's real illumination was one sign and the whole block
  // read magenta. a light now has to stand clear of the ones already
  // chosen, which spreads the eight across the frontage and lets the cyan,
  // the amber and the green actually reach the ground.
  const SEPARATION = 9;
  const strongest: typeof lamps = [];
  for (const l of lamps.slice().sort((a, b2) => b2.power * b2.reach - a.power * a.reach)) {
    if (strongest.length >= 8) break;
    if (strongest.some((k) => Math.hypot(k.x - l.x, k.y - l.y, k.z - l.z) < SEPARATION)) continue;
    strongest.push(l);
  }
  for (const l of strongest) {
    const pl = new THREE.PointLight(l.col.getHex(), 0, l.reach * 2.4, 1.7);
    pl.position.set(l.x - GRID / 2 + 0.5, l.y + 0.5, l.z - GRID / 2 + 0.5);
    pl.castShadow = false;
    scene.add(pl);
    streetLamps.push(pl);
  }

  // 4. the wet film, and the dozen brightest signs it reflects
  wet.addSurface(work.wet.map((w) => ({ x: cellX + w.dx, z: cellZ + w.dz, y: groundY + 1.004, wet: w.wet })));
  wet.setEmitters(
    lamps
      .slice()
      .sort((a, b2) => b2.power * b2.reach - a.power * a.reach)
      .map((l) => ({ x: l.x - GRID / 2 + 0.5, y: l.y + 0.5, z: l.z - GRID / 2 + 0.5, reach: l.reach, color: l.col }))
  );

  journal.add(
    "mason",
    strata.epoch,
    "levelled a block and built the street on it. four owners, four decades, one row. the signs are bigger than the shops.",
    "scripted"
  );
  return {
    placed,
    designed: cells.length,
    emitters: work.emitters.length,
    litSurfaces: touched,
    cut,
    fill,
    manifest: work.manifest,
    height: work.height,
    footprint: work.footprint,
    at: { x: cellX, z: cellZ, groundY },
  };
};

// dev only: the market decides life and death, but a test needs a lever
panel.onLife = (mode) => {
  for (const r of ["surveyor", "architect", "mason", "keeper"] as const) vitality.setOverride(r, mode);
};

// the founding stone breathes: a faint warm core + a small light that make
// the one block in the world read as quietly alive
const core = new THREE.Mesh(
  new THREE.BoxGeometry(1.06, 1.06, 1.06),
  new THREE.MeshStandardMaterial({
    color: SWATCH.genesis,
    emissive: SWATCH.lantern,
    emissiveIntensity: 0.85,
    roughness: 0.6,
  })
);
core.position.copy(genesis);
scene.add(core);
const glow = new THREE.PointLight(SWATCH.lantern, 4.2, 12, 1.8);
glow.position.copy(genesis).add(new THREE.Vector3(0, 1.4, 0));
scene.add(glow);

// the air is layered: seeds tumbling close by, motes catching the light in
// the middle distance, faint specks drifting far out over the mass. all
// three ride the same wind at their own speeds.
// SMALLER, PINKER, FAINTER. the near layer was 0.1 across in cream at half
// opacity, which against a golden sky is a white card — the layer named
// "petal" was the one reading least like one. the sizes come down, the near
// layer takes an actual blossom pink, and the opacities drop so the air
// reads as something drifting through it rather than as objects in it.
const ashLayers: AshDrift[] = [new AshDrift(scene, wind, 1.0, 0.055, 0.34, 0xefb9c6)];
if (quality.driftLayers > 1) ashLayers.push(new AshDrift(scene, wind, 0.55, 0.035, 0.22, SWATCH.bloomCream));
if (quality.driftLayers > 2) ashLayers.push(new AshDrift(scene, wind, 0.3, 0.022, 0.14, SWATCH.haze));

// ---------------------------------------------------------------------------
// seeing: orbit rig (default) + first-person walker (click to enter)
// ---------------------------------------------------------------------------
const rig = new OrbitRig(canvas);
rig.target.copy(genesis);

// the stream director: drama outranks progress in the camera. it stands
// down entirely while a visitor is walking.
const director = new Director(rig);
director.enabled = !new URLSearchParams(location.search).has("nodirector");


// spawn a few steps out from the stone, facing it
const spawnX = genesis.x + 9;
const spawnZ = genesis.z + 9;
const spawnYaw = Math.atan2(-(genesis.x - spawnX), -(genesis.z - spawnZ));
const fp = new FirstPerson(field, camera, spawnX, spawnZ, spawnYaw);

const hintEl = document.getElementById("hint");
let walking = false;
document.addEventListener("pointerlockchange", () => {
  walking = !!document.pointerLockElement;
  document.body.classList.toggle("walking", walking);
  if (walking) {
    hintEl?.classList.add("faded");
    fp.syncCamera();
  } else {
    rig.seedFrom(camera); // hand the camera back without a cut
  }
});

// click (not drag) enters the world
let downX = 0;
let downY = 0;
canvas.addEventListener("pointerdown", (e) => {
  downX = e.clientX;
  downY = e.clientY;
});
canvas.addEventListener("pointerup", (e) => {
  if (walking) return;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) < 5 && e.pointerType === "mouse") {
    fp.requestLock();
  }
});

// plaques: every block answers for itself (walk: aim + e · orbit: right
// click). wallet indices become the feed's stable pubkeys; the crew and
// the world answer by name.
const plaques = new Plaques(field, strata, works, camera, canvas);
plaques.describeWallet = (w) => (w === -1 ? "the world" : w === -3 ? "the crew" : feed.short(w));
plaques.ribbonInfo = (x, y, z) => ribbon.infoAt(x, y, z);
plaques.special = (x, y, z) =>
  tombs.plaque(x, y, z) ?? (shrine.isPart(x, y, z) ? shrine.plaque(x, y, z) : undefined);
plaques.onInspect = (x, y, z) => {
  if (shrine.isTablet(x, y, z)) shrine.play(performance.now());
};

// multiplayer transport: DORMANT behind NET_ENABLED. wired now so the place
// layer only has to flip the flag; while dormant nothing connects.
const net = new Net();
net.onRemoteEdit = (x, y, z, type) => field.applyRemoteEdit(x, y, z, type);
void net.connect();

// dev edit probe (dev builds only): damage tiers, break, place
let probe: EditProbe | null = null;
if (DEV_EDIT) {
  probe = new EditProbe(scene, camera, field);
  probe.blocked = insideWalker;
  // dev pokes flow through the same bookkeeping as real geology
  probe.onEdit = (kind, x, y, z) => {
    if (kind === "break") {
      strata.forget(x, y, z);
      scars.registerAround(x, y, z, performance.now());
    } else {
      strata.register(x, y, z, -1, "dev");
    }
    growth.refreshAround(x, y, z);
  };
}

// ---------------------------------------------------------------------------
// hud
// ---------------------------------------------------------------------------
const stMode = document.getElementById("st-mode");
const stBlocks = document.getElementById("st-blocks");
const stPos = document.getElementById("st-pos");

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------
// the post stack, built from the one configuration
const post = new Post(renderer, scene, camera, quality);

// THE STYLISATION IS A URL PARAM, because the only way to choose a strength
// is to look at the same frame at several of them, and reloading a page is
// faster than opening a console. every individual parameter is on the handle
// as well — ?style=strong picks a preset, &px=4&quant=0.8 overrides inside it.
{
  const q = new URLSearchParams(location.search);
  // THE DEFAULT IS THE LOOK. the stylisation is not an option the world
  // boots without — it is the processing signature, and a visitor who has to
  // ask for it never sees it. subtle is the shipped one: half resolution,
  // a partial snap to the world's own palette and enough dither to weave a
  // sky, which reads as a treatment without turning the buildings into
  // heraldry. ?style=off is the comparison, ?style=strong the full one.
  const mode = q.get("style") ?? "subtle";
  if (mode === "off" || mode === "subtle" || mode === "strong") post.setStyle(mode);
  const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
  const over: Record<string, number | undefined> = {
    // ?px= is the chunk size in CSS PIXELS (2 = the old default's look,
    // 1 = the shipped subtle, 0.5 = quarter, 0 = off) — display-relative,
    // so the number means the same thing on a retina panel and a 1x one
    pxCss: num("px"),
    paletteMix: num("quant"),
    ditherAmount: num("dither"),
    chroma: num("chroma"),
    rampSteps: num("ramp"),
  };
  const tuned = Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined && !Number.isNaN(v)));
  if (Object.keys(tuned).length) post.tune(tuned);
}

// the silent ladder: if the frame slips, the world gives something up and
// never says so. it only ever steps down.
const auto = new AutoQuality((cfg, step) => {
  quality = cfg;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, cfg.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  sun.shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
  sun.shadow.radius = cfg.shadowRadius;
  SH = cfg.shadowFrustum;
  sun.shadow.camera.left = -SH;
  sun.shadow.camera.right = SH;
  sun.shadow.camera.top = SH;
  sun.shadow.camera.bottom = -SH;
  sun.shadow.camera.updateProjectionMatrix();
  if (sun.shadow.map) {
    sun.shadow.map.dispose();
    sun.shadow.map = null;
  }
  post.apply(cfg);
  post.setSize(window.innerWidth, window.innerHeight);
  for (let i = 0; i < ashLayers.length; i++) ashLayers[i].points.visible = i < cfg.driftLayers;
  sky.setStarCount(cfg.stars);
  void step;
});

// the land is kept, not generated: field plots, contour walls, swept
// path edges — run after everything that paves or builds at boot is done
tendGround(field, plan);

// walk-scale cover: tufts, flowers, stones, leaves, waymarkers — seeded
// deterministically around the camera, gone by twenty blocks out
const cover = new GroundCover(scene);

// the debug readout: hidden, p reveals it. no visitor ever sees a quality
// control anywhere in this world.
const perf = new PerfHud(renderer, () => field.placedCount, () => auto.current);

let frameNo = 0;
let stepDist = 0;
let lastFpX = 0;
let lastFpZ = 0;
let lastBell = -1;

const clock = new THREE.Clock();
const camDir = new THREE.Vector3();
const _fillLift = new THREE.Vector3();
let lastAmbient = 0;
let ambientLevel = 0.15;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  const now = performance.now();
  if (walking) fp.update(dt);
  else rig.update(dt, camera);
  probe?.update();
  sky.update(dt, t, camera.position, wind.dirX, wind.dirZ, wind.gust);
  cloudSea.update(t, camera.position, sky.light, scene.fog as THREE.Fog);
  underside.update(t, sky.light, scene.fog as THREE.Fog);
  horizonIsles.update(sky.light);
  flora.update(t);
  wind.update(dt, t);
  water.update(dt, t);
  for (const a of ashLayers) a.update(dt, t, camera.position);
  feed.update(now);
  ticks.update(now);
  strata.update(now);
  growth.drain();
  kinetics.update(dt);
  erosion.update(now);
  hollows.update(t);
  scars.update(now);
  surveyor.update(dt, now);
  surveyor.body.update(dt, t, camera);
  keeper.update(dt, now);
  keeper.body.update(dt, t, camera);
  vitality.update(strata.epoch);
  if (mourningUntil && now > mourningUntil) {
    mourningUntil = 0;
    works.dimLanterns(1); // the flags come back up
  }
  director.update(dt, now, walking);
  // publish the crew log on a slow cadence
  if (feedQueue.length && now > feedFlushAt) {
    feedFlushAt = now + 20_000;
    const batch = feedQueue;
    feedQueue = [];
    void fetch("/api/journal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries: batch }),
    }).catch(() => undefined);
  }
  mason.update(now);
  mason.body.update(dt, t, camera);
  architect.body.update(dt, t, camera);
  candles.update();
  glyphs.update(dt);
  audio.update(now);
  shrine.update(now);
  plaques.update(now);
  panel.update(now);

  // r6: the tick's gross volume is authoritative; the rolling minute lets
  // a surge read before its tick closes. eased so light never snaps.
  if (now - lastAmbient > 500) {
    lastAmbient = now;
    const rolling = 1 - Math.exp(-feed.grossPerMin(now) / 2500);
    ambientLevel += (Math.max(ambientTarget, rolling) - ambientLevel) * 0.25;
    for (const a of ashLayers) a.setLevel(ambientLevel);
    // the heartbeat: the trailing minute's tx count sets the world's pulse
    const beats = feed.txPerMin(now);
    audio.setPulse(beats > 0 ? 20 + Math.min(60, beats) : 0);
  }

  // the sky's day script plays the lights; the market breathes on top (r6)
  sun.color.copy(sky.light.sunColor);
  sun.intensity = sky.light.sunIntensity * (1 + 0.28 * ambientLevel);
  hemi.color.copy(sky.light.hemiSky);
  hemi.groundColor.copy(sky.light.hemiGround);
  hemi.intensity = sky.light.hemiIntensity;
  (scene.fog as THREE.Fog).color.copy(sky.light.fog);
  (scene.background as THREE.Color).copy(sky.light.fog);
  // the water reflects the sky it is actually under, this hour
  water.setSky(
    sky.light.zenith,
    sky.light.mid,
    sky.light.horizon,
    sky.light.fog,
    sky.light.sunColor,
    sky.light.sunDir,
    sky.light.sunIntensity
  );
  // the town's lamps come up as the sun goes down. one curve, so the
  // street lights itself on the same schedule the lanterns do.
  if (streetLamps.length) {
    const night = 1 - Math.min(1, Math.max(0, (sky.light.sunIntensity - 0.4) / 1.5));
    for (const l of streetLamps) l.intensity = 2.0 + night * 12;
  }
  // the road dries out by day: the signs cannot compete with the sun, so
  // the whole effect eases off rather than switching
  wet.setSky(
    sky.light.zenith,
    sky.light.mid,
    sky.light.horizon,
    sky.light.fog,
    Math.min(1, sky.light.sunIntensity / 2.1),
    t
  );

  if (net.enabled) {
    net.sendPos(fp.pos.x, fp.pos.y, fp.pos.z, fp.yaw, now);
    net.flush(now);
  }

  // the founding stone breathes on a slow cycle
  (core.material as THREE.MeshStandardMaterial).emissiveIntensity =
    0.75 + Math.sin(t * 0.9) * 0.22;
  glow.intensity = 4.4 + Math.sin(t * 0.9) * 1.2;

  // the shadow map refreshes on a cadence, not every frame: the sun crawls
  // and the world changes a block at a time
  frameNo++;
  renderer.shadowMap.needsUpdate = frameNo % quality.shadowEvery === 0;

  // THE FOG FOLLOWS THE ORBIT OUT. the scene fog is tuned for the composed
  // mid-range views — at 170/560 a full-map orbit would drown the whole
  // world in it, since every block sits 200-700 out at that radius. pulled
  // back proportionally past the composed range, so zooming out reveals
  // the world rather than a wall of haze; walking never touches it.
  {
    const zoomOut = walking ? 0 : Math.max(0, rig.radius - 120);
    const f = scene.fog as THREE.Fog;
    f.near = FOG_NEAR + zoomOut * 1.2;
    f.far = FOG_FAR + zoomOut * 1.6;
  }

  // keep the sun's shadow window centered on the view — and WIDEN it as the
  // orbit pulls back, or the full-map frame is lit-but-shadowless outside a
  // box around the centre. the map spreads over a larger area, so shadows
  // soften at full zoom; at that range they are tone, not detail.
  sun.target.position.set(camera.position.x, 0, camera.position.z);
  {
    const spread = walking ? 1 : Math.max(1, Math.min(2.4, rig.radius / 140));
    const ext = SH * spread;
    if (Math.abs(sun.shadow.camera.right - ext) > 1) {
      sun.shadow.camera.left = -ext;
      sun.shadow.camera.right = ext;
      sun.shadow.camera.top = ext;
      sun.shadow.camera.bottom = -ext;
      sun.shadow.camera.updateProjectionMatrix();
      renderer.shadowMap.needsUpdate = true;
    }
  }
  sun.position.copy(sun.target.position).addScaledVector(sky.light.sunDir, SUN_DIST);

  // and the fill stands opposite it, raised. the sun sits low through the
  // golden hour, so an anti-key that simply mirrored it would be underground
  // and light nothing — the y term is a floor, not a reflection.
  fill.target.position.copy(sun.target.position);
  fill.position
    .copy(sun.target.position)
    .addScaledVector(sky.light.sunDir, -SUN_DIST * 0.8)
    .add(_fillLift.set(0, SUN_DIST * 0.55, 0));

  // the viewer fill rides the camera
  camera.getWorldDirection(camDir);
  viewFill.position.copy(camera.position);
  viewFill.target.position.copy(camera.position).add(camDir);

  if (stMode) stMode.textContent = walking ? "walk" : "orbit";
  if (stBlocks) stBlocks.textContent = `blocks ${field.placedCount} · epoch ${strata.epoch}`;
  if (stPos) {
    const p = walking ? fp.pos : camera.position;
    stPos.textContent = `${p.x.toFixed(0)} ${p.y.toFixed(0)} ${p.z.toFixed(0)}`;
  }

  renderer.info.reset();
  if (post.bypass) {
    // nothing on top of the scene: draw straight to the screen, no
    // offscreen buffer, no copy
    renderer.render(scene, camera);
  } else {
    post.setPhase(sky.phase01(t), sky.light.fog, t);
    // the valley mist needs to know where the camera is looking to turn a
    // depth buffer back into world altitude
    post.setCameraBasis(camera);
    // and the focus follows whatever the camera is actually looking at, so
    // the sharp band is always ON the subject rather than at a fixed range
    // the subject wanders in and out of
    // on foot the subject is whatever is in front of you, so the focal
    // point rides a fixed distance down the view vector; on the rig it is
    // the thing the rig is orbiting, which is by definition the subject
    if (post.dofMode > 0) {
      if (fp.locked) {
        camera.getWorldDirection(dofAim).multiplyScalar(15).add(camera.position);
        post.focusOn(dofAim);
      } else {
        post.focusOn(rig.target);
      }
    }
    post.render();
  }
  if (workSite) {
    const onSite = mason.current;
    workSite.show(onSite.bp, onSite.cursor);
  }
  life?.update(dt, wind, camera, sky.phase01(t));
  cover.update(camera, field, plan);
  field.setTime(t);

  // the sound bed: wind that rises with altitude, water that swells near
  // basin edges and the coast falls, footsteps under the walker, and the
  // temple bell far off on the world's hour
  if (frameNo % 12 === 0) {
    audio.setWind(Math.min(1, Math.max(0, (camera.position.y - 6) / 55)) + wind.gust * 0.2);
    let wd = 99;
    for (const b of BASINS) {
      const d = Math.abs(Math.hypot(camera.position.x - (b.x - GRID / 2), camera.position.z - (b.z - GRID / 2)) - b.r * 0.78);
      if (d < wd) wd = d;
    }
    for (const f of underside.fallSpots) {
      const d = Math.hypot(camera.position.x - (f.x - GRID / 2), camera.position.z - (f.z - GRID / 2));
      if (d * 0.55 < wd) wd = d * 0.55; // a fall carries further than a lap
    }
    audio.setWater(1 - Math.min(1, wd / 20));
  }
  if (walking) {
    stepDist += Math.hypot(fp.pos.x - lastFpX, fp.pos.z - lastFpZ);
    if (stepDist > 1.9) {
      stepDist = 0;
      const ux = Math.floor(fp.pos.x + GRID / 2);
      const uz = Math.floor(fp.pos.z + GRID / 2);
      const uy = field.topAt(ux, uz) - 1;
      audio.step(uy >= 0 && !isGround(field.typeAt(ux, uy, uz)));
    }
  }
  lastFpX = fp.pos.x;
  lastFpZ = fp.pos.z;
  const bellHour = Math.floor(t / 300);
  if (bellHour !== lastBell && t > 60) {
    lastBell = bellHour;
    audio.bellHour();
  }
  if (weather) {
    // the pressure is the trailing net flow turned negative-side-up: a red
    // hour is a storm and a quiet one is clear air
    const recent = ticks.history.slice(-6);
    const net = recent.reduce((a, x) => a + x.netFlowUsd, 0) / Math.max(1, recent.length);
    weather.drive(dt, sky.phase01(t), Math.max(0, Math.min(1, -net / 4000)), strata.epoch);
    weather.update(dt, camera, wind);
    // the town's wet film thickens in the rain, which is the one place the
    // weather touches something already built
    wet.rainWetness = weather.wetness;
  }
  // the one moment the drawing buffer is guaranteed to hold a picture
  photo?.afterRender(renderer);
  perf.update(dt);
  auto.update(dt, now);
}
auto.begin(performance.now());
frame();

// THE CLOCK, IF THERE IS A SERVER TO TAKE IT. with no market service
// configured this returns null instantly and the world runs exactly as it
// always has, on the synthetic feed — which is the shipped state, because the
// token is still a stand-in and a world that silently switched to following a
// placeholder would be worse than one that admits it is synthetic.
//
// point it at one with ?market=http://127.0.0.1:8787 or VITE_MARKET_URL, and
// the tick engine stops rolling its own and follows the log instead. nothing
// downstream knows the difference: the rules read a TickSummary either way.
let chain: ChainFeed | null = null;
void connectChain(ticks, (st) => {
  journal.add(
    "keeper",
    ticks.epoch,
    st.standIn
      ? `the ledger is being read, but the token is a stand-in. tick ${st.lastTick}.`
      : `the ledger is being read. ${st.mint.slice(0, 8)}… at tick ${st.lastTick}.`
  );
}).then((c) => {
  chain = c;
  if (c) console.info("[cathedral] following the market service; local ticks stood down");
});

// a small debug/stream handle (the director module will drive cameras
// through this later)
declare global {
  interface Window {
    cathedral?: {
      field: VoxelField;
      rig: OrbitRig;
      fp: FirstPerson;
      camera: THREE.PerspectiveCamera;
      genesis: THREE.Vector3;
      feed: Feed;
      growth: Growth;
      hollows: Hollows;
      strata: Strata;
      GROW: typeof GROW;
      ticks: TickEngine;
      erosion: Erosion;
      monuments: Monuments;
      surveyor: Surveyor;
      architect: Architect;
      mason: Mason;
      works: CrewWorks;
      journal: Journal;
      keeper: Keeper;
      vitality: Vitality;
      tombs: Tombs;
      director: Director;
      voice: Voice;
      buildGatePiece: (x?: number, z?: number) => {
        placed: number;
        designed: number;
        manifest: { component: string; instances: number }[];
        height: number;
        at: { x: number; z: number; groundY: number };
      };
      buildStreetBlock: (x?: number, z?: number) => {
        placed: number;
        designed: number;
        emitters: number;
        litSurfaces: number;
        cut: number;
        fill: number;
        manifest: { component: string; instances: number }[];
        height: number;
        footprint: { w: number; d: number };
        at: { x: number; z: number; groundY: number };
      };
      buildCanalReach: (x?: number, z?: number) => {
        placed: number;
        designed: number;
        cleared: number;
        manifest: { component: string; instances: number }[];
        at: { x: number; z: number; groundY: number };
      };
      materials: typeof MATERIALS;
      plaques: Plaques;
      sky: Sky;
      flora: Flora;
      water: Water;
      ribbon: Ribbon;
      islands: Islands;
      shrine: Shrine;
      kinetics: Kinetics;
      renderer: THREE.WebGLRenderer;
      cover: GroundCover;
      post: Post;
      runHistory: (epochs?: number) => Promise<number>;
      captureMode: (on: boolean) => void;
      plan: UrbanPlan;
      woods: { planted: number; blocks: number; bySpecies: Record<string, number> };
      settle: (n?: number) => { made: number; parcels: number };
      workSite: WorkSite;
      life: { props: number; laundry: number; boats: number; smoke: number };
      lifeScatter: () => { props: number; laundry: number; boats: number; smoke: number };
      weather: Weather;
      photo: Photo;
      framings: typeof FRAMINGS;
      motif: Motif;
      paletteHex: typeof paletteHex;
      underside: Underside;
      chain: ChainFeed | null;
    };
  }
}
// CAPTURE MODE. a plate of this world kept coming back with a floating
// "+$40" across a shopfront, because the market's own labels are part of
// the world and a screenshot cannot tell the difference. one switch takes
// down every layer that is the world TALKING rather than the world being
// itself: the hud chrome, and the market glyphs already in the air.
const captureMode = (on: boolean) => {
  const CHROME = ["wordmark", "status", "hint", "crosshair", "fps", "panel", "journal", "plaque"];
  for (const id of CHROME) {
    const el = document.getElementById(id);
    if (el) el.style.display = on ? "none" : "";
  }
  glyphs.enabled = !on;
  if (on) glyphs.clear();
  // the crew's name tags are sprites in the scene, not chrome in the dom,
  // so the css above cannot reach them: a plate came back with the word
  // "surveyor" floating over a hall. the crew stay in frame, they just stop
  // introducing themselves.
  for (const a of [surveyor.body, architect.body, mason.body, keeper.body]) a.avatar.showLabel(!on);
  // a plate of the settlement wants the settlement, not the scaffolding
  // around the half of it that happens to be going up this hour
  workSite?.setVisible(!on);
  // weather STAYS in a plate: rain is the world, not the interface
  // the birds and the smoke STAY in a plate: they are the world being
  // inhabited, not the interface talking
};

photo = new Photo(camera, rig, post, field, captureMode);

// THE WORLD SHOULD LOOK LIKE SOMEWHERE WORK IS HAPPENING. finished objects
// appearing a block at a time never read as construction: the ghost shows
// what is coming, the staging shows what is rising.
workSite = new WorkSite(scene);

// SMALL LIFE. the settlement was architecture and nothing else — every
// object in it had been designed, so every object in it was a building or a
// part of one. this is the stuff nobody designed.
life = new SmallLife(scene);

// WEATHER, ON A CLOCK, WITH THE MARKET'S TEMPER. the state comes off the
// day so the sky has a shape whatever the tape does; how hard it comes down
// is the selling pressure.
weather = new Weather(scene);
const lifeReport = life.scatter(field, plan);
// and again whenever a work finishes: the rules all look for a wall to lean
// against, and a wall is exactly what a finished work has just added
mason.onFinished = ((prev) => (bp: { cells: { x: number; z: number }[] }) => {
  prev?.(bp as never);
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const c of bp.cells) {
    if (c.x < x0) x0 = c.x;
    if (c.x > x1) x1 = c.x;
    if (c.z < z0) z0 = c.z;
    if (c.z > z1) z1 = c.z;
  }
  const r = life!.scatter(field, plan, { x0: x0 - 3, z0: z0 - 3, x1: x1 + 4, z1: z1 + 4 });
  lifeReport.props += r.props;
  lifeReport.laundry += r.laundry;
  lifeReport.boats += r.boats;
  lifeReport.smoke = r.smoke;
})(mason.onFinished);

// age the settlement: N works sited by the plan, laid whole. the capture
// lever for looking at a TOWN rather than at one building.
const settle = (n = 12) => {
  let made = 0;
  for (let k = 0; k < n; k++) {
    const bp = architect.settleOnce(strata.epoch);
    if (!bp) continue;
    mason.placeInstant(bp);
    made++;
  }
  return { made, parcels: plan.parcels.length };
};

// THE CONSOLE HANDLE IS THE SAME TELL, QUIETER. it hands out the feed, the
// tick engine and the growth queue by name, so anyone who opens a console on
// a public build reads the whole mechanism off one object. it is also what
// every capture harness drives, so it stays on wherever the panel does —
// localhost, a dev server, or an explicit ?dev — and nowhere else.
if (DEV_TOOLS) window.cathedral = {
  captureMode,
  get workSite() {
    return workSite!;
  },
  life: lifeReport,
  // a capture rig builds its walls with placeInstant, which never goes
  // through the mason and so never fires the finish hook
  lifeScatter: () => life!.scatter(field, plan),
  get weather() {
    return weather!;
  },
  get photo() {
    return photo!;
  },
  framings: FRAMINGS,
  motif,
  paletteHex,
  underside,
  get chain() {
    return chain;
  },
  plan,
  woods,
  settle,
  field,
  rig,
  fp,
  camera,
  cover,
  genesis,
  feed,
  growth,
  hollows,
  strata,
  GROW,
  ticks,
  erosion,
  monuments,
  surveyor,
  architect,
  mason,
  works,
  journal,
  keeper,
  vitality,
  tombs,
  director,
  voice,
  buildGatePiece,
  buildCanalReach,
  buildStreetBlock,
  materials: MATERIALS,
  plaques,
  sky,
  flora,
  water,
  ribbon,
  islands,
  shrine,
  kinetics,
  renderer,
  post,
  runHistory,
};

// aged preview by default: the world is worth a screenshot within its
// first ten seconds. ?young boots the empty meadow instead (and the real
// genesis, phase 2, always starts young by law). runs last: the history
// bootstrap drives every system, so every system must exist first.
if (!new URLSearchParams(location.search).has("young")) void runHistory(50);
