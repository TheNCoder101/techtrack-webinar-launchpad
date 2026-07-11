# ElroNite V2 Backlog

Ralph-loop backlog, derived from `/root/.claude/plans/modular-waddling-anchor.md`.
Each item is implemented by a fresh-context worktree agent, gated by
`npx tsc --noEmit && npm run build` clean + a Playwright check before commit.
Phase 9 (multiplayer) is intentionally excluded — requires a separate product
decision before any backlog item is written for it.

Convention: `- [ ]` open, `- [x]` done, `- [ ] (blocked: reason)` needs human input.
Drop a file named `.ralph-stop` in the repo root to halt the loop before the next item.

## Phase 1 — Settings & Perf Foundation ✅ done (f1541bc)
- [x] Create `src/game/core/Settings.ts`: data-driven quality tiers (low/medium/high) with pixelRatio cap, particle pool size, terrain segment count, prop draw distance, shadows on/off, postFX on/off — mirroring the `Record<Id, Def>` pattern in `weaponDefs.ts`. (particle/terrain/prop fields are modeled but not yet consumed anywhere — that's Phase 3's job.)
- [x] Wire `Settings` into `Game`'s constructor (replace hardcoded `renderer.setPixelRatio`/`shadowMap.enabled` etc. with tier-driven values).
- [x] Add a Settings UI panel on the start screen in `GamePage.tsx`, reusing the existing skin-swatch-grid layout pattern: look sensitivity (overrides `LOOK_SENSITIVITY`), quality tier picker, SFX volume slider wired to `AudioManager`'s master gain.
- [x] Persist settings to `localStorage` under a new key (e.g. `elronite-settings`), alongside the existing `elronite-skin` key; load on boot with medium-tier default.
- [x] Auto-detect: measure actual frame time for ~1s after first frames render and only auto-adjust away from the medium default if frame time indicates a struggling device (do not hardcode "mobile = low").

## Phase 2 — Character Locomotion Animation ✅ done (cae1618)
- [x] Restructure `humanoid.ts`: wrap each limb mesh in a pivot `Group` positioned at the shoulder/hip, with the mesh offset locally within it (required before any rotation-based swing looks like a hinge).
- [x] Add `animateHumanoidLocomotion(build, speedT, phase, dt)` in `humanoid.ts` driving limb pivot rotation via a phase accumulator, following the lerp/sine-arc pattern already proven in `Player.updateWeaponPose`.
- [x] Call `animateHumanoidLocomotion` from `Player.update` using `this.velocity` magnitude.
- [x] Call `animateHumanoidLocomotion` from `Bot.update` using its current move speed.
- [x] Add landing squash (`group.scale.y` micro-lerp on the `grounded` transition) and aim-lean (torso tilt toward `pitch`) — zero new draw calls. (Player only, as scoped — bots have no pitch/grounded-transition signal to hook these to.)
- [x] Visual QA pass across all 4 player skins + wandering bot — confirmed via Playwright, no silhouette regression at idle.
- [ ] Visual QA pass: Playwright screenshots of all 4 player skins + 3 enemy skins mid-walk-cycle to confirm the pivot restructure didn't break any skin's proportions.

## Phase 3 — Instancing & LOD for Props
- [ ] Replace per-object `THREE.Group` placement in `World`'s scatter functions with `THREE.InstancedMesh` per geometry in `props.ts` (trees, rocks, crates, shacks).
- [ ] Rework harvest state to instance-matrix writes: destroyed → zero-scale matrix, damaged → per-instance scale, replacing `World.harvest`'s current group-level scale.
- [ ] Update raycasting to resolve `instanceId` on hit; make `HitUserData.refId` an instance-indexed lookup, keeping `WeaponSystem.resolveHit`'s dispatch contract unchanged.
- [ ] Update `BuildingManager`'s `world.raycastTargets.push(mesh)` pattern to stay correct under the new instancing (walls are not instanced, but must coexist in the same raycast target list).
- [ ] Cache `[...world.raycastTargets, ...botManager.raycastTargets]` in `WeaponSystem.shoot`/`swing` instead of rebuilding every shot; invalidate only on prop/wall add-remove.
- [ ] Raise `TREE_COUNT`/`ROCK_COUNT` for a denser island, gated by the Phase 1 quality tier (higher tiers get more props).

