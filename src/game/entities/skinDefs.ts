// Character skins are pure data (no new geometry) so they're free to add —
// see .claude/skills/game-skin-designer/SKILL.md for the design method.

export interface CharacterSkin {
  id: string;
  name: string;
  bodyColor: number;
  headColor: number;
  packColor?: number;
  helmet: boolean;
  helmetColor?: number;
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
