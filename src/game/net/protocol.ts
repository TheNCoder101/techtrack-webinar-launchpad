// Co-op wire protocol — the complete set of game-level messages exchanged
// between peers. Small, JSON-serialized (the DataConnections are opened with
// `serialization: "json"`), and versioned via the `t` discriminant field: a
// future protocol revision adds new `t` values rather than mutating these
// shapes, so an old client simply ignores message kinds it doesn't know.
//
// Authority model (see NetManager/BotManager): every peer is authoritative
// over its OWN player transform (`state`); the host is the sole authority
// over bot AI and bot HP (`bot_state`), with joiners feeding their local
// raycast hits back to the host as `bot_hit` requests.

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
  weaponSlot: number;
  firing: boolean;
  dead: boolean;
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

export type NetMessage =
  | PeerStateMessage
  | BotStateMessage
  | BotHitMessage
  | KillFeedMessage;

/** How often every peer broadcasts its own `state`. */
export const STATE_SEND_HZ = 15;
/** How often the host broadcasts `bot_state`. */
export const BOT_STATE_SEND_HZ = 10;
