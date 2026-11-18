// Documents, a fake network and fake timers for the binding's tests, and editors bound through bindDocument.
import { ORIGIN_REMOTE, loadDoc, scriptDocFromJSON } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { EditorBinding, Timers } from "@manent/editor";
import { SECTION_TARGET_BLOCKS } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { bindDocument } from "../src/index.ts";
import type { BoundDocument } from "../src/index.ts";

/** The block of every one-block document below. */
export const ID = "i".repeat(16);

/** Distinct block ids, never equal to ID. */
export function idOf(i: number): string {
  return `b${String(i).padStart(15, "0")}`;
}

/** One section of one block holding `text`. */
export function docWith(
  attrs: { id: string; type: string } & Record<string, unknown>,
  text: string,
): DocJSON {
  return {
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs,
            content: text === "" ? [] : [{ type: "text", text }],
          },
        ],
      },
    ],
  };
}

/** An action block with the id idOf(i) and the text `line i`. */
export function line(i: number): BlockJSON {
  return {
    type: "block",
    attrs: { id: idOf(i), type: "action" },
    content: [{ type: "text", text: `line ${i}` }],
  };
}

/** `n` action blocks, idOf(0) to idOf(n - 1), in sections of SECTION_TARGET_BLOCKS. */
export function script(n: number): DocJSON {
  const blocks = Array.from({ length: n }, (_, i) => line(i));
  const content = [];
  for (let start = 0; start < n; start += SECTION_TARGET_BLOCKS)
    content.push({
      type: "section" as const,
      content: blocks.slice(start, start + SECTION_TARGET_BLOCKS),
    });
  return { type: "doc", content };
}

/** Two sections of three blocks: a scene, its action, a speech, a transition and an empty action. */
export const SAMPLE: DocJSON = {
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: idOf(0), type: "scene_heading" },
          content: [{ type: "text", text: "EXT. HARBOUR WALL - DUSK" }],
        },
        {
          type: "block",
          attrs: { id: idOf(1), type: "action" },
          content: [
            { type: "text", text: "Gulls wheel over a " },
            { type: "text", text: "grey", marks: [{ type: "italic" }] },
            { type: "text", text: " sea." },
          ],
        },
        {
          type: "block",
          attrs: { id: idOf(2), type: "character" },
          content: [{ type: "text", text: "DANA" }],
        },
      ],
    },
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: idOf(3), type: "dialogue" },
          content: [{ type: "text", text: "The lamp is out again." }],
        },
        {
          type: "block",
          attrs: { id: idOf(4), type: "transition" },
          content: [{ type: "text", text: "CUT TO:" }],
        },
        { type: "block", attrs: { id: idOf(5), type: "action" } },
      ],
    },
  ],
};

export interface FakeTimers extends Timers {
  /** Moves the clock on, running every timer that falls due, in order. */
  advance(ms: number): void;
}

export function fakeTimers(): FakeTimers {
  let now = 0;
  let nextId = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  const nextDue = (until: number) =>
    [...due.entries()]
      .filter(([, timer]) => timer.at <= until)
      .toSorted(([a, x], [b, y]) => x.at - y.at || a - b)[0];
  return {
    now: () => now,
    schedule(fn, delayMs) {
      const id = nextId++;
      due.set(id, { at: now + delayMs, fn });
      return () => due.delete(id);
    },
    advance(ms) {
      const until = now + ms;
      for (let next = nextDue(until); next; next = nextDue(until)) {
        const [id, timer] = next;
        due.delete(id);
        now = timer.at;
        timer.fn();
      }
      now = until;
    },
  };
}

/** A BoundDocument over a document nobody else holds: remote updates are never held, awareness goes nowhere. */
export function local(doc: CrdtDoc): BoundDocument {
  return {
    doc: () => doc,
    holdRemote: () => {},
    releaseRemote: () => {},
    sendAwareness: () => {},
    onAwareness: () => () => {},
  };
}

// The fake network of the latest twoClients call: updates wait here until flush().
let queue: { to: CrdtDoc; update: Uint8Array }[] = [];
let sent = new Map<CrdtDoc, number>();

/** Clients 1 and 2 loaded from one base written by client 9, each sending its own updates to the other. */
export function twoClients(json: DocJSON): [CrdtDoc, CrdtDoc] {
  queue = [];
  sent = new Map();
  const base = scriptDocFromJSON(json, { clientId: 9 }).encodeState();
  const a = loadDoc(base, { clientId: 1 });
  const b = loadDoc(base, { clientId: 2 });
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    sent.set(from, 0);
    from.subscribe((update, origin) => {
      if (origin === ORIGIN_REMOTE) return;
      sent.set(from, (sent.get(from) ?? 0) + 1);
      queue.push({ to, update });
    });
  }
  return [a, b];
}

/** Delivers every update in flight, and those the deliveries cause, until none is left. */
export function flush(): void {
  for (let next = queue.shift(); next; next = queue.shift())
    next.to.applyUpdate(next.update);
}

/** How many updates `doc` has sent since twoClients. */
export function updatesSentBy(doc: CrdtDoc): number {
  return sent.get(doc) ?? 0;
}

const bindings = new WeakMap<EditorView, EditorBinding>();

/** An editor over `doc`, bound through bindDocument, with fake timers and no one else's awareness. */
export function bound(doc: CrdtDoc): EditorView {
  const result = bindDocument({
    document: local(doc),
    timers: fakeTimers(),
    undoRoots: ["script"],
  });
  if (!result.ok)
    throw new RangeError(`the document is not bound: ${result.reason}`);
  const place = document.createElement("div");
  document.body.append(place);
  const view = new EditorView(place, {
    state: EditorState.create({
      doc: result.binding.doc,
      plugins: [...result.binding.plugins],
    }),
  });
  bindings.set(view, result.binding);
  return view;
}

/** The binding behind an editor made by bound(). */
export function bindingOf(view: EditorView): EditorBinding {
  const binding = bindings.get(view);
  if (binding === undefined)
    throw new RangeError("the view was not made by bound()");
  return binding;
}

/** Every block in document order: its id and text. */
export function blocksOfView(view: EditorView): { id: string; text: string }[] {
  const blocks: { id: string; text: string }[] = [];
  view.state.doc.forEach((section) =>
    section.forEach((block) =>
      blocks.push({
        id: String(block.attrs.id),
        text: block.textContent,
      }),
    ),
  );
  return blocks;
}

/** The position just inside the block with this id, plus `offset`. */
export function positionIn(view: EditorView, id: string, offset = 0): number {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== "block") return true;
    if (node.attrs.id === id) found = pos + 1 + offset;
    return false;
  });
  if (found === null) throw new RangeError(`no block ${id} in the view`);
  return found;
}

export function typeInto(view: EditorView, pos: number, text: string): void {
  view.dispatch(view.state.tr.insertText(text, pos));
}

export function setCaret(view: EditorView, pos: number): void {
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
  );
}

/** Calls `listener` with each transaction the view dispatches, then applies it as the view would. */
export function spyDispatch(
  view: EditorView,
  listener: (tr: Transaction) => void,
): void {
  view.setProps({
    dispatchTransaction: (tr) => {
      listener(tr);
      view.updateState(view.state.apply(tr));
    },
  });
}
