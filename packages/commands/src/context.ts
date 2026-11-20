// What a command may know about where it runs: the screen, the focus, the person's access and the document's state.
import type { Platform, SettingValue } from "@manent/settings";
import type { PanelId, ScreenId } from "./ids.ts";

export interface CommandContext {
  screen: ScreenId;
  focus: "page" | "panel" | "field" | "dialog" | "other";
  docOpen: boolean;
  role: "owner" | "editor" | "commenter" | "viewer" | null;
  online: boolean;
  platform: Platform;
  shell: "web" | "desktop";
  demo: boolean;
  signedIn: boolean;
  panelOpen: Readonly<Record<PanelId, boolean>>;
  /** The History tab is present; the document screen writes it as it writes `panelOpen`. */
  historyPresent: boolean;
  /** The open script's format; null off a document. */
  format: SettingValue<"script.format"> | null;
  rulerShown: boolean;
  /** The caret block has its own space before. */
  spaceBeforeSet: boolean;
  /** The page's zoom as the person chose it, a percent or the mode; null off a document. */
  zoom: "fit_width" | number | null;
  /** The percent the page is drawn at; null off a document and in Ink. */
  zoomPercent: number | null;
  /** Null off a document, and until production state is known. */
  production: {
    locked: boolean;
    canLock: boolean;
    canIssue: boolean;
    recallOpen: boolean;
    waiting: number;
    /** The active revision's name ("Pink"), for labels such as "Issue Pink…". */
    activeName: string;
    /** The revision Recall would withdraw ("Blue"), or null when there is none. */
    recallName: string | null;
    selection: "text" | "scene" | "omitted_scene" | "pages" | null;
  } | null;
}
