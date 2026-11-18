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
import type {
  MessageQueue,
  NEW_PROJECT_CARDS,
  StateFact,
  StatusFacts,
  Subscribable,
} from "@manent/ui";
import type { PersonPresent } from "../state/people.store.ts";

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

/** One-way facts about a person, kept on this device. */
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
  /** The store of one open document, with its script settings; the same store until the document is closed. */
  openScriptStore(docId: string): SettingsStore;
  messages: MessageQueue;
  flags: Flags;
  /** The person's custom shortcuts, one entry per command and device. */
  keys: KeyValueMap;
  lastPane: { get(): SectionId; set(pane: SectionId): void };
  /** False when this device refuses to keep preferences beyond this session. */
  persisted: boolean;
  /** Empty until the editor supplies its keys. */
  fixedKeys: readonly FixedKey[];
  reverses: Reverses;
  dispose(): void;
}

/** What the shell knows of the window, written by the shell whenever it changes. */
export interface ShellState {
  screen: ScreenId;
  /** The document shown or sent; null elsewhere. */
  docId: string | null;
  /** Each panel's tab; null while it is closed. */
  panels: Readonly<Record<PanelId, string | null>>;
  historyPresent: boolean;
}
