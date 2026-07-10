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
  score: number;
  kills: number;
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
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;

  private hitMarkerTimeout: number | null = null;
  private damageFlashTimeout: number | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "gj-hud";
    container.appendChild(this.root);

    this.root.innerHTML = `
      <div class="gj-crosshair"></div>
      <div class="gj-damage-flash"></div>
      <div class="gj-eliminated">ELIMINATED — respawning…</div>
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
      <div class="gj-bottom-left">
        <canvas class="gj-minimap" width="140" height="140"></canvas>
      </div>
      <div class="gj-ammo">
        <div class="gj-ammo-text">30 / 150</div>
        <div class="gj-reload-text"></div>
      </div>
    `;

    this.healthFill = this.root.querySelector(".gj-health-fill")!;
    this.healthText = this.root.querySelector(".gj-health-text")!;
    this.materialsText = this.root.querySelector(".gj-materials-text")!;
    this.ammoText = this.root.querySelector(".gj-ammo-text")!;
    this.scoreText = this.root.querySelector(".gj-score-text")!;
    this.hitMarker = this.root.querySelector(".gj-hit-marker")!;
    this.damageFlash = this.root.querySelector(".gj-damage-flash")!;
    this.eliminatedBanner = this.root.querySelector(".gj-eliminated")!;
    this.minimapCanvas = this.root.querySelector(".gj-minimap")!;
    this.minimapCtx = this.minimapCanvas.getContext("2d")!;
  }

  update(state: HUDState): void {
    const pct = Math.max(0, state.health / state.maxHealth) * 100;
    this.healthFill.style.width = `${pct}%`;
    this.healthFill.style.background =
      pct > 50 ? "#4ade80" : pct > 20 ? "#facc15" : "#ef4444";
    this.healthText.textContent = String(Math.ceil(state.health));
    this.materialsText.textContent = String(state.materials);
    this.scoreText.textContent = `${state.score} (${state.kills} kills)`;

    const reloadEl = this.root.querySelector(".gj-reload-text") as HTMLDivElement;
    if (state.reloading) {
      this.ammoText.style.opacity = "0.35";
      reloadEl.textContent = "RELOADING…";
    } else {
      this.ammoText.style.opacity = "1";
      reloadEl.textContent = "";
      this.ammoText.textContent = `${state.ammo} / ${Math.floor(state.reserve)}`;
    }
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

  showEliminated(show: boolean): void {
    this.eliminatedBanner.style.display = show ? "flex" : "none";
  }

  drawMinimap(player: Player, botManager: BotManager): void {
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

    ctx.fillStyle = "#ef4444";
    for (const bot of botManager.bots) {
      if (!bot.alive) continue;
      const [mx, my] = toMap(bot.group.position.x, bot.group.position.z);
      if (mx < 0 || mx > size || my < 0 || my > size) continue;
      ctx.beginPath();
      ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      ctx.fill();
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
