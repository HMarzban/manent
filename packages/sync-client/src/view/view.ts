// Reading a document without editing it: its blocks as the server projects them, never a CRDT
// document, a state vector or awareness.
import type { BlockJSON, TextJSON } from "@manent/schema";
import { CODE } from "@manent/sync-protocol";
import type { DocRole, DocumentMessage, Message } from "@manent/sync-protocol";
import { createSubscribable } from "../outbox/subscribable.ts";
import { HANDSHAKE_TIMEOUT_MS } from "../ports/defaults.ts";
import type { Clock, LinkState, Subscribable } from "../ports/ports.ts";

/** The script body, flattened, in order; a reader ignores a key it does not know. */
export interface ViewSnapshot {
  v: 1;
  blocks: BlockJSON[];
}

/** `remove` is applied first, then `insert` in order (`after` null: the very start), then `update` by id. */
export interface ViewPatch {
  v: 1;
  remove: string[];
  insert: { block: BlockJSON; after: string | null }[];
  update: BlockJSON[];
}

/** `live`: the snapshot came and patches follow; `role`: the one SUBSCRIBED named, null before. */
export interface ViewHandle {
  readonly docId: string;
  readonly blocks: Subscribable<readonly BlockJSON[]>;
  readonly status: Subscribable<{
    link: LinkState;
    live: boolean;
    role: DocRole | null;
  }>;
  close(): void;
}

const idOf = (block: BlockJSON): unknown => block.attrs?.id;

/** Removals, then insertions in order, then updates; an id it does not hold is passed over. */
export function applyViewPatch(
  blocks: readonly BlockJSON[],
  patch: ViewPatch,
): BlockJSON[] {
  const removed = new Set<unknown>(patch.remove);
  const next = blocks.filter((block) => !removed.has(idOf(block)));
  for (const { block, after } of patch.insert) {
    const at = next.findIndex((held) => idOf(held) === after);
    if (after === null) next.unshift(block);
    else if (at !== -1) next.splice(at + 1, 0, block);
  }
  const updates = new Map(patch.update.map((block) => [idOf(block), block]));
  return next.map((block) => updates.get(idOf(block)) ?? block);
}

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRun(value: unknown): TextJSON | null {
  if (!isFields(value) || value.type !== "text") return null;
  if (typeof value.text !== "string") return null;
  if (value.marks === undefined) return { type: "text", text: value.text };
  if (!Array.isArray(value.marks)) return null;
  const marks = value.marks.flatMap((mark: unknown) =>
    isFields(mark) && typeof mark.type === "string"
      ? [
          isFields(mark.attrs)
            ? { type: mark.type, attrs: mark.attrs }
            : { type: mark.type },
        ]
      : [],
  );
  return marks.length === value.marks.length
    ? { type: "text", text: value.text, marks }
    : null;
}

function readBlock(value: unknown): BlockJSON | null {
  if (!isFields(value) || value.type !== "block") return null;
  if (value.attrs !== undefined && !isFields(value.attrs)) return null;
  const block: BlockJSON = { type: "block" };
  if (isFields(value.attrs)) block.attrs = value.attrs;
  if (value.content === undefined) return block;
  if (!Array.isArray(value.content)) return null;
  const content = value.content.map(readRun);
  if (content.some((run) => run === null)) return null;
  block.content = content.filter((run) => run !== null);
  return block;
}

function readBlocks(value: unknown): BlockJSON[] | null {
  if (!Array.isArray(value)) return null;
  const blocks = value.map(readBlock);
  return blocks.some((block) => block === null)
    ? null
    : blocks.filter((block) => block !== null);
}

function readJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // bytes that are not JSON are no payload: the reader refuses them like any other wrong shape
    return null;
  }
}

/** Null for anything but a version 1 snapshot whose blocks all have their shape. */
function readViewSnapshot(bytes: Uint8Array): ViewSnapshot | null {
  const value = readJson(bytes);
  if (!isFields(value) || value.v !== 1) return null;
  const blocks = readBlocks(value.blocks);
  return blocks === null ? null : { v: 1, blocks };
}

/** Null for anything but a version 1 patch whose fields all have their shape. */
function readViewPatch(bytes: Uint8Array): ViewPatch | null {
  const value = readJson(bytes);
  if (!isFields(value) || value.v !== 1 || !Array.isArray(value.remove))
    return null;
  const remove = value.remove.filter((id) => typeof id === "string");
  const update = readBlocks(value.update);
  if (remove.length !== value.remove.length || update === null) return null;
  if (!Array.isArray(value.insert)) return null;
  const insert = value.insert.flatMap((item: unknown) => {
    if (!isFields(item)) return [];
    const block = readBlock(item.block);
    const { after } = item;
    return block !== null && (after === null || typeof after === "string")
      ? [{ block, after }]
      : [];
  });
  return insert.length === value.insert.length
    ? { v: 1, remove, insert, update }
    : null;
}

