// The palette's list: its sections and rows, drawn in full up to 100 rows and as a window of rows above.
import { Autocomplete } from "@base-ui/react/autocomplete";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { Fragment, useRef } from "react";
import type { ReactNode, RefObject } from "react";
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

/** What a row's parts are drawn with; `home` is false inside an opened menu, whose label already names it. */
interface Drawing {
  query: string;
  home: boolean;
  activate(entry: Entry): void;
}

function RowContent(props: { row: PaletteRow; drawing: Drawing }): ReactNode {
  const { row, drawing } = props;
  const label =
    row.enabled || row.whyNot === null
      ? row.label
      : READOUT_WORDS.unavailable(row.label, row.whyNot);
  return (
    <>
      <span className="min-w-0 flex-1 truncate">
        {matchedRuns(drawing.query, label).map((run, index) =>
          run.matched ? (
            <span key={index} className="font-semibold">
              {run.text}
            </span>
          ) : (
            run.text
          ),
        )}
        {row.value === null ? null : `: ${row.value}`}
        {row.scopeWord === null ? null : (
          <span className="text-fg-muted"> · {row.scopeWord}</span>
        )}
        {row.checked === true ? (
          <span className="sr-only">{PALETTE_WORDS.chosen}</span>
        ) : null}
      </span>
      {row.home === null || !drawing.home ? null : (
        <span className={HOME}>{row.home}</span>
      )}
      {row.checked === true ? (
        <CheckIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-fg-accent"
        />
      ) : null}
      {row.keys === null ? null : <Kbd aria-hidden="true">{row.keys}</Kbd>}
    </>
  );
}

function EntryItem(props: {
  entry: Entry;
  index: number;
  drawing: Drawing;
}): ReactNode {
  const { entry, index, drawing } = props;
  return (
    <Autocomplete.Item
      value={entry}
      index={index}
      disabled={entry.type === "row" && !entry.row.enabled}
      onClick={() => drawing.activate(entry)}
      className="mn-row flex min-h-row items-center gap-2 px-2 text-ui"
    >
      {entry.type === "menu" ? (
        <>
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          <ChevronRightIcon
            aria-hidden="true"
            className="size-icon shrink-0 text-fg-muted"
          />
        </>
      ) : (
        <RowContent row={entry.row} drawing={drawing} />
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
      className="min-h-0 flex-1 overflow-auto p-1 empty:hidden"
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
