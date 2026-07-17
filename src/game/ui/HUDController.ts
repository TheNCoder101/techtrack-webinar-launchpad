import { WORLD_RADIUS } from "../core/constants";
import { Player } from "../entities/Player";
import { BotManager } from "../entities/BotManager";

export interface HUDState {
  health: number;
  maxHealth: number;
  materials: number;
  ammo: number;
  reserve: number;
  reloading: boolean;
  isMelee: boolean;
  weaponName: string;
  score: number;
  kills: number;
  stormLabel: string;
  /** Seconds until the current storm phase ends, or null for the held final zone. */
  stormSecondsLeft: number | null;
  /** True while the player is outside the safe zone (taking storm damage). */
  playerInStorm: boolean;
  stormDamagePerSec: number;
  /** Seconds left on the final-zone survival countdown, or null when not yet
   *  in the final held zone (the victory timer — see Game.finalCountdown). */
  surviveSecondsLeft: number | null;
}

// All in-game readouts as plain DOM, written to imperatively every frame.
// Deliberately avoids React state so HUD updates never trigger a re-render
// during the hot render loop.
export class HUDController {
  root: HTMLDivElement;
  private healthFill: HTMLDivElement;
  private healthText: HTMLDivElement;
  private materialsText: HTMLDivElement;
  private ammoText: HTMLDivElement;
  private scoreText: HTMLDivElement;
  private hitMarker: HTMLDivElement;
  private damageFlash: HTMLDivElement;
  private eliminatedBanner: HTMLDivElement;
  private surviveTimer: HTMLDivElement;
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;
  private weaponNameEl: HTMLDivElement;
  private pickupToast: HTMLDivElement;
  private stormStatus: HTMLDivElement;

  private hitMarkerTimeout: number | null = null;
  private damageFlashTimeout: number | null = null;
  private pickupToastTimeout: number | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "gj-hud";
    container.appendChild(this.root);

    this.root.innerHTML = `
      <div class="gj-crosshair"></div>
      <div class="gj-damage-flash"></div>
      <div class="gj-eliminated"></div>
      <div class="gj-survive-timer"></div>
      <div class="gj-hit-marker">✕</div>
      <div class="gj-top-left">
        <div class="gj-health-row">
          <div class="gj-health-bar"><div class="gj-health-fill"></div></div>
          <div class="gj-health-text">100</div>
        </div>
        <div class="gj-materials"><span class="gj-icon">🪵</span><span class="gj-materials-text">0</span></div>
      </div>
      <div class="gj-top-right">
        <div class="gj-score">Score <span class="gj-score-text">0</span></div>
      </div>
      <div class="gj-storm-status"></div>
      <div class="gj-bottom-left">
        <canvas class="gj-minimap" width="140" height="140"></canvas>
      </div>
      <div class="gj-ammo">
        <div class="gj-weapon-name">Blaster</div>
        <div class="gj-ammo-text">30 / 150</div>
        <div class="gj-reload-text"></div>
      </div>
      <div class="gj-pickup-toast"></div>
    `;

