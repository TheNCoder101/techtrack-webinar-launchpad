// Character skins are pure data (no new geometry) so they're free to add —
// see .claude/skills/game-skin-designer/SKILL.md for the design method.

/** Simple, checkable unlock gate for progression-locked skins. Thresholds
 *  are checked against the persisted lifetime stats ledger (core/Stats.ts). */
export type SkinUnlockCondition =
  | { type: "totalKills"; threshold: number }
  | { type: "bestScore"; threshold: number };

export interface CharacterSkin {
  id: string;
  name: string;
  bodyColor: number;
  headColor: number;
  packColor?: number;
  helmet: boolean;
  helmetColor?: number;
  /** Absent = always available (all original skins stay free). */
  unlockCondition?: SkinUnlockCondition;
}

/** True when the skin has no unlock gate or the given lifetime stats meet
 *  its threshold. Takes a structural subset of LifetimeStats so this module
 *  stays decoupled from the persistence layer. */
export function isSkinUnlocked(
  skin: CharacterSkin,
  stats: { totalKills: number; bestScore: number }
): boolean {
  const cond = skin.unlockCondition;
  if (!cond) return true;
  switch (cond.type) {
    case "totalKills":
      return stats.totalKills >= cond.threshold;
    case "bestScore":
      return stats.bestScore >= cond.threshold;
  }
}

/** Short human-readable requirement text for locked-skin UI. */
export function describeUnlock(cond: SkinUnlockCondition): string {
  switch (cond.type) {
    case "totalKills":
      return `${cond.threshold} lifetime kills`;
    case "bestScore":
      return `${cond.threshold} score in one life`;
  }
}

export const PLAYER_SKINS: CharacterSkin[] = [
  {
    id: "recon",
    name: "Recon",
    bodyColor: 0x2f6fb0,
    headColor: 0xe0b088,
    packColor: 0x224a33,
    helmet: false,
  },
  {
    id: "inferno",
    name: "Inferno",
    bodyColor: 0x7a1f1f,
    headColor: 0x3a2620,
    packColor: 0x241010,
    helmet: true,
    helmetColor: 0xff6a1f,
  },
  {
    id: "arctic",
    name: "Arctic",
    bodyColor: 0xdfeaf2,
    headColor: 0xcbb89a,
    packColor: 0x3f6e86,
    helmet: true,
    helmetColor: 0x234a63,
  },
  {
    id: "toxic",
    name: "Toxic",
    bodyColor: 0x7fd436,
    headColor: 0x2a3a1f,
    packColor: 0x7a2f9a,
    helmet: true,
    helmetColor: 0x111111,
  },
  // --- Unlockable skins (progression rewards; see unlockCondition) ---
  {
    // "Gilded champion" — a flashy trophy skin earned by racking up kills.
    // Saturated gold body against a dark bronze face for a strong lightness
    // split; bare head keeps a plain-silhouette option among the unlocks.
    id: "goldrush",
    name: "Goldrush",
    bodyColor: 0xf0b429,
    headColor: 0x35261a,
    packColor: 0x1f3a7a,
    helmet: false,
    unlockCondition: { type: "totalKills", threshold: 10 },
  },
  {
    // "Storm-charged night trooper" — dark slate suit under an electric-cyan
    // dome, pale visor face for body/head lightness contrast, yellow pack pop.
    id: "volt",
    name: "Volt",
    bodyColor: 0x2a2f45,
    headColor: 0xd8e6f2,
    packColor: 0xffd51e,
    helmet: true,
    helmetColor: 0x35e0ff,
    unlockCondition: { type: "bestScore", threshold: 50 },
  },
];

export const ENEMY_SKINS: CharacterSkin[] = [
  {
    id: "raider",
    name: "Raider",
    bodyColor: 0xa8493c,
    headColor: 0xb8886a,
    helmet: false,
  },
  {
    id: "shadow",
    name: "Shadow",
    bodyColor: 0x241a33,
    headColor: 0x2a2030,
    helmet: true,
    helmetColor: 0xff2244,
  },
  {
    id: "rustbucket",
    name: "Rustbucket",
    bodyColor: 0x8a5a2f,
    headColor: 0x6a6a6a,
    helmet: true,
    helmetColor: 0x4a4a4a,
  },
];

export function randomEnemySkin(): CharacterSkin {
  return ENEMY_SKINS[Math.floor(Math.random() * ENEMY_SKINS.length)];
}
