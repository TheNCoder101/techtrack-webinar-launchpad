// ElroNite icon set — the game's single icon language (V3 Track C3).
//
// Every glyph that used to be an emoji now comes from here, so the HUD, the
// imperative DOM bars (WeaponBar/BuildPieceBar) and the React start/end
// screens all draw from one source of truth and render identically on every
// platform (emoji never did).
//
// Design language: 24×24 grid, 2px stroke, round caps/joins, `currentColor`
// so CSS owns the tint. A few glyphs use small solid fills (play triangle,
// skull eyes, rocket nose) as deliberate accents — everything else is line
// work at the same weight so the set reads as one family.
//
// This module is dependency-free on purpose: it is imported both by React
// components (via dangerouslySetInnerHTML) and by the imperative per-frame
// DOM layer, and by the data-driven weapon/build defs (type only).

export type IconId =
  // UI / meta
  | "lock"
  | "trophy"
  | "skull"
  | "star"
  | "clock"
  | "play"
  | "exit"
  | "menu"
  | "rotate"
  // control hints
  | "joystick"
  | "drag"
  | "crosshair"
  | "slots"
  | "jump"
  // resources / building
  | "wood"
  | "wall"
  | "floor"
  // weapons
  | "pickaxe"
  | "blaster"
  | "smg"
  | "shotgun"
  | "sniper"
  | "heavy"
  // HUD marks
  | "hitmarker";

const P: Record<IconId, string> = {
  lock: `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><path d="M12 14.4v2.2"/>`,

  trophy: `<path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 6H5.5v.8A3.2 3.2 0 0 0 8.7 10"/><path d="M16 6h2.5v.8A3.2 3.2 0 0 1 15.3 10"/><path d="M12 14v3.4"/><path d="M8.5 20.4h7"/><path d="M10.2 20.4l.7-3h2.2l.7 3"/>`,

  skull: `<path d="M12 3.5c3.9 0 7 3 7 6.8 0 2.2-1.1 3.8-2.7 4.9-.5.3-.8.9-.8 1.5v1.5c0 .8-.7 1.5-1.5 1.5h-4c-.8 0-1.5-.7-1.5-1.5v-1.5c0-.6-.3-1.2-.8-1.5C6.1 14.1 5 12.5 5 10.3 5 6.5 8.1 3.5 12 3.5z"/><circle cx="9.4" cy="10.9" r="1.4" fill="currentColor" stroke="none"/><circle cx="14.6" cy="10.9" r="1.4" fill="currentColor" stroke="none"/><path d="M10.6 19.6v-1.5M13.4 19.6v-1.5"/>`,

  star: `<path d="M12 3.6l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>`,

  clock: `<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2.4"/>`,

  play: `<path d="M8.2 5.6v12.8c0 .63.68 1.02 1.22.7l10.9-6.4a.81.81 0 0 0 0-1.4L9.42 4.9a.81.81 0 0 0-1.22.7z" fill="currentColor" stroke="none"/>`,

  exit: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,

  menu: `<path d="M4.5 7.2h15M4.5 12h15M4.5 16.8h15"/>`,

  rotate: `<path d="M21 4v6h-6"/><path d="M20.5 14a8.5 8.5 0 1 1-2-8.8L21 10"/>`,

  joystick: `<circle cx="12" cy="7" r="3.1"/><path d="M12 10.1v4.4"/><path d="M4.5 20a7.5 3.6 0 0 1 15 0"/>`,

  drag: `<circle cx="12" cy="12" r="2.5"/><path d="M3.6 12h4M16.4 12h4"/><path d="M6 9.6L3.6 12 6 14.4M18 9.6l2.4 2.4L18 14.4"/>`,

  crosshair: `<circle cx="12" cy="12" r="6.4"/><path d="M12 2.8v3.4M12 17.8v3.4M2.8 12h3.4M17.8 12h3.4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>`,

  slots: `<rect x="2.8" y="8.4" width="5.4" height="7.2" rx="1.2"/><rect x="9.3" y="8.4" width="5.4" height="7.2" rx="1.2" fill="currentColor" stroke="none"/><rect x="15.8" y="8.4" width="5.4" height="7.2" rx="1.2"/>`,

  jump: `<path d="M12 20.5V6.6"/><path d="M6.4 12.2L12 6.6l5.6 5.6"/>`,

  wood: `<ellipse cx="7.2" cy="12" rx="3" ry="3.5"/><circle cx="7.2" cy="12" r="1.1"/><path d="M7.2 8.5h9.5a3.5 3.5 0 0 1 0 7H7.2"/><path d="M17.2 10.4h2M15.8 13.6h2.4" opacity=".55"/>`,

  wall: `<rect x="3.5" y="6" width="17" height="12" rx="1"/><path d="M3.5 12h17M12 6v6M7.75 12v6M16.25 12v6"/>`,

  floor: `<path d="M12 6.2l8.8 5-8.8 5-8.8-5z"/><path d="M7.6 8.7l8.8 5M16.4 8.7l-8.8 5" opacity=".65"/>`,

  pickaxe: `<g transform="rotate(45 12 12)"><path d="M5.5 9Q12 2.6 18.5 9"/><path d="M12 5V20"/></g>`,

  blaster: `<path d="M3.5 9.5H16v4.5h-5.5l-1.3 4.2H6l1.3-4.2H3.5z"/><path d="M16 11h3.6"/><circle cx="21.3" cy="11" r=".9" fill="currentColor" stroke="none"/>`,

  smg: `<path d="M3 9.5h13.5l3 1v3h-9v4.2h-3.2v-4.2H3z"/><path d="M19.5 11.3h1.9"/>`,

  shotgun: `<path d="M7 9.8h14M7 12.2h14"/><path d="M7 9v4L2.8 14.6v-5z"/><rect x="11.5" y="12.8" width="4.5" height="2.4" rx=".8"/><path d="M21 8.8v4.6"/>`,

  sniper: `<path d="M3 11.5h18v1.8H9.5l-1.2 3.5H5.4l1.2-3.5H3z"/><circle cx="12.6" cy="8.2" r="2.3"/><path d="M12.6 10.5v1"/>`,

  heavy: `<rect x="2.8" y="9.8" width="13.4" height="4.4" rx="2.2"/><path d="M8.6 9.8V7.6h5.2"/><path d="M17.4 9.2L21.8 12l-4.4 2.8z" fill="currentColor" stroke="none"/>`,

  hitmarker: `<path d="M5.5 5.5l4.4 4.4M18.5 5.5l-4.4 4.4M5.5 18.5l4.4-4.4M18.5 18.5l-4.4-4.4"/>`,
};

/**
 * Inline-SVG markup for an icon. Safe to drop into innerHTML (all content is
 * static, authored here). Sized 1em so the surrounding font-size scales it;
 * pass a class for structural styling.
 */
export function iconSvg(id: IconId, className = "gj-ic"): string {
  return (
    `<svg class="${className}" viewBox="0 0 24 24" width="1em" height="1em" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true" focusable="false">${P[id]}</svg>`
  );
}
