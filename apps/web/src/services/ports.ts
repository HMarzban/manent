// The ports the interface reads, filled here until sync and the editor supply them, and the services one person's tab holds.
import type {
  Chord,
  CommandService,
  PanelId,
  Resolved,
  ScreenId,
} from "@manent/commands";
import type {
  Bag,
  KeyValueMap,
  SectionId,
  SettingsStore,
} from "@manent/settings";
import type { SyncClient } from "@manent/sync-client";
import type { UpdateState } from "@manent/sync-protocol";
import type {
  ConsequenceDialogProps,
  MessageQueue,
  NEW_PROJECT_CARDS,
  StateFact,
  StatusFacts,
  Subscribable,
} from "@manent/ui";
import type { Api } from "../api.ts";
import type { ConnectionControl } from "../demo/connection-transport.ts";
import type { DesktopHost } from "../desktop/host.ts";
import type { EditorControl } from "../editor-host/control.ts";
import type { EditorMount } from "../editor-host/mount.ts";
import type { PlaceStore } from "../editor-host/place.ts";
import type { Where } from "../platform.ts";
import type { TabPerson, TabStorage } from "../session.ts";
import type { ShellDom } from "../shell/regions.tsx";
import type { Guard } from "../state/guard.ts";
import type { PersonPresent } from "../state/people.store.ts";
import type { StorageEvents } from "./local-map.ts";
import type { CloseGuard } from "./sync/close-guard.ts";
import type { PersonSync } from "./sync/create-sync.ts";
import type { PersonReview } from "./sync/later-index.ts";

/** The kinds New project offers, in its order. */
export type ProjectKind = (typeof NEW_PROJECT_CARDS)[number]["kind"];

export type RowPlace =
  | { kind: "synced" }
  | { kind: "waiting"; count: number }
  | { kind: "not_on_device" }
  | { kind: "never_synced" };

export interface ContinueItem {
  docId: string;
  title: string;
  projectTitle: string;
  kind: ProjectKind;
  place: RowPlace;
}

export interface ProjectItem {
  projectId: string;
  title: string;
  kind: ProjectKind;
  /** Null for a project that holds no document yet. */
  firstDocId: string | null;
  /** `at` in milliseconds since the epoch; null while nobody has edited it. */
  lastEdited:
    { byName: string; at: number } | { changedSinceOpened: true } | null;
  place: RowPlace;
}

/** An index write, saved on the device first: it works offline and is never refused here. */
export interface CreateResult {
  projectId: string;
  docId: string;
}

export interface LibraryIndex {
  continueList(workspaceId: string): Subscribable<readonly ContinueItem[]>;
  projects(workspaceId: string): Subscribable<readonly ProjectItem[]>;
  /** The projects once the workspace's index has been read from the device. */
  readProjects(workspaceId: string): Promise<readonly ProjectItem[]>;
  loadState(workspaceId: string): Subscribable<"cached" | "problem">;
  createProject(workspaceId: string, kind: ProjectKind): Promise<CreateResult>;
  /** Null for a document the index does not hold. */
  documentTitle(docId: string): Subscribable<string | null>;
  documentKind(docId: string): Subscribable<ProjectKind | null>;
  /** An index write, like `createProject`. */
  renameDocument(docId: string, title: string): void;
}

export interface DocumentServices {
  status: Subscribable<StatusFacts>;
  waitingByScene: Subscribable<readonly { scene: string; count: number }[]>;
  stateFacts: Subscribable<readonly StateFact[]>;
  scriptBag: Bag;
  people: Subscribable<readonly PersonPresent[]>;
}

/** Each `open` of a document is matched by one `close`. */
export interface DocumentSource {
  open(docId: string): DocumentServices;
  close(docId: string): void;
}

/** One-way facts about a person, in their private index: none is known until `PersonServices.ready` has settled. */
export interface Flags {
  has(flag: "tour_seen"): boolean;
  set(flag: "tour_seen"): void;
}

/** A setting change's or a reset's own reverse, kept while its message is queued or current; run once, then dropped. */
export interface Reverses {
  set(messageId: string, reverse: () => void): void;
  /** False when the message has no reverse. */
  run(messageId: string): boolean;
}

/** The editor's structural and picker keys, listed as Fixed in Preferences → Keyboard. */
export interface FixedKey {
  chord: Chord;
  reason: "flow" | "picker";
}

