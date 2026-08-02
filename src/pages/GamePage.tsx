import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Game, type LifeSummary, type MatchOutcome } from "@/game/core/Game";
import { InputManager } from "@/game/core/InputManager";
import { DesktopInputManager } from "@/game/core/DesktopInputManager";
import type { PlayerInput } from "@/game/core/types";
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
  resolveDesktopControls,
  type ControlScheme,
  type GameSettings,
  type QualityTier,
} from "@/game/core/Settings";
import { loadStats, saveStats, type LifetimeStats } from "@/game/core/Stats";
import { NetManager, type BrokerOverride } from "@/game/net/NetManager";
import { iconSvg, type IconId } from "@/game/ui/icons";
// Self-hosted display face (V3 Track C2): Rajdhani via @fontsource — WOFF2
// assets are bundled by Vite and land in the PWA precache (vite.config.ts
// globPatterns already includes woff2), so the font works fully offline with
// no CDN request ever.
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "@/game/ui/hud.css";

/** Inline SVG icon from the shared game icon set (ui/icons.ts) — the same
 *  markup the imperative HUD/bars render, so React and non-React UI stay on
 *  one icon language. Content is static and authored in this repo. */
function Icon({ id }: { id: IconId }) {
  // eslint-disable-next-line react/no-danger
  return <span className="gj-ic-wrap" dangerouslySetInnerHTML={{ __html: iconSvg(id) }} />;
}

/** How long the branded menu→match transition stays up (ms) — matches the
 *  gj-match-intro CSS animation length. */
const MATCH_INTRO_MS = 1500;

const SKIN_STORAGE_KEY = "elronite-skin";
const QUALITY_TIER_OPTIONS: QualityTier[] = ["low", "medium", "high"];
// Coarse playtime accounting: tick the persisted ledger every 10s of play.
const PLAYTIME_TICK_SECONDS = 10;
const CONTROL_SCHEME_OPTIONS: { id: ControlScheme; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "touch", label: "Touch" },
  { id: "keyboard", label: "Keyboard" },
];

/** Start-screen control map for desktop (V4 D5). Mirrors the touch hint list
 *  it replaces: one icon, the key caps, and what they do. `keys` are rendered
 *  as <kbd> caps; a "/" entry becomes a plain separator. */
const DESKTOP_KEY_HINTS: { icon: IconId; keys: string[]; label: string }[] = [
  { icon: "keyboard", keys: ["W", "A", "S", "D"], label: "Move" },
  { icon: "keyboard", keys: ["Shift"], label: "Sprint" },
  { icon: "mouse", keys: ["Move"], label: "Look / aim" },
  { icon: "crosshair", keys: ["L-Click"], label: "Fire" },
  { icon: "sniper", keys: ["R-Click"], label: "Aim down sights" },
  { icon: "jump", keys: ["Space"], label: "Jump" },
  { icon: "slots", keys: ["1", "-", "6"], label: "Weapons" },
  { icon: "wall", keys: ["Q", "/", "E"], label: "Wall / floor" },
  { icon: "wall", keys: ["B", "/", "F"], label: "Hold to build" },
  { icon: "reload", keys: ["R"], label: "Reload" },
  { icon: "pause", keys: ["Esc"], label: "Pause" },
];

