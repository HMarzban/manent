// Documents and readers shared by the crdt package's tests.
import {
  BLOCK_TYPES,
  MARK_NAMES,
  randomBlockId,
  sectionize,
} from "@manent/schema";
import type {
  BlockAttrs,
  BlockJSON,
  BlockType,
  BlockView,
  DocJSON,
  FlatBlock,
  MarkJSON,
  TextJSON,
} from "@manent/schema";
import fc from "fast-check";
import * as Y from "yjs";
import {
  createDoc,
  loadDoc,
  scriptBody,
  scriptDocFromJSON,
  yXmlFragmentForBinding,
} from "../src/index.ts";
import type { BlockWriter, CrdtDoc, Update } from "../src/index.ts";

interface Run {
  text: string;
  marks?: MarkJSON[];
}

/** The block of every one-block document below. */
export const ID = "i".repeat(16);
export const ID_A = "p".repeat(16);
export const ID_B = "q".repeat(16);
export const ID_C = "r".repeat(16);

/** One section of one block; a string is one plain run. */
export function docWith(
  attrs: Partial<BlockAttrs> & Record<string, unknown>,
  content: string | readonly Run[],
): DocJSON {
  const textRuns: TextJSON[] =
    typeof content === "string"
      ? [{ type: "text", text: content }]
      : content.map((run) => ({ type: "text", ...run }));
  return {
    type: "doc",
    content: [
      {
        type: "section",
        content: [{ type: "block", attrs, content: textRuns }],
      },
    ],
  };
}

const MARK_ATTRS: Readonly<Record<string, Record<string, unknown>>> = {
  color: { value: "red" },
  highlight: { value: "red" },
  link: { href: "https://example.com" },
  suggest_insert: { id: "s1", authorUserId: "dana", at: 5 },
  suggest_delete: { id: "s1", authorUserId: "dana", at: 5 },
};

/** One run per mark name, each with full attributes. */
export const ALL_MARKS: readonly { text: string; marks: MarkJSON[] }[] =
  MARK_NAMES.map((name) => {
    const attrs = MARK_ATTRS[name];
    return {
      text: name,
      marks: [attrs ? { type: name, attrs } : { type: name }],
    };
  });

/** An action block. */
export function block(id: string, text: string): BlockJSON {
  return {
    type: "block",
    attrs: { id, type: "action" },
    content: text === "" ? [] : [{ type: "text", text }],
  };
}

/** Distinct block IDs, never equal to ID. */
export function idOf(i: number): string {
  return `b${String(i).padStart(15, "0")}`;
}

/** One block ID per element, distinct from those of idOf. */
export function idFor(type: BlockType): string {
  return `t${String(BLOCK_TYPES.indexOf(type)).padStart(15, "0")}`;
}

/** Blocks with fresh IDs. */
export function pasted(n: number): BlockJSON[] {
  return Array.from({ length: n }, (_, i) =>
    block(randomBlockId(), `pasted ${i}`),
  );
}

export const FIRST_ID = "s000000000000001";
export const SECOND_ID = "s000000000000002";
export const THIRD_ID = "s000000000000003";

/** Two sections of three blocks each. */
export const SAMPLE: DocJSON = {
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: FIRST_ID, type: "scene_heading", num: "1" },
          content: [{ type: "text", text: "EXT. SALT FLATS - DAWN" }],
        },
        {
          type: "block",
          attrs: { id: SECOND_ID, type: "action" },
          content: [
            { type: "text", text: "A kite drags a " },
            { type: "text", text: "red", marks: [{ type: "italic" }] },
            { type: "text", text: " ribbon across the crust." },
          ],
        },
        {
          type: "block",
          attrs: { id: THIRD_ID, type: "character" },
          content: [{ type: "text", text: "ODILE" }],
        },
      ],
    },
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: "s000000000000004", type: "dialogue" },
          content: [{ type: "text", text: "It wants to go home." }],
        },
        {
          type: "block",
          attrs: { id: "s000000000000005", type: "transition" },
          content: [{ type: "text", text: "CUT TO:" }],
        },
        { type: "block", attrs: { id: "s000000000000006", type: "action" } },
      ],
    },
  ],
};

function blocksOf(doc: CrdtDoc): BlockJSON[] {
  return (scriptBody(doc).materialize().content ?? []).flatMap(
    (section) => section.content ?? [],
  );
}

function blockOf(doc: CrdtDoc, id: string): BlockJSON {
  const found = blocksOf(doc).find((candidate) => candidate.attrs?.id === id);
  if (found === undefined) throw new RangeError(`no block ${id}`);
  return found;
}

