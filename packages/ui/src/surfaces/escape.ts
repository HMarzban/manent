// What one press of Escape does: the first step that applies.

export type EscapeSnapshot = {
  composing: boolean;
  popoverOpen: boolean;
  dialogOpen: boolean;
  fieldOpen: boolean;
  filterWithText: boolean;
  focus: "page" | "frame";
  /** Changes no step: returning focus to the page is what closes a panel that overlays it. */
  overlayPanelOpen: boolean;
  /** A version is open as it was in the page's place. */
  viewingVersion: boolean;
};

export type EscapeAction =
  | "ignore"
  | "close_popover"
  | "cancel_dialog"
  | "close_field"
  | "clear_filter"
  | "focus_page"
  | "back_to_working"
  | "none";

/** `ignore` leaves the key to the input method; `none` lets the next Tab leave the page. */
export function escapeAction(snapshot: EscapeSnapshot): EscapeAction {
  if (snapshot.composing) return "ignore";
  if (snapshot.popoverOpen) return "close_popover";
  if (snapshot.dialogOpen) return "cancel_dialog";
  if (snapshot.fieldOpen) return "close_field";
  if (snapshot.filterWithText) return "clear_filter";
  if (snapshot.focus === "frame") return "focus_page";
  if (snapshot.viewingVersion) return "back_to_working";
  return "none";
}
