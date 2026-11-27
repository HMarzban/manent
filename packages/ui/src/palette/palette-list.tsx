// The palette's list: its sections and rows, drawn in full up to 100 rows and as a window of rows above.
import { Autocomplete } from "@base-ui/react/autocomplete";
import type { MenuId } from "@manent/settings";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlignLeftIcon,
  AppWindowIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  ClapperboardIcon,
  EyeIcon,
  FileTextIcon,
  FolderOpenIcon,
  HashIcon,
  PencilIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
  TypeIcon,
  UserIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Fragment, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import {
  commandIconFor,
  isDestructiveCommand,
} from "../commands-react/command-icons.tsx";
import { Kbd } from "../components/stock/kbd.tsx";
import { READOUT_WORDS } from "../words/document.ts";
import { PALETTE_WORDS } from "../words/palette.ts";
import { entriesOf, keyOf } from "./palette-entries.ts";
import type { Entry, Section } from "./palette-entries.ts";
import { matchedRuns } from "./palette-rank.ts";
import type { PaletteRow } from "./palette-sources.ts";

export const VIRTUAL_ABOVE = 100;
// the row token at Interface size 100 %, until a row is measured
const ROW_PX = 28;

// below this width of the palette a row drops its home, so the label keeps the room
const HOME = "text-meta text-fg-muted @max-[30rem]:hidden";

const sizeOf = (element: Element): number =>
  element.getBoundingClientRect().height || ROW_PX;

const MENU_ICONS: Readonly<Partial<Record<MenuId, LucideIcon>>> = Object.freeze(
  {
    app: SettingsIcon,
    file: FolderOpenIcon,
    edit: PencilIcon,
    view: EyeIcon,
    format: TypeIcon,
    script: FileTextIcon,
    production: ClapperboardIcon,
    window: AppWindowIcon,
    help: CircleHelpIcon,
  },
);

function iconForRow(row: PaletteRow): LucideIcon {
  const mapped = commandIconFor(row.id);
  if (mapped !== null) return mapped;
  switch (row.kind) {
    case "setting":
      return SlidersHorizontalIcon;
    case "place":
      if (row.id.startsWith("place:page:")) return HashIcon;
      if (row.id.startsWith("place:scene:")) return ClapperboardIcon;
      return AlignLeftIcon;
    case "document":
      return FileTextIcon;
    case "person":
      return UserIcon;
    case "help":
      return CircleHelpIcon;
    case "command":
      return TerminalIcon;
  }
}

/** What a row's parts are drawn with; `home` is false inside an opened menu, whose label already names it. */
interface Drawing {
  query: string;
  home: boolean;
  activate(entry: Entry): void;
}

function RowContent(props: { row: PaletteRow; drawing: Drawing }): ReactNode {
  const { row, drawing } = props;
  const Icon = iconForRow(row);
  return (
    <>
      <span
        aria-hidden="true"
        className="mn-palette-icon flex w-4 shrink-0 items-center justify-center"
      >
        <Icon className="size-icon shrink-0" />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {matchedRuns(drawing.query, row.label).map((run, index) =>
          run.matched ? (
            <span key={index} className="font-semibold">
              {run.text}
            </span>
          ) : (
            run.text
          ),
        )}
        {!row.enabled && row.whyNot !== null ? (
          <span className="text-fg-muted">
            {PALETTE_WORDS.whyNotSuffix(row.whyNot)}
          </span>
        ) : null}
        {row.scopeWord === null ? null : (
          <span className="text-fg-muted">
            {PALETTE_WORDS.scopeSeparator(row.scopeWord)}
          </span>
        )}
        {row.checked === true ? (
          <span className="sr-only">{PALETTE_WORDS.chosen}</span>
        ) : null}
      </span>
      {row.value === null ? null : (
        <span
          data-state={row.value === READOUT_WORDS.valueOn ? "on" : "off"}
          className="mn-palette-toggle inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-micro font-medium tabular-nums"
        >
          <span aria-hidden="true" className="mn-palette-toggle-dot" />
          <span>{row.value}</span>
        </span>
      )}
      {row.home === null || !drawing.home ? null : (
        <span className={HOME}>{row.home}</span>
      )}
      {row.checked === true ? (
        <CheckIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-fg-accent"
        />
      ) : null}
      {row.keys === null ? null : (
        <Kbd aria-hidden="true" className="mn-palette-kbd">
          {row.keys}
        </Kbd>
      )}
    </>
  );
}

