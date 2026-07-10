import * as THREE from "three";

// Shared geometries/materials so scattering ~90 props costs draw calls but
// not redundant GPU memory. Only per-instance transforms + occasional
// material clones (for slight color variance) differ.

const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 3, 6);
const leafGeo = new THREE.ConeGeometry(1.5, 2.4, 7);
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const crateGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
const roofGeo = new THREE.ConeGeometry(3.6, 2.2, 4);
const wallGeo = new THREE.BoxGeometry(4.4, 3, 3.6);

const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a3b2b });
const crateMat = new THREE.MeshLambertMaterial({ color: 0xa9793f });

export function createTree(): THREE.Group {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.5;
  group.add(trunk);

  const greenHue = 0.28 + Math.random() * 0.06;
  const leafMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color().setHSL(greenHue, 0.45, 0.32 + Math.random() * 0.08),
  });

  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    const s = 1 - i * 0.22;
    leaf.scale.set(s, s, s);
    leaf.position.y = 3.1 + i * 1.15;
    group.add(leaf);
  }

  group.userData.propKind = "tree";
  return group;
}

export function createRock(): THREE.Group {
  const group = new THREE.Group();
  const shade = 0.42 + Math.random() * 0.15;
  const mat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(shade * 0.55, shade * 0.55, shade * 0.6),
  });
  const mesh = new THREE.Mesh(rockGeo, mat);
  mesh.scale.set(
    0.7 + Math.random() * 0.9,
    0.55 + Math.random() * 0.7,
    0.7 + Math.random() * 0.9
  );
  mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  mesh.position.y = mesh.scale.y * 0.4;
  group.add(mesh);
  group.userData.propKind = "rock";
  return group;
}

export function createCrate(): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(crateGeo, crateMat);
  mesh.position.y = 0.55;
  mesh.rotation.y = Math.random() * Math.PI;
  group.add(mesh);
  group.userData.propKind = "crate";
  return group;
}

export function createShack(): THREE.Group {
  const group = new THREE.Group();
  const wallColor = new THREE.Color().setHSL(0.09, 0.25, 0.42 + Math.random() * 0.08);
  const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 1.5;
  group.add(wall);

  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3 + 1.1;
  group.add(roof);

  group.userData.propKind = "shack";
  return group;
}
