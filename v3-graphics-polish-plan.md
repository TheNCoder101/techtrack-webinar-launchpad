# ElroNite V3 — Premium Visual & UX Overhaul

## Audit (grounded in the actual code, not impressions)

Read in full before writing this plan: `World.ts`, `props.ts`, `humanoid.ts`,
`postfx.ts`, `Settings.ts`, `ParticleSystem.ts`, `hud.css`, `Game.ts`'s
renderer setup. Findings:

- **Every material in the game is `MeshLambertMaterial`** (grep-confirmed
  across all 8 files that construct one) — flat N·L shading, no specular, no
  roughness/metalness, no rim light, no environment reflection. Combined with
  **zero tone mapping** (`renderer.toneMapping` is never set, so it's the
  default `NoToneMapping`) and no color grading, the whole scene renders at
  raw linear-ish contrast with none of the filmic "pop" that reads as
  intentional. This is the single biggest lever in this plan and it is
  **almost free** — a renderer property and an exposure value.
- **Zero bitmap textures anywhere** (grep-confirmed: only hit is a
  canvas-generated radial-gradient dot for particles). This is a deliberate
  project constraint stated in the original V2 plan ("no bitmap textures —
  extend the vertex-color/procedural-shader approach") to keep the PWA
  asset-free and instantly cacheable. **This plan keeps that constraint** —
  the path to "premium" here is better shading/lighting/color and UI craft,
  not photoreal textures, which would also fight the low-poly art direction
  that's already working (humanoid rig, instanced props).
- **Geometry is intentionally minimal** (6-8 sided cylinders, 7-sided cones,
  icosahedron rocks) — correct for draw-call/vertex budget on a phone GPU,
  and not the problem. The problem is what light does to it once it's drawn.
- **PostFX pipeline already exists and works** (`postfx.ts`: selective bloom
  + SMAA, lazily `import()`-ed) but ships **off for every tier**, gated on an
  on-device iPhone check that has never happened. It has no color-grade or
  vignette pass — only bloom.
- **UI is functional, not designed.** `hud.css` (1073 lines) is entirely
  `system-ui` font, flat `rgba(...)` panels, plain `border-radius` + basic
  `box-shadow`, and **emoji as the entire icon language** (🪵🏆☠🔒🔄 etc.).
  No design tokens (colors/radii/shadows are ad-hoc numbers repeated per
  rule), no custom typography, no bespoke iconography. This is exactly where
  "vibe-coded" reads loudest, and it's the cheapest track to fix relative to
  its visual impact — it's CSS, not a renderer.
- **Terrain is one flat vertex-colored hillside** (`MeshLambertMaterial({
  vertexColors: true })`, `World.ts:261`) with no slope/height-based material
  blending — a single green with noise-driven per-vertex tint variance, no
  distinct grass/dirt/rock bands.
- **The quality-tier system (`Settings.ts`) is a solid foundation already in
  place** — this plan slots into it rather than replacing it: every new
  rendering feature gets a tier gate the same way shadows/postFX already do.

## Design thesis

Stay low-poly and texture-free (it's a strength, not a limitation, and it's
why this runs at all on a phone browser) — spend the visual budget on
**light, color, and craft** instead of geometry or textures:
1. Grade and light the existing geometry properly (tone mapping, rim light,
   a real sky, gradient terrain shading).
2. Give the UI an actual design system (type, icon set, panel language,
   motion) instead of ad-hoc CSS.
3. Layer in a handful of "juice" moments (hit feedback, screen shake, kill
   feed, transitions) that are cheap but disproportionately raise perceived
   quality.
4. Every item ships tier-gated through the existing `QualitySettings`
   mechanism, verified with the project's own frame-time sampler
   (`Game.samplePerf`) before being defaulted on for a tier — same discipline
   Phase 4 already established for shadows/postFX.

---

## Track A — Rendering & Lighting Foundation ✅ done (871e04c)
**Goal:** the single highest-impact, lowest-cost track. No new geometry, no new draw calls on most items.

**Shipped:** A1 (ACES tone mapping, exposure 1.12), A2 (sky sun disk/glow +
warm horizon + drifting cloud band, no textures), A3 (fresnel rim light on
character materials via `onBeforeCompile`, verified compatible with the
hit-flash white-color-set mechanic and all 6 player + 3 enemy skins), A4
(baked vertical AO gradient on prop vertex colors), A5 (terrain slope/height
color banding via `onBeforeCompile`, per-pixel not per-vertex), A6 (new
lightweight always-on-capable grade pass — vignette + subtle chromatic
aberration — in `gradepass.ts`, code-split to its own ~1.4kB chunk, gated by
a new `QualitySettings.gradePass` field: off on "low", on for "medium"/"high",
mutually exclusive with the existing (still off-by-default) bloom/postFX
composer), A7 (softer blob-shadow falloff). Independently re-verified beyond
the implementing agent's own report: reviewed every `onBeforeCompile` patch
and shader injection point directly, confirmed `customProgramCacheKey`
correctly isolates rim/terrain-patched programs from stock Lambert materials,
confirmed the gradePass/postFX mutual-exclusion and async-load race guards in
`Game.ts`, ran an independent `tsc`/build (clean, gradepass chunk confirmed
present and separate from the main bundle), and ran an independent
Playwright hit-flash regression test via the dev debug hook — bot body color
correctly flashes `#8a5a2f → #ffffff` on a real `BotManager.damage()` call
with the rim shader compiled in. Zero console errors across every check.
**Real-device frame-time verification is still outstanding** — same standing
caveat as Phase 4's shadows/postFX gate; the "medium"/"high" gradePass
default should get a real-iPhone check before being treated as final.

- **A1. Filmic tone mapping + exposure.** `renderer.toneMapping =
  THREE.ACESFilmicToneMapping`, tuned `toneMappingExposure` (~1.0-1.15),
  confirm `outputColorSpace = THREE.SRGBColorSpace`. This alone is usually
  the difference between "flat prototype" and "shipped game" on identical
  geometry. **Cost: effectively zero** (a per-pixel tonemap the GPU already
  does part of). Ships on for every tier immediately.
- **A2. Sky shader upgrade.** Extend the existing `SKY_VERT`/`SKY_FRAG` in
  `World.ts`: add a soft sun disk/glow toward `SUN_DIR`, a warmer
  horizon-to-zenith gradient, subtle procedural cloud band (cheap fbm noise,
  2-3 octaves, static or slow-scrolling). Same single full-screen sky mesh,
  no extra draw calls.
- **A3. Rim/fresnel light on characters via `onBeforeCompile`.** Patch
  `MeshLambertMaterial`'s shader (character body/head/helmet materials only —
  ~10 materials, not props) with a cheap fresnel rim term so silhouettes pop
  against the terrain instead of reading as flat cutouts. No material-type
  change, no new draw calls, a few extra ALU ops per fragment on a small
  fraction of scene pixels.
