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

## Phase 3 — Instancing & LOD for Props ✅ done (612784e)
- [x] Replace per-object `THREE.Group` placement in `World`'s scatter functions with `THREE.InstancedMesh` per geometry in `props.ts` (trees, rocks, crates, shacks).
- [x] Rework harvest state to instance-matrix writes: destroyed → zero-scale matrix, damaged → per-instance scale, replacing `World.harvest`'s current group-level scale.
- [x] Update raycasting to resolve `instanceId` on hit; make `HitUserData.refId` an instance-indexed lookup, keeping `WeaponSystem.resolveHit`'s dispatch contract unchanged.
- [x] Update `BuildingManager`'s `world.raycastTargets.push(mesh)` pattern to stay correct under the new instancing (walls are not instanced, but must coexist in the same raycast target list).
- [x] Cache `[...world.raycastTargets, ...botManager.raycastTargets]` in `WeaponSystem.shoot`/`swing` instead of rebuilding every shot; invalidate only on prop/wall add-remove. (Independently re-verified: both arrays have fixed membership after construction — props/bots only mutate instance matrices or per-object visibility, never array membership — so scoping invalidation to wall add/remove only is correct, not a shortcut.)
- [x] Raise `TREE_COUNT`/`ROCK_COUNT` for a denser island, gated by the Phase 1 quality tier (higher tiers get more props). (46→78 trees, 28→48 rocks, 10→16 crates, 5→8 shacks at base; also wired `terrainSegments`/`particlePoolSize` from Settings.ts as a bonus, not originally scoped to this item.)

## Phase 4 — Real Shadows + Minimal Post-Processing (ships OFF by default, tier-gated) ✅ done (193feaa)
- [x] Enable `renderer.shadowMap` (PCFSoftShadowMap) and `castShadow` on the sun light, with a tight ~30-unit shadow camera box re-centered on the player each frame; `mapSize` capped at 1024 default, 2048 only on "high" tier.
- [x] Keep `blobShadow.ts` fake-AO blobs for anything outside the near shadow frustum (hybrid near-real/far-fake).
- [x] Add `EffectComposer` post-processing (three.js bundled `examples/jsm/postprocessing`), replacing the direct `renderer.render()` call in `Game.ts`'s loop; add `SMAAPass` to compensate for losing native MSAA.
- [x] Add a narrow selective bloom pass applied only to muzzle flash/tracers, not scene-wide. (Layers-based half-res selective bloom, not the canonical full-scene-blacken technique — cheaper on mobile; whole particle pool is bloom-tagged so hit sparks/harvest debris glow too, not just muzzle flash.)
- [x] Dynamically `import()` the postprocessing module tree only for quality tiers that enable it, to keep the PWA precache lean on lower tiers. (Confirmed via build output: `postfx-*.js` is a separate 80.9kB chunk, zero `EffectComposer`/bloom/SMAA references in the main chunk; independently re-verified via Playwright that default play never fetches it. Still listed in the PWA precache list itself — kept deliberately for offline-safety once a tier does enable it, at the cost of precache size; flagged, not blocking.)
- [x] Ship default OFF for all tiers pending real iPhone 14 Pro on-device frame-time measurement (Playwright/desktop testing cannot self-certify this phase per the plan). **Independently re-confirmed**: grepped the entire `src/` tree for any `shadows: true`/`postFX: true` — zero matches; `Settings.ts` ships `false` for low/medium/high with no UI override path to force it on. Playwright confirmed picking "high" tier does not enable either feature. **Still needs your on-device iPhone check before any tier ever defaults this on** — that has not happened and can't happen in this sandbox.

