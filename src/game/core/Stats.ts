// Lifetime progression ledger, persisted to localStorage under its own key
// and following the exact load/validate/save idiom used for game settings
// (see Settings.ts / "elronite-settings"): parse defensively, validate every
// field, and fall back to defaults on anything malformed.

export interface LifetimeStats {
  /** Total bots eliminated across all sessions. */
  totalKills: number;
  /** Total times the player has been eliminated across all sessions. */
  totalDeaths: number;
  /** Best score earned in a single life (score resets are per-life for this). */
  bestScore: number;
  /** Rough cumulative in-game playtime, in seconds. */
  totalPlaySeconds: number;
}

export const DEFAULT_STATS: LifetimeStats = {
  totalKills: 0,
  totalDeaths: 0,
  bestScore: 0,
  totalPlaySeconds: 0,
};

const STATS_STORAGE_KEY = "elronite-stats";

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Loads the persisted lifetime stats from localStorage, falling back to
 *  zeroed defaults if nothing is stored or the stored value fails to
 *  parse/validate. */
export function loadStats(): LifetimeStats {
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw) as Partial<LifetimeStats>;
    return {
      totalKills: isNonNegativeNumber(parsed.totalKills) ? parsed.totalKills : 0,
      totalDeaths: isNonNegativeNumber(parsed.totalDeaths) ? parsed.totalDeaths : 0,
      bestScore: isNonNegativeNumber(parsed.bestScore) ? parsed.bestScore : 0,
      totalPlaySeconds: isNonNegativeNumber(parsed.totalPlaySeconds)
        ? parsed.totalPlaySeconds
        : 0,
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function saveStats(stats: LifetimeStats): void {
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
}
