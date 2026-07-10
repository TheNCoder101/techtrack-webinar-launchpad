---
name: game-skin-designer
description: Design a new low-poly character skin (player or enemy) for the ElroNite mobile game — color palette, optional helmet accessory, and wiring it into skinDefs.ts. Use whenever the user asks for a new player skin, enemy/bot skin variant, or character cosmetic for this game.
---

# Game Skin Designer

Designs cosmetic character variants for ElroNite's third-person characters
(player and bots), which are built from a small, fixed set of primitive
meshes (capsule body, sphere head, optional box pack, optional dome helmet).
A "skin" in this codebase is **pure data** — a `CharacterSkin` object in
`src/game/entities/skinDefs.ts` — never new geometry. This keeps every skin
free (no asset pipeline, no downloads, no extra draw calls beyond the shared
geometries already in the scene) and keeps mesh code (`playerMesh.ts`,
`Bot.ts`) skin-agnostic.

## The `CharacterSkin` shape

```ts
interface CharacterSkin {
  id: string;
  name: string;
  bodyColor: number;   // hex, jumpsuit/torso
  headColor: number;   // hex, skin tone or face plate
  packColor?: number;  // hex, backpack accent (player only)
  helmet: boolean;     // adds a dome cap over the head
  helmetColor?: number;
}
```

Mesh builders (`createPlayerMesh(skin)`, `Bot`'s constructor) read these
fields and apply them to the *existing* shared geometries via per-instance
`MeshLambertMaterial` clones. Never add new geometry per skin — if a skin
concept needs a genuinely new shape (a cape, shoulder pads), that's a
larger feature than "a skin" and should be scoped as its own task.

## Design method

1. **Start from a one-line identity, not a color.** "Arctic recon," "toxic
   waste," "rusted scavenger" — a skin should read as a *character concept*
   at a glance, not just "the blue one." Name it after that concept.

2. **Pick colors for silhouette-at-distance, not swatch-book harmony.**
   These characters are ~40-60px tall on a phone screen much of the time.
   Use saturated, high-contrast body/head/helmet colors — pastel or
   muted-triad palettes disappear against the game's green/blue terrain.
   Concretely: pick the body color first (the biggest surface), then a
   head/helmet color that's clearly *different in lightness* from the body
   (not just a different hue at the same lightness — that reads as noise
   on a small low-poly capsule), then a pack/accent color as a small pop
   of a third hue.

3. **Reserve red/orange-hot palettes for enemy skins where possible.**
   The existing default enemy ("Raider") uses a warm red-orange precisely
   so bots read as threats at a glance. New enemy skins should stay in the
   warm/dark register (reds, rust, dark purple-black with a glowing accent)
   even as they vary — an enemy skin that reads as "friendly blue" would
   undermine at-a-glance threat recognition. Player skins are free to use
   any palette since the player never sees another player-skinned
   character as an opponent in this single-player game.

4. **Use the helmet sparingly as the "silhouette differentiator."** Within
   a set of skins, having every other skin toggle `helmet: true` with a
   distinct `helmetColor` gives players an instant shape-based read
   ("that one has a dome, that one doesn't") that survives even if colors
   are hard to judge in bright/dark lighting. Don't give every skin a
   helmet — plain heads should stay in the mix as a baseline.

5. **Check contrast against the world**, not just against each other: sky
   is `#2f7bd6`→`#bfe4ff` (gradient), grass is roughly `#3a6128`-`#4c7a34`,
   sand `#d9c58a`. A body color too close to mid-green or sky-blue will
   camouflage against the terrain — that's fine for a deliberate "camo"
   skin concept, bad for a skin meant to be easy to spot.

## Wiring a new skin into the game

1. Add the `CharacterSkin` object to `PLAYER_SKINS` or `ENEMY_SKINS` in
   `src/game/entities/skinDefs.ts`.
2. That's it for player skins — `GamePage.tsx`'s skin-select row and
   `Game.ts` already iterate `PLAYER_SKINS` generically.
3. That's it for enemy skins — `BotManager`/`Bot` already pick a random
   entry from `ENEMY_SKINS` on every spawn and respawn.
4. No other file needs to change. If you find yourself editing
   `playerMesh.ts` or `Bot.ts` to add a skin, stop — that means the skin
   concept needs new geometry and is a bigger feature than this skill
   covers; scope it separately (e.g. "add a cape accessory type" as its
   own small feature, then skins can opt into it).

## Quick self-check before finalizing a skin

- Does the one-line identity survive being reduced to three hex colors?
- Is there a clear body/head lightness contrast (not just hue difference)?
- If it's an enemy skin, does it still read as "threat" at a glance?
- Does the body color avoid blending into grass/sky/sand unless that's the
  deliberate concept (camo)?
