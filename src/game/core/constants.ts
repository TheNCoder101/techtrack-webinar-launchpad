// Core tunables for the game. Kept in one place so mobile perf/feel can be tuned quickly.

export const WORLD_RADIUS = 150;
export const GRAVITY = 24;

export const PLAYER_RADIUS = 0.5;
export const PLAYER_EYE_HEIGHT = 1.55;
export const PLAYER_WALK_SPEED = 6.2;
export const PLAYER_SPRINT_MULT = 1.55;
export const PLAYER_JUMP_SPEED = 8.2;

export const CAMERA_DISTANCE = 5.5;
export const CAMERA_HEIGHT = 1.1;
export const CAMERA_MIN_PITCH = -1.15; // radians, looking down
export const CAMERA_MAX_PITCH = 1.05; // radians, looking up

export const LOOK_SENSITIVITY = 2.6;

export const WEAPON_RANGE = 90;
export const WEAPON_DAMAGE = 22;
export const WEAPON_CLIP_SIZE = 30;
export const WEAPON_FIRE_RATE = 7; // shots per second while held
export const WEAPON_RELOAD_TIME = 1.35;
export const WEAPON_RESERVE_MAX = 150;
export const WEAPON_RESERVE_REGEN = 2; // ammo per second, arcade-friendly so the demo never dead-ends

export const HARVEST_YIELD = 6;
export const HARVEST_RANGE = 90;
export const WALL_COST = 20;
export const WALL_MAX_COUNT = 14;

export const BOT_COUNT = 7;
export const BOT_MAX_HP = 45;
export const BOT_WANDER_SPEED = 2.1;
export const BOT_RESPAWN_TIME = 6;

export const TREE_COUNT = 46;
export const ROCK_COUNT = 28;
export const CRATE_COUNT = 10;
