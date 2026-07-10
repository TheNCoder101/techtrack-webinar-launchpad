import type { PlayerInput } from "./types";

const JOYSTICK_MAX_RADIUS = 52;

// Owns all touch-driven controls: a dynamic left-side joystick for movement,
// a right-side drag zone for camera look, and dedicated fire/jump/build
// buttons. Pure DOM + pointer events — no React in the hot path so it stays
// smooth at 60fps on mobile Safari.
export class InputManager implements PlayerInput {
  moveX = 0;
  moveY = 0;
  fireHeld = false;

  private lookDx = 0;
  private lookDy = 0;
  private jumpQueued = false;
  private buildQueued = false;

  private root: HTMLDivElement;
  private joystickZone!: HTMLDivElement;
  private joystickBase!: HTMLDivElement;
  private joystickKnob!: HTMLDivElement;
  private lookZone!: HTMLDivElement;
  private fireBtn!: HTMLDivElement;
  private jumpBtn!: HTMLDivElement;
  private buildBtn!: HTMLDivElement;

  private joystickPointerId: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };
  private lookPointerId: number | null = null;
  private lookLast = { x: 0, y: 0 };

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "gj-controls";
    container.appendChild(this.root);

    this.buildJoystick();
    this.buildLookZone();
    this.buildButtons();
  }

  private buildJoystick(): void {
    const zone = document.createElement("div");
    zone.className = "gj-joystick-zone";
    this.root.appendChild(zone);
    this.joystickZone = zone;

    const base = document.createElement("div");
    base.className = "gj-joystick-base";
    base.style.opacity = "0";
    zone.appendChild(base);
    this.joystickBase = base;

    const knob = document.createElement("div");
    knob.className = "gj-joystick-knob";
    base.appendChild(knob);
    this.joystickKnob = knob;

    zone.addEventListener("pointerdown", (e) => {
      if (this.joystickPointerId !== null) return;
      this.joystickPointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const rect = zone.getBoundingClientRect();
      const x = Math.min(Math.max(e.clientX, rect.left + 40), rect.right - 40);
      const y = Math.min(Math.max(e.clientY, rect.top + 40), rect.bottom - 40);
      this.joystickOrigin = { x, y };
      base.style.left = `${x}px`;
      base.style.top = `${y}px`;
      base.style.opacity = "1";
      e.preventDefault();
    });

    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.joystickPointerId) return;
      const dx = e.clientX - this.joystickOrigin.x;
      const dy = e.clientY - this.joystickOrigin.y;
      const dist = Math.min(JOYSTICK_MAX_RADIUS, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * dist;
      const ky = Math.sin(angle) * dist;
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      this.moveX = kx / JOYSTICK_MAX_RADIUS;
      this.moveY = -ky / JOYSTICK_MAX_RADIUS;
      e.preventDefault();
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.joystickPointerId) return;
      this.joystickPointerId = null;
      this.moveX = 0;
      this.moveY = 0;
      knob.style.transform = "translate(0px, 0px)";
      base.style.opacity = "0";
    };
    zone.addEventListener("pointerup", release);
    zone.addEventListener("pointercancel", release);
  }

  private buildLookZone(): void {
    const zone = document.createElement("div");
    zone.className = "gj-look-zone";
    this.root.appendChild(zone);
    this.lookZone = zone;

    zone.addEventListener("pointerdown", (e) => {
      if (this.lookPointerId !== null) return;
      this.lookPointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.lookLast = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });

    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.lookPointerId) return;
      const dx = e.clientX - this.lookLast.x;
      const dy = e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.lookDx += dx / window.innerWidth;
      this.lookDy += dy / window.innerHeight;
      e.preventDefault();
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.lookPointerId) return;
      this.lookPointerId = null;
    };
    zone.addEventListener("pointerup", release);
    zone.addEventListener("pointercancel", release);
  }

  private makeButton(className: string, onPress: () => void): HTMLDivElement {
    const btn = document.createElement("div");
    btn.className = className;
    btn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add("gj-btn-active");
      onPress();
    });
    const clearActive = (e: PointerEvent) => {
      e.stopPropagation();
      btn.classList.remove("gj-btn-active");
    };
    btn.addEventListener("pointerup", clearActive);
    btn.addEventListener("pointercancel", clearActive);
    this.root.appendChild(btn);
    return btn;
  }

  private buildButtons(): void {
    this.fireBtn = this.makeButton("gj-btn gj-btn-fire", () => {
      this.fireHeld = true;
    });
    this.fireBtn.addEventListener("pointerup", () => (this.fireHeld = false));
    this.fireBtn.addEventListener("pointercancel", () => (this.fireHeld = false));
    this.fireBtn.textContent = "FIRE";

    this.jumpBtn = this.makeButton("gj-btn gj-btn-jump", () => {
      this.jumpQueued = true;
    });
    this.jumpBtn.textContent = "JUMP";

    this.buildBtn = this.makeButton("gj-btn gj-btn-build", () => {
      this.buildQueued = true;
    });
    this.buildBtn.textContent = "BUILD";
  }

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

  dispose(): void {
    this.root.remove();
  }
}
