// Writing the format-neutral script as a Final Draft (.fdx) file.
import { formatGraphicExportCue } from "@manent/pagination";
import type { BlockJSON, ScriptNote } from "@manent/schema";
import type {
  KeptItem,
  KeptKind,
  ScriptForExport,
  WrittenFile,
} from "../script/model.ts";
import type { XmlNode } from "../xml/node.ts";
import { writeXml } from "../xml/write.ts";
import {
  fdxAlignment,
  fdxSpaceBefore,
  fdxTypeOf,
  writeSceneProperties,
} from "./elements.ts";
import type { KeptDraft } from "./kept.ts";
import { writeInlineNote, writeRangedNote } from "./notes.ts";
import { scriptOffsets } from "./offsets.ts";
import { writeProduction } from "./production.ts";
import type { ScriptOffsetOf } from "./production.ts";
import { blockTextOf, revisionsOf, writeRuns } from "./runs.ts";

/** The `Version` written: Final Draft 11's, which later versions read. */
export const FDX_VERSION_WRITTEN = "4";

type Note = ScriptForExport["notes"][number];

/** A run of blocks written as one element of `Content`: one paragraph, or the speeches of one dual-dialogue wrapper. */
interface Group {
  readonly blocks: readonly BlockJSON[];
  readonly dual: boolean;
  /** A page break stands before it. */
  readonly newPage: boolean;
}

const idOf = (block: BlockJSON): string => block.attrs?.id ?? "";

/** The blocks grouped as they are written: a page break joins the group after it, and a dual run is one wrapper. */
function groupsOf(blocks: readonly BlockJSON[]): Group[] {
  const groups: Group[] = [];
  let newPage = false;
  let open: { blocks: BlockJSON[]; dual: boolean; newPage: boolean } | null =
    null;
  for (const block of blocks) {
    const dual = block.attrs?.dual ?? null;
    if (block.attrs?.type === "page_break") {
      newPage = true;
      open = null;
      continue;
    }
    const last = open?.blocks.at(-1)?.attrs?.dual;
    if (
      open !== null &&
      dual !== null &&
      !(dual === "left" && last === "right")
    )
      open.blocks.push(block);
    else {
      open = { blocks: [block], dual: dual !== null, newPage };
      groups.push(open);
      newPage = false;
    }
    if (dual === null) open = null;
  }
  return groups;
}

/** A Final Draft file's kept items: an element's by kind, what it belongs to and its name; a Type by its block. */
interface KeptIndex {
  node(kind: KeptKind, of: string | null, name: string): XmlNode | null;
  number(blockId: string): string | null;
  type(blockId: string): string | null;
}

const keyOf = (kind: KeptKind, of: string | null, name: string): string =>
  `${kind}\u0000${of ?? ""}\u0000${name}`;

function keptIndex(items: readonly KeptItem[]): KeptIndex {
  const nodes = new Map<string, XmlNode>();
  const numbers = new Map<string, string>();
  const types = new Map<string, string>();
  for (const { kind, of, name, value } of items) {
    if (typeof value !== "string") nodes.set(keyOf(kind, of, name), value);
    else if (kind === "scene_number" && of !== null) numbers.set(of, value);
    else if (kind === "element_type" && of !== null) types.set(of, name);
  }
  return {
    node: (kind, of, name) => nodes.get(keyOf(kind, of, name)) ?? null,
    number: (blockId) => numbers.get(blockId) ?? null,
    type: (blockId) => types.get(blockId) ?? null,
  };
}

interface Writing {
  readonly script: ScriptForExport;
  readonly kept: KeptIndex;
  readonly inline: ReadonlyMap<string, readonly Note[]>;
  readonly made: KeptDraft[];
  headings: number;
}

function numberOf(w: Writing, id: string): string {
  w.headings++;
  const { production } = w.script;
  const kept = production === null ? w.kept.number(id) : null;
  return kept ?? production?.numbers.get(id) ?? String(w.headings);
}

