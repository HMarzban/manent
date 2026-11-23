// Open beside's list: what each line of BESIDE_KINDS offers beside the open document, and opening the one chosen.
import { matchesQuery } from "@manent/ui";
import type { PaletteRow, PaletteSource } from "@manent/ui";
import { BESIDE_KINDS } from "./kinds.ts";
import type { BesideHere } from "./kinds.ts";
import { openBeside } from "./open-beside.ts";

const ROW = "beside:";

/** Each kind's choices beside the document `here` gives, by their labels; none while no document is open. */
export function createBesideSource(options: {
  here: () => BesideHere | null;
}): PaletteSource {
  return {
    kind: "document",
    rows(query) {
      const here = options.here();
      if (here === null) return [];
      return BESIDE_KINDS.flatMap((kind) =>
        kind.choices(here).map((choice): PaletteRow => ({
          id: `${ROW}${kind.id}:${choice.docId}`,
          kind: "document",
          label: choice.label,
          value: null,
          scopeWord: null,
          home: null,
          keys: null,
          checked: null,
          enabled: true,
          whyNot: null,
        })),
      ).filter((row) => matchesQuery(query, [row.label]));
    },
  };
}

/** Opens the document of a row this source made beside the page; false for any other row. */
export function runBesideRow(id: string): boolean {
  const kind = BESIDE_KINDS.find((entry) =>
    id.startsWith(`${ROW}${entry.id}:`),
  );
  if (kind === undefined) return false;
  openBeside(id.slice(`${ROW}${kind.id}:`.length), kind.id, null);
  return true;
}
