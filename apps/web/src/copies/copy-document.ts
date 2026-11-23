// A script, as it is now or as one version held it, made a new document with new block ids, and where it came from
// recorded in its project's index.
import { NOTES_MAP, jsonMap, scriptBody, writeSource } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { isScriptNote } from "@manent/schema";
import type {
  BlockJSON,
  FormatId,
  IdSource,
  ScriptNote,
  TextJSON,
} from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import type { HistorySource } from "../history/source.ts";
import type { LibraryIndex, ProjectKind } from "../services/ports.ts";

export interface CopySource {
  docId: string;
  /** Null: the script as it is now. */
  versionId: string | null;
}

export interface CopyTarget {
  workspaceId: string;
  /** Null: a new project of `kind`. */
  projectId: string | null;
  kind: ProjectKind;
  title: string;
  /** Null: the source's format. */
  format: FormatId | null;
  /** The copy's index entry: `rundownId` set with a `projectId` makes it a story in that project's rundown. */
  entry: { rundownId: string | null };
}

/** What a copy is made from, read before it is made. */
interface Content {
  blocks: readonly BlockJSON[];
  settings: Readonly<Record<string, unknown>>;
  notes: Readonly<Record<string, ScriptNote>>;
}

const SUGGESTION_MARKS: readonly string[] = [
  "suggest_insert",
  "suggest_delete",
];

/** The runs as they read with every pending suggestion declined: suggested text left out, suggested deletions kept. */
const declinedRuns = (runs: readonly TextJSON[]): TextJSON[] =>
  runs
    .filter(
      (run) => !(run.marks ?? []).some((m) => m.type === "suggest_insert"),
    )
    .map((run) => {
      const marks = (run.marks ?? []).filter(
        (m) => !SUGGESTION_MARKS.includes(m.type),
      );
      return marks.length > 0
        ? { type: "text", text: run.text, marks }
        : { type: "text", text: run.text };
    });

/** The element a block reads as with its suggestion declined: a suggested change of element names the one before. */
const declinedType = (
  attrs: NonNullable<BlockJSON["attrs"]>,
): string | undefined =>
  typeof attrs.suggest === "string" && attrs.suggest !== "removed"
    ? attrs.suggest
    : attrs.type;

/**
 * The blocks with every pending suggestion declined, each under a new id from `ids`, and each source id's new id. A
 * suggested block is left out and a suggested removal kept; a link to a block of the copy follows it to its new id.
 */
function copyBlocks(
  blocks: readonly BlockJSON[],
  ids: IdSource,
): { blocks: BlockJSON[]; newIds: Map<string, string> } {
  const kept = blocks.filter((block) => block.attrs?.suggest !== "added");
  const fresh = kept.map(() => ids());
  const newIds = new Map<string, string>();
  kept.forEach((block, i) => {
    const id = block.attrs?.id;
    if (typeof id === "string") newIds.set(id, fresh[i]!);
  });
  const copied = kept.map((block, i): BlockJSON => {
    const attrs = block.attrs ?? {};
    const link = attrs.linkTo ?? null;
    return {
      type: "block",
      attrs: {
        ...attrs,
        id: fresh[i]!,
        type: declinedType(attrs),
        from: null,
        suggest: null,
        suggestId: null,
        suggestAuthorUserId: null,
        suggestAt: null,
        linkTo:
          link === null
            ? null
            : { ...link, blockId: newIds.get(link.blockId) ?? link.blockId },
      },
      content: declinedRuns(block.content ?? []),
    };
  });
  return { blocks: copied, newIds };
}

/** The notes, each anchored to its block's new id; one on a block the copy does not hold is left out. */
function copyNotes(
  notes: Readonly<Record<string, ScriptNote>>,
  newIds: ReadonlyMap<string, string>,
): Record<string, ScriptNote> {
  const copied: Record<string, ScriptNote> = {};
  for (const [id, note] of Object.entries(notes)) {
    if (note.anchor === null) {
      copied[id] = note;
      continue;
    }
    const blockId = newIds.get(note.anchor.blockId);
    if (blockId !== undefined)
      copied[id] = { ...note, anchor: { ...note.anchor, blockId } };
  }
  return copied;
}