function EntryItem(props: {
  entry: Entry;
  index: number;
  drawing: Drawing;
}): ReactNode {
  const { entry, index, drawing } = props;
  const isRow = entry.type === "row";
  const MenuIcon = isRow ? null : (MENU_ICONS[entry.menu] ?? FolderOpenIcon);
  return (
    <Autocomplete.Item
      value={entry}
      index={index}
      data-tour={isRow ? entry.row.id : undefined}
      data-checked={isRow && entry.row.checked === true ? "true" : undefined}
      data-variant={
        isRow && isDestructiveCommand(entry.row.id) ? "destructive" : undefined
      }
      // not `disabled`, which would leave a press and Enter unheard: an unavailable row says why it cannot run
      aria-disabled={isRow && !entry.row.enabled ? true : undefined}
      onClick={() => drawing.activate(entry)}
      className="mn-row mn-palette-row flex min-h-row items-center gap-2 px-2 text-ui"
    >
      {isRow ? (
        <RowContent row={entry.row} drawing={drawing} />
      ) : (
        <>
          <span
            aria-hidden="true"
            className="mn-palette-icon flex w-4 shrink-0 items-center justify-center"
          >
            {MenuIcon === null ? null : (
              <MenuIcon className="size-icon shrink-0" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          <ChevronRightIcon
            aria-hidden="true"
            className="mn-palette-chevron size-icon shrink-0 text-fg-muted"
          />
        </>
      )}
    </Autocomplete.Item>
  );
}

/** Sections drawn in full: each a group named by its label, with a separator between its groups. */
function SectionEntries(props: {
  sections: readonly Section[];
  drawing: Drawing;
}): ReactNode {
  const { sections, drawing } = props;
  let index = 0;
  return sections.map((section) => {
    const rows = section.groups.map((group, at) => (
      <Fragment key={at}>
        {at === 0 ? null : (
          <Autocomplete.Separator className="my-1 h-px bg-line" />
        )}
        {group.map((entry) => (
          <EntryItem
            key={keyOf(entry)}
            entry={entry}
            index={index++}
            drawing={drawing}
          />
        ))}
      </Fragment>
    ));
    return section.label === null ? (
      <Fragment key={section.key}>{rows}</Fragment>
    ) : (
      <Autocomplete.Group key={section.key}>
        <Autocomplete.GroupLabel className="mn-group-label">
          {section.label}
        </Autocomplete.GroupLabel>
        {rows}
      </Autocomplete.Group>
    );
  });
}

type Line =
  | { type: "label"; key: string; text: string }
  | { type: "entry"; entry: Entry; index: number };

/** The lines of a windowed list: a section's label is a line of its own; a list this long is a search's, one group per section. */
function linesOf(sections: readonly Section[]): Line[] {
  let index = 0;
  return sections.flatMap((section): Line[] => {
    const entries = section.groups
      .flat()
      .map((entry): Line => ({ type: "entry", entry, index: index++ }));
    if (section.label === null) return entries;
    const label: Line = {
      type: "label",
      key: `label:${section.key}`,
      text: section.label,
    };
    return [label, ...entries];
  });
}

function VirtualEntries(props: {
  sections: readonly Section[];
  drawing: Drawing;
  /** The list that scrolls; the window is drawn for its height and offset. */
  scroller: RefObject<HTMLDivElement | null>;
}): ReactNode {
  const { sections, drawing, scroller } = props;
  const lines = linesOf(sections);
  const virtual = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_PX,
    measureElement: sizeOf,
  });
  return (
    <div className="relative" style={{ height: virtual.getTotalSize() }}>
      {virtual.getVirtualItems().map((item) => {
        const line = lines[item.index];
        if (line === undefined) return null;
        return (
          <div
            key={line.type === "label" ? line.key : keyOf(line.entry)}
            ref={virtual.measureElement}
            data-index={item.index}
            className="absolute inset-x-0"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            {line.type === "label" ? (
              // the label of a windowed section is not a group's: its rows may not be drawn
              <div aria-hidden="true" className="mn-group-label">
                {line.text}
              </div>
            ) : (
              <EntryItem
                entry={line.entry}
                index={line.index}
                drawing={drawing}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The one scrolling list, named `label`: its sections in full up to 100 rows, a window of rows above. */
export function EntryList(props: {
  sections: readonly Section[];
  label: string;
  drawing: Drawing;
}): ReactNode {
  const { sections, label, drawing } = props;
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <Autocomplete.List
      ref={scroller}
      aria-label={label}
      className="min-h-0 flex-1 overflow-auto p-1 pb-2 scroll-pb-2 empty:hidden"
    >
      {entriesOf(sections).length > VIRTUAL_ABOVE ? (
        <VirtualEntries
          sections={sections}
          drawing={drawing}
          scroller={scroller}
        />
      ) : (
        <SectionEntries sections={sections} drawing={drawing} />
      )}
    </Autocomplete.List>
  );
}
