// What assistive technology is told of each element a revision marks ("revised, Blue"), by the newest revision
// that marks it. Built again only when which elements are described changes, or an edit replaced one of them.
import type { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { RevisionKept } from "./derive.ts";

export interface Descriptions {
  /** What the descriptions were last checked against. */
  readonly kept: RevisionKept;
  /** The revision each described block is described by, by block id. */
  readonly names: ReadonlyMap<string, string>;
  readonly set: DecorationSet;
  /** How many decorations `set` holds. */
  readonly count: number;
}

const NO_NAMES: ReadonlyMap<string, string> = new Map();

/** Each block a revision marks, by id, with the newest revision's name: the active one's marks last. */
function namesOf(kept: RevisionKept): ReadonlyMap<string, string> {
  const { view } = kept;
  if (view === null) return NO_NAMES;
  const names = new Map<string, string>();
  for (const source of view.earlier)
    for (const id of source.marks.keys()) names.set(id, source.name);
  for (const id of kept.marks.keys()) names.set(id, view.active.name);
  return names;
}

function isSameNames(
  a: ReadonlyMap<string, string>,
  b: ReadonlyMap<string, string>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, name] of a) if (b.get(id) !== name) return false;
  return true;
}

/** The blocks of `doc`, each a section's child, that `names` holds, each with its description. */
function decorate(
  doc: Node,
  names: ReadonlyMap<string, string>,
  describe: (name: string) => string,
): Decoration[] {
  const decorations: Decoration[] = [];
  if (names.size === 0) return decorations;
  doc.forEach((section, sectionPos) =>
    section.forEach((block, offset) => {
      const id: unknown = block.attrs.id;
      const name = typeof id === "string" ? names.get(id) : undefined;
      if (name === undefined) return;
      const from = sectionPos + 1 + offset;
      decorations.push(
        Decoration.node(from, from + block.nodeSize, {
          "aria-description": describe(name),
        }),
      );
    }),
  );
  return decorations;
}

/** The descriptions of `doc` as `kept` marks it. */
export function descriptionsOf(doc: Node, kept: RevisionKept): Descriptions {
  const names = namesOf(kept);
  const describe = kept.view?.words.revisedDescription;
  const decorations =
    describe === undefined ? [] : decorate(doc, names, describe);
  return {
    kept,
    names,
    set: DecorationSet.create(doc, decorations),
    count: decorations.length,
  };
}

/**
 * `prev` after `tr`: mapped while the same blocks are described by the same revisions and no edit replaced one
 * of them, else built again.
 */
export function nextDescriptions(
  prev: Descriptions,
  tr: Transaction,
  kept: RevisionKept,
): Descriptions {
  if (prev.kept !== kept && !isSameNames(prev.names, namesOf(kept)))
    return descriptionsOf(tr.doc, kept);
  if (!tr.docChanged) return { ...prev, kept };
  const set = prev.set.map(tr.mapping, tr.doc);
  return set.find().length === prev.count
    ? { ...prev, kept, set }
    : descriptionsOf(tr.doc, kept);
}
