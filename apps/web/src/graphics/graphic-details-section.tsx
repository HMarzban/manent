// Details → Selection → Graphic: single source of truth for Kind (Show/News/Variety), Height,
// image choose/replace/remove, Cue tag and Description. Caption text is edited only inline on the page.
import {
  GRAPHIC_KINDS,
  GRAPHIC_MAX_ALT_LENGTH,
  GRAPHIC_MAX_HEIGHT_LINES,
  GRAPHIC_MAX_LABEL_LENGTH,
  GRAPHIC_MIN_HEIGHT_LINES,
} from "@manent/schema";
import type { GraphicKind } from "@manent/schema";
import type { Choice } from "@manent/settings";
import {
  Button,
  GRAPHICS_WORDS,
  Input,
  Label,
  Segmented,
  useSubscribable,
} from "@manent/ui";
import { useId, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  getSelectedGraphic,
  runGraphicHeight,
  runGraphicRemoveImage,
  runGraphicUpdate,
  subscribeSelectedGraphic,
} from "../editor-host/graphics-bridge.ts";
import { useCanEdit } from "../screens/document/ruler-bar.tsx";
import { useServices } from "../services/context.tsx";
import { replaceImageFromPicker } from "./insert-graphic.ts";

const KIND_CHOICES: readonly Choice<GraphicKind>[] = Object.freeze(
  GRAPHIC_KINDS.map((value) => ({
    value,
    label: GRAPHICS_WORDS.kinds[value],
  })),
);

const isGraphicKind = (value: string): value is GraphicKind =>
  GRAPHIC_KINDS.some((kind) => kind === value);

const LINES_PATTERN = /^\s*(\d+)\s*(?:lines?)?\s*$/;

function parseLines(text: string): number | null {
  const match = LINES_PATTERN.exec(text)?.[1];
  if (match === undefined) return null;
  const parsed = Number(match);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(
    GRAPHIC_MAX_HEIGHT_LINES,
    Math.max(GRAPHIC_MIN_HEIGHT_LINES, Math.floor(parsed)),
  );
}

const ARROW_STEPS: Readonly<Record<string, number>> = {
  ArrowUp: 1,
  ArrowDown: -1,
};

function HeightSpinbutton(props: {
  value: number;
  readOnly: boolean;
  onCommit(lines: number): void;
}): ReactNode {
  const { value, readOnly, onCommit } = props;
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const current = (draft === null ? null : parseLines(draft)) ?? value;

  const commit = (): void => {
    if (draft === null) return;
    const next = parseLines(draft);
    setDraft(null);
    if (next !== null && next !== value) onCommit(next);
  };

  const step = (by: number): void => {
    if (readOnly) return;
    const clamped = Math.min(
      GRAPHIC_MAX_HEIGHT_LINES,
      Math.max(GRAPHIC_MIN_HEIGHT_LINES, current + by),
    );
    setDraft(GRAPHICS_WORDS.lines(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="text-ui">
        {GRAPHICS_WORDS.height}
      </Label>
      <Input
        id={id}
        role="spinbutton"
        inputMode="numeric"
        aria-valuemin={GRAPHIC_MIN_HEIGHT_LINES}
        aria-valuemax={GRAPHIC_MAX_HEIGHT_LINES}
        aria-valuenow={current}
        aria-valuetext={GRAPHICS_WORDS.lines(current)}
        readOnly={readOnly}
        value={draft ?? GRAPHICS_WORDS.lines(value)}
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

function TextAttrField(props: {
  label: string;
  placeholder: string;
  value: string;
  maxLength: number;
  readOnly: boolean;
  onCommit(next: string): void;
}): ReactNode {
  const { label, placeholder, value, maxLength, readOnly, onCommit } = props;
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (): void => {
    if (draft === null) return;
    const next = draft.slice(0, maxLength);
    setDraft(null);
    if (next !== value) onCommit(next);
  };

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-ui">
        {label}
      </Label>
      <Input
        id={id}
        readOnly={readOnly}
        maxLength={maxLength}
        placeholder={placeholder}
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
        }}
        onBlur={commit}
        className="h-control text-ui"
      />
    </div>
  );
}

/** Drawn in Details → Selection when the caret or selection is inside a `"graphic"` block. */
export function GraphicDetailsSection(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const editable = useCanEdit(docId);

  const selected = useSyncExternalStore(
    (onChange) => subscribeSelectedGraphic(docId, onChange),
    () => getSelectedGraphic(docId),
    () => getSelectedGraphic(docId),
  );

  const projectKindSource = useMemo(
    () => services.library.documentKind(docId),
    [services.library, docId],
  );
  const projectKind = useSubscribable(projectKindSource);
  const scriptFormat = services.openScriptStore(docId).get("script.format");
  const isBroadcast =
    projectKind === "show" ||
    projectKind === "news" ||
    scriptFormat === "variety";

  if (selected === null) return null;
  const { blockId, attrs } = selected;

  return (
    <section data-tour="details:graphic" className="flex flex-col gap-2">
      <h3 className="pt-2 text-ui font-semibold">{GRAPHICS_WORDS.graphic}</h3>

      {isBroadcast ? (
        <div className="flex flex-col gap-1">
          <Segmented
            label={GRAPHICS_WORDS.graphic}
            value={attrs.kind}
            options={KIND_CHOICES}
            onChange={(chosen) => {
              if (editable && isGraphicKind(chosen))
                runGraphicUpdate(docId, { kind: chosen }, blockId);
            }}
          />
        </div>
      ) : null}

      <HeightSpinbutton
        value={attrs.heightLines}
        readOnly={!editable}
        onCommit={(lines) => {
          if (editable) runGraphicHeight(docId, lines, blockId);
        }}
      />

      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-ui"
            onClick={() => {
              void replaceImageFromPicker(services, docId, blockId);
            }}
          >
            {attrs.assetId === null
              ? GRAPHICS_WORDS.chooseImage
              : GRAPHICS_WORDS.replaceImage}
          </Button>
          {attrs.assetId !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-ui"
              onClick={() => {
                runGraphicRemoveImage(docId, blockId);
              }}
            >
              {GRAPHICS_WORDS.removeImage}
            </Button>
          ) : null}
        </div>
      ) : null}

      <TextAttrField
        key={`${blockId}:label`}
        label={GRAPHICS_WORDS.cueTag}
        placeholder={GRAPHICS_WORDS.cueTagPlaceholder}
        value={attrs.label}
        maxLength={GRAPHIC_MAX_LABEL_LENGTH}
        readOnly={!editable}
        onCommit={(label) => {
          if (editable) runGraphicUpdate(docId, { label }, blockId);
        }}
      />

      <TextAttrField
        key={`${blockId}:alt`}
        label={GRAPHICS_WORDS.description}
        placeholder={GRAPHICS_WORDS.descriptionPlaceholder}
        value={attrs.alt}
        maxLength={GRAPHIC_MAX_ALT_LENGTH}
        readOnly={!editable}
        onCommit={(alt) => {
          if (editable) runGraphicUpdate(docId, { alt }, blockId);
        }}
      />
    </section>
  );
}
