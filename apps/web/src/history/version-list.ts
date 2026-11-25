// The versions of each open script as History lists them, newest first: the device's while the server's load, then
// both; offline, the device's and those this tab has opened. Where the person was is kept as the script closes.
import type {
  DeviceVersion,
  DocEvent,
  DocHandle,
  DocStatus,
} from "@manent/sync-client";
import type {
  ControlKind,
  VersionItem,
  VersionListResponse,
  VersionPosition,
} from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { historyRows } from "./history-rows.ts";
import type { HistoryRows, ListPhase } from "./history-rows.ts";
import { writeLastOpened } from "./last-opened.ts";
import { isVersionList } from "./bodies.ts";
import { readBody } from "./requests.ts";
import type { HistoryHttp } from "./requests.ts";

export interface VersionLists {
  /** The same value for a script while anyone listens; the first listener starts reading it, the last one keeps where the person was. */
  rows(docId: string): Subscribable<HistoryRows>;
  /** Asks for the next page of a listed script. */
  more(docId: string): void;
  /** Reads a listed script's device versions and first page again. */
  refresh(docId: string): void;
}

interface Entry {
  readonly docId: string;
  readonly value: Subscribable<HistoryRows> & { set(rows: HistoryRows): void };
  readonly rows: Subscribable<HistoryRows>;
  listeners: number;
  /** Counts the times nobody listened, so that an answer to an earlier listening is dropped. */
  epoch: number;
  /** The script's view, held while anyone listens. */
  view: Promise<DocHandle> | null;
  stop: () => void;
  phase: ListPhase;
  link: DocStatus["link"] | null;
  sinceMs: number;
  items: readonly VersionItem[];
  next: string | null;
  /** A later page was added. */
  paged: boolean;
  head: VersionPosition | null;
  othersCanOpen: boolean | null;
  device: readonly DeviceVersion[];
  listing: boolean;
  paging: boolean;
}

const LISTED: readonly ControlKind[] = [
  "version_created",
  "draft_named",
  "draft_sent",
  "restored",
];

const noop = (): void => {};

/** What an entry holds of its script; `listing` and `paging` say a first or a later page is asked for. */
type Read = Omit<Entry, "docId" | "value" | "rows" | "listeners" | "epoch">;

/** An entry's state before anything is read. */
const unread = (sinceMs: number): Read => ({
  view: null,
  stop: noop,
  phase: { kind: "loading" },
  link: null,
  sinceMs,
  items: [],
  next: null,
  paged: false,
  head: null,
  othersCanOpen: null,
  device: [],
  listing: false,
  paging: false,
});

const initial = (sinceMs: number): HistoryRows => ({
  rows: [],
  state: { kind: "loading", sinceMs },
  othersCanOpen: null,
});

/** The items of `older` that `newer` lacks, after `newer`'s. */
const merged = (
  newer: readonly VersionItem[],
  older: readonly VersionItem[],
): VersionItem[] => {
  const ids = new Set(newer.map((item) => item.id));
  return [...newer, ...older.filter((item) => !ids.has(item.id))];
};

