// What the palette lists, in sections: the recent commands and the menus while empty, an opened menu, or the rows for a query.
import { COMMANDS, menuModel } from "@manent/commands";
import type { CommandService } from "@manent/commands";
import { mark } from "@manent/perf";
import { MENU_IDS } from "@manent/settings";
import type { MenuId } from "@manent/settings";
import { useRef } from "react";
import { useCommands } from "../commands-react/commands-context.tsx";
import { PALETTE_WORDS } from "../words/palette.ts";
import { MENU_LABELS } from "./menu-labels.ts";
import { rankRows } from "./palette-rank.ts";
import type { PaletteRow, PaletteSource } from "./palette-sources.ts";

const RECENT_LIMIT = 5;

export type Entry =
  | { type: "menu"; menu: MenuId; label: string }
  | { type: "row"; row: PaletteRow };

/** One section of the list; `label` is null where it is not drawn, and a separator is drawn between its groups. */
export interface Section {
  key: string;
  label: string | null;
  groups: readonly (readonly Entry[])[];
}

export type PaletteFilter = "all" | "places" | "beside";

const SECTION_LABELS: Readonly<Record<PaletteRow["kind"], string | null>> =
  Object.freeze({
    ...PALETTE_WORDS.sections,
    // no source finds help yet
    help: null,
  });

export const keyOf = (entry: Entry): string =>
  entry.type === "menu" ? `menu:${entry.menu}` : entry.row.id;

export const textOf = (entry: Entry): string =>
  entry.type === "menu" ? entry.label : entry.row.label;

/** Every entry of `sections`, in the order drawn: the order the keys move through. */
export const entriesOf = (sections: readonly Section[]): readonly Entry[] =>
  sections.flatMap((section) => section.groups.flat());

const asRows = (rows: readonly PaletteRow[]): Entry[] =>
  rows.map((row) => ({ type: "row", row }));

/** A section label is drawn only where two or more sections are. */
const labelled = (sections: readonly Section[]): readonly Section[] =>
  sections.length > 1
    ? sections
    : sections.map((section) => ({ ...section, label: null }));

/** The menus that hold a command available now, each under its menu word. */
function menuEntries(service: CommandService): Entry[] {
  return MENU_IDS.flatMap((menu): Entry[] => {
    const label = MENU_LABELS[menu];
    const held = menuModel(menu, COMMANDS, service).groups.some((group) =>
      group.some((item) => item.enabled),
    );
    return label !== null && held ? [{ type: "menu", menu, label }] : [];
  });
}

/** `rows` in the order shown before for the same query, with rows that arrived since drawn below them. */
function keepShownOrder(
  shown: { query: string; ids: readonly string[] },
  query: string,
  rows: readonly PaletteRow[],
): readonly PaletteRow[] {
  if (shown.query !== query) return rows;
  const place = new Map(shown.ids.map((id, index) => [id, index]));
  const before = rows
    .filter((row) => place.has(row.id))
    .toSorted((a, b) => (place.get(a.id) ?? 0) - (place.get(b.id) ?? 0));
  return [...before, ...rows.filter((row) => !place.has(row.id))];
}

/** Ranked rows in one section per kind, each section in the order its first row came. */
function sectionsByKind(rows: readonly PaletteRow[]): Section[] {
  const kinds = new Map<PaletteRow["kind"], PaletteRow[]>();
  for (const row of rows) {
    const ofKind = kinds.get(row.kind);
    if (ofKind === undefined) kinds.set(row.kind, [row]);
    else ofKind.push(row);
  }
  return [...kinds].map(([kind, ofKind]) => ({
    key: kind,
    label: SECTION_LABELS[kind],
    groups: [asRows(ofKind)],
  }));
}

/** The sections the palette lists for `query`, inside `menu` when one is open. */
export function usePaletteSections(options: {
  filter: PaletteFilter;
  sources: readonly PaletteSource[];
  recent: readonly string[];
  query: string;
  menu: MenuId | null;
}): readonly Section[] {
  const { filter, sources, recent, query, menu } = options;
  const { service } = useCommands();
  const shown = useRef<{ query: string; ids: readonly string[] }>({
    query: "",
    ids: [],
  });
  const active =
    filter === "places" ? sources.filter((s) => s.kind === "place") : sources;
  // every row, by id, asked of the sources once per drawing
  let byId: Map<string, PaletteRow> | null = null;
  const rowsIn = (ids: readonly string[]): PaletteRow[] => {
    byId ??= new Map(
      active.flatMap((s) => s.rows("")).map((row) => [row.id, row]),
    );
    const rows = byId;
    return ids.flatMap((id) => rows.get(id) ?? []);
  };
  const ranked = (
    inMenu: ReadonlySet<string> | null,
  ): readonly PaletteRow[] => {
    const found = active
      .flatMap((s) => s.rows(query))
      .filter((row) => inMenu === null || inMenu.has(row.id));
    const rows = mark("ui.search.palette", () =>
      keepShownOrder(shown.current, query, rankRows(query, found)),
    );
    shown.current = { query, ids: rows.map((row) => row.id) };
    return rows;
  };

  if (filter === "all" && menu !== null) {
    const groups = menuModel(menu, COMMANDS, service).groups.map((group) =>
      group.map((item) => item.id),
    );
    const found = (
      query === ""
        ? groups.map((ids) => asRows(rowsIn(ids)))
        : [asRows(ranked(new Set(groups.flat())))]
    ).filter((group) => group.length > 0);
    // the menu's name is the one statement of where the person is, so it is drawn whenever a row is
    return found.length === 0
      ? []
      : [{ key: menu, label: MENU_LABELS[menu], groups: found }];
  }
  if (filter === "all" && query === "") {
    const last = asRows(rowsIn(recent.slice(0, RECENT_LIMIT)));
    return labelled([
      ...(last.length === 0
        ? []
        : [{ key: "recent", label: PALETTE_WORDS.recent, groups: [last] }]),
      {
        key: "menus",
        label: PALETTE_WORDS.menus,
        groups: [menuEntries(service)],
      },
    ]);
  }
  return labelled(sectionsByKind(ranked(null)));
}
