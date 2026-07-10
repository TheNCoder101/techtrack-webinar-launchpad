import * as THREE from "three";
import type { CharacterSkin } from "./skinDefs";

// Shared low-poly humanoid rig (head, torso, two arms, two legs) used by
// both the player and bots so every skin in skinDefs.ts reads as an actual
// person rather than a capsule blob. Kept static (no walk-cycle animation)
// and built entirely from shared geometries — only materials are cloned
// per instance so each character can flash on hit / carry its own skin.

const torsoGeo = new THREE.BoxGeometry(0.44, 0.62, 0.26);
const headGeo = new THREE.SphereGeometry(0.28, 10, 8);
const helmetGeo = new THREE.SphereGeometry(0.32, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.65);
const armGeo = new THREE.CylinderGeometry(0.08, 0.075, 0.62, 6);
const legGeo = new THREE.CylinderGeometry(0.11, 0.1, 0.95, 6);

const TORSO_Y = 1.3;
const TORSO_HALF_HEIGHT = 0.31;
const SHOULDER_Y = TORSO_Y + TORSO_HALF_HEIGHT;
const HIP_Y = TORSO_Y - TORSO_HALF_HEIGHT;
const ARM_Y = SHOULDER_Y - 0.31;
const LEG_Y = HIP_Y - 0.475;
const HEAD_Y = SHOULDER_Y + 0.28;
const ARM_X = 0.3;
const LEG_X = 0.13;

export interface HumanoidBuild {
  group: THREE.Group;
  bodyMat: THREE.MeshLambertMaterial;
  headMat: THREE.MeshLambertMaterial;
  helmetMat: THREE.MeshLambertMaterial;
  helmetMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  /** Every mesh that should register hits (excludes the helmet, which is cosmetic). */
  hittableMeshes: THREE.Mesh[];
  /** Roughly where a held item (gun/pickaxe) should sit, near the right hand. */
  rightHandAnchor: THREE.Vector3;
}

export function buildHumanoid(skin: CharacterSkin): HumanoidBuild {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: skin.bodyColor });
  const headMat = new THREE.MeshLambertMaterial({ color: skin.headColor });
  const helmetMat = new THREE.MeshLambertMaterial({ color: skin.helmetColor ?? 0x222222 });

  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.position.y = TORSO_Y;
  group.add(torso);

  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.position.y = HEAD_Y;
  group.add(headMesh);

  const helmetMesh = new THREE.Mesh(helmetGeo, helmetMat);
  helmetMesh.position.y = HEAD_Y;
  helmetMesh.visible = skin.helmet;
  group.add(helmetMesh);

  const leftArm = new THREE.Mesh(armGeo, bodyMat);
  leftArm.position.set(-ARM_X, ARM_Y, 0);
  leftArm.rotation.z = 0.1;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, bodyMat);
  rightArm.position.set(ARM_X, ARM_Y, 0);
  rightArm.rotation.z = -0.1;
  group.add(rightArm);

  const leftLeg = new THREE.Mesh(legGeo, bodyMat);
  leftLeg.position.set(-LEG_X, LEG_Y, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, bodyMat);
  rightLeg.position.set(LEG_X, LEG_Y, 0);
  group.add(rightLeg);

  return {
    group,
    bodyMat,
    headMat,
    helmetMat,
    helmetMesh,
    headMesh,
    hittableMeshes: [torso, headMesh, leftArm, rightArm, leftLeg, rightLeg],
    rightHandAnchor: new THREE.Vector3(ARM_X + 0.04, ARM_Y - 0.31, -0.15),
  };
}

export function applyHumanoidSkin(build: HumanoidBuild, skin: CharacterSkin): void {
  build.bodyMat.color.set(skin.bodyColor);
  build.headMat.color.set(skin.headColor);
  build.helmetMesh.visible = skin.helmet;
  if (skin.helmet) {
    build.helmetMat.color.set(skin.helmetColor ?? 0x222222);
  }
}
