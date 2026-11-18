// Text this device typed that a remote update removes without its sender having seen it.
import * as Y from "yjs";
import { ORIGIN_REMOTE, yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import { elementsNamed, isElement } from "./mapping.ts";
import { withWholeUpdate } from "./updates.ts";
import type { Update } from "./updates.ts";

export interface SetAside {
  /** The block that held the text; it may be gone. Null when the document no longer knows it. */
  blockId: string | null;
  /** The nearest block that survives: the one before, else the one after, else null. */
  nearBlockId: string | null;
  /** What own clients typed that this update removed without its sender having seen it. */
  text: string;
}

type DeleteSet = ReturnType<typeof Y.createDeleteSet>;
type Sibling = Y.XmlElement | Y.XmlText | null;

function isHigh(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLow(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** The run without a half of a surrogate pair at either end. */
function whole(run: string): string {
  const from = isLow(run.charCodeAt(0)) ? 1 : 0;
  const to = isHigh(run.charCodeAt(run.length - 1))
    ? run.length - 1
    : run.length;
  return run.slice(from, Math.max(from, to));
}

/** The code units of `text`, written from `clock` on, that the sender did not delete itself. */
function unseen(
  client: number,
  clock: number,
  text: string,
  explicit: DeleteSet,
): string {
  let kept = "";
  let run = "";
  for (let i = 0; i < text.length; i++) {
    if (!Y.isDeleted(explicit, Y.createID(client, clock + i))) run += text[i];
    else {
      kept += whole(run);
      run = "";
    }
  }
  return kept + whole(run);
}

function idOf(node: unknown): string | null {
  if (!isElement(node, "block")) return null;
  const id = node.getAttribute("id");
  return typeof id === "string" ? id : null;
}

function idsIn(node: unknown): string[] {
  return isElement(node, "section")
    ? elementsNamed(node, "block").flatMap((block) => idOf(block) ?? [])
    : [];
}

function firstId(
  from: Sibling,
  step: (node: Y.XmlElement | Y.XmlText) => Sibling,
  idIn: (node: unknown) => string | null,
): string | null {
  for (let at = from; at !== null; at = step(at)) {
    const id = idIn(at);
    if (id !== null) return id;
  }
  return null;
}

const left = (node: Y.XmlElement | Y.XmlText): Sibling => node.prevSibling;
const right = (node: Y.XmlElement | Y.XmlText): Sibling => node.nextSibling;

/** Siblings skip what is deleted, so they lead to blocks that survive. */
function nearBlockId(holder: Y.XmlElement): string | null {
  const section = holder.parent;
  return (
    firstId(holder.prevSibling, left, idOf) ??
    firstId(holder.nextSibling, right, idOf) ??
    (section instanceof Y.XmlElement
      ? (firstId(
          section.prevSibling,
          left,
          (node) => idsIn(node).at(-1) ?? null,
        ) ??
        firstId(section.nextSibling, right, (node) => idsIn(node)[0] ?? null))
      : null)
  );
}

/** The kept pieces of one text, walked from its first item to its last. */
function inOrder(sample: Y.Item, kept: ReadonlyMap<Y.Item, string>): string {
  let start = sample;
  while (start.left !== null) start = start.left;
  let text = "";
  for (let at: Y.Item | null = start; at !== null; at = at.right)
    text += kept.get(at) ?? "";
  return text;
}

/** Own text this transaction deleted without the sender knowing, one entry per block. Runs before Yjs collects it. */
function deletedUnseen(
  tr: Y.Transaction,
  explicit: DeleteSet,
  own: ReadonlySet<number>,
): SetAside[] {
  const kept = new Map<Y.Item, string>();
  const texts = new Map<Y.XmlText, Y.Item>();
  Y.iterateDeletedStructs(tr, tr.deleteSet, (item) => {
    if (!(item instanceof Y.Item) || !own.has(item.id.client)) return;
    if (
      !(item.content instanceof Y.ContentString) ||
      !(item.parent instanceof Y.XmlText)
    )
      return;
    const text = unseen(
      item.id.client,
      item.id.clock,
      item.content.str,
      explicit,
    );
    if (text === "") return;
    kept.set(item, text);
    texts.set(item.parent, item);
  });
  const end = Y.createSnapshot(Y.createDeleteSet(), tr.afterState);
  const holders = new Set([...texts.keys()].map((text) => text.parent));
  return [...holders].flatMap((holder): SetAside[] => {
    if (!(holder instanceof Y.XmlElement)) return [];
    const text = Y.typeListToArraySnapshot(holder, end)
      .map((child: unknown) => {
        const sample =
          child instanceof Y.XmlText ? texts.get(child) : undefined;
        return sample === undefined ? "" : inOrder(sample, kept);
      })
      .join("");
    const id = holder.getAttributes(end).id;
    return [
      {
        blockId:
          isElement(holder, "block") && typeof id === "string" ? id : null,
        nearBlockId: nearBlockId(holder),
        text,
      },
    ];
  });
}

/**
 * Own text in the update that Yjs drops on arrival, because what it was typed
 * into was deleted and collected before. Where it was is no longer known.
 */
function droppedOnArrival(
  tr: Y.Transaction,
  typed: readonly Y.Item[],
  explicit: DeleteSet,
): SetAside[] {
  return typed.flatMap((item): SetAside[] => {
    const { client, clock } = item.id;
    const from = Math.max(clock, tr.beforeState.get(client) ?? 0);
    const to = Math.min(clock + item.length, tr.afterState.get(client) ?? 0);
    const structs = tr.doc.store.clients.get(client);
    if (
      from >= to ||
      structs === undefined ||
      !(item.content instanceof Y.ContentString)
    )
      return [];
    if (!(structs[Y.findIndexSS(structs, from)] instanceof Y.GC)) return [];
    const text = unseen(
      client,
      from,
      item.content.str.slice(from - clock, to - clock),
      explicit,
    );
    return text === "" ? [] : [{ blockId: null, nearBlockId: null, text }];
  });
}

/**
 * Applies the update (all or nothing, like applyUpdate; default origin
 * ORIGIN_REMOTE) and returns the text it set aside: what `ownClientIds` typed
 * that the update removed without its sender having seen it. Text the sender
 * saw and deleted is an ordinary edit. Throws CrdtUpdateError, having changed nothing.
 */
export function applyRemote(
  doc: CrdtDoc,
  update: Update,
  ownClientIds: ReadonlySet<number>,
  origin: unknown = ORIGIN_REMOTE,
): SetAside[] {
  const { structs, ds: explicit } = withWholeUpdate(update, () =>
    Y.decodeUpdate(update),
  );
  const typed = structs.filter(
    (struct): struct is Y.Item =>
      struct instanceof Y.Item && ownClientIds.has(struct.id.client),
  );
  const ydoc = yDocOf(doc);
  const setAside: SetAside[] = [];
  const thrown: unknown[] = [];
  // nothing may throw into Yjs: a throwing listener leaves the document unable to emit updates
  const onTransaction = (tr: Y.Transaction) => {
    try {
      setAside.push(
        ...deletedUnseen(tr, explicit, ownClientIds),
        ...droppedOnArrival(tr, typed, explicit),
      );
    } catch (error) {
      thrown.push(error);
    }
  };
  ydoc.on("afterTransaction", onTransaction);
  try {
    doc.applyUpdate(update, origin);
  } finally {
    ydoc.off("afterTransaction", onTransaction);
  }
  if (thrown.length > 0) throw thrown[0];
  return setAside;
}