function writeParagraph(
  w: Writing,
  block: BlockJSON,
  newPage: boolean,
): XmlNode {
  const id = idOf(block);
  const attrs = block.attrs ?? {};
  const element = attrs.type ?? "action";
  const written =
    element === "graphic"
      ? { type: "General", leftOut: "Graphic" }
      : fdxTypeOf(element, attrs.kind);
  if (written.leftOut !== null)
    w.made.push({
      kind: "element_type",
      from: "fdx",
      of: id,
      name: written.leftOut,
      value: element,
    });
  const keptType = element === "general" ? w.kept.type(id) : null;
  const paragraph = w.kept.node("paragraph_part", id, "Paragraph");
  const contentRuns =
    element === "graphic"
      ? [
          {
            type: "text" as const,
            text: formatGraphicExportCue(attrs.graphic, blockTextOf(block)),
          },
        ]
      : (block.content ?? []);
  const runs = writeRuns(
    contentRuns,
    w.kept.node("run_part", id, "Runs"),
    revisionsOf(
      w.script.production?.sources ?? [],
      id,
      blockTextOf(block).length,
    ),
  );
  for (const mark of runs.leftOut)
    w.made.push({
      kind: "run_part",
      from: "fdx",
      of: id,
      name: mark,
      value: mark,
    });
  const scene = writeSceneProperties(
    attrs.synopsis ?? "",
    w.kept.node("paragraph_part", id, "SceneProperties"),
  );
  return {
    name: "Paragraph",
    attributes: {
      ...paragraph?.attributes,
      ...(attrs.align ? { Alignment: fdxAlignment(attrs.align) } : {}),
      ...(element === "scene_heading" ? { Number: numberOf(w, id) } : {}),
      ...(typeof attrs.spaceBefore === "number"
        ? { SpaceBefore: fdxSpaceBefore(attrs.spaceBefore) }
        : {}),
      ...(newPage ? { StartsNewPage: "Yes" } : {}),
      Type: keptType ?? written.type,
    },
    children: [
      ...(w.inline.get(id) ?? []).map(({ id: noteId, note }) =>
        writeInlineNote(note, w.kept.node("note_part", noteId, "ScriptNote")),
      ),
      ...(scene === null ? [] : [scene]),
      ...runs.runs,
      ...(paragraph?.children ?? []),
    ],
  };
}

function writeGroup(w: Writing, group: Group): XmlNode {
  // a group is never empty
  const first = group.blocks[0]!;
  if (!group.dual) return writeParagraph(w, first, group.newPage);
  const wrapper = w.kept.node("paragraph_part", idOf(first), "DualDialogue");
  return {
    name: "Paragraph",
    attributes: {
      Type: "General",
      ...wrapper?.attributes,
      ...(group.newPage ? { StartsNewPage: "Yes" } : {}),
    },
    children: [
      {
        name: "DualDialogue",
        attributes: {},
        children: group.blocks.map((block) => writeParagraph(w, block, false)),
      },
      { name: "Text", attributes: {}, children: [""] },
      ...(wrapper?.children ?? []),
    ],
  };
}

const isInline = (note: ScriptNote, written: ReadonlySet<string>): boolean =>
  note.anchor !== null &&
  note.anchor.start === 0 &&
  note.anchor.end === 0 &&
  written.has(note.anchor.blockId);

/** The notes written inside their block, by its id, and the rest, for the `ScriptNotes` list. */
function notesOf(
  script: ScriptForExport,
  writtenIds: ReadonlySet<string>,
): { inline: Map<string, Note[]>; ranged: Note[] } {
  const inline = new Map<string, Note[]>();
  const ranged: Note[] = [];
  for (const note of script.notes) {
    const blockId = note.note.anchor?.blockId ?? "";
    if (isInline(note.note, writtenIds))
      inline.set(blockId, [...(inline.get(blockId) ?? []), note]);
    else ranged.push(note);
  }
  return { inline, ranged };
}