- **A4. Vertex-color light/AO baked into prop geometry.** Trees, rocks,
  crates, shacks already carry per-instance color via `setColorAt` — add a
  static top-lit/bottom-dark gradient baked into each geometry's *vertex*
  colors (not instance color) at creation time in `props.ts`, multiplying
  against the existing instance tint. Zero runtime cost, zero new draw
  calls, purely a one-time geometry authoring change.
- **A5. Terrain slope/height shading.** Replace the flat-tint
  `MeshLambertMaterial({vertexColors:true})` terrain material with a small
  custom `onBeforeCompile` patch that blends 2-3 procedural bands (lush
  grass low/flat, dirt on slopes, pale rock near the shoreline/high ground)
  using existing per-vertex normal/height data already on the geometry — no
  triplanar texture sampling needed, just a smoothstep blend of vertex-color
  bands computed once at generation time (same zero-runtime-cost pattern as
  A4). Terrain currently reads as a single green; this makes it read as a
  designed biome.
- **A6. Always-on lightweight grade pass, separate from the heavy bloom
  composer.** A single tiny `ShaderPass` (vignette + subtle chromatic
  aberration + the A1 tone curve if not done at the renderer level) that's
  cheap enough to run even on "low" tier — distinct from the existing
  bloom/SMAA `EffectComposer` pipeline, which stays tier-gated and pending
  on-device verification per the existing Phase 4 gate. This is new scope,
  not a re-litigation of the existing shadows/postFX gate.
- **A7. Soften `blobShadow.ts` edges + tie shadow opacity to time-of-day
  light angle** for a less "sticker" look at effectively no extra cost
  (same mesh, better material falloff).

**Perf note:** A1/A3/A4/A5/A7 are shader/data changes on existing draw
calls — expected to be **immeasurable** on frame time. A2/A6 add ~1 shader
pass each; budget target is **<0.5ms combined on a mid-tier device**, verified
with `samplePerf`'s existing frame-time sampler before defaulting on for
"low" tier.

