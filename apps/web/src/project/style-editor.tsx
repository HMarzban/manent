// Project settings' Element style editor: per-element Capitals, Space before, Indent, Width and Reset.
import { ACT_BREAK_KINDS, FORMAT_ELEMENTS } from "@manent/schema";
import type { BlockType, FormatId } from "@manent/schema";
import { SETTINGS } from "@manent/settings";
import type { ElementStyle } from "@manent/settings";
import {
  Button,
  Input,
  PROJECT_WORDS,
  SHARING_WORDS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useSetting,
  useSettingsStore,
} from "@manent/ui";
import type { Message } from "@manent/ui";
import { useId, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { editorWords } from "../editor-host/editor-words.ts";
import { useProjectItem } from "../screens/project-settings/project-data.ts";
import type { ProjectSettingRowProps } from "../screens/project-settings/project-setting-rows.ts";
import { useServices } from "../services/context.tsx";
import type { ProjectKind } from "../services/ports.ts";

type StyleMap = Readonly<Record<string, ElementStyle>>;

const EMPTY_ENTRY: ElementStyle = Object.freeze({
  capitalized: null,
  underlined: null,
  bold: null,
  colour: null,
  spaceBefore: null,
  indent: null,
  width: null,
});

const TEMPLATE_FORMATS: Readonly<Record<string, FormatId>> = Object.freeze({
  screenplay: "screenplay",
  drama: "screenplay",
  single_camera: "screenplay",
  multi_camera: "multicam",
  animation: "animation",
  variety: "variety",
  news: "variety",
  podcast: "screenplay",
  manuscript: "manuscript",
  game: "game",
  stage_play: "stage_play",
  custom: "screenplay",
});

const UNSTYLED_TYPES: ReadonlySet<BlockType> = new Set([
  "group",
  "page_break",
  "ink_line",
  "graphic",
]);

interface StyleElement {
  readonly key: string;
  readonly label: string;
}

function elementsFor(
  template: string,
  kind: ProjectKind | null,
): StyleElement[] {
  const format = TEMPLATE_FORMATS[template] ?? "screenplay";
  const words = editorWords(kind);
  const out: StyleElement[] = [];
  for (const type of FORMAT_ELEMENTS[format]) {
    if (UNSTYLED_TYPES.has(type)) continue;
    if (type === "act_break") {
      for (const actKind of ACT_BREAK_KINDS) {
        out.push({
          key: `act_break.${actKind}`,
          label: words.element(format, "act_break", actKind),
        });
      }
    } else {
      out.push({
        key: type,
        label: words.element(format, type, null),
      });
    }
  }
  return out;
}

function entryIsEmpty(entry: ElementStyle): boolean {
  return (
    entry.capitalized === null &&
    entry.underlined === null &&
    entry.bold === null &&
    entry.colour === null &&
    entry.spaceBefore === null &&
    entry.indent === null &&
    entry.width === null
  );
}

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
  disabled: boolean;
  integer: boolean;
  positive: boolean;
  format: (value: number) => string;
  onCommit: (value: number | null) => void;
}): ReactNode {
  const { id, value, disabled, integer, positive, format, onCommit } = props;
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
      placeholder={PROJECT_WORDS.styleAsFormat}
      value={shown}
      className="h-control tabular-nums text-ui"
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

/** One element's four Stage 2 style fields and Reset button under Project settings → Format and style. */
function ElementRow(props: {
  element: StyleElement;
  entry: ElementStyle;
  disabled: boolean;
  onChange: (next: ElementStyle) => void;
  onReset: () => void;
}): ReactNode {
  const { element, entry, disabled, onChange, onReset } = props;
  const baseId = useId();
  const capitalsId = `${baseId}-capitals`;
  const spaceId = `${baseId}-space`;
  const indentId = `${baseId}-indent`;
  const widthId = `${baseId}-width`;
  const hasChange =
    entry.capitalized !== null ||
    entry.spaceBefore !== null ||
    entry.indent !== null ||
    entry.width !== null;

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ui font-medium">{element.label}</span>
        {hasChange ? (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-meta"
            disabled={disabled}
            onClick={onReset}
          >
            {PROJECT_WORDS.styleReset}
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            <SelectTrigger id={capitalsId} className="h-control w-full text-ui">
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
            disabled={disabled}
            integer={false}
            positive
            format={(n) => PROJECT_WORDS.styleInches(String(n))}
            onCommit={(width) => onChange({ ...entry, width })}
          />
        </div>
      </div>
    </div>
  );
}

/** Per-element style table for `project.style` under Project settings → Format and style. */
export function ElementStyleRow(props: ProjectSettingRowProps): ReactNode {
  const { settingKey, projectId } = props;
  const services = useServices();
  const store = useSettingsStore();
  const style = useSetting("project.style");
  const template = useSetting("project.template");
  const { writable } = store.explain(settingKey);
  const project = useProjectItem(projectId);
  const elements = elementsFor(template, project?.kind ?? null);

  const commit = (
    element: StyleElement,
    nextEntry: ElementStyle | null,
  ): void => {
    const previous: StyleMap = store.get("project.style");
    const next: Record<string, ElementStyle> = { ...previous };
    if (nextEntry === null || entryIsEmpty(nextEntry)) delete next[element.key];
    else next[element.key] = nextEntry;
    const result = store.set("project.style", next);
    if (!result.ok) return;
    const message: Message = {
      id: `project_style_${element.key}`,
      text: PROJECT_WORDS.ownStyleChanged(element.label, null),
      actions: [{ label: SHARING_WORDS.undo, commandId: "settings.undo" }],
      lifetime: "reverse",
      ownWork: false,
    };
    services.reverses.set(message.id, () =>
      store.set("project.style", previous),
    );
    services.messages.push(message);
  };

  return (
    <div
      data-tour={`setting:${settingKey}`}
      className="flex flex-col gap-2 py-2"
    >
      <h3 className="text-ui font-medium">{SETTINGS.get(settingKey).label}</h3>
      <div className="divide-y divide-line rounded-control border border-line bg-chrome px-3">
        {elements.map((element) => {
          const entry = style[element.key] ?? EMPTY_ENTRY;
          return (
            <ElementRow
              key={element.key}
              element={element}
              entry={entry}
              disabled={!writable}
              onChange={(next) => commit(element, next)}
              onReset={() => commit(element, null)}
            />
          );
        })}
      </div>
    </div>
  );
}