/** Renders one hint's key caps; "/" and "-" pass through as separators. */
function KeyCaps({ keys }: { keys: string[] }) {
  return (
    <span className="gj-keycaps">
      {keys.map((k, i) =>
        k === "/" || k === "-" ? (
          <span key={i} className="gj-keycap-sep">
            {k}
          </span>
        ) : (
          <kbd key={i} className="gj-keycap">
            {k}
          </kbd>
        )
      )}
    </span>
  );
}

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
  // Dev-only: production builds ignore any ?net_host= param entirely and
  // always use the public PeerJS cloud broker, so a crafted link can never
  // redirect a real player's signaling to an arbitrary host.
  if (!import.meta.env.DEV) return undefined;
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
  // Interface-typed (V4): holds an InputManager on touch or a
  // DesktopInputManager on keyboard/mouse. Only `dispose()` is called here.
  const inputRef = useRef<PlayerInput | null>(null);
  // Set only in the desktop case, so the pause overlay can re-acquire the lock.
  const desktopInputRef = useRef<DesktopInputManager | null>(null);
  const hudRef = useRef<HUDController | null>(null);

  const [started, setStarted] = useState(false);
  const [stats, setStats] = useState<LifetimeStats>(loadStats);
  const [skinIndex, setSkinIndex] = useState(() => loadSavedSkinIndex(loadStats()));
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  // Non-null once the match has ended (win or loss): drives the end screen
  // with its final stats and Main Menu / Play Again buttons. There is no
  // respawn — cleared only by returning to the menu or restarting.
  const [matchEnd, setMatchEnd] = useState<{ outcome: MatchOutcome; summary: LifeSummary } | null>(
    null
  );
  // Branded menu→match transition (V3 Track C7): true for a moment after
  // PLAY. Purely visual (the overlay is pointer-events: none) — the match
  // starts underneath immediately, so no gameplay timing changes.
  const [introVisible, setIntroVisible] = useState(false);
  const introTimeoutRef = useRef<number | null>(null);

  // Desktop only: true whenever pointer lock is not held during a live match —
  // i.e. the player pressed Esc, alt-tabbed, or hasn't clicked in yet. Esc
  // cannot be intercepted as a key (the browser consumes it to exit pointer
  // lock), so `pointerlockchange` is the pause signal (see DesktopInputManager).
  const [paused, setPaused] = useState(false);

  /** Effective control backend for the *next* match. Recomputed when the
   *  player changes the override; a live match keeps whatever it started with. */
  const desktopControls = useMemo(
    () => resolveDesktopControls(settings.controlScheme),
    [settings.controlScheme]
  );

  const flashMatchIntro = useCallback(() => {
    if (introTimeoutRef.current) window.clearTimeout(introTimeoutRef.current);
    setIntroVisible(true);
    introTimeoutRef.current = window.setTimeout(() => {
      setIntroVisible(false);
      introTimeoutRef.current = null;
    }, MATCH_INTRO_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (introTimeoutRef.current) window.clearTimeout(introTimeoutRef.current);
    };
  }, []);

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

  const selectControlScheme = useCallback((scheme: ControlScheme) => {
    setSettings((prev) => {
      const next = { ...prev, controlScheme: scheme };
      saveSettings(next);
      return next;
    });
  }, []);

  /** Pause overlay "click to resume": re-acquires pointer lock from inside the
   *  click gesture browsers require. */
  const handleResume = useCallback(() => {
    desktopInputRef.current?.requestLock();
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

    // V4: pick the input backend. The touch InputManager is constructed
    // exactly as before (and is the fallback for anything not clearly a
    // desktop), so mobile is byte-identical; DesktopInputManager creates no
    // control DOM at all, which is how the on-screen joystick/buttons
    // "disappear" on desktop.
    let input: PlayerInput;
    if (desktopControls) {
      const desktopInput = new DesktopInputManager(container, canvas);
      desktopInput.onPauseChange = (isPaused) => setPaused(isPaused);
      desktopInputRef.current = desktopInput;
      input = desktopInput;
      // Start paused-looking until the lock is actually granted below; the
      // pointerlockchange callback clears it.
      setPaused(true);
    } else {
      desktopInputRef.current = null;
      input = new InputManager(container);
      setPaused(false);
    }
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
    // reads it back. Dev-only: stripped from production builds so the
    // shipped bundle never exposes the Game instance globally.
    if (import.meta.env.DEV) {
      (window as unknown as { __elronite?: Game }).__elronite = game;
    }

    // Progression hooks: feed the persisted lifetime ledger and drive the
    // end screen. A death counts as an elimination; both outcomes update the
    // best-score record.
    game.onKill = () => {
      updateStats((s) => ({ ...s, totalKills: s.totalKills + 1 }));
    };
    game.onMatchEnd = (outcome, summary) => {
      // Desktop: hand the cursor back so the end screen's buttons are
      // clickable at all. Without this the player stays pointer-locked staring
      // at a Play Again button they cannot reach.
      desktopInputRef.current?.releaseLock();
      updateStats((s) => ({
        ...s,
        totalDeaths: s.totalDeaths + (outcome === "defeat" ? 1 : 0),
        bestScore: Math.max(s.bestScore, summary.score),
      }));
      setMatchEnd({ outcome, summary });
    };

    inputRef.current = input;
    hudRef.current = hud;
    gameRef.current = game;

    // Must run inside this click handler (not a later effect) to stay
    // within the user-gesture window iOS Safari requires for audio/fullscreen.
    game.audio.unlock();
    const el = container as HTMLElement & { requestFullscreen?: () => Promise<void> };
    const fullscreen = el.requestFullscreen?.();
    // Pointer lock is requested only *after* fullscreen settles: asking for
    // both in the same tick makes the two transitions race, and some browsers
    // drop the lock as the fullscreen change lands. Either outcome of the
    // fullscreen promise is fine — the lock attempt follows regardless, and if
    // it is refused the pause overlay simply stays up for one more click.
    const grabLock = () => desktopInputRef.current?.requestLock();
    if (fullscreen && typeof fullscreen.then === "function") {
      fullscreen.then(grabLock, grabLock);
    } else {
      grabLock();
    }

    game.start();
    setStarted(true);
    flashMatchIntro();
  }, [skinIndex, settings, updateStats, flashMatchIntro, desktopControls]);

  // Desktop pause is a REAL pause, not just an overlay: without this the storm
  // keeps ticking and bots keep shooting while the player is looking at a
  // "PAUSED" card, so Esc could get you killed. Declarative (rather than done
  // inside onPauseChange) so it is correct regardless of whether the lock
  // resolves before or after the Game instance exists.
  //
  // Deliberately inert once the match has ended: the loop must keep rendering
  // the world behind the end screen (and keep co-op broadcasting), exactly as
  // before V4.
  useEffect(() => {
    if (!started || matchEnd || !desktopControls) return;
    const game = gameRef.current;
    if (!game) return;
    if (paused) game.pause();
    else game.resume();
  }, [started, matchEnd, desktopControls, paused]);

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

  /** Tears down the live game/input/HUD and (unless `keepNet`) the co-op
   *  NetManager, nulling their refs so a fresh match can be started.
   *  Deliberately touches no React state or fullscreen — callers decide
   *  whether to return to the menu or immediately restart. Safe to call more
   *  than once (the unmount effect's optional chaining then simply no-ops on
   *  the nulled refs).
   *
   *  V5 F2a: `keepNet` exists for "Play Again" (handleRestart) — tearing the
   *  net down there was the root cause of a co-op match silently restarting
   *  solo (handlePlay reads `netRef.current ?? undefined`, so a nulled
   *  netRef meant the fresh Game got no NetManager at all). Leaving the
   *  NetManager alive across the old Game's disposal is safe: Game.dispose()
   *  never touches `net` itself (only its own RemotePlayer puppets/scene),
   *  and the new Game's constructor unconditionally re-assigns
   *  `net.onMessage`/`onPeerLeft` — single-slot callback fields that simply
   *  overwrite, so the still-open peer connections keep working uninterrupted. */
  const teardownGame = useCallback((opts?: { keepNet?: boolean }) => {
    gameRef.current?.dispose();
    inputRef.current?.dispose();
    hudRef.current?.dispose();
    gameRef.current = null;
    inputRef.current = null;
    // DesktopInputManager.dispose() already released pointer lock.
    desktopInputRef.current = null;
    hudRef.current = null;
    if (!opts?.keepNet) {
      netRef.current?.dispose();
      netRef.current = null;
    }
    setPaused(false);
    if (import.meta.env.DEV) {
      (window as unknown as { __elronite?: Game }).__elronite = undefined;
    }
  }, []);

  /** Leaves the current match and returns to the start screen (main menu).
   *  Always drops the co-op session — re-hosting/joining from the menu is
   *  the explicit way back in, matching the co-op lobby UI reset below. */
  const handleExitToMenu = useCallback(() => {
    teardownGame();
    setMatchEnd(null);
    setStarted(false);
    // Reset any co-op lobby UI back to its solo default.
    setHostCode(null);
    setJoinConnected(false);
    setShowJoinInput(false);
    setJoinCodeInput("");
    setCoopBusy(false);
    setCoopError(null);
    setPeerCount(0);
    const doc = document as Document & { exitFullscreen?: () => Promise<void> };
    if (doc.fullscreenElement) doc.exitFullscreen?.().catch(() => {});
  }, [teardownGame]);

  /** End screen "Play Again": tears the finished match down and immediately
   *  starts a fresh one, staying in fullscreen (this runs inside the
   *  button-click gesture). V5 F2a: keeps any live co-op session — netRef
   *  survives teardownGame's `keepNet`, so handlePlay below hands the same
   *  still-connected NetManager to the new Game and every peer stays
   *  visible to each other across the restart, instead of silently dropping
   *  into a solo world. */
  const handleRestart = useCallback(() => {
    teardownGame({ keepNet: true });
    setMatchEnd(null);
    handlePlay();
  }, [teardownGame, handlePlay]);

  return (
    <div className="gj-game-root" ref={containerRef}>
      <canvas ref={canvasRef} className="gj-canvas" />

      {!started && (
        <div className="gj-start-screen">
          <div className="gj-start-inner">
            <div className="gj-title-block">
              <div className="gj-title-kicker">Battle Island</div>
              <div className="gj-title">ELRONITE</div>
              <div className="gj-title-rule" />
            </div>
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
                      {!unlocked && (
                        <span className="gj-skin-swatch-lock">
                          <Icon id="lock" />
                        </span>
                      )}
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
              <span className="gj-stat">
                <Icon id="trophy" />
                {stats.totalKills} kills
              </span>
              <span className="gj-stat gj-stat-skull">
                <Icon id="skull" />
                {stats.totalDeaths} down
              </span>
              <span className="gj-stat gj-stat-star">
                <Icon id="star" />
                best {stats.bestScore}
              </span>
              <span className="gj-stat gj-stat-clock">
                <Icon id="clock" />
                {formatDuration(stats.totalPlaySeconds)}
              </span>
            </div>

            {/* Co-op lobby (additive — PLAY below works exactly as before
                for solo). Host shows a join code + waiting state; Join takes
                a code; failures fall back here with an inline error. */}
            <div className="gj-coop-section gj-panel gj-panel-cyan">
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

            <div className="gj-settings-section gj-panel">
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

              {/* V4: control-scheme override. "Auto" probes pointer
                  capabilities; the explicit options exist so a misdetected
                  device (hybrid laptop, unusual browser) is never stuck. */}
              <div className="gj-scheme-row">
                <span className="gj-slider-label">Controls</span>
                <div className="gj-scheme-picker">
                  {CONTROL_SCHEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`gj-quality-btn${
                        settings.controlScheme === opt.id ? " gj-quality-btn-active" : ""
                      }`}
                      onClick={() => selectControlScheme(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="gj-scheme-resolved">
                {settings.controlScheme === "auto"
                  ? `Detected: ${desktopControls ? "keyboard & mouse" : "touch"}`
                  : `Forced: ${desktopControls ? "keyboard & mouse" : "touch"}`}
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
              <Icon id="play" />
              PLAY
            </button>
            {/* Control hints follow the resolved scheme: the keyboard map on
                desktop, the original touch list on mobile (unchanged). */}
            {desktopControls ? (
              <div className="gj-controls-help gj-keymap">
                {DESKTOP_KEY_HINTS.map((hint) => (
                  <div key={`${hint.label}-${hint.keys.join()}`}>
                    <Icon id={hint.icon} />
                    <KeyCaps keys={hint.keys} />
                    <span className="gj-keymap-label">{hint.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="gj-controls-help">
                <div>
                  <Icon id="joystick" /> Left thumb — move
                </div>
                <div>
                  <Icon id="drag" /> Right side drag — look / aim
                </div>
                <div>
                  <Icon id="crosshair" /> FIRE — shoot / swing
                </div>
                <div>
                  <Icon id="slots" /> Bottom slots — switch weapons
                </div>
                <div>
                  <Icon id="jump" /> JUMP
                </div>
                <div>
                  <Icon id="wall" /> BUILD — place wall
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* In-game EXIT button: always available while playing, returns to the
          main menu. Hidden once the end screen (which has its own Main Menu
          button) is up.

          Touch only. On desktop it would be permanently unreachable — while
          pointer-locked the cursor is hidden and all mouse events go to the
          canvas, and the moment the lock drops the pause overlay covers the
          screen. The overlay's MAIN MENU button is the desktop equivalent. */}
      {started && !matchEnd && !desktopControls && (
        <button type="button" className="gj-exit-btn" onClick={handleExitToMenu}>
          <Icon id="exit" />
          EXIT
        </button>
      )}

      {/* End screen: shown once the match ends — a death ("defeat") or
          surviving the final-zone countdown ("victory"). Interactive (Main
          Menu / Play Again); there is no auto-respawn. */}
      {started && matchEnd && (
        <div className="gj-match-end">
          <div
            className={`gj-match-end-card gj-panel gj-match-end-${matchEnd.outcome} ${
              matchEnd.outcome === "victory" ? "" : "gj-panel-red"
            }`}
          >
            <div className="gj-match-end-title">
              <Icon id={matchEnd.outcome === "victory" ? "trophy" : "skull"} />
              {matchEnd.outcome === "victory" ? "VICTORY" : "ELIMINATED"}
            </div>
            <div className="gj-match-end-sub">
              {matchEnd.outcome === "victory"
                ? "You survived to the final zone."
                : "You were taken out."}
            </div>
            <div className="gj-match-end-row">
              <span>Kills</span>
              <span>{matchEnd.summary.kills}</span>
            </div>
            <div className="gj-match-end-row">
              <span>Score</span>
              <span>{matchEnd.summary.score}</span>
            </div>
            <div className="gj-match-end-row">
              <span>Survived</span>
              <span>{formatDuration(matchEnd.summary.survivalSeconds)}</span>
            </div>
            <div className="gj-match-end-lifetime">
              Lifetime: {stats.totalKills} kills · {stats.totalDeaths} eliminated · best{" "}
              {stats.bestScore}
            </div>
            <div className="gj-match-end-buttons">
              <button type="button" className="gj-match-end-play" onClick={handleRestart}>
                <Icon id="play" />
                PLAY AGAIN
              </button>
              <button type="button" className="gj-match-end-menu" onClick={handleExitToMenu}>
                <Icon id="menu" />
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop pause overlay (V4 D5). Raised whenever pointer lock is not
          held mid-match — Esc, alt-tab, or before the first click. Esc itself
          is never bound as a key: the browser consumes it to release the lock,
          and that release is what surfaces this. */}
      {started && !matchEnd && desktopControls && paused && (
        <div className="gj-pause-overlay" onClick={handleResume}>
          <div className="gj-pause-card gj-panel gj-panel-cyan">
            <div className="gj-pause-title">
              <Icon id="pause" />
              PAUSED
            </div>
            <div className="gj-pause-sub">Click anywhere to resume</div>
            <div className="gj-pause-keys">
              {DESKTOP_KEY_HINTS.slice(0, 6).map((hint) => (
                <div key={`${hint.label}-${hint.keys.join()}`}>
                  <KeyCaps keys={hint.keys} />
                  <span className="gj-keymap-label">{hint.label}</span>
                </div>
              ))}
            </div>
            <div className="gj-pause-buttons">
              <button type="button" className="gj-match-end-play" onClick={handleResume}>
                <Icon id="play" />
                RESUME
              </button>
              <button
                type="button"
                className="gj-match-end-menu"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExitToMenu();
                }}
              >
                <Icon id="menu" />
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-game only: the start screen now lays out fine in portrait, but the
          dual-thumb touch controls still play best in landscape. Desktop has
          no thumbs to arrange, so the hint is suppressed there entirely. */}
      {started && !matchEnd && !desktopControls && (
        <div className="gj-rotate-hint gj-rotate-visible">
          <Icon id="rotate" />
          <div>Rotate your device to landscape for the best experience</div>
        </div>
      )}

      {/* Branded menu→match transition (C7): a short, self-fading wordmark
          flash. pointer-events: none — never blocks the first input. */}
      {started && introVisible && (
        <div className="gj-match-intro">
          <div className="gj-match-intro-sub">Battle Island</div>
          <div className="gj-match-intro-title">ELRONITE</div>
          <div className="gj-match-intro-bar" />
        </div>
      )}
    </div>
  );
}
