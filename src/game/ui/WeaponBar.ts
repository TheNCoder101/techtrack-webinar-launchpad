import type { WeaponSlot } from "../weapons/WeaponSystem";
import { WEAPON_DEFS, WEAPON_SLOT_COUNT, type WeaponRarity } from "../weapons/weaponDefs";
import { iconSvg, type IconId } from "./icons";

const RARITY_SLOT_CLASSES: Record<WeaponRarity, string> = {
  common: "gj-weapon-slot-common",
  rare: "gj-weapon-slot-rare",
  epic: "gj-weapon-slot-epic",
};

// Six-slot weapon selector: tap a slot to switch. Owns its own DOM +
// pointer events (like InputManager's buttons) so taps never fall through
// to the look-drag zone underneath.
export class WeaponBar {
  root: HTMLDivElement;
  private buttons: HTMLDivElement[] = [];

  onSelect?: (index: number) => void;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "gj-weapon-bar";
    container.appendChild(this.root);

    for (let i = 0; i < WEAPON_SLOT_COUNT; i++) {
      const btn = document.createElement("div");
      btn.className = "gj-weapon-slot gj-weapon-slot-empty";
      btn.textContent = "";

      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.onSelect?.(i);
      });

      this.root.appendChild(btn);
      this.buttons.push(btn);
    }
  }

  // Per-slot render cache: innerHTML only rewrites when the slot's content
  // actually changes (this runs every frame from the game loop).
  private rendered: (IconId | "empty")[] = [];

  update(slots: WeaponSlot[], activeIndex: number): void {
    slots.forEach((slot, i) => {
      const btn = this.buttons[i];
      const def = slot.id ? WEAPON_DEFS[slot.id] : null;
      btn.classList.toggle("gj-weapon-slot-empty", !def);
      btn.classList.toggle("gj-weapon-slot-active", i === activeIndex);
      // D1: rarity tint on filled slots. Rarity is fixed per weapon, so the
      // icon cache key below also covers the class churn: classes only need
      // rewriting when the slot's weapon (= icon) changes.
      const want: IconId | "empty" = def ? def.icon : "empty";
      if (this.rendered[i] !== want) {
        this.rendered[i] = want;
        for (const cls of Object.values(RARITY_SLOT_CLASSES)) btn.classList.remove(cls);
        if (def) {
          btn.classList.add(RARITY_SLOT_CLASSES[def.rarity]);
          btn.innerHTML = iconSvg(def.icon);
        } else {
          btn.textContent = String(i + 1);
        }
      }
    });
  }

  dispose(): void {
    this.root.remove();
  }
}