/** Script offsets of the blocks as they are written, an offset past a block's text held at its end. */
function offsetsOf(groups: readonly Group[]): ScriptOffsetOf {
  const written = groups.flatMap((group) => group.blocks);
  const duals = groups.flatMap((group) =>
    group.blocks.map((_, i) => group.dual && i === group.blocks.length - 1),
  );
  const starts = scriptOffsets(
    written.map((block) => ({ text: blockTextOf(block) })),
    duals,
  );
  const at = new Map(written.map((block, i) => [idOf(block), i]));
  return (blockId, offset) => {
    const i = at.get(blockId);
    return i === undefined
      ? null
      : starts[i]! + Math.min(offset, blockTextOf(written[i]!).length);
  };
}

/** A note of the `ScriptNotes` list, by its range in script offsets; with no range when its block is not written. */
function writeListedNote(
  w: Writing,
  { id, note }: Note,
  offsetOf: ScriptOffsetOf,
): XmlNode {
  const { anchor } = note;
  const start = anchor === null ? null : offsetOf(anchor.blockId, anchor.start);
  const end = anchor === null ? null : offsetOf(anchor.blockId, anchor.end);
  return writeRangedNote(
    note,
    w.kept.node("note_part", id, "ScriptNote"),
    start === null || end === null ? null : [start, end],
  );
}

/** What the production is written with: the file's set names, its kept `Revisions` settings and unplaced locks. */
function productionOptions(
  script: ScriptForExport,
  own: readonly KeptItem[],
  kept: KeptIndex,
): Parameters<typeof writeProduction>[2] {
  return {
    names:
      script.record?.from === "fdx"
        ? (script.record.production?.sets.map((set) => set.sourceName) ?? [])
        : [],
    settings: kept.node("document_part", null, "Revisions")?.attributes ?? {},
    unplaced: own.flatMap((item) =>
      item.kind === "unplaced_lock" && typeof item.value !== "string"
        ? [item.value]
        : [],
    ),
  };
}

/**
 * The script as a Final Draft file: every block a paragraph, each dual run one wrapper, its notes, numbers and
 * kept parts, and with production its locked pages, revision sets and deletions. A note at the start of its
 * block is written inside it; any other in the `ScriptNotes` list, by its range. `leftOut` holds what the file
 * cannot hold — each element written as General and each mark left off, by block — then every kept item of
 * another format.
 */
export function writeFdx(script: ScriptForExport): WrittenFile {
  const kept = script.record?.kept ?? [];
  const own = kept.filter((item) => item.from === "fdx");
  const groups = groupsOf(script.blocks);
  const writtenIds = new Set(groups.flatMap((group) => group.blocks.map(idOf)));
  const { inline, ranged } = notesOf(script, writtenIds);
  const w: Writing = {
    script,
    kept: keptIndex(own),
    inline,
    made: [],
    headings: 0,
  };
  const content = groups.map((group) => writeGroup(w, group));
  const offsetOf = offsetsOf(groups);
  const notes = ranged.map((note) => writeListedNote(w, note, offsetOf));
  const parts = own.flatMap((item) =>
    (item.kind === "title_page" || item.kind === "document_part") &&
    item.name !== "Revisions" &&
    typeof item.value !== "string"
      ? [item.value]
      : [],
  );
  const production =
    script.production === null
      ? []
      : writeProduction(
          script.production,
          offsetOf,
          productionOptions(script, own, w.kept),
        );
  const root: XmlNode = {
    name: "FinalDraft",
    attributes: {
      DocumentType: "Script",
      Template: "No",
      Version: FDX_VERSION_WRITTEN,
    },
    children: [
      { name: "Content", attributes: {}, children: content },
      ...(notes.length === 0
        ? []
        : [{ name: "ScriptNotes", attributes: {}, children: notes }]),
      ...parts,
      ...production,
    ],
  };
  const made = w.made.map((draft, i) => ({ id: `w${i + 1}`, ...draft }));
  return {
    text: writeXml(root),
    leftOut: [...made, ...kept.filter((item) => item.from !== "fdx")],
  };
}
