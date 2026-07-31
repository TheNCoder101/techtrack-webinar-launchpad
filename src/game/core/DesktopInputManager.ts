import type { PlayerInput } from "./types";

// Desktop keyboard + mouse backend (V4). Implements the same `PlayerInput`
// contract the touch InputManager does, so Game/Player consume it without
// knowing which one they got — and, critically, the touch file needed no edit
// at all, which is the whole regression guarantee for mobile.
//
// Creates NO control DOM: the on-screen joystick/buttons simply never exist on
// desktop because this class never builds them.

/** Analog-stick emulation (the single most important number in this file).
 *
 *  Player.update reads movement as an *analog* stick:
 *
 *    magnitude = min(1, hypot(rawX, rawY))
 *    sprinting = magnitude > 0.85
 *    speed     = PLAYER_WALK_SPEED * (1 + (PLAYER_SPRINT_MULT - 1) * magnitude)
 *    velocity  = moveDir * speed          // |moveDir| == magnitude when <= 1
 *
 *  A naive digital ±1 for WASD therefore pins magnitude at 1.0 forever: the
 *  player permanently sprints at max speed and Shift becomes a no-op. Nothing
 *  throws — it just plays wrong. So the direction vector is normalized and
 *  then scaled to an analog-equivalent magnitude:
 *
 *    walk  (0.55) -> 0.55 * 6.2 * (1 + 0.55*0.55) = 4.44 world-units/sec
 *    sprint (1.0) -> 1.00 * 6.2 * (1 + 0.55*1.00) = 9.61 world-units/sec
 *
 *  i.e. sprint is ~2.16x walk, and `sprinting` only latches on Shift. */
const WALK_MAGNITUDE = 0.55;
const SPRINT_MAGNITUDE = 1;

/** Mouse-look gain applied on top of the touch normalization (delta / viewport
 *  size). The touch path is tuned for a thumb dragging across a phone screen;
 *  raw mouse pixels through that same divisor feel glacial. This constant sits
 *  *before* LOOK_SENSITIVITY and the player's sensitivity slider, so both keep
 *  working exactly as they do on touch — this only re-centers the desktop
 *  baseline (~600px of mouse travel ≈ 160° of yaw at 1x). */
const MOUSE_LOOK_SCALE = 3.5;

/** Look gain multiplier while aiming down sights. The FOV goes 68° -> 50°, so
 *  a given mouse delta covers proportionally more of the visible frame;
 *  tan(25°)/tan(34°) ≈ 0.69, rounded to 0.7 — a constant rather than a live
 *  function of the (lerping) FOV, which would make aim feel unsteady mid-zoom. */
const ADS_LOOK_SCALE = 0.7;

/** Per-event movement clamp. Some browsers emit a single enormous movementX/Y
 *  on the first mousemove after pointer lock is acquired (the jump from the
 *  cursor's old screen position). Unclamped that snaps the camera violently. */
const MAX_MOVEMENT_PER_EVENT = 200;

/** Digital direction contributions, keyed by `event.code`.
 *
 *  `code` (physical key) not `key` (produced character) is deliberate: `key`
 *  changes with keyboard layout (AZERTY's "z" sits where QWERTY's "w" is) and
 *  with modifiers (Shift+w yields "W"), either of which silently breaks
 *  movement. `code` is stable on both counts. */
const MOVE_KEYS: Record<string, { x: number; y: number }> = {
  KeyW: { x: 0, y: 1 },
  ArrowUp: { x: 0, y: 1 },
  KeyS: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: -1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/** Number-row and numpad digits -> weapon slot index (1-6 => 0-5). */
const SLOT_KEYS: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
  Numpad5: 4,
  Numpad6: 5,
};

/** Keys that hold the build preview open (release places the piece). */
const BUILD_KEYS = new Set(["KeyB", "KeyF"]);

export class DesktopInputManager implements PlayerInput {
  moveX = 0;
  moveY = 0;
  fireHeld = false;
  buildHeld = false;
  aimHeld = false;

  private lookDx = 0;
  private lookDy = 0;
  private jumpQueued = false;
  private buildQueued = false;
  private reloadQueued = false;
  private slotQueued: number | null = null;
  private buildPieceStep = 0;

