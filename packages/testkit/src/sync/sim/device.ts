// One simulated device: a person's sync client over its own store, and the world's books on
// the markers it writes, which the invariants are judged against.
import { scriptBody } from "@manent/crdt";
import type { BlockWriter, CrdtDoc } from "@manent/crdt";
import type { DocJSON } from "@manent/schema";
import type { DocHandle, SyncClient } from "@manent/sync-client";
import type { FaultyStore } from "@manent/sync-client/testing";
import type { VersionSet } from "@manent/sync-protocol";

export interface SimClient {
  readonly userId: string;
  readonly device: string;
  readonly client: SyncClient;
  readonly store: FaultyStore;
  readonly handle: DocHandle;
  /** Every marker this device typed. */
  readonly typed: string[];
  online(wanted: boolean): void;
  /** A reload: a new client over the same store. */
  reopen(): Promise<void>;
  /**
   * One local change to the script, kept in the world's books: a marker (text
   * in square brackets) it adds for the first time is typed by this device, and
   * one it removes was deleted by a device that held it.
   */
  write(fn: (writer: BlockWriter) => void): void;
}

/** The one script of every world. */
export const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
export const MARKER = /\[[^[\]]+\]/g;

export function linesOfContent(content: DocJSON): string[] {
  return (content.content ?? [])
    .flatMap((section) => section.content ?? [])
    .map((block) => (block.content ?? []).map((run) => run.text).join(""));
}

export const linesOf = (doc: CrdtDoc): string[] =>
  linesOfContent(scriptBody(doc).materialize());

export function markersIn(lines: readonly string[]): Set<string> {
  return new Set(lines.flatMap((line) => line.match(MARKER) ?? []));
}

/** Who typed each marker, who held it, and which were removed or acknowledged; the replays sent. */
export interface Books {
  typist: Map<string, Device>;
  holders: Map<string, Set<Device>>;
  /** Removed by the person: deleted where they were held, or kept only in a cleared browser. */
  removed: Set<string>;
  /** Seen in the document of a synced client at the end of a settle. */
  acked: Set<string>;
  /** The text of each device's recovered versions at the end of the last settle. */
  recoveredVersions: Map<Device, string>;
  /** Every replay key a device sent, which it stored before sending. */
  replayKeys: Set<string>;
}

export function createBooks(): Books {
  return {
    typist: new Map(),
    holders: new Map(),
    removed: new Set(),
    acked: new Set(),
    recoveredVersions: new Map(),
    replayKeys: new Set(),
  };
}

export function noteHeld(
  books: Books,
  device: Device,
  markers: Iterable<string>,
): void {
  for (const marker of markers) {
    const holders = books.holders.get(marker) ?? new Set();
    books.holders.set(marker, holders.add(device));
  }
}

export class Device implements SimClient {
  readonly typed: string[] = [];
  wanted = true;
  client: SyncClient;
  handle: DocHandle;
  readonly versions: VersionSet;
  private marked = 0;

  constructor(
    readonly userId: string,
    readonly device: string,
    readonly store: FaultyStore,
    private readonly make: () => SyncClient,
    private readonly books: Books,
    opened: { client: SyncClient; handle: DocHandle; versions: VersionSet },
  ) {
    this.client = opened.client;
    this.handle = opened.handle;
    this.versions = opened.versions;
  }

  online(wanted: boolean): void {
    this.wanted = wanted;
    this.client.setOnline(wanted);
  }

  /** Recovered text in a store the browser cleared goes with it. */
  async reopen(): Promise<void> {
    if ((await this.store.load(DOC)) === null)
      for (const item of this.handle.recovered.get())
        for (const marker of item.text.match(MARKER) ?? [])
          this.books.removed.add(marker);
    await this.client.close();
    this.client = this.make();
    this.client.setOnline(this.wanted);
    this.handle = await this.client.open(DOC);
  }

  write(fn: (writer: BlockWriter) => void): void {
    const { books } = this;
    const before = markersIn(this.lines());
    scriptBody(this.handle.doc()).write(fn);
    const after = markersIn(this.lines());
    for (const marker of after)
      if (!books.typist.has(marker)) {
        books.typist.set(marker, this);
        this.typed.push(marker);
      }
    noteHeld(books, this, after);
    for (const marker of before)
      if (!after.has(marker)) books.removed.add(marker);
  }

  lines(): string[] {
    return linesOf(this.handle.doc());
  }

  nextMarker(): string {
    this.marked += 1;
    return `[${this.device}:${this.marked}]`;
  }
}