/** Blocks per section, in order. */
export function sectionSizes(doc: CrdtDoc): number[] {
  return (scriptBody(doc).materialize().content ?? []).map(
    (section) => (section.content ?? []).length,
  );
}

/** Every block ID, in document order. */
export function bodyBlockIds(doc: CrdtDoc): string[] {
  return blocksOf(doc).map((found) => String(found.attrs?.id));
}

/** The block's text. */
export function textOf(doc: CrdtDoc, id: string): string {
  return (blockOf(doc, id).content ?? []).map((run) => run.text).join("");
}

/** The block's runs: text and its mark names in canonical order. */
export function runs(doc: CrdtDoc, id: string): [string, string[]][] {
  return (blockOf(doc, id).content ?? []).map((run) => [
    run.text,
    (run.marks ?? []).map((mark) => mark.type),
  ]);
}

/** Runs one write and returns the update it produced. */
export function capture(
  doc: CrdtDoc,
  fn: (writer: BlockWriter) => void,
): Update {
  const updates: Update[] = [];
  const stop = doc.subscribe((update) => updates.push(update));
  scriptBody(doc).write(fn);
  stop();
  const [update] = updates;
  if (updates.length !== 1 || update === undefined)
    throw new RangeError(`the write gave ${updates.length} updates, not 1`);
  return update;
}

/** Clients 1 and 2, both loaded from one base written by client 9. */
export function twoReplicasOf(json: DocJSON): [CrdtDoc, CrdtDoc] {
  const base = scriptDocFromJSON(json, { clientId: 9 }).encodeState();
  return [loadDoc(base, { clientId: 1 }), loadDoc(base, { clientId: 2 })];
}

/** Two writes on an empty source, the second building on the first. */
export function twoDependentUpdates(): {
  source: CrdtDoc;
  updates: [Update, Update];
} {
  const source = createDoc({ clientId: 3 });
  const first = capture(source, (w) =>
    w.insertBlocks(null, [block(ID_A, "first")]),
  );
  const second = capture(source, (w) => w.insertText(ID_A, 5, " line"));
  return { source, updates: [first, second] };
}

/** The three blocks of each side of a dual-dialogue run. */
const DUAL_SPEECH: readonly BlockType[] = [
  "character",
  "parenthetical",
  "dialogue",
];

/** Block `i` of an uneven script: from `dualAt`, a left speech of three blocks, then its right partner of three. */
function unevenBlock(i: number, dualAt: number | null): BlockJSON {
  const text = `line ${i}`;
  const at = dualAt === null ? -1 : i - dualAt;
  const type = DUAL_SPEECH[at % 3];
  if (at < 0 || at >= 6 || type === undefined) return block(idOf(i), text);
  return {
    type: "block",
    attrs: { id: idOf(i), type, dual: at < 3 ? "left" : "right" },
    content: [{ type: "text", text }],
  };
}

/**
 * Sections of the given sizes, written by client 1, then typed into by
 * clients 2 and 3: every seventh and every eleventh block gains a word.
 */
export function unevenScript(
  sizes: readonly number[],
  options?: { dualAt?: number },
): CrdtDoc {
  let next = 0;
  const content = sizes.map((size) => ({
    type: "section" as const,
    content: Array.from({ length: size }, () =>
      unevenBlock(next++, options?.dualAt ?? null),
    ),
  }));
  const source = scriptDocFromJSON({ type: "doc", content }, { clientId: 1 });
  for (const [clientId, every] of [
    [2, 7],
    [3, 11],
  ] as const) {
    const typist = loadDoc(source.encodeState(), { clientId });
    scriptBody(typist).write((w) => {
      for (let i = 0; i < next; i += every) w.insertText(idOf(i), 0, "now ");
    });
    source.applyUpdate(typist.encodeState());
    typist.destroy();
  }
  return source;
}

interface Aging {
  blocks: number;
  sessions: number;
  editsPerSession: number;
  seed: number;
}

const AGING_EDIT = fc.record({
  kind: fc.constantFrom("type", "delete", "move"),
  block: fc.nat(),
  to: fc.nat(),
  offset: fc.nat(),
  length: fc.integer({ min: 1, max: 4 }),
  word: fc.constantFrom("salt ", "kite ", "dawn ", "ribbon "),
});

type AgingEdit = typeof AGING_EDIT extends fc.Arbitrary<infer T> ? T : never;

/** The blocks in order and each one's text, as an aged script's sessions see them. */
interface AgingModel {
  ids: string[];
  texts: Map<string, string>;
}

