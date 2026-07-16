import Peer, { type DataConnection, type PeerOptions } from "peerjs";
import type { NetMessage } from "./protocol";

// Wraps a peerjs Peer for 2-4 player casual co-op. The broker (signaling
// server) is only involved in the SDP/ICE handshake — every game message
// after that travels directly peer-to-peer over an unreliable RTCDataChannel
// (`reliable: false`, JSON serialization). Real-time transform sync doesn't
// need delivery guarantees, and the few stateful events (bot_hit/kill_feed)
// get cheap idempotent redundancy — sent 3x on a 100ms stagger, deduplicated
// by the receiver — rather than a second reliable channel, keeping this to
// exactly one connection type per peer pair.
//
// Topology: full mesh. Joiners dial the host by join code; the host then
// tells each newcomer which other joiners already exist (the internal
// "__peers" control message below, which never surfaces through onMessage)
// and the newcomer dials them directly. Only the newcomer ever initiates,
// so no two peers ever dial each other simultaneously.

/** Test/dev-only broker override. Production code paths never construct one
 *  of these — omitting it (the default) uses the public PeerJS cloud broker.
 *  Only the Playwright verification harness passes an override, pointing at
 *  a locally-run `npx peerjs` signaling server. */
export interface BrokerOverride {
  host: string;
  port: number;
  path?: string;
  secure?: boolean;
}

/** NetManager-internal mesh bootstrap message (host -> newly joined peer:
 *  "these other joiners already exist, dial them"). Consumed inside
 *  NetManager and never delivered to onMessage — the game-level protocol
 *  stays exactly the shapes in protocol.ts. */
interface PeerListMessage {
  t: "__peers";
  ids: string[];
}

const PEER_ID_PREFIX = "elronite-";
const JOIN_CODE_LENGTH = 4;
const CONNECT_TIMEOUT_MS = 15000;
const REDUNDANT_RESENDS = 2; // initial send + 2 resends = 3 total
const REDUNDANT_STAGGER_MS = 100;

function randomJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 36).toString(36);
  }
  return code;
}

export class NetManager {
  /** Fixed by which of host()/join() was called. The host is the sole
   *  BotManager authority — see the authoritative flag on BotManager. */
  isHost = false;
  /** This peer's broker ID; set once host()/join() has opened the Peer. */
  myId: string | null = null;
  /** For joiners: the host's peer ID (bot_hit messages go here). */
  hostId: string | null = null;

  // Same optional-callback idiom as BotManager.onKill / Player.onDamaged.
  onPeerJoined?: (peerId: string) => void;
  onPeerLeft?: (peerId: string) => void;
  onMessage?: (peerId: string, msg: NetMessage) => void;

  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private redundantTimers = new Set<ReturnType<typeof setTimeout>>();
  private disposed = false;

  /** `broker` is a test/dev-only override — see BrokerOverride. Left
   *  undefined (the production path), peerjs talks to its public cloud
   *  broker with zero custom host/port config. */
  constructor(private broker?: BrokerOverride) {}

  get peerCount(): number {
    return this.conns.size;
  }

  /** Creates this peer with a short join-code ID and resolves with the code
   *  once the broker accepts it. Collisions on 4 base36 chars are acceptable
   *  for casual use (the broker rejects a taken ID and this rejects too). */
  host(): Promise<string> {
    this.isHost = true;
    const code = randomJoinCode();
    const peer = this.createPeer(PEER_ID_PREFIX + code);
    this.peer = peer;
    return this.awaitOpen(peer).then(() => {
      peer.on("connection", (conn) => this.adoptConnection(conn));
      return code;
    });
  }

  /** Connects to the host identified by `code`. Resolves once the direct
   *  DataConnection to the host is open; rejects on bad code / unreachable
   *  broker / timeout (the caller shows an inline error, never a crash). */
  join(code: string): Promise<void> {
    this.isHost = false;
    const hostPeerId = PEER_ID_PREFIX + code.trim().toLowerCase();
    const peer = this.createPeer();
    this.peer = peer;
    return this.awaitOpen(peer).then(() => {
      // Later joiners dial us directly (mesh) — accept their connections.
      peer.on("connection", (conn) => this.adoptConnection(conn));
      this.hostId = hostPeerId;
      return this.dial(hostPeerId).then(() => undefined);
    });
  }

  /** Sends to every connected peer. `redundant` adds the 3x/100ms stagger
   *  for infrequent stateful events — receivers must deduplicate. */
  broadcast(msg: NetMessage, opts?: { redundant?: boolean }): void {
    for (const conn of this.conns.values()) {
      this.sendOn(conn, msg, opts?.redundant ?? false);
    }
  }

