// Data-driven weapon roster. Slot 0 (pickaxe) and slot 1 (blaster) are
// always owned; slots 2-5 are empty until filled by an airdrop pickup.

export type WeaponId = "pickaxe" | "blaster" | "smg" | "shotgun" | "sniper" | "heavy";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  icon: string;
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
  color: number;
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  pickaxe: {
    id: "pickaxe",
    name: "Pickaxe",
    icon: "⛏️",
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
  },
  blaster: {
    id: "blaster",
    name: "Blaster",
    icon: "🔫",
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
  },
  smg: {
    id: "smg",
    name: "SMG",
    icon: "💥",
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
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    icon: "💢",
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
  },
  sniper: {
    id: "sniper",
    name: "Sniper",
    icon: "🎯",
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
  },
  heavy: {
    id: "heavy",
    name: "Heavy",
    icon: "☄️",
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
  },
};

/** Weapon types obtainable from airdrop crates (pickaxe/blaster are fixed starters). */
export const AIRDROP_WEAPON_POOL: WeaponId[] = ["smg", "shotgun", "sniper", "heavy"];

export const WEAPON_SLOT_COUNT = 6;
export const PICKUP_SLOT_INDICES = [2, 3, 4, 5];
