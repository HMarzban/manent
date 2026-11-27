// The palette's rows beyond commands and settings: places in the open script (scenes, pages and page labels, a
// character's next line), the person's scripts and projects, and the people present; and what choosing one does.
import type { LayoutBlock, Pagination } from "@manent/pagination";
import { PLACE_WORDS, READOUT_WORDS, matchesQuery } from "@manent/ui";
import type { PaletteRow, PaletteSource } from "@manent/ui";
import type { EditorControl } from "../editor-host/control.ts";
import type { OutlineSelectors } from "../state/outline.store.ts";
import type { PersonPresent } from "../state/people.store.ts";

const SCENE = "place:scene:";
const PAGE = "place:page:";
const LINE = "place:line:";
const DOCUMENT = "document:";
const PERSON = "person:";

// a cue's extension, such as " (V.O.)" or " (CONT'D)", which the character's name leaves out
const EXTENSION = new RegExp(String.raw`\s*\(.*\)\s*$`);

const nameOf = (cue: string): string => cue.replace(EXTENSION, "").trim();

const row = (
  id: string,
  kind: PaletteRow["kind"],
  label: string,
  home: string | null,
): PaletteRow => ({
  id,
  kind,
  label,
  value: null,
  scopeWord: null,
  home,
  keys: null,
  checked: null,
  enabled: true,
  whyNot: null,
});

const matching = (query: string, rows: readonly PaletteRow[]): PaletteRow[] =>
  rows.filter((r) => matchesQuery(query, [r.label]));

// the names of the script's characters in the order they first speak, made once per pagination
const castOf = new WeakMap<Pagination, readonly string[]>();

function charactersOf(p: Pagination): readonly string[] {
  const known = castOf.get(p);
  if (known !== undefined) return known;
  const names = [
    ...new Set(
      p.blocks.flatMap((block) =>
        block.type === "character" && nameOf(block.text) !== ""
          ? [nameOf(block.text)]
          : [],
      ),
    ),
  ];
  castOf.set(p, names);
  return names;
}

/** The first cue of `name` after block `from`, going round the script's end; null when the name never speaks. */
function nextCue(
  blocks: readonly LayoutBlock[],
  from: number,
  name: string,
): string | null {
  for (let step = 1; step <= blocks.length; step++) {
    const block = blocks[(from + step) % blocks.length]!;
    if (block.type === "character" && nameOf(block.text) === name)
      return block.id;
  }
  return null;
}

/** Places in the open script: its scenes as the outline lists them, its pages by label, and each character's next line. */
export function createPlaceSource(options: {
  outline: OutlineSelectors;
  pagination: () => Pagination | null;
}): PaletteSource {
  return {
    kind: "place",
    rows(query) {
      const { outline } = options;
      const scenes: PaletteRow[] = [];
      for (let index = 0; index < outline.count(); index++) {
        const scene = outline.row(index);
        if (scene?.kind !== "scene") continue;
        const label =
          scene.number === null
            ? scene.heading
            : PLACE_WORDS.scene(scene.number, scene.heading);
        const texts =
          scene.number === null
            ? [label]
            : [label, `scene ${scene.number}`, `sc ${scene.number}`];
        if (matchesQuery(query, texts))
          scenes.push(row(`${SCENE}${scene.blockId}`, "place", label, null));
      }
      const p = options.pagination();
      const pages: PaletteRow[] = [];
      if (p !== null) {
        for (const page of p.pages) {
          // Match page number without "of <total>" so "page 12" in a 12-page script finds only Page 12
          const texts = [`page ${page.label}`, `p ${page.label}`, page.label];
          if (matchesQuery(query, texts)) {
            pages.push(
              row(
                `${PAGE}${page.index}`,
                "place",
                READOUT_WORDS.page(page.label, p.pages.length),
                null,
              ),
            );
          }
        }
      }
      const lines =
        p === null
          ? []
          : matching(
              query,
              charactersOf(p).map((name) =>
                row(
                  `${LINE}${name}`,
                  "place",
                  PLACE_WORDS.nextLine(name),
                  null,
                ),
              ),
            );
      return [...scenes, ...pages, ...lines];
    },
  };
}

/** The people present in the open script; choosing one goes to their cursor. */
export function createPersonSource(options: {
  people: () => readonly PersonPresent[];
}): PaletteSource {
  return {
    kind: "person",
    rows: (query) =>
      matching(
        query,
        options
          .people()
          .map((person) =>
            row(`${PERSON}${person.userId}`, "person", person.name, null),
          ),
      ),
  };
}

/** Runs a row these sources made: the caret goes to a place or a person, or the script opens. */
export function runPlaceRow(
  id: string,
  options: {
    editor: EditorControl;
    pagination: () => Pagination | null;
    caretBlockId: () => string | null;
    navigate(href: string): void;
  },
): void {
  const { editor } = options;
  if (id.startsWith(SCENE)) {
    editor.run({ kind: "go_to", blockId: id.slice(SCENE.length), offset: 0 });
    return;
  }
  if (id.startsWith(DOCUMENT)) {
    options.navigate(`/s/${id.slice(DOCUMENT.length)}`);
    return;
  }
  if (id.startsWith(PERSON)) {
    editor.run({ kind: "go_to_person", userId: id.slice(PERSON.length) });
    return;
  }
  const p = options.pagination();
  if (p === null) return;
  if (id.startsWith(PAGE)) {
    const page = p.pages[Number(id.slice(PAGE.length))];
    const block = page === undefined ? undefined : p.blocks[page.block];
    if (page !== undefined && block !== undefined)
      editor.run({ kind: "go_to", blockId: block.id, offset: page.offset });
    return;
  }
  if (!id.startsWith(LINE)) return;
  const caret = options.caretBlockId();
  const from = p.blocks.findIndex((block) => block.id === caret);
  const blockId = nextCue(p.blocks, from, id.slice(LINE.length));
  if (blockId !== null) editor.run({ kind: "go_to", blockId, offset: 0 });
}
