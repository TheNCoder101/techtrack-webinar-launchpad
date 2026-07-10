import * as THREE from "three";
import type { CharacterSkin } from "./skinDefs";
import { buildHumanoid } from "./humanoid";

const packGeo = new THREE.BoxGeometry(0.46, 0.5, 0.24);
const gunBodyGeo = new THREE.BoxGeometry(0.14, 0.16, 0.7);
const gunGripGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.28, 6);
const pickHandleGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.75, 6);
const pickHeadGeo = new THREE.BoxGeometry(0.09, 0.09, 0.5);

export interface PlayerMeshParts {
  group: THREE.Group;
  gunTip: THREE.Object3D;
  gunGroup: THREE.Group;
  pickaxeGroup: THREE.Group;
}

export function createPlayerMesh(skin: CharacterSkin): PlayerMeshParts {
  const { group, rightHandAnchor } = buildHumanoid(skin);

  const packMat = new THREE.MeshLambertMaterial({ color: skin.packColor ?? 0x224a33 });
  const pack = new THREE.Mesh(packGeo, packMat);
  pack.position.set(0, 1.35, 0.3);
  group.add(pack);

  const gunGroup = new THREE.Group();
  gunGroup.position.copy(rightHandAnchor);
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
  const gunBody = new THREE.Mesh(gunBodyGeo, gunMat);
  gunBody.position.z = -0.2;
  gunGroup.add(gunBody);
  const gunGrip = new THREE.Mesh(gunGripGeo, gunMat);
  gunGrip.position.set(0, -0.16, 0.05);
  gunGroup.add(gunGrip);
  group.add(gunGroup);

  const pickaxeGroup = new THREE.Group();
  pickaxeGroup.position.copy(rightHandAnchor);
  pickaxeGroup.rotation.x = -0.5;
  pickaxeGroup.visible = false;
  const pickMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const pickHandle = new THREE.Mesh(pickHandleGeo, pickMat);
  pickaxeGroup.add(pickHandle);
  const pickHeadMat = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });
  const pickHead = new THREE.Mesh(pickHeadGeo, pickHeadMat);
  pickHead.position.y = 0.4;
  pickaxeGroup.add(pickHead);
  group.add(pickaxeGroup);

  const gunTip = new THREE.Object3D();
  gunTip.position.copy(rightHandAnchor);
  gunTip.position.z -= 0.55;
  group.add(gunTip);

  return { group, gunTip, gunGroup, pickaxeGroup };
}
