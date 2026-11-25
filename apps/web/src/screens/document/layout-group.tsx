// Details → Selection → Layout: the caret block's alignment, indent, width and space before.
import { ALIGNMENTS } from "@manent/schema";
import type { Alignment } from "@manent/schema";
import type { Choice } from "@manent/settings";
import { EDITOR_WORDS, Input, Label, Segmented } from "@manent/ui";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import { useCanEdit } from "./ruler-bar.tsx";

const WORDS = EDITOR_WORDS.layout;
// the page counts ten cells to the inch, as the Ruler draws it
const CELLS_PER_INCH = 10;
const ALIGNMENT_LABELS: Readonly<Record<Alignment, string>> = {
  left: WORDS.left,
  center: WORDS.centre,
  right: WORDS.right,
};
const ALIGNMENT_CHOICES: readonly Choice<Alignment>[] = Object.freeze(
  ALIGNMENTS.map((value) => ({ value, label: ALIGNMENT_LABELS[value] })),
);

const isAlignment = (value: string): value is Alignment =>
  ALIGNMENTS.some((alignment) => alignment === value);

/** How a field writes and reads its value: cells shown as inches, or whole lines. */
interface Unit {
  shown(value: number): string;
  /** The value as a screen reader's number: inches, or lines. */
  amount(value: number): number;
  /** Null unless `text` is a number, optionally followed by the unit's own word. */
  typed(text: string): number | null;
}

const IN_INCHES = /^\s*(\d+(?:\.\d+)?)\s*(?:in)?\s*$/;
const IN_LINES = /^\s*(\d+(?:\.\d+)?)\s*(?:lines?)?\s*$/;

const numberIn = (pattern: RegExp, text: string): number | null => {
  const digits = pattern.exec(text)?.[1];
  return digits === undefined ? null : Number(digits);
};

const INCHES: Unit = {
  shown: (cells) => WORDS.inches((cells / CELLS_PER_INCH).toFixed(1)),
  amount: (cells) => cells / CELLS_PER_INCH,
  typed: (text) => {
    const typed = numberIn(IN_INCHES, text);
    return typed === null ? null : Math.round(typed * CELLS_PER_INCH);
  },
};
const LINES: Unit = {
  shown: WORDS.lines,
  amount: (lines) => lines,
  typed: (text) => {
    const typed = numberIn(IN_LINES, text);
    return typed === null ? null : Math.round(typed);
  },
};

// one cell (a tenth of an inch) or one line, never below 0; the action clamps the rest
const ARROW_STEPS: Readonly<Record<string, number>> = {
  ArrowUp: 1,
  ArrowDown: -1,
};

/**
 * Shows the fact's value; what is typed or stepped with the arrow keys commits on Enter or when the field loses focus,
 * never per key, and the field shows the fact again after, which holds the value as the action clamped it.
 */
function LayoutField(props: {
  label: string;
  value: number | null;
  unit: Unit;
  readOnly: boolean;
  onCommit(value: number): void;
}): ReactNode {
  const { label, value, unit } = props;
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const current = (draft === null ? null : unit.typed(draft)) ?? value;
  const commit = (): void => {
    if (draft === null) return;
    setDraft(null);
    const next = unit.typed(draft);
    if (next !== null && next !== value) props.onCommit(next);
  };
  const step = (by: number): void => {
    if (props.readOnly || current === null) return;
    setDraft(unit.shown(Math.max(0, current + by)));
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Label htmlFor={id} className="text-ui">
        {label}
      </Label>
      <Input
        id={id}
        role="spinbutton"
        inputMode="decimal"
        aria-valuenow={current === null ? undefined : unit.amount(current)}
        aria-valuetext={current === null ? undefined : unit.shown(current)}
        readOnly={props.readOnly}
        value={draft ?? (value === null ? "" : unit.shown(value))}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          const by = ARROW_STEPS[event.key];
          if (by === undefined && event.key !== "Enter") return;
          event.preventDefault();
          if (by === undefined) commit();
          else step(by);
        }}
        onBlur={commit}
        className="h-control w-24 text-ui"
      />
    </div>
  );
}

/** Drawn while the caret is in a block of a paged script; read-only for a person who cannot edit. */
export function LayoutGroup(props: { docId: string }): ReactNode {
  const { editor } = useServices();
  const editable = useCanEdit(props.docId);
  const blockId = useEditorFact("blockId");
  const columnCells = useEditorFact("columnCells");
  const indent = useEditorFact("blockIndent");
  const width = useEditorFact("blockWidth");
  const align = useEditorFact("blockAlign");
  const spaceBefore = useEditorFact("blockSpaceBefore");
  if (blockId === null || columnCells === null) return null;
  const run = (action: Parameters<typeof editor.run>[0]): void => {
    if (editable) editor.run(action);
  };
  return (
    <section className="flex flex-col gap-2">
      <h3 className="pt-2 text-ui font-semibold">{WORDS.group}</h3>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ui">{WORDS.alignment}</span>
        <Segmented
          label={WORDS.alignment}
          value={align ?? ""}
          options={ALIGNMENT_CHOICES}
          onChange={(chosen) => {
            if (isAlignment(chosen)) run({ kind: "layout", align: chosen });
          }}
        />
      </div>
      <LayoutField
        label={WORDS.indent}
        value={indent}
        unit={INCHES}
        readOnly={!editable}
        onCommit={(cells) => run({ kind: "layout", indent: cells })}
      />
      <LayoutField
        label={WORDS.width}
        value={width}
        unit={INCHES}
        readOnly={!editable}
        onCommit={(cells) => run({ kind: "layout", width: cells })}
      />
      <LayoutField
        label={WORDS.spaceBefore}
        value={spaceBefore}
        unit={LINES}
        readOnly={!editable}
        onCommit={(lines) => run({ kind: "layout", spaceBefore: lines })}
      />
    </section>
  );
}