## Phase 4 — Real Shadows + Minimal Post-Processing (ships OFF by default, tier-gated)
- [ ] Enable `renderer.shadowMap` (PCFSoftShadowMap) and `castShadow` on the sun light, with a tight ~30-unit shadow camera box re-centered on the player each frame; `mapSize` capped at 1024 default, 2048 only on "high" tier.
- [ ] Keep `blobShadow.ts` fake-AO blobs for anything outside the near shadow frustum (hybrid near-real/far-fake).
- [ ] Add `EffectComposer` post-processing (three.js bundled `examples/jsm/postprocessing`), replacing the direct `renderer.render()` call in `Game.ts`'s loop; add `SMAAPass` to compensate for losing native MSAA.
- [ ] Add a narrow selective bloom pass applied only to muzzle flash/tracers, not scene-wide.
- [ ] Dynamically `import()` the postprocessing module tree only for quality tiers that enable it, to keep the PWA precache lean on lower tiers.
- [ ] Ship default OFF for all tiers pending real iPhone 14 Pro on-device frame-time measurement (Playwright/desktop testing cannot self-certify this phase per the plan).

## Phase 5 — Storm / Shrinking-Zone Mechanic
- [ ] Create `src/game/core/StormManager.ts`, timer-driven like `AirdropManager`, with a phase list of `{radius, shrinkDuration, waitDuration, damagePerSec}`.
- [ ] Add a translucent shrinking-cylinder visual reusing `AirdropManager`'s beacon shader trick, plus a `scene.fog` color shift when the player is outside the safe zone.
- [ ] Add a safe-zone ring and countdown readout to `HUDController.drawMinimap`.
- [ ] Add a "flee to zone center" AI state to `Bot.ts` so bots don't stand in the storm and die pointlessly.
- [ ] Wire storm damage into `Player.takeDamage` when outside the zone.
- [ ] Manual playtest note: flag shrink speed/damage tuning as needing human playtesting feedback, not just correctness — do not treat "compiles and runs" as "tuned."

## Phase 6 — Bot AI: Obstacle Avoidance + Ranged Enemies
- [ ] Copy `Player.update`'s collider push-out loop into `Bot.update` (fixes confirmed bug: bots currently walk through trees/rocks with zero avoidance).
- [ ] Add forward-lookahead steering against `world.colliders` for smoother avoidance (no navmesh/pathfinding library — disproportionate for this world size).
- [ ] Add a `kind: "melee" | "ranged"` field to `Bot.ts`.
- [ ] Implement ranged bot hitscan using `WeaponSystem.shoot`'s pattern, simplified to distance+cooldown, with a lightweight capsule/sphere LOS/range check against `world.colliders` (the player currently has no hittable representation — add a minimal one for this check).

## Phase 7 — Building System Depth
- [ ] Convert `BuildingManager.ts`'s hardcoded wall into a data-driven piece catalog: `BUILD_PIECE_DEFS: Record<"wall"|"floor"|"ramp", {...}>`, mirroring `weaponDefs.ts`.
- [ ] Add a placement ghost/preview: a semi-transparent clone tracks the snapped position while BUILD is held, confirmed on release, reusing the existing snap-to-grid math in `tryBuild`.
- [ ] Add floor pieces as a straightforward extension of the wall pattern.
- [ ] Ramps: scope as follow-up only if walls+floors+preview ship clean and time remains — requires a targeted downward raycast against placed-structure colliders, which the player controller does not currently do (it only uses the analytic heightfield).

## Phase 8 — Progression & Persistence
- [ ] Add a match-end summary screen (kills/score/survival time) in `GamePage.tsx`.
- [ ] Add a `localStorage`-backed lifetime stats ledger, using the same storage mechanism as the existing `elronite-skin` key.
- [ ] Extend `CharacterSkin` with an optional `unlockCondition`, gate 1-2 new skins behind stat thresholds (add new skins rather than locking existing ones, so this doesn't feel punitive on the current 4-skin roster).
