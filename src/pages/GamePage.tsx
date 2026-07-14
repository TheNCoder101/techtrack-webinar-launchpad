import { useCallback, useEffect, useRef, useState } from "react";
import { Game, type LifeSummary } from "@/game/core/Game";
import { InputManager } from "@/game/core/InputManager";
import { HUDController } from "@/game/ui/HUDController";
import {
  PLAYER_SKINS,
  isSkinUnlocked,
  describeUnlock,
} from "@/game/entities/skinDefs";
import {
  loadSettings,
  saveSettings,
  markQualityTierExplicit,
  type GameSettings,
  type QualityTier,
} from "@/game/core/Settings";
import { loadStats, saveStats, type LifetimeStats } from "@/game/core/Stats";
import "@/game/ui/hud.css";

const SKIN_STORAGE_KEY = "elronite-skin";
const QUALITY_TIER_OPTIONS: QualityTier[] = ["low", "medium", "high"];
// Coarse playtime accounting: tick the persisted ledger every 10s of play.
const PLAYTIME_TICK_SECONDS = 10;

function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function loadSavedSkinIndex(stats: LifetimeStats): number {
  const saved = Number(localStorage.getItem(SKIN_STORAGE_KEY));
  const valid =
    Number.isInteger(saved) &&
    saved >= 0 &&
    saved < PLAYER_SKINS.length &&
    // Defensive: a stored index pointing at a still-locked skin (e.g. after
    // clearing the stats key) silently falls back to the default skin.
    isSkinUnlocked(PLAYER_SKINS[saved], stats);
  return valid ? saved : 0;
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export default function GamePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gameRef = useRef<Game | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const hudRef = useRef<HUDController | null>(null);

  const [started, setStarted] = useState(false);
  const [stats, setStats] = useState<LifetimeStats>(loadStats);
  const [skinIndex, setSkinIndex] = useState(() => loadSavedSkinIndex(loadStats()));
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  // Non-null while the "match summary" overlay for the life that just ended
  // is showing; cleared automatically when the auto-respawn fires.
  const [lifeSummary, setLifeSummary] = useState<LifeSummary | null>(null);

  // All ledger mutations funnel through here so every change is persisted
  // immediately (same save-on-change pattern as the settings callbacks).
  const updateStats = useCallback((updater: (prev: LifetimeStats) => LifetimeStats) => {
    setStats((prev) => {
      const next = updater(prev);
      saveStats(next);
      return next;
    });
  }, []);

  const selectSkin = useCallback(
    (index: number) => {
      if (!isSkinUnlocked(PLAYER_SKINS[index], stats)) return;
      setSkinIndex(index);
      localStorage.setItem(SKIN_STORAGE_KEY, String(index));
    },
    [stats]
  );

  const selectQualityTier = useCallback((tier: QualityTier) => {
    setSettings((prev) => {
      const next = { ...prev, qualityTier: tier };
      saveSettings(next);
      markQualityTierExplicit();
      return next;
    });
  }, []);

  const updateLookSensitivity = useCallback((value: number) => {
    setSettings((prev) => {
      const next = { ...prev, lookSensitivity: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const updateSfxVolume = useCallback((value: number) => {
    setSettings((prev) => {
      const next = { ...prev, sfxVolume: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const handlePlay = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || gameRef.current) return;

    const input = new InputManager(container);
    const hud = new HUDController(container);
    const game = new Game(canvas, input, hud, container, PLAYER_SKINS[skinIndex], settings);

    // Progression hooks: feed the persisted lifetime ledger and drive the
    // match-summary overlay. Purely observational — the in-game auto-respawn
    // countdown is untouched.
    game.onKill = () => {
      updateStats((s) => ({ ...s, totalKills: s.totalKills + 1 }));
    };
    game.onDeath = (summary) => {
      updateStats((s) => ({
        ...s,
        totalDeaths: s.totalDeaths + 1,
        bestScore: Math.max(s.bestScore, summary.score),
      }));
      setLifeSummary(summary);
    };
    game.onRespawn = () => setLifeSummary(null);

    inputRef.current = input;
    hudRef.current = hud;
    gameRef.current = game;

    // Must run inside this click handler (not a later effect) to stay
    // within the user-gesture window iOS Safari requires for audio/fullscreen.
    game.audio.unlock();
    const el = container as HTMLElement & { requestFullscreen?: () => Promise<void> };
    el.requestFullscreen?.().catch(() => {
      /* iOS Safari (non-PWA) doesn't support element fullscreen — ignore */
    });

    game.start();
    setStarted(true);
  }, [skinIndex, settings, updateStats]);

  // Rough total-playtime accounting: tick the ledger every 10s while a game
  // is running. Coarse by design — a partial final tick is simply dropped.
  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => {
      updateStats((s) => ({
        ...s,
        totalPlaySeconds: s.totalPlaySeconds + PLAYTIME_TICK_SECONDS,
      }));
    }, PLAYTIME_TICK_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [started, updateStats]);

  useEffect(() => {
    return () => {
      gameRef.current?.dispose();
      inputRef.current?.dispose();
      hudRef.current?.dispose();
    };
  }, []);

  return (
    <div className="gj-game-root" ref={containerRef}>
      <canvas ref={canvasRef} className="gj-canvas" />

      {!started && (
        <div className="gj-start-screen">
          <div className="gj-start-inner">
            <div className="gj-title">ELRONITE</div>
            <div className="gj-subtitle">
              Free-roam a low-poly battle island. Swing a pickaxe to harvest wood &amp; stone,
              blast wandering raiders with your blaster, catch airdrops for SMGs, shotguns,
              snipers and heavies, and drop defensive walls to survive.
            </div>
            <div className="gj-skin-select">
              {PLAYER_SKINS.map((skin, i) => {
                const unlocked = isSkinUnlocked(skin, stats);
                return (
                  <button
                    key={skin.id}
                    type="button"
                    disabled={!unlocked}
                    className={`gj-skin-swatch${i === skinIndex ? " gj-skin-swatch-active" : ""}${
                      unlocked ? "" : " gj-skin-swatch-locked"
                    }`}
                    onClick={() => selectSkin(i)}
                    aria-label={
                      unlocked
                        ? skin.name
                        : `${skin.name} (locked — ${describeUnlock(skin.unlockCondition!)})`
                    }
                  >
                    <span
                      className="gj-skin-swatch-body"
                      style={{ background: hexToCss(skin.bodyColor) }}
                    >
                      {skin.helmet && (
                        <span
                          className="gj-skin-swatch-helmet"
                          style={{ background: hexToCss(skin.helmetColor ?? 0x222222) }}
                        />
                      )}
                      {!unlocked && <span className="gj-skin-swatch-lock">🔒</span>}
                    </span>
                    <span className="gj-skin-swatch-label">{skin.name}</span>
                    {!unlocked && skin.unlockCondition && (
                      <span className="gj-skin-swatch-unlock">
                        {describeUnlock(skin.unlockCondition)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="gj-lifetime-stats">
              🏆 {stats.totalKills} kills · 💀 {stats.totalDeaths} eliminated · ⭐ best{" "}
              {stats.bestScore} · ⏱ {formatDuration(stats.totalPlaySeconds)} played
            </div>

            <div className="gj-settings-section">
              <div className="gj-settings-title">Settings</div>

              <div className="gj-quality-picker">
                {QUALITY_TIER_OPTIONS.map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    className={`gj-quality-btn${settings.qualityTier === tier ? " gj-quality-btn-active" : ""}`}
                    onClick={() => selectQualityTier(tier)}
                  >
                    {tier.charAt(0).toUpperCase() + tier.slice(1)}
                  </button>
                ))}
              </div>

              <label className="gj-slider-row">
                <span className="gj-slider-label">Look Sensitivity</span>
                <input
                  className="gj-slider-input"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={settings.lookSensitivity}
                  onChange={(e) => updateLookSensitivity(Number(e.target.value))}
                />
                <span className="gj-slider-value">{settings.lookSensitivity.toFixed(2)}x</span>
              </label>

              <label className="gj-slider-row">
                <span className="gj-slider-label">SFX Volume</span>
                <input
                  className="gj-slider-input"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sfxVolume}
                  onChange={(e) => updateSfxVolume(Number(e.target.value))}
                />
                <span className="gj-slider-value">{Math.round(settings.sfxVolume * 100)}%</span>
              </label>
            </div>

            <button className="gj-play-btn" onClick={handlePlay}>
              ▶ PLAY
            </button>
            <div className="gj-controls-help">
              <div>🕹️ Left thumb — move</div>
              <div>👉 Right side drag — look / aim</div>
              <div>🔫 FIRE — shoot / swing</div>
              <div>🎒 Bottom slots — switch weapons</div>
              <div>⬆️ JUMP</div>
              <div>🧱 BUILD — place wall</div>
            </div>
          </div>
        </div>
      )}

      {/* Match-end summary: shown at the moment of elimination (this game's
          natural round boundary — there is no timer/last-man-standing end),
          alongside the HUD's ELIMINATED banner. pointer-events:none, so it
          can never block input, and Game.onRespawn clears it automatically
          when the untouched RESPAWN_DELAY countdown completes. */}
      {started && lifeSummary && (
        <div className="gj-life-summary">
          <div className="gj-life-summary-title">MATCH SUMMARY</div>
          <div className="gj-life-summary-row">
            <span>Kills this life</span>
            <span>{lifeSummary.kills}</span>
          </div>
          <div className="gj-life-summary-row">
            <span>Score</span>
            <span>{lifeSummary.score}</span>
          </div>
          <div className="gj-life-summary-row">
            <span>Survived</span>
            <span>{formatDuration(lifeSummary.survivalSeconds)}</span>
          </div>
          <div className="gj-life-summary-lifetime">
            Lifetime: {stats.totalKills} kills · {stats.totalDeaths} eliminated · best{" "}
            {stats.bestScore}
          </div>
        </div>
      )}

      {/* In-game only: the start screen now lays out fine in portrait, but the
          dual-thumb touch controls still play best in landscape. */}
      {started && (
        <div className="gj-rotate-hint gj-rotate-visible">
          <div>🔄</div>
          <div>Rotate your device to landscape for the best experience</div>
        </div>
      )}
    </div>
  );
}
