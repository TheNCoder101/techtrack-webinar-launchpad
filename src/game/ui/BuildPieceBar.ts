import {
  BUILD_PIECE_DEFS,
  BUILD_PIECE_IDS,
  type BuildPieceId,
} from "../building/buildPieceDefs";

// Wall/floor picker for the build tool: a small vertical column of slots next
// to the right-thumb button cluster, mirroring WeaponBar's pattern (own DOM +
// pointer events with stopPropagation so taps never fall through to the
// look-drag zone underneath). Tap a slot to select what BUILD will place.
export class BuildPieceBar {
  root: HTMLDivElement;
  private buttons = new Map<BuildPieceId, HTMLDivElement>();

  onSelect?: (id: BuildPieceId) => void;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "gj-build-bar";
    container.appendChild(this.root);

    for (const id of BUILD_PIECE_IDS) {
      const def = BUILD_PIECE_DEFS[id];
      const btn = document.createElement("div");
      btn.className = "gj-build-slot";
      btn.innerHTML = `<span>${def.icon}</span><span class="gj-build-slot-cost">${def.materialCost}</span>`;

      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.setActive(id);
        this.onSelect?.(id);
      });

      this.root.appendChild(btn);
      this.buttons.set(id, btn);
    }

    // Must match BuildingManager's initial selectedPieceId.
    this.setActive("wall");
  }

  setActive(id: BuildPieceId): void {
    for (const [pieceId, btn] of this.buttons) {
      btn.classList.toggle("gj-build-slot-active", pieceId === id);
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
