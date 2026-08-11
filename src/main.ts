// cathedral - entry. the app shell: renderer, the warm-black void, ashfall
// dusk lighting, and the frame loop. the world itself arrives in later
// systems (voxel field, terrain, controls); this file only assembles them.

import * as THREE from "three";

// style bible
const VOID = 0x0b0b0a;
const SUN_COLOR = 0xe8a066;

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
scene.background = new THREE.Color(VOID);
scene.fog = new THREE.Fog(VOID, 40, 210);

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
const sun = new THREE.DirectionalLight(SUN_COLOR, 1.35);
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

  // idle drift over the empty void until the world lands
  const t = clock.elapsedTime * 0.05;
  camera.position.set(Math.cos(t) * 24, 10, Math.sin(t) * 24);
  camera.lookAt(0, 2, 0);

  // keep the sun's shadow window centered on the view
  sun.target.position.set(camera.position.x, 0, camera.position.z);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, SUN_DIST);

  if (stMode) stMode.textContent = "orbit";
  if (stBlocks) stBlocks.textContent = "blocks 0";
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