  private held = new Set<string>();
  private disposed = false;

  /** Fired whenever pointer lock is gained/lost. Lock loss is the game's pause
   *  trigger: Esc natively exits pointer lock and that keydown is NOT
   *  interceptable, so `pointerlockchange` — not a key binding — is the only
   *  reliable Esc-to-pause signal. GamePage sets this to drive its overlay. */
  onPauseChange?: (paused: boolean) => void;

  private canvas: HTMLCanvasElement;
  private container: HTMLElement;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement) {
    this.container = container;
    this.canvas = canvas;

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    // Capture phase on the whole game root, so a right-click anywhere over the
    // canvas *or* the HUD overlays is swallowed. Without this, right-click ADS
    // opens the browser context menu mid-fight.
    this.container.addEventListener("contextmenu", this.onContextMenu, true);
    this.container.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("pointerlockerror", this.onPointerLockError);
  }

  /** True while the mouse is captured — i.e. the player is actually playing
   *  rather than sitting behind the pause overlay. */
  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Asks for pointer lock. Must be called from a user-gesture handler.
   *  Deliberately fire-and-forget: a rejection (e.g. the browser's short
   *  post-Esc cooldown, or a fullscreen transition still settling) just leaves
   *  the pause overlay up, and the next click tries again. */
  requestLock(): void {
    if (this.disposed || this.locked) return;
    const el = this.canvas as HTMLCanvasElement & {
      requestPointerLock?: (opts?: unknown) => Promise<void> | void;
    };
    try {
      const result = el.requestPointerLock?.();
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(() => {});
      }
    } catch {
      /* ignore — see doc comment */
    }
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock?.();
  }

  private onPointerLockChange = (): void => {
    if (!this.locked) {
      // Lock lost (Esc, alt-tab, browser UI). Drop every held key/button so
      // the player doesn't keep sprinting into the storm behind the overlay.
      this.clearHeldState();
      this.onPauseChange?.(true);
    } else {
      this.onPauseChange?.(false);
    }
  };

  private onPointerLockError = (): void => {
    this.clearHeldState();
    this.onPauseChange?.(true);
  };

  private onBlur = (): void => {
    this.clearHeldState();
  };

  /** Zeroes all continuous input. Queued one-shots are dropped too — a jump
   *  buffered right as the window lost focus should not fire on return. */
  private clearHeldState(): void {
    this.held.clear();
    this.moveX = 0;
    this.moveY = 0;
    this.fireHeld = false;
    this.buildHeld = false;
    this.aimHeld = false;
    this.jumpQueued = false;
    this.buildQueued = false;
    this.reloadQueued = false;
    this.slotQueued = null;
    this.buildPieceStep = 0;
    this.lookDx = 0;
    this.lookDy = 0;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Never steal keys from a focused text field (the co-op join-code input).
    if (isTypingTarget(e.target)) return;
    // Gameplay keys are inert while the mouse is not captured — i.e. while the
    // pause overlay is up. Two reasons: nothing should queue up behind a pause,
    // and Space/Enter must stay available to activate the overlay's focused
    // RESUME button instead of being swallowed as a jump.
    if (!this.locked) return;
    // Esc is intentionally absent from every branch below: the browser
    // consumes it to exit pointer lock and the event is not cancelable, so
    // pausing hangs off `pointerlockchange` instead (see onPauseChange).

    const code = e.code;

    if (MOVE_KEYS[code]) {
      this.held.add(code);
      this.recomputeMove();
      e.preventDefault(); // arrows would otherwise scroll the page
      return;
    }

    if (code === "ShiftLeft" || code === "ShiftRight") {
      this.held.add(code);
      this.recomputeMove();
      return;
    }

    if (e.repeat) return; // everything below is edge-triggered

    if (code === "Space") {
      this.jumpQueued = true;
      e.preventDefault(); // Space scrolls / re-clicks the focused button
      return;
    }

    if (code in SLOT_KEYS) {
      this.slotQueued = SLOT_KEYS[code];
      return;
    }

    if (code === "KeyQ") {
      this.buildPieceStep -= 1;
      return;
    }
    if (code === "KeyE") {
      this.buildPieceStep += 1;
      return;
    }

    if (code === "KeyR") {
      this.reloadQueued = true;
      return;
    }

    if (BUILD_KEYS.has(code)) {
      this.held.add(code);
      this.buildHeld = true;
      return;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const code = e.code;

    if (MOVE_KEYS[code] || code === "ShiftLeft" || code === "ShiftRight") {
      this.held.delete(code);
      this.recomputeMove();
      return;
    }

    if (BUILD_KEYS.has(code)) {
      this.held.delete(code);
      // Only place if this release ends the hold — B and F both map to build,
      // so releasing one while the other is still down must not place twice.
      const stillHeld = [...BUILD_KEYS].some((k) => this.held.has(k));
      if (this.buildHeld && !stillHeld) {
        this.buildHeld = false;
        this.buildQueued = true;
      }
      return;
    }
  };

  /** Rebuilds moveX/moveY from the held key set. Called on every movement
   *  key/Shift transition rather than per frame, so the values Player reads are
   *  always already analog-correct (see WALK_MAGNITUDE). */
  private recomputeMove(): void {
    let x = 0;
    let y = 0;
    for (const code of this.held) {
      const dir = MOVE_KEYS[code];
      if (dir) {
        x += dir.x;
        y += dir.y;
      }
    }

    const len = Math.hypot(x, y);
    if (len === 0) {
      // Opposing keys (A+D) cancel to a dead stick — same as centering a stick.
      this.moveX = 0;
      this.moveY = 0;
      return;
    }

    const sprinting = this.held.has("ShiftLeft") || this.held.has("ShiftRight");
    const magnitude = sprinting ? SPRINT_MAGNITUDE : WALK_MAGNITUDE;
    this.moveX = (x / len) * magnitude;
    this.moveY = (y / len) * magnitude;
  }

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.locked) {
      // Unlocked: the click's only job is to (re)capture the mouse. Clicks on
      // real UI (EXIT button, pause overlay buttons) must still work, so only
      // canvas clicks grab the lock.
      if (e.target === this.canvas && e.button === 0) this.requestLock();
      return;
    }

    if (e.button === 0) {
      this.fireHeld = true;
      e.preventDefault();
    } else if (e.button === 2) {
      this.aimHeld = true;
      e.preventDefault();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    // Not gated on `locked`: a button released after the lock dropped must
    // still clear, or fire/ADS would stick on.
    if (e.button === 0) this.fireHeld = false;
    else if (e.button === 2) this.aimHeld = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    const dx = clamp(e.movementX, -MAX_MOVEMENT_PER_EVENT, MAX_MOVEMENT_PER_EVENT);
    const dy = clamp(e.movementY, -MAX_MOVEMENT_PER_EVENT, MAX_MOVEMENT_PER_EVENT);
    const gain = MOUSE_LOOK_SCALE * (this.aimHeld ? ADS_LOOK_SCALE : 1);
    // Same normalization the touch look-zone uses (delta / viewport size), so
    // LOOK_SENSITIVITY and the player's sensitivity slider behave identically.
    this.lookDx += (dx / window.innerWidth) * gain;
    this.lookDy += (dy / window.innerHeight) * gain;
  };

  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.lookDx, dy: this.lookDy };
    this.lookDx = 0;
    this.lookDy = 0;
    return out;
  }

  consumeJump(): boolean {
    const v = this.jumpQueued;
    this.jumpQueued = false;
    return v;
  }

  consumeBuild(): boolean {
    const v = this.buildQueued;
    this.buildQueued = false;
    return v;
  }

  consumeWeaponSlot(): number | null {
    const v = this.slotQueued;
    this.slotQueued = null;
    return v;
  }

  consumeBuildPieceStep(): number {
    const v = this.buildPieceStep;
    this.buildPieceStep = 0;
    return v;
  }

  consumeReload(): boolean {
    const v = this.reloadQueued;
    this.reloadQueued = false;
    return v;
  }

  dispose(): void {
    this.disposed = true;
    this.releaseLock();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.container.removeEventListener("contextmenu", this.onContextMenu, true);
    this.container.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("pointerlockerror", this.onPointerLockError);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** True when a keystroke belongs to a focused text field, not to the game. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}