export function createVersionLists(options: {
  http: HistoryHttp;
  open: (docId: string) => Promise<DocHandle>;
  userId: string;
  now: () => number;
  /** True when this tab holds the version's content. */
  opened: (docId: string, versionId: string) => boolean;
}): VersionLists {
  const { http, userId, now } = options;
  const entries = new Map<string, Entry>();
  const listened = new Set<Entry>();

  const publish = (entry: Entry): void =>
    entry.value.set(
      historyRows(entry, {
        userId,
        now: now(),
        opened: (versionId) => options.opened(entry.docId, versionId),
      }),
    );

  /** Runs `then` on what `ask` answers, unless nobody has listened since it was asked. */
  async function answered<T>(
    entry: Entry,
    ask: () => Promise<T>,
    then: (value: T) => void,
  ): Promise<void> {
    const { epoch } = entry;
    const value = await ask();
    if (entry.epoch !== epoch) return;
    then(value);
    publish(entry);
  }

  const take = (entry: Entry, page: VersionListResponse): void => {
    entry.head = page.head;
    entry.othersCanOpen = page.othersCanOpen;
    entry.phase = { kind: "loaded" };
  };

  async function listFirst(entry: Entry): Promise<void> {
    if (entry.listing) return;
    entry.listing = true;
    const { epoch } = entry;
    await answered(
      entry,
      async (): Promise<VersionListResponse | ListPhase> => {
        try {
          const response = await http.get("/api/versions", {
            docId: entry.docId,
          });
          if (!response.ok)
            return { kind: "problem", reason: String(response.status) };
          const answer = await readBody(response, isVersionList);
          return answer?.value ?? { kind: "problem", reason: "unreadable" };
        } catch {
          // the request never reached the server, or its answer was lost
          return { kind: "problem", reason: "unreachable" };
        } finally {
          if (entry.epoch === epoch) entry.listing = false;
        }
      },
      (answer) => {
        if ("kind" in answer) {
          entry.phase = answer;
          return;
        }
        entry.items = merged(answer.versions, entry.items);
        if (!entry.paged) entry.next = answer.next;
        take(entry, answer);
      },
    );
  }

  async function listNext(entry: Entry, cursor: string): Promise<void> {
    entry.paging = true;
    const { epoch } = entry;
    await answered(
      entry,
      async (): Promise<VersionListResponse | null> => {
        try {
          const response = await http.get("/api/versions", {
            docId: entry.docId,
            cursor,
          });
          if (!response.ok) return null;
          return (await readBody(response, isVersionList))?.value ?? null;
        } catch {
          // the page is asked for again when the list is next scrolled to its end
          return null;
        } finally {
          if (entry.epoch === epoch) entry.paging = false;
        }
      },
      (answer) => {
        if (answer === null) return;
        entry.items = merged(entry.items, answer.versions);
        entry.next = answer.next;
        entry.paged = true;
        take(entry, answer);
      },
    );
  }

  const readDevice = (entry: Entry, handle: DocHandle): Promise<void> =>
    answered(
      entry,
      // a store that cannot be read keeps the versions read before
      () => handle.deviceVersions().catch(() => entry.device),
      (device) => {
        entry.device = device;
      },
    );

  function follow(entry: Entry, status: DocStatus): void {
    const cameOnline = status.link === "online" && entry.link !== "online";
    entry.link = status.link;
    const { kind } = entry.phase;
    if (status.neverSynced) {
      if (kind === "local") return;
      entry.phase = { kind: "local" };
      entry.othersCanOpen = false;
      publish(entry);
    } else if (status.link !== "online") {
      if (kind === "offline") return;
      entry.phase = { kind: "offline" };
      publish(entry);
    } else if (kind === "loading" || kind === "local" || cameOnline)
      void listFirst(entry);
  }

  function heard(entry: Entry, handle: DocHandle, event: DocEvent): void {
    if (event.type === "control" && LISTED.includes(event.kind))
      void listFirst(entry);
    else if (event.type !== "control") void readDevice(entry, handle);
  }

  function attach(entry: Entry): void {
    const { epoch } = entry;
    listened.add(entry);
    if (listened.size === 1) {
      globalThis.addEventListener("visibilitychange", keepHidden);
      globalThis.addEventListener("pagehide", keepAll);
    }
    const view = options.open(entry.docId);
    entry.view = view;
    view.then(
      (handle) => {
        if (entry.epoch !== epoch) return;
        const stops = [
          handle.status.subscribe((status) => follow(entry, status)),
          handle.on((event) => heard(entry, handle, event)),
        ];
        entry.stop = () => {
          for (const stop of stops) stop();
        };
        follow(entry, handle.status.get());
        void readDevice(entry, handle);
      },
      () => {
        if (entry.epoch !== epoch) return;
        entry.phase = { kind: "problem", reason: "unopened" };
        publish(entry);
      },
    );
  }

  /**
   * Keeps where the person is in the script, once its head is known: the synced head this device has seen, or in a
   * tab that does not lead, the head the list last read. The view's handle, null when it never opened.
   */
  async function keep(
    docId: string,
    head: VersionPosition | null,
    view: Promise<DocHandle>,
  ): Promise<DocHandle | null> {
    const handle = await view.catch(() => null);
    if (handle !== null && head !== null)
      writeLastOpened(userId, docId, {
        generation: head.generation,
        seq: handle.lastServerSeq() ?? head.seq,
      });
    return handle;
  }

  function keepAll(): void {
    for (const entry of listened)
      if (entry.view !== null) void keep(entry.docId, entry.head, entry.view);
  }

  function keepHidden(): void {
    if (globalThis.document?.visibilityState === "hidden") keepAll();
  }

  /** Forgets what was read, so that the next listener reads the script afresh. */
  function reset(entry: Entry): void {
    const sinceMs = now();
    Object.assign(entry, { epoch: entry.epoch + 1, ...unread(sinceMs) });
    entry.value.set(initial(sinceMs));
  }

  async function detach(entry: Entry): Promise<void> {
    const { view, head } = entry;
    listened.delete(entry);
    if (listened.size === 0) {
      globalThis.removeEventListener("visibilitychange", keepHidden);
      globalThis.removeEventListener("pagehide", keepAll);
    }
    entry.stop();
    reset(entry);
    if (view === null) return;
    const handle = await keep(entry.docId, head, view);
    await handle?.close();
  }

  function entryOf(docId: string): Entry {
    const existing = entries.get(docId);
    if (existing !== undefined) return existing;
    const sinceMs = now();
    const value = createValue(initial(sinceMs));
    const entry: Entry = {
      docId,
      value,
      rows: {
        get: () => value.get(),
        subscribe(listener) {
          const stop = value.subscribe(listener);
          entry.listeners += 1;
          if (entry.listeners === 1) attach(entry);
          let left = false;
          return () => {
            if (left) return;
            left = true;
            stop();
            entry.listeners -= 1;
            if (entry.listeners === 0) void detach(entry);
          };
        },
      },
      listeners: 0,
      epoch: 0,
      ...unread(sinceMs),
    };
    entries.set(docId, entry);
    return entry;
  }

  return {
    rows: (docId) => entryOf(docId).rows,
    more(docId) {
      const entry = entries.get(docId);
      if (entry === undefined || entry.paging || entry.next === null) return;
      if (entry.phase.kind === "loaded") void listNext(entry, entry.next);
    },
    refresh(docId) {
      const entry = entries.get(docId);
      if (entry === undefined || entry.view === null) return;
      // a view that never opened has nothing to read again
      void entry.view.then((handle) => readDevice(entry, handle), noop);
      if (entry.phase.kind === "loaded") void listFirst(entry);
    },
  };
}
