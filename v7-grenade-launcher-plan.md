# V7 — Grenade Launcher (arcing projectile weapon)

## Goal
A launcher whose shots **arc under gravity** instead of hitscanning, so the
player controls blast distance purely by aiming up or down, and the explosion
does area damage that can kill several bots at once.

## Audit — what already exists (verified, not assumed)

- **Every current weapon is hitscan.** `WeaponSystem.shoot` raycasts and
  resolves the hit in the same frame. Nothing in the game travels over time,
  so the projectile itself is genuinely new work.
- **Area damage already exists and is reusable.** `WeaponSystem.applySplash(
  def, center, primaryRefId, botManager, particles, audio)` walks every live
  bot, applies distance-falloff damage inside `def.splashRadius`, and bursts
  particles. The `heavy` weapon proves it (`splashRadius: 4.5`). The grenade
  explosion should **call this same method**, passing `primaryRefId = -1`
  (there's no direct-hit bot to exclude) — no second damage system.
- **A per-frame hook is already in place.** `WeaponSystem.update(dt, ...)`
  already calls `this.updateTracers(dt)`; projectiles get an exactly
  symmetric `this.updateProjectiles(dt, ...)` right beside it.
- **The launch vector is free.** `Player.aimDir` is already a pitch-aware 3D
  unit vector (`sin(yaw)cos(pitch)`, `sin(pitch)`, `cos(yaw)cos(pitch)`), and
  `GRAVITY = 24` already exists in `constants.ts`.
- **Pitch clamp is −66°…+60°**, which is a wide enough band for the aim-to-
  range mechanic to feel real.

### Range envelope (computed, drives the tuning choice)
Ballistic range from a ~1.5 m muzzle at `g = 24`:

| aim | 30 m/s | **38 m/s** | 46 m/s |
|---|---|---|---|
| −30° | 2.4 m | **2.5 m** | 2.5 m |
| 0° | 10.6 m | **13.4 m** | 16.3 m |
| 20° | 27.7 m | **42.4 m** | 60.5 m |
| 45° | 38.9 m | **61.6 m** | 89.6 m |
| 60° | 33.3 m | **53.0 m** | 77.2 m |

**Ship 38 m/s.** 30 tops out at ~39 m (doesn't read as a launcher); 46 reaches
~90 m, most of the playable island, which trivialises positioning. 38 gives a
**~2.5 m → ~62 m** span controlled entirely by aim — precisely the requested
"long range and short range," with no charge-up mechanic needed.

---

## Design

### W1 — `WeaponDef` gains an optional projectile block
Add `projectile?: { speed: number; gravity: number; fuseSeconds: number;
radius: number }`. **Optional**, so all six existing weapons are untouched and
`shoot()` keeps its current path when it's absent. Presence of this field is
what routes a weapon down the projectile path instead of the hitscan path.

### W2 — New weapon `grenade`
- `id: "grenade"`, name "Grenade Launcher", `rarity: "epic"`.
- Low `fireRate` (~0.7/s), small clip (~3), meaningful `reloadTime` (~2.6 s)
  — this is a burst-damage tool, not a spam weapon.
- `splashRadius` **larger than heavy's 4.5** (≈6.5) so it reads as the
  dedicated area weapon, with `damage` tuned so a direct-ish hit kills a bot
  and the falloff edge wounds rather than kills.
- Add to `AIRDROP_WEAPON_POOL` so it's obtainable (currently `["smg",
  "shotgun", "sniper", "heavy"]`). Note `PICKUP_SLOT_INDICES` is `[2,3,4,5]`
  — pool size and slot count are independent, so no slot changes needed.

### W3 — Projectile simulation (the new part)
A small `Projectile` record: mesh, `velocity`, `spawnedAt`, owning def.
- Spawn at the player's gun tip along `player.aimDir * speed`.
- Per frame: `velocity.y -= gravity * dt`, integrate position, and check for
  detonation in this order — **ground** (`world.getHeightAt(x,z)`), **bot
  proximity** (`radius + bot body radius`), **world colliders** (trees/rocks/
  shacks/placed walls all live in `world.colliders`), then **fuse expiry** as
  a guaranteed backstop so a grenade can never live forever.
- Use a **sub-stepped** integration (a few small steps per frame, capped) so a
  fast grenade can't tunnel through the ground or a thin collider on a long
  frame — the game already runs at a clamped `dt`, but at 38 m/s a 50 ms frame
  is ~1.9 m of travel, which is comparable to collider radii.
- Detonate → `applySplash(...)` + a scaled-up particle burst + explosion audio.

### W4 — Presentation (must match already-shipped systems)
- **Icon:** add one glyph to `src/game/ui/icons.ts` in the established
  24×24 / 2px-round-stroke / `currentColor` language. **No emoji.**
- **Held silhouette:** add a `GUN_SPECS` entry in `playerMesh.ts` (V3 Track B2
  gave every gun its own shape) — a fat, stubby launcher with a wide muzzle,
  visually distinct from the existing five, with its rarity accent trim.
- **Grenade mesh:** a small dark sphere, reusing shared geometry/material in
  the codebase's existing style; disposed on detonation.
- **Audio:** a launcher *thump* on fire and a deeper *boom* on detonation via
  the existing procedural `AudioManager` — do not add asset files (the project
  is deliberately zero-asset).

### W5 — Co-op correctness (must not be skipped)
Bots are **host-authoritative**. On a joiner, `botManager.damage()` does not
apply locally — it forwards a `bot_hit` to the host (V5). Since `applySplash`
calls `botManager.damage()` per bot in radius, **one joiner grenade emits
several `bot_hit` messages**, which is correct but must be verified to
actually land (each is already sent `redundant: true` with receive-side
dedupe). Explicitly test a joiner-fired grenade killing multiple bots.

**Out of scope, flag as follow-up:** rendering another player's grenade in
flight. The V5 `shots` counter will fire the existing remote-fire effect, so
co-op peers get *a* tell, just not an arcing projectile. Say so plainly
rather than implying full parity.

---

## Verification
- `npx tsc --noEmit && npm run build` clean.
- **Range envelope measured, not eyeballed:** fire at several pitches via the
  DEV `__elronite` hook and assert landing distance grows monotonically with
  aim angle up to ~45°, landing within a sane tolerance of the table above.
- **Multi-kill proven:** cluster ≥3 bots, land one grenade, assert **all**
  take damage and ≥2 die from a single shot — the headline requirement.
- **No tunnelling:** fire at a wall/tree at point-blank and at max range;
  assert it always detonates (never passes through, never lives past the fuse).
- **Co-op:** joiner-fired grenade kills multiple bots, confirmed on **both**
  peers' bot HP.
- **Regression:** the other five weapons still hitscan normally (especially
  `heavy`, which shares `applySplash`), and solo play is unaffected.
- Zero console errors.