---

## Track B — Character & Prop Craft ✅ done (dfc2e86)
**Goal:** make the low-poly cast and world read as *designed*, not primitive placeholders. Still zero textures, modest geometry cost.

**Shipped:** B1 (beveled tapered-prism torso, tapered limb ends, a real neck
gap — all inside the existing pivot groups, ~30 extra tris/character), B2
(all 5 guns now have a distinct held silhouette — SMG short/boxy, shotgun
wide-barreled, sniper long+scoped, heavy bulky, blaster refined — built from
2 shared unit primitives, each with an accent trim in its existing
`WeaponDef.color`; `Player.setActiveWeaponVisual` now takes the weapon id
instead of just a melee/ranged bool; `gunTip` moves to each gun's own muzzle
length), B3 (procedural billboard grass clusters near trees, one shared
`InstancedMesh`, new `QualitySettings.grassDensity` field: 0/low, 2-per-tree/
medium, 3-per-tree/high), B4 (3 rock variants, 3 crate variants, 2 shack
variants, each still one `InstancedMesh` per variant, scatter functions pick
per-placement). Independently re-verified beyond the implementing agent's own
report, given this touches the instance-dispatch/harvest system flagged
throughout this project as the highest-regression-risk area: read every
diff directly (the `rockRefIds: number[][]` per-variant-mesh parallel-array
pattern correctly mirrors the existing tree trunk/leaf dispatch), confirmed
the single `setActiveWeaponVisual` call site was updated and the initial
gun-visibility default matches `WeaponSystem`'s actual starting slot
(blaster), ran an independent `tsc`/build (clean), and ran independent
Playwright functional tests: **harvested all 3 rock variants to destruction**
(100hp → dead in 5 hits each, correct material yield, zero errors),
confirmed `gunTip` offsets correctly differ per weapon (sniper -1.27 vs SMG
-0.65), re-ran the Track A hit-flash regression check (still
`#241a33 → #ffffff` correctly), and confirmed grass instance counts directly
(`grassMesh` is `null`/never-constructed on "low", 106 on "medium", 233 on
"high" — matches the design exactly). Zero console errors across every
check. **Real-device frame-time verification for the new grass draw call is
still outstanding** — same standing caveat as every prior tier-gated feature
in this project.

- **B1. Sculpt the humanoid rig a step further.** `humanoid.ts`'s
  torso/limbs are currently a bare box + cylinders. Add small silhouette
  details cheaply: a beveled torso (extra segments or a lathed profile
  instead of a raw `BoxGeometry`), slightly tapered limb ends, a subtle neck
  gap — all within the existing pivot-group rig so `animateHumanoidLocomotion`
  needs no changes. Same triangle-budget order of magnitude (adds tens, not
  hundreds, of triangles per character).