/** A reader of one document as its client drives it. */
export interface Viewer {
  readonly handle: ViewHandle;
  link(state: LinkState): void;
  connected(send: (message: Message) => void): void;
  disconnected(): void;
  receive(message: DocumentMessage): void;
  error(message: Extract<Message, { type: "ERROR" }>): void;
}

/**
 * SUBSCRIBE with mode `view` on every connection, then the snapshot and its
 * patches; nothing is stored. A SUBSCRIBED that does not come in time, a
 * payload that does not read, and an ERROR that may be retried each subscribe
 * again, from a snapshot; GENERATION_MOVED subscribes to the new generation.
 */
class DocViewer implements Viewer {
  readonly handle: ViewHandle;
  private readonly blocks = createSubscribable<readonly BlockJSON[]>([]);
  private readonly status = createSubscribable<{
    link: LinkState;
    live: boolean;
    role: DocRole | null;
  }>({ link: "offline", live: false, role: null });
  private send: ((message: Message) => void) | null = null;
  /** 0 until a move names one: the server answers with the current generation. */
  private generation = 0;
  private stopped = false;
  private cancel: (() => void) | null = null;
  private readonly options: { docId: string; clock: Clock; closed(): void };

  constructor(options: { docId: string; clock: Clock; closed(): void }) {
    this.options = options;
    this.handle = {
      docId: options.docId,
      blocks: this.blocks,
      status: this.status,
      close: () => this.close(),
    };
  }

  link(state: LinkState): void {
    this.status.set({ ...this.status.get(), link: state });
  }

  connected(send: (message: Message) => void): void {
    this.send = send;
    this.subscribe();
  }

  disconnected(): void {
    this.send = null;
    this.wait(null);
    this.status.set({ ...this.status.get(), live: false });
  }

  receive(m: DocumentMessage): void {
    if (m.type === "SUBSCRIBED") {
      this.wait(null);
      this.status.set({ ...this.status.get(), role: m.role });
    } else if (m.type === "VIEW_SNAPSHOT")
      this.show(readViewSnapshot(m.content)?.blocks ?? null);
    else if (m.type === "VIEW_PATCH" && this.status.get().live) {
      const patch = readViewPatch(m.patch);
      this.show(
        patch === null ? null : applyViewPatch(this.blocks.get(), patch),
      );
    } else if (m.type === "GENERATION_MOVED") {
      this.generation = m.newGeneration;
      this.subscribe();
    }
  }

  /** Null: the payload does not read, and the reader starts again from a snapshot. */
  private show(blocks: BlockJSON[] | null): void {
    if (blocks === null) {
      this.subscribe();
      return;
    }
    this.blocks.set(blocks);
    this.status.set({ ...this.status.get(), live: true });
  }

  error(m: Extract<Message, { type: "ERROR" }>): void {
    this.status.set({ ...this.status.get(), live: false });
    const final =
      m.permanent ||
      m.code === CODE.FORBIDDEN ||
      m.code === CODE.DOCUMENT_DELETED;
    if (final) this.wait(null);
    else this.wait(m.retryAfterMs ?? 1_000);
  }

  private subscribe(): void {
    if (this.send === null || this.stopped) return;
    const { docId } = this.options;
    this.status.set({ ...this.status.get(), live: false });
    this.send({
      type: "SUBSCRIBE",
      docId,
      generation: this.generation,
      mode: "view",
      clientIds: [],
      lastServerSeq: 0,
    });
    this.wait(HANDSHAKE_TIMEOUT_MS);
  }

  /** Subscribes again after `delayMs`; null cancels the wait. */
  private wait(delayMs: number | null): void {
    this.cancel?.();
    this.cancel =
      delayMs === null
        ? null
        : this.options.clock.schedule(() => this.subscribe(), delayMs);
  }

  private close(): void {
    const { docId } = this.options;
    const { generation } = this;
    this.send?.({ type: "UNSUBSCRIBE", docId, generation });
    this.stopped = true;
    this.wait(null);
    this.options.closed();
  }
}

export function createViewer(options: {
  docId: string;
  clock: Clock;
  closed(): void;
}): Viewer {
  return new DocViewer(options);
}
