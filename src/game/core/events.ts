// Timed live events (V6). Data-driven so scheduling a new one — or changing
// what an existing one does — is an edit to EVENTS below, not a code change
// anywhere else.
//
// TIMEZONE NOTE: windows are stored as absolute UTC epoch milliseconds, NOT
// as a local wall-clock time. That matters because the game runs in each
// player's own browser: a player in Tel Aviv and one in New York must see the
// event start at the same *instant*, not at 19:30 on their own clocks. The
// authored comment records the Jerusalem wall-clock time the instant maps to;
// resolving the offset once here (rather than at runtime in the client) also
// sidesteps any DST ambiguity on the player's machine.

export interface EventEffects {
  /** Multiplier applied to every score award while the event is live. */
  scoreMultiplier: number;
  /** Multiplier on the delay between airdrops — <1 means crates land more
   *  often (0.4 => roughly 2.5x the usual drop rate). */
  airdropIntervalMultiplier: number;
}

export interface GameEvent {
  id: string;
  /** Short display name, shown on the start screen and the in-game banner. */
  name: string;
  /** One-line description of the perks, shown under the name. */
  blurb: string;
  /** Inclusive start / exclusive end, UTC epoch milliseconds. */
  startsAt: number;
  endsAt: number;
  effects: EventEffects;
}

export const EVENTS: GameEvent[] = [
  {
    id: "golden-hour-2026-08-07",
    name: "GOLDEN HOUR",
    blurb: "Double score · rapid airdrops",
    // 2026-08-07 19:30–20:30 Asia/Jerusalem (IDT, UTC+3)
    //   = 2026-08-07 16:30–17:30 UTC
    startsAt: 1786120200000,
    endsAt: 1786123800000,
    effects: {
      scoreMultiplier: 2,
      airdropIntervalMultiplier: 0.4,
    },
  },
];

/** Neutral effects used whenever no event is live — every multiplier is 1, so
 *  the normal game is exactly the pre-event game (no special-casing at the
 *  call sites, they just always multiply). */
export const NO_EVENT_EFFECTS: EventEffects = {
  scoreMultiplier: 1,
  airdropIntervalMultiplier: 1,
};

/** The event live at `now` (defaults to the real clock), or null. */
export function activeEvent(now: number = Date.now()): GameEvent | null {
  for (const e of EVENTS) {
    if (now >= e.startsAt && now < e.endsAt) return e;
  }
  return null;
}

/** The soonest event that hasn't started yet, or null — drives the "starts
 *  in…" teaser on the start screen. */
export function upcomingEvent(now: number = Date.now()): GameEvent | null {
  let soonest: GameEvent | null = null;
  for (const e of EVENTS) {
    if (e.startsAt > now && (!soonest || e.startsAt < soonest.startsAt)) soonest = e;
  }
  return soonest;
}

/** Effects for the currently-live event, or the neutral set. */
export function activeEffects(now: number = Date.now()): EventEffects {
  return activeEvent(now)?.effects ?? NO_EVENT_EFFECTS;
}

/** "12:34" / "1:02:03" — countdown formatting for the HUD banner. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}
