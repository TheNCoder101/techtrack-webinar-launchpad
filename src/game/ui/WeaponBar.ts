import type { WeaponSlot } from "../weapons/WeaponSystem";
import { WEAPON_DEFS, WEAPON_SLOT_COUNT } from "../weapons/weaponDefs";

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

  update(slots: WeaponSlot[], activeIndex: number): void {
    slots.forEach((slot, i) => {
      const btn = this.buttons[i];
      const def = slot.id ? WEAPON_DEFS[slot.id] : null;
      btn.classList.toggle("gj-weapon-slot-empty", !def);
      btn.classList.toggle("gj-weapon-slot-active", i === activeIndex);
      btn.textContent = def ? def.icon : String(i + 1);
    });
  }

  dispose(): void {
    this.root.remove();
  }
}
