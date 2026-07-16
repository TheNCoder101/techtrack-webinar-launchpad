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
import { NetManager, type BrokerOverride } from "@/game/net/NetManager";
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

/** Dev/test-only signaling override, read from URL params (?net_host=…&
 *  net_port=…): the Playwright co-op verification points two browser
 *  contexts at a locally-run `npx peerjs` server this way. Absent (every
 *  normal visit), NetManager gets no override and uses the public PeerJS
 *  cloud broker. */
function brokerOverrideFromUrl(): BrokerOverride | undefined {
  const params = new URLSearchParams(window.location.search);
  const host = params.get("net_host");
  if (!host) return undefined;
  return {
    host,
    port: Number(params.get("net_port") ?? 9000),
    path: params.get("net_path") ?? "/",
    secure: params.get("net_secure") === "1",
  };
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

  // --- Co-op lobby state. Solo play never touches any of this: netRef stays
  // null unless the player explicitly presses Host/Join, and PLAY works
  // exactly as before either way (the co-op UI is purely additive).
  const netRef = useRef<NetManager | null>(null);
  const [hostCode, setHostCode] = useState<string | null>(null);
  const [joinConnected, setJoinConnected] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [coopBusy, setCoopBusy] = useState(false);
  const [coopError, setCoopError] = useState<string | null>(null);
  const [peerCount, setPeerCount] = useState(0);

  /** Connection failure fallback: drop the NetManager and return to the
   *  normal solo start screen with an inline error — never a hard crash. */
  const resetCoop = useCallback((error: string | null) => {
    netRef.current?.dispose();
    netRef.current = null;
    setHostCode(null);
    setJoinConnected(false);
    setCoopBusy(false);
    setPeerCount(0);
    setCoopError(error);
  }, []);

  const handleHostCoop = useCallback(async () => {
    if (netRef.current || gameRef.current) return;
    setCoopError(null);
    setCoopBusy(true);
    const net = new NetManager(brokerOverrideFromUrl());
    netRef.current = net;
    net.onPeerJoined = () => setPeerCount(net.peerCount);
    net.onPeerLeft = () => setPeerCount(net.peerCount);
    try {
      const code = await net.host();
      setHostCode(code);
      setCoopBusy(false);
    } catch {
      resetCoop("Couldn't reach the co-op service — you can still play solo.");
    }
  }, [resetCoop]);

  const handleJoinCoop = useCallback(async () => {
    if (netRef.current || gameRef.current) return;
    const code = joinCodeInput.trim();
    if (!code) return;
    setCoopError(null);
    setCoopBusy(true);
    const net = new NetManager(brokerOverrideFromUrl());
    netRef.current = net;
    net.onPeerLeft = () => setPeerCount(net.peerCount);
    try {
      await net.join(code);
      setJoinConnected(true);
      setCoopBusy(false);
    } catch {
      resetCoop("Couldn't join that game — check the code and try again.");
    }
  }, [joinCodeInput, resetCoop]);

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
    // netRef is null for solo play (the default) — Game then skips every
    // co-op code path entirely.
    const game = new Game(
      canvas,
      input,
      hud,
      container,
      PLAYER_SKINS[skinIndex],
      settings,
      netRef.current ?? undefined
    );
    // Console/debug affordance (also used by the automated co-op
    // verification harness) — a read handle only, nothing in the game
    // reads it back.
    (window as unknown as { __elronite?: Game }).__elronite = game;

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
      netRef.current?.dispose();
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

            {/* Co-op lobby (additive — PLAY below works exactly as before
                for solo). Host shows a join code + waiting state; Join takes
                a code; failures fall back here with an inline error. */}
            <div className="gj-coop-section">
              <div className="gj-settings-title">Co-op · 2–4 players</div>

              {!hostCode && !joinConnected && (
                <div className="gj-coop-buttons">
                  <button
                    type="button"
                    className="gj-coop-btn"
                    disabled={coopBusy}
                    onClick={handleHostCoop}
                  >
                    Host Co-op
                  </button>
                  <button
                    type="button"
                    className="gj-coop-btn"
                    disabled={coopBusy}
                    onClick={() => setShowJoinInput((v) => !v)}
                  >
                    Join Co-op
                  </button>
                </div>
              )}

              {showJoinInput && !joinConnected && !hostCode && (
                <div className="gj-coop-join-row">
                  <input
                    className="gj-coop-code-input"
                    type="text"
                    inputMode="text"
                    autoCapitalize="none"
                    maxLength={4}
                    placeholder="code"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value)}
                    aria-label="Join code"
                  />
                  <button
                    type="button"
                    className="gj-coop-btn"
                    disabled={coopBusy || joinCodeInput.trim().length === 0}
                    onClick={handleJoinCoop}
                  >
                    Join
                  </button>
                </div>
              )}

              {coopBusy && <div className="gj-coop-status">Connecting…</div>}

              {hostCode && (
                <div className="gj-coop-status">
                  Join code: <b className="gj-coop-code">{hostCode}</b>
                  {" — "}
                  {peerCount === 0
                    ? "waiting for players…"
                    : `${peerCount} player${peerCount === 1 ? "" : "s"} connected — press PLAY`}
                </div>
              )}

              {joinConnected && (
                <div className="gj-coop-status">Connected to host — press PLAY</div>
              )}

              {(hostCode || joinConnected) && (
                <button
                  type="button"
                  className="gj-coop-cancel"
                  onClick={() => resetCoop(null)}
                >
                  Cancel co-op
                </button>
              )}

              {coopError && <div className="gj-coop-error">{coopError}</div>}
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
