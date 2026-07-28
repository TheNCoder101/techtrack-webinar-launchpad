import * as THREE from "three";
import type { CharacterSkin } from "./skinDefs";

// Shared low-poly humanoid rig (head, torso, two arms, two legs) used by
// both the player and bots so every skin in skinDefs.ts reads as an actual
// person rather than a capsule blob. Built entirely from shared geometries —
// only materials are cloned per instance so each character can flash on hit
// / carry its own skin. Arms and legs are hinged: each limb mesh lives
// inside a small pivot Group parked at the shoulder/hip joint, with the
// mesh itself offset locally within that group, so animating the pivot's
// rotation swings the limb like a real joint instead of spinning it around
// its own geometric mid-point. See animateHumanoidLocomotion() below for
// the walk-cycle driver.

const ARM_LENGTH = 0.62;
const LEG_LENGTH = 0.95;
const ARM_HALF_LENGTH = ARM_LENGTH / 2;
const LEG_HALF_LENGTH = LEG_LENGTH / 2;

const torsoGeo = new THREE.BoxGeometry(0.44, 0.62, 0.26);
const headGeo = new THREE.SphereGeometry(0.28, 10, 8);
const helmetGeo = new THREE.SphereGeometry(0.32, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.65);
const armGeo = new THREE.CylinderGeometry(0.08, 0.075, ARM_LENGTH, 6);
const legGeo = new THREE.CylinderGeometry(0.11, 0.1, LEG_LENGTH, 6);

// --- Fresnel rim light (V3 Track A3) ---------------------------------------
// Character materials get a cheap view-dependent rim term patched into the
// stock Lambert shader via onBeforeCompile, so silhouettes pop against the
// terrain instead of reading as flat cutouts. Deliberately NOT a material
// type change: everything stays MeshLambertMaterial, so the shadow pipeline,
// the hit-flash white color.set() mechanic (Bot.takeDamage — a uniform
// update, never a recompile), and the per-skin color system are untouched.
// The rim is purely additive on outgoingLight, computed from the view-space
// normal and vViewPosition the Lambert shader already has — a few ALU ops on
// the small fraction of screen pixels characters cover.
const RIM_COLOR = new THREE.Color(0x9fc4ff); // cool sky tint
const RIM_STRENGTH = 0.4;
const RIM_POWER = 3.0;

const RIM_FRAGMENT_PATCH = /* glsl */ `
  float rimNdV = clamp(dot(normalize(vViewPosition), normalize(normal)), 0.0, 1.0);
  outgoingLight += uRimColor * (pow(1.0 - rimNdV, ${RIM_POWER.toFixed(1)}) * uRimStrength);
  #include <opaque_fragment>`;

function applyCharacterRim(mat: THREE.MeshLambertMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: RIM_COLOR };
    shader.uniforms.uRimStrength = { value: RIM_STRENGTH };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        "uniform vec3 uRimColor;\nuniform float uRimStrength;\nvoid main() {"
      )
      .replace("#include <opaque_fragment>", RIM_FRAGMENT_PATCH);
  };
  // All rim-patched Lambert materials share one program (they differ only in
  // uniforms); the key also keeps them from ever aliasing the stock Lambert
  // program used by props/terrain.
  mat.customProgramCacheKey = () => "lambert-char-rim";
}