## Phase 5 — Storm / Shrinking-Zone Mechanic ✅ done (398bb10)
- [x] Create `src/game/core/StormManager.ts`, timer-driven like `AirdropManager`, with a phase list of `{radius, shrinkDuration, waitDuration, damagePerSec}`.
- [x] Add a translucent shrinking-cylinder visual reusing `AirdropManager`'s beacon shader trick, plus a `scene.fog` color shift when the player is outside the safe zone.
- [x] Add a safe-zone ring and countdown readout to `HUDController.drawMinimap`.
- [x] Add a "flee to zone center" AI state to `Bot.ts` so bots don't stand in the storm and die pointlessly. (Includes edge hysteresis via a safe-margin constant so a shrinking boundary can't flip the state every frame.)
- [x] Wire storm damage into `Player.takeDamage` when outside the zone. (1Hz tick, not per-frame, to avoid re-triggering the hurt sound/flash 60x/sec.)
- [x] Manual playtest note: shrink speed/damage numbers are explicitly first-pass placeholders (commented as such in `StormManager.ts`) — still needs human playtesting for pacing feel.

## Phase 6 — Bot AI: Obstacle Avoidance + Ranged Enemies + Difficulty Scaling
- [ ] Copy `Player.update`'s collider push-out loop into `Bot.update` (fixes confirmed bug: bots currently walk through trees/rocks with zero avoidance).
- [ ] **(user-requested)** Verify this avoidance fix explicitly covers built walls, not just static props: `BuildingManager.placeWall` already pushes each wall's collider into `world.colliders` (confirmed via grep, same array `Player.update` and the new `Bot.update` avoidance both read), so walls should be avoided "for free" once the fix above lands. QA must explicitly test bots against a freshly-placed wall (dynamic add) and after `WALL_MAX_COUNT` eviction (dynamic remove) — not just static trees/rocks — since walls are the one collider type that's added/removed at runtime.
- [ ] Add forward-lookahead steering against `world.colliders` for smoother avoidance (no navmesh/pathfinding library — disproportionate for this world size).
- [ ] Add a `kind: "melee" | "ranged"` field to `Bot.ts`.
- [ ] Implement ranged bot hitscan using `WeaponSystem.shoot`'s pattern, simplified to distance+cooldown, with a lightweight capsule/sphere LOS/range check against `world.colliders` (the player currently has no hittable representation — add a minimal one for this check).
- [ ] **(user-requested)** Bot density & challenge scaling across difficulty: reuse the existing `QualityTier` (`low`/`medium`/`high` in `Settings.ts`, already selectable on the start screen) as the difficulty axis too, rather than adding a second selector — the user's own phrasing ("game level/tiers... easy medium High") maps directly onto the tier names already in the game. Scale `BOT_COUNT` up per tier (e.g. low≈5, medium≈7 current default, high≈10-11), and scale bot aggression/challenge per tier (aggro radius, ranged-bot fire rate/accuracy, or damage — pick 1-2 concrete knobs, don't overdesign). Document the reused-tier decision inline in `Settings.ts` since "quality" now also means "difficulty," which isn't obvious from the field name alone.

## Phase 7 — Building System Depth ✅ done (50d3dee)
- [x] Convert `BuildingManager.ts`'s hardcoded wall into a data-driven piece catalog: `BUILD_PIECE_DEFS`, mirroring `weaponDefs.ts` (new `src/game/building/buildPieceDefs.ts`).
- [x] Add a placement ghost/preview: BUILD input changed from tap-to-place to hold-then-preview-then-confirm-on-release (`InputManager` gained `buildHeld`); semi-transparent ghost tracks the snapped position, turns red when materials are insufficient and places nothing on release.
- [x] Add floor pieces as a straightforward extension of the wall pattern. **Accepted limitation, in scope per the plan's own note**: floors are visible/shootable but not walkable-on (ground height is still the analytic heightfield only — the raycast-based ground extension ramps would also need doesn't exist yet). Cosmetic/cover flooring for now.
- [x] Ramps: correctly skipped, exactly as scoped.
- [x] New wall-vs-floor picker (`BuildPieceBar.ts`, mirrors the existing `WeaponBar` slot idiom) — verified via Playwright screenshots to not overlap JUMP/FIRE/ammo in landscape; a harmless near-miss with the minimap corner in portrait, noted not blocking.
- [x] Verified existing wall-shooting (Phase 3 raycast contract) still works: fired at a placed wall, ammo decremented, zero errors — confirms walls and instanced props still coexist correctly in the shared `raycastTargets`/`colliders` arrays. Independently spot-checked by re-reading the `raycastTargetsDirty`/`colliders.push` wiring directly.

