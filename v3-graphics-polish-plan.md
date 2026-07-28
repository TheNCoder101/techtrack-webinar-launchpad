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

## Track A — Rendering & Lighting Foundation
**Goal:** the single highest-impact, lowest-cost track. No new geometry, no new draw calls on most items.

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

## Track B — Character & Prop Craft
**Goal:** make the low-poly cast and world read as *designed*, not primitive placeholders. Still zero textures, modest geometry cost.

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

## Track C — UI/UX Design System
**Goal:** this is where "vibe-coded" is most visible today, and the cheapest track to fix per visual dollar — it's CSS and SVG, not the renderer.

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

## Track D — Gameplay Sophistication (lighter touch, ties into visuals)
**Goal:** the explicitly-requested "sophisticated gameplay" side, scoped to items that reinforce the visual work rather than open a second large initiative.

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
