// cathedral - entry. assembles the systems: renderer, ashfall dusk, the
// voxel field with its ash plain, the founding stone, and the two ways of
// seeing: the orbit rig (default, stream shot, mobile) and the first-person
// walker (click to enter, esc to leave).

import * as THREE from "three";
import { AshDrift } from "./ash";
import {
  C_VOID,
  DEV_EDIT,
  FOG_FAR,
  FOG_NEAR,
  GRID,
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
import { Hollows } from "./hollows";
import { Kinetics } from "./kinetics";
import { Net } from "./net";
import { OrbitRig } from "./orbitcam";
import { blockColor, GENESIS as GENESIS_ID, MASS } from "./palette";
import { RULES } from "./rules";
import { Scars } from "./scars";
import { Strata } from "./strata";
import { buildVoidFloor, GENESIS_CELL, placeGenesis, plainSampler } from "./terrain";
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(C_VOID);
scene.fog = new THREE.Fog(C_VOID, FOG_NEAR, FOG_FAR);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
scene.add(camera);

// ---------------------------------------------------------------------------
// ashfall dusk - one low warm sun, long shadows, near-void ambient
// ---------------------------------------------------------------------------
const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
const SH = 70; // local shadow frustum, re-centered on the camera each frame
sun.shadow.camera.left = -SH;
sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH;
sun.shadow.camera.bottom = -SH;
// biases sized for 1-unit voxels: a single block must still drag its long
// shadow (a large normal bias silently erases exactly that)
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.35;
scene.add(sun);
scene.add(sun.target);

// sun sits low (~11 degrees) so every block drags a long shadow
const sunDir = new THREE.Vector3(-0.72, 0.2, -0.42).normalize();
const SUN_DIST = 180;

// faint warm sky over void ground; keeps unlit faces just above black
scene.add(new THREE.HemisphereLight(0x33271d, 0x0b0b0a, 0.62));

// a whisper of sage fill from the far side so the shadow side of the mass
// keeps its shape instead of dropping to pure void
const fill = new THREE.DirectionalLight(0x8fae6a, 0.15);
fill.position.set(120, 60, 90);
scene.add(fill);

// the viewer's fill: a soft warm-neutral light cast from the camera, so
// whatever face of the structure you are looking at always reads its
// strata tint. one low sun means one dark side; the structure is the
// product and can never be a black smudge from the orbit cam.
const viewFill = new THREE.DirectionalLight(0xd8c8ac, 0.55);
scene.add(viewFill);
scene.add(viewFill.target);

// ---------------------------------------------------------------------------
// the world: ash plain + founding stone
// ---------------------------------------------------------------------------
buildVoidFloor(scene);
const field = new VoxelField(plainSampler);
scene.add(field.group);

const genesis = placeGenesis(field);

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
let ambientTarget = 0.15;

feed.on((ev) => {
  switch (ev.kind) {
    case "buy":
    case "sell":
      ticks.ingest(ev);
      break;
    case "burn":
      hollows.burn(ev.amountTokens, (x, y, z) => growth.refreshAround(x, y, z));
      break;
    case "newHolder":
      break; // r5 seed planting lands with the monuments commit
  }
});

ticks.onTick = (s) => {
  // r1: positive net flow accretes, attributed proportionally to buyers
  if (s.netFlowUsd > 0) {
    const n = Math.floor(s.netFlowUsd / RULES.usdPerBlock);
    for (const [wallet, count] of distributeBlocks(n, s.buys)) {
      growth.enqueue(count, wallet, "tick-" + s.n);
    }
  }
  // r2: negative net flow destabilizes the frontier, sellers first
  if (s.netFlowUsd < 0) {
    erosion.erode(Math.floor(-s.netFlowUsd / RULES.usdPerBlock), s, ticks.tickLenMs);
  }
  // r6: ambient breathes with the tick's gross volume
  ambientTarget = Math.max(0.12, 1 - Math.exp(-s.grossVolumeUsd / 1200));
};
ticks.onEpoch = () => strata.advanceEpoch();

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

// the founding stone breathes: a faint warm core + a small light that make
// the one block in the world read as quietly alive
const core = new THREE.Mesh(
  new THREE.BoxGeometry(1.06, 1.06, 1.06),
  new THREE.MeshStandardMaterial({
    color: 0xfaf3e2,
    emissive: 0xd4a25a,
    emissiveIntensity: 0.5,
    roughness: 0.6,
  })
);
core.position.copy(genesis);
scene.add(core);
const glow = new THREE.PointLight(0xe8b070, 3.4, 9, 1.8);
glow.position.copy(genesis).add(new THREE.Vector3(0, 1.4, 0));
scene.add(glow);

// ash drift: sparse motes through the dusk. the level is driven by market
// volume once the feed lands (r6); until then a quiet baseline falls.
const ash = new AshDrift(scene);

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
const fpsEl = document.getElementById("fps");
const fpsNum = document.getElementById("fps-num");

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP") fpsEl?.classList.toggle("hidden");
});

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
const camDir = new THREE.Vector3();
let fpsAcc = 0;
let fpsFrames = 0;
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
  ash.update(dt, t, camera.position);
  feed.update(now);
  ticks.update(now);
  strata.update(now);
  growth.drain();
  kinetics.update(dt);
  erosion.update(now);
  hollows.update(t);
  scars.update(now);
  panel.update(now);

  // r6: the tick's gross volume is authoritative; the rolling minute lets
  // a surge read before its tick closes. eased so light never snaps.
  if (now - lastAmbient > 500) {
    lastAmbient = now;
    const rolling = 1 - Math.exp(-feed.grossPerMin(now) / 2500);
    ambientLevel += (Math.max(ambientTarget, rolling) - ambientLevel) * 0.25;
    ash.setLevel(ambientLevel);
    sun.intensity = SUN_INTENSITY * (1 + 0.28 * ambientLevel);
  }

  if (net.enabled) {
    net.sendPos(fp.pos.x, fp.pos.y, fp.pos.z, fp.yaw, now);
    net.flush(now);
  }

  // the founding stone breathes on a slow cycle
  (core.material as THREE.MeshStandardMaterial).emissiveIntensity =
    0.42 + Math.sin(t * 0.9) * 0.16;
  glow.intensity = 3.0 + Math.sin(t * 0.9) * 0.9;

  // keep the sun's shadow window centered on the view
  sun.target.position.set(camera.position.x, 0, camera.position.z);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, SUN_DIST);

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

  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc >= 0.5 && fpsNum) {
    fpsNum.textContent = String(Math.round(fpsFrames / fpsAcc));
    fpsAcc = 0;
    fpsFrames = 0;
  }

  renderer.render(scene, camera);
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
    };
  }
}
window.cathedral = { field, rig, fp, camera, genesis, feed, growth, hollows, strata, GROW };
