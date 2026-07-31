# ElroNite V4 — Desktop Keyboard & Mouse Support

## Context

ElroNite is touch-only today: `src/game/core/InputManager.ts` owns a dynamic
left-thumb joystick, a right-side look-drag zone, and FIRE/JUMP/BUILD buttons,
all via pointer events. On a desktop browser the game technically runs but is
effectively unplayable — you drag a virtual stick with a mouse.

Goal: proper mouse + keyboard play (WASD/arrows, mouse look, LMB fire, RMB
aim-down-sights zoom) plus the supporting affordances desktop players expect,
implemented in a way that is **quick, low-risk, and cannot regress mobile** —
mobile remains the primary shipped platform.

## Architecture decision (verified against the code, not assumed)

**Add a new `DesktopInputManager` that implements the existing `PlayerInput`
interface; leave the touch `InputManager` completely untouched.**

This is cheap because of a fact I verified directly: `Game.ts` only ever
touches `this.input.fireHeld`, `this.input.buildHeld` and
`this.input.consumeBuild()` — every one of which is already on the
`PlayerInput` interface (`src/game/core/types.ts`) — and it otherwise just
forwards `this.input` into `Player.update(dt, input, world)`, which already
takes `PlayerInput`. The only coupling to the concrete class is the parameter
*type annotation* on `Game.ts:178`.

So the total integration cost is:
1. `Game.ts:178` — widen `private input: InputManager` → `private input: PlayerInput`.
2. `types.ts` — add `dispose(): void` to `PlayerInput` (touch `InputManager`
   already has it; `GamePage` already calls it).
3. `GamePage.handlePlay` — construct `DesktopInputManager` or `InputManager`
   based on capability detection.

Because the touch file is never edited, **mobile behavior is unchanged by
construction** — the strongest possible regression guarantee, and the reason
to prefer this over bolting keyboard handling into the existing class.

**Detection:** choose desktop when `matchMedia("(pointer: fine)").matches &&
!matchMedia("(any-pointer: coarse)").matches`, i.e. a precise pointer and no
touchscreen. Hybrid/touchscreen laptops fall back to touch (safer default).
Expose a manual override in the Settings panel (`Auto / Touch / Keyboard`)
persisted through the existing `elronite-settings` mechanism, so a
misdetection is never a dead end.

---

## Control map

| Input | Action |
|---|---|
| **W A S D** / **Arrow keys** | Move |
| **Shift** (hold) | Sprint |
| **Mouse move** (pointer-locked) | Look / aim |
| **Left click** (hold) | Fire |
| **Right click** | Aim down sights — zoom in, tighter crosshair |
| **Space** | Jump |
| **1 – 6** | Select weapon slot |
| **Q** / **E** | Cycle build piece (wall ↔ floor) |
| **B** or **F** (hold→release) | Build: hold to preview ghost, release to place |
| **R** | Reload |
| **Esc** | Release mouse → pause overlay ("click to resume") |

---

## Implementation items