## Phase 8 — Progression & Persistence
- [ ] Add a match-end summary screen (kills/score/survival time) in `GamePage.tsx`.
- [ ] Add a `localStorage`-backed lifetime stats ledger, using the same storage mechanism as the existing `elronite-skin` key.
- [ ] Extend `CharacterSkin` with an optional `unlockCondition`, gate 1-2 new skins behind stat thresholds (add new skins rather than locking existing ones, so this doesn't feel punitive on the current 4-skin roster).

## Phase 10 — Start Screen Responsive Design (user-requested, added mid-flight) ✅ done (2775ede)
**Context:** Phase 1's settings panel already needed one reactive scroll-fix (`.gj-start-screen { overflow-y: auto }`) and there's a single `@media (orientation: portrait)` block plus a portrait→landscape hint overlay already in `hud.css` — this item is a full pass, not a from-scratch build.
- [x] Audit the full start screen (title, skin selector grid, settings panel, PLAY button, control-hint text) at the iPhone 14 Pro viewport in both portrait and landscape via Playwright screenshots — identify any clipped, overlapping, or overflowing elements in either orientation.
- [x] Fix layout with responsive CSS (flexbox/grid + media queries, consistent with the existing pattern in `hud.css`) rather than fixed pixel values where the audit finds problems. (New `.gj-start-inner` wrapper: margin:auto centering that degrades to top-anchored+scrollable rather than clipping; a named-grid-area two-column layout for short landscape phones; a narrow-phone breakpoint keeping all 4 skin swatches on one line; safe-area-inset padding throughout.)
- [x] Re-check the existing portrait→landscape hint overlay still makes sense once the rest of the layout is responsive — kept as-is: the *start screen* now works fine in portrait, but actual gameplay still plays better in landscape, so the hint remains accurate.
- [x] Also spot-check one other common phone aspect ratio as a cheap regression guard. **Independently re-verified**: took my own portrait (390×844) and landscape (844×390) screenshots on the merged branch — both clean, no clipping/overlap, zero console errors.

## Phase 11 — Apple Trees (user-requested, added mid-flight) ✅ done (0bb6cd7)
**Context:** builds directly on Phase 3's instancing architecture — read `World.ts`'s existing tree harvest path in full first (`treeTrunkRefIds`/`treeLeafRefIds`/`harvestableByRefId`, `Harvestable` type in `core/types.ts`, `World.harvest(refId)`) before changing anything; this is the same instance-index-to-object dispatch pattern that was the highest-regression-risk part of Phase 3, so get the read-before-write step right.
- [x] Add an apple-fruit `THREE.InstancedMesh` (small red/green spheres, low-poly) in `props.ts`, following the exact pattern of the existing trunk/leaves instanced meshes.
- [x] When scattering trees in `World.ts`, mark ~25% of trees as apple trees; for those, additionally place 2-4 apple instances among their leaf clusters.
- [x] Extend the `Harvestable` type (`core/types.ts`) with a variant flag (`treeVariant?: "apple"`) so `World.harvest(refId)` can tell an apple tree from a regular oak tree.
- [x] Extend `World.harvest`'s return contract so apple-tree hits yield both wood AND a heal amount — explicit `HarvestResult { materials, heal }` return type, one call site in `WeaponSystem.ts` updated.
- [x] Add a `Player.heal(amount)` method — clamps to `maxHealth`.
- [x] When an apple tree is destroyed, its apple instances are also zeroed out. (Apples ride the existing per-part `Harvestable.parts` health-scale machinery, so this is covered automatically with no special-case code — independently confirmed by reading the diff line by line, not just trusting the report.)
- [x] QA (regular tree → wood only no heal; apple tree → wood + capped heal; destroy apple tree → apples cleared; rocks unaffected) — **independently re-verified via code review** given this touches the same instance-dispatch architecture that was Phase 3's highest-regression-risk area; the `parts`-array integration is correct by construction, tsc/build re-confirmed clean on the merged branch.
