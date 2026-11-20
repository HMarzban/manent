// A document held by a tab that does not lead: its own copy, its edits posted to the leader and
// kept until saved, and everything else as the leader tells it.
import {
  ORIGIN_LOAD,
  ORIGIN_REMOTE,
  loadDoc,
  observeScript,
  scriptBody,
  scriptSettings,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { createCoalescer } from "../coalescer/coalescer.ts";
import type { Coalescer } from "../coalescer/coalescer.ts";
import { createSubscribable } from "../outbox/subscribable.ts";
import type {
  DocMeta,
  DocStatus,
  RecoveredItem,
  SideState,
  SyncClientPorts,
} from "../ports/ports.ts";
import { differingText, withFiled } from "../recovery/recover.ts";
import type { DocEvent, DocHandle } from "../session/doc-handle.ts";
import { elementsOf } from "../session/edits.ts";
import type { UnsavedEdit } from "../session/edits.ts";
import type { TabBody } from "../tabs/messages.ts";
import type { ViewHandle } from "../view/view.ts";

/** One document of a tab that does not lead, as its client drives it. */
export interface Follower {
  readonly handle: DocHandle;
  /** Resolves once the leader's state is loaded. */
  readonly loaded: Promise<void>;
  /** A leader is known: `open`, then every unsaved edit again under its `n`. */
  announce(): void;
  /** A message of the leader's about this document. */
  receive(body: TabBody): void;
  /** The tab now leads: its document and what the leader never saved. */
  detach(): { doc: CrdtDoc; unsaved: UnsavedEdit[] };
}

const OFFLINE: DocStatus = Object.freeze({
  saved: true,
  synced: false,
  waiting: 0,
  link: "offline",
  docSync: "local",
  wentOfflineAt: null,
  neverSynced: false,
  recovered: 0,
  side: [],
});

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null;
}

/**
 * A leader's event, which the reader of tab messages leaves unread. `replaced`
 * and `recovered` come as messages of their own, so they read as null here.
 */
function readEvent(value: unknown): DocEvent | null {
  if (!isFields(value)) return null;
  const { code, replayed, setAside, sent, key, message } = value;
  const { applied, overlaps, versionId } = value;
  switch (value.type) {
    case "rejected":
      return typeof code === "number" &&
        typeof replayed === "number" &&
        typeof setAside === "number"
        ? { type: "rejected", code, replayed, setAside }
        : null;
    case "setting_refused":
      return typeof key === "string" && typeof message === "string"
        ? { type: "setting_refused", key, message }
        : null;
    case "receipt":
      return typeof sent === "number" &&
        typeof setAside === "number" &&
        typeof overlaps === "number"
        ? { type: "receipt", sent, setAside, overlaps }
        : null;
    case "rebuilt":
      return typeof applied === "number" &&
        typeof overlaps === "number" &&
        typeof setAside === "number"
        ? { type: "rebuilt", applied, overlaps, setAside }
        : null;
    case "past_window":
      return typeof versionId === "string"
        ? { type: "past_window", versionId }
        : null;
    default:
      return null;
  }
}

type Unsaved = UnsavedEdit & { generation: number };

interface FollowerOptions {
  docId: string;
  doc: CrdtDoc;
  create: DocMeta["create"];
  unsaved: UnsavedEdit[];
  ports: SyncClientPorts;
  writeSchema: number;
  /** The next `n` of an edit of this document, from the client's one allocator for it. */
  nextEdit(): number;
  post(body: TabBody): void;
  closed(): void;
}

class TabFollower implements Follower {
  readonly handle: DocHandle;
  readonly loaded: Promise<void>;
  private doc: CrdtDoc;
  /** The generation of the document this tab holds, as the leader names it. */
  private generation = 0;
  /** Each unsaved edit under its `n`, with the generation of the document it was made in. */
  private readonly unsaved = new Map<number, Unsaved>();
  private refused = false;
  private leaderStatus: DocStatus = OFFLINE;
  private recovered: RecoveredItem[] = [];
  /** The ids of the items this tab filed itself, which the leader may file again. */
  private readonly filedHere = new Set<string>();
  private readonly status = createSubscribable<DocStatus>(OFFLINE);
  private readonly recoveredView = createSubscribable<readonly RecoveredItem[]>(
    [],
  );
  private readonly settings = createSubscribable<
    Readonly<Record<string, unknown>>
  >({});
  private readonly listeners = new Set<(event: DocEvent) => void>();
  private readonly awarenessListeners = new Set<(update: Uint8Array) => void>();
  private coalescer: Coalescer;
  private unobserve: () => void = () => {};
  private markLoaded: () => void = () => {};
  private readonly options: FollowerOptions;

