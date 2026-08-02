// Co-op wire protocol — the complete set of game-level messages exchanged
// between peers. Small, JSON-serialized (the DataConnections are opened with
// `serialization: "json"`), and versioned via the `t` discriminant field: a
// future protocol revision adds new `t` values rather than mutating these
// shapes, so an old client simply ignores message kinds it doesn't know.
//
// Authority model (see NetManager/BotManager): every peer is authoritative
// over its OWN player transform (`state`); the host is the sole authority
// over bot AI and bot HP (`bot_state`) AND over bot-vs-player damage (bots
// only ever run AI on the host — see Bot/BotManager's `authoritative` flag),
// with joiners feeding their local raycast hits back to the host as
// `bot_hit` requests and the host telling a peer it took bot damage via
// `player_hit`.

import type { WeaponId } from "../weapons/weaponDefs";

/** Per-player transform + vitals, sent by every peer at ~15-20 Hz over the
 *  unreliable channel. `seq` lets receivers drop out-of-order packets. */
export interface PeerStateMessage {
  t: "state";
  seq: number;
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  hp: number;
  skinId: string;
  /** The peer's actual equipped weapon (V5 F1) — a plain slot index isn't
   *  enough for a receiver to know which gun to show: slots 0/1 are fixed
   *  (pickaxe/blaster) but slots 2-5 hold whatever airdrops that peer
   *  personally picked up, which is per-peer inventory state never
   *  otherwise transmitted. */
  weaponId: WeaponId;
  firing: boolean;
  dead: boolean;
  /** Monotonic shots/swings-taken counter (V5 F1) — see
   *  WeaponSystem.shotsFired. Receivers diff Δshots instead of sampling
   *  `firing` at 15Hz, so a rapid burst of taps between samples still
   *  produces exactly that many tracer/swing events on every other peer. */
  shots: number;
}

/** One bot's authoritative snapshot inside a `bot_state` broadcast. */
export interface BotNetState {
  id: number;
  pos: [number, number, number];
  yaw: number;
  hp: number;
  alive: boolean;
}

/** Host-only broadcast of every bot's authoritative state, ~10 Hz. */
export interface BotStateMessage {
  t: "bot_state";
  bots: BotNetState[];
}

/** Joiner -> host: "my local raycast landed on this bot". The host applies
 *  it via BotManager.damage and the next `bot_state` broadcast is the source
 *  of truth back. `hitId` is a per-sender monotonic counter so the host can
 *  deduplicate the 3x redundant sends of this stateful event. */
export interface BotHitMessage {
  t: "bot_hit";
  botId: number;
  damage: number;
  hitId: number;
}

/** Host broadcast crediting a bot kill to a peer, for score/HUD sync. */
export interface KillFeedMessage {
  t: "kill_feed";
  peerId: string;
  botId: number;
}

/** Host -> a specific peer (V5 F3a): "a bot just hit YOUR player." Bots only
 *  ever run AI on the host, so only the host can know a bot's attack landed
 *  on a remote player — this is how that peer learns to apply the damage
 *  locally (through the normal Player.takeDamage path, so the hurt
 *  flash/shake/audio and the D2 damage-direction indicator all just work).
 *  Sent via NetManager.sendTo (not broadcast) with `redundant: true`, same
 *  idiom as BotHitMessage; `hitId` is the same per-sender monotonic dedupe
 *  counter pattern. `botPos` is the attacking bot's position, so the
 *  receiver can compute its own bearing-to-source for the direction
 *  indicator exactly like a local hit does. */
export interface PlayerHitMessage {
  t: "player_hit";
  peerId: string;
  damage: number;
  botPos: [number, number, number];
  hitId: number;
}

export type NetMessage =
  | PeerStateMessage
  | BotStateMessage
  | BotHitMessage
  | KillFeedMessage
  | PlayerHitMessage;

/** How often every peer broadcasts its own `state`. */
export const STATE_SEND_HZ = 15;
/** How often the host broadcasts `bot_state`. */
export const BOT_STATE_SEND_HZ = 10;
