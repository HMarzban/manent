// The front pages loaded apart from the editor, as nothing of them is in view when a script opens.
import type { FrontPage, PageProfile } from "@manent/pagination";
import type { FrontPages, FrontPagesOptions } from "./sheets.ts";

/** The front pages while they load and after: until they have loaded, nothing is shown, printed or labelled. */
export interface FrontPagesHandle {
  /** Lays them out again with the profile as it is now. */
  relayout(): void;
  setEditable(editable: boolean): void;
  show(): void;
  /** Null until they have loaded. */
  printed(): FrontPage[] | null;
  labelAt(top: number): string | null;
  destroy(): void;
}

/** Loads the front pages and draws them in `scaffold.front` with the profile as it is then; none while it is null. */
export function loadFrontPages(
  options: Omit<FrontPagesOptions, "profile"> & {
    profile(): PageProfile | null;
  },
): FrontPagesHandle {
  const { profile } = options;
  let front: FrontPages | null = null;
  let editable = options.editable;
  let destroyed = false;
  void import("./sheets.ts").then(({ createFrontPages }) => {
    const now = profile();
    if (destroyed || now === null) return;
    front = createFrontPages({ ...options, profile: now, editable });
  });
  return {
    relayout() {
      const next = profile();
      if (next !== null) front?.setProfile(next);
    },
    setEditable(next) {
      editable = next;
      front?.setEditable(next);
    },
    show: () => front?.show(),
    printed: () => front?.printed() ?? null,
    labelAt: (top) => front?.labelAt(top) ?? null,
    destroy() {
      destroyed = true;
      front?.destroy();
    },
  };
}
