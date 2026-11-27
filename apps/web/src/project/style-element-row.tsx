// Collapsible single-element row for Project settings → Element style: compact summary at rest, 2×2 editor when open.
import type { ElementStyle } from "@manent/settings";
import {
  Button,
  Input,
  PROJECT_WORDS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@manent/ui";
import { ChevronRightIcon } from "lucide-react";
import { useId, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  changedSummary,
  defaultSummary,
  entryHasVisibleChanges,
} from "./style-defaults.ts";
import type { StyleElement } from "./style-defaults.ts";

const CAPITALS_CHOICES = Object.freeze([
  { value: "as_format", label: PROJECT_WORDS.styleCapitals.asFormat },
  { value: "on", label: PROJECT_WORDS.styleCapitals.on },
  { value: "off", label: PROJECT_WORDS.styleCapitals.off },
]);

function capitalsValue(capitalized: boolean | null): string {
  if (capitalized === null) return "as_format";
  return capitalized ? "on" : "off";
}

function parseCapitals(chosen: string): boolean | null {
  if (chosen === "on") return true;
  if (chosen === "off") return false;
  return null;
}

function UnitInput(props: {
  id: string;
  value: number | null;
  placeholder: string;
  disabled: boolean;
  integer: boolean;
  positive: boolean;
  format: (value: number) => string;
  onCommit: (value: number | null) => void;
}): ReactNode {
  const {
    id,
    value,
    placeholder,
    disabled,
    integer,
    positive,
    format,
    onCommit,
  } = props;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const shown = focused ? draft : value === null ? "" : format(value);

  const commit = (): void => {
    setFocused(false);
    const trimmed = draft.trim().replace(/\s*(lines?|in)$/i, "");
    if (trimmed === "") {
      if (value !== null) onCommit(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    if (positive ? parsed <= 0 : parsed < 0) return;
    const rounded = integer ? Math.round(parsed) : Math.round(parsed * 10) / 10;
    if (positive && rounded <= 0) return;
    if (!Object.is(rounded, value)) onCommit(rounded);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFocused(false);
      setDraft(value === null ? "" : String(value));
      event.currentTarget.blur();
    }
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      disabled={disabled}
      placeholder={placeholder}
      value={shown}
      className="h-control bg-raised! tabular-nums text-ui"
      onFocus={() => {
        setFocused(true);
        setDraft(value === null ? "" : String(value));
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

/** One element's progressive-disclosure row and 2×2 editor under Project settings → Element style. */
export function StyleElementRow(props: {
  element: StyleElement;
  entry: ElementStyle;
  disabled: boolean;
  onChange: (next: ElementStyle) => void;
  onReset: () => void;
}): ReactNode {
  const { element, entry, disabled, onChange, onReset } = props;
  const [open, setOpen] = useState(false);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const capitalsId = `${baseId}-capitals`;
  const spaceId = `${baseId}-space`;
  const indentId = `${baseId}-indent`;
  const widthId = `${baseId}-width`;
  const hasChange = entryHasVisibleChanges(entry);
  const { defaults } = element;
  const summary = hasChange ? changedSummary(entry) : defaultSummary(defaults);

  const spacePlaceholder =
    defaults === null
      ? PROJECT_WORDS.styleAsFormat
      : PROJECT_WORDS.styleDefaultValue(
          PROJECT_WORDS.styleLines(defaults.spaceBefore),
        );
  const indentPlaceholder =
    defaults === null
      ? PROJECT_WORDS.styleAsFormat
      : PROJECT_WORDS.styleDefaultValue(
          PROJECT_WORDS.styleInches(defaults.indentInches),
        );
  const widthPlaceholder =
    defaults === null
      ? PROJECT_WORDS.styleAsFormat
      : PROJECT_WORDS.styleDefaultValue(
          PROJECT_WORDS.styleInches(defaults.widthInches),
        );

  return (
    <div data-element={element.key} className="flex flex-col">
      <div className="flex items-center gap-2 pe-3 transition-colors hover:bg-subtle">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((was) => !was)}
          className="flex min-h-row-2 min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                "size-icon shrink-0 text-fg-muted duration-(--dur-fast) ease-out motion-safe:transition-transform",
                open && "rotate-90 text-fg",
              )}
            />
            <span className="truncate text-ui font-medium text-fg">
              {element.label}
            </span>
            {hasChange ? (
              <span
                aria-hidden="true"
                className="mn-setting-dot size-1.5 shrink-0 rounded-full bg-primary"
              />
            ) : null}
          </span>
          <span
            className={cn(
              "truncate tabular-nums text-meta",
              hasChange ? "font-medium text-fg" : "text-fg-muted",
            )}
          >
            {summary}
          </span>
        </button>
        {hasChange && !disabled ? (
          <Button
            variant="link"
            size="sm"
            className="h-auto shrink-0 cursor-pointer p-0 text-meta"
            onClick={onReset}
          >
            {PROJECT_WORDS.styleReset}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div
          id={panelId}
          className="animate-in border-t border-line bg-subtle px-4 py-3 duration-(--dur-fast) ease-out fade-in-0"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={capitalsId} className="text-meta text-fg-muted">
                {PROJECT_WORDS.styleFields.capitals}
              </label>
              <Select
                items={CAPITALS_CHOICES}
                value={capitalsValue(entry.capitalized)}
                onValueChange={(chosen) =>
                  onChange({
                    ...entry,
                    capitalized: parseCapitals(chosen ?? "as_format"),
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger
                  id={capitalsId}
                  className="h-control w-full bg-raised! text-ui"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPITALS_CHOICES.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={spaceId} className="text-meta text-fg-muted">
                {PROJECT_WORDS.styleFields.spaceBefore}
              </label>
              <UnitInput
                id={spaceId}
                value={entry.spaceBefore}
                placeholder={spacePlaceholder}
                disabled={disabled}
                integer
                positive={false}
                format={PROJECT_WORDS.styleLines}
                onCommit={(spaceBefore) => onChange({ ...entry, spaceBefore })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={indentId} className="text-meta text-fg-muted">
                {PROJECT_WORDS.styleFields.indent}
              </label>
              <UnitInput
                id={indentId}
                value={entry.indent}
                placeholder={indentPlaceholder}
                disabled={disabled}
                integer={false}
                positive={false}
                format={(n) => PROJECT_WORDS.styleInches(String(n))}
                onCommit={(indent) => onChange({ ...entry, indent })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={widthId} className="text-meta text-fg-muted">
                {PROJECT_WORDS.styleFields.width}
              </label>
              <UnitInput
                id={widthId}
                value={entry.width}
                placeholder={widthPlaceholder}
                disabled={disabled}
                integer={false}
                positive
                format={(n) => PROJECT_WORDS.styleInches(String(n))}
                onCommit={(width) => onChange({ ...entry, width })}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
