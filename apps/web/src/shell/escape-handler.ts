// What Escape does in the shell: the first step that applies, taken before any surface sees the key.
import { SURFACES, escapeAction } from "@manent/ui";
import type { EscapeSnapshot } from "@manent/ui";
import { useEffect, useRef } from "react";
import { useServices } from "../services/context.tsx";
import { useOpenDialog } from "../state/dialog.store.ts";
import { useHistory } from "../state/history.store.ts";
import { renameActions, useRenaming } from "../state/rename.store.ts";
import type { ShellDom } from "./regions.tsx";

// a Base UI trigger carries this while its popup is open
const OPEN_POPUP = "[data-popup-open]";
const OPEN_DIALOG =
  "[role='dialog'][data-open], [role='alertdialog'][data-open]";

/** The kind of the surface the dialog store holds open: it holds the Sync centre and New project popovers too. */
const kindOf = (id: string | null): string | null =>
  SURFACES.find((surface) => surface.id === id)?.kind ?? null;

const isFilterWithText = (element: Element | null): boolean =>
  element instanceof HTMLInputElement &&
  element.type === "search" &&
  element.value !== "";

/**
 * Escape closes the palette, then a field open in a bar, then returns focus from the frame to the page; any other
 * popover, a dialog and a filter handle their own Escape. It never leaves a screen.
 */
export function useEscapeHandler(options: {
  dom: ShellDom;
  paletteOpen: boolean;
  closePalette(): void;
}): void {
  const baseline = useHistory("baseline");
  const mode = useHistory("mode");
  const state = {
    ...options,
    dialogId: useOpenDialog(),
    renaming: useRenaming(),
    commands: useServices().commands,
    viewingVersion: baseline !== null && mode === "as_it_was",
  };
  // the listener reads the latest render's state; it is added once
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      const {
        dom,
        paletteOpen,
        closePalette,
        dialogId,
        renaming,
        commands,
        viewingVersion,
      } = latest.current;
      const held = kindOf(dialogId);
      const snapshot: EscapeSnapshot = {
        composing: event.isComposing,
        popoverOpen:
          paletteOpen ||
          held === "popover" ||
          document.querySelector(OPEN_POPUP) !== null,
        dialogOpen:
          held === "dialog" || document.querySelector(OPEN_DIALOG) !== null,
        fieldOpen: renaming !== null,
        filterWithText: isFilterWithText(document.activeElement),
        focus: dom.pageFocused() ? "page" : "frame",
        // no panel overlays the page yet
        overlayPanelOpen: false,
        viewingVersion,
      };
      const action = escapeAction(snapshot);
      switch (action) {
        case "close_popover":
          if (paletteOpen) closePalette();
          break;
        case "close_field":
          renameActions.stop();
          break;
        case "focus_page":
          // false while a screen covers the page: Escape never leaves a screen
          dom.focusPage();
          break;
        case "back_to_working":
          commands.run("history.backToWorking", "key");
          break;
        case "ignore":
        case "cancel_dialog":
        case "clear_filter":
        case "none":
          break;
        default:
          action satisfies never;
      }
    };
    // capture, so the step is chosen from the state before a popup closes itself
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