  sendTo(peerId: string, msg: NetMessage, opts?: { redundant?: boolean }): void {
    const conn = this.conns.get(peerId);
    if (conn) this.sendOn(conn, msg, opts?.redundant ?? false);
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.redundantTimers) clearTimeout(timer);
    this.redundantTimers.clear();
    for (const conn of this.conns.values()) conn.close();
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
  }

  private createPeer(id?: string): Peer {
    // Production: no options object at all -> peerjs's built-in default, the
    // public cloud broker. The host/port override below exists ONLY for the
    // local-signaling-server test harness (see BrokerOverride).
    const opts: PeerOptions | undefined = this.broker
      ? {
          host: this.broker.host,
          port: this.broker.port,
          path: this.broker.path ?? "/",
          secure: this.broker.secure ?? false,
        }
      : undefined;
    if (id !== undefined) return new Peer(id, opts);
    return opts ? new Peer(opts) : new Peer();
  }

  /** Resolves when the broker accepts this peer (the 'open' event); rejects
   *  on the first pre-open error (broker unreachable, ID taken, ...). */
  private awaitOpen(peer: Peer): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out reaching the co-op broker")), CONNECT_TIMEOUT_MS);
      peer.once("open", (id) => {
        clearTimeout(timeout);
        this.myId = id;
        resolve();
      });
      peer.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /** Outgoing connection (joiner -> host, or joiner -> existing joiner from
   *  the __peers mesh bootstrap). Resolves when the channel is open. */
  private dial(peerId: string): Promise<void> {
    const peer = this.peer;
    if (!peer) return Promise.reject(new Error("NetManager has no active Peer"));
    return new Promise((resolve, reject) => {
      const conn = peer.connect(peerId, { reliable: false, serialization: "json" });
      const timeout = setTimeout(() => {
        conn.close();
        reject(new Error("Timed out connecting to peer"));
      }, CONNECT_TIMEOUT_MS);
      conn.once("open", () => {
        clearTimeout(timeout);
        this.register(conn);
        resolve();
      });
      conn.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      // A bad join code surfaces as a peer-level "peer-unavailable" error,
      // not a connection-level one — reject on that too so the start-screen
      // error path fires instead of hanging until the timeout.
      peer.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /** Incoming connection — register once its channel opens. */
  private adoptConnection(conn: DataConnection): void {
    conn.once("open", () => {
      if (this.disposed) {
        conn.close();
        return;
      }
      this.register(conn);
    });
  }

  private register(conn: DataConnection): void {
    const peerId = conn.peer;
    // Host side: tell the newcomer which other joiners already exist so it
    // can complete the mesh (newcomer always dials, never the existing peer).
    if (this.isHost) {
      const others = [...this.conns.keys()].filter((id) => id !== peerId);
      if (others.length > 0) {
        const msg: PeerListMessage = { t: "__peers", ids: others };
        conn.send(msg);
      }
    }
    this.conns.set(peerId, conn);
    conn.on("data", (data) => {
      // An ICE "disconnected" (below) sometimes recovers — if data flows
      // again on a connection we dropped, quietly re-adopt the peer.
      if (!this.conns.has(peerId) && conn.open && !this.disposed) {
        this.conns.set(peerId, conn);
        this.onPeerJoined?.(peerId);
      }
      this.handleData(peerId, data);
    });
    conn.on("close", () => this.dropPeer(peerId));
    conn.on("error", () => this.dropPeer(peerId));
    // An abruptly killed peer (tab closed, app backgrounded to death) never
    // sends a clean datachannel close — ICE state is the only timely signal.
    // "disconnected" may recover; the data handler above re-adopts if it does.
    conn.on("iceStateChanged", (state) => {
      if (state === "failed" || state === "closed" || state === "disconnected") {
        this.dropPeer(peerId);
      }
    });
    this.onPeerJoined?.(peerId);
  }

  private dropPeer(peerId: string): void {
    if (this.conns.delete(peerId)) {
      this.onPeerLeft?.(peerId);
    }
  }

  private handleData(peerId: string, data: unknown): void {
    if (typeof data !== "object" || data === null) return;
    const msg = data as { t?: unknown };
    if (typeof msg.t !== "string") return;

    if (msg.t === "__peers") {
      // Internal mesh bootstrap — dial each already-present joiner. Failures
      // are non-fatal (that peer may have just left); never surfaced upward.
      if (!this.isHost) {
        for (const id of (msg as PeerListMessage).ids) {
          if (id !== this.myId && !this.conns.has(id)) {
            this.dial(id).catch((err) => {
              console.warn("Co-op mesh dial to existing peer failed", id, err);
            });
          }
        }
      }
      return;
    }

    this.onMessage?.(peerId, msg as NetMessage);
  }

  private sendOn(conn: DataConnection, msg: NetMessage, redundant: boolean): void {
    this.trySend(conn, msg);
    if (!redundant) return;
    for (let i = 1; i <= REDUNDANT_RESENDS; i++) {
      const timer = setTimeout(() => {
        this.redundantTimers.delete(timer);
        this.trySend(conn, msg);
      }, i * REDUNDANT_STAGGER_MS);
      this.redundantTimers.add(timer);
    }
  }

  private trySend(conn: DataConnection, msg: NetMessage): void {
    if (!conn.open) return;
    try {
      conn.send(msg);
    } catch (err) {
      // Unreliable-channel sends can race a closing connection; losing one
      // packet is within this channel's contract.
      console.warn("Co-op send failed", err);
    }
  }
}
