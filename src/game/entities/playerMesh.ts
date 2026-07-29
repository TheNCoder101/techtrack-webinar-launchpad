import * as THREE from "three";
import type { CharacterSkin } from "./skinDefs";
import { buildHumanoid, type HumanoidBuild } from "./humanoid";
import { WEAPON_DEFS, type WeaponId } from "../weapons/weaponDefs";

const packGeo = new THREE.BoxGeometry(0.46, 0.5, 0.24);
const pickHandleGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.75, 6);
const pickHeadGeo = new THREE.BoxGeometry(0.09, 0.09, 0.5);

// --- Per-weapon held-gun silhouettes (V3 Track B2) --------------------------
// Every non-melee weapon used to share one generic body+grip gun; now each of
// the 5 guns gets its own recognizable held shape (SMG short & boxy, shotgun
// wide-barreled, sniper long-barreled + scope, heavy bulky launcher) plus an
// accent trim in the weapon's existing WeaponDef.color (the same color its
// tracers already use), so a glance at the character's hands identifies the
// equipped weapon without reading the HUD. All shapes are composed from TWO
// shared unit geometries (a 1x1x1 box and a unit 8-gon cylinder) scaled
// per-part — no bespoke geometry per gun, and the whole gun set is a handful
// of tiny Lambert meshes with visibility toggled per weapon switch, exactly
// like the existing pickaxe/gun toggle.
const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const unitCylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);

/** The five hand-held gun ids (every weapon except the melee pickaxe). */
export type GunWeaponId = Exclude<WeaponId, "pickaxe">;
export const GUN_WEAPON_IDS: GunWeaponId[] = ["blaster", "smg", "shotgun", "sniper", "heavy"];

interface GunPartSpec {
  /** box = scaled unit box; barrel = unit cylinder laid along Z; grip = unit cylinder upright. */
  kind: "box" | "barrel" | "grip";
  /** box: [w, h, d]. barrel/grip: [radius, length]. */
  size: [number, number, number] | [number, number];
  pos: [number, number, number];
  /** Rendered in the weapon's accent color (emissive trim) instead of gunmetal. */
  accent?: boolean;
}

interface GunSpec {
  parts: GunPartSpec[];
  /** How far in front of the hand anchor the muzzle sits (drives gunTip). */
  tipOffset: number;
}

const GUN_SPECS: Record<GunWeaponId, GunSpec> = {
  // Starter blaster: the original compact body, now with an accent top rail
  // and muzzle ring so it reads as designed rather than placeholder.
  blaster: {
    tipOffset: 0.58,
    parts: [
      { kind: "box", size: [0.14, 0.16, 0.7], pos: [0, 0, -0.2] },
      { kind: "grip", size: [0.05, 0.28], pos: [0, -0.16, 0.05] },
      { kind: "box", size: [0.05, 0.03, 0.44], pos: [0, 0.095, -0.24], accent: true },
      { kind: "barrel", size: [0.05, 0.07], pos: [0, 0.02, -0.57], accent: true },
    ],
  },
  // SMG: short & boxy — stub body, fat magazine, stubby barrel.
  smg: {
    tipOffset: 0.5,
    parts: [
      { kind: "box", size: [0.13, 0.15, 0.42], pos: [0, 0, -0.1] },
      { kind: "barrel", size: [0.035, 0.18], pos: [0, 0.02, -0.4] },
      { kind: "grip", size: [0.05, 0.26], pos: [0, -0.15, 0.03] },
      { kind: "box", size: [0.07, 0.24, 0.09], pos: [0, -0.17, -0.17] },
      { kind: "box", size: [0.15, 0.04, 0.28], pos: [0, 0.05, -0.1], accent: true },
      { kind: "barrel", size: [0.048, 0.05], pos: [0, 0.02, -0.47], accent: true },
    ],
  },
  // Shotgun: wide over-barrel + pump forend under it.
  shotgun: {
    tipOffset: 0.78,
    parts: [
      { kind: "box", size: [0.13, 0.14, 0.5], pos: [0, -0.02, -0.05] },
      { kind: "barrel", size: [0.055, 0.6], pos: [0, 0.055, -0.42] },
      { kind: "box", size: [0.09, 0.09, 0.22], pos: [0, -0.055, -0.44] },
      { kind: "grip", size: [0.05, 0.26], pos: [0, -0.17, 0.1] },
      { kind: "barrel", size: [0.064, 0.07], pos: [0, 0.055, -0.28], accent: true },
      { kind: "barrel", size: [0.064, 0.06], pos: [0, 0.055, -0.68], accent: true },
    ],
  },
  // Sniper: long thin barrel + scope tube on top.
  sniper: {
    tipOffset: 1.12,
    parts: [
      { kind: "box", size: [0.11, 0.14, 0.52], pos: [0, 0, -0.08] },
      { kind: "barrel", size: [0.032, 0.85], pos: [0, 0.03, -0.68] },
      { kind: "barrel", size: [0.045, 0.3], pos: [0, 0.14, -0.12] },
      { kind: "grip", size: [0.05, 0.26], pos: [0, -0.16, 0.08] },
      { kind: "box", size: [0.06, 0.06, 0.09], pos: [0, 0.03, -1.07], accent: true },
      { kind: "barrel", size: [0.052, 0.05], pos: [0, 0.14, -0.24], accent: true },
    ],
  },
  // Heavy: bulky launcher — oversized body and a wide muzzle.
  heavy: {
    tipOffset: 0.72,
    parts: [
      { kind: "box", size: [0.2, 0.21, 0.55], pos: [0, 0.02, -0.15] },
      { kind: "barrel", size: [0.09, 0.26], pos: [0, 0.02, -0.5] },
      { kind: "grip", size: [0.055, 0.26], pos: [0, -0.16, 0.05] },
      { kind: "box", size: [0.05, 0.06, 0.28], pos: [0, 0.17, -0.12] },
      { kind: "barrel", size: [0.1, 0.06], pos: [0, 0.02, -0.64], accent: true },
      { kind: "box", size: [0.21, 0.05, 0.12], pos: [0, 0.02, 0.08], accent: true },
    ],
  },
};

const gunBodyMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
// One accent material per weapon, tinted + slightly emissive in the weapon's
// existing WeaponDef.color so the trim stays readable even in shade. Shared
// module-level (guns never tint per-instance, unlike character skins).
const gunAccentMats: Record<GunWeaponId, THREE.MeshLambertMaterial> = Object.fromEntries(
  GUN_WEAPON_IDS.map((id) => [
    id,
    new THREE.MeshLambertMaterial({
      color: WEAPON_DEFS[id].color,
      emissive: WEAPON_DEFS[id].color,
      emissiveIntensity: 0.3,
    }),
  ])
) as Record<GunWeaponId, THREE.MeshLambertMaterial>;

function buildGunVariant(id: GunWeaponId): THREE.Group {
  const spec = GUN_SPECS[id];
  const gun = new THREE.Group();
  for (const part of spec.parts) {
    const mat = part.accent ? gunAccentMats[id] : gunBodyMat;
    let mesh: THREE.Mesh;
    if (part.kind === "box") {
      const [w, h, d] = part.size as [number, number, number];
      mesh = new THREE.Mesh(unitBoxGeo, mat);
      mesh.scale.set(w, h, d);
    } else {
      const [radius, length] = part.size as [number, number];
      mesh = new THREE.Mesh(unitCylGeo, mat);
      mesh.scale.set(radius, length, radius);
      if (part.kind === "barrel") mesh.rotation.x = Math.PI / 2;
    }
    mesh.position.set(...part.pos);
    mesh.castShadow = true;
    gun.add(mesh);
  }
  return gun;
}

export interface PlayerMeshParts {
  group: THREE.Group;
  gunTip: THREE.Object3D;
  gunGroup: THREE.Group;
  pickaxeGroup: THREE.Group;
  /** One child group per gun weapon; exactly one is visible at a time. */
  gunVariants: Record<GunWeaponId, THREE.Group>;
  /** Muzzle distance in front of the hand anchor, per gun (drives gunTip). */
  gunTipOffsets: Record<GunWeaponId, number>;
  /** Shared humanoid rig, exposed so the player can drive walk-cycle/lean animation. */
  humanoid: HumanoidBuild;
}

export function createPlayerMesh(skin: CharacterSkin): PlayerMeshParts {
  const humanoid = buildHumanoid(skin);
  const { group, rightHandAnchor } = humanoid;

  const packMat = new THREE.MeshLambertMaterial({ color: skin.packColor ?? 0x224a33 });
  const pack = new THREE.Mesh(packGeo, packMat);
  pack.position.set(0, 1.35, 0.3);
  group.add(pack);

  // Parent gun group at the hand anchor — updateWeaponPose rotates this, so
  // the raise/aim animation applies to whichever gun variant is visible.
  const gunGroup = new THREE.Group();
  gunGroup.position.copy(rightHandAnchor);
  const gunVariants = {} as Record<GunWeaponId, THREE.Group>;
  const gunTipOffsets = {} as Record<GunWeaponId, number>;
  for (const id of GUN_WEAPON_IDS) {
    const variant = buildGunVariant(id);
    variant.visible = id === "blaster"; // matches the starting active slot
    gunGroup.add(variant);
    gunVariants[id] = variant;
    gunTipOffsets[id] = GUN_SPECS[id].tipOffset;
  }
  group.add(gunGroup);

  const pickaxeGroup = new THREE.Group();
  pickaxeGroup.position.copy(rightHandAnchor);
  pickaxeGroup.rotation.x = -0.9;
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
  gunTip.position.z -= gunTipOffsets.blaster;
  group.add(gunTip);

  // Inert unless a quality tier enables shadow mapping (see humanoid.ts).
  for (const mesh of [pack, pickHandle, pickHead]) {
    mesh.castShadow = true;
  }

  return { group, gunTip, gunGroup, pickaxeGroup, gunVariants, gunTipOffsets, humanoid };
}
