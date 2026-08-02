# V5 — Co-op Bug Repair ✅ done (9204f90)

**Shipped:** F1 (RemotePlayer rebuilt on `createPlayerMesh()` so puppets carry
real gun geometry; `PeerStateMessage.weaponSlot` — never read — replaced with
`weaponId`; a monotonic `shotsFired` counter added to `WeaponSystem` and
diffed on receipt so no shot is lost between 15Hz samples, with a first-sight
baseline so a newly-seen peer doesn't dump their whole shot history as a
tracer flood), F2a (`teardownGame({ keepNet: true })` for "Play Again";
`stateSeq` reseeded from `performance.now()` on restart — a second latent bug
the implementing agent found unprompted, since a reset-to-0 counter would
have made every peer's dedupe watermark reject the restarted peer's
broadcasts for a long stretch), F2b (mulberry32 PRNG seeded from the co-op
join code — both peers already know it, so zero new protocol messages —
threaded through all ~29 `Math.random()` calls in world/prop generation; solo
keeps `Math.random()` directly as the default `RandFn`, so single-player
variety is untouched), F3a (`Bot.update` now takes every player's position —
host plus each live `RemotePlayer` — and the nearest one; a new
`player_hit` message, same `redundant: true`/dedupe idiom as `bot_hit`, so a
host-side bot hit on a remote peer reaches that peer's own health).

**F0 finding, worth recording plainly:** the agent's own instrumented 2-peer
repro for "bots not damaged" initially reproduced the symptom — then, by
reproducing the *identical* pattern in solo play with zero networking
involved, proved it was a test-harness artifact (the third-person camera
lerps toward the player for ~1s after a debug-hook teleport, so early shots
in the repro were aimed at where the bot *used to appear*), not a real
network defect. Bot-hit delivery itself measured 0 drops across every
sampled run. The residual symptom is fully explained by F3a (bots never
targeting joiners at all) — no separate mechanical bug existed.

**Independently re-verified** with a fresh 2-peer run (local `npx peer`
signaling server + two Playwright contexts, real join-code flow through the
actual co-op UI — not the agent's own test code): worlds byte-identical (102
colliders each, identical 15-item position/radius sample); joiner's puppet
of the host carries 52 meshes (vs. ~7 for the pre-fix bare-humanoid puppet),
confirming real gun geometry; a forced 5-shot burst on the host produced
`lastPeerShots` reading exactly `5` on the joiner; with the host player moved
140 units away, bots nudged near the joiner still measurably damaged them
(100 → 5 HP) — proving multi-target selection, not host-position bias;
"Play Again" on the host left `net.peerCount` unchanged (1 → 1) across the
restart. Own `tsc`/build clean. Zero console errors across the whole run.

Three bugs reported from real 2-player testing:
1. You can't see other players **shooting** — only moving.
2. On respawn/restart, a co-op player **loses sight of others / spawns in another world**.
3. Co-op gameplay differs from solo — **bots don't hurt you the same**, and **some bots aren't damaged and stay stuck**.

## Audit — what I confirmed in the code

### CONFIRMED root causes

**B1 — remote players never show weapons or fire.** `PeerStateMessage`
carries `firing` and `weaponSlot`, and `Game.ts` broadcasts them 15×/sec —
but **`RemotePlayer.ts` reads neither** (grep: zero references). Worse,
`RemotePlayer` is built from bare `buildHumanoid()`, not `createPlayerMesh()`,
so a remote player **has no gun mesh at all** — there is nothing to pose, no
muzzle flash, and no tracer. The data arrives and is thrown away.

**B2a — "Play Again" silently drops you into a solo world.**
`handleRestart` → `teardownGame()` → `netRef.current?.dispose(); netRef.current
= null` → then `handlePlay()` builds `new Game(..., netRef.current ?? undefined)`
= **`undefined`**. Every co-op code path is skipped, so you restart alone.
This exactly matches "lose visibility to other players."

**B2b — peers generate *different islands*.** There is **no seed system**:
29 `Math.random()` calls across `World.ts` prop scatter and `props.ts`
layouts, and zero PRNG/seed plumbing anywhere in `world/`, `net/` or
`Game.ts`. The terrain heightfield is deterministic (`terrainHeight(x,z)`
noise), so the ground matches — but **every tree, rock, crate and shack is in
a different place on each peer**, along with their colliders. Players walk
through trees that don't exist on the other screen, and bot line-of-sight
checks disagree. This is the deeper half of "spawns in another world."

**B3a — bots only ever target the local player.** `Game.ts` calls
`botManager.update(dt, nowSec, world, this.player.position, ...)` — a single
position, the *local* one. On the host that's the host's player, and the host
is the only peer running bot AI. **Joiners are therefore never chased or
attacked by anything.** (This was a known, documented limitation from the
original co-op work, never resolved.) On a joiner's screen bots pursue a host
who may be far away, which reads exactly as "bots ignore me / behave
differently / stand around."

**B3b — a bot that never receives state freezes permanently.**
`Bot.updateNonAuthoritative` early-returns while `!hasNetState`, so any
joiner-side bot that misses its first `bot_state` entry stands still forever.

### Deliberately RULED OUT (so the repair doesn't chase them)

I tested three plausible theories and **disproved** them — worth recording so
nobody re-investigates:
- *Stale raycast cache vs. lazy joiner bot creation* — the lazy path in
  `BotManager.applyBotState` correctly pushes new bot meshes into
  `raycastTargets` **and** sets `world.raycastTargetsDirty = true`.
- *Lost joiner damage messages* — `bot_hit` is already sent with
  `{ redundant: true }` (3× staggered) with receive-side dedupe.
- *Bot roster size mismatch from per-peer quality tier* — the
  non-authoritative `BotManager` constructor early-returns before creating any
  bots (`if (!authoritative) return`), so the roster is host-driven, not
  local-tier-driven.

### NOT yet root-caused — needs live 2-peer reproduction

The residual **"some bots are not damaged"** symptom. The three mechanical
explanations above are ruled out, and B3a plausibly accounts for the
*perception* (bots pursuing the host look unresponsive), but I will not claim
a root cause I haven't proven. Step 1 of the repair is an instrumented 2-peer
repro, not a speculative fix.

---

## Repair plan

### F0 — Instrumented 2-peer repro (do this first)
Stand up the local-signaling harness this project already uses (`npx peerjs`
server + two Playwright browser contexts, per the co-op verification work) and
add temporary DEV-only counters for: `bot_hit` sent / received / applied,
`bot_state` entries received per bot id, and per-bot `hasNetState`. Reproduce
"bot won't take damage" and identify it precisely **before** writing F3's fix.
Remove the instrumentation before committing.

### F1 — See other players shoot
- Build `RemotePlayer` from `createPlayerMesh()` so it has the real gun/pickaxe
  meshes, and drive `setActiveWeaponVisual(...)` from the **already-transmitted
  `weaponSlot`** field.
- Consume `firing`: drive the existing `updateWeaponPose(dt, firing)` aim pose.
- **Add a monotonic `shots: number` counter to `PeerStateMessage`.** Relying on
  the boolean `firing` sampled at 15 Hz will silently miss semi-auto taps
  between samples; a counter lets the receiver spawn exactly `Δshots` tracers
  and never miss one. Reuse `Game.spawnBotTracer`'s existing tracer/particle
  path for the visual, and the muzzle-flash particle burst already used locally.

### F2 — Restart and world consistency
- **F2a:** stop tearing down the net on restart. Give `teardownGame` a
  `keepNet` option (or a sibling function) so `handleRestart` preserves
  `netRef` while `handleExitToMenu` still disposes it. Re-registering
  `net.onMessage`/`onPeerLeft` on the new `Game` is safe — they're
  single-slot assignments that overwrite.
- **F2b:** make world generation deterministic and shared. Add a small seeded
  PRNG (mulberry32, ~5 lines) and thread a `rand()` through `World`'s scatter
  functions and `props.ts`'s layout helpers, replacing `Math.random()`.
  **Derive the seed from the co-op join code**, which both peers already know —
  this needs *no* protocol message and *no* handshake ordering, sidestepping
  the fact that peers construct their `World` at different times. Solo play
  keeps a random seed so single-player variety is unchanged.

### F3 — Bots behave the same for everyone
- **F3a:** bots must consider **all** players. Pass the host's player plus
  every `RemotePlayer` position into `botManager.update(...)`, and have
  `Bot.update` chase/attack the **nearest** one. Since only the host simulates
  bots, when a bot hits a *remote* player the host must tell that peer:
  add a `player_hit { peerId, damage }` message, sent `redundant: true` like
  the other stateful events, applied on receipt via the normal
  `takeDamage` path so the existing damage-direction indicator and hurt
  feedback work.
- **F3b:** harden the frozen-bot case — on first `bot_state` sighting always
  snap the bot to the broadcast transform (already done) and make sure a bot
  that somehow lacks state is not left invisible-but-solid; prefer hiding it
  until state arrives over leaving a frozen, unshootable body in the world.
- **F3c:** fix whatever F0 actually uncovers.

---

## Sequencing — important

**Do not start this until the in-flight V4 desktop-controls work is merged.**
V4 is editing `Game.ts`, `GamePage.tsx` and `types.ts`; F1/F2a/F3a touch the
same files and would collide. Order: land V4 → then this repair as one
worktree iteration.

## Verification
- `npx tsc --noEmit && npm run build` clean.
- **Two-peer harness (mandatory — this is a co-op repair; solo tests prove
  nothing here):** local `npx peerjs` signaling + two browser contexts.
  - **B1:** peer A fires; assert peer B *sees* a tracer/muzzle flash and A's
    gun mesh, and that a rapid burst of N taps produces N tracers (proves the
    `shots` counter beats 15 Hz boolean sampling).
  - **B2a:** peer dies → Play Again → assert `net` is still connected, peer
    count unchanged, and both peers still see each other's puppets.
  - **B2b:** assert both peers' worlds match — compare collider counts and a
    sample of prop positions across the two contexts; they must be identical.
  - **B3a:** place a joiner alone near bots with the host far away; assert
    bots actually chase and damage the joiner (health drops), and that the
    joiner's damage-direction indicator fires.
  - **B3c:** re-run the F0 repro and assert it's fixed.
- **Solo non-regression:** confirm solo still constructs no `NetManager`,
  world variety still randomizes between solo matches, and bots behave as
  before.
- Zero console errors across every run.