    this.healthFill = this.root.querySelector(".gj-health-fill")!;
    this.healthText = this.root.querySelector(".gj-health-text")!;
    this.materialsText = this.root.querySelector(".gj-materials-text")!;
    this.ammoText = this.root.querySelector(".gj-ammo-text")!;
    this.scoreText = this.root.querySelector(".gj-score-text")!;
    this.hitMarker = this.root.querySelector(".gj-hit-marker")!;
    this.damageFlash = this.root.querySelector(".gj-damage-flash")!;
    this.eliminatedBanner = this.root.querySelector(".gj-eliminated")!;
    this.surviveTimer = this.root.querySelector(".gj-survive-timer")!;
    this.minimapCanvas = this.root.querySelector(".gj-minimap")!;
    this.minimapCtx = this.minimapCanvas.getContext("2d")!;
    this.weaponNameEl = this.root.querySelector(".gj-weapon-name")!;
    this.pickupToast = this.root.querySelector(".gj-pickup-toast")!;
    this.stormStatus = this.root.querySelector(".gj-storm-status")!;
  }

  update(state: HUDState): void {
    const pct = Math.max(0, state.health / state.maxHealth) * 100;
    this.healthFill.style.width = `${pct}%`;
    this.healthFill.style.background =
      pct > 50 ? "#4ade80" : pct > 20 ? "#facc15" : "#ef4444";
    this.healthText.textContent = String(Math.ceil(state.health));
    this.materialsText.textContent = String(state.materials);
    this.scoreText.textContent = `${state.score} (${state.kills} kills)`;

    this.weaponNameEl.textContent = state.weaponName;

    if (state.playerInStorm) {
      this.stormStatus.textContent = `IN STORM −${state.stormDamagePerSec} HP/s`;
      this.stormStatus.classList.add("gj-storm-danger");
    } else {
      const secs = state.stormSecondsLeft;
      let timer = "";
      if (secs !== null) {
        const s = Math.max(0, Math.ceil(secs));
        timer = ` ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      }
      this.stormStatus.textContent = `${state.stormLabel}${timer}`;
      this.stormStatus.classList.remove("gj-storm-danger");
    }

    // Final-zone victory countdown: only visible once the storm is holding its
    // smallest zone. "Survive" framing makes the win condition explicit.
    if (state.surviveSecondsLeft !== null) {
      const s = Math.max(0, Math.ceil(state.surviveSecondsLeft));
      this.surviveTimer.textContent = `SURVIVE ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      this.surviveTimer.style.display = "block";
    } else {
      this.surviveTimer.style.display = "none";
    }

    const reloadEl = this.root.querySelector(".gj-reload-text") as HTMLDivElement;
    if (state.isMelee) {
      this.ammoText.style.opacity = "1";
      reloadEl.textContent = "";
      this.ammoText.textContent = "MELEE";
    } else if (state.reloading) {
      this.ammoText.style.opacity = "0.35";
      reloadEl.textContent = "RELOADING…";
    } else {
      this.ammoText.style.opacity = "1";
      reloadEl.textContent = "";
      this.ammoText.textContent = `${state.ammo} / ${Math.floor(state.reserve)}`;
    }
  }

  showPickup(weaponName: string, isNew: boolean): void {
    this.pickupToast.textContent = isNew ? `New weapon: ${weaponName}!` : `${weaponName} restocked`;
    this.pickupToast.classList.add("gj-pickup-toast-active");
    if (this.pickupToastTimeout) window.clearTimeout(this.pickupToastTimeout);
    this.pickupToastTimeout = window.setTimeout(() => {
      this.pickupToast.classList.remove("gj-pickup-toast-active");
    }, 2200);
  }

  pulseHit(killed: boolean): void {
    this.hitMarker.classList.remove("gj-hit-marker-active");
    // Force reflow so re-adding the class restarts the CSS animation.
    void this.hitMarker.offsetWidth;
    this.hitMarker.classList.add("gj-hit-marker-active");
    this.hitMarker.style.color = killed ? "#facc15" : "#ffffff";
    if (this.hitMarkerTimeout) window.clearTimeout(this.hitMarkerTimeout);
    this.hitMarkerTimeout = window.setTimeout(() => {
      this.hitMarker.classList.remove("gj-hit-marker-active");
    }, 180);
  }

  pulseDamage(): void {
    this.damageFlash.classList.add("gj-damage-flash-active");
    if (this.damageFlashTimeout) window.clearTimeout(this.damageFlashTimeout);
    this.damageFlashTimeout = window.setTimeout(() => {
      this.damageFlash.classList.remove("gj-damage-flash-active");
    }, 260);
  }

  /** Clears in-game HUD timers at match end. The full win/loss result and its
   *  buttons are the React end-screen overlay (gj-match-end), so the HUD keeps
   *  no banner of its own — avoiding a duplicate title showing through the
   *  overlay scrim. */
  showMatchEnd(_outcome: "victory" | "defeat"): void {
    this.surviveTimer.style.display = "none";
  }

  drawMinimap(
    player: Player,
    botManager: BotManager,
    airdropPos?: { x: number; z: number } | null,
    safeZone?: { x: number; z: number; radius: number } | null
  ): void {
    const ctx = this.minimapCtx;
    const size = 140;
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = "rgba(10, 20, 15, 0.55)";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const scale = (size / 2 - 6) / (WORLD_RADIUS * 0.98);
    const cx = size / 2;
    const cy = size / 2;
    const cos = Math.cos(-player.yaw);
    const sin = Math.sin(-player.yaw);

    const toMap = (wx: number, wz: number): [number, number] => {
      const dx = (wx - player.position.x) * scale;
      const dz = (wz - player.position.z) * scale;
      const rx = dx * cos - dz * sin;
      const ry = dx * sin + dz * cos;
      return [cx + rx, cy + ry];
    };

    // Safe-zone ring, clipped to the round minimap face. Rotation-invariant
    // (it's a circle) so the player-relative rotation in toMap is free.
    if (safeZone) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      const [zx, zy] = toMap(safeZone.x, safeZone.z);
      ctx.beginPath();
      ctx.arc(zx, zy, safeZone.radius * scale, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(167, 139, 250, 0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = "#ef4444";
    for (const bot of botManager.bots) {
      if (!bot.alive) continue;
      const [mx, my] = toMap(bot.group.position.x, bot.group.position.z);
      if (mx < 0 || mx > size || my < 0 || my > size) continue;
      ctx.beginPath();
      ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (airdropPos) {
      const [ax, ay] = toMap(airdropPos.x, airdropPos.z);
      if (ax >= 0 && ax <= size && ay >= 0 && ay <= size) {
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.arc(ax, ay, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "#4ade80";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  dispose(): void {
    this.root.remove();
  }
}
