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
  /**
   * Whether the person can add to the workspace the Library shows: `read_only` once its index answered that their role
   * only reads it, `getting_ready` while it is being seeded; `writable` off the Library and while neither is known.
   */
  workspace: "writable" | "read_only" | "getting_ready";
  panelOpen: Readonly<Record<PanelId, boolean>>;
  /** The History tab is present; the document screen writes it as it writes `panelOpen`. */
  historyPresent: boolean;
  /** The open script's format; null off a document. */
  format: SettingValue<"script.format"> | null;
  rulerShown: boolean;
  /** Which view the open script's pages are drawn in. */
  layoutView: "page" | "reflow";
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
    /** The revision marks shown (MARK_MODES of @manent/revisions). */
    mode: "collated" | "this_revision" | "all" | "since_full_draft" | "none";
    /** Colour revised pages is on. */
    tint: boolean;
  } | null;
  /** The open document's kind, as the server keeps it; null off a document. */
  docKind:
    | "script"
    | "comments"
    | "index"
    | "rundown"
    | "outline"
    | "room_log"
    | "private"
    | "ink"
    | null;
  /** The kind of the open document's project; null off a document. */
  projectKind:
    | "film"
    | "series"
    | "show"
    | "news"
    | "podcast"
    | "book"
    | "game"
    | "stage_play"
    | null;
  /** The open script can be started from its project's outline. */
  outlineStart: boolean;
  /** Where the person's typing in the open document goes; null off a document. */
  writing: {
    position: "everyone" | "suggestions" | "private";
    /** Someone else can open the document. */
    othersHaveAccess: boolean;
  } | null;
  /** The open script's writers' material; null with no script open. */
  material: {
    /** The caret is in a speech. */
    caretInSpeech: boolean;
    /** The alternates of the speech under the caret. */
    alternates: number;
    /** Text is selected. */
    selection: boolean;
    cuts: number;
  } | null;
  /** The open rundown; null off a rundown. */
  rundown: {
    canEdit: boolean;
    selectedRows: number;
    /** A selected row is a script row. */
    scriptRowSelected: boolean;
    /** A cell is being edited. */
    editingCell: boolean;
  } | null;
  /** A rundown, or a story open beside its rundown; null otherwise. */
  prompter: {
    /** The person may send to the prompter. */
    canSend: boolean;
    /** The focused row has a story, or the story beside is open. */
    hasStory: boolean;
    /** That story's row has been sent before. */
    sentBefore: boolean;
    /** That story's format; null without a story. */
    storyFormat: SettingValue<"script.format"> | null;
    /** That story's changes waiting to sync on this device. */
    waiting: number;
    /** The rundown has synced at least once. */
    synced: boolean;
  } | null;
  /** The open document is in Trash. */
  inTrash: boolean;
  /** The person may delete the open document. */
  canDelete: boolean;
  focusMode: boolean;
  readingAloud: boolean;
  /** A sprint is running. */
  sprintRunning: boolean;
}
