import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "@/game/core/Game";
import { InputManager } from "@/game/core/InputManager";
import { HUDController } from "@/game/ui/HUDController";
import "@/game/ui/hud.css";

export default function GamePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gameRef = useRef<Game | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const hudRef = useRef<HUDController | null>(null);

  const [started, setStarted] = useState(false);

  const handlePlay = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || gameRef.current) return;

    const input = new InputManager(container);
    const hud = new HUDController(container);
    const game = new Game(canvas, input, hud);

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
  }, []);

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
          <div className="gj-title">ISLAND STRIKE</div>
          <div className="gj-subtitle">
            Free-roam a low-poly battle island. Harvest wood &amp; stone, blast wandering
            raiders, and drop defensive walls to survive.
          </div>
          <button className="gj-play-btn" onClick={handlePlay}>
            ▶ PLAY
          </button>
          <div className="gj-controls-help">
            <div>🕹️ Left thumb — move</div>
            <div>👉 Right side drag — look / aim</div>
            <div>🔫 FIRE — shoot / harvest</div>
            <div>⬆️ JUMP</div>
            <div>🧱 BUILD — place wall</div>
          </div>
        </div>
      )}

      <div className="gj-rotate-hint gj-rotate-visible">
        <div style={{ fontSize: 40 }}>🔄</div>
        <div>Rotate your device to landscape for the best experience</div>
      </div>
    </div>
  );
}