### D1. `DesktopInputManager` (new file, `src/game/core/DesktopInputManager.ts`)
Implements `PlayerInput`. Keeps a `Set<string>` of held `event.code` values
(use `code`, not `key`, so WASD works on non-QWERTY layouts and Shift-modified
keys don't change identity). Derives `moveX`/`moveY` each frame from the held
set.

**Critical gotcha — analog emulation.** `Player.update` does:
```ts
const magnitude = Math.min(1, Math.hypot(rawX, rawY));
this.sprinting = magnitude > 0.85;
const speed = PLAYER_WALK_SPEED * (1 + (PLAYER_SPRINT_MULT - 1) * magnitude);
```
Speed scales *continuously* with stick magnitude, and sprint triggers above
0.85. Digital keys naively emit ±1, so **a player holding W would permanently
sprint at max speed** and the Shift key would do nothing. The desktop manager
must emit analog-equivalent magnitudes: **walk ≈ 0.55, sprint (Shift) = 1.0**,
scaling the normalized direction vector. Get this wrong and desktop movement
silently feels broken while nothing errors.

### D2. Mouse look via Pointer Lock
`canvas.requestPointerLock()` on first click into the canvas; accumulate
`movementX`/`movementY` from `mousemove` into the same `lookDx`/`lookDy`
accumulator `consumeLook()` already drains, normalized the same way the touch
path normalizes (`/ window.innerWidth`) so the existing `LOOK_SENSITIVITY` and
the user's sensitivity slider keep working unchanged.

**Gotchas:**
- Esc exits pointer lock natively and that is **not interceptable** — so Esc
  cannot be a custom keybind. Design *around* it: listen for
  `pointerlockchange`, and when lock is lost show a "click to resume" pause
  overlay. This doubles as the pause affordance.
- The game already calls `requestFullscreen()` on play; request pointer lock
  *after* fullscreen resolves to avoid the two racing.
- Guard against `movementX` spikes some browsers emit on the first event
  after lock acquisition (clamp per-event delta).

### D3. Fire + ADS (right click)
- `mousedown`/`mouseup` button 0 → `fireHeld`.
- Button 2 → `aimHeld`. Add `aimHeld?: boolean` to `PlayerInput` as an
  **optional** field so the touch manager needs no change.
- `contextmenu` → `preventDefault()` on the canvas, or right-click opens the
  browser menu mid-fight.
- **ADS effect:** lerp `camera.fov` 68 → ~50 (`updateProjectionMatrix()` after
  each change) and scale look sensitivity down proportionally so aim feels
  consistent zoomed. Camera lives in `Game.ts` / `Player.updateCamera`, so
  thread `aimHeld` through there. Also tighten the CSS crosshair
  (`.gj-crosshair`) via a class toggle — reuse Track C's design tokens.
- Decide **hold** vs **toggle**: ship *hold* (matches shooter convention) and
  keep toggle as a settings option only if playtesting wants it.

### D4. Action keys → existing systems
All of these already exist and just need binding — no new gameplay code:
- Space → `consumeJump()` (already in the interface).
- 1–6 → `WeaponSystem.switchTo(index, audio)`. Already safely no-ops on empty
  slots, so no bounds handling needed. Wire through the same path
  `weaponBar.onSelect` uses in `Game.ts`, and call `weaponBar.setActive` so
  the HUD bar stays in sync.
- Q/E → cycle `BUILD_PIECE_IDS` (`["wall","floor"]`) through
  `buildingManager.selectPiece(id)` **and** `buildPieceBar.setActive(id)` so
  the bar highlight follows.
- B/F hold→release → `buildHeld` / `consumeBuild()` (the existing
  hold-to-preview, release-to-place contract).

**R → reload needs one small addition.** I verified `startReload` is
`private` and only called internally (out-of-ammo auto-reload) — there is no
manual reload path today. Add a public `WeaponSystem.requestReload(audio)`
that no-ops when the clip is full, already reloading, or the weapon is melee.

### D5. Desktop UI affordances
- Hide the touch control DOM entirely on desktop (the `DesktopInputManager`
  simply never creates `.gj-controls`, so nothing to hide).
- Replace the start-screen touch hints with the keyboard map above, styled
  with Track C's existing panel/token/icon system (add key-cap styling; no
  emoji — match the established icon language).
- Pause overlay on pointer-lock loss: "Click to resume", plus Main Menu.
  Reuse the `.gj-panel` recipe and the match-end overlay's button styling.
- Keep the in-game EXIT button visible on desktop (it already works by
  click) — but verify it doesn't fight pointer lock (clicking it must
  release lock first).
- Suppress the "rotate your device" hint on desktop.

---

## Sequencing

One agent iteration is appropriate — the items are small and tightly coupled,
and splitting them would mean two passes over the same three files.
Order: D1 → D2 → D3 (the input core, testable standalone) → D4 (bindings) →
D5 (UI). Ship as a single reviewable commit.

## Verification

- `npx tsc --noEmit && npm run build` clean.
- **Mobile non-regression is the top check**: confirm the touch
  `InputManager.ts` file is untouched in the diff, and take an iPhone 14 Pro
  Playwright pass showing joystick + buttons still present and functional.
- Desktop Playwright pass at a desktop viewport with a real mouse/keyboard
  driver (`page.keyboard.down("KeyW")`, `page.mouse.move`, `page.mouse.down({
  button: "right" })`):
  - **Movement**: assert the player's world position actually changes in the
    correct direction for W/A/S/D *and* arrows.
  - **Sprint is real, not always-on**: measure distance travelled over a
    fixed interval with and without Shift and assert sprint is meaningfully
    faster — this is the specific failure mode D1 warns about, so test it
    numerically rather than by eye.
  - **Mouse look**: assert `player.yaw`/`pitch` change on `mousemove` and that
    pitch stays clamped.
  - **ADS**: assert `camera.fov` drops on right-mousedown and restores on
    release; assert no context menu event escapes.
  - **Keys**: 1–6 switch slots (and the HUD bar highlight follows), Q/E
    cycles build pieces, Space jumps, R reloads a partially-spent clip.
  - Pointer-lock loss shows the pause overlay; clicking resumes.
- Zero console errors in both passes.

## Explicitly out of scope
Gamepad support, key rebinding UI, and any change to touch controls,
gameplay balance, or the renderer.
