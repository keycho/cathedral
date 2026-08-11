// cathedral - entry. assembles the systems: renderer, ashfall dusk, the
// voxel field with its ash plain, and the founding stone. controls (walk +
// orbit) and the place layer land in later systems.

import * as THREE from "three";
import {
  C_VOID,
  FOG_FAR,
  FOG_NEAR,
  SUN_COLOR,
  SUN_INTENSITY,
} from "./config";
import { buildVoidFloor, placeGenesis, plainSampler } from "./terrain";
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
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
const SH = 70; // local shadow frustum, re-centered on the camera each frame
sun.shadow.camera.left = -SH;
sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH;
sun.shadow.camera.bottom = -SH;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 1.0;
scene.add(sun);
scene.add(sun.target);

// sun sits low (~11 degrees) so every block drags a long shadow
const sunDir = new THREE.Vector3(-0.72, 0.2, -0.42).normalize();
const SUN_DIST = 180;

// faint warm sky over void ground; keeps unlit faces just above black
scene.add(new THREE.HemisphereLight(0x2b211a, 0x0b0b0a, 0.5));

// a whisper of sage fill from the far side, for depth in the shadowed faces
const fill = new THREE.DirectionalLight(0x8fae6a, 0.07);
fill.position.set(120, 60, 90);
scene.add(fill);

// ---------------------------------------------------------------------------
// the world: ash plain + founding stone
// ---------------------------------------------------------------------------
buildVoidFloor(scene);
const field = new VoxelField(plainSampler);
scene.add(field.group);

const genesis = placeGenesis(field);

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
const glow = new THREE.PointLight(0xe8b070, 5, 11, 1.8);
glow.position.copy(genesis).add(new THREE.Vector3(0, 1.4, 0));
scene.add(glow);

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
let fpsAcc = 0;
let fpsFrames = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  // idle orbit around the founding stone (interactive rigs land next)
  const a = t * 0.05;
  camera.position.set(
    genesis.x + Math.cos(a) * 22,
    genesis.y + 8,
    genesis.z + Math.sin(a) * 22
  );
  camera.lookAt(genesis.x, genesis.y + 0.5, genesis.z);

  // the founding stone breathes on a slow cycle
  (core.material as THREE.MeshStandardMaterial).emissiveIntensity =
    0.42 + Math.sin(t * 0.9) * 0.16;
  glow.intensity = 4.4 + Math.sin(t * 0.9) * 1.2;

  // keep the sun's shadow window centered on the view
  sun.target.position.set(camera.position.x, 0, camera.position.z);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, SUN_DIST);

  if (stMode) stMode.textContent = "orbit";
  if (stBlocks) stBlocks.textContent = `blocks ${field.placedCount}`;
  if (stPos)
    stPos.textContent = `${camera.position.x.toFixed(0)} ${camera.position.y.toFixed(0)} ${camera.position.z.toFixed(0)}`;

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
