// Data-driven weapon roster. Slot 0 (pickaxe) and slot 1 (blaster) are
// always owned; slots 2-5 are empty until filled by an airdrop pickup.

import type { IconId } from "../ui/icons";

export type WeaponId = "pickaxe" | "blaster" | "smg" | "shotgun" | "sniper" | "heavy";

// --- Weapon rarity tiers (V3 Track D1) --------------------------------------
// One rarity axis drives every rarity visual: the held-gun accent trim
// (playerMesh.gunAccentMats), the weapon-bar slot border, the HUD
// weapon-name/ammo readout tint and the airdrop pickup toast. The CSS side
// reads the same colors via the --gj-rarity-* tokens in hud.css — keep the
// two in sync if a color ever changes.
export type WeaponRarity = "common" | "rare" | "epic";

export interface WeaponRarityDef {
  id: WeaponRarity;
  /** Uppercase display label ("RARE") for HUD/toast text. */
  label: string;
  /** Three.js material/particle color for this rarity. */
  color: number;
  /** Same color as a CSS value (mirrors the --gj-rarity-* tokens). */
  cssColor: string;
}

export const WEAPON_RARITIES: Record<WeaponRarity, WeaponRarityDef> = {
  common: { id: "common", label: "COMMON", color: 0x9fb2bf, cssColor: "#9fb2bf" },
  rare: { id: "rare", label: "RARE", color: 0x6fd7ff, cssColor: "#6fd7ff" },
  epic: { id: "epic", label: "EPIC", color: 0xb39bfc, cssColor: "#b39bfc" },
};

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Icon id resolved through ui/icons.ts (V3 Track C3 — was an emoji). */
  icon: IconId;
  isMelee: boolean;
  /** Damage per hit (per pellet for shotgun-style weapons). */
  damage: number;
  /** Shots (or swings) per second while the fire button is held. */
  fireRate: number;
  clipSize: number;
  reserveMax: number;
  reloadTime: number;
  range: number;
  pellets: number;
  /** Half-angle of the random spread cone, in radians. */
  spread: number;
  /** 0 = no splash. Bots within this radius of the hit point take falloff damage. */
  splashRadius: number;
  /** Ammo regenerates over time on its own (only the starter blaster does). */
  reserveRegenPerSec: number;
  /** Only the pickaxe can harvest trees/rocks. */
  canHarvest: boolean;
  /** Per-weapon identity color (tracer/pickup particles). The held-gun
   *  accent trim is NOT this color anymore — since D1 it comes from the
   *  weapon's rarity (see WEAPON_RARITIES above). */
  color: number;
  /** D1 rarity tier. Starters (pickaxe/blaster) are common; airdrop-only
   *  weapons are rare/epic by power (see the assignment notes below). */
  rarity: WeaponRarity;
}

// Rarity assignments, grounded in stats + acquisition:
// - pickaxe/blaster: COMMON — the always-owned starters every match begins
//   with (slots 0/1); no scarcity, modest numbers (12/hit melee; 22 dmg with
//   free ammo regen).
// - smg/shotgun: RARE — airdrop-only sidegrades. The SMG trades damage (10)
//   for the roster's highest fire rate (14/s, ~140 DPS up close); the
//   shotgun is a 6-pellet 90-per-blast burst gated to 22 units of range.
//   Strong situationally, not round-defining.
// - sniper/heavy: EPIC — the two round-defining airdrop pulls. The sniper
//   one-taps most bots (70 dmg, 160 range, near-zero spread); the heavy is
//   the only splash weapon (45 dmg + 4.5-unit AoE) with the scarcest ammo
//   economy (4/16).
export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  pickaxe: {
    id: "pickaxe",
    name: "Pickaxe",
    icon: "pickaxe",
    isMelee: true,
    damage: 12,
    fireRate: 1.8,
    clipSize: 0,
    reserveMax: 0,
    reloadTime: 0,
    range: 3.4,
    pellets: 1,
    spread: 0,
    splashRadius: 0,
    reserveRegenPerSec: 0,
    canHarvest: true,
    color: 0xdddddd,
    rarity: "common",
  },
  blaster: {
    id: "blaster",
    name: "Blaster",
    icon: "blaster",
    isMelee: false,
    damage: 22,
    fireRate: 7,
    clipSize: 30,
    reserveMax: 150,
    reloadTime: 1.35,
    range: 90,
    pellets: 1,
    spread: 0.01,
    splashRadius: 0,
    reserveRegenPerSec: 2,
    canHarvest: false,
    color: 0xfff4c2,
    rarity: "common",
  },
  smg: {
    id: "smg",
    name: "SMG",
    icon: "smg",
    isMelee: false,
    damage: 10,
    fireRate: 14,
    clipSize: 45,
    reserveMax: 220,
    reloadTime: 1.6,
    range: 45,
    pellets: 1,
    spread: 0.035,
    splashRadius: 0,
    reserveRegenPerSec: 0,
    canHarvest: false,
    color: 0x7ee0ff,
    rarity: "rare",
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    icon: "shotgun",
    isMelee: false,
    damage: 15,
    fireRate: 1.3,
    clipSize: 6,
    reserveMax: 36,
    reloadTime: 2.0,
    range: 22,
    pellets: 6,
    spread: 0.16,
    splashRadius: 0,
    reserveRegenPerSec: 0,
    canHarvest: false,
    color: 0xff9d3d,
    rarity: "rare",
  },
  sniper: {
    id: "sniper",
    name: "Sniper",
    icon: "sniper",
    isMelee: false,
    damage: 70,
    fireRate: 0.9,
    clipSize: 5,
    reserveMax: 25,
    reloadTime: 1.8,
    range: 160,
    pellets: 1,
    spread: 0.002,
    splashRadius: 0,
    reserveRegenPerSec: 0,
    canHarvest: false,
    color: 0xc084fc,
    rarity: "epic",
  },
  heavy: {
    id: "heavy",
    name: "Heavy",
    icon: "heavy",
    isMelee: false,
    damage: 45,
    fireRate: 0.8,
    clipSize: 4,
    reserveMax: 16,
    reloadTime: 2.4,
    range: 70,
    pellets: 1,
    spread: 0.02,
    splashRadius: 4.5,
    reserveRegenPerSec: 0,
    canHarvest: false,
    color: 0xff5555,
    rarity: "epic",
  },
};

/** Weapon types obtainable from airdrop crates (pickaxe/blaster are fixed starters). */
export const AIRDROP_WEAPON_POOL: WeaponId[] = ["smg", "shotgun", "sniper", "heavy"];

export const WEAPON_SLOT_COUNT = 6;
export const PICKUP_SLOT_INDICES = [2, 3, 4, 5];