/** The notes stored in the script; one in another shape is left out. */
function readNotes(doc: CrdtDoc): Record<string, ScriptNote> {
  const notes: Record<string, ScriptNote> = {};
  for (const [id, value] of Object.entries(jsonMap(doc, NOTES_MAP).entries()))
    if (isScriptNote(value)) notes[id] = value;
  return notes;
}

/**
 * The source's blocks, settings and notes; null when neither the device nor a reachable server holds it, which a
 * script without a block shows. A version holds no notes: those of the script as it is now are taken.
 */
async function readContent(
  source: CopySource,
  history: HistorySource,
  open: (docId: string) => Promise<DocHandle>,
): Promise<Content | null> {
  const handle = await open(source.docId);
  try {
    const notes = readNotes(handle.doc());
    const read =
      source.versionId === null
        ? {
            blocks: (
              scriptBody(handle.doc()).materialize().content ?? []
            ).flatMap((section) => section.content ?? []),
            settings: handle.settings.get(),
          }
        : await history.content(source.docId, { versionId: source.versionId });
    if (read === null || read.blocks.length === 0) return null;
    return { blocks: read.blocks, settings: read.settings, notes };
  } finally {
    await handle.close();
  }
}

/** Writes the copy's body, notes and settings into the new document; each its own local transaction. */
function writeCopy(handle: DocHandle, content: Content): void {
  const doc = handle.doc();
  scriptBody(doc).write((w) => w.insertBlocks(null, content.blocks));
  const notes = jsonMap(doc, NOTES_MAP);
  for (const [id, note] of Object.entries(content.notes)) notes.set(id, note);
  for (const [key, value] of Object.entries(content.settings))
    handle.setSetting(key, value);
}

/**
 * Makes a copy of `source` in `target`, on the device first, and records its source in the target project's index.
 * The copy holds the blocks under new ids, their text and marks, the notes and the settings, with pending suggestions
 * declined; never comments, history, alternates, cuts, scene progress, the import record, locks or revision sets.
 * `not_held`: the content is on neither this device nor a reachable server. `not_saved`: the Library's write failed,
 * which may leave the copy listed without its source. Rejects when `open` rejects.
 */
export async function copyDocument(options: {
  source: CopySource;
  target: CopyTarget;
  library: LibraryIndex;
  history: HistorySource;
  open: (docId: string) => Promise<DocHandle>;
  ids: IdSource;
}): Promise<
  | { ok: true; projectId: string; docId: string }
  | { ok: false; reason: "not_held" | "not_saved" }
> {
  const { source, target, open } = options;
  const read = await readContent(source, options.history, open);
  if (read === null) return { ok: false, reason: "not_held" };
  const { blocks, newIds } = copyBlocks(read.blocks, options.ids);
  const content: Content = {
    blocks,
    notes: copyNotes(read.notes, newIds),
    settings:
      target.format === null
        ? read.settings
        : { ...read.settings, "script.format": target.format },
  };
  try {
    const made = await options.library.addCopy(
      target.workspaceId,
      target.projectId,
      target.kind,
      target.title,
      {
        docKind: "script",
        airDate: null,
        rundownId: target.entry.rundownId,
        start: (handle) => writeCopy(handle, content),
      },
    );
    const index = await open(indexDocId("project", made.projectId));
    try {
      writeSource(index.doc(), made.docId, {
        docId: source.docId,
        versionId: source.versionId,
        copiedAt: Date.now(),
      });
    } finally {
      await index.close();
    }
    return { ok: true, ...made };
  } catch {
    // the device's store or an index refused the write; a refusal after `addCopy` leaves the copy without its source
    return { ok: false, reason: "not_saved" };
  }
}