const TORSO_Y = 1.3;
const TORSO_HALF_HEIGHT = 0.31;
const SHOULDER_Y = TORSO_Y + TORSO_HALF_HEIGHT;
const HIP_Y = TORSO_Y - TORSO_HALF_HEIGHT;
const ARM_Y = SHOULDER_Y - ARM_HALF_LENGTH;
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
  /** Torso mesh, exposed so callers can apply a subtle aim-lean tilt. */
  torsoMesh: THREE.Mesh;
  /** Shoulder/hip pivot groups — rotate these (rotation.x) to swing a limb. */
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
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
  // Rim-light every character surface (player, bots, and remote-player
  // puppets all build through here). See applyCharacterRim above.
  applyCharacterRim(bodyMat);
  applyCharacterRim(headMat);
  applyCharacterRim(helmetMat);

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

  // Each limb pivot sits exactly at the joint (shoulder/hip); the mesh is
  // offset downward by half its own length *inside* the pivot so, at rest
  // (pivot rotation = 0), the limb lands at precisely the same world
  // position/orientation it had before this pivot was introduced.
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-ARM_X, SHOULDER_Y, 0);
  const leftArm = new THREE.Mesh(armGeo, bodyMat);
  leftArm.position.y = -ARM_HALF_LENGTH;
  leftArm.rotation.z = 0.1;
  leftArmPivot.add(leftArm);
  group.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(ARM_X, SHOULDER_Y, 0);
  const rightArm = new THREE.Mesh(armGeo, bodyMat);
  rightArm.position.y = -ARM_HALF_LENGTH;
  rightArm.rotation.z = -0.1;
  rightArmPivot.add(rightArm);
  group.add(rightArmPivot);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-LEG_X, HIP_Y, 0);
  const leftLeg = new THREE.Mesh(legGeo, bodyMat);
  leftLeg.position.y = -LEG_HALF_LENGTH;
  leftLegPivot.add(leftLeg);
  group.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(LEG_X, HIP_Y, 0);
  const rightLeg = new THREE.Mesh(legGeo, bodyMat);
  rightLeg.position.y = -LEG_HALF_LENGTH;
  rightLegPivot.add(rightLeg);
  group.add(rightLegPivot);

  // Characters cast into the player-following sun shadow map when a quality
  // tier enables shadow mapping; a no-op flag otherwise (the shipped default —
  // every tier currently leaves renderer.shadowMap.enabled false).
  for (const mesh of [torso, headMesh, helmetMesh, leftArm, rightArm, leftLeg, rightLeg]) {
    mesh.castShadow = true;
  }

  return {
    group,
    bodyMat,
    headMat,
    helmetMat,
    helmetMesh,
    headMesh,
    torsoMesh: torso,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
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

// --- Walk-cycle animation -------------------------------------------------
// Standard opposite-arm/opposite-leg gait: left arm and right leg swing
// forward together, then right arm and left leg. `speedT` is a 0-1 fraction
// of max movement speed (0 = standing still, 1 = full sprint) and `phase`
// is a caller-owned accumulator (radians) that should advance faster at
// higher speed. Follows the same lerp-toward-target idiom used elsewhere
// for procedural animation (see Player.updateWeaponPose).

const ARM_SWING_AMPLITUDE = 0.85; // max shoulder swing at full speed, radians
const LEG_SWING_AMPLITUDE = 0.7; // max hip swing at full speed, radians
const LOCOMOTION_LERP_RATE = 10; // higher = snappier response to speed changes

export function animateHumanoidLocomotion(
  build: HumanoidBuild,
  speedT: number,
  phase: number,
  dt: number
): void {
  const s = Math.sin(phase);
  const armTarget = ARM_SWING_AMPLITUDE * speedT * s;
  const legTarget = LEG_SWING_AMPLITUDE * speedT * s;
  const lerpT = Math.min(1, dt * LOCOMOTION_LERP_RATE);

  // At speedT -> 0 the targets naturally go to 0 too, and the lerp eases
  // the limbs back to the neutral standing pose rather than snapping or
  // freezing mid-swing.
  build.leftArmPivot.rotation.x = THREE.MathUtils.lerp(build.leftArmPivot.rotation.x, armTarget, lerpT);
  build.rightArmPivot.rotation.x = THREE.MathUtils.lerp(build.rightArmPivot.rotation.x, -armTarget, lerpT);
  build.leftLegPivot.rotation.x = THREE.MathUtils.lerp(build.leftLegPivot.rotation.x, -legTarget, lerpT);
  build.rightLegPivot.rotation.x = THREE.MathUtils.lerp(build.rightLegPivot.rotation.x, legTarget, lerpT);
}
