// cathedral - entry. assembles the systems: renderer, the long golden hour,
// the voxel field with its meadow, the founding stone, and the two ways of
// seeing: the orbit rig (default, stream shot, mobile) and the first-person
// walker (click to enter, esc to leave).

import * as THREE from "three";
import { AshDrift } from "./ash";
import {
  DEV_EDIT,
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
import { PerfHud } from "./perfhud";
import { initialQuality, qualityFor, type Effects, type Quality, type Tier } from "./quality";
import { Architect } from "./architect";
import { audio } from "./audio";
import { CrewWorks } from "./crew";
import { Journal } from "./journal";
import { Mason } from "./mason";
import { blockColor, GENESIS as GENESIS_ID, MASS, RUBBLE, SWATCH } from "./palette";
import { Candles } from "./candles";
import { Glyphs } from "./glyphs";
import { Plaques } from "./plaques";
import { Ribbon } from "./ribbon";
import { Surveyor } from "./surveyor";
import { RULES } from "./rules";
import { Scars } from "./scars";
import { Sky } from "./sky";
import { Strata } from "./strata";
import { Flora } from "./flora";
import { Wind } from "./wind";
import { buildVoidFloor, GENESIS_CELL, meadowSampler, placeGenesis } from "./terrain";
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
// the render budget is the product. LOW is the default until a real gpu
// says otherwise: the composer pays for every pixel more than once, so the
// pixel ratio is the first thing the tier owns.
const quality: Quality = initialQuality();
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

const scene = new THREE.Scene();
scene.background = new THREE.Color(HAZE);
scene.fog = new THREE.Fog(HAZE, FOG_NEAR, FOG_FAR);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  500
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

// shadows are violet-grey, never black: a low ambient in the shadow tint
// fills what the sun cannot reach, so every frame keeps shape in the dark
const shadowFill = new THREE.AmbientLight(SWATCH.shadowTint, 0.5);
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
const hemi = new THREE.HemisphereLight(SWATCH.bounceWarm, SWATCH.meadowDeep, 0.62);
scene.add(hemi);

// a gentle cool fill from the far side for shape in the shade
const fill = new THREE.DirectionalLight(SWATCH.bounceCool, 0.14);
fill.position.set(120, 60, 90);
scene.add(fill);

// the viewer's fill, eased right back now the world carries daylight
const viewFill = new THREE.DirectionalLight(SWATCH.bounceWarm, 0.16);
scene.add(viewFill);
scene.add(viewFill.target);

// ---------------------------------------------------------------------------
// the world: ash plain + founding stone
// ---------------------------------------------------------------------------
buildVoidFloor(scene);
const field = new VoxelField(meadowSampler);
scene.add(field.group);

const genesis = placeGenesis(field);

// one wind field: the grass, the seeds, the clouds and the banners all
// obey it, so the air reads as weather and not as separate animations
const wind = new Wind();

// the living layer: grass, wildflowers, reeds, moss, all on the same wind
const flora = new Flora(scene, field, wind);

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
const works = new CrewWorks(scene, field, strata);
works.placeBorders(GENESIS_CELL);
const surveyor = new Surveyor(scene, field, strata, erosion, hollows, monuments, journal, GENESIS_CELL);
const mason = new Mason(scene, field, strata, works, kinetics, journal, {
  x: GENESIS_CELL.x + 5,
  z: GENESIS_CELL.z + 13,
});
const architect = new Architect(
  scene,
  field,
  strata,
  ticks,
  journal,
  mason,
  (x, y, z) => hollows.isHollow(x, y, z),
  GENESIS_CELL,
  { x: GENESIS_CELL.x + 14, z: GENESIS_CELL.z + 2 }
);
architect.islands = islands; // the signature project watches the sky

// settled rubble greens over in time: ruins read reclaimed, not grim
erosion.onRubble = (x, y, z) => flora.mossRubble(x, y, z);

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
const ashLayers: AshDrift[] = [new AshDrift(scene, wind, 1.0, 0.1, 0.5, SWATCH.petal)];
if (quality.driftLayers > 1) ashLayers.push(new AshDrift(scene, wind, 0.55, 0.055, 0.34, SWATCH.bloomCream));
if (quality.driftLayers > 2) ashLayers.push(new AshDrift(scene, wind, 0.3, 0.03, 0.2, SWATCH.haze));

// ---------------------------------------------------------------------------
// seeing: orbit rig (default) + first-person walker (click to enter)
// ---------------------------------------------------------------------------
const rig = new OrbitRig(canvas);
rig.target.copy(genesis);

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
plaques.special = (x, y, z) => (shrine.isPart(x, y, z) ? shrine.plaque(x, y, z) : undefined);
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
// the post stack: nothing is on at low. every effect can be switched
// independently from the hud so its cost can be measured on real hardware.
const post = new Post(renderer, scene, camera, quality.fx);

// tier changes apply live: pixel ratio, shadow budget, effect set
const applyTier = (t: Tier) => {
  const q = qualityFor(t);
  Object.assign(quality, q);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
  sun.shadow.radius = q.shadowRadius;
  SH = q.shadowFrustum;
  sun.shadow.camera.left = -SH;
  sun.shadow.camera.right = SH;
  sun.shadow.camera.top = SH;
  sun.shadow.camera.bottom = -SH;
  sun.shadow.camera.updateProjectionMatrix();
  if (sun.shadow.map) {
    sun.shadow.map.dispose();
    sun.shadow.map = null;
  }
  post.setEffects(q.fx);
  post.setSize(window.innerWidth, window.innerHeight);
};

const perf = new PerfHud(
  renderer,
  post,
  quality,
  () => field.placedCount,
  applyTier,
  (fx: Effects) => {
    quality.fx = fx;
    post.setEffects(fx);
    post.setSize(window.innerWidth, window.innerHeight);
  },
  (on: boolean) => {
    // the whole shadow pass on or off: it draws the entire world a second
    // time, so this is the single biggest switch in the world
    shadowsOn = on;
    sun.castShadow = on;
    renderer.shadowMap.needsUpdate = true;
  }
);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

let frameNo = 0;
let shadowsOn = true;

const clock = new THREE.Clock();
const camDir = new THREE.Vector3();
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
  flora.update(t);
  wind.update(dt, t);
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
  surveyor.body.update(dt, t);
  mason.update(now);
  mason.body.update(dt, t);
  architect.body.update(dt, t);
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

  if (net.enabled) {
    net.sendPos(fp.pos.x, fp.pos.y, fp.pos.z, fp.yaw, now);
    net.flush(now);
  }

  // the founding stone breathes on a slow cycle
  (core.material as THREE.MeshStandardMaterial).emissiveIntensity =
    0.75 + Math.sin(t * 0.9) * 0.22;
  glow.intensity = 4.4 + Math.sin(t * 0.9) * 1.2;

  // the shadow map refreshes on the tier's cadence, not every frame
  frameNo++;
  renderer.shadowMap.needsUpdate = shadowsOn && frameNo % quality.shadowEvery === 0;

  // keep the sun's shadow window centered on the view
  sun.target.position.set(camera.position.x, 0, camera.position.z);
  sun.position.copy(sun.target.position).addScaledVector(sky.light.sunDir, SUN_DIST);

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

  if (post.bypass) {
    // nothing on top of the scene: draw straight to the screen, no
    // offscreen buffer, no copy
    renderer.render(scene, camera);
  } else {
    post.setPhase(sky.phase01(t), sky.light.fog, t);
    post.render();
  }
  perf.update(dt);
}
frame();

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
      plaques: Plaques;
      sky: Sky;
      flora: Flora;
      ribbon: Ribbon;
      islands: Islands;
      shrine: Shrine;
      kinetics: Kinetics;
      renderer: THREE.WebGLRenderer;
      post: Post;
      runHistory: (epochs?: number) => Promise<number>;
    };
  }
}
window.cathedral = {
  field,
  rig,
  fp,
  camera,
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
  plaques,
  sky,
  flora,
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
