# Island Strike

A free-roam, low-poly battle-island shooter built to run straight from a mobile
browser (tested against iPhone 14 Pro / Mobile Safari). Built with
Vite + React + TypeScript + three.js — no native app, no asset downloads,
just open the page and tap **PLAY**.

## Gameplay (v1)

- **Free roam** a procedurally generated island (hills, beaches, forests, rock
  outcrops) with a third-person camera.
- **Default weapon**: a hitscan blaster with a clip, reserve ammo, auto-reload
  and tracer/muzzle-flash feedback.
- **Harvest** trees and rocks (shoot them) for wood/stone materials.
- **Build**: spend materials to drop a defensive wall, snapped to a neat
  facing in front of you.
- **Enemies**: wandering bots that aggro and melee you at close range — shoot
  them for score, they respawn after a short delay.
- Health, minimap radar, hit markers, damage flash and a respawn loop.

## Controls (touch-only, designed for phones)

- Left thumb: virtual joystick — move (magnitude controls walk vs. sprint).
- Right side: drag to look/aim (crosshair is screen-center; whatever you're
  aiming at is what FIRE hits, be it an enemy, a tree, or terrain).
- **FIRE** — shoot (also harvests trees/rocks when aimed at them).
- **JUMP**
- **BUILD** — place a wall (costs materials).

## Development

```sh
npm i
npm run dev      # local dev server
npm run build    # production build
npm run preview  # serve the production build
```

## Architecture

All game code lives under `src/game/`, kept deliberately framework-light so
the render loop stays smooth on mobile GPUs:

- `game/world` — procedural terrain (hand-rolled value noise), sky, water,
  prop scattering (trees/rocks/crates/shacks).
- `game/entities` — player controller + third-person camera rig, bot AI.
- `game/weapons` — hitscan blaster, GPU particle system (single draw call).
- `game/building` — wall placement.
- `game/core` — the `Game` orchestrator/render loop, touch `InputManager`,
  procedural `AudioManager` (WebAudio oscillators, no audio assets).
- `game/ui` — DOM-based HUD, updated imperatively every frame (no React
  re-renders in the hot path).

Performance choices for mobile: no shadow maps (cheap fake blob shadows
instead), shared geometries/materials across scattered props, fog-limited
draw distance, capped device pixel ratio, and a single draw call for all
particle effects.
