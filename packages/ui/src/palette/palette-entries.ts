// What the palette lists, in sections: Smart Home (suggested, quick settings, recent, menus), an opened menu, or ranked query results.
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
import type {
  PaletteFilter,
  PaletteRow,
  PaletteScope,
  PaletteSource,
} from "./palette-sources.ts";

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

const SECTION_LABELS: Readonly<Record<PaletteRow["kind"], string | null>> =
  Object.freeze({
    ...PALETTE_WORDS.sections,
    // no source finds help yet
    help: null,
  });

const SCOPE_KINDS: Readonly<
  Record<Exclude<PaletteScope, "all">, PaletteRow["kind"]>
> = Object.freeze({
  commands: "command",
  settings: "setting",
  places: "place",
  documents: "document",
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
  shown: { key: string; ids: readonly string[] },
  key: string,
  rows: readonly PaletteRow[],
): readonly PaletteRow[] {
  if (shown.key !== key) return rows;
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

/** Returns the scope pills available for the currently mounted sources. */
export function availableScopes(
  sources: readonly PaletteSource[],
): readonly PaletteScope[] {
  const kinds = new Set(sources.map((s) => s.kind));
  const scopes: PaletteScope[] = ["all"];
  if (kinds.has("command")) scopes.push("commands");
  if (kinds.has("setting")) scopes.push("settings");
  if (kinds.has("place")) scopes.push("places");
  if (kinds.has("document")) scopes.push("documents");
  return scopes;
}

/** The sections the palette lists for `query`, inside `menu` or `scope` when active. */
export function usePaletteSections(options: {
  filter: PaletteFilter;
  scope: PaletteScope;
  sources: readonly PaletteSource[];
  recent: readonly string[];
  suggested?: readonly string[];
  quickSettings?: readonly string[];
  boost?: (row: PaletteRow) => number;
  query: string;
  menu: MenuId | null;
}): readonly Section[] {
  const {
    filter,
    scope,
    sources,
    recent,
    suggested = [],
    quickSettings = [],
    boost,
    query,
    menu,
  } = options;
  const { service } = useCommands();
  const shown = useRef<{ key: string; ids: readonly string[] }>({
    key: "",
    ids: [],
  });
  const active =
    filter === "places"
      ? sources.filter((s) => s.kind === "place")
      : filter === "all" && scope !== "all"
        ? sources.filter((s) => s.kind === SCOPE_KINDS[scope])
        : sources;

  let byId: Map<string, PaletteRow> | null = null;
  const rowsIn = (
    ids: readonly string[],
    pool: readonly PaletteSource[] = active,
  ): PaletteRow[] => {
    if (pool === active) {
      byId ??= new Map(
        active.flatMap((s) => s.rows("")).map((row) => [row.id, row]),
      );
      const rows = byId;
      return ids.flatMap((id) => rows.get(id) ?? []);
    }
    const map = new Map(
      pool.flatMap((s) => s.rows("")).map((row) => [row.id, row]),
    );
    return ids.flatMap((id) => map.get(id) ?? []);
  };

  const ranked = (
    inMenu: ReadonlySet<string> | null,
  ): readonly PaletteRow[] => {
    const found = active
      .flatMap((s) => s.rows(query))
      .filter((row) => inMenu === null || inMenu.has(row.id));
    const shownKey = `${scope}\0${menu ?? ""}\0${query}`;
    const rows = mark("ui.search.palette", () =>
      keepShownOrder(
        shown.current,
        shownKey,
        rankRows(query, found, { boost }),
      ),
    );
    shown.current = { key: shownKey, ids: rows.map((row) => row.id) };
    return rows;
  };

  if (filter === "all" && menu !== null) {
    const groups = menuModel(menu, COMMANDS, service).groups.map((group) =>
      group.map((item) => item.id),
    );
    const found = (
      query === ""
        ? groups.map((ids) => asRows(rowsIn(ids, sources)))
        : [asRows(ranked(new Set(groups.flat())))]
    ).filter((group) => group.length > 0);
    return found.length === 0
      ? []
      : [{ key: menu, label: MENU_LABELS[menu], groups: found }];
  }

  if (filter === "all" && query === "") {
    if (scope === "places" || scope === "documents") {
      return labelled(sectionsByKind(ranked(null)));
    }
    if (scope === "settings") {
      const quick = asRows(rowsIn(quickSettings));
      const quickSet = new Set(quickSettings);
      const rest = asRows(ranked(null).filter((row) => !quickSet.has(row.id)));
      return labelled([
        ...(quick.length === 0
          ? []
          : [
              {
                key: "quick_settings",
                label: PALETTE_WORDS.quickSettings,
                groups: [quick],
              },
            ]),
        ...(rest.length === 0
          ? []
          : [
              {
                key: "setting",
                label: PALETTE_WORDS.sections.setting,
                groups: [rest],
              },
            ]),
      ]);
    }
    const suggestedRows = asRows(rowsIn(suggested));
    const quickRows = scope === "commands" ? [] : asRows(rowsIn(quickSettings));
    const shownAbove = new Set([
      ...suggested,
      ...(scope === "commands" ? [] : quickSettings),
    ]);
    const recentIds = recent
      .filter((id) => !shownAbove.has(id))
      .slice(0, RECENT_LIMIT);
    const last = asRows(rowsIn(recentIds));
    const sections: Section[] = [
      ...(suggestedRows.length === 0
        ? []
        : [
            {
              key: "suggested",
              label: PALETTE_WORDS.suggested,
              groups: [suggestedRows],
            },
          ]),
      ...(quickRows.length === 0
        ? []
        : [
            {
              key: "quick_settings",
              label: PALETTE_WORDS.quickSettings,
              groups: [quickRows],
            },
          ]),
      ...(last.length === 0
        ? []
        : [{ key: "recent", label: PALETTE_WORDS.recent, groups: [last] }]),
      {
        key: "menus",
        label: PALETTE_WORDS.menus,
        groups: [menuEntries(service)],
      },
    ];
    return labelled(sections);
  }
  return labelled(sectionsByKind(ranked(null)));
}