/** One edit, made a keystroke at a time as a person makes it. */
function age(doc: CrdtDoc, model: AgingModel, edit: AgingEdit): void {
  const { ids, texts } = model;
  const id = ids[edit.block % ids.length]!;
  const text = texts.get(id) ?? "";
  const write = scriptBody(doc).write;
  if (edit.kind === "type") {
    const at = edit.offset % (text.length + 1);
    [...edit.word].forEach((ch, k) =>
      write((w) => w.insertText(id, at + k, ch)),
    );
    texts.set(id, text.slice(0, at) + edit.word + text.slice(at));
  } else if (edit.kind === "delete") {
    const end = edit.offset % (text.length + 1);
    const from = Math.max(end - edit.length, 0);
    for (let at = end; at > from; at--)
      write((w) => w.deleteText(id, at - 1, 1));
    texts.set(id, text.slice(0, from) + text.slice(end));
  } else {
    const rest = ids.filter((other) => other !== id);
    const after = rest[edit.to % rest.length]!;
    write((w) => {
      w.deleteBlock(id);
      w.insertBlocks(after, [block(id, text)]);
    });
    rest.splice(rest.indexOf(after) + 1, 0, id);
    model.ids = rest;
  }
}

/**
 * A script of `blocks` action blocks, then edited in `sessions` sessions,
 * each under a fresh 32-bit client id as Yjs draws one; a session opens by
 * typing, then types, deletes and moves blocks. Ids and edits come from `seed`.
 */
export function agedScript({
  blocks,
  sessions,
  editsPerSession,
  seed,
}: Aging): CrdtDoc {
  const count = sessions * editsPerSession;
  const [aging] = fc.sample(
    fc.record({
      clientIds: fc.uniqueArray(fc.integer({ min: 2, max: 0xffffffff }), {
        minLength: sessions + 1,
        maxLength: sessions + 1,
      }),
      edits: fc.array(AGING_EDIT, { minLength: count, maxLength: count }),
    }),
    { seed, numRuns: 1 },
  );
  if (aging === undefined) throw new RangeError("fast-check drew nothing");
  const [author, ...typists] = aging.clientIds;
  const ids = Array.from({ length: blocks }, (_, i) => idOf(i));
  const model: AgingModel = {
    ids,
    texts: new Map(ids.map((id) => [id, `line ${id}`])),
  };
  let state = scriptDocFromJSON(
    sectionize(ids.map((id) => block(id, `line ${id}`))),
    { clientId: author },
  ).encodeState();
  typists.forEach((clientId, session) => {
    const doc = loadDoc(state, { clientId });
    aging.edits
      .slice(session * editsPerSession, (session + 1) * editsPerSession)
      .forEach((edit, i) =>
        age(doc, model, i === 0 ? { ...edit, kind: "type" } : edit),
      );
    state = doc.encodeState();
    doc.destroy();
  });
  return loadDoc(state);
}

/** The document, plus a root map named `name` that no build of this package writes. */
export function withRoot(json: DocJSON, name: string): CrdtDoc {
  const doc = scriptDocFromJSON(json);
  const foreign = new Y.Doc();
  foreign.getMap(name).set("k", 1);
  doc.applyUpdate(Y.encodeStateAsUpdate(foreign));
  return doc;
}

/** The document, plus an element named `name` where a section belongs. */
export function withForeignElement(json: DocJSON, name: string): CrdtDoc {
  const doc = scriptDocFromJSON(json);
  const fragment = yXmlFragmentForBinding(doc);
  fragment.insert(fragment.length, [new Y.XmlElement(name)]);
  return doc;
}

/** A flat block without the index of its section, which a rebuild may change. */
export function stripSection(flat: FlatBlock): BlockView & { index: number } {
  return { attrs: flat.attrs, runs: flat.runs, index: flat.index };
}

/** The index of the section holding the block. */
export function sectionOf(doc: CrdtDoc, id: string): number {
  const at = (scriptBody(doc).materialize().content ?? []).findIndex(
    (section) =>
      (section.content ?? []).some((found) => found.attrs?.id === id),
  );
  if (at === -1) throw new RangeError(`no block ${id}`);
  return at;
}

/** The ID of the block at `index` in document order. */
export function blockAt(doc: CrdtDoc, index: number): string {
  const id = bodyBlockIds(doc)[index];
  if (id === undefined) throw new RangeError(`no block at ${index}`);
  return id;
}

/** How many characters, counted as Yjs counts them, the updates delete. */
export function deletedCharacters(updates: readonly Update[]): number {
  let deleted = 0;
  for (const update of updates)
    for (const items of Y.decodeUpdate(update).ds.clients.values())
      for (const item of items) deleted += item.len;
  return deleted;
}