  constructor(options: FollowerOptions) {
    this.options = options;
    this.doc = options.doc;
    for (const edit of options.unsaved)
      this.unsaved.set(options.nextEdit(), { ...edit, generation: 0 });
    this.loaded = new Promise((resolve) => {
      this.markLoaded = resolve;
    });
    this.coalescer = this.bind(this.doc);
    this.handle = this.handleOf(options.writeSchema);
    this.show();
  }

  announce(): void {
    const { docId, create } = this.options;
    this.options.post({
      t: "open",
      docId,
      clientId: this.doc.clientId,
      create,
    });
    for (const [n, edit] of this.unsaved)
      this.options.post({ t: "edit", docId, n, ...edit });
  }

  receive(body: TabBody): void {
    switch (body.t) {
      case "state":
        this.generation = body.meta.generation;
        this.doc.applyUpdate(body.state, ORIGIN_LOAD);
        this.markLoaded();
        this.show();
        return;
      case "saved":
        for (const n of this.unsaved.keys())
          if (n <= body.n) this.unsaved.delete(n);
        this.refused ||= body.refused;
        this.show();
        return;
      case "remote":
        this.coalescer.push(body.update, 0);
        return;
      case "status":
        this.leaderStatus = body.status;
        this.show();
        return;
      case "event": {
        const event = readEvent(body.event);
        if (event !== null) this.emit(event);
        return;
      }
      case "recovered":
        this.fileLeaders(body.items);
        return;
      case "replace":
        if (body.generation === this.generation) this.replace(body.state);
        else this.moved(body.state, body.generation);
        return;
      case "aw":
        for (const listener of this.awarenessListeners) listener(body.update);
        return;
      case "who":
      case "leader":
      case "open":
      case "close":
      case "edit":
      case "opened":
        return;
      default:
        body satisfies never;
    }
  }

  detach(): { doc: CrdtDoc; unsaved: UnsavedEdit[] } {
    this.unobserve();
    this.coalescer.dispose();
    return { doc: this.doc, unsaved: [...this.unsaved.values()] };
  }

