// cathedral - the dusk sky: a vast inverted sphere carrying a painted
// gradient. warm black overhead, a dusty amber band at the horizon (hotter
// toward the sun) so the world silhouettes against dusk instead of
// dissolving into pure black. fog still eats the middle distance; this
// only gives the silhouettes something to stand against.

import * as THREE from "three";

export function buildSky(scene: THREE.Scene, sunAzimuth: number): THREE.Mesh {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;

  // vertical dusk: void above, a dusty amber band at the horizon line,
  // falling back to void below (the ground plane covers most of it anyway)
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, "#0a0a09");
  grad.addColorStop(0.42, "#0c0b0a");
  grad.addColorStop(0.52, "#181009");
  grad.addColorStop(0.565, "#3a2413");
  grad.addColorStop(0.585, "#191008");
  grad.addColorStop(0.66, "#0b0b0a");
  grad.addColorStop(1.0, "#0b0b0a");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // the band burns hotter toward the sun
  const cx = w / 2;
  const cy = h * 0.565;
  const blob = g.createRadialGradient(cx, cy, 4, cx, cy, w * 0.3);
  blob.addColorStop(0, "rgba(122, 74, 34, 0.55)");
  blob.addColorStop(0.45, "rgba(84, 50, 24, 0.28)");
  blob.addColorStop(1, "rgba(0, 0, 0, 0)");
  g.globalCompositeOperation = "lighter";
  g.fillStyle = blob;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(880, 32, 24),
    new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    })
  );
  // aim the hot side of the band at the sun's azimuth (texture u = 0.5
  // faces -z at rotation 0; rotate so it faces the sun instead)
  sky.rotation.y = -sunAzimuth - Math.PI / 2;
  sky.renderOrder = -1;
  scene.add(sky);
  return sky;
}
