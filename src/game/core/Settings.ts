// Data-driven quality-tier system, following the same Record<Id, Def> idiom
// used for weapons (see weapons/weaponDefs.ts). Kept in one place so mobile
// perf tuning stays a data edit rather than a code change.

export type QualityTier = "low" | "medium" | "high";

export interface QualitySettings {
  /** Hard cap applied to window.devicePixelRatio when sizing the renderer. */
  pixelRatioCap: number;
  /** Max simultaneous particles the ParticleSystem pool allocates. */
  particlePoolSize: number;
  /** Terrain PlaneGeometry subdivisions per side. */
  terrainSegments: number;
  /** Max distance (world units) at which props are considered for rendering. */
  propDrawDistance: number;
  /** Whether real shadow mapping (player-following sun frustum) is enabled.
   *  Fully implemented (see World.setSunShadows / Game.applyQualityFeatures),
   *  but intentionally `false` for EVERY tier in this shipped version: it can
   *  only be safely defaulted on after frame-time verification on a real
   *  iPhone, which desktop/Playwright testing cannot certify. Flip per-tier
   *  once on-device numbers are in. */
  shadows: boolean;
  /** Shadow map resolution (per side) used when `shadows` is true. */
  shadowMapSize: number;
  /** Whether the EffectComposer post pipeline (SMAA + selective bloom on
   *  muzzle flash/tracers) is enabled. Fully implemented (see core/postfx.ts,
   *  lazily import()-ed), but intentionally `false` for EVERY tier pending
   *  the same on-device verification as `shadows` above. */
  postFX: boolean;
}

export const QUALITY_TIERS: Record<QualityTier, QualitySettings> = {
  low: {
    pixelRatioCap: 1,
    particlePoolSize: 80,
    terrainSegments: 80,
    propDrawDistance: 90,
    shadows: false,
    shadowMapSize: 1024,
    postFX: false,
  },
  medium: {
    pixelRatioCap: 1.5,
    particlePoolSize: 150,
    terrainSegments: 110,
    propDrawDistance: 150,
    shadows: false,
    shadowMapSize: 1024,
    postFX: false,
  },
  high: {
    pixelRatioCap: 2,
    particlePoolSize: 220,
    terrainSegments: 140,
    propDrawDistance: 220,
    // shadows/postFX intentionally false even on "high" — the code paths are
    // complete but stay dark until real-iPhone frame-time verification (see
    // the QualitySettings field docs above).
    shadows: false,
    shadowMapSize: 2048,
    postFX: false,
  },
};

export interface GameSettings {
  qualityTier: QualityTier;
  /** Multiplier applied on top of the base LOOK_SENSITIVITY constant. */
  lookSensitivity: number;
  /** 0-1 master SFX volume. */
  sfxVolume: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  qualityTier: "medium",
  lookSensitivity: 1.0,
  sfxVolume: 1.0,
};

const SETTINGS_STORAGE_KEY = "elronite-settings";
// Separate bookkeeping key (not part of the persisted GameSettings shape)
// tracking whether the player has ever explicitly chosen a quality tier via
// the settings UI, vs. it just sitting at the untouched default. The
// auto-downgrade perf check (Game.ts) only fires when this is false.
const QUALITY_EXPLICIT_KEY = "elronite-settings-quality-explicit";

function isQualityTier(value: unknown): value is QualityTier {
  return value === "low" || value === "medium" || value === "high";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Loads persisted settings from localStorage, falling back to defaults if
 *  nothing is stored or the stored value fails to parse/validate. */
export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      qualityTier: isQualityTier(parsed.qualityTier) ? parsed.qualityTier : DEFAULT_SETTINGS.qualityTier,
      lookSensitivity: isFiniteNumber(parsed.lookSensitivity)
        ? parsed.lookSensitivity
        : DEFAULT_SETTINGS.lookSensitivity,
      sfxVolume: isFiniteNumber(parsed.sfxVolume) ? parsed.sfxVolume : DEFAULT_SETTINGS.sfxVolume,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

/** True once the player has explicitly picked a quality tier from the UI. */
export function hasExplicitQualityChoice(): boolean {
  return localStorage.getItem(QUALITY_EXPLICIT_KEY) === "1";
}

export function markQualityTierExplicit(): void {
  localStorage.setItem(QUALITY_EXPLICIT_KEY, "1");
}