  /** Server updates come through the leader and are applied as they are: set-aside text is the leader's to find. */
  private bind(doc: CrdtDoc): Coalescer {
    this.unobserve();
    this.unobserve = observeScript(doc, (report) => {
      if (report.origin === ORIGIN_LOAD || report.origin === ORIGIN_REMOTE)
        return;
      // nothing may throw into Yjs: what does is thrown again once the change is done
      try {
        this.edited({ update: report.update, elements: elementsOf(report) });
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    });
    const { frames, clock } = this.options.ports;
    return createCoalescer({
      apply: (merged) => {
        doc.applyUpdate(merged, ORIGIN_REMOTE);
        this.show();
      },
      frames,
      clock,
    });
  }

  private edited(edit: UnsavedEdit): void {
    const n = this.options.nextEdit();
    const { generation } = this;
    this.unsaved.set(n, { ...edit, generation });
    const { docId } = this.options;
    this.options.post({ t: "edit", docId, n, generation, ...edit });
    this.show();
  }

  /** A recovery replaced the leader's document: this tab loads it under a client ID of its own, never the old one. */
  private replace(state: Uint8Array): void {
    const previous = this.load(state);
    this.fileUnsaved(previous);
    this.unsaved.clear();
    this.announce();
    this.show();
    this.emit({ type: "replaced", reason: "rejected" });
  }

  /**
   * A move replaced the leader's document. The edits this tab made in the old
   * one are the leader's to carry over, so they wait for `saved` as before.
   */
  private moved(state: Uint8Array, generation: number): void {
    this.load(state);
    this.generation = generation;
    const { docId } = this.options;
    const { clientId } = this.doc;
    this.options.post({ t: "opened", docId, generation, clientId });
    this.show();
    this.emit({ type: "replaced", reason: "generation" });
  }

  /** The leader's document, bound in place of this tab's under a client ID of its own; returns the one it replaced. */
  private load(state: Uint8Array): CrdtDoc {
    let clientId = this.options.ports.random.clientId();
    while (clientId === this.doc.clientId)
      clientId = this.options.ports.random.clientId();
    this.coalescer.dispose();
    const previous = this.doc;
    this.doc = loadDoc(state, { clientId });
    this.coalescer = this.bind(this.doc);
    return previous;
  }

  /**
   * The blocks this tab's unsaved edits touched, as `previous` held them and the
   * new document does not: the leader may never have received those edits, so
   * their text is filed here, as Recovered text of this tab.
   */
  private fileUnsaved(previous: CrdtDoc): void {
    const touched = new Set(
      [...this.unsaved.values()].flatMap((edit) => edit.elements),
    );
    if (touched.size === 0) return;
    const { docId, ports } = this.options;
    const theirs = scriptBody(this.doc).materialize();
    const mine = scriptBody(previous).materialize();
    const found = differingText(mine, theirs, (id) => touched.has(id));
    const items = found.map((leftover) => ({
      id: ports.random.bytes(16).toHex(),
      docId,
      ...leftover,
      recoveredAt: ports.clock.now(),
    }));
    for (const item of items) this.filedHere.add(item.id);
    this.setRecovered([...this.recovered, ...items]);
  }

  /** The leader's items; one this tab filed with the same block and text gives way to it, and one under an id held already takes its place. */
  private fileLeaders(items: readonly RecoveredItem[]): void {
    const filed = new Set(items.map(sameText));
    const kept = this.recovered.filter((item) => {
      if (!this.filedHere.has(item.id) || !filed.has(sameText(item)))
        return true;
      this.filedHere.delete(item.id);
      return false;
    });
    this.setRecovered(withFiled(kept, items));
  }

  private setRecovered(items: RecoveredItem[]): void {
    this.recovered = items;
    this.recoveredView.set(items);
  }

  /** The leader's facts, saved only once the leader saved every edit made here. */
  private show(): void {
    const base = this.leaderStatus;
    const side: SideState[] = this.refused
      ? [...new Set([...base.side, "not_saved" as const])]
      : [...base.side];
    this.status.set({
      ...base,
      saved: base.saved && this.unsaved.size === 0 && !this.refused,
      side,
    });
    this.settings.set(scriptSettings(this.doc).entries());
  }

  private emit(event: DocEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private handleOf(writeSchema: number): DocHandle {
    const { docId } = this.options;
    const post = this.options.post;
    return {
      docId,
      doc: () => this.doc,
      status: this.status,
      recovered: this.recoveredView,
      settings: this.settings,
      writeSchema: createSubscribable(writeSchema),
      readOnly: createSubscribable<ViewHandle | null>(null),
      on: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
      setSetting: () => {
        throw new RangeError(
          "a setting is requested from the tab that leads, and the tab protocol carries no request",
        );
      },
      holdRemote: () => this.coalescer.hold(),
      releaseRemote: () => this.coalescer.release(),
      sendAwareness: (update) => post({ t: "aw", docId, update }),
      onAwareness: (listener) => {
        this.awarenessListeners.add(listener);
        return () => this.awarenessListeners.delete(listener);
      },
      saveVersion: () =>
        Promise.reject(
          new RangeError(
            "a device version is kept by the tab that leads, which holds the store",
          ),
        ),
      close: async () => {
        post({ t: "close", docId });
        this.detach();
        this.options.closed();
      },
    };
  }
}

/** Two items of the same block and text are the same Recovered text. */
function sameText(item: RecoveredItem): string {
  return JSON.stringify([item.blockId, item.text]);
}

export function createFollower(options: FollowerOptions): Follower {
  return new TabFollower(options);
}
