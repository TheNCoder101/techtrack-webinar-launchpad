import * as THREE from "three";

let sharedTexture: THREE.CanvasTexture | null = null;

function getBlobTexture(): THREE.CanvasTexture {
  if (sharedTexture) return sharedTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // V3 Track A7: multi-stop falloff instead of the old hard two-stop ramp —
  // a solid-ish core easing through a wide penumbra, so the blob reads as
  // soft occlusion rather than a dark sticker with a visible edge. Same
  // mesh/material/texture size, zero extra cost.
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(0,0,0,0.5)");
  grad.addColorStop(0.4, "rgba(0,0,0,0.38)");
  grad.addColorStop(0.7, "rgba(0,0,0,0.16)");
  grad.addColorStop(0.9, "rgba(0,0,0,0.04)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

const sharedGeo = new THREE.PlaneGeometry(1, 1);

// Cheap fake AO blob that sits just above the terrain under dynamic actors
// (player/bots) so they read as grounded without needing real shadow maps,
// which are too costly for sustained 60fps on mobile Safari.
export function createBlobShadow(radius: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: getBlobTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.65,
  });
  const mesh = new THREE.Mesh(sharedGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(radius * 2, radius * 2, 1);
  mesh.renderOrder = 1;
  return mesh;
}