export interface PersonServices {
  userId: string;
  /** The person's preferences, without a script. */
  settings: SettingsStore;
  commands: CommandService;
  resolved: Subscribable<Resolved>;
  library: LibraryIndex;
  documents: DocumentSource;
  /** What the person has to review in each script, and its choices. */
  review: PersonReview;
  /** The store of one open document, with its script settings; the same store until the document is closed. */
  openScriptStore(docId: string): SettingsStore;
  messages: MessageQueue;
  flags: Flags;
  /** The person's custom shortcuts, one entry per command and device. */
  keys: KeyValueMap;
  /** The private index's Tour progress, one entry per scenario done. */
  tour: KeyValueMap;
  /** This tab's requests to the server, with the tab's session. */
  api: Api;
  lastPane: { get(): SectionId; set(pane: SectionId): void };
  /** Where the person left each script, and their panels and Ruler, on this device. */
  place: PlaceStore;
  /** False when this device refuses to keep preferences beyond this session. */
  persisted: boolean;
  /** Empty until the editor, which loads apart from the entry, has loaded and supplied its keys. */
  fixedKeys: Subscribable<readonly FixedKey[]>;
  reverses: Reverses;
  /** The one way a command reaches the open editor. */
  editor: EditorControl;
  /** Draws this person's editor of a document into the page. */
  mount: EditorMount;
  /** Settles once the person's preferences, keys and flags have been read from the device, or their sync could not start. */
  ready: Promise<void>;
  /** Leaving a document this device cannot save asks `question`, which the screen draws while it is not null. */
  closing: {
    guard: CloseGuard;
    question: Subscribable<ConsequenceDialogProps | null>;
  };
  /** The demo's Connection of this tab, once the person's sync has started; rejects when it cannot start. */
  connection: Promise<ConnectionControl>;
  dispose(): void;
}

/** What one person's editor is built from, besides the environment. */
export interface EditorParts {
  services: () => PersonServices;
  control: EditorControl;
  commands: CommandService;
  messages: MessageQueue;
  resolved: Subscribable<Resolved>;
  fixedKeys: { set(keys: readonly FixedKey[]): void };
  /** `path` is a path inside the app. */
  navigate: (path: string) => void;
  /** The person's sync client, whose handles the editor's sessions are. */
  client: Promise<SyncClient>;
}

/** What the shell knows of the window, written by the shell whenever it changes. */
export interface ShellState {
  screen: ScreenId;
  /** The document shown or sent; null elsewhere. */
  docId: string | null;
  /** Each panel's tab; null while it is closed. */
  panels: Readonly<Record<PanelId, string | null>>;
  historyPresent: boolean;
  /** The caret block has its own space before. */
  spaceBeforeSet: boolean;
}

export const INITIAL_SHELL_STATE: ShellState = Object.freeze({
  screen: "library",
  docId: null,
  panels: Object.freeze({ left: null, side: null }),
  historyPresent: false,
  spaceBeforeSet: false,
});

/** The world this tab runs in, made once by the composition root and shared by every person's services. */
export interface Environment {
  where: Where;
  /** The desktop app's shell and node; null on the web. */
  desktop: DesktopHost | null;
  /** The desktop app's last word on updates in this window, or the check just asked for; null until then, and on the web. */
  updateState: Subscribable<UpdateState | null> & {
    set(state: UpdateState | null): void;
  };
  /** The language the browser asks for ("en-GB"). */
  language: string;
  /** The browser's user agent, which the editor's pages read the browser's engine from. */
  userAgent: string;
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => () => void;
  frame: (fn: () => void) => () => void;
  /** This origin's storage; null when the browser refuses it. */
  storage: Storage | null;
  storageEvents: StorageEvents;
  /** This tab's storage, for the boot cache; null when the browser refuses it. */
  tabStorage: TabStorage | null;
  randomId: () => string;
  /** When a key was last pressed in this tab; null before the first. */
  lastKeyAt: () => number | null;
  guard: Guard;
  flavour: "production" | "test";
  /** Builds one person's editor; the page shows the placeholder until it settles. */
  loadEditor(
    environment: Environment,
    parts: EditorParts,
  ): Promise<EditorMount>;
  shellState: Subscribable<ShellState> & { set(value: ShellState): void };
  dom: ShellDom;
  online: () => boolean;
  /** Told the id of every command that ran. */
  ran: (commandId: string) => void;
  visitUndo: { current: { undo(): boolean } | null };
  /** Starts the person's sync on this device; the services dispose it. */
  startSync(person: TabPerson, deviceId: string): Promise<PersonSync>;
  /** The services of the person this window draws, set as they are built and disposed; null while it draws nobody. */
  personServices: Subscribable<PersonServices | null> & {
    set(services: PersonServices | null): void;
  };
}
