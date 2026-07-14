import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "@/game/core/Game";
import { InputManager } from "@/game/core/InputManager";
import { HUDController } from "@/game/ui/HUDController";
import { PLAYER_SKINS } from "@/game/entities/skinDefs";
import {
  loadSettings,
  saveSettings,
  markQualityTierExplicit,
  type GameSettings,
  type QualityTier,
} from "@/game/core/Settings";
import "@/game/ui/hud.css";

const SKIN_STORAGE_KEY = "elronite-skin";
const QUALITY_TIER_OPTIONS: QualityTier[] = ["low", "medium", "high"];

function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function loadSavedSkinIndex(): number {
  const saved = Number(localStorage.getItem(SKIN_STORAGE_KEY));
  return Number.isInteger(saved) && saved >= 0 && saved < PLAYER_SKINS.length ? saved : 0;
}

export default function GamePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gameRef = useRef<Game | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const hudRef = useRef<HUDController | null>(null);

  const [started, setStarted] = useState(false);
  const [skinIndex, setSkinIndex] = useState(loadSavedSkinIndex);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);

  const selectSkin = useCallback((index: number) => {
    setSkinIndex(index);
    localStorage.setItem(SKIN_STORAGE_KEY, String(index));
  }, []);

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
  }, [skinIndex, settings]);

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
              {PLAYER_SKINS.map((skin, i) => (
                <button
                  key={skin.id}
                  type="button"
                  className={`gj-skin-swatch${i === skinIndex ? " gj-skin-swatch-active" : ""}`}
                  onClick={() => selectSkin(i)}
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
                  </span>
                  <span className="gj-skin-swatch-label">{skin.name}</span>
                </button>
              ))}
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
