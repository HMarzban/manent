// Details → Selection → Layout: the caret block's alignment, indent, width and space before.
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
const ALIGNMENT_CHOICES: readonly Choice<Alignment>[] = Object.freeze([
  { value: "left", label: WORDS.left },
  { value: "center", label: WORDS.centre },
  { value: "right", label: WORDS.right },
]);

const isAlignment = (value: string): value is Alignment =>
  ALIGNMENT_CHOICES.some((choice) => choice.value === value);

/** The number typed at the start of `text`; null when it starts with none. */
const typedNumber = (text: string): number | null => {
  const typed = Number.parseFloat(text);
  return Number.isFinite(typed) ? typed : null;
};

const inches = (cells: number): string =>
  WORDS.inches((cells / CELLS_PER_INCH).toFixed(1));
const cellsTyped = (text: string): number | null => {
  const typed = typedNumber(text);
  return typed === null ? null : Math.round(typed * CELLS_PER_INCH);
};
const linesTyped = (text: string): number | null => {
  const typed = typedNumber(text);
  return typed === null ? null : Math.round(typed);
};

/**
 * Shows the fact's value; what is typed commits on Enter or when the field loses focus, never per key, and the field
 * shows the fact again after, which holds the value as the action clamped it.
 */
function LayoutField(props: {
  label: string;
  value: number | null;
  shown(value: number): string;
  typed(text: string): number | null;
  readOnly: boolean;
  onCommit(value: number): void;
}): ReactNode {
  const { label, value } = props;
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    if (draft === null) return;
    setDraft(null);
    const next = props.typed(draft);
    if (next !== null && next !== value) props.onCommit(next);
  };
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="text-ui">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        readOnly={props.readOnly}
        value={draft ?? (value === null ? "" : props.shown(value))}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
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
      <h3 className="text-meta font-semibold">{WORDS.group}</h3>
      <div className="flex items-center justify-between gap-2">
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
        shown={inches}
        typed={cellsTyped}
        readOnly={!editable}
        onCommit={(cells) => run({ kind: "layout", indent: cells })}
      />
      <LayoutField
        label={WORDS.width}
        value={width}
        shown={inches}
        typed={cellsTyped}
        readOnly={!editable}
        onCommit={(cells) => run({ kind: "layout", width: cells })}
      />
      <LayoutField
        label={WORDS.spaceBefore}
        value={spaceBefore}
        shown={WORDS.lines}
        typed={linesTyped}
        readOnly={!editable}
        onCommit={(lines) => run({ kind: "layout", spaceBefore: lines })}
      />
    </section>
  );
}