- **B2. Weapon silhouette + rarity trim.** `weaponDefs.ts`-driven guns/pickaxe
  meshes get a touch more shape detail and a **per-weapon accent color/emissive
  trim** (ties into Track D's rarity idea) so different guns are
  identifiable at a glance, not just by HUD text.
- **B3. Foliage dressing.** Cheap cross-quad billboarded grass/scrub
  clusters (2 crossed planes, alpha-tested, one shared material, instanced)
  scattered near trees — classic low-cost mobile-game ground detail. Tier-gated
  via `propDrawDistance`/a new density knob in `QualitySettings`.
- **B4. Prop shape variety pass.** Rocks/crates/shacks currently each use
  one geometry with per-instance scale/rotation for variance — add 2-3
  geometry variants per prop type (still instanced, one extra `InstancedMesh`
  per variant) so the island doesn't read as one shape copy-pasted.

**Perf note:** B1/B2 are geometry-authoring changes, not runtime cost. B3 is
the one net-new draw-call item in this track — ship it behind a
`QualitySettings.grassDensity` field defaulting to 0 on "low", modest on
"medium"/"high", verified the same way Phase 3 verified the original prop
density increase.

---

## Track C — UI/UX Design System ✅ done (2796db3)
**Goal:** this is where "vibe-coded" is most visible today, and the cheapest track to fix per visual dollar — it's CSS and SVG, not the renderer.

**Shipped:** C1 (`hud.css` rebuilt on a ~30-token `:root` layer — palette, two
font stacks, tracking, radii, spacing, elevation/glow; no ad-hoc hex/rgba
left), C2 (Rajdhani self-hosted via `@fontsource/rajdhani`, latin-600/700
only, body copy stays system-ui), C3 (new `src/game/ui/icons.ts` — 24 bespoke
glyphs on one 24×24 / 2px-round-stroke / `currentColor` language, single
source shared by React, the imperative bars, `HUDController` and
`InputManager`; `weaponDefs`/`buildPieceDefs` `icon` fields are now typed
`IconId`s, `WeaponBar` resolves them through a per-slot render cache so
`innerHTML` isn't rewritten each frame — **every emoji is gone**), C4
(`.gj-panel` recipe: layered gradient + hairline + inner glow + accent top
edge via `::before`, shared by settings/co-op/both match-end variants; a
`.gj-hudpill` chip recipe for in-game readouts), C5 (spring press-bounce,
eased score tick-up, floating damage numbers, canvas-only screen shake so DOM
touch targets never move under a finger, expanding-ring kill marker,
`prefers-reduced-motion` respected), C6 (vignetted minimap face, range rings,
yaw-rotating compass ticks with gold north, glow+crisp zone ring, pulsing
threat halos inside 26 units, diamond airdrop marker, outlined player wedge),
C7 (kicker/wordmark/rule title block, iconed stat chips and control hints,
1.5s branded ELRONITE menu→match transition that is `pointer-events: none`
and cleaned up on unmount).

Presentation-only hook changes: `Player.onDamaged` now passes the damage
amount and `WeaponSystem.onHitBot` passes `(damage, killed)` — no gameplay
values touched, and the HUD stays imperative (never React) inside the render
loop, as its own design note requires. Deliberately **no `backdrop-filter`**
on in-game HUD elements, since blurring over a per-frame WebGL canvas costs
compositor time every frame.

**Independently re-verified** beyond the implementing agent's report: confirmed
the diff touches zero renderer/geometry files; traced both changed callback
signatures to every declaration and call site (the `pulseHit(killed)` refactor
correctly avoids a double-pulse); ran my own `tsc`/build (clean, both Rajdhani
WOFF2s emitted at ~31 kB total, precache 18 → 20 entries); **verified the
offline claim directly** — zero external font/CDN URLs anywhere in `dist/`,
both fonts present in the `sw.js` precache manifest; confirmed via
`document.fonts.check` on the served production build that Rajdhani genuinely
loaded and applied rather than silently falling back; and re-ran my own
`getBoundingClientRect` intersection test for the recently-fixed EXIT button —
**zero overlap area against the storm pill, the score pill, and a
force-shown survive timer, in both portrait and landscape**. Zero console
errors across every run. Landscape two-column start-screen layout (Phase 10)
confirmed intact.

**Caveats carried from the implementing agent, not independently re-checked:**
CSS-animation timing is unreliable under the headless software renderer, so
the intro overlay and damage numbers were captured with animations frozen and
proven to mount via MutationObserver rather than caught mid-flight naturally;
real-device *feel* (shake intensity, tick-up speed) is untested; score tick-up
was verified by code review plus the pop animation firing, not by scoring a
live kill. Portrait in-game remains cramped (rotate hint overlays the top-left
health text at 393px) — pre-existing, left unchanged rather than risk
regressing the recently-shipped hint/storm-status layout.

- **C1. Design tokens.** A small `:root` CSS custom-property layer in
  `hud.css` — color palette (currently ad-hoc hex/rgba repeated ~40+ times),
  spacing scale, corner-radius scale, shadow presets. Every existing rule
  gets migrated to reference tokens instead of magic values — mechanical but
  foundational for everything else in this track.
- **C2. Custom display typeface.** Self-host one bold condensed
  game-style webfont (WOFF2, open-license — e.g. Rajdhani/Exo 2/Orbitron
  family) via the existing PWA precache mechanism (stays fully offline, no
  CDN, no new runtime dependency beyond a static asset). Replaces
  `system-ui` for headings/HUD numerals; body text can stay system font for
  legibility.
- **C3. Custom SVG icon set.** Replace every emoji glyph (🪵🏆☠🔒🔄🧱🟫 etc.
  — ~12 distinct icons across HUD/start screen/end screen) with a small
  inline-SVG icon set matching one visual language (stroke width, corner
  style). Emoji render inconsistently across platforms/fonts; this is both
  a polish and a consistency fix.
- **C4. "Game panel" component language.** Redefine the panel look used by
  `.gj-match-end-card`, `.gj-storm-status`, the settings panel, pickup toast,
  etc.: layered background + inner glow + a thicker accent-colored top edge
  instead of a flat single-tone rounded rect. One shared CSS pattern (a
  `.gj-panel` base class + modifiers), not a one-off per component.
- **C5. Motion/juice pass.** Button press scale-bounce (currently instant
  `:active` color swap only), score/kill counter tick-up animation instead
  of an instant text swap, a floating damage-number pop on hits, a brief
  screen-shake on taking heavy damage or a kill, hit-marker refinement.
  All CSS/JS-only, no renderer cost.
- **C6. Minimap redesign.** Custom-drawn compass ring and refined
  player/bot/zone iconography in `HUDController.drawMinimap` (canvas 2D,
  already how it's drawn — no new tech, just better drawing code) plus a
  subtle pulse on nearby-threat dots.
- **C7. Start screen + transitions.** Skin-selector cards and settings
  panel restyled to the Track C1-C4 system; a real branded loading/transition
  moment between menu → match instead of an instant cut.

**Perf note:** this entire track is DOM/CSS/canvas-2D — it runs on the main
thread outside the WebGL frame budget and has no bearing on render FPS. Zero
tier-gating needed.

---

## Track D — Gameplay Sophistication (lighter touch, ties into visuals) ✅ done (6dd41bd)

> **Process note, for the record:** the implementing agent terminated early
> (ran out of model usage credits) at the tail end of its screenshot pass.
> Its work was already committed and self-verified at that point, so nothing
> was lost — but because its run did not end cleanly, the orchestrating
> session re-ran the substantive verification independently rather than
> trusting an interrupted report. Independent results below **corroborate**
> the agent's own numbers:
> - **D2 bearing math — exact at all four cardinals.** With yaw normalized,
>   an attacker dead ahead → `0.0deg`, to the right → `90.0deg`, behind →
>   `180.0deg`, to the left → `-90.0deg`. Also confirmed by reading the code
>   that `bearingTo`'s forward/right basis matches `Player.update`'s exactly,
>   and that the arc only fires when damage actually landed (`health <
>   healthBefore`), so an invulnerable/dead no-op never spawns a phantom arc.
> - **D3 miss rates — match config.** 20 000 samples per tier: 0.4502 /
>   0.2974 / 0.1515 against configured 0.45 / 0.30 / 0.15, with the
>   harder-tier-hits-more ordering correct.
> - **D3 storm constraint — held.** `StormManager.ts` diff is +9 lines of
>   documentation and **zero** changes to any timing value;
>   `FINAL_ZONE_SURVIVAL_SECONDS` untouched. Confirmed by diffing the
>   timing lines directly, not by reading the summary.
> - **D4 — 3 distinct lighting states across 4 fresh matches**, sun
>   colour/height and fog varying coherently together; dusk roll visually
>   confirmed to keep bots on the horizon clearly visible (the readability
>   constraint).
> - **Regressions — clean.** EXIT button zero overlap area vs storm pill,
>   score pill and a force-shown survive timer; bot hit-flash
>   `#8a5a2f → #ffffff`; solo play still constructs no `NetManager`. Own
>   `tsc`/build clean, zero console errors across every run.

**Goal:** the explicitly-requested "sophisticated gameplay" side, scoped to items that reinforce the visual work rather than open a second large initiative.

**Shipped:** D1 (rarity axis on `WeaponDef` — common: pickaxe/blaster
starters; rare: smg/shotgun airdrop sidegrades; epic: sniper/heavy
round-definers — one `WEAPON_RARITIES` table drives the B2 held-gun accent
trim (`gunAccentMats` now rarity-colored, not a second parallel color
system), the weapon-bar slot border/icon tint, the HUD weapon-name readout
and a rarity-labelled pickup toast, mirrored in CSS as `--gj-rarity-*`
tokens), D2 (attacker position threaded `Bot.onAttack(damage, sourcePos)` →
`BotManager.onPlayerDamaged(amount, sourcePos?)` → a crosshair-ring arc
rotated by the screen-relative bearing from the player's yaw; storm ticks
bypass the callback and stay directionless by design; plus a kill feed —
local kills and co-op `kill_feed` messages render through one shared
`HUDController.pushKillFeed` path, gold YOU / cyan ALLY credits), D3 (ONLY
the ranged-bot miss chance: `rangedMissChance` on `BOT_DIFFICULTY` —
0.45/0.3/0.15 for low/medium/high — a miss still fires the tracer/audio tell
with the endpoint pushed sideways so it visibly whiffs; `STORM_STAGES` and
`FINAL_ZONE_SURVIVAL_SECONDS` left byte-identical, with the full ~3m22s
match-arc math now documented beside the table for a future tuner), D4
(per-match time-of-day roll — dawn/noon/golden/dusk presets driving sun
direction, A2 sky uniforms (+ a new cloud-tint uniform), sun/hemi/ambient
lights and fog together; "noon" is the pre-D4 baseline bit-identical; dimmer
presets carry higher hemi/ambient floors so the island stays readable; a
DEV-only `?tod=` URL override exists for deterministic screenshots and is
compiled out of production).

**Verification (Playwright, iPhone 14 Pro viewport, dev-mode build via
`vite preview`):** 24/24 checks, zero console errors. Bearing math asserted
numerically at 4 bearings (behind ±180°, left −90°, front-right +45°, and a
yaw-rotated dead-ahead 0°) with screenshots of two visibly different arc
rotations; storm-path damage confirmed to spawn no arc. Miss chance verified
statistically — 5 000 forced shots per tier through the real `Bot.update`
path: observed miss 0.449/0.303/0.148 vs configured 0.45/0.30/0.15. Kill
feed exercised through real `BotManager.damage` kills (score also
incremented) plus an ally entry; bounding-box checks show every feed entry
clear of the storm pill, survive timer and EXIT in both orientations (feed
drops below the relocated storm pill in portrait). Rarity: slot classes 2/2/2
across the filled bar, sniper readout + held accent = epic violet, SMG = rare
cyan, toast "EPIC · New weapon: Heavy!". All four `?tod=` rolls asserted +
screenshotted, and 8 unforced loads rolled ≥3 distinct presets. Regressions
re-checked: bot hit-flash (#a8493c → #ffffff → restore), solo `net`
undefined, EXIT overlap zero. **Not verified:** co-op ally-feed entries over
a real 2-peer PeerJS session (the `kill_feed` handler rework is code-reviewed
+ solo-path-tested only), real-device feel of the new arc/feed timings, and
the standing real-iPhone frame-time caveat (D adds no new draw calls — the
sky/light changes are value-only — so no new perf surface is expected).

- **D1. Weapon rarity tiers.** Extend `weaponDefs.ts` with a rarity field
  (common/rare/epic) driving the Track B2 accent trim and a matching HUD
  ammo-bar color — turns an existing flat weapon list into a system with
  visible progression.
- **D2. Damage-direction indicator + kill feed polish.** A directional hit
  marker (which way did that shot come from) and a proper kill-feed toast
  (who killed what, not just a hit-marker flash) — both pure UI, part of
  Track C's motion work.
- **D3. Carry over the two tuning items already flagged in `v2-backlog.md`**
  (storm shrink pacing, ranged-bot miss chance on "high" tier) — not new
  scope, just finally actioning existing flagged debt while touching this
  code anyway.
- **D4. Time-of-day lighting variance.** A slow day/night cycle or a
  per-match random time-of-day roll, reusing Track A2's sky shader and A1's
  light angle — free replay variety riding on work already done.

---

## Sequencing & Checkpoints

Same discipline as the original V2 roadmap: phase-sized worktree-agent
iterations, `tsc --noEmit && npm run build` clean + Playwright screenshot
diffing before every commit, a checkpoint report after each track rather
than one giant unreviewable diff.

1. **Track A first** — cheapest, highest-impact, lowest-risk, and every
   later track (props, terrain, UI color tokens) looks better once lighting
   is fixed, so doing it last would mean re-eyeballing everything twice.
2. **Track C in parallel with Track A** — disjoint files (CSS/React vs.
   Three.js/shaders), safe to run as concurrent worktree agents.
3. **Track B after A** — prop/character shape changes are easiest to judge
   correctly once the lighting they'll be seen under is final.
4. **Track D last** — small, and D1/D2 depend on Track B2/C's visual
   language existing first.

**Verification per track:** Playwright before/after screenshots at the
iPhone 14 Pro viewport (the project's existing convention) for every visual
change; `samplePerf`'s frame-time sampler checked against each tier's
existing budget before any new feature defaults on; tsc/build clean gate
carried over unchanged from V2.

**Real-device caveat, stated plainly:** exactly like Phase 4's shadows/postFX
gate, nothing in Track A/B that touches shader complexity or draw-call count
should be defaulted on for "medium"/"low" tiers without a real on-device
frame-time check — this sandbox can verify correctness and relative cost via
Playwright, but not real iPhone GPU headroom.
